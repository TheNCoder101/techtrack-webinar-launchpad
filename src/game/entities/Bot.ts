import * as THREE from "three";
import { BOT_MAX_HP, BOT_WANDER_SPEED, BOT_RESPAWN_TIME, WORLD_RADIUS } from "../core/constants";
import type { Collider } from "../core/types";
import type { BotDifficultySettings } from "../core/Settings";
import { World } from "../world/World";
import { createBlobShadow } from "../world/blobShadow";
import { randomEnemySkin, type CharacterSkin } from "./skinDefs";
import {
  buildHumanoid,
  applyHumanoidSkin,
  animateHumanoidLocomotion,
  type HumanoidBuild,
} from "./humanoid";

const ATTACK_RANGE = 2.3;
const ATTACK_COOLDOWN = 1.4;
const ATTACK_DAMAGE = 8;
// Push-out radius for bot-vs-collider collision, mirroring PLAYER_RADIUS
// (bots share the player's humanoid rig, so the same footprint fits).
const BOT_RADIUS = 0.5;
// Forward-lookahead steering: how far ahead of the bot the probe point sits,
// and how much padding beyond the hard push-out circle triggers a swerve.
const LOOKAHEAD_DIST = 2.6;
const STEER_MARGIN = 0.5;
// Ranged archetype: fires inside RANGED_ATTACK_RANGE, stops advancing once
// comfortably inside RANGED_HOLD_RANGE (the gap keeps hold/fire from
// flickering right at the edge). Fire rate/damage are tier-scaled — see
// BOT_DIFFICULTY in core/Settings.ts.
const RANGED_ATTACK_RANGE = 16;
const RANGED_HOLD_RANGE = 13;

export type BotKind = "melee" | "ranged";

/** True when the flat XZ segment from `a` to `b` clips any collider circle.
 *  This is the minimal line-of-sight obstruction check ranged bots use in
 *  place of a real mesh raycast against the player (who has no hittable
 *  mesh) — and since placed walls push their collider into the same
 *  world.colliders array as trees/rocks, a wall between bot and player
 *  blocks bot fire too. */
function losBlocked(a: THREE.Vector3, b: THREE.Vector3, colliders: Collider[]): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  for (const c of colliders) {
    let t = len2 > 0 ? ((c.position.x - a.x) * dx + (c.position.z - a.z) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    if (Math.hypot(c.position.x - px, c.position.z - pz) < c.radius) return true;
  }
  return false;
}
// How far INSIDE the safe zone a fleeing bot runs before it considers itself
// safe and resumes wander/chase. Prevents flickering at the exact edge of a
// still-shrinking circle.
const ZONE_SAFE_MARGIN = 5;

export class Bot {
  id: number;
  group: THREE.Group;
  shadow: THREE.Mesh;

  private humanoid: HumanoidBuild;
  private baseBodyColor = new THREE.Color();
  private baseHeadColor = new THREE.Color();
  private locomotionPhase = 0;

  hp = BOT_MAX_HP;
  alive = true;
  respawnAt = 0;
  wanderTarget = new THREE.Vector3();
  wanderTimer = 0;
  attackCooldown = 0;
  hitFlashUntil = 0;
  fleeingStorm = false;

  constructor(
    id: number,
    scene: THREE.Scene,
    readonly kind: BotKind,
    private difficulty: BotDifficultySettings
  ) {
    this.id = id;
    this.humanoid = buildHumanoid(randomEnemySkin());
    this.group = this.humanoid.group;

    for (const mesh of this.humanoid.hittableMeshes) {
      mesh.userData = { kind: "bot", refId: id };
    }

    this.baseBodyColor.copy(this.humanoid.bodyMat.color);
    this.baseHeadColor.copy(this.humanoid.headMat.color);

    this.shadow = createBlobShadow(0.55);
    scene.add(this.shadow);
    scene.add(this.group);
  }

