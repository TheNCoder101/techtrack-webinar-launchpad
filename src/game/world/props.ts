import * as THREE from "three";

// Shared geometries/materials for InstancedMesh-based props. Each distinct
// visual part (tree trunk, tree leaves, rock, crate, shack wall, shack roof)
// is drawn as one THREE.InstancedMesh — one draw call for however many props
// of that kind are scattered, instead of the old one-Group-per-prop approach.
//
// Parts that had per-object color variance (leaf hue, rock shade, shack wall
// tint) keep a white base material color and get their real color written
// per-instance via InstancedMesh.setColorAt, which the renderer multiplies
// against the base color — white * color === color, so this reproduces the
// original per-object MeshLambertMaterial variance exactly.

const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 3, 6);
const leafGeo = new THREE.ConeGeometry(1.5, 2.4, 7);
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const crateGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
const roofGeo = new THREE.ConeGeometry(3.6, 2.2, 4);
const wallGeo = new THREE.BoxGeometry(4.4, 3, 3.6);

const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const crateMat = new THREE.MeshLambertMaterial({ color: 0xa9793f });
const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a3b2b });
const shackWallMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

/** Local (pre-instance-anchor) transform for one instanced part. */
export interface PartTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export interface TreeMeshes {
  trunk: THREE.InstancedMesh;
  /** Capacity is 3x the tree count — one instance per leaf tier per tree. */
  leaves: THREE.InstancedMesh;
}

export interface ShackMeshes {
  wall: THREE.InstancedMesh;
  roof: THREE.InstancedMesh;
}

export function createTreeInstancedMeshes(capacity: number): TreeMeshes {
  const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(capacity, 1));
  trunk.count = 0;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, Math.max(capacity * 3, 1));
  leaves.count = 0;
  return { trunk, leaves };
}

export function createRockInstancedMesh(capacity: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(capacity, 1));
  mesh.count = 0;
  return mesh;
}

export function createCrateInstancedMesh(capacity: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(crateGeo, crateMat, Math.max(capacity, 1));
  mesh.count = 0;
  return mesh;
}

export function createShackInstancedMeshes(capacity: number): ShackMeshes {
  const wall = new THREE.InstancedMesh(wallGeo, shackWallMat, Math.max(capacity, 1));
  wall.count = 0;
  const roof = new THREE.InstancedMesh(roofGeo, roofMat, Math.max(capacity, 1));
  roof.count = 0;
  return { wall, roof };
}

export interface TreeLayout {
  trunk: PartTransform;
  leaves: PartTransform[];
  leafColor: THREE.Color;
}

/** Randomized per-tree local layout, matching the old createTree() shape. */
export function makeTreeLayout(): TreeLayout {
  const trunk: PartTransform = {
    position: new THREE.Vector3(0, 1.5, 0),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
  };

  const greenHue = 0.28 + Math.random() * 0.06;
  const leafColor = new THREE.Color().setHSL(greenHue, 0.45, 0.32 + Math.random() * 0.08);

  const tiers = 3;
  const leaves: PartTransform[] = [];
  for (let i = 0; i < tiers; i++) {
    const s = 1 - i * 0.22;
    leaves.push({
      position: new THREE.Vector3(0, 3.1 + i * 1.15, 0),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(s, s, s),
    });
  }

  return { trunk, leaves, leafColor };
}

export interface RockLayout extends PartTransform {
  color: THREE.Color;
}

/** Randomized per-rock local layout, matching the old createRock() shape. */
export function makeRockLayout(): RockLayout {
  const shade = 0.42 + Math.random() * 0.15;
  const color = new THREE.Color(shade * 0.55, shade * 0.55, shade * 0.6);
  const scale = new THREE.Vector3(
    0.7 + Math.random() * 0.9,
    0.55 + Math.random() * 0.7,
    0.7 + Math.random() * 0.9
  );
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
  );
  const position = new THREE.Vector3(0, scale.y * 0.4, 0);
  return { position, quaternion, scale, color };
}

/** Randomized per-crate local layout, matching the old createCrate() shape. */
export function makeCrateLayout(): PartTransform {
  return {
    position: new THREE.Vector3(0, 0.55, 0),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0)),
    scale: new THREE.Vector3(1, 1, 1),
  };
}

export interface ShackLayout {
  wall: PartTransform & { color: THREE.Color };
  roof: PartTransform;
}

/** Randomized per-shack local layout, matching the old createShack() shape. */
export function makeShackLayout(): ShackLayout {
  const wallColor = new THREE.Color().setHSL(0.09, 0.25, 0.42 + Math.random() * 0.08);
  return {
    wall: {
      position: new THREE.Vector3(0, 1.5, 0),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
      color: wallColor,
    },
    roof: {
      position: new THREE.Vector3(0, 4.1, 0),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
      scale: new THREE.Vector3(1, 1, 1),
    },
  };
}
