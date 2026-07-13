import * as THREE from "three";
import { WALL_COST, WALL_MAX_COUNT } from "../core/constants";
import type { Collider } from "../core/types";
import { World } from "../world/World";
import { Player } from "../entities/Player";
import { AudioManager } from "../core/AudioManager";

const wallGeo = new THREE.BoxGeometry(3.2, 3, 0.35);
const wallMat = new THREE.MeshLambertMaterial({ color: 0xb08d57 });

interface PlacedWall {
  mesh: THREE.Mesh;
  collider: Collider;
}

// The core Fortnite-flavored loop: harvest trees/rocks with the blaster,
// then spend materials to drop a defensive wall in front of the player,
// snapped to a neat facing so structures line up.
export class BuildingManager {
  private walls: PlacedWall[] = [];

  constructor(private scene: THREE.Scene, private world: World) {}

  tryBuild(player: Player, audio: AudioManager): boolean {
    if (player.materials < WALL_COST) return false;

    player.materials -= WALL_COST;

    const snappedYaw = Math.round(player.yaw / (Math.PI / 2)) * (Math.PI / 2);
    const forward = new THREE.Vector3(-Math.sin(snappedYaw), 0, -Math.cos(snappedYaw));
    const pos = player.position.clone().addScaledVector(forward, 2.6);
    pos.y = this.world.getHeightAt(pos.x, pos.z) + 1.5;

    const mesh = new THREE.Mesh(wallGeo, wallMat);
    mesh.position.copy(pos);
    mesh.rotation.y = snappedYaw;
    // Inert unless a quality tier enables shadow mapping (none do by default).
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { kind: "wall" };
    this.scene.add(mesh);
    this.world.raycastTargets.push(mesh);
    this.world.raycastTargetsDirty = true;

    const collider: Collider = {
      position: new THREE.Vector3(pos.x, pos.y, pos.z),
      radius: 1.6,
      removable: true,
    };
    this.world.colliders.push(collider);

    this.walls.push({ mesh, collider });
    audio.build();

    if (this.walls.length > WALL_MAX_COUNT) {
      const old = this.walls.shift()!;
      this.removeWall(old);
    }

    return true;
  }

  private removeWall(wall: PlacedWall): void {
    this.scene.remove(wall.mesh);
    const ci = this.world.colliders.indexOf(wall.collider);
    if (ci >= 0) this.world.colliders.splice(ci, 1);
    const ti = this.world.raycastTargets.indexOf(wall.mesh);
    if (ti >= 0) this.world.raycastTargets.splice(ti, 1);
    this.world.raycastTargetsDirty = true;
  }
}
