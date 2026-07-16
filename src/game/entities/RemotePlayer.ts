import * as THREE from "three";
import { PLAYER_WALK_SPEED, PLAYER_SPRINT_MULT } from "../core/constants";
import { createBlobShadow } from "../world/blobShadow";
import { PLAYER_SKINS, type CharacterSkin } from "./skinDefs";
import {
  buildHumanoid,
  applyHumanoidSkin,
  animateHumanoidLocomotion,
  type HumanoidBuild,
} from "./humanoid";

// A visual-only puppet for another human player in a co-op session. No local
// physics, no collision, no input — purely driven by incoming `state`
// messages: Game stores the latest received transform per peer and calls
// applyNetworkState every frame, which lerps toward it with the exact same
// smoothing technique as Player.updateCamera's camera.position.lerp. The walk
// cycle is derived from the lerped position delta each frame (same derivation
// Player.update does from its velocity), so remote players still animate
// instead of gliding. Built on the shared humanoid rig, identical to how
// Player.ts and Bot.ts already do it.

// Aim-lean constants mirror Player's (private there, tiny enough to restate).
const AIM_LEAN_FACTOR = 0.14;
const AIM_LEAN_MAX = 0.12;
// A gap this large between puppet and target means a respawn/teleport, not
// movement — snap instead of gliding halfway across the island.
const SNAP_DISTANCE = 12;

function skinById(skinId: string): CharacterSkin {
  return PLAYER_SKINS.find((s) => s.id === skinId) ?? PLAYER_SKINS[0];
}

export class RemotePlayer {
  group: THREE.Group;

  private humanoid: HumanoidBuild;
  private shadow: THREE.Mesh;
  private skinId: string;
  private locomotionPhase = 0;
  private dead = false;

  constructor(scene: THREE.Scene, skinId: string, spawnPos: THREE.Vector3) {
    this.skinId = skinId;
    this.humanoid = buildHumanoid(skinById(skinId));
    this.group = this.humanoid.group;
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

  /** Dead peers are simply hidden until their next respawned `state`. */
  setDead(dead: boolean): void {
    if (dead === this.dead) return;
    this.dead = dead;
    this.group.visible = !dead;
    this.shadow.visible = !dead;
  }

  /** Called once per frame with the latest received transform — lerps toward
   *  it (Player.updateCamera's frame-rate-independent smoothing curve) and
   *  drives the walk cycle from how far the puppet actually moved. */
  applyNetworkState(pos: THREE.Vector3, yaw: number, pitch: number, dt: number): void {
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

    this.shadow.position.set(this.group.position.x, this.group.position.y + 0.03, this.group.position.z);
  }

  /** Removes the puppet (peer left). Geometries are module-shared in
   *  humanoid.ts/blobShadow.ts — only the per-instance materials get freed. */
  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    scene.remove(this.shadow);
    this.humanoid.bodyMat.dispose();
    this.humanoid.headMat.dispose();
    this.humanoid.helmetMat.dispose();
    (this.shadow.material as THREE.Material).dispose();
  }
}
