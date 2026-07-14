import * as THREE from "three";
import { WORLD_RADIUS } from "./constants";
import { World } from "../world/World";
import { Player } from "../entities/Player";
import { BotManager } from "../entities/BotManager";
import type { CharacterSkin } from "../entities/skinDefs";
import { WeaponSystem } from "../weapons/WeaponSystem";
import { AirdropManager } from "../weapons/AirdropManager";
import { WEAPON_DEFS } from "../weapons/weaponDefs";
import { ParticleSystem } from "../weapons/ParticleSystem";
import { BuildingManager } from "../building/BuildingManager";
import { AudioManager } from "./AudioManager";
import { StormManager } from "./StormManager";
import { InputManager } from "./InputManager";
import { HUDController } from "../ui/HUDController";
import { WeaponBar } from "../ui/WeaponBar";
import { BuildPieceBar } from "../ui/BuildPieceBar";
import {
  QUALITY_TIERS,
  hasExplicitQualityChoice,
  saveSettings,
  type GameSettings,
} from "./Settings";
// Type-only import: erased at compile time, so it does NOT pull the
// postprocessing module tree into the main chunk — the runtime code is only
// ever loaded via the dynamic import() in initPostFX below.
import type { PostFXPipeline } from "./postfx";

const RESPAWN_DELAY = 3;

