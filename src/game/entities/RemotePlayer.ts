import * as THREE from "three";
import { PLAYER_WALK_SPEED, PLAYER_SPRINT_MULT } from "../core/constants";
import { createBlobShadow } from "../world/blobShadow";
import { PLAYER_SKINS, type CharacterSkin } from "./skinDefs";
import {
  applyHumanoidSkin,
  animateHumanoidLocomotion,
  type HumanoidBuild,
} from "./humanoid";
import { createPlayerMesh, GUN_WEAPON_IDS, type GunWeaponId } from "./playerMesh";
import { WEAPON_DEFS, type WeaponId } from "../weapons/weaponDefs";

// A visual-only puppet for another human player in a co-op session. No local
// physics, no collision, no input — purely driven by incoming `state`
// messages: Game stores the latest received transform per peer and calls
// applyNetworkState every frame, which lerps toward it with the exact same
// smoothing technique as Player.updateCamera's camera.position.lerp. The walk
// cycle is derived from the lerped position delta each frame (same derivation
// Player.update does from its velocity), so remote players still animate
// instead of gliding.
//
// V5 F1: built on the same createPlayerMesh() the local Player uses (was
// bare buildHumanoid(), so a puppet previously had no gun/pickaxe mesh at
// all to pose) — gunTip/gunGroup/pickaxeGroup/gunVariants mirror Player.ts,
// and setActiveWeaponVisual/triggerPickaxeSwing/updateWeaponPose reuse the
// exact same math so a peer's held gun and aim/swing animation look
// identical to their own screen.

// Aim-lean constants mirror Player's (private there, tiny enough to restate).
const AIM_LEAN_FACTOR = 0.14;
const AIM_LEAN_MAX = 0.12;
// A gap this large between puppet and target means a respawn/teleport, not
// movement — snap instead of gliding halfway across the island.
const SNAP_DISTANCE = 12;

// Weapon pose constants — identical values to Player.ts's private statics
// (kept in sync deliberately; small enough that duplicating beats exporting
// four magic numbers across an entity boundary).
const GUN_REST_ANGLE = 0.55;
const GUN_AIM_ANGLE = 0.05;
const PICKAXE_REST_ANGLE = -0.9;
const PICKAXE_STRIKE_ANGLE = 0.55;
const PICKAXE_SWING_DURATION = 0.32;

function skinById(skinId: string): CharacterSkin {
  return PLAYER_SKINS.find((s) => s.id === skinId) ?? PLAYER_SKINS[0];
}

export class RemotePlayer {
  group: THREE.Group;
  /** Muzzle-flash/tracer origin — see playerMesh.ts. Public so Game can spawn
   *  a remote shot's tracer/muzzle-flash from the right spot (V5 F1). */
  gunTip: THREE.Object3D;

  private humanoid: HumanoidBuild;
  private gunGroup: THREE.Group;
  private pickaxeGroup: THREE.Group;
  private gunVariants: Record<GunWeaponId, THREE.Group>;
  private gunTipOffsets: Record<GunWeaponId, number>;
  private shadow: THREE.Mesh;
  private skinId: string;
  private activeWeaponId: WeaponId = "blaster";
  private locomotionPhase = 0;
  private dead = false;
  private pickaxeSwingT = 1;
  private yaw = 0;
  private pitch = 0;

  constructor(scene: THREE.Scene, skinId: string, spawnPos: THREE.Vector3) {
    this.skinId = skinId;
    const { group, gunTip, gunGroup, pickaxeGroup, gunVariants, gunTipOffsets, humanoid } =
      createPlayerMesh(skinById(skinId));
    this.group = group;
    this.gunTip = gunTip;
    this.gunGroup = gunGroup;
    this.pickaxeGroup = pickaxeGroup;
    this.gunVariants = gunVariants;
    this.gunTipOffsets = gunTipOffsets;
    this.humanoid = humanoid;
    this.group.position.copy(spawnPos);
    scene.add(this.group);

    this.shadow = createBlobShadow(0.6);
    this.shadow.position.set(spawnPos.x, spawnPos.y + 0.03, spawnPos.z);
    scene.add(this.shadow);
  }

  /** Re-skins the puppet if the peer's `state` reports a different skinId
   *  (peers pick skins before playing, so in practice this fires once). */
  setSkin(skinId: string): void {
    if (skinId === this.skinId) return;
    this.skinId = skinId;
    applyHumanoidSkin(this.humanoid, skinById(skinId));
  }

  /** Shows the held mesh for the peer's actual equipped weapon — mirrors
   *  Player.setActiveWeaponVisual exactly (same gunTip repositioning per
   *  gun's muzzle length, so a remote sniper's tracer starts at its barrel
   *  tip, not its receiver). */
  setActiveWeaponVisual(id: WeaponId): void {
    if (id === this.activeWeaponId) return;
    this.activeWeaponId = id;
    const isMelee = WEAPON_DEFS[id].isMelee;
    this.pickaxeGroup.visible = isMelee;
    this.gunGroup.visible = !isMelee;
    if (!isMelee) {
      const gunId = id as GunWeaponId;
      for (const key of GUN_WEAPON_IDS) {
        this.gunVariants[key].visible = key === gunId;
      }
      this.gunTip.position.z = this.humanoid.rightHandAnchor.z - this.gunTipOffsets[gunId];
    }
  }

