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

// One piece of a harvestable's visual representation living inside a shared
// THREE.InstancedMesh (a tree = 1 trunk instance + 3 leaf-tier instances; a
// rock = 1 instance). `base*` are the part's local transform relative to the
// harvestable's world anchor (`Harvestable.basePosition`) at full health —
// World.setHarvestableScale recomposes position/scale from these each time
// health changes, replacing the old group-level `scale.set(s,s,s)`.
export interface HarvestablePart {
  mesh: THREE.InstancedMesh;
  instanceId: number;
  basePos: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  baseScale: THREE.Vector3;
}

export interface Harvestable {
  kind: HarvestKind;
  parts: HarvestablePart[];
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAt: number;
  collider: Collider;
  basePosition: THREE.Vector3;
}

// Attached as mesh.userData so a single raycast against a flat list of
// meshes/InstancedMeshes can dispatch to the right handler. Non-instanced
// hits (bots, walls, terrain) resolve via `refId` directly; InstancedMesh
// hits (trees, rocks) resolve via `refIds[intersection.instanceId]`.
export interface HitUserData {
  kind: "bot" | "harvestable" | "wall" | "terrain" | "prop";
  refId?: number;
  refIds?: number[];
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