// Auto perf-downgrade: sample real frame time for the first second or so of
// gameplay, and if the device is visibly struggling while still sitting on
// the untouched "medium" default, drop to "low" and persist it. Never
// auto-upgrades, and never overrides a tier the player picked explicitly.
const PERF_SAMPLE_MAX_FRAMES = 60;
const PERF_SAMPLE_MIN_SECONDS = 1;
const PERF_DOWNGRADE_FRAME_MS = 33; // ~30fps

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private rafId: number | null = null;
  private running = false;

  private world: World;
  private player: Player;
  private botManager: BotManager;
  private weapons: WeaponSystem;
  private airdrops: AirdropManager;
  private storm: StormManager;
  private particles: ParticleSystem;
  private buildingManager: BuildingManager;
  private weaponBar: WeaponBar;
  private buildPieceBar: BuildPieceBar;
  audio = new AudioManager();

  private score = 0;
  private kills = 0;
  private respawnAt = 0;
  // Storm damage ticks at 1 Hz while the player stays outside the safe zone
  // (per-frame takeDamage would retrigger the hurt sound/flash 60x a second).
  private stormTickIn = 1;

  private settings: GameSettings;
  private perfSampleDone = false;
  private perfSampleFrames = 0;
  private perfSampleSeconds = 0;

  // Lazily-created EffectComposer pipeline; null whenever the current tier
  // has postFX off (the shipped default for every tier), in which case the
  // loop renders directly and pays zero composer overhead.
  private postFX: PostFXPipeline | null = null;
  private postFXLoading = false;
  private disposed = false;

  private onResize = (): void => {
    const { clientWidth, clientHeight } = this.canvas;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.postFX?.setSize(clientWidth, clientHeight);
  };

  private onVisibility = (): void => {
    if (document.hidden) {
      this.pause();
    } else {
      this.resume();
    }
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private input: InputManager,
    private hud: HUDController,
    uiContainer: HTMLElement,
    playerSkin: CharacterSkin,
    settings: GameSettings
  ) {
    this.settings = { ...settings };
    this.audio.setSfxVolume(this.settings.sfxVolume);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      68,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      WORLD_RADIUS * 7
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    // Soft-edged maps are the only type worth paying for on the tight
    // player-following frustum; setting the type is free while shadow mapping
    // itself stays disabled (the shipped default for every tier).
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyQualityTier();

    this.world = new World(this.scene);
    this.world.build(QUALITY_TIERS[this.settings.qualityTier]);

    this.player = new Player(this.scene, playerSkin, this.settings.lookSensitivity);
    this.player.onDamaged = () => {
      this.hud.pulseDamage();
      this.audio.playerHurt();
    };
    this.player.onDeath = () => {
      this.respawnAt = performance.now() / 1000 + RESPAWN_DELAY;
      this.hud.showEliminated(true);
    };

    this.botManager = new BotManager(this.scene, this.world);
    this.botManager.onPlayerDamaged = (amount) => {
      this.player.takeDamage(amount, performance.now() / 1000);
    };
    this.botManager.onKill = () => {
      this.score += 10;
      this.kills += 1;
    };

    this.particles = new ParticleSystem(this.scene, QUALITY_TIERS[this.settings.qualityTier].particlePoolSize);

    this.weapons = new WeaponSystem(this.scene);
    this.weapons.onHitBot = () => this.hud.pulseHit(false);
    this.weapons.onKillBot = () => this.hud.pulseHit(true);
    this.weapons.onSwitch = (index) => {
      const id = this.weapons.slots[index].id;
      this.player.setActiveWeaponVisual(id ? WEAPON_DEFS[id].isMelee : false);
    };
    this.weapons.onMeleeSwing = () => this.player.triggerPickaxeSwing();

    this.buildingManager = new BuildingManager(this.scene, this.world);

    this.airdrops = new AirdropManager(this.scene, this.world);
    this.airdrops.onPickup = (weaponName, isNew) => {
      this.hud.showPickup(weaponName, isNew);
    };

    this.storm = new StormManager(this.scene);

    this.weaponBar = new WeaponBar(uiContainer);
    this.weaponBar.onSelect = (index) => {
      this.weapons.switchTo(index, this.audio);
    };

    this.buildPieceBar = new BuildPieceBar(uiContainer);
    this.buildPieceBar.onSelect = (id) => {
      this.buildingManager.selectPiece(id);
    };

    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);

    // Deferred past construction of world/player/particles: shadow + postFX
    // sync needs those to exist. Both features are currently false for every
    // tier, so this is a no-op in the shipped defaults — but the full enable
    // path below is implemented and live the moment a tier flips them on.
    this.applyQualityFeatures();
  }

  /** Applies the resolved QualitySettings for the current tier to the renderer.
   *  Only covers what is safe before the world exists (see
   *  applyQualityFeatures for shadows/postFX). */
  private applyQualityTier(): void {
    const quality = QUALITY_TIERS[this.settings.qualityTier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
  }

  /** Syncs the tier-gated heavyweight features — real shadow mapping and the
   *  postFX composer — with the current tier. Idempotent; called after
   *  construction and again on auto-downgrade. Every tier currently ships
   *  with both off (hard product requirement until verified on a real
   *  iPhone), so by default this disables/no-ops everything. */
  private applyQualityFeatures(): void {
    const quality = QUALITY_TIERS[this.settings.qualityTier];

    const shadowsChanged = this.renderer.shadowMap.enabled !== quality.shadows;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.world.setSunShadows(quality.shadows, quality.shadowMapSize);
    if (shadowsChanged) {
      // Toggling shadow mapping after materials have compiled requires a
      // program rebuild. Never hit on the shipped defaults (off stays off);
      // one-time cost when a future tier change flips shadows mid-session.
      this.scene.traverse((obj) => {
        const material = (obj as THREE.Mesh).material as
          | THREE.Material
          | THREE.Material[]
          | undefined;
        if (!material) return;
        if (Array.isArray(material)) {
          for (const m of material) m.needsUpdate = true;
        } else {
          material.needsUpdate = true;
        }
      });
    }

    if (quality.postFX && !this.postFX && !this.postFXLoading) {
      void this.initPostFX();
    } else if (!quality.postFX && this.postFX) {
      this.postFX.dispose();
      this.postFX = null;
    }
  }

  /** Dynamically loads the postprocessing chunk and builds the composer
   *  pipeline. The import() keeps EffectComposer + passes out of the main
   *  bundle for tiers that never enable postFX (currently: all of them). */
  private async initPostFX(): Promise<void> {
    this.postFXLoading = true;
    try {
      const { createPostFXPipeline } = await import("./postfx");
      // The tier may have downgraded (or the game been disposed) while the
      // chunk was in flight — re-check before committing to the pipeline.
      if (this.disposed || !QUALITY_TIERS[this.settings.qualityTier].postFX || this.postFX) {
        return;
      }
      this.postFX = createPostFXPipeline(this.renderer, this.scene, this.camera);
      this.postFX.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    } catch (err) {
      // Chunk failed to load (offline before it was cached, etc.) — the loop
      // keeps using the direct renderer.render path, which is always valid.
      console.warn("PostFX pipeline unavailable, staying on direct rendering", err);
    } finally {
      this.postFXLoading = false;
    }
  }

  /** Accumulates real frame time for the first ~1s of gameplay. If the device
   *  is struggling (sustained <30fps) while still on the untouched "medium"
   *  default, auto-downgrades to "low" and persists it. Only ever downgrades,
   *  never upgrades, and never overrides a tier the player picked explicitly.
   *  Short-circuits after the first decision so it costs nothing thereafter. */
  private samplePerf(dt: number): void {
    if (this.perfSampleDone) return;

    this.perfSampleFrames += 1;
    this.perfSampleSeconds += dt;
    if (this.perfSampleFrames < PERF_SAMPLE_MAX_FRAMES && this.perfSampleSeconds < PERF_SAMPLE_MIN_SECONDS) {
      return;
    }

    this.perfSampleDone = true;
    const avgFrameMs = (this.perfSampleSeconds / this.perfSampleFrames) * 1000;
    if (
      avgFrameMs > PERF_DOWNGRADE_FRAME_MS &&
      this.settings.qualityTier === "medium" &&
      !hasExplicitQualityChoice()
    ) {
      this.settings.qualityTier = "low";
      saveSettings(this.settings);
      this.applyQualityTier();
      this.applyQualityFeatures();
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this.loop();
  }

  pause(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.running = false;
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this.loop();
  }

  dispose(): void {
    this.disposed = true;
    this.pause();
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.weaponBar.dispose();
    this.buildPieceBar.dispose();
    this.storm.dispose();
    this.postFX?.dispose();
    this.postFX = null;
    this.renderer.dispose();
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const nowSec = performance.now() / 1000;

    this.samplePerf(dt);

    if (this.player.dead) {
      if (nowSec >= this.respawnAt) {
        this.player.respawn(nowSec, this.world);
        this.hud.showEliminated(false);
      }
    } else {
      this.player.update(dt, this.input, this.world);
      if (this.input.consumeBuild()) {
        this.buildingManager.tryBuild(this.player, this.audio);
      }
    }
    // Ghost preview tracks the snapped placement while BUILD is held; hidden
    // otherwise (and always while dead).
    this.buildingManager.updatePreview(this.player, this.input.buildHeld && !this.player.dead);

    // Storm: advance the shrink state machine, shift the fog while the player
    // is caught outside, and tick zone damage (1 Hz, dt-driven countdown).
    const playerOutsideZone = !this.player.dead && this.storm.isOutside(this.player.position);
    this.storm.update(dt, nowSec, playerOutsideZone);
    if (playerOutsideZone) {
      this.stormTickIn -= dt;
      if (this.stormTickIn <= 0) {
        this.stormTickIn += 1;
        this.player.takeDamage(this.storm.damagePerSec, nowSec);
      }
    } else {
      this.stormTickIn = 1;
    }

    this.player.updateCamera(this.camera, this.world, dt);
    this.player.updateWeaponPose(dt, this.input.fireHeld && !this.player.dead);
    this.botManager.update(
      dt,
      nowSec,
      this.world,
      this.player.position,
      this.storm.center,
      this.storm.radius
    );
    this.world.update(nowSec);
    this.weapons.update(
      dt,
      this.input.fireHeld && !this.player.dead,
      this.camera,
      this.world,
      this.botManager,
      this.particles,
      this.audio,
      this.player
    );
    this.airdrops.update(dt, nowSec, this.player, this.weapons, this.particles, this.audio);
    this.particles.update(dt);

    const activeDef = this.weapons.activeDef;
    const activeSlot = this.weapons.activeSlot;
    const stormStatus = this.storm.status(nowSec);
    this.hud.update({
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      materials: this.player.materials,
      ammo: activeSlot.ammo,
      reserve: activeSlot.reserve,
      reloading: activeSlot.reloading,
      isMelee: activeDef?.isMelee ?? false,
      weaponName: activeDef?.name ?? "",
      score: this.score,
      kills: this.kills,
      stormLabel: stormStatus.label,
      stormSecondsLeft: stormStatus.secondsLeft,
      playerInStorm: playerOutsideZone,
      stormDamagePerSec: this.storm.damagePerSec,
    });
    this.hud.drawMinimap(this.player, this.botManager, this.airdrops.activePosition, {
      x: this.storm.center.x,
      z: this.storm.center.z,
      radius: this.storm.radius,
    });
    this.weaponBar.update(this.weapons.slots, this.weapons.activeSlotIndex);

    // Keeps the tight sun-shadow box centered on the player; no-op while
    // shadows are off (every tier's shipped default).
    this.world.updateShadowFrustum(this.player.position);

    if (this.postFX) {
      this.postFX.render();
    } else {
      // Direct render — the only path exercised by the shipped defaults.
      this.renderer.render(this.scene, this.camera);
    }
  };
}
