import * as THREE from "three";
import { BLOOM_LAYER } from "../core/constants";
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
const COLOR_BLAST = new THREE.Color(0xffb347);
const COLOR_BLAST_CORE = new THREE.Color(0xfff0c0);

// --- V7 projectile tuning ---------------------------------------------------
// How far a projectile may advance per integration sub-step. At the grenade's
// 38 units/sec a single 50 ms frame is ~1.9 units of travel — comparable to a
// tree collider's radius — so integrating once per frame could step straight
// past the ground or through a prop. Sub-stepping to <=0.3 units bounds the
// worst-case overshoot well below every collider we test against.
const PROJECTILE_SUBSTEP_DIST = 0.3;
// Ceiling on sub-steps per frame, so a pathological dt spike (tab restore,
// GC pause) costs bounded work rather than thousands of iterations. The
// game already clamps dt; this is the belt-and-braces bound.
const PROJECTILE_MAX_SUBSTEPS = 16;
// Hard cap on simultaneous in-flight projectiles. With a 0.7/sec fire rate and
// flight times under 3 s, real play never exceeds ~3; this only guards against
// a runaway (e.g. a scripted test firing in a loop).
const MAX_PROJECTILES = 16;
// Bots are humanoids ~1.8 units tall standing on group.position (their feet).
// A projectile is treated as striking one when it enters a sphere at roughly
// torso height. Only decides WHERE the shell stops — the damage itself is
// applied by applySplash's radial falloff, so small errors here are cosmetic.
const BOT_CENTER_Y = 1.0;
const BOT_BODY_RADIUS = 0.55;
// world.colliders are XZ circles with no stored height (Bot/Player collision
// only ever tests them horizontally, since those entities are ground-bound).
// A projectile is NOT ground-bound, so testing XZ alone would detonate shells
// lobbed high over a rock. We treat each collider as a cylinder this tall
// above its anchor: enough to cover tree trunks, shack walls and built walls
// (so a flat shot into cover always detonates), while any lob of ~20 degrees
// or more clears it — which is exactly the "arc it over cover" play the
// weapon is for.
const PROP_HIT_HEIGHT = 3.6;

// Shared grenade geometry/material — one of each for every shell ever fired,
// matching how the rest of the codebase reuses geometry (unitBoxGeo etc.).
// Per-shell teardown therefore only removes the mesh from the scene; the
// geometry and material are process-lifetime singletons and must not be
// disposed with an individual projectile.
const projectileGeo = new THREE.SphereGeometry(1, 8, 6);
const projectileMat = new THREE.MeshLambertMaterial({ color: 0x2f3a2c, emissive: 0x1d3315 });

interface Tracer {
  line: THREE.Line;
  life: number;
  active: boolean;
}

/** One in-flight ballistic shell (V7). */
interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  /** The weapon that fired it — carries splashRadius/damage for detonation. */
  def: WeaponDef;
  /** Seconds until the guaranteed-detonation backstop fires. */
  fuse: number;
}

/** One bot caught in a splash, reported back to the caller of applySplash so
 *  it can drive presentation (HUD damage numbers, kill feedback). Returning
 *  this instead of firing callbacks inside applySplash keeps the hitscan
 *  splash weapon (heavy) byte-for-byte unchanged — it ignores the return. */
export interface SplashHit {
  botId: number;
  damage: number;
  killed: boolean;
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
  /** Monotonic count of every shot fired or melee swing taken (V5 F1) —
   *  incremented once per actual shoot()/swing() call, not once per pellet.
   *  Game broadcasts this in PeerStateMessage.shots so a receiving peer can
   *  diff Δshots and spawn exactly that many remote tracer/swing events,
   *  instead of sampling the `firing` boolean at 15Hz and silently missing
   *  taps that land between samples. */
  shotsFired = 0;

  private cooldown = 0;
  private raycaster = new THREE.Raycaster();
  private tracers: Tracer[] = [];
  /** V7: in-flight ballistic shells, stepped by updateProjectiles() exactly
   *  as tracers are stepped by updateTracers(). Empty for every weapon
   *  without a `projectile` block, i.e. always in a pre-V7 loadout. */
  private projectiles: Projectile[] = [];
  // Merged [...world.raycastTargets, ...botManager.raycastTargets] array,
  // rebuilt only when World.raycastTargetsDirty is set (wall add/remove) —
  // instead of allocating a fresh array on every single shot/swing.
  private cachedTargets: THREE.Object3D[] = [];

