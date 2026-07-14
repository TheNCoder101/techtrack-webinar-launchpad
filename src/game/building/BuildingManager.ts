import * as THREE from "three";
import { WALL_MAX_COUNT } from "../core/constants";
import type { Collider } from "../core/types";
import { World } from "../world/World";
import { Player } from "../entities/Player";
import { AudioManager } from "../core/AudioManager";
import {
  BUILD_PIECE_DEFS,
  BUILD_PIECE_IDS,
  type BuildPieceDef,
  type BuildPieceId,
} from "./buildPieceDefs";

// One shared geometry + material per piece type, built once from the defs
// (same idea as the module-level wallGeo/wallMat this replaces, just data-driven).
const pieceGeos = {} as Record<BuildPieceId, THREE.BoxGeometry>;
const pieceMats = {} as Record<BuildPieceId, THREE.MeshLambertMaterial>;
for (const id of BUILD_PIECE_IDS) {
  const def = BUILD_PIECE_DEFS[id];
  pieceGeos[id] = new THREE.BoxGeometry(def.width, def.height, def.depth);
  pieceMats[id] = new THREE.MeshLambertMaterial({ color: def.color });
}

const GHOST_INVALID_COLOR = 0xef4444;

interface PlacedPiece {
  mesh: THREE.Mesh;
  /** null for pieces with no push-out collider (floors). */
  collider: Collider | null;
}

// The core Fortnite-flavored loop: harvest trees/rocks with the pickaxe, then
// spend materials on defensive pieces from BUILD_PIECE_DEFS. While the BUILD
// button is held, a semi-transparent ghost previews the snapped placement
// (red-tinted when unaffordable); releasing confirms via tryBuild.
export class BuildingManager {
  private pieces: PlacedPiece[] = [];
  private selectedId: BuildPieceId = "wall";

  private ghost: THREE.Mesh;
  private ghostMat: THREE.MeshLambertMaterial;

  constructor(private scene: THREE.Scene, private world: World) {
    this.ghostMat = new THREE.MeshLambertMaterial({
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.ghost = new THREE.Mesh(pieceGeos[this.selectedId], this.ghostMat);
    this.ghost.visible = false;
    scene.add(this.ghost);
  }

  get selectedPieceId(): BuildPieceId {
    return this.selectedId;
  }

  selectPiece(id: BuildPieceId): void {
    this.selectedId = id;
    this.ghost.geometry = pieceGeos[id];
  }

  /** Snap-to-grid placement shared by the preview ghost and tryBuild: yaw
   *  rounds to the nearest 90° so structures line up, the piece centers
   *  def.forwardOffset in front of the player, and sits on the analytic
   *  heightfield. */
  private computePlacement(player: Player, def: BuildPieceDef): { pos: THREE.Vector3; yaw: number } {
    const snappedYaw = Math.round(player.yaw / (Math.PI / 2)) * (Math.PI / 2);
    const forward = new THREE.Vector3(-Math.sin(snappedYaw), 0, -Math.cos(snappedYaw));
    const pos = player.position.clone().addScaledVector(forward, def.forwardOffset);
    pos.y = this.world.getHeightAt(pos.x, pos.z) + def.yOffset;
    return { pos, yaw: snappedYaw };
  }

  /** Called every frame; shows the ghost at the snapped placement while the
   *  BUILD button is held (red-tinted when the player can't afford the piece). */
  updatePreview(player: Player, buildHeld: boolean): void {
    if (!buildHeld) {
      this.ghost.visible = false;
      return;
    }
    const def = BUILD_PIECE_DEFS[this.selectedId];
    const { pos, yaw } = this.computePlacement(player, def);
    this.ghost.visible = true;
    this.ghost.position.copy(pos);
    this.ghost.rotation.y = yaw;
    this.ghostMat.color.setHex(
      player.materials >= def.materialCost ? def.color : GHOST_INVALID_COLOR
    );
  }

  tryBuild(player: Player, audio: AudioManager): boolean {
    this.ghost.visible = false;

    const def = BUILD_PIECE_DEFS[this.selectedId];
    if (player.materials < def.materialCost) return false;

    player.materials -= def.materialCost;

    const { pos, yaw } = this.computePlacement(player, def);

    const mesh = new THREE.Mesh(pieceGeos[def.id], pieceMats[def.id]);
    mesh.position.copy(pos);
    mesh.rotation.y = yaw;
    // Inert unless a quality tier enables shadow mapping (none do by default).
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // All placed pieces share the "wall" hit kind: WeaponSystem.resolveHit
    // treats them identically (spark burst + impact sound, bullets stop).
    mesh.userData = { kind: "wall" };
    this.scene.add(mesh);
    this.world.raycastTargets.push(mesh);
    this.world.raycastTargetsDirty = true;

    let collider: Collider | null = null;
    if (def.colliderRadius > 0) {
      collider = {
        position: new THREE.Vector3(pos.x, pos.y, pos.z),
        radius: def.colliderRadius,
        removable: true,
      };
      this.world.colliders.push(collider);
    }

    this.pieces.push({ mesh, collider });
    audio.build();

    if (this.pieces.length > WALL_MAX_COUNT) {
      const old = this.pieces.shift()!;
      this.removePiece(old);
    }

    return true;
  }

  private removePiece(piece: PlacedPiece): void {
    this.scene.remove(piece.mesh);
    if (piece.collider) {
      const ci = this.world.colliders.indexOf(piece.collider);
      if (ci >= 0) this.world.colliders.splice(ci, 1);
    }
    const ti = this.world.raycastTargets.indexOf(piece.mesh);
    if (ti >= 0) this.world.raycastTargets.splice(ti, 1);
    this.world.raycastTargetsDirty = true;
  }
}
