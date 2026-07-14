import * as THREE from "three";
import { WORLD_RADIUS, TREE_COUNT, ROCK_COUNT, CRATE_COUNT, SHACK_COUNT, HARVEST_YIELD } from "../core/constants";
import type { Collider, Harvestable, HarvestablePart, HarvestResult, HitUserData } from "../core/types";
import { QUALITY_TIERS, type QualitySettings } from "../core/Settings";
import { terrainHeight } from "./terrain";
import {
  createTreeInstancedMeshes,
  createAppleInstancedMesh,
  createRockInstancedMesh,
  createCrateInstancedMesh,
  createShackInstancedMeshes,
  makeTreeLayout,
  makeAppleLayouts,
  makeRockLayout,
  makeCrateLayout,
  makeShackLayout,
  type PartTransform,
} from "./props";

const SKY_VERT = `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = `
uniform vec3 topColor;
uniform vec3 bottomColor;
varying vec3 vWorldPos;
void main() {
  float h = normalize(vWorldPos).y;
  float t = clamp(h * 0.6 + 0.4, 0.0, 1.0);
  gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
}
`;

// --- Sun shadow frustum ----------------------------------------------------
// Direction from any point toward the sun; must match buildLights' original
// sun position (120, 180, 80) relative to its (0,0,0) target so that moving
// the light along this axis (to follow the player) never changes the actual
// lighting direction — a DirectionalLight only cares about position-minus-
// target, which stays constant.
const SUN_DIR = new THREE.Vector3(120, 180, 80).normalize();
// How far up-sun the shadow-casting light sits from the player.
const SHADOW_LIGHT_DISTANCE = 90;
// Half-extent of the orthographic shadow box (~30 units across). A tight
// player-following box like this is the only viable shape on a phone GPU —
// a fixed world-wide frustum at WORLD_RADIUS 150 would need a gigantic map
// to avoid mush.
const SHADOW_BOX_HALF = 15;
// Depth slack either side of the player along the sun axis, generously
// covering tall trees/shacks/walls and terrain relief inside the box.
const SHADOW_DEPTH_SLACK = 60;

// Fraction of scattered trees that are apple trees (rolled per tree at
// scatter time), and how much HP each successful harvest hit on one restores
// on top of the normal wood yield.
const APPLE_TREE_CHANCE = 0.25;
const APPLE_HEAL_PER_HIT = 6;

// Scratch objects reused across setMatrixAt calls to avoid per-instance
// allocation (props.scatterProps writes hundreds of instances at boot, and
// harvest() writes a handful every hit).
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

/**
 * Composes the world-space instance matrix for one harvestable part:
 *   worldPos = anchor + localPos * healthScale
 *   worldScale = localScale * healthScale
 *   worldRot = localRot (rotation is unaffected by health)
 * This is the per-instance equivalent of the old `group.scale.set(s,s,s)` —
 * scaling a THREE.Group by a uniform scalar `s` scales both its children's
 * local offsets and their local scales by `s` (rotation commutes with
 * uniform scale), which is exactly what this reproduces without a Group.
 */
function composeInstanceMatrix(
  anchor: THREE.Vector3,
  localPos: THREE.Vector3,
  localQuat: THREE.Quaternion,
  localScale: THREE.Vector3,
  healthScale: number
): THREE.Matrix4 {
  _pos.copy(anchor).addScaledVector(localPos, healthScale);
  _scale.copy(localScale).multiplyScalar(healthScale);
  return _matrix.compose(_pos, localQuat, _scale);
}

export class World {
  scene: THREE.Scene;
  colliders: Collider[] = [];
  harvestables: Harvestable[] = [];
  raycastTargets: THREE.Object3D[] = [];
  /** Set true whenever `raycastTargets`' membership (not per-instance
   *  transforms) changes — currently only BuildingManager add/remove of
   *  walls. Consumed by WeaponSystem to know when its cached merged target
   *  list needs rebuilding. Prop harvest/respawn does NOT need to set this:
   *  instanced props stay in the array permanently, only their instance
   *  matrices change, which raycasting always reads fresh. */
  raycastTargetsDirty = true;
  terrainMesh!: THREE.Mesh;
  sunLight!: THREE.DirectionalLight;

  private treeTrunkMesh!: THREE.InstancedMesh;
  private treeLeafMesh!: THREE.InstancedMesh;
  private appleMesh!: THREE.InstancedMesh;
  private rockMesh!: THREE.InstancedMesh;
  private crateMesh!: THREE.InstancedMesh;
  private shackWallMesh!: THREE.InstancedMesh;
  private shackRoofMesh!: THREE.InstancedMesh;

  // instanceId -> harvestable refId, one array per InstancedMesh that can
  // hold harvestable parts. Referenced directly from each mesh's userData
  // (HitUserData.refIds) so WeaponSystem.resolveHit can map an
  // intersection.instanceId back to the right Harvestable.
  private treeTrunkRefIds: number[] = [];
  private treeLeafRefIds: number[] = [];
  private appleRefIds: number[] = [];
  private rockRefIds: number[] = [];

  private nextRefId = 0;
  private harvestableByRefId = new Map<number, Harvestable>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build(quality: QualitySettings): void {
    this.buildSky();
    this.buildLights();
    this.buildTerrain(quality.terrainSegments);
    this.buildWater();
    this.scatterProps(quality);
  }

  getHeightAt(x: number, z: number): number {
    return terrainHeight(x, z);
  }

  /** Turns real sun shadow-casting on/off and (when on) configures the tight
   *  player-following orthographic shadow box + map size for the active
   *  quality tier. Mesh-level castShadow/receiveShadow flags are set
   *  unconditionally at build time (inert while renderer.shadowMap.enabled is
   *  false), so this plus Game.applyQualityFeatures is the entire on-switch.
   *  Real shadows are a hybrid addition near the player — the cheap blob
   *  shadows (blobShadow.ts) stay active everywhere regardless. */
  setSunShadows(enabled: boolean, mapSize: number): void {
    const sun = this.sunLight;
    sun.castShadow = enabled;
    if (!enabled) return;

    const shadow = sun.shadow;
    if (shadow.mapSize.x !== mapSize) {
      shadow.mapSize.set(mapSize, mapSize);
      // Force the (possibly already-allocated) map to be recreated at the new size.
      shadow.map?.dispose();
      shadow.map = null;
    }
    const cam = shadow.camera;
    cam.left = -SHADOW_BOX_HALF;
    cam.right = SHADOW_BOX_HALF;
    cam.top = SHADOW_BOX_HALF;
    cam.bottom = -SHADOW_BOX_HALF;
    cam.near = SHADOW_LIGHT_DISTANCE - SHADOW_DEPTH_SLACK;
    cam.far = SHADOW_LIGHT_DISTANCE + SHADOW_DEPTH_SLACK;
    cam.updateProjectionMatrix();
    // Tuned against the low-poly Lambert meshes: enough bias to kill acne on
    // the terrain without visibly detaching character shadows from their feet.
    shadow.bias = -0.0005;
    shadow.normalBias = 0.05;
  }

  /** Re-centers the sun's shadow box on the player every frame. Moving the
   *  light and its target by the same offset keeps the lighting direction
   *  (SUN_DIR) bit-identical, so this is invisible except to the shadow
   *  camera. No-op unless shadows are enabled for the current tier. */
  updateShadowFrustum(playerPos: THREE.Vector3): void {
    if (!this.sunLight.castShadow) return;
    this.sunLight.position.copy(playerPos).addScaledVector(SUN_DIR, SHADOW_LIGHT_DISTANCE);
    this.sunLight.target.position.copy(playerPos);
  }

  private buildSky(): void {
    const geo = new THREE.SphereGeometry(WORLD_RADIUS * 6, 16, 12);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x2f7bd6) },
        bottomColor: { value: new THREE.Color(0xbfe4ff) },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -10;
    this.scene.add(sky);

    this.scene.fog = new THREE.Fog(0xbfe4ff, WORLD_RADIUS * 0.55, WORLD_RADIUS * 1.35);
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xbfe4ff, 0x3a4a2a, 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    sun.position.set(120, 180, 80);
    sun.castShadow = false;
    this.scene.add(sun);
    // The target must be in the scene graph for its matrixWorld to update when
    // updateShadowFrustum re-aims the light at the player each frame.
    this.scene.add(sun.target);
    this.sunLight = sun;

    const fill = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(fill);
  }

  private buildTerrain(segments: number): void {
    const size = WORLD_RADIUS * 2.3;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xd9c58a);
    const grass = new THREE.Color(0x4c7a34);
    const grassHigh = new THREE.Color(0x3a6128);
    const rockColor = new THREE.Color(0x8a8578);
    const snow = new THREE.Color(0xf2f2ec);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);

      const c = new THREE.Color();
      if (y < 0.15) {
        c.copy(sand);
      } else if (y < 3) {
        c.copy(grass).lerp(grassHigh, THREE.MathUtils.clamp((y - 0.15) / 2.85, 0, 1));
      } else if (y < 7) {
        c.copy(grassHigh).lerp(rockColor, THREE.MathUtils.clamp((y - 3) / 4, 0, 1));
      } else {
        c.copy(rockColor).lerp(snow, THREE.MathUtils.clamp((y - 7) / 5, 0, 1));
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    // Inert while renderer.shadowMap.enabled is false (the shipped default
    // for every tier); when a tier enables shadows, the ground catches them.
    mesh.receiveShadow = true;
    mesh.userData = { kind: "terrain" } satisfies HitUserData;
    this.scene.add(mesh);
    this.terrainMesh = mesh;
    this.raycastTargets.push(mesh);
  }

  private buildWater(): void {
    const geo = new THREE.CircleGeometry(WORLD_RADIUS * 3, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x1f6fb0,
      transparent: true,
      opacity: 0.85,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = -0.35;
    this.scene.add(water);
  }

  private scatterProps(quality: QualitySettings): void {
    // propDrawDistance-gated density: lower tiers place fewer props, and
    // cap them to a tighter radius around the island center, instead of
    // spreading the full (now denser) base counts across the whole map.
    const density = THREE.MathUtils.clamp(
      quality.propDrawDistance / QUALITY_TIERS.high.propDrawDistance,
      0.35,
      1
    );

    const treeCount = Math.round(TREE_COUNT * density);
    const rockCount = Math.round(ROCK_COUNT * density);
    const crateCount = Math.round(CRATE_COUNT * density);
    const shackCount = Math.round(SHACK_COUNT * density);

    const kindOuterRadius = Math.min(WORLD_RADIUS * 0.88, quality.propDrawDistance);
    const staticOuterRadius = Math.min(WORLD_RADIUS * 0.85, quality.propDrawDistance);

    const treeMeshes = createTreeInstancedMeshes(treeCount);
    this.treeTrunkMesh = treeMeshes.trunk;
    this.treeLeafMesh = treeMeshes.leaves;
    this.appleMesh = createAppleInstancedMesh(treeCount);
    this.rockMesh = createRockInstancedMesh(rockCount);
    this.crateMesh = createCrateInstancedMesh(crateCount);
    const shackMeshes = createShackInstancedMeshes(shackCount);
    this.shackWallMesh = shackMeshes.wall;
    this.shackRoofMesh = shackMeshes.roof;

    this.treeTrunkMesh.userData = { kind: "harvestable", refIds: this.treeTrunkRefIds } satisfies HitUserData;
    this.treeLeafMesh.userData = { kind: "harvestable", refIds: this.treeLeafRefIds } satisfies HitUserData;
    // Apples are parts of their tree: a raycast hit on an apple resolves to
    // the owning tree's refId, exactly like a hit on its trunk or leaves.
    this.appleMesh.userData = { kind: "harvestable", refIds: this.appleRefIds } satisfies HitUserData;
    this.rockMesh.userData = { kind: "harvestable", refIds: this.rockRefIds } satisfies HitUserData;
    this.crateMesh.userData = { kind: "prop" } satisfies HitUserData;
    this.shackWallMesh.userData = { kind: "prop" } satisfies HitUserData;
    this.shackRoofMesh.userData = { kind: "prop" } satisfies HitUserData;

    for (const mesh of [
      this.treeTrunkMesh,
      this.treeLeafMesh,
      this.appleMesh,
      this.rockMesh,
      this.crateMesh,
      this.shackWallMesh,
      this.shackRoofMesh,
    ]) {
      // Shadow flags are inert unless a quality tier turns shadow mapping on
      // (none do in this shipped version). InstancedMesh casts as a whole —
      // instances outside the tight player-following shadow box are clipped
      // by the shadow camera, so only nearby props actually land in the map.
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.raycastTargets.push(mesh);
    }
    // Flat-ish props the player stands next to also catch character/tree
    // shadows; skip the trees' trunk/leaves where receiving mostly buys acne.
    this.rockMesh.receiveShadow = true;
    this.crateMesh.receiveShadow = true;
    this.shackWallMesh.receiveShadow = true;
    this.shackRoofMesh.receiveShadow = true;

    this.scatterTrees(treeCount, 0.75, kindOuterRadius);
    this.scatterRocks(rockCount, 1.1, kindOuterRadius);
    this.scatterCrates(crateCount, 0.85, staticOuterRadius);
    this.scatterShacks(shackCount, 2.6, staticOuterRadius);
  }

  private randomIslandPoint(minR: number, maxR: number): { x: number; z: number } {
    const angle = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  }

  private tooClose(x: number, z: number, minDist: number): boolean {
    for (const c of this.colliders) {
      const dx = c.position.x - x;
      const dz = c.position.z - z;
      if (Math.sqrt(dx * dx + dz * dz) < minDist + c.radius) return true;
    }
    return false;
  }

  private scatterTrees(count: number, radius: number, outerRadius: number): void {
    let placed = 0;
    let applesPlaced = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;
      const { x, z } = this.randomIslandPoint(10, outerRadius);
      const y = terrainHeight(x, z);
      if (y < 0.1 || this.tooClose(x, z, radius + 1)) continue;

      const anchor = new THREE.Vector3(x, y, z);
      const layout = makeTreeLayout();
      const refId = this.nextRefId++;

      const trunkInstanceId = placed;
      this.treeTrunkMesh.setMatrixAt(
        trunkInstanceId,
        composeInstanceMatrix(anchor, layout.trunk.position, layout.trunk.quaternion, layout.trunk.scale, 1)
      );
      this.treeTrunkRefIds[trunkInstanceId] = refId;

      const parts: HarvestablePart[] = [
        {
          mesh: this.treeTrunkMesh,
          instanceId: trunkInstanceId,
          basePos: layout.trunk.position,
          baseQuat: layout.trunk.quaternion,
          baseScale: layout.trunk.scale,
        },
      ];

      for (let i = 0; i < layout.leaves.length; i++) {
        const leaf = layout.leaves[i];
        const leafInstanceId = placed * 3 + i;
        this.treeLeafMesh.setMatrixAt(
          leafInstanceId,
          composeInstanceMatrix(anchor, leaf.position, leaf.quaternion, leaf.scale, 1)
        );
        this.treeLeafMesh.setColorAt(leafInstanceId, layout.leafColor);
        this.treeLeafRefIds[leafInstanceId] = refId;
        parts.push({
          mesh: this.treeLeafMesh,
          instanceId: leafInstanceId,
          basePos: leaf.position,
          baseQuat: leaf.quaternion,
          baseScale: leaf.scale,
        });
      }

      // ~25% of trees are apple trees: same trunk/leaves, plus 2-4 apple
      // instances tucked into the leaf tiers. The apples join `parts`, so
      // every existing per-part behavior — health scaling, the zero-scale
      // destroy, respawn restore — covers them with no extra bookkeeping.
      const isAppleTree = Math.random() < APPLE_TREE_CHANCE;
      if (isAppleTree) {
        for (const apple of makeAppleLayouts(layout.leaves)) {
          const appleInstanceId = applesPlaced++;
          this.appleMesh.setMatrixAt(
            appleInstanceId,
            composeInstanceMatrix(anchor, apple.position, apple.quaternion, apple.scale, 1)
          );
          this.appleMesh.setColorAt(appleInstanceId, apple.color);
          this.appleRefIds[appleInstanceId] = refId;
          parts.push({
            mesh: this.appleMesh,
            instanceId: appleInstanceId,
            basePos: apple.position,
            baseQuat: apple.quaternion,
            baseScale: apple.scale,
          });
        }
      }

      const collider: Collider = { position: anchor, radius };
      this.colliders.push(collider);

      const harvestable: Harvestable = {
        kind: "tree",
        parts,
        hp: 100,
        maxHp: 100,
        alive: true,
        respawnAt: 0,
        collider,
        basePosition: anchor,
      };
      if (isAppleTree) harvestable.treeVariant = "apple";
      this.harvestableByRefId.set(refId, harvestable);
      this.harvestables.push(harvestable);

      placed++;
    }

    this.treeTrunkMesh.count = placed;
    this.treeLeafMesh.count = placed * 3;
    this.appleMesh.count = applesPlaced;
    this.treeTrunkMesh.instanceMatrix.needsUpdate = true;
    this.treeLeafMesh.instanceMatrix.needsUpdate = true;
    this.appleMesh.instanceMatrix.needsUpdate = true;
    if (this.treeLeafMesh.instanceColor) this.treeLeafMesh.instanceColor.needsUpdate = true;
    if (this.appleMesh.instanceColor) this.appleMesh.instanceColor.needsUpdate = true;
  }

  private scatterRocks(count: number, radius: number, outerRadius: number): void {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;
      const { x, z } = this.randomIslandPoint(10, outerRadius);
      const y = terrainHeight(x, z);
      if (y < 0.1 || this.tooClose(x, z, radius + 1)) continue;

      const anchor = new THREE.Vector3(x, y, z);
      const layout = makeRockLayout();
      const refId = this.nextRefId++;
      const instanceId = placed;

      this.rockMesh.setMatrixAt(
        instanceId,
        composeInstanceMatrix(anchor, layout.position, layout.quaternion, layout.scale, 1)
      );
      this.rockMesh.setColorAt(instanceId, layout.color);
      this.rockRefIds[instanceId] = refId;

      const collider: Collider = { position: anchor, radius };
      this.colliders.push(collider);

      const harvestable: Harvestable = {
        kind: "rock",
        parts: [
          {
            mesh: this.rockMesh,
            instanceId,
            basePos: layout.position,
            baseQuat: layout.quaternion,
            baseScale: layout.scale,
          },
        ],
        hp: 100,
        maxHp: 100,
        alive: true,
        respawnAt: 0,
        collider,
        basePosition: anchor,
      };
      this.harvestableByRefId.set(refId, harvestable);
      this.harvestables.push(harvestable);

      placed++;
    }

    this.rockMesh.count = placed;
    this.rockMesh.instanceMatrix.needsUpdate = true;
    if (this.rockMesh.instanceColor) this.rockMesh.instanceColor.needsUpdate = true;
  }

  private scatterCrates(count: number, radius: number, outerRadius: number): void {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;
      const { x, z } = this.randomIslandPoint(14, outerRadius);
      const y = terrainHeight(x, z);
      if (y < 0.1 || this.tooClose(x, z, radius + 1.2)) continue;

      const anchor = new THREE.Vector3(x, y, z);
      const layout = makeCrateLayout();
      this.crateMesh.setMatrixAt(placed, composeInstanceMatrix(anchor, layout.position, layout.quaternion, layout.scale, 1));

      this.colliders.push({ position: anchor, radius });
      placed++;
    }

    this.crateMesh.count = placed;
    this.crateMesh.instanceMatrix.needsUpdate = true;
  }

  private scatterShacks(count: number, radius: number, outerRadius: number): void {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;
      const { x, z } = this.randomIslandPoint(14, outerRadius);
      const y = terrainHeight(x, z);
      if (y < 0.1 || this.tooClose(x, z, radius + 1.2)) continue;

      const anchor = new THREE.Vector3(x, y, z);
      const layout = makeShackLayout();

      this.shackWallMesh.setMatrixAt(
        placed,
        composeInstanceMatrix(anchor, layout.wall.position, layout.wall.quaternion, layout.wall.scale, 1)
      );
      this.shackWallMesh.setColorAt(placed, layout.wall.color);
      this.shackRoofMesh.setMatrixAt(
        placed,
        composeInstanceMatrix(anchor, layout.roof.position, layout.roof.quaternion, layout.roof.scale, 1)
      );

      this.colliders.push({ position: anchor, radius });
      placed++;
    }

    this.shackWallMesh.count = placed;
    this.shackRoofMesh.count = placed;
    this.shackWallMesh.instanceMatrix.needsUpdate = true;
    this.shackRoofMesh.instanceMatrix.needsUpdate = true;
    if (this.shackWallMesh.instanceColor) this.shackWallMesh.instanceColor.needsUpdate = true;
  }

  getHarvestable(refId: number): Harvestable | undefined {
    return this.harvestableByRefId.get(refId);
  }

  /** Writes the given health-fraction (0 = destroyed, 1 = full health) into
   *  every instance part making up a harvestable, replacing the old
   *  group-level `scale.set(s,s,s)` mutation. See composeInstanceMatrix. */
  private setHarvestableScale(h: Harvestable, healthScale: number): void {
    for (const part of h.parts) {
      part.mesh.setMatrixAt(
        part.instanceId,
        composeInstanceMatrix(h.basePosition, part.basePos, part.baseQuat, part.baseScale, healthScale)
      );
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Applies one harvest hit and returns what it yielded — materials, plus a
   *  small heal when the target is an apple tree (0 heal for regular trees,
   *  rocks, and anything already depleted). */
  harvest(refId: number): HarvestResult {
    const h = this.harvestableByRefId.get(refId);
    if (!h || !h.alive) return { materials: 0, heal: 0 };
    h.hp -= HARVEST_YIELD * 4;
    if (h.hp <= 0) {
      h.alive = false;
      h.respawnAt = performance.now() / 1000 + 14;
      // Zero-scale collapses every part of this harvestable — for an apple
      // tree that includes its apple instances, which live in h.parts.
      this.setHarvestableScale(h, 0);
      const idx = this.colliders.indexOf(h.collider);
      if (idx >= 0) this.colliders.splice(idx, 1);
    } else {
      const s = THREE.MathUtils.clamp(h.hp / h.maxHp, 0.35, 1);
      this.setHarvestableScale(h, s);
    }
    return { materials: HARVEST_YIELD, heal: h.treeVariant === "apple" ? APPLE_HEAL_PER_HIT : 0 };
  }

  update(nowSec: number): void {
    for (const h of this.harvestables) {
      if (!h.alive && nowSec >= h.respawnAt) {
        h.alive = true;
        h.hp = h.maxHp;
        this.setHarvestableScale(h, 1);
        this.colliders.push(h.collider);
      }
    }
  }
}
