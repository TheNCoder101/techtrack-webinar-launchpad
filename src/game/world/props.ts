import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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

// V3 Track A4: a static top-lit/bottom-dark shade gradient baked into each
// prop geometry's *vertex* colors at module load — fake ambient occlusion
// that grounds every prop at zero runtime cost (the renderer multiplies
// vertexColor * materialColor * instanceColor, so the existing per-instance
// setColorAt tints are preserved exactly). One-time authoring change; no new
// draw calls, no per-frame work.
function bakeVerticalShade(
  geo: THREE.BufferGeometry,
  bottom: number,
  top: number
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const pos = geo.attributes.position;
  const span = Math.max(bb.max.y - bb.min.y, 1e-5);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / span;
    // Ease-out curve: the darkening concentrates near the ground contact,
    // reading as occlusion rather than a flat linear ramp.
    const s = bottom + (top - bottom) * Math.sqrt(t);
    colors[i * 3] = s;
    colors[i * 3 + 1] = s;
    colors[i * 3 + 2] = s;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

// V3 Track B4: deterministic per-vertex crag for rock variants. Radially
// scales each vertex by a pseudo-random amount hashed from its *position*
// (not its index), so the duplicated flat-shading vertices that share a
// position displace identically and the mesh never cracks. Authoring-time
// only, like bakeVerticalShade.
function cragify(geo: THREE.BufferGeometry, amount: number): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    const r = 1 + (h - Math.floor(h) - 0.5) * amount;
    pos.setXYZ(i, x * r, y * r, z * r);
  }
  geo.computeVertexNormals();
  return geo;
}

const trunkGeo = bakeVerticalShade(new THREE.CylinderGeometry(0.22, 0.32, 3, 6), 0.6, 1);
const leafGeo = bakeVerticalShade(new THREE.ConeGeometry(1.5, 2.4, 7), 0.66, 1.02);
const appleGeo = bakeVerticalShade(new THREE.SphereGeometry(0.22, 6, 5), 0.85, 1);
// V3 Track B4: 2-3 geometry variants per prop type — each variant is still
// one InstancedMesh (one draw call per variant), the scatter functions in
// World.ts pick a variant per placement, so the island stops reading as one
// shape copy-pasted with different scales.
// Rocks are instance-rotated on all three axes, so their object-space
// gradient lands at a random angle per rock — that turns this bake into
// per-face form variation rather than strict ground AO, which still breaks
// up the flat single-tone look. Kept gentle for that reason.
const rockGeos = [
  // A: the original clean icosahedron.
  bakeVerticalShade(new THREE.IcosahedronGeometry(1, 0), 0.8, 1),
  // B: cragged icosahedron — jagged outcrop.
  bakeVerticalShade(cragify(new THREE.IcosahedronGeometry(1, 0), 0.42), 0.8, 1),
  // C: squashed dodecahedron — flat slab boulder.
  bakeVerticalShade(new THREE.DodecahedronGeometry(1, 0).scale(1.15, 0.68, 1), 0.8, 1),
];
const crateGeos = [
  // A: the original cube crate.
  bakeVerticalShade(new THREE.BoxGeometry(1.1, 1.1, 1.1), 0.72, 1),
  // B: long low supply chest.
  bakeVerticalShade(new THREE.BoxGeometry(1.5, 0.85, 0.95), 0.72, 1),
  // C: 8-sided barrel.
  bakeVerticalShade(new THREE.CylinderGeometry(0.5, 0.5, 1.15, 8), 0.72, 1),
];
/** Rest height (half-height) per crate variant, used by makeCrateLayout. */
const CRATE_REST_Y = [0.55, 0.425, 0.575];
const roofGeos = [
  // A: the original steep pyramid roof.
  bakeVerticalShade(new THREE.ConeGeometry(3.6, 2.2, 4), 0.75, 1),
  // B: low-pitch wide roof over a taller, narrower hut.
  bakeVerticalShade(new THREE.ConeGeometry(3.3, 1.3, 4), 0.75, 1),
];
const wallGeos = [
  bakeVerticalShade(new THREE.BoxGeometry(4.4, 3, 3.6), 0.72, 1),
  bakeVerticalShade(new THREE.BoxGeometry(3.7, 3.5, 3.1), 0.72, 1),
];
export const ROCK_VARIANT_COUNT = rockGeos.length;
export const CRATE_VARIANT_COUNT = crateGeos.length;
export const SHACK_VARIANT_COUNT = roofGeos.length;