  get meshes(): THREE.Mesh[] {
    return this.humanoid.hittableMeshes;
  }

  applySkin(skin: CharacterSkin): void {
    applyHumanoidSkin(this.humanoid, skin);
    this.baseBodyColor.copy(this.humanoid.bodyMat.color);
    this.baseHeadColor.copy(this.humanoid.headMat.color);
  }

  pickWanderTarget(): void {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * WORLD_RADIUS * 0.6;
    this.wanderTarget.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    this.wanderTimer = 4 + Math.random() * 4;
  }

  respawn(world: World): void {
    this.alive = true;
    this.hp = BOT_MAX_HP;
    this.group.visible = true;
    this.shadow.visible = true;
    this.applySkin(randomEnemySkin());
    const angle = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * WORLD_RADIUS * 0.6;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    this.group.position.set(x, world.getHeightAt(x, z), z);
    this.fleeingStorm = false;
    this.pickWanderTarget();
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.hitFlashUntil = performance.now() / 1000 + 0.12;
    this.humanoid.bodyMat.color.set(0xffffff);
    this.humanoid.headMat.color.set(0xffffff);
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      this.shadow.visible = false;
      this.respawnAt = performance.now() / 1000 + BOT_RESPAWN_TIME;
      return true;
    }
    return false;
  }

  update(
    dt: number,
    nowSec: number,
    world: World,
    playerPos: THREE.Vector3,
    safeZoneCenter: THREE.Vector3,
    safeZoneRadius: number,
    onAttack: (damage: number) => void
  ): void {
    if (!this.alive) {
      if (nowSec >= this.respawnAt) this.respawn(world);
      return;
    }

    if (nowSec >= this.hitFlashUntil && this.humanoid.bodyMat.color.r > this.baseBodyColor.r) {
      this.humanoid.bodyMat.color.copy(this.baseBodyColor);
      this.humanoid.headMat.color.copy(this.baseHeadColor);
    }

    const pos = this.group.position;
    const toPlayer = new THREE.Vector3().subVectors(playerPos, pos);
    toPlayer.y = 0;
    const distToPlayer = toPlayer.length();

    this.attackCooldown -= dt;

    // Third state on top of chase/wander: "flee to zone center". Being caught
    // outside the storm's safe zone overrides everything else until the bot is
    // comfortably back inside (hysteresis via ZONE_SAFE_MARGIN so a shrinking
    // edge can't flip the state every frame).
    const distFromZoneCenter = Math.hypot(pos.x - safeZoneCenter.x, pos.z - safeZoneCenter.z);
    if (this.fleeingStorm) {
      if (distFromZoneCenter < safeZoneRadius - ZONE_SAFE_MARGIN) this.fleeingStorm = false;
    } else if (distFromZoneCenter > safeZoneRadius) {
      this.fleeingStorm = true;
    }

    const maxBotSpeed = BOT_WANDER_SPEED * 1.7;
    let moveTarget: THREE.Vector3;
    let speed: number;
    if (this.fleeingStorm) {
      moveTarget = safeZoneCenter;
      speed = maxBotSpeed;
    } else if (distToPlayer < this.difficulty.aggroRange) {
      moveTarget = playerPos;
      speed = maxBotSpeed;
      if (this.kind === "ranged") {
        // Ranged archetype: advance until comfortably in firing range, then
        // hold position (speed 0 still rotates toward the player below) and
        // hitscan on a cooldown — a distance + line-of-sight check standing
        // in for WeaponSystem.shoot's mesh raycast, since the player has no
        // hittable mesh. Same onAttack -> onPlayerDamaged path as melee.
        if (distToPlayer < RANGED_HOLD_RANGE) speed = 0;
        if (
          distToPlayer < RANGED_ATTACK_RANGE &&
          this.attackCooldown <= 0 &&
          !losBlocked(pos, playerPos, world.colliders)
        ) {
          this.attackCooldown = this.difficulty.rangedFireCooldown;
          onAttack(this.difficulty.rangedDamage);
        }
      } else if (distToPlayer < ATTACK_RANGE) {
        if (this.attackCooldown <= 0) {
          this.attackCooldown = ATTACK_COOLDOWN;
          onAttack(ATTACK_DAMAGE);
        }
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) this.pickWanderTarget();
      moveTarget = this.wanderTarget;
      speed = BOT_WANDER_SPEED;
    }

    const toTarget = new THREE.Vector3().subVectors(moveTarget, pos);
    toTarget.y = 0;
    const dist = toTarget.length();
    let speedT = 0;
    if (dist > 0.4) {
      toTarget.normalize();
      // Movement MODIFIER applied to whatever target the bot currently has
      // (wander, chase, or flee-storm): bend the direction around any
      // collider the path ahead would clip, so avoidance looks like steering
      // rather than scraping along the push-out circle below.
      this.steerAroundColliders(toTarget, world);
      pos.x += toTarget.x * speed * dt;
      pos.z += toTarget.z * speed * dt;
      this.group.rotation.y = Math.atan2(toTarget.x, toTarget.z);
      speedT = speed / maxBotSpeed;
    }

    // Same flat-cylinder push-out loop as Player.update: hard guarantee that
    // bots never pass through trees, rocks, crates — or placed walls, whose
    // colliders live in the very same world.colliders array.
    for (const c of world.colliders) {
      const dx = pos.x - c.position.x;
      const dz = pos.z - c.position.z;
      const d = Math.hypot(dx, dz);
      const minDist = c.radius + BOT_RADIUS;
      if (d > 0.0001 && d < minDist) {
        const push = (minDist - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }

    pos.y = world.getHeightAt(pos.x, pos.z);
    this.shadow.position.set(pos.x, pos.y + 0.03, pos.z);

    const strideHz = 1.6 + speedT * 1.6;
    this.locomotionPhase += dt * strideHz * Math.PI * 2;
    animateHumanoidLocomotion(this.humanoid, speedT, this.locomotionPhase, dt);
  }

  /** Forward-lookahead steering: probes the point LOOKAHEAD_DIST ahead along
   *  the intended move direction and, if it lands inside a collider's padded
   *  circle, bends `dir` (mutated in place, stays normalized) along the
   *  perpendicular pointing away from that collider — harder the deeper the
   *  probe sits inside the circle. Deliberately just a nudge heuristic, not
   *  pathfinding: the push-out loop in update() remains the hard guarantee. */
  private steerAroundColliders(dir: THREE.Vector3, world: World): void {
    const pos = this.group.position;
    const aheadX = pos.x + dir.x * LOOKAHEAD_DIST;
    const aheadZ = pos.z + dir.z * LOOKAHEAD_DIST;

    let blocking: Collider | null = null;
    let blockingDist = Infinity;
    for (const c of world.colliders) {
      const d = Math.hypot(aheadX - c.position.x, aheadZ - c.position.z);
      if (d < c.radius + BOT_RADIUS + STEER_MARGIN && d < blockingDist) {
        blockingDist = d;
        blocking = c;
      }
    }
    if (!blocking) return;

    const padded = blocking.radius + BOT_RADIUS + STEER_MARGIN;
    const strength = (padded - blockingDist) / padded;
    // Perpendicular of dir in the XZ plane, flipped to point away from the
    // collider's side (dead-center approach keeps the default side).
    let perpX = -dir.z;
    let perpZ = dir.x;
    const toColX = blocking.position.x - pos.x;
    const toColZ = blocking.position.z - pos.z;
    if (perpX * toColX + perpZ * toColZ > 0) {
      perpX = -perpX;
      perpZ = -perpZ;
    }
    dir.x += perpX * strength * 1.6;
    dir.z += perpZ * strength * 1.6;
    dir.normalize();
  }
}
