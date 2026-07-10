import * as THREE from "three";

// Flat cylindrical collider used for simple push-out collision against
// trees, rocks, crates and placed walls (height is ignored — good enough
// for an open free-roam island at v1 scope).
export interface Collider {
  position: THREE.Vector3;
  radius: number;
  removable?: boolean;
}

export type HarvestKind = "tree" | "rock";

export interface Harvestable {
  kind: HarvestKind;
  group: THREE.Group;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAt: number;
  collider: Collider;
  basePosition: THREE.Vector3;
}

// Attached as mesh.userData so a single raycast against a flat list of
// meshes can dispatch to the right handler.
export interface HitUserData {
  kind: "bot" | "harvestable" | "wall" | "terrain" | "prop";
  refId?: number;
}

// Contract InputManager fulfills and Player/Game consume, kept separate so
// the two modules don't need to import each other directly.
export interface PlayerInput {
  moveX: number;
  moveY: number;
  fireHeld: boolean;
  consumeLook(): { dx: number; dy: number };
  consumeJump(): boolean;
  consumeBuild(): boolean;
}
