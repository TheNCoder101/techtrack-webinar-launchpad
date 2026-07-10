import * as THREE from "three";
import { BOT_COUNT } from "../core/constants";
import { World } from "../world/World";
import { Bot } from "./Bot";

export class BotManager {
  bots: Bot[] = [];
  raycastTargets: THREE.Object3D[] = [];
  onPlayerDamaged?: (amount: number) => void;
  onKill?: (bot: Bot) => void;

  constructor(scene: THREE.Scene, world: World) {
    for (let i = 0; i < BOT_COUNT; i++) {
      const bot = new Bot(i, scene);
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

  update(dt: number, nowSec: number, world: World, playerPos: THREE.Vector3): void {
    for (const bot of this.bots) {
      bot.update(dt, nowSec, world, playerPos, (dmg) => this.onPlayerDamaged?.(dmg));
    }
  }
}
