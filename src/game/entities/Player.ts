import * as THREE from "three";
import {
  GRAVITY,
  PLAYER_RADIUS,
  PLAYER_EYE_HEIGHT,
  PLAYER_WALK_SPEED,
  PLAYER_SPRINT_MULT,
  PLAYER_JUMP_SPEED,
  CAMERA_DISTANCE,
  CAMERA_HEIGHT,
  CAMERA_MIN_PITCH,
  CAMERA_MAX_PITCH,
  LOOK_SENSITIVITY,
  WORLD_RADIUS,
} from "../core/constants";
import type { PlayerInput } from "../core/types";
import { World } from "../world/World";
import { createPlayerMesh } from "./playerMesh";
import { createBlobShadow } from "../world/blobShadow";
import { PLAYER_SKINS, type CharacterSkin } from "./skinDefs";
import { animateHumanoidLocomotion, type HumanoidBuild } from "./humanoid";

export class Player {
  group: THREE.Group;
  gunTip: THREE.Object3D;
  private gunGroup: THREE.Group;
  private pickaxeGroup: THREE.Group;
  private humanoid: HumanoidBuild;
  position: THREE.Vector3;
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0.06;
  grounded = false;
  sprinting = false;

  health = 100;
  maxHealth = 100;
  materials = 40;
  invulnerableUntil = 0;
  dead = false;

  aimDir = new THREE.Vector3(0, 0, -1);
  eyePos = new THREE.Vector3();

  private shadow: THREE.Mesh;

  private pickaxeSwingT = 1;
  private static readonly PICKAXE_REST_ANGLE = -0.9;
  private static readonly PICKAXE_STRIKE_ANGLE = 0.55;
  private static readonly PICKAXE_SWING_DURATION = 0.32;
  private static readonly GUN_REST_ANGLE = 0.55;
  private static readonly GUN_AIM_ANGLE = 0.05;

  private locomotionPhase = 0;
  private landingSquashT = 1;
  private static readonly LANDING_SQUASH_DURATION = 0.16;
  private static readonly LANDING_SQUASH_AMOUNT = 0.16;
  private static readonly AIM_LEAN_FACTOR = 0.14;
  private static readonly AIM_LEAN_MAX = 0.12;

  onDamaged?: () => void;
  onDeath?: () => void;

  /** Multiplier applied on top of the base LOOK_SENSITIVITY constant, from GameSettings. */
  private lookSensitivity: number;

  constructor(scene: THREE.Scene, skin: CharacterSkin = PLAYER_SKINS[0], lookSensitivity = 1) {
    this.lookSensitivity = lookSensitivity;
    const { group, gunTip, gunGroup, pickaxeGroup, humanoid } = createPlayerMesh(skin);
    this.group = group;
    this.gunTip = gunTip;
    this.gunGroup = gunGroup;
    this.pickaxeGroup = pickaxeGroup;
    this.humanoid = humanoid;
    this.position = group.position;
    this.position.set(0, 1, 4);
    scene.add(group);

    this.shadow = createBlobShadow(0.6);
    scene.add(this.shadow);
  }

