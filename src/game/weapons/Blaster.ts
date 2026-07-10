import * as THREE from "three";
import {
  WEAPON_RANGE,
  WEAPON_DAMAGE,
  WEAPON_CLIP_SIZE,
  WEAPON_FIRE_RATE,
  WEAPON_RELOAD_TIME,
  WEAPON_RESERVE_MAX,
  WEAPON_RESERVE_REGEN,
} from "../core/constants";
import type { HitUserData } from "../core/types";
import { World } from "../world/World";
import { BotManager } from "../entities/BotManager";
import { Player } from "../entities/Player";
import { ParticleSystem } from "./ParticleSystem";
import { AudioManager } from "../core/AudioManager";

const TRACER_POOL_SIZE = 8;
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

export interface HitFeedback {
  killedBot: boolean;
  hitBot: boolean;
  harvested: number;
}

export class Blaster {
  ammo = WEAPON_CLIP_SIZE;
  reserve = WEAPON_RESERVE_MAX;
  reloading = false;
  private reloadTimer = 0;
  private cooldown = 0;
  private raycaster = new THREE.Raycaster();
  private tracers: Tracer[] = [];

  onHitBot?: () => void;
  onKillBot?: () => void;
  onFire?: () => void;

  constructor(private scene: THREE.Scene) {
    this.raycaster.far = WEAPON_RANGE;
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

  private updateTracers(dt: number): void {
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.life -= dt;
      const mat = t.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, t.life / 0.08) * 0.85;
      if (t.life <= 0) t.active = false;
    }
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
    this.reserve = Math.min(WEAPON_RESERVE_MAX, this.reserve + WEAPON_RESERVE_REGEN * dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        const need = WEAPON_CLIP_SIZE - this.ammo;
        const take = Math.min(need, Math.floor(this.reserve));
        this.ammo += take;
        this.reserve -= take;
      }
      return;
    }

    if (this.ammo <= 0) {
      this.startReload(audio);
      return;
    }

    if (fireHeld && this.cooldown <= 0) {
      this.cooldown = 1 / WEAPON_FIRE_RATE;
      this.fire(camera, world, botManager, particles, audio, player);
    }
  }

  private startReload(audio: AudioManager): void {
    if (this.reserve < 1) return;
    this.reloading = true;
    this.reloadTimer = WEAPON_RELOAD_TIME;
    audio.reload();
  }

  requestReload(audio: AudioManager): void {
    if (!this.reloading && this.ammo < WEAPON_CLIP_SIZE) this.startReload(audio);
  }

  private fire(
    camera: THREE.PerspectiveCamera,
    world: World,
    botManager: BotManager,
    particles: ParticleSystem,
    audio: AudioManager,
    player: Player
  ): void {
    this.ammo--;
    this.onFire?.();
    audio.shoot();

    const gunTipWorld = new THREE.Vector3();
    player.gunTip.getWorldPosition(gunTipWorld);

    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this.raycaster.set(origin, dir);

    particles.burst(gunTipWorld, COLOR_MUZZLE, 4, 2.5, 0.5, 1, 0.1);

    const targets = [...world.raycastTargets, ...botManager.raycastTargets];
    const hits = this.raycaster.intersectObjects(targets, false);

    let hitPoint: THREE.Vector3 | null = null;

    for (const hit of hits) {
      const ud = hit.object.userData as HitUserData;
      if (ud.kind === "bot") {
        if (ud.refId === undefined || !botManager.isAlive(ud.refId)) continue;
        hitPoint = hit.point;
        const killed = botManager.damage(ud.refId, WEAPON_DAMAGE);
        particles.burst(hit.point, COLOR_BLOOD, 12, 4.5, 1, 9, 0.4);
        this.onHitBot?.();
        if (killed) {
          audio.botKill();
          this.onKillBot?.();
        } else {
          audio.hitBot();
        }
        break;
      }

      if (ud.kind === "harvestable") {
        if (ud.refId === undefined) continue;
        const h = world.getHarvestable(ud.refId);
        if (!h || !h.alive) continue;
        hitPoint = hit.point;
        const gained = world.harvest(ud.refId);
        player.materials += gained;
        particles.burst(
          hit.point,
          h.kind === "tree" ? COLOR_WOOD : COLOR_STONE,
          10,
          3.5,
          1,
          6,
          0.4
        );
        audio.harvestHit();
        break;
      }

      // terrain / prop / wall — always a valid solid hit
      hitPoint = hit.point;
      particles.burst(hit.point, ud.kind === "terrain" ? COLOR_DUST : COLOR_SPARK, 7, 3, 0.9, 5, 0.3);
      audio.impact();
      break;
    }

    const endPoint = hitPoint ?? origin.clone().addScaledVector(dir, WEAPON_RANGE);
    this.spawnTracer(gunTipWorld, endPoint);
  }
}
