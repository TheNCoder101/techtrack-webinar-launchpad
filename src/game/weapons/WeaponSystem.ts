import * as THREE from "three";
import type { HitUserData } from "../core/types";
import { World } from "../world/World";
import { BotManager } from "../entities/BotManager";
import { Player } from "../entities/Player";
import { ParticleSystem } from "./ParticleSystem";
import { AudioManager } from "../core/AudioManager";
import {
  WEAPON_DEFS,
  WEAPON_SLOT_COUNT,
  PICKUP_SLOT_INDICES,
  type WeaponId,
  type WeaponDef,
} from "./weaponDefs";

const TRACER_POOL_SIZE = 16;
const COLOR_SPARK = new THREE.Color(0xffe08a);
const COLOR_MUZZLE = new THREE.Color(0xfff2b0);
const COLOR_BLOOD = new THREE.Color(0xff4d4d);
const COLOR_WOOD = new THREE.Color(0x8a5a2b);
const COLOR_STONE = new THREE.Color(0xaaaaaa);
const COLOR_DUST = new THREE.Color(0xcfc39a);

interface Tracer {
  line: THREE.Line;
  life: number;
  active: boolean;
}

export interface WeaponSlot {
  id: WeaponId | null;
  ammo: number;
  reserve: number;
  reloading: boolean;
  reloadTimer: number;
}

export interface PickupResult {
  slotIndex: number;
  isNew: boolean;
  weaponName: string;
}

function freshSlot(id: WeaponId | null, def: WeaponDef | null): WeaponSlot {
  return {
    id,
    ammo: def ? def.clipSize : 0,
    reserve: def ? def.reserveMax : 0,
    reloading: false,
    reloadTimer: 0,
  };
}

// Owns the player's 6-slot loadout (pickaxe + starter blaster always
// present, 4 pickup slots filled by airdrops) and dispatches firing logic
// per weapon type: melee swing, single hitscan, multi-pellet cone, and
// splash-on-hit for the heavy weapon.
export class WeaponSystem {
  slots: WeaponSlot[];
  activeSlotIndex = 1;

  private cooldown = 0;
  private raycaster = new THREE.Raycaster();
  private tracers: Tracer[] = [];
  // Merged [...world.raycastTargets, ...botManager.raycastTargets] array,
  // rebuilt only when World.raycastTargetsDirty is set (wall add/remove) —
  // instead of allocating a fresh array on every single shot/swing.
  private cachedTargets: THREE.Object3D[] = [];

  onHitBot?: () => void;
  onKillBot?: () => void;
  onSwitch?: (index: number) => void;
  onMeleeSwing?: () => void;