const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f, vertexColors: true });
const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
// White base + per-instance setColorAt, same trick as leaves/rocks — lets a
// single material serve both red and green apples.
const appleMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
const crateMat = new THREE.MeshLambertMaterial({ color: 0xa9793f, vertexColors: true });
// The barrel variant reads better a shade darker than the plank crates.
const barrelMat = new THREE.MeshLambertMaterial({ color: 0x8f6535, vertexColors: true });
const crateMats = [crateMat, crateMat, barrelMat];
const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a3b2b, vertexColors: true });
// Variant-B roofs get a slightly cooler slate tone for street-level variety.
const roofMatB = new THREE.MeshLambertMaterial({ color: 0x6e4a3a, vertexColors: true });
const roofMats = [roofMat, roofMatB];
const shackWallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });

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

/** Max apple instances per apple tree; sizes the apple mesh capacity. */
export const APPLES_PER_TREE_MAX = 4;

/** Capacity is APPLES_PER_TREE_MAX x the tree count — up to 4 fruit per
 *  apple tree (only ~25% of trees actually get any, the rest of the buffer
 *  simply stays unused below `count`). */
export function createAppleInstancedMesh(treeCapacity: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(appleGeo, appleMat, Math.max(treeCapacity * APPLES_PER_TREE_MAX, 1));
  mesh.count = 0;
  return mesh;
}

/** One InstancedMesh per rock variant. Each is allocated at full capacity —
 *  the variant split is random at scatter time, and the few KB of spare
 *  matrix buffer is cheaper than exact pre-counting. */
export function createRockInstancedMeshes(capacity: number): THREE.InstancedMesh[] {
  return rockGeos.map((geo) => {
    const mesh = new THREE.InstancedMesh(geo, rockMat, Math.max(capacity, 1));
    mesh.count = 0;
    return mesh;
  });
}

export function createCrateInstancedMeshes(capacity: number): THREE.InstancedMesh[] {
  return crateGeos.map((geo, i) => {
    const mesh = new THREE.InstancedMesh(geo, crateMats[i], Math.max(capacity, 1));
    mesh.count = 0;
    return mesh;
  });
}

export function createShackInstancedMeshes(capacity: number): ShackMeshes[] {
  return wallGeos.map((geo, i) => {
    const wall = new THREE.InstancedMesh(geo, shackWallMat, Math.max(capacity, 1));
    wall.count = 0;
    const roof = new THREE.InstancedMesh(roofGeos[i], roofMats[i], Math.max(capacity, 1));
    roof.count = 0;
    return { wall, roof };
  });
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

export interface AppleLayout extends PartTransform {
  color: THREE.Color;
}

/**
 * 2-4 apples parked on the surface of the tree's existing leaf-cone tiers so
 * they read as fruit sitting in the foliage. leafGeo is a cone of radius 1.5,
 * height 2.4, centered on the tier's position — an apple picks a tier, a
 * height fraction `t` in the wide lower half, and sits at that height's
 * surface radius (pushed out a hair so it pokes through the leaves).
 */
export function makeAppleLayouts(leaves: PartTransform[]): AppleLayout[] {
  const count = 2 + Math.floor(Math.random() * (APPLES_PER_TREE_MAX - 2 + 1));
  const apples: AppleLayout[] = [];
  for (let i = 0; i < count; i++) {
    const tier = leaves[Math.floor(Math.random() * leaves.length)];
    const t = 0.12 + Math.random() * 0.38;
    const surfaceR = 1.5 * (1 - t) * tier.scale.x * 1.06;
    const angle = Math.random() * Math.PI * 2;
    const position = new THREE.Vector3(
      tier.position.x + Math.cos(angle) * surfaceR,
      tier.position.y + (-1.2 + t * 2.4) * tier.scale.y,
      tier.position.z + Math.sin(angle) * surfaceR
    );
    // Mostly red, occasionally a green apple.
    const color =
      Math.random() < 0.8
        ? new THREE.Color().setHSL(Math.random() * 0.02, 0.85, 0.42)
        : new THREE.Color().setHSL(0.24, 0.7, 0.45);
    const s = 0.9 + Math.random() * 0.3;
    apples.push({
      position,
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(s, s, s),
      color,
    });
  }
  return apples;
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

/** Randomized per-crate local layout; rest height depends on the variant's
 *  geometry height (cube / low chest / barrel). */
export function makeCrateLayout(variant: number): PartTransform {
  return {
    position: new THREE.Vector3(0, CRATE_REST_Y[variant] ?? 0.55, 0),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0)),
    scale: new THREE.Vector3(1, 1, 1),
  };
}

