import * as THREE from "three";
import { BOT_MAX_HP, BOT_WANDER_SPEED, BOT_RESPAWN_TIME, WORLD_RADIUS } from "../core/constants";
import { World } from "../world/World";
import { createBlobShadow } from "../world/blobShadow";
import { randomEnemySkin, type CharacterSkin } from "./skinDefs";
import { buildHumanoid, applyHumanoidSkin, type HumanoidBuild } from "./humanoid";

const ATTACK_RANGE = 2.3;
const ATTACK_COOLDOWN = 1.4;
const ATTACK_DAMAGE = 8;
const AGGRO_RANGE = 22;

export class Bot {
  id: number;
  group: THREE.Group;
  shadow: THREE.Mesh;

  private humanoid: HumanoidBuild;
  private baseBodyColor = new THREE.Color();
  private baseHeadColor = new THREE.Color();

  hp = BOT_MAX_HP;
  alive = true;
  respawnAt = 0;
  wanderTarget = new THREE.Vector3();
  wanderTimer = 0;
  attackCooldown = 0;
  hitFlashUntil = 0;

  constructor(id: number, scene: THREE.Scene) {
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

    let moveTarget: THREE.Vector3;
    if (distToPlayer < AGGRO_RANGE) {
      moveTarget = playerPos;
      if (distToPlayer < ATTACK_RANGE) {
        if (this.attackCooldown <= 0) {
          this.attackCooldown = ATTACK_COOLDOWN;
          onAttack(ATTACK_DAMAGE);
        }
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) this.pickWanderTarget();
      moveTarget = this.wanderTarget;
    }

    const toTarget = new THREE.Vector3().subVectors(moveTarget, pos);
    toTarget.y = 0;
    const dist = toTarget.length();
    if (dist > 0.4) {
      toTarget.normalize();
      const speed = distToPlayer < AGGRO_RANGE ? BOT_WANDER_SPEED * 1.7 : BOT_WANDER_SPEED;
      pos.x += toTarget.x * speed * dt;
      pos.z += toTarget.z * speed * dt;
      this.group.rotation.y = Math.atan2(toTarget.x, toTarget.z);
    }

    pos.y = world.getHeightAt(pos.x, pos.z);
    this.shadow.position.set(pos.x, pos.y + 0.03, pos.z);
  }
}
