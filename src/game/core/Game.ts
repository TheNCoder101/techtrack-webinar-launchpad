import * as THREE from "three";
import { WORLD_RADIUS } from "./constants";
import { World } from "../world/World";
import { seedFromString } from "../world/rng";
import { Player } from "../entities/Player";
import { BotManager } from "../entities/BotManager";
import { RemotePlayer } from "../entities/RemotePlayer";
import type { PlayerTarget } from "../entities/Bot";
import type { NetManager } from "../net/NetManager";
import {
  STATE_SEND_HZ,
  BOT_STATE_SEND_HZ,
  type NetMessage,
  type PeerStateMessage,
} from "../net/protocol";
import type { CharacterSkin } from "../entities/skinDefs";
import { WeaponSystem } from "../weapons/WeaponSystem";
import { WEAPON_DEFS, type WeaponId } from "../weapons/weaponDefs";
import { AirdropManager } from "../weapons/AirdropManager";
import { ParticleSystem } from "../weapons/ParticleSystem";
import { BuildingManager } from "../building/BuildingManager";
import { BUILD_PIECE_IDS } from "../building/buildPieceDefs";
import { AudioManager } from "./AudioManager";
import { StormManager } from "./StormManager";
import type { PlayerInput } from "./types";
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
// Same type-only trick for the lightweight grade pass (V3 Track A6) — the
// runtime module is only loaded via the dynamic import() in initGradeFX.
import type { GradeFXPipeline } from "./gradepass";

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

// Aim-down-sights (V4 D3, desktop RMB). Hold-to-aim: the camera FOV eases
// toward ADS_FOV while `input.aimHeld` is true and snaps back to BASE_FOV on
// release. Only the desktop input backend ever sets aimHeld, so touch play is
// untouched — the FOV simply never leaves BASE_FOV there.
const BASE_FOV = 68;
const ADS_FOV = 50;
/** Exponential approach rate for the FOV ease (per second). */
const ADS_FOV_LERP = 14;
/** Below this delta the FOV snaps, so it settles on exact 68/50 rather than
 *  asymptotically approaching them forever. */
