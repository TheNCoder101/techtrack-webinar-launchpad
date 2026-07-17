import * as THREE from "three";
import { WORLD_RADIUS } from "./constants";
import { World } from "../world/World";
import { Player } from "../entities/Player";
import { BotManager } from "../entities/BotManager";
import { RemotePlayer } from "../entities/RemotePlayer";
import type { NetManager } from "../net/NetManager";
import {
  STATE_SEND_HZ,
  BOT_STATE_SEND_HZ,
  type NetMessage,
  type PeerStateMessage,
} from "../net/protocol";
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
  BOT_DIFFICULTY,
  hasExplicitQualityChoice,
  saveSettings,
  type GameSettings,
} from "./Settings";
// Type-only import: erased at compile time, so it does NOT pull the
// postprocessing module tree into the main chunk — the runtime code is only
// ever loaded via the dynamic import() in initPostFX below.
import type { PostFXPipeline } from "./postfx";

// Seconds the player must survive inside the final (smallest) storm zone to
// win the match. First-pass number — tune with playtesting like the storm
// stage timings themselves.
const FINAL_ZONE_SURVIVAL_SECONDS = 45;

/** How a match ended, driving the React end screen. */
export type MatchOutcome = "victory" | "defeat";

/** Snapshot of the match that just ended, handed to Game.onMatchEnd. There is
 *  no respawn — a death ends the match ("defeat") and surviving the final-zone
 *  countdown ends it too ("victory"); the React layer shows the end screen. */