  /** Fired per landed hit with the damage dealt and whether it killed
   *  (drives the HUD's floating damage numbers — presentation only, the
   *  damage itself is applied by BotManager). */
  onHitBot?: (damage: number, killed: boolean) => void;
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
      // Tag tracers as selective-bloom sources for the optional postFX
      // pipeline (see ParticleSystem for the same pattern); inert by default.
      line.layers.enable(BLOOM_LAYER);
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
    // Deliberately before the `if (!def) return` guard below: a shell already
    // in the air must keep flying (and must still detonate) even if the
    // player switches to an empty slot mid-flight.
    this.updateProjectiles(dt, world, botManager, particles, audio);
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
      } else if (def.projectile) {
        this.launchProjectile(def, slot, particles, audio, player);
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
      this.onHitBot?.(def.damage, killed);
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
      const { materials, heal } = world.harvest(refId);
      player.materials += materials;
      // Apple trees only — regular trees and rocks always report heal: 0.
      if (heal > 0) player.heal(heal);
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

  /** Area damage with linear distance falloff, shared by the `heavy`
   *  hitscan weapon (splash around its direct hit) and the V7 grenade
   *  (splash IS the whole effect — it passes primaryRefId = -1 because a
   *  shell has no direct-hit bot to exclude).
   *
   *  Returns every bot it damaged so a caller that wants per-bot
   *  presentation can drive it; `heavy` ignores the return and so behaves
   *  exactly as it did before V7. */
  private applySplash(
    def: WeaponDef,
    center: THREE.Vector3,
    primaryRefId: number,
    botManager: BotManager,
    particles: ParticleSystem,
    audio: AudioManager
  ): SplashHit[] {
    const hits: SplashHit[] = [];
    if (def.splashRadius <= 0) return hits;
    for (const bot of botManager.bots) {
      if (!bot.alive || bot.id === primaryRefId) continue;
      const dist = bot.group.position.distanceTo(center);
      if (dist > def.splashRadius) continue;
      const falloff = 1 - dist / def.splashRadius;
      const splashDamage = def.damage * 0.6 * falloff;
      if (splashDamage < 1) continue;
      const killed = botManager.damage(bot.id, splashDamage);
      if (killed) audio.botKill();
      hits.push({ botId: bot.id, damage: splashDamage, killed });
    }
    particles.burst(center, new THREE.Color(0xffaa55), 14, 5, 1, 3, 0.5);
    return hits;
  }

  // --- V7 ballistic projectiles ---------------------------------------------

  /** Fires one shell along the player's pitch-aware aim vector. No raycast
   *  and no immediate resolution: everything else happens over the following
   *  frames in updateProjectiles(). Because the launch direction is just
   *  `player.aimDir * speed`, aim pitch alone decides the range — there is no
   *  charge mechanic and no separate short/long-range mode. */
  private launchProjectile(
    def: WeaponDef,
    slot: WeaponSlot,
    particles: ParticleSystem,
    audio: AudioManager,
    player: Player
  ): void {
    const spec = def.projectile;
    if (!spec) return;

    slot.ammo--;
    this.shotsFired++;
    audio.grenadeLaunch();

    const origin = new THREE.Vector3();
    player.gunTip.getWorldPosition(origin);
    particles.burst(origin, COLOR_MUZZLE, 6, 3, 0.6, 1, 0.14);

    // Degenerate guard only — see MAX_PROJECTILES. Drop the oldest silently
    // (no splash) rather than let the list grow without bound.
    if (this.projectiles.length >= MAX_PROJECTILES) {
      const stale = this.projectiles.shift();
      if (stale) this.scene.remove(stale.mesh);
    }

    const mesh = new THREE.Mesh(projectileGeo, projectileMat);
    mesh.scale.setScalar(spec.radius);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    // The shell is small and fast; letting the frustum test cull it can pop
    // it out of view at the edges of the screen mid-arc.
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      velocity: player.aimDir.clone().multiplyScalar(spec.speed),
      def,
      fuse: spec.fuseSeconds,
    });
  }

  /** Steps every in-flight shell. Mirrors updateTracers' lifecycle (advance,
   *  test, retire) and is called from update() right beside it.
   *
   *  Termination is guaranteed: each shell is tested against the ground, then
   *  bots, then world colliders, and finally against its own fuse, which
   *  detonates it unconditionally. No path lets a projectile survive past
   *  `fuseSeconds` or leave the list without being removed from the scene. */
  private updateProjectiles(
    dt: number,
    world: World,
    botManager: BotManager,
    particles: ParticleSystem,
    audio: AudioManager
  ): void {
    if (this.projectiles.length === 0) return;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const spec = p.def.projectile;
      if (!spec) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      p.fuse -= dt;

      // Sub-step so the per-step travel stays below collider scale (see
      // PROJECTILE_SUBSTEP_DIST) instead of teleporting a frame's worth of
      // motion in one go and tunnelling through the ground or a tree.
      const steps = Math.min(
        PROJECTILE_MAX_SUBSTEPS,
        Math.max(1, Math.ceil((p.velocity.length() * dt) / PROJECTILE_SUBSTEP_DIST))
      );
      const h = dt / steps;

      let detonated = false;
      for (let s = 0; s < steps; s++) {
        p.velocity.y -= spec.gravity * h;
        p.mesh.position.addScaledVector(p.velocity, h);
        const pos = p.mesh.position;

        // 1. Ground.
        const groundY = world.getHeightAt(pos.x, pos.z);
        if (pos.y - spec.radius <= groundY) {
          pos.y = groundY + spec.radius;
          detonated = true;
          break;
        }

        // 2. Bots.
        const reach = spec.radius + BOT_BODY_RADIUS;
        for (const bot of botManager.bots) {
          if (!bot.alive) continue;
          const bp = bot.group.position;
          const dx = pos.x - bp.x;
          const dy = pos.y - (bp.y + BOT_CENTER_Y);
          const dz = pos.z - bp.z;
          if (dx * dx + dy * dy + dz * dz <= reach * reach) {
            detonated = true;
            break;
          }
        }
        if (detonated) break;

        // 3. World colliders (trees, rocks, crates, shacks, built walls).
        for (const c of world.colliders) {
          if (pos.y > c.position.y + PROP_HIT_HEIGHT) continue;
          const dx = pos.x - c.position.x;
          const dz = pos.z - c.position.z;
          const r = c.radius + spec.radius;
          if (dx * dx + dz * dz <= r * r) {
            detonated = true;
            break;
          }
        }
        if (detonated) break;
      }

      // 4. Fuse backstop — an airburst if nothing else ever stopped it.
      if (!detonated && p.fuse <= 0) detonated = true;

      if (detonated) {
        this.detonateProjectile(p, botManager, particles, audio);
        this.projectiles.splice(i, 1);
      }
    }
  }

  /** Blows one shell up: removes it from the scene, plays the blast, and
   *  routes ALL of its damage through the shared applySplash falloff. */
  private detonateProjectile(
    p: Projectile,
    botManager: BotManager,
    particles: ParticleSystem,
    audio: AudioManager
  ): void {
    const center = p.mesh.position.clone();
    // Geometry/material are shared singletons — only the mesh is per-shell.
    this.scene.remove(p.mesh);

    audio.grenadeExplosion();
    particles.burst(center, COLOR_BLAST_CORE, 10, 3, 0.4, 1, 0.28);
    particles.burst(center, COLOR_BLAST, 26, 9, 1, 5, 0.65);

    // primaryRefId = -1: unlike `heavy` there is no directly-hit bot to
    // exclude, so every bot in radius is eligible — this is what lets one
    // shell kill a whole cluster.
    const hits = this.applySplash(p.def, center, -1, botManager, particles, audio);
    for (const hit of hits) {
      this.onHitBot?.(Math.round(hit.damage), hit.killed);
      if (hit.killed) this.onKillBot?.();
    }
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
    this.shotsFired++;
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
    this.shotsFired++;
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