const ADS_FOV_SNAP = 0.05;

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
  // F2a follow-on: "Play Again" now KEEPS the NetManager alive across a
  // fresh Game instance (see GamePage's teardownGame `keepNet` option), so a
  // still-connected peer's Game may hold a `lastPeerSeq` watermark from this
  // peer's PREVIOUS session. If this counter restarted at 0, every one of
  // this session's broadcasts would read as "older than what we've already
  // applied" (handleNetMessage's `msg.seq <= lastSeq` guard) and get
  // silently dropped until the counter climbed back past the old watermark
  // — at 15Hz that could be tens of seconds of this peer being invisible to
  // everyone else right after they hit Play Again. Seeding from
  // performance.now() (strictly monotonic for the tab's whole lifetime, and
  // far larger than any watermark a ~15/sec counter could reach even after a
  // long match) guarantees every post-restart seq beats every pre-restart one.
  private stateSeq = Math.floor(performance.now());
  private stateSendIn = 0;
  private botStateSendIn = 0;
  private nextHitId = 0;
  // F3a: monotonic per-sender counter for the host -> peer `player_hit`
  // message, same idiom as nextHitId for the joiner -> host `bot_hit`.
  private nextPlayerHitId = 0;
  // Set only while applying a joiner's forwarded bot_hit, so the shared
  // onKill path can credit the kill to that peer instead of the host.
  private remoteHitPeer: string | null = null;
  // Receive-side dedupe for the 3x-redundant stateful events (see
  // NetManager's stagger): key -> receive time, pruned as they age out.
  private seenBotHits = new Map<string, number>();
  private seenKillFeed = new Map<string, number>();
  private seenPlayerHits = new Map<string, number>();
  // F1: last-seen `shots` counter per peer, so a new `state` packet can spawn
  // exactly the tracer/swing events for however many shots landed since the
  // previous packet — a 15Hz boolean sample would silently miss semi-auto
  // taps between samples, so the sender counts instead of just flagging.
  private lastPeerShots = new Map<string, number>();
  private netTmpVec = new THREE.Vector3();
  // F3a: reused every frame for the botManager.update() players array
  // (local player + every live RemotePlayer) instead of allocating a fresh
  // array each tick — see the loop below.
  private netPlayerTargets: PlayerTarget[] = [];

  private settings: GameSettings;
  private perfSampleDone = false;
  private perfSampleFrames = 0;
  private perfSampleSeconds = 0;

  // Lazily-created EffectComposer pipeline; null whenever the current tier
  // has postFX off (the shipped default for every tier), in which case the
  // loop renders directly and pays zero composer overhead.
  private postFX: PostFXPipeline | null = null;
  private postFXLoading = false;
  // Lazily-created lightweight grade pass (vignette + subtle chromatic
  // aberration, Track A6); null on tiers with gradePass off ("low"), where
  // the loop keeps the zero-overhead direct render path.
  private gradeFX: GradeFXPipeline | null = null;
  private gradeFXLoading = false;
  private disposed = false;

  private onResize = (): void => {
    const { clientWidth, clientHeight } = this.canvas;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.postFX?.setSize(clientWidth, clientHeight);
    this.gradeFX?.setSize(clientWidth, clientHeight);
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
    // Interface, not the concrete touch class (V4): either InputManager
    // (touch) or DesktopInputManager (keyboard/mouse) satisfies it. Game
    // never needs to know which — the desktop-only members are optional and
    // feature-detected at their call sites in the loop.
    private input: PlayerInput,
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
      BASE_FOV,
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
    // Filmic tone mapping (V3 Track A1): ACES compresses highlights and adds
    // the midtone contrast that reads as "shipped game" instead of raw
    // Lambert output. Effectively free — it rides the material shader's
    // existing tonemapping chunk on the direct render path, and OutputPass
    // applies the identical curve on any composer path (grade/postFX).
    // Exposure slightly above 1 compensates for ACES darkening the midtones
    // of the existing scene lighting, which was tuned without tone mapping.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    // Explicitly pin the output color space (this is three's default, but
    // the tone-mapped look depends on it, so state it rather than assume).
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Soft-edged maps are the only type worth paying for on the tight
    // player-following frustum; setting the type is free while shadow mapping
    // itself stays disabled (the shipped default for every tier).
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyQualityTier();

    // F2b: co-op peers derive the same world seed from the join code — both
    // already know it (it's baked into the host's peer id: "elronite-XXXX",
    // which the host reads as its own myId and the joiner reads as hostId)
    // before either side ever constructs a World, so this needs no protocol
    // message and no handshake ordering. Solo play passes no seed, so World
    // falls back to plain Math.random() and match-to-match variety is
    // unchanged.
    const worldSeed = net ? seedFromString((net.isHost ? net.myId : net.hostId) ?? "") : undefined;
    this.world = new World(this.scene, worldSeed);
    this.world.build(QUALITY_TIERS[this.settings.qualityTier]);

    this.player = new Player(this.scene, playerSkin, this.settings.lookSensitivity);
    this.player.onDamaged = (amount) => {
      this.hud.pulseDamage();
      // C5 juice: heavy incoming hits rattle the camera canvas; light chip
      // damage (storm ticks etc.) stays steady so the effect keeps meaning.
      if (amount >= 12) this.hud.shake(true);
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
    // F3a: bots now consider every player (host + every RemotePlayer), not
    // just the local one — see the players array built in the loop below —
    // so `targetPeerId` says WHICH player a bot's attack actually landed on.
    // null means the host's own local player (the pre-F3 behavior, unchanged
    // in solo play where remotePlayers is always empty); a peer id means a
    // bot hit a remote puppet, which only the host can see happen (bots are
    // host-authoritative), so the host must tell that peer to apply the
    // damage locally.
    this.botManager.onPlayerDamaged = (amount, sourcePos, targetPeerId) => {
      if (targetPeerId != null) {
        // A bot hit a REMOTE player. Only the host ever reaches this branch
        // (BotManager.update's AI path is host/solo-only) — tell that peer
        // so its own takeDamage path fires (hurt flash/shake/audio) and its
        // own damage-direction indicator can point back at the bot.
        if (this.net?.isHost && sourcePos) {
          this.net.sendTo(
            targetPeerId,
            {
              t: "player_hit",
              peerId: targetPeerId,
              damage: amount,
              botPos: [sourcePos.x, sourcePos.y, sourcePos.z],
              hitId: ++this.nextPlayerHitId,
            },
            { redundant: true }
          );
        }
        return;
      }
      const healthBefore = this.player.health;
      this.player.takeDamage(amount, performance.now() / 1000);
      // D2: directional hit indicator, only for damage that actually landed
      // (takeDamage no-ops while dead/invulnerable). Storm ticks call
      // player.takeDamage directly from the loop — never through this
      // callback — so environmental damage stays directionless by design.
      if (sourcePos && this.player.health < healthBefore) {
        this.hud.showDamageDirection(this.bearingTo(sourcePos));
      }
    };
    this.botManager.onKill = (bot) => {
      if (this.remoteHitPeer && this.net) {
        // A joiner's forwarded bot_hit landed the killing blow — credit that
        // peer via kill_feed instead of the host's own score. The host's own
        // broadcast is never echoed back to it, so its ally feed entry is
        // added here (joiners get theirs from the kill_feed handler).
        this.hud.pushKillFeed("ally", bot.id);
        this.net.broadcast(
          { t: "kill_feed", peerId: this.remoteHitPeer, botId: bot.id },
          { redundant: true }
        );
        return;
      }
      this.score += 10;
      this.kills += 1;
      this.onKill?.();
      this.hud.pushKillFeed("you", bot.id);
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
    this.weapons.onHitBot = (damage, killed) => {
      this.hud.pulseHit(killed);
      this.hud.showDamageNumber(damage, killed);
    };
    this.weapons.onKillBot = () => {
      // pulseHit(true) is already handled via onHitBot's killed flag; the
      // kill adds a light celebratory canvas shake on top.
      this.hud.shake(false);
    };
    this.weapons.onSwitch = (index) => {
      // switchTo never activates an empty slot, so id is always set here;
      // the guard is just defensive. B2: the visual now needs the concrete
      // weapon id (each gun has its own held silhouette), not just isMelee.
      const id = this.weapons.slots[index].id;
      if (id) this.player.setActiveWeaponVisual(id);
    };
    this.weapons.onMeleeSwing = () => this.player.triggerPickaxeSwing();

    this.buildingManager = new BuildingManager(this.scene, this.world);

    this.airdrops = new AirdropManager(this.scene, this.world);
    this.airdrops.onPickup = (weaponId, isNew) => {
      // D1: the toast surfaces the weapon's rarity tier alongside its name.
      const def = WEAPON_DEFS[weaponId];
      this.hud.showPickup(def.name, isNew, def.rarity);
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

    // Track A6 grade pass — skipped whenever the (heavier) postFX composer is
    // active for the tier, since two composers would double-render the scene.
    const wantGrade = quality.gradePass && !quality.postFX;
    if (wantGrade && !this.gradeFX && !this.gradeFXLoading) {
      void this.initGradeFX();
    } else if (!wantGrade && this.gradeFX) {
      this.gradeFX.dispose();
      this.gradeFX = null;
    }
  }

  /** Dynamically loads the grade-pass chunk (same lazy pattern as
   *  initPostFX — keeps the composer/pass tree out of the main bundle for
   *  the "low" tier, which never enables it). */
  private async initGradeFX(): Promise<void> {
    this.gradeFXLoading = true;
    try {
      const { createGradeFXPipeline } = await import("./gradepass");
      const quality = QUALITY_TIERS[this.settings.qualityTier];
      // Re-check after the async gap: disposed, tier downgraded, or postFX
      // (which supersedes the grade pass) switched on while loading.
      if (this.disposed || !quality.gradePass || quality.postFX || this.gradeFX) {
        return;
      }
      this.gradeFX = createGradeFXPipeline(this.renderer, this.scene, this.camera);
      this.gradeFX.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    } catch (err) {
      // Chunk failed to load — the direct render path stays valid.
      console.warn("GradeFX pipeline unavailable, staying on direct rendering", err);
    } finally {
      this.gradeFXLoading = false;
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
    this.gradeFX?.dispose();
    this.gradeFX = null;
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
          // Baseline the shots counter on the very first packet from this
          // peer so we never invent a burst of "missed" shots for whatever
          // count they'd already reached before we saw them.
          this.lastPeerShots.set(peerId, msg.shots);
        } else {
          puppet.setSkin(msg.skinId);
        }
        // F1: give the puppet its real held-weapon mesh (was previously a
        // bare humanoid with nothing to show at all).
        puppet.setActiveWeaponVisual(msg.weaponId);
        puppet.setDead(msg.dead);

        // F1: Δshots since the last packet -> exactly that many tracer/swing
        // events, so a rapid burst of taps between 15Hz samples is never
        // silently collapsed into "at most one" the way sampling `firing`
        // alone would.
        const lastShots = this.lastPeerShots.get(peerId) ?? msg.shots;
        this.lastPeerShots.set(peerId, msg.shots);
        let deltaShots = msg.shots - lastShots;
        // A rejoin (sender's counter reset) or a long stall (many samples
        // missed) both show up as an implausible delta — clamp instead of
        // replaying a flood of tracers.
        if (deltaShots < 0) deltaShots = 0;
        deltaShots = Math.min(deltaShots, 5);
        if (!msg.dead) {
          for (let i = 0; i < deltaShots; i++) {
            this.spawnRemoteWeaponEffect(puppet, msg.weaponId);
          }
        }
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
        const nowSec = performance.now() / 1000;
        // Keyed per credited peer: two different peers legitimately killing
        // the same respawned bot in quick succession must not dedupe.
        const key = `kf:${msg.peerId}:${msg.botId}`;
        const last = this.seenKillFeed.get(key) ?? -Infinity;
        // Redundant copies arrive within ~200ms; a legitimate re-kill of the
        // same bot is at least BOT_RESPAWN_TIME (6s) away, so a 2s window
        // dedupes the former without ever eating the latter.
        if (nowSec - last < 2) return;
        this.seenKillFeed.set(key, nowSec);
        if (msg.peerId === net.myId) {
          // Kill credited to this peer: score it and feed it as "you".
          this.score += 10;
          this.kills += 1;
          this.onKill?.();
          this.audio.botKill();
          this.hud.pulseHit(true);
          this.hud.pushKillFeed("you", msg.botId);
        } else {
          // A teammate's kill: feed-only (D2) — no local score/audio. Same
          // shared pushKillFeed path the local-kill branches use.
          this.hud.pushKillFeed("ally", msg.botId);
        }
        return;
      }
      case "player_hit": {
        // F3a: the host is telling THIS peer it took bot damage (bots only
        // ever run AI on the host, so only the host can know this happened).
        // sendTo already targets exactly this peer, but the shape carries
        // `peerId` too so a future broadcast form would stay self-describing;
        // guard it anyway rather than trust transport addressing alone.
        if (msg.peerId !== net.myId) return;
        const nowSec = performance.now() / 1000;
        const key = `${peerId}:${msg.hitId}`;
        if (this.seenPlayerHits.has(key)) return; // 3x-redundant send dedupe
        this.seenPlayerHits.set(key, nowSec);
        this.pruneSeen(this.seenPlayerHits, nowSec);
        const healthBefore = this.player.health;
        this.player.takeDamage(msg.damage, nowSec);
        // Same D2 directional indicator local bot damage gets — reuses the
        // normal takeDamage path, so the hurt flash/shake/audio (wired via
        // Player.onDamaged in the constructor) already fire unconditionally.
        if (this.player.health < healthBefore) {
          const botPos = this.netTmpVec.set(msg.botPos[0], msg.botPos[1], msg.botPos[2]);
          this.hud.showDamageDirection(this.bearingTo(botPos));
        }
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
        // F1: the concrete weapon id, not just a slot index — a receiving
        // peer has no way to know which gun occupies *this* peer's pickup
        // slots 2-5 (that's per-peer inventory state, never transmitted), so
        // the id is what actually lets RemotePlayer show the right held gun.
        weaponId: this.weapons.activeDef?.id ?? "blaster",
        firing: this.input.fireHeld && !p.dead,
        dead: p.dead,
        // F1: monotonic — see WeaponSystem.shotsFired's field comment. Lets
        // receivers diff Δshots instead of sampling a boolean at 15Hz.
        shots: this.weapons.shotsFired,
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
        st.firing,
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

  /** D2: screen-relative bearing from the player to a world position, in
   *  radians — 0 = dead ahead, +π/2 = to the player's right, ±π = behind.
   *  Same frame the minimap's toMap rotation uses: the player's yaw defines
   *  "up". Drives the HUD damage-direction arc's CSS rotation directly. */
  private bearingTo(sourcePos: THREE.Vector3): number {
    const dx = sourcePos.x - this.player.position.x;
    const dz = sourcePos.z - this.player.position.z;
    const yaw = this.player.yaw;
    // Player-space basis (see Player.update): forward = (-sin yaw, -cos yaw),
    // right = (cos yaw, -sin yaw) in the XZ plane.
    const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
    const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
    return Math.atan2(right, fwd);
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

  /** F1: visual feedback for one shot/swing a remote peer just took, fired
   *  once per detected `shots` delta in handleNetMessage's "state" case. A
   *  melee peer gets the puppet's pickaxe swing arc; a ranged peer gets a
   *  tracer (reusing spawnBotTracer's line, same as bot ranged fire) from
   *  their gunTip along their broadcast aim direction, plus the same
   *  muzzle-flash particle burst WeaponSystem.shoot spawns locally. There is
   *  no raycast here — we don't know what the remote peer's shot actually
   *  hit (that already resolved on their own machine) — this only makes
   *  their shot visible on this screen. */
  private spawnRemoteWeaponEffect(puppet: RemotePlayer, weaponId: WeaponId): void {
    if (WEAPON_DEFS[weaponId].isMelee) {
      puppet.triggerPickaxeSwing();
      return;
    }
    const def = WEAPON_DEFS[weaponId];
    const from = new THREE.Vector3();
    puppet.gunTip.getWorldPosition(from);
    const aim = puppet.aimDirection();
    const to = from.clone().addScaledVector(aim, def.range);
    this.spawnBotTracer(from, to);
    this.particles.burst(from, new THREE.Color(0xfff2b0), 4, 2.5, 0.5, 1, 0.1);
    this.audio.shoot();
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

  /** Drains the desktop backend's queued action keys (V4 D4). Every branch is
   *  feature-detected via optional call, so with the touch InputManager this
   *  is three cheap undefined checks and nothing else — mobile behavior is
   *  identical to before.
   *
   *  Each action routes through exactly the same method the existing on-screen
   *  control uses, so keyboard and touch can never drift apart. Note the two
   *  HUD bars differ in how their highlight is maintained:
   *   - WeaponBar's active slot is re-derived every frame from
   *     `weapons.activeSlotIndex` in WeaponBar.update() below, so switching via
   *     the number keys moves the highlight with no extra call.
   *   - BuildPieceBar has no per-frame update, so Q/E must call setActive
   *     explicitly — exactly as its own pointerdown handler does. */
  private applyDesktopActions(): void {
    const slot = this.input.consumeWeaponSlot?.() ?? null;
    if (slot !== null) this.weapons.switchTo(slot, this.audio);

    const step = this.input.consumeBuildPieceStep?.() ?? 0;
    if (step !== 0) {
      const current = BUILD_PIECE_IDS.indexOf(this.buildingManager.selectedPieceId);
      const count = BUILD_PIECE_IDS.length;
      // Wrap in both directions (JS % keeps the sign of the dividend).
      const next = BUILD_PIECE_IDS[(((current + step) % count) + count) % count];
      this.buildingManager.selectPiece(next);
      this.buildPieceBar.setActive(next);
    }

    if (this.input.consumeReload?.()) this.weapons.requestReload(this.audio);
  }

  /** Eases the camera FOV toward the ADS or hip-fire target and keeps the HUD
   *  crosshair in sync. No-op on touch (aimHeld is always undefined there, so
   *  the FOV sits at BASE_FOV and the early-out below skips the work). */
  private updateAimDownSights(dt: number): void {
    const aiming = !!this.input.aimHeld && !this.player.dead && !this.matchEnded;
    const target = aiming ? ADS_FOV : BASE_FOV;
    if (this.camera.fov !== target) {
      const t = Math.min(1, dt * ADS_FOV_LERP);
      const next = this.camera.fov + (target - this.camera.fov) * t;
      this.camera.fov = Math.abs(target - next) < ADS_FOV_SNAP ? target : next;
      this.camera.updateProjectionMatrix();
    }
    this.hud.setAiming(aiming);
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
      this.applyDesktopActions();
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

    this.updateAimDownSights(dt);
    this.player.updateCamera(this.camera, this.world, dt);
    this.player.updateWeaponPose(dt, this.input.fireHeld && !this.player.dead);
    // F3a: bots must consider every player, not just the local one — a
    // solo/host-only game always has exactly the local entry (peerId: null,
    // byte-identical to the pre-F3 single-position call), so this degrades
    // to old behavior with an empty remotePlayers map. Dead remote peers are
    // excluded (a bot chasing a hidden, already-down ally is pointless).
    this.netPlayerTargets.length = 0;
    this.netPlayerTargets.push({ pos: this.player.position, peerId: null });
    for (const [peerId, puppet] of this.remotePlayers) {
      if (this.remoteStates.get(peerId)?.dead) continue;
      this.netPlayerTargets.push({ pos: puppet.group.position, peerId });
    }
    this.botManager.update(
      dt,
      nowSec,
      this.world,
      this.netPlayerTargets,
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
      weaponRarity: activeDef?.rarity ?? null,
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
    } else if (this.gradeFX) {
      // Track A6 grade pass — the default path on "medium"/"high".
      this.gradeFX.render();
    } else {
      // Direct render — "low" tier (and any tier while a composer chunk is
      // still in flight or failed to load).
      this.renderer.render(this.scene, this.camera);
    }
  };
}
