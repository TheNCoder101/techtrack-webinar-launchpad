import * as THREE from "three";
import type { BotDifficultySettings } from "../core/Settings";
import type { BotNetState } from "../net/protocol";
import { World } from "../world/World";
import { Bot, type BotKind } from "./Bot";

export class BotManager {
  bots: Bot[] = [];
  raycastTargets: THREE.Object3D[] = [];
  onPlayerDamaged?: (amount: number) => void;
  onKill?: (bot: Bot) => void;
  /** Fired every time a ranged bot actually takes a shot at the player —
   *  purely cosmetic (tracer/impact feedback), does not affect damage. */
  onRangedFire?: (from: THREE.Vector3, to: THREE.Vector3) => void;
  /** Non-authoritative only: fired when damage() is asked to hurt a bot this
   *  peer has no authority over — Game forwards it to the host as a
   *  `bot_hit` message, and the host's `bot_state` broadcast is the source
   *  of truth back (keeps exactly one owner for every bot's HP). */
  onRemoteHit?: (botId: number, damage: number) => void;

  /** `difficulty` comes from BOT_DIFFICULTY[settings.qualityTier] in Game's
   *  constructor — the quality tier doubles as the difficulty axis.
   *
   *  `authoritative` (default true: solo and co-op host) decides whether this
   *  manager runs the real bot AI/physics or merely puppets host-broadcast
   *  transforms. Non-authoritative managers spawn NO bots up front — the
   *  host's `bot_state` defines the roster (its bot count, not the local
   *  tier's), and bots are created lazily on first sight in applyBotState. */
  constructor(
    private scene: THREE.Scene,
    world: World,
    private difficulty: BotDifficultySettings,
    readonly authoritative: boolean = true
  ) {
    if (!authoritative) return;
    for (let i = 0; i < difficulty.botCount; i++) {
      // Every 3rd bot (ids 2, 5, 8, ...) is the ranged archetype —
      // deterministic, and every tier's count includes at least one.
      const kind: BotKind = i % 3 === 2 ? "ranged" : "melee";
      const bot = new Bot(i, scene, kind, difficulty);
      bot.respawn(world);
      this.bots.push(bot);
      this.raycastTargets.push(...bot.meshes);
    }
  }

  isAlive(refId: number): boolean {
    return this.bots[refId]?.alive ?? false;
  }

  /** Returns true if this hit killed the bot. On a non-authoritative manager
   *  nothing is applied locally — the hit is forwarded to the host via
   *  onRemoteHit and always reports "not killed"; the kill (if any) arrives
   *  back through `bot_state`/`kill_feed`. */
  damage(refId: number, amount: number): boolean {
    const bot = this.bots[refId];
    if (!bot) return false;
    if (!this.authoritative) {
      if (bot.alive) this.onRemoteHit?.(refId, amount);
      return false;
    }
    const killed = bot.takeDamage(amount);
    if (killed) this.onKill?.(bot);
    return killed;
  }

  /** Non-authoritative: ingest a host `bot_state` broadcast, creating any
   *  bot seen for the first time (the roster is host-defined). New meshes
   *  join raycastTargets, so the WeaponSystem target cache is invalidated
   *  via the same dirty flag BuildingManager already uses. */
  applyBotState(states: BotNetState[], world: World): void {
    if (this.authoritative) return;
    for (const state of states) {
      let bot = this.bots[state.id];
      if (!bot) {
        const kind: BotKind = state.id % 3 === 2 ? "ranged" : "melee";
        bot = new Bot(state.id, this.scene, kind, this.difficulty);
        // Start hidden/dead until the state below says otherwise, so a bot
        // that died before we joined never flashes in at a stale position.
        bot.alive = false;
        bot.group.visible = false;
        bot.shadow.visible = false;
        this.bots[state.id] = bot;
        this.raycastTargets.push(...bot.meshes);
        world.raycastTargetsDirty = true;
      }
      bot.applyNetworkState(state, world);
    }
  }

  update(
    dt: number,
    nowSec: number,
    world: World,
    playerPos: THREE.Vector3,
    safeZoneCenter: THREE.Vector3,
    safeZoneRadius: number
  ): void {
    if (!this.authoritative) {
      // Joiner side: skip AI/physics entirely — every bot just lerps toward
      // its latest host-broadcast transform.
      for (const bot of this.bots) {
        bot?.updateNonAuthoritative(dt, nowSec, world);
      }
      return;
    }
    for (const bot of this.bots) {
      bot.update(
        dt,
        nowSec,
        world,
        playerPos,
        safeZoneCenter,
        safeZoneRadius,
        (dmg) => this.onPlayerDamaged?.(dmg),
        (from, to) => this.onRangedFire?.(from, to)
      );
    }
  }
}
