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
import { InputManager } from "./InputManager";
import { HUDController } from "../ui/HUDController";
import { WeaponBar } from "../ui/WeaponBar";
import {
  QUALITY_TIERS,
  hasExplicitQualityChoice,
  saveSettings,
  type GameSettings,
} from "./Settings";

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
  private particles: ParticleSystem;
  private buildingManager: BuildingManager;
  private weaponBar: WeaponBar;
  audio = new AudioManager();

  private score = 0;
  private kills = 0;
  private respawnAt = 0;

  private settings: GameSettings;
  private perfSampleDone = false;
  private perfSampleFrames = 0;
  private perfSampleSeconds = 0;

  private onResize = (): void => {
    const { clientWidth, clientHeight } = this.canvas;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
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

    this.weaponBar = new WeaponBar(uiContainer);
    this.weaponBar.onSelect = (index) => {
      this.weapons.switchTo(index, this.audio);
    };

    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /** Applies the resolved QualitySettings for the current tier to the renderer.
   *  Shadows stay disabled regardless of tier for now — this phase only wires
   *  the flag through; real shadow rendering lands in a later phase. */
  private applyQualityTier(): void {
    const quality = QUALITY_TIERS[this.settings.qualityTier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
    this.renderer.shadowMap.enabled = false;
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
    this.pause();
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.weaponBar.dispose();
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

    this.player.updateCamera(this.camera, this.world, dt);
    this.player.updateWeaponPose(dt, this.input.fireHeld && !this.player.dead);
    this.botManager.update(dt, nowSec, this.world, this.player.position);
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
    });
    this.hud.drawMinimap(this.player, this.botManager, this.airdrops.activePosition);
    this.weaponBar.update(this.weapons.slots, this.weapons.activeSlotIndex);

    this.renderer.render(this.scene, this.camera);
  };
}
