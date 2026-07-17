import * as THREE from "three";
import { BOT_MAX_HP, BOT_WANDER_SPEED, BOT_RESPAWN_TIME, WORLD_RADIUS } from "../core/constants";
import type { Collider } from "../core/types";
import type { BotNetState } from "../net/protocol";
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
// A touch of extra berth beyond the bare body radius so a bot's mesh keeps
// clear of a prop's visual bulk (tree canopy, shack corner) instead of
// grazing it — the player never notices grazing their own first-person body,
// but a bot brushing a tree reads as clipping. Applied to both the host AI
// path and the co-op joiner puppet path so they resolve identically.
const BOT_PROP_CLEARANCE = 0.4;
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

  // Non-authoritative (joiner-side) puppet state: the latest host-broadcast
  // transform, lerped toward in updateNonAuthoritative. Same lerp idiom as
  // RemotePlayer — joiners keep real Bot meshes to see and raycast against,
  // they just never run local AI/physics for them.
  private netTarget = new THREE.Vector3();
  private netYaw = 0;
  private hasNetState = false;

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

  /** Eases the white hit-flash back to the base skin once it expires; shared
   *  by the authoritative update() and updateNonAuthoritative(). */
  private restoreHitFlash(nowSec: number): void {
    if (nowSec >= this.hitFlashUntil && this.humanoid.bodyMat.color.r > this.baseBodyColor.r) {
      this.humanoid.bodyMat.color.copy(this.baseBodyColor);
      this.humanoid.headMat.color.copy(this.baseHeadColor);
    }
  }

  /** Non-authoritative: ingest one bot entry from a host `bot_state`
   *  broadcast. Mirrors the alive/HP transitions takeDamage()/respawn()
   *  produce locally (hide on death, show + re-skin on respawn, white flash
   *  on an HP drop) and stores the transform target for the per-frame lerp. */
  applyNetworkState(state: BotNetState, world: World): void {
    const [x, , z] = state.pos;
    if (state.alive && !this.alive) {
      this.alive = true;
      this.group.visible = true;
      this.shadow.visible = true;
      // The host also re-rolls a random skin on respawn; skins aren't in the
      // protocol (purely cosmetic), so each peer rolls its own.
      this.applySkin(randomEnemySkin());
      this.group.position.set(x, world.getHeightAt(x, z), z);
      this.group.rotation.y = state.yaw;
    } else if (!state.alive && this.alive) {
      this.alive = false;
      this.group.visible = false;
      this.shadow.visible = false;
    }
    if (state.alive && state.hp < this.hp) {
      this.hitFlashUntil = performance.now() / 1000 + 0.12;
      this.humanoid.bodyMat.color.set(0xffffff);
      this.humanoid.headMat.color.set(0xffffff);
    }
    this.hp = state.hp;
    this.netTarget.set(x, 0, z);
    this.netYaw = state.yaw;
    if (!this.hasNetState) {
      this.hasNetState = true;
      this.group.position.set(x, world.getHeightAt(x, z), z);
      this.group.rotation.y = state.yaw;
    }
  }

  /** Non-authoritative per-frame update: no AI, no attacks, no respawn timer
   *  — just lerp toward the latest host transform (same smoothing curve as
   *  RemotePlayer/Player.updateCamera) and drive the shared walk cycle from
   *  the actual movement. Y always comes from the local heightfield, which
   *  is deterministic and therefore identical to the host's. */
  updateNonAuthoritative(dt: number, nowSec: number, world: World): void {
    if (!this.alive) return;
    this.restoreHitFlash(nowSec);
    if (!this.hasNetState) return;

    const pos = this.group.position;
    if (Math.hypot(this.netTarget.x - pos.x, this.netTarget.z - pos.z) > 12) {
      pos.x = this.netTarget.x;
      pos.z = this.netTarget.z;
    }

    const prevX = pos.x;
    const prevZ = pos.z;
    const smoothing = 1 - Math.pow(0.0008, dt);
    pos.x += (this.netTarget.x - pos.x) * smoothing;
    pos.z += (this.netTarget.z - pos.z) * smoothing;
    // Same push-out the host applies: keeps joiner-side puppets from sliding
    // through props on the straight-line lerp between 10 Hz host snapshots.
    this.pushOutOfColliders(world);
    pos.y = world.getHeightAt(pos.x, pos.z);

    let yawDelta = this.netYaw - this.group.rotation.y;
    yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
    this.group.rotation.y += yawDelta * smoothing;

    this.shadow.position.set(pos.x, pos.y + 0.03, pos.z);

    const moved = Math.hypot(pos.x - prevX, pos.z - prevZ);
    const maxBotSpeed = BOT_WANDER_SPEED * 1.7;
    const speedT = THREE.MathUtils.clamp(dt > 0 ? moved / dt / maxBotSpeed : 0, 0, 1);
    const strideHz = 1.6 + speedT * 1.6;
    this.locomotionPhase += dt * strideHz * Math.PI * 2;
    animateHumanoidLocomotion(this.humanoid, speedT, this.locomotionPhase, dt);
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
    onAttack: (damage: number) => void,
    onRangedFire?: (from: THREE.Vector3, to: THREE.Vector3) => void
  ): void {
    if (!this.alive) {
      if (nowSec >= this.respawnAt) this.respawn(world);
      return;
    }

    this.restoreHitFlash(nowSec);

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
          // Ranged bots previously had no visual/audio tell at all — a shot
          // landed as an unexplained HP drop with nothing on screen to
          // explain it (easy to misread as "storm damage" if it happens to
          // land while the player is standing in the safe zone). This gives
          // the player something to actually see.
          onRangedFire?.(pos.clone(), playerPos.clone());
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

    this.pushOutOfColliders(world);

    pos.y = world.getHeightAt(pos.x, pos.z);
    this.shadow.position.set(pos.x, pos.y + 0.03, pos.z);

    const strideHz = 1.6 + speedT * 1.6;
    this.locomotionPhase += dt * strideHz * Math.PI * 2;
    animateHumanoidLocomotion(this.humanoid, speedT, this.locomotionPhase, dt);
  }

  /** Flat-cylinder push-out against every world collider (trees, rocks,
   *  crates, shacks — and placed walls, which live in the same array): the
   *  hard guarantee that a bot never ends a frame overlapping an obstacle.
   *  Shared by the host AI path (update) and the co-op joiner puppet path
   *  (updateNonAuthoritative) so both resolve obstacles identically —
   *  previously the joiner path skipped this entirely, so remote bots visibly
   *  slid through props as the lerp cut corners between host snapshots. */
  private pushOutOfColliders(world: World): void {
    const pos = this.group.position;
    for (const c of world.colliders) {
      const dx = pos.x - c.position.x;
      const dz = pos.z - c.position.z;
      const d = Math.hypot(dx, dz);
      const minDist = c.radius + BOT_RADIUS + BOT_PROP_CLEARANCE;
      if (d > 0.0001 && d < minDist) {
        const push = (minDist - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
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