  /** Kicks off a one-shot pickaxe swing arc — called once per detected shots
   *  delta while the peer's active weapon is melee (see Game's
   *  spawnRemoteWeaponEffect). Mirrors Player.triggerPickaxeSwing. */
  triggerPickaxeSwing(): void {
    this.pickaxeSwingT = 0;
  }

  /** Dead peers are simply hidden until their next respawned `state`. */
  setDead(dead: boolean): void {
    if (dead === this.dead) return;
    this.dead = dead;
    this.group.visible = !dead;
    this.shadow.visible = !dead;
  }

  /** Current normalized aim direction, derived from the peer's last-received
   *  yaw/pitch — same formula as Player.aimDir's per-frame recompute. Lets
   *  Game aim a remote shot's cosmetic tracer along the peer's actual look
   *  direction (V5 F1). */
  aimDirection(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch) * -1,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch) * -1
    );
  }

  /** Called once per frame with the latest received transform — lerps toward
   *  it (Player.updateCamera's frame-rate-independent smoothing curve) and
   *  drives the walk cycle from how far the puppet actually moved. `firing`
   *  drives the gun raise/aim pose every frame, same as Player.updateWeaponPose
   *  (the discrete swing/tracer *events* are separately triggered from
   *  Game's shots-delta handling, not from this per-frame call). */
  applyNetworkState(pos: THREE.Vector3, yaw: number, pitch: number, firing: boolean, dt: number): void {
    this.yaw = yaw;
    this.pitch = pitch;

    if (this.group.position.distanceTo(pos) > SNAP_DISTANCE) {
      this.group.position.copy(pos);
    }

    const prevX = this.group.position.x;
    const prevZ = this.group.position.z;
    const smoothing = 1 - Math.pow(0.0008, dt);
    this.group.position.lerp(pos, smoothing);

    // Shortest-arc yaw lerp so a wrap from +PI to -PI doesn't spin the rig.
    let yawDelta = yaw - this.group.rotation.y;
    yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
    this.group.rotation.y += yawDelta * smoothing;

    // Walk cycle from the lerped movement (same speedT/strideHz derivation
    // as Player.update, just from position delta instead of velocity).
    const moved = Math.hypot(this.group.position.x - prevX, this.group.position.z - prevZ);
    const horizSpeed = dt > 0 ? moved / dt : 0;
    const maxSpeed = PLAYER_WALK_SPEED * PLAYER_SPRINT_MULT;
    const speedT = THREE.MathUtils.clamp(horizSpeed / maxSpeed, 0, 1);
    const strideHz = 1.7 + speedT * 1.6;
    this.locomotionPhase += dt * strideHz * Math.PI * 2;
    animateHumanoidLocomotion(this.humanoid, speedT, this.locomotionPhase, dt);

    // Same subtle aim-lean as the local player, from the peer's pitch.
    const leanTarget = THREE.MathUtils.clamp(pitch * AIM_LEAN_FACTOR, -AIM_LEAN_MAX, AIM_LEAN_MAX);
    this.humanoid.torsoMesh.rotation.x = THREE.MathUtils.lerp(
      this.humanoid.torsoMesh.rotation.x,
      leanTarget,
      Math.min(1, dt * 8)
    );

    // Gun raise/aim pose and pickaxe swing arc — identical math to
    // Player.updateWeaponPose, driven every frame from the peer's last
    // broadcast `firing` state.
    const targetGunAngle = firing ? GUN_AIM_ANGLE : GUN_REST_ANGLE;
    this.gunGroup.rotation.x = THREE.MathUtils.lerp(
      this.gunGroup.rotation.x,
      targetGunAngle,
      Math.min(1, dt * 12)
    );
    if (this.pickaxeSwingT < 1) {
      this.pickaxeSwingT = Math.min(1, this.pickaxeSwingT + dt / PICKAXE_SWING_DURATION);
    }
    const swingArc = Math.sin(this.pickaxeSwingT * Math.PI);
    this.pickaxeGroup.rotation.x = PICKAXE_REST_ANGLE + (PICKAXE_STRIKE_ANGLE - PICKAXE_REST_ANGLE) * swingArc;

    this.shadow.position.set(this.group.position.x, this.group.position.y + 0.03, this.group.position.z);
  }

  /** Removes the puppet (peer left). Geometries are module-shared in
   *  humanoid.ts/playerMesh.ts/blobShadow.ts — only the per-instance
   *  materials get freed. */
  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    scene.remove(this.shadow);
    this.humanoid.bodyMat.dispose();
    this.humanoid.headMat.dispose();
    this.humanoid.helmetMat.dispose();
    (this.shadow.material as THREE.Material).dispose();
  }
}
