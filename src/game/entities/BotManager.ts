import * as THREE from "three";
import type { BotDifficultySettings } from "../core/Settings";
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

  /** `difficulty` comes from BOT_DIFFICULTY[settings.qualityTier] in Game's
   *  constructor — the quality tier doubles as the difficulty axis. */
  constructor(scene: THREE.Scene, world: World, difficulty: BotDifficultySettings) {
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

  /** Returns true if this hit killed the bot. */
  damage(refId: number, amount: number): boolean {
    const bot = this.bots[refId];
    if (!bot) return false;
    const killed = bot.takeDamage(amount);
    if (killed) this.onKill?.(bot);
    return killed;
  }

  update(
    dt: number,
    nowSec: number,
    world: World,
    playerPos: THREE.Vector3,
    safeZoneCenter: THREE.Vector3,
    safeZoneRadius: number
  ): void {
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