export interface LifeSummary {
  /** Kills scored during the match. */
  kills: number;
  /** Score earned during the match. */
  score: number;
  /** Seconds survived from spawn to the match's end. */
  survivalSeconds: number;
}

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
  // Match-end state: once true the round is over (win OR loss), the loop stops
  // simulating the local player, and onMatchEnd has fired exactly once.
  private matchEnded = false;
  // Counts down only while alive and standing in the final held zone; hitting
  // zero is the victory condition.
  private finalCountdown = FINAL_ZONE_SURVIVAL_SECONDS;
  // Per-match baselines for the summary: score/kills accumulate across the
  // whole session, so "this match" is the delta from these spawn snapshots.
  private lifeStartAt = performance.now() / 1000;
  private lifeStartKills = 0;
  private lifeStartScore = 0;

  // Upward hooks for the React layer (same optional-callback idiom as
  // Player.onDamaged / BotManager.onKill).
  /** Fired on every bot kill (feeds the lifetime stats ledger). */
  onKill?: () => void;
  /** Fired exactly once when the match ends — on death ("defeat") or on
   *  surviving the final-zone countdown ("victory"). There is no respawn. */
  onMatchEnd?: (outcome: MatchOutcome, summary: LifeSummary) => void;
  // Storm damage ticks at 1 Hz while the player stays outside the safe zone
  // (per-frame takeDamage would retrigger the hurt sound/flash 60x a second).
  private stormTickIn = 1;

  // Ranged bots previously fired with zero visual/audio tell (see Bot.ts) —
  // a shot just silently subtracted HP, which reads as unexplained damage,
  // especially when it happens to land while the player is inside the storm
  // safe zone and assumes any damage there must be the zone itself. Each
  // shot gets a short-lived tracer line, cleaned up here every frame.
  private botTracers: { line: THREE.Line; expiresAt: number }[] = [];

  // --- Co-op state (all inert in solo play: `net` is only ever passed in
  // when the player explicitly chose Host/Join on the start screen). Every
  // peer owns its own player transform; the host is the sole bot authority.
  private net?: NetManager;
  private playerSkinId: string;
  private remotePlayers = new Map<string, RemotePlayer>();
  private remoteStates = new Map<string, PeerStateMessage>();
  private lastPeerSeq = new Map<string, number>();
  private stateSeq = 0;
  private stateSendIn = 0;
  private botStateSendIn = 0;
  private nextHitId = 0;
  // Set only while applying a joiner's forwarded bot_hit, so the shared
  // onKill path can credit the kill to that peer instead of the host.
  private remoteHitPeer: string | null = null;
  // Receive-side dedupe for the 3x-redundant stateful events (see
  // NetManager's stagger): key -> receive time, pruned as they age out.
  private seenBotHits = new Map<string, number>();
  private seenKillFeed = new Map<string, number>();
  private netTmpVec = new THREE.Vector3();

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
    settings: GameSettings,
    net?: NetManager
  ) {
    this.settings = { ...settings };
    this.audio.setSfxVolume(this.settings.sfxVolume);
    // Optional co-op session — mirrors how Settings/skin are passed in. Solo
    // play never constructs a NetManager, so this stays undefined and every
    // net code path below is skipped.
    this.net = net;
    this.playerSkinId = playerSkin.id;

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
      this.endMatch("defeat");
    };

    // The quality tier doubles as the difficulty axis: it sets the bot
    // count and per-bot aggression knobs (see BOT_DIFFICULTY in Settings.ts).
    // Resolved once here — a mid-session perf auto-downgrade does not
    // retroactively despawn bots.
    // Co-op authority split: the host (and solo play) runs the real bot AI;
    // joiners get a non-authoritative manager that only puppets the host's
    // bot_state broadcasts.
    this.botManager = new BotManager(
      this.scene,
      this.world,
      BOT_DIFFICULTY[this.settings.qualityTier],
      !net || net.isHost
    );
    this.botManager.onPlayerDamaged = (amount) => {
      this.player.takeDamage(amount, performance.now() / 1000);
    };
    this.botManager.onKill = (bot) => {
      if (this.remoteHitPeer && this.net) {
        // A joiner's forwarded bot_hit landed the killing blow — credit that
        // peer via kill_feed instead of the host's own score.
        this.net.broadcast(
          { t: "kill_feed", peerId: this.remoteHitPeer, botId: bot.id },
          { redundant: true }
        );
        return;
      }
      this.score += 10;
      this.kills += 1;
      this.onKill?.();
      if (this.net?.isHost) {
        this.net.broadcast(
          { t: "kill_feed", peerId: this.net.myId ?? "", botId: bot.id },
          { redundant: true }
        );
      }
    };
    if (net && !net.isHost) {
      // Joiner: local raycast hits on bots never apply locally — they're
      // forwarded to the host, and the resulting bot_state broadcast is the
      // source of truth back.
      this.botManager.onRemoteHit = (botId, damage) => {
        if (!net.hostId) return;
        net.sendTo(
          net.hostId,
          { t: "bot_hit", botId, damage, hitId: ++this.nextHitId },
          { redundant: true }
        );
      };
    }
    if (net) {
      net.onMessage = (peerId, msg) => this.handleNetMessage(peerId, msg);
      net.onPeerLeft = (peerId) => this.removeRemotePlayer(peerId);
    }
    this.botManager.onRangedFire = (from, to) => {
      this.spawnBotTracer(from, to);
      this.particles.burst(from, new THREE.Color(0xff5a3d), 4, 2, 0.6, 1, 0.18);
      this.particles.burst(to, new THREE.Color(0xff3355), 5, 3, 1, 3, 0.25);
      this.audio.shoot();
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
    for (const t of this.botTracers) {
      this.scene.remove(t.line);
      t.line.geometry.dispose();
      (t.line.material as THREE.Material).dispose();
    }
    this.botTracers = [];
    // Puppets are Game-owned; the NetManager itself is owned by the React
    // layer that created it (GamePage disposes it on unmount).
    for (const peerId of [...this.remotePlayers.keys()]) {
      this.removeRemotePlayer(peerId);
    }
    this.postFX?.dispose();
    this.postFX = null;
    this.renderer.dispose();
  }

  /** Dispatch for every game-level co-op message (see net/protocol.ts). */
  private handleNetMessage(peerId: string, msg: NetMessage): void {
    const net = this.net;
    if (!net) return;
    switch (msg.t) {
      case "state": {
        // Unreliable channel: drop anything older than what we've applied.
        const lastSeq = this.lastPeerSeq.get(peerId) ?? -1;
        if (msg.seq <= lastSeq) return;
        this.lastPeerSeq.set(peerId, msg.seq);
        this.remoteStates.set(peerId, msg);
        let puppet = this.remotePlayers.get(peerId);
        if (!puppet) {
          // First sight of this peer — spawn its puppet at the reported spot.
          puppet = new RemotePlayer(
            this.scene,
            msg.skinId,
            this.netTmpVec.set(msg.pos[0], msg.pos[1], msg.pos[2])
          );
          this.remotePlayers.set(peerId, puppet);
        } else {
          puppet.setSkin(msg.skinId);
        }
        puppet.setDead(msg.dead);
        return;
      }
      case "bot_state":
        if (!net.isHost) this.botManager.applyBotState(msg.bots, this.world);
        return;
      case "bot_hit": {
        // Host only: apply a joiner's local raycast hit exactly like a local
        // weapon hit — the next bot_state broadcast carries the result back.
        if (!net.isHost) return;
        const nowSec = performance.now() / 1000;
        const key = `${peerId}:${msg.hitId}`;
        if (this.seenBotHits.has(key)) return; // 3x-redundant send dedupe
        this.seenBotHits.set(key, nowSec);
        this.pruneSeen(this.seenBotHits, nowSec);
        if (!this.botManager.isAlive(msg.botId)) return;
        this.remoteHitPeer = peerId;
        this.botManager.damage(msg.botId, msg.damage);
        this.remoteHitPeer = null;
        return;
      }
      case "kill_feed": {
        // Score/HUD sync: only kills credited to *this* peer matter locally.
        if (msg.peerId !== net.myId) return;
        const nowSec = performance.now() / 1000;
        const key = `kf:${msg.botId}`;
        const last = this.seenKillFeed.get(key) ?? -Infinity;
        // Redundant copies arrive within ~200ms; a legitimate re-kill of the
        // same bot is at least BOT_RESPAWN_TIME (6s) away, so a 2s window
        // dedupes the former without ever eating the latter.
        if (nowSec - last < 2) return;
        this.seenKillFeed.set(key, nowSec);
        this.score += 10;
        this.kills += 1;
        this.onKill?.();
        this.audio.botKill();
        this.hud.pulseHit(true);
        return;
      }
    }
  }

  /** Bounded growth for the receive-side dedupe maps: entries only matter
   *  for the ~200ms redundancy window, so anything older than 5s can go. */
  private pruneSeen(map: Map<string, number>, nowSec: number): void {
    if (map.size <= 256) return;
    for (const [key, t] of map) {
      if (nowSec - t > 5) map.delete(key);
    }
  }

  /** Per-frame co-op work (called from the loop only when a NetManager
   *  exists): timed own-state broadcast, host-only bot_state broadcast, and
   *  the puppet lerp toward each peer's latest received transform. */
  private updateNet(dt: number): void {
    const net = this.net;
    if (!net) return;

    this.stateSendIn -= dt;
    if (this.stateSendIn <= 0) {
      this.stateSendIn += 1 / STATE_SEND_HZ;
      const p = this.player;
      net.broadcast({
        t: "state",
        seq: ++this.stateSeq,
        pos: [p.position.x, p.position.y, p.position.z],
        yaw: p.yaw,
        pitch: p.pitch,
        hp: p.health,
        skinId: this.playerSkinId,
        weaponSlot: this.weapons.activeSlotIndex,
        firing: this.input.fireHeld && !p.dead,
        dead: p.dead,
      });
    }

    if (net.isHost) {
      this.botStateSendIn -= dt;
      if (this.botStateSendIn <= 0) {
        this.botStateSendIn += 1 / BOT_STATE_SEND_HZ;
        net.broadcast({
          t: "bot_state",
          bots: this.botManager.bots.map((b) => ({
            id: b.id,
            pos: [b.group.position.x, b.group.position.y, b.group.position.z] as [
              number,
              number,
              number,
            ],
            yaw: b.group.rotation.y,
            hp: b.hp,
            alive: b.alive,
          })),
        });
      }
    }

    for (const [peerId, st] of this.remoteStates) {
      const puppet = this.remotePlayers.get(peerId);
      if (!puppet) continue;
      puppet.applyNetworkState(
        this.netTmpVec.set(st.pos[0], st.pos[1], st.pos[2]),
        st.yaw,
        st.pitch,
        dt
      );
    }
  }

  private removeRemotePlayer(peerId: string): void {
    this.remotePlayers.get(peerId)?.dispose(this.scene);
    this.remotePlayers.delete(peerId);
    this.remoteStates.delete(peerId);
    this.lastPeerSeq.delete(peerId);
  }

  /** Brief red line from a ranged bot to the player, purely cosmetic feedback
   *  for a shot that already landed (see the botTracers field comment). */
  private spawnBotTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y + 1.3, from.z),
      new THREE.Vector3(to.x, to.y + 1.1, to.z),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.8 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.botTracers.push({ line, expiresAt: performance.now() / 1000 + 0.1 });
  }

  /** Ends the match exactly once (idempotent). Freezes the local player,
   *  shows the HUD banner, and notifies the React layer with the final
   *  summary. No respawn — the player chooses Main Menu / Play Again. */
  private endMatch(outcome: MatchOutcome): void {
    if (this.matchEnded) return;
    this.matchEnded = true;
    const nowSec = performance.now() / 1000;
    this.hud.showMatchEnd(outcome);
    this.onMatchEnd?.(outcome, {
      kills: this.kills - this.lifeStartKills,
      score: this.score - this.lifeStartScore,
      survivalSeconds: nowSec - this.lifeStartAt,
    });
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const nowSec = performance.now() / 1000;

    this.samplePerf(dt);

    // Match over (win or loss): the local player is frozen — no input, no
    // respawn — but the loop keeps running so the world still renders behind
    // the React end screen and co-op keeps broadcasting this peer's state.
    if (!this.matchEnded) {
      this.player.update(dt, this.input, this.world);
      if (this.input.consumeBuild()) {
        this.buildingManager.tryBuild(this.player, this.audio);
      }
    }
    // Ghost preview tracks the snapped placement while BUILD is held; hidden
    // otherwise (and always once the match has ended).
    this.buildingManager.updatePreview(this.player, this.input.buildHeld && !this.matchEnded);

    // Storm: advance the shrink state machine, shift the fog while the player
    // is caught outside, and tick zone damage (1 Hz, dt-driven countdown).
    const playerOutsideZone = !this.matchEnded && this.storm.isOutside(this.player.position);
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

    // Victory condition: survive the countdown once the storm is holding its
    // final zone. Only runs while alive and in-match; death (endMatch above)
    // beats the clock to it for a defeat.
    if (!this.matchEnded && this.storm.isFinalZone) {
      this.finalCountdown -= dt;
      if (this.finalCountdown <= 0) {
        this.finalCountdown = 0;
        this.endMatch("victory");
      }
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
    // Co-op: broadcast own state (and, as host, the authoritative bot
    // snapshot) and lerp every remote-player puppet toward its latest
    // received transform. No-op in solo play.
    if (this.net) this.updateNet(dt);
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
    this.airdrops.update(
      dt,
      nowSec,
      this.player,
      this.weapons,
      this.particles,
      this.audio,
      this.storm.center,
      this.storm.radius
    );
    this.particles.update(dt);

    if (this.botTracers.length) {
      this.botTracers = this.botTracers.filter((t) => {
        if (nowSec < t.expiresAt) return true;
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        return false;
      });
    }

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
      surviveSecondsLeft:
        this.storm.isFinalZone && !this.matchEnded ? this.finalCountdown : null,
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
