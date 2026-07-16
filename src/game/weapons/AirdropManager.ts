import * as THREE from "three";
import {
  WORLD_RADIUS,
  AIRDROP_MIN_INTERVAL,
  AIRDROP_MAX_INTERVAL,
  AIRDROP_FALL_SPEED,
  AIRDROP_SPAWN_HEIGHT,
  AIRDROP_PICKUP_RADIUS,
} from "../core/constants";
import { World } from "../world/World";
import { Player } from "../entities/Player";
import { WeaponSystem } from "./WeaponSystem";
import { ParticleSystem } from "./ParticleSystem";
import { AudioManager } from "../core/AudioManager";
import { AIRDROP_WEAPON_POOL, WEAPON_DEFS } from "./weaponDefs";

const crateGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
const crateMat = new THREE.MeshLambertMaterial({ color: 0xd4a24c });
const chuteGeo = new THREE.PlaneGeometry(2.6, 2.6);
const chuteMat = new THREE.MeshLambertMaterial({
  color: 0xff5555,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.9,
});
const beaconGeo = new THREE.CylinderGeometry(0.35, 0.35, 6, 8, 1, true);
const beaconMat = new THREE.MeshBasicMaterial({
  color: 0xffd166,
  transparent: true,
  opacity: 0.35,
  side: THREE.DoubleSide,
  depthWrite: false,
});

type DropState = "falling" | "landed";

interface Crate {
  group: THREE.Group;
  chute: THREE.Mesh;
  beacon: THREE.Mesh;
  state: DropState;
  targetY: number;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Periodically drops a supply crate carrying a random bonus weapon +
// ammo somewhere on the island. Visible from a distance via a light-beam
// beacon and a minimap ping; walking up to a landed crate auto-collects it.
export class AirdropManager {
  private crate: Crate | null = null;
  private nextSpawnAt: number;

  onPickup?: (weaponName: string, isNew: boolean) => void;

  constructor(private scene: THREE.Scene, private world: World) {
    this.nextSpawnAt = performance.now() / 1000 + randomRange(8, 16);
  }

  get activePosition(): THREE.Vector3 | null {
    return this.crate ? this.crate.group.position : null;
  }

  private spawnCrate(safeZoneCenter: THREE.Vector3, safeZoneRadius: number): void {
    const angle = Math.random() * Math.PI * 2;
    // Stay inside the current safe zone (with a margin so a crate never lands
    // right on the fence) — capped by the original world-scale spread too, so
    // early game (zone still ~full size) keeps its old, wider distribution.
    const maxR = Math.min(WORLD_RADIUS * 0.75, safeZoneRadius * 0.85);
    const r = Math.random() * maxR;
    const x = safeZoneCenter.x + Math.cos(angle) * r;
    const z = safeZoneCenter.z + Math.sin(angle) * r;
    const groundY = this.world.getHeightAt(x, z);

    const group = new THREE.Group();
    const box = new THREE.Mesh(crateGeo, crateMat);
    group.add(box);

    const chute = new THREE.Mesh(chuteGeo, chuteMat);
    chute.position.y = 2.2;
    chute.rotation.x = Math.PI / 2;
    group.add(chute);

    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.y = 3;
    group.add(beacon);

    group.position.set(x, groundY + AIRDROP_SPAWN_HEIGHT, z);
    this.scene.add(group);

    this.crate = { group, chute, beacon, state: "falling", targetY: groundY + 0.6 };
  }

  private removeCrate(): void {
    if (!this.crate) return;
    this.scene.remove(this.crate.group);
    this.crate = null;
  }

  update(
    dt: number,
    nowSec: number,
    player: Player,
    weaponSystem: WeaponSystem,
    particles: ParticleSystem,
    audio: AudioManager,
    safeZoneCenter: THREE.Vector3,
    safeZoneRadius: number
  ): void {
    if (!this.crate) {
      if (nowSec >= this.nextSpawnAt) this.spawnCrate(safeZoneCenter, safeZoneRadius);
      return;
    }

    const crate = this.crate;

    if (crate.state === "falling") {
      crate.group.position.y -= AIRDROP_FALL_SPEED * dt;
      crate.group.rotation.y += dt * 1.5;
      if (crate.group.position.y <= crate.targetY) {
        crate.group.position.y = crate.targetY;
        crate.state = "landed";
        crate.chute.visible = false;
        particles.burst(crate.group.position, new THREE.Color(0xd4a24c), 14, 4, 1, 8, 0.5);
        audio.airdropLand();
      }
      return;
    }

    crate.beacon.rotation.y += dt * 0.4;
    crate.group.children[0].rotation.y += dt * 0.6;

    const dist = crate.group.position.distanceTo(player.position);
    if (dist < AIRDROP_PICKUP_RADIUS) {
      const weaponId = AIRDROP_WEAPON_POOL[Math.floor(Math.random() * AIRDROP_WEAPON_POOL.length)];
      const result = weaponSystem.pickupWeapon(weaponId);
      particles.burst(crate.group.position, new THREE.Color(WEAPON_DEFS[weaponId].color), 16, 4.5, 1, 4, 0.5);
      audio.pickupWeapon();
      this.onPickup?.(result.weaponName, result.isNew);
      this.removeCrate();
      this.nextSpawnAt = nowSec + randomRange(AIRDROP_MIN_INTERVAL, AIRDROP_MAX_INTERVAL);
    }
  }
}
