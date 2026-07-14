// Data-driven catalog of placeable building pieces, mirroring the
// weaponDefs.ts pattern: adding a piece type is a data change here, not a
// code change in BuildingManager. Ramps are intentionally absent — they need
// a raycast-based ground extension the player controller doesn't have yet.

export type BuildPieceId = "wall" | "floor";

export interface BuildPieceDef {
  id: BuildPieceId;
  name: string;
  icon: string;
  /** Materials deducted from the player on placement. */
  materialCost: number;
  /** BoxGeometry dimensions in world units. */
  width: number;
  height: number;
  depth: number;
  /** Vertical offset from the terrain height to the mesh center. */
  yOffset: number;
  /** Distance in front of the player (along the snapped facing) the piece centers at. */
  forwardOffset: number;
  /** Flat cylindrical push-out collider radius (see core/types.ts Collider).
   *  0 = no collider — floors must stay walkable, not shove the player away. */
  colliderRadius: number;
  color: number;
}

export const BUILD_PIECE_DEFS: Record<BuildPieceId, BuildPieceDef> = {
  wall: {
    id: "wall",
    name: "Wall",
    icon: "🧱",
    materialCost: 20,
    width: 3.2,
    height: 3,
    depth: 0.35,
    yOffset: 1.5,
    forwardOffset: 2.6,
    colliderRadius: 1.6,
    color: 0xb08d57,
  },
  floor: {
    id: "floor",
    name: "Floor",
    icon: "🟫",
    materialCost: 12,
    width: 3.2,
    height: 0.2,
    depth: 3.2,
    yOffset: 0.12,
    forwardOffset: 3.0,
    colliderRadius: 0,
    color: 0x8f7346,
  },
};

/** Stable ordering for UI (the build piece picker). */
export const BUILD_PIECE_IDS: BuildPieceId[] = ["wall", "floor"];