  constructor(private scene: THREE.Scene) {
    this.slots = new Array(WEAPON_SLOT_COUNT).fill(null).map((_, i) => {
      if (i === 0) return freshSlot("pickaxe", WEAPON_DEFS.pickaxe);
      if (i === 1) return freshSlot("blaster", WEAPON_DEFS.blaster);
      return freshSlot(null, null);
    });

    for (let i = 0; i < TRACER_POOL_SIZE; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: 0xfff4c2,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0, active: false });
    }
  }

  get activeSlot(): WeaponSlot {
    return this.slots[this.activeSlotIndex];
  }

  get activeDef(): WeaponDef | null {
    const id = this.activeSlot.id;
    return id ? WEAPON_DEFS[id] : null;
  }

  switchTo(index: number, audio: AudioManager): void {
    if (index < 0 || index >= this.slots.length) return;
    if (!this.slots[index].id) return;
    if (index === this.activeSlotIndex) return;
    this.activeSlotIndex = index;
    this.cooldown = Math.max(this.cooldown, 0.08);
    audio.switchWeapon();
    this.onSwitch?.(index);
  }

  /** Assigns a picked-up weapon to a slot, or tops up ammo if already owned. */
  pickupWeapon(id: WeaponId): PickupResult {
    const def = WEAPON_DEFS[id];
    const existingIndex = this.slots.findIndex((s) => s.id === id);
    if (existingIndex >= 0) {
      this.slots[existingIndex] = freshSlot(id, def);
      return { slotIndex: existingIndex, isNew: false, weaponName: def.name };
    }

    const emptyIndex = PICKUP_SLOT_INDICES.find((i) => this.slots[i].id === null);
    if (emptyIndex !== undefined) {
      this.slots[emptyIndex] = freshSlot(id, def);
      return { slotIndex: emptyIndex, isNew: true, weaponName: def.name };
    }

    const replaceIndex =
      PICKUP_SLOT_INDICES[Math.floor(Math.random() * PICKUP_SLOT_INDICES.length)];
    this.slots[replaceIndex] = freshSlot(id, def);
    return { slotIndex: replaceIndex, isNew: true, weaponName: def.name };
  }

  private startReload(slot: WeaponSlot, def: WeaponDef, audio: AudioManager): void {
    if (slot.reserve < 1) return;
    slot.reloading = true;
    slot.reloadTimer = def.reloadTime;
    audio.reload();
  }

  update(
    dt: number,
    fireHeld: boolean,
    camera: THREE.PerspectiveCamera,
    world: World,
    botManager: BotManager,
    particles: ParticleSystem,
    audio: AudioManager,
    player: Player
  ): void {
    this.updateTracers(dt);
    this.cooldown -= dt;

    const slot = this.activeSlot;
    const def = this.activeDef;
    if (!def) return;

    if (!def.isMelee && def.reserveRegenPerSec > 0) {
      slot.reserve = Math.min(def.reserveMax, slot.reserve + def.reserveRegenPerSec * dt);
    }

    if (slot.reloading) {
      slot.reloadTimer -= dt;
      if (slot.reloadTimer <= 0) {
        slot.reloading = false;
        const need = def.clipSize - slot.ammo;
        const take = Math.min(need, Math.floor(slot.reserve));
        slot.ammo += take;
        slot.reserve -= take;
      }
      return;
    }

    if (!def.isMelee && slot.ammo <= 0) {
      this.startReload(slot, def, audio);
      return;
    }

    if (fireHeld && this.cooldown <= 0) {
      this.cooldown = 1 / def.fireRate;
      if (def.isMelee) {
        this.swing(def, camera, world, botManager, particles, audio, player);
      } else {
        this.shoot(def, slot, camera, world, botManager, particles, audio, player);
      }
    }
  }

  requestReload(audio: AudioManager): void {
    const slot = this.activeSlot;
    const def = this.activeDef;
    if (!def || def.isMelee || slot.reloading || slot.ammo >= def.clipSize) return;
    this.startReload(slot, def, audio);
  }

  private updateTracers(dt: number): void {
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.life -= dt;
      const mat = t.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, t.life / 0.08) * 0.85;
      if (t.life <= 0) t.active = false;
    }
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const slot = this.tracers.find((t) => !t.active) ?? this.tracers[0];
    slot.active = true;
    slot.life = 0.08;
    const positions = slot.line.geometry.attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    (slot.line.material as THREE.LineBasicMaterial).opacity = 0.85;
  }

  private resolveHit(
    hit: THREE.Intersection,
    def: WeaponDef,
    world: World,
    botManager: BotManager,
    particles: ParticleSystem,
    audio: AudioManager,
    player: Player
  ): boolean {
    const ud = hit.object.userData as HitUserData;
    // Non-instanced hits (bots, walls, terrain) carry a plain `refId`.
    // InstancedMesh hits (trees, rocks) carry `refIds` indexed by the
    // raycast intersection's `instanceId`, resolved here so the rest of
    // this method's dispatch logic — and its external behavior (damage,
    // particles, audio) — is unchanged from the pre-instancing version.
    const refId = ud.refIds ? ud.refIds[hit.instanceId ?? -1] : ud.refId;

    if (ud.kind === "bot") {
      if (refId === undefined || !botManager.isAlive(refId)) return false;
      const killed = botManager.damage(refId, def.damage);
      particles.burst(hit.point, COLOR_BLOOD, 12, 4.5, 1, 9, 0.4);
      this.onHitBot?.();
      if (killed) {
        audio.botKill();
        this.onKillBot?.();
      } else {
        audio.hitBot();
      }
      this.applySplash(def, hit.point, refId, botManager, particles, audio);
      return true;
    }

    if (ud.kind === "harvestable") {
      if (refId === undefined) return false;
      const h = world.getHarvestable(refId);
      if (!h || !h.alive) return false;
      if (!def.canHarvest) {
        particles.burst(hit.point, COLOR_SPARK, 6, 3, 0.9, 5, 0.3);
        audio.impact();
        return true;
      }
      const gained = world.harvest(refId);
      player.materials += gained;
      particles.burst(hit.point, h.kind === "tree" ? COLOR_WOOD : COLOR_STONE, 10, 3.5, 1, 6, 0.4);
      audio.harvestHit();
      return true;
    }

    particles.burst(hit.point, ud.kind === "terrain" ? COLOR_DUST : COLOR_SPARK, 7, 3, 0.9, 5, 0.3);
    audio.impact();
    return true;
  }

  /** Returns the merged raycast target list, rebuilding it only when
   *  `world.raycastTargetsDirty` is set (BuildingManager wall add/remove).
   *  Previously this array was reallocated from scratch on every shot and
   *  every melee swing. */
  private getRaycastTargets(world: World, botManager: BotManager): THREE.Object3D[] {
    if (world.raycastTargetsDirty) {
      this.cachedTargets = [...world.raycastTargets, ...botManager.raycastTargets];
      world.raycastTargetsDirty = false;
    }
    return this.cachedTargets;
  }

  private applySplash(
    def: WeaponDef,
    center: THREE.Vector3,
    primaryRefId: number,
    botManager: BotManager,
    particles: ParticleSystem,
    audio: AudioManager
  ): void {
    if (def.splashRadius <= 0) return;
    for (const bot of botManager.bots) {
      if (!bot.alive || bot.id === primaryRefId) continue;
      const dist = bot.group.position.distanceTo(center);
      if (dist > def.splashRadius) continue;
      const falloff = 1 - dist / def.splashRadius;
      const splashDamage = def.damage * 0.6 * falloff;
      if (splashDamage < 1) continue;
      const killed = botManager.damage(bot.id, splashDamage);
      if (killed) audio.botKill();
    }
    particles.burst(center, new THREE.Color(0xffaa55), 14, 5, 1, 3, 0.5);
  }

  private shoot(
    def: WeaponDef,
    slot: WeaponSlot,
    camera: THREE.PerspectiveCamera,
    world: World,
    botManager: BotManager,
    particles: ParticleSystem,
    audio: AudioManager,
    player: Player
  ): void {
    slot.ammo--;
    audio.shoot();

    const gunTipWorld = new THREE.Vector3();
    player.gunTip.getWorldPosition(gunTipWorld);

    const origin = camera.position.clone();
    const baseDir = new THREE.Vector3();
    camera.getWorldDirection(baseDir);

    particles.burst(gunTipWorld, COLOR_MUZZLE, 4, 2.5, 0.5, 1, 0.1);

    const targets = this.getRaycastTargets(world, botManager);
    this.raycaster.far = def.range;

    for (let p = 0; p < def.pellets; p++) {
      const dir = baseDir.clone();
      if (def.spread > 0) {
        const yaw = (Math.random() - 0.5) * 2 * def.spread;
        const pitch = (Math.random() - 0.5) * 2 * def.spread;
        const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, dir).normalize();
        dir.addScaledVector(right, yaw).addScaledVector(up, pitch).normalize();
      }

      this.raycaster.set(origin, dir);
      const hits = this.raycaster.intersectObjects(targets, false);

      let hitPoint: THREE.Vector3 | null = null;
      for (const hit of hits) {
        if (this.resolveHit(hit, def, world, botManager, particles, audio, player)) {
          hitPoint = hit.point;
          break;
        }
      }

      const endPoint = hitPoint ?? origin.clone().addScaledVector(dir, def.range);
      this.spawnTracer(gunTipWorld, endPoint);
    }
  }

  private swing(
    def: WeaponDef,
    camera: THREE.PerspectiveCamera,
    world: World,
    botManager: BotManager,
    particles: ParticleSystem,
    audio: AudioManager,
    player: Player
  ): void {
    audio.pickaxeSwing();
    this.onMeleeSwing?.();

    // Melee range is short (~3 units), so the ray must start at the player's
    // body, not the camera — the camera sits ~5.5 units behind the player
    // (CAMERA_DISTANCE), which alone exceeds the swing's reach.
    const origin = player.eyePos.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this.raycaster.set(origin, dir);
    this.raycaster.far = def.range;

    const targets = this.getRaycastTargets(world, botManager);
    const hits = this.raycaster.intersectObjects(targets, false);

    for (const hit of hits) {
      if (this.resolveHit(hit, def, world, botManager, particles, audio, player)) break;
    }
  }
}