  takeDamage(amount: number, nowSec: number): void {
    if (this.dead || nowSec < this.invulnerableUntil) return;
    this.health -= amount;
    this.onDamaged?.();
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.onDeath?.();
    }
  }

  /** Restores health (apple-tree harvest bites), clamped to maxHealth. */
  heal(amount: number): void {
    if (this.dead) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  respawn(nowSec: number, world: World): void {
    this.dead = false;
    this.health = this.maxHealth;
    this.invulnerableUntil = nowSec + 2.5;
    this.position.set(0, 0, 4);
    this.position.y = world.getHeightAt(0, 4) + 0.1;
    this.velocity.set(0, 0, 0);
  }

  setActiveWeaponVisual(isMelee: boolean): void {
    this.pickaxeGroup.visible = isMelee;
    this.gunGroup.visible = !isMelee;
  }

  /** Kicks off a one-shot swing arc; called each time the pickaxe actually connects/swings. */
  triggerPickaxeSwing(): void {
    this.pickaxeSwingT = 0;
  }

  /** Raises the gun toward an aiming pose while firing, and animates the pickaxe swing arc. */
  updateWeaponPose(dt: number, firing: boolean): void {
    const targetGunAngle = firing ? Player.GUN_AIM_ANGLE : Player.GUN_REST_ANGLE;
    this.gunGroup.rotation.x = THREE.MathUtils.lerp(
      this.gunGroup.rotation.x,
      targetGunAngle,
      Math.min(1, dt * 12)
    );

    if (this.pickaxeSwingT < 1) {
      this.pickaxeSwingT = Math.min(1, this.pickaxeSwingT + dt / Player.PICKAXE_SWING_DURATION);
    }
    const arc = Math.sin(this.pickaxeSwingT * Math.PI);
    this.pickaxeGroup.rotation.x =
      Player.PICKAXE_REST_ANGLE + (Player.PICKAXE_STRIKE_ANGLE - Player.PICKAXE_REST_ANGLE) * arc;
  }

  update(dt: number, input: PlayerInput, world: World): void {
    if (this.dead) return;

    const wasGrounded = this.grounded;

    const look = input.consumeLook();
    const sensitivity = LOOK_SENSITIVITY * this.lookSensitivity;
    this.yaw -= look.dx * sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - look.dy * sensitivity,
      CAMERA_MIN_PITCH,
      CAMERA_MAX_PITCH
    );

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const rawX = THREE.MathUtils.clamp(input.moveX, -1, 1);
    const rawY = THREE.MathUtils.clamp(input.moveY, -1, 1);
    const magnitude = Math.min(1, Math.hypot(rawX, rawY));

    this.sprinting = magnitude > 0.85;
    const speed = PLAYER_WALK_SPEED * (1 + (PLAYER_SPRINT_MULT - 1) * magnitude);

    const moveDir = new THREE.Vector3()
      .addScaledVector(forward, rawY)
      .addScaledVector(right, rawX);
    if (moveDir.lengthSq() > 1) moveDir.normalize();

    this.velocity.x = moveDir.x * speed;
    this.velocity.z = moveDir.z * speed;

    if (input.consumeJump() && this.grounded) {
      this.velocity.y = PLAYER_JUMP_SPEED;
      this.grounded = false;
    }
    this.velocity.y -= GRAVITY * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    for (const c of world.colliders) {
      const dx = this.position.x - c.position.x;
      const dz = this.position.z - c.position.z;
      const dist = Math.hypot(dx, dz);
      const minDist = c.radius + PLAYER_RADIUS;
      if (dist > 0.0001 && dist < minDist) {
        const push = (minDist - dist) / dist;
        this.position.x += dx * push;
        this.position.z += dz * push;
      }
    }

    const distFromCenter = Math.hypot(this.position.x, this.position.z);
    const boundary = WORLD_RADIUS * 0.93;
    if (distFromCenter > boundary) {
      const s = boundary / distFromCenter;
      this.position.x *= s;
      this.position.z *= s;
    }

    this.position.y += this.velocity.y * dt;
    const groundY = world.getHeightAt(this.position.x, this.position.z);
    if (this.position.y <= groundY) {
      this.position.y = groundY;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    if (!wasGrounded && this.grounded) {
      this.landingSquashT = 0;
    }

    this.group.rotation.y = this.yaw;
    this.shadow.position.set(this.position.x, groundY + 0.03, this.position.z);

    this.eyePos.set(this.position.x, this.position.y + PLAYER_EYE_HEIGHT, this.position.z);
    this.aimDir.set(
      Math.sin(this.yaw) * Math.cos(this.pitch) * -1,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch) * -1
    );

    // Walk-cycle: phase advances faster the closer the player is to max speed.
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const maxSpeed = PLAYER_WALK_SPEED * PLAYER_SPRINT_MULT;
    const speedT = THREE.MathUtils.clamp(horizSpeed / maxSpeed, 0, 1);
    const strideHz = 1.7 + speedT * 1.6;
    this.locomotionPhase += dt * strideHz * Math.PI * 2;
    animateHumanoidLocomotion(this.humanoid, speedT, this.locomotionPhase, dt);

    // Aim-lean: subtle torso tilt toward the current pitch (looking up leans
    // back, looking down leans forward).
    const leanTarget = THREE.MathUtils.clamp(
      this.pitch * Player.AIM_LEAN_FACTOR,
      -Player.AIM_LEAN_MAX,
      Player.AIM_LEAN_MAX
    );
    this.humanoid.torsoMesh.rotation.x = THREE.MathUtils.lerp(
      this.humanoid.torsoMesh.rotation.x,
      leanTarget,
      Math.min(1, dt * 8)
    );

    // Landing squash: a brief scale pulse on the false->true grounded transition.
    if (this.landingSquashT < 1) {
      this.landingSquashT = Math.min(1, this.landingSquashT + dt / Player.LANDING_SQUASH_DURATION);
    }
    const squashArc = Math.sin(Math.min(this.landingSquashT, 1) * Math.PI);
    const squashY = 1 - Player.LANDING_SQUASH_AMOUNT * squashArc;
    const squashXZ = 1 + Player.LANDING_SQUASH_AMOUNT * 0.5 * squashArc;
    this.group.scale.set(squashXZ, squashY, squashXZ);
  }

  updateCamera(camera: THREE.PerspectiveCamera, world: World, dt: number): void {
    const camDir = this.aimDir.clone().multiplyScalar(-1);
    const desired = this.eyePos.clone().addScaledVector(camDir, CAMERA_DISTANCE);
    desired.y += CAMERA_HEIGHT;

    const groundY = world.getHeightAt(desired.x, desired.z);
    desired.y = Math.max(desired.y, groundY + 0.5);

    const smoothing = 1 - Math.pow(0.0008, dt);
    camera.position.lerp(desired, smoothing);

    const lookTarget = this.eyePos.clone().addScaledVector(this.aimDir, 8);
    camera.lookAt(lookTarget);
  }
}