export interface ShackLayout {
  wall: PartTransform & { color: THREE.Color };
  roof: PartTransform;
}

/** Wall center / roof center heights per shack variant (see wallGeos/roofGeos). */
const SHACK_WALL_Y = [1.5, 1.75];
const SHACK_ROOF_Y = [4.1, 4.15];

/** Randomized per-shack local layout for the given variant. */
export function makeShackLayout(variant: number): ShackLayout {
  const wallColor = new THREE.Color().setHSL(0.09, 0.25, 0.42 + Math.random() * 0.08);
  return {
    wall: {
      position: new THREE.Vector3(0, SHACK_WALL_Y[variant] ?? 1.5, 0),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
      color: wallColor,
    },
    roof: {
      position: new THREE.Vector3(0, SHACK_ROOF_Y[variant] ?? 4.1, 0),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
      scale: new THREE.Vector3(1, 1, 1),
    },
  };
}

// --- Billboard grass/scrub clusters (V3 Track B3) ---------------------------
// Classic mobile-game ground dressing: each cluster is two crossed quads
// (4 triangles) alpha-tested against a tiny procedurally-drawn canvas blade
// texture — canvas generation keeps the project's zero-bitmap-asset
// constraint, exactly like ParticleSystem's radial-gradient dot. All
// clusters share ONE InstancedMesh + material (a single extra draw call for
// the whole island), tinted per-instance via setColorAt like leaves/rocks.
// Tier-gated by QualitySettings.grassDensity (0 on "low" skips the mesh
// entirely — see World.scatterProps).

function buildGrassGeometry(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1);
  a.translate(0, 0.5, 0); // pivot at the ground line
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  return mergeGeometries([a, b]);
}

/** Tapered grass blades drawn once into a small canvas; used as the alpha-
 *  tested color map. Drawn in near-neutral light greens with darker bases so
 *  the per-instance tint drives the actual hue. */
function makeGrassTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  const bladeCount = 9;
  for (let i = 0; i < bladeCount; i++) {
    // Deterministic pseudo-random per blade (no Math.random: every session's
    // grass sheet looks identical).
    const h1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const h2 = Math.abs(Math.sin(i * 78.233) * 12345.6789) % 1;
    const baseX = ((i + 0.5) / bladeCount) * size + (h1 - 0.5) * 6;
    const halfW = 2.2 + h2 * 1.6;
    const tipX = baseX + (h1 - 0.5) * 14;
    const tipY = size * (0.08 + h2 * 0.3);
    const grad = ctx.createLinearGradient(0, size, 0, tipY);
    grad.addColorStop(0, "#77935a");
    grad.addColorStop(1, "#d9e8ab");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(baseX - halfW, size);
    ctx.lineTo(baseX + halfW, size);
    ctx.lineTo(tipX, tipY);
    ctx.closePath();
    ctx.fill();
  }
  // Flood the RGB of fully-transparent texels with a mid blade green:
  // mipmap averaging otherwise blends blade colors toward transparent-BLACK,
  // which made distant clusters render as near-black spikes.
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) {
      d[i] = 0x8e;
      d[i + 1] = 0xa8;
      d[i + 2] = 0x67;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let grassGeo: THREE.BufferGeometry | null = null;
let grassMat: THREE.MeshLambertMaterial | null = null;

export function createGrassInstancedMesh(capacity: number): THREE.InstancedMesh {
  // Lazily built: the "low" tier (grassDensity 0) never creates the texture
  // or geometry at all.
  grassGeo ??= buildGrassGeometry();
  grassMat ??= new THREE.MeshLambertMaterial({
    map: makeGrassTexture(),
    alphaTest: 0.45, // opaque-pass cutout: no blending, no sort issues
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(grassGeo, grassMat, Math.max(capacity, 1));
  mesh.count = 0;
  // Purely decorative: never a raycast target, never a shadow caster.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export interface GrassLayout extends PartTransform {
  color: THREE.Color;
}

/** One grass/scrub cluster placed in a ring around a tree's trunk. */
export function makeGrassLayout(): GrassLayout {
  const angle = Math.random() * Math.PI * 2;
  const dist = 1.7 + Math.random() * 2.3;
  const width = 0.9 + Math.random() * 0.9;
  const height = 0.45 + Math.random() * 0.4;
  return {
    position: new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist),
    quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0)),
    scale: new THREE.Vector3(width, height, width),
    color: new THREE.Color().setHSL(0.24 + Math.random() * 0.07, 0.45, 0.42 + Math.random() * 0.14),
  };
}
