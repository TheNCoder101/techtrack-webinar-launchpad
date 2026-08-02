import * as THREE from "three";
import { WORLD_RADIUS, TREE_COUNT, ROCK_COUNT, CRATE_COUNT, SHACK_COUNT, HARVEST_YIELD } from "../core/constants";
import type { Collider, Harvestable, HarvestablePart, HarvestResult, HitUserData } from "../core/types";
import { QUALITY_TIERS, type QualitySettings } from "../core/Settings";
import { terrainHeight } from "./terrain";
import { fbm2D } from "./noise";
import { mulberry32, type RandFn } from "./rng";
import {
  createTreeInstancedMeshes,
  createAppleInstancedMesh,
  createRockInstancedMeshes,
  createCrateInstancedMeshes,
  createShackInstancedMeshes,
  createGrassInstancedMesh,
  makeTreeLayout,
  makeAppleLayouts,
  makeRockLayout,
  makeCrateLayout,
  makeShackLayout,
  makeGrassLayout,
  ROCK_VARIANT_COUNT,
  CRATE_VARIANT_COUNT,
  SHACK_VARIANT_COUNT,
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

// V3 Track A2: same single full-screen sky mesh, richer shading — a warm
// horizon-to-zenith gradient, a soft sun disk + glow toward the match's sun
// direction (per-match time-of-day roll since D4), and a
// slow-drifting procedural cloud band (3-octave value-noise fbm; no
// textures, keeping the project's zero-bitmap constraint). Ends with the
// standard tonemapping/colorspace chunks so the sky runs through the same
// ACES curve as the rest of the scene (A1) on both the direct render path
// and any composer path (where those chunks compile to no-ops and
// OutputPass tonemaps instead).
const SKY_FRAG = `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 bottomColor;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 cloudColor;
uniform float time;
varying vec3 vWorldPos;

float skyHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = skyHash(i);
  float b = skyHash(i + vec2(1.0, 0.0));
  float c = skyHash(i + vec2(0.0, 1.0));
  float d = skyHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float skyFbm(vec2 p) {
  return 0.5 * skyNoise(p) + 0.25 * skyNoise(p * 2.03) + 0.125 * skyNoise(p * 4.09);
}

void main() {
  vec3 dir = normalize(vWorldPos);
  float h = dir.y;

  // Warm band hugging the horizon, lifting into the blue zenith.
  vec3 col = mix(bottomColor, horizonColor, smoothstep(-0.15, 0.03, h));
  col = mix(col, topColor, smoothstep(0.03, 0.55, h));

  // Sun: tight disk + two nested glow falloffs toward sunDirection.
  float sunAmt = max(dot(dir, sunDirection), 0.0);
  col += sunColor * pow(sunAmt, 400.0) * 2.4;
  col += sunColor * pow(sunAmt, 26.0) * 0.32;
  col += sunColor * pow(sunAmt, 5.0) * 0.10;

  // Subtle cloud band: fbm sampled on a horizon-stable projection, faded
  // out near the horizon and the zenith so it reads as a mid-sky layer.
  vec2 cloudUv = dir.xz / (abs(dir.y) + 0.22);
  float cl = skyFbm(cloudUv * 1.4 + vec2(time * 0.004, time * 0.0015));
  float band = smoothstep(0.48, 0.75, cl)
    * smoothstep(0.02, 0.14, h)
    * (1.0 - smoothstep(0.42, 0.75, h));
  col = mix(col, cloudColor, band * 0.4);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// --- Terrain slope/height banding (V3 Track A5) ----------------------------
// The terrain material stays MeshLambertMaterial({vertexColors:true}), but a
// small onBeforeCompile patch moves the grass/dirt/rock/snow banding from
// per-vertex colors into the fragment shader: bands blend per-pixel from the
// interpolated world height + normal (data the mesh already carries), so a
// shoreline or dirt-on-slope edge is no longer quantized to the ~3m vertex
// grid. Vertex colors now carry only a low-frequency noise brightness tint
// (see buildTerrain), which multiplies against the bands. Costs a handful of
// ALU ops per terrain fragment; no textures, no new draw calls.
const TERRAIN_VERT_PATCH = /* glsl */ `
  vTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);
  #include <worldpos_vertex>`;

const TERRAIN_FRAG_PATCH = /* glsl */ `
  #include <color_fragment>
  {
    float th = vTerrainPos.y;
    float slope = 1.0 - clamp(normalize(vTerrainNormal).y, 0.0, 1.0);
    vec3 band = mix(uSandColor, uGrassColor, smoothstep(0.05, 0.7, th));
    band = mix(band, uGrassHighColor, smoothstep(1.6, 4.4, th));
    float dirtAmt = smoothstep(0.24, 0.5, slope)
      * smoothstep(0.25, 0.8, th)
      * (1.0 - smoothstep(5.0, 7.0, th));
    band = mix(band, uDirtColor, dirtAmt * 0.85);
    band = mix(band, uRockColor, smoothstep(5.5, 8.0, th));
    band = mix(band, uSnowColor, smoothstep(8.5, 11.5, th));
    diffuseColor.rgb *= band;
  }`;

function applyTerrainBanding(mat: THREE.MeshLambertMaterial): void {
  mat.onBeforeCompile = (shader) => {
    // THREE.Color uniforms upload in the linear working space, matching how
    // the old vertex-color bands were authored.
    shader.uniforms.uSandColor = { value: new THREE.Color(0xd9c58a) };
    shader.uniforms.uGrassColor = { value: new THREE.Color(0x4f8036) };
    shader.uniforms.uGrassHighColor = { value: new THREE.Color(0x3a6128) };
    shader.uniforms.uDirtColor = { value: new THREE.Color(0x7a5a38) };
    shader.uniforms.uRockColor = { value: new THREE.Color(0x8a8578) };
    shader.uniforms.uSnowColor = { value: new THREE.Color(0xf2f2ec) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        "varying vec3 vTerrainPos;\nvarying vec3 vTerrainNormal;\nvoid main() {"
      )
      .replace("#include <worldpos_vertex>", TERRAIN_VERT_PATCH);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        [
          "varying vec3 vTerrainPos;",
          "varying vec3 vTerrainNormal;",
          "uniform vec3 uSandColor;",
          "uniform vec3 uGrassColor;",
          "uniform vec3 uGrassHighColor;",
          "uniform vec3 uDirtColor;",
          "uniform vec3 uRockColor;",
          "uniform vec3 uSnowColor;",
          "void main() {",
        ].join("\n")
      )
      .replace("#include <color_fragment>", TERRAIN_FRAG_PATCH);
  };
  mat.customProgramCacheKey = () => "lambert-terrain-bands";
}

// --- Time-of-day variance (V3 Track D4) ------------------------------------
// One preset is rolled per match (World construction) and drives every
// coupled lighting input together — sun direction, sky gradient, sun
// disk/glow, cloud tint, directional/hemisphere/ambient light, and fog — so
// each roll reads as one coherent lighting state, not mismatched knobs.
// Riding entirely on Track A's machinery: the same A2 sky uniforms, the same
// three lights buildLights always created, the same fog. Zero new runtime
// cost — every value is set once at build.
//
// Readability guardrails (this is atmosphere, NOT a night mode): sun
// elevation never drops below ~14°, and the dimmer the sun preset, the more
// the hemisphere/ambient floors rise, so bots/props stay clearly readable in
// every roll. "noon" is bit-identical to the pre-D4 shipped lighting.
// All values pass through A1's ACES tone mapping unchanged.
export type TimeOfDayId = "dawn" | "noon" | "golden" | "dusk";

export interface TimeOfDayPreset {
  id: TimeOfDayId;
  /** Direction from the origin toward the sun (normalized at use). Also the
   *  shadow-frustum axis when a tier ever enables real shadows. */
  sunDir: [number, number, number];
  // A2 sky shader uniforms.
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  sunColor: number;
  cloudColor: number;
  // buildLights inputs.
  sunLightColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  ambientIntensity: number;
  fogColor: number;
}

export const TIME_OF_DAY_PRESETS: Record<TimeOfDayId, TimeOfDayPreset> = {
  // Low sun rising in the +x east: peach horizon, cool lavender haze.
  dawn: {
    id: "dawn",
    sunDir: [170, 62, 30],
    skyTop: 0x3a72c4,
    skyHorizon: 0xffcfa3,
    skyBottom: 0xd8d6ee,
    sunColor: 0xffdcae,
    cloudColor: 0xffeede,
    sunLightColor: 0xffdcb4,
    sunIntensity: 1.05,
    hemiSky: 0xcfdcf2,
    hemiGround: 0x46443a,
    hemiIntensity: 0.9,
    ambientIntensity: 0.26,
    fogColor: 0xd3d3ea,
  },
  // The pre-D4 baseline, exactly as Track A shipped it.
  noon: {
    id: "noon",
    sunDir: [120, 180, 80],
    skyTop: 0x2f7bd6,
    skyHorizon: 0xf5dcb8,
    skyBottom: 0xc3e2f7,
    sunColor: 0xfff2d0,
    cloudColor: 0xfffcf7,
    sunLightColor: 0xfff2d6,
    sunIntensity: 1.15,
    hemiSky: 0xbfe4ff,
    hemiGround: 0x3a4a2a,
    hemiIntensity: 0.9,
    ambientIntensity: 0.25,
    fogColor: 0xbfe4ff,
  },
  // Late-afternoon golden hour: warm amber light from the west.
  golden: {
    id: "golden",
    sunDir: [-140, 76, 95],
    skyTop: 0x2e63b0,
    skyHorizon: 0xffa64f,
    skyBottom: 0xf2cf9a,
    sunColor: 0xffcf8f,
    cloudColor: 0xffe7c9,
    sunLightColor: 0xffd6a4,
    sunIntensity: 1.2,
    hemiSky: 0xeacfa0,
    hemiGround: 0x453b28,
    hemiIntensity: 0.88,
    ambientIntensity: 0.25,
    fogColor: 0xeccb9a,
  },
  // Sun just above the horizon: ember horizon under a violet-blue sky. The
  // dimmest roll, so it carries the highest hemi/ambient floor.
  dusk: {
    id: "dusk",
    sunDir: [-110, 46, -150],
    skyTop: 0x2c4a80,
    skyHorizon: 0xff9e70,
    skyBottom: 0xa98cc4,
    sunColor: 0xffb27a,
    cloudColor: 0xf3c9b0,
    sunLightColor: 0xffb98c,
    sunIntensity: 1.0,
    hemiSky: 0x93a6d6,
    hemiGround: 0x3e3a52,
    hemiIntensity: 1.0,
    ambientIntensity: 0.32,
    fogColor: 0xa596c8,
  },
};

const TIME_OF_DAY_IDS = Object.keys(TIME_OF_DAY_PRESETS) as TimeOfDayId[];

/** Dev/test-only override (?tod=dawn|noon|golden|dusk) so Playwright can
 *  screenshot specific rolls deterministically — same DEV-gated URL-param
 *  idiom as GamePage's co-op broker override. Production builds compile the
 *  whole check away and always roll randomly. */
function rollTimeOfDay(): TimeOfDayPreset {
  if (import.meta.env.DEV) {
    const forced = new URLSearchParams(window.location.search).get("tod");
    if (forced && forced in TIME_OF_DAY_PRESETS) {
      return TIME_OF_DAY_PRESETS[forced as TimeOfDayId];
    }
  }
  return TIME_OF_DAY_PRESETS[TIME_OF_DAY_IDS[Math.floor(Math.random() * TIME_OF_DAY_IDS.length)]];
}

// --- Sun shadow frustum ----------------------------------------------------
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
  /** The per-match time-of-day roll (D4) — public for HUD/debug reads. */
  readonly timeOfDay: TimeOfDayPreset;
  /** Direction toward this match's sun; replaces the old SUN_DIR constant.
   *  buildLights positions the sun along this axis relative to its (0,0,0)
   *  target, so updateShadowFrustum sliding the light along the same axis
   *  never changes the actual lighting direction — a DirectionalLight only
   *  cares about position-minus-target, which stays constant. */
  private sunDir: THREE.Vector3;
  /** Sky dome material — kept so update() can drive the cloud-drift time
   *  uniform (the only per-frame cost of the A2 sky: one float write). */
  private skyMat!: THREE.ShaderMaterial;

  private treeTrunkMesh!: THREE.InstancedMesh;
  private treeLeafMesh!: THREE.InstancedMesh;
  private appleMesh!: THREE.InstancedMesh;
  // B4: one InstancedMesh per geometry variant (rocks x3, crates x3,
  // shack wall/roof pairs x2); the scatter functions pick a variant per
  // placement. Still one draw call per variant mesh.
  private rockMeshes: THREE.InstancedMesh[] = [];
  private crateMeshes: THREE.InstancedMesh[] = [];
  private shackWallMeshes: THREE.InstancedMesh[] = [];
  private shackRoofMeshes: THREE.InstancedMesh[] = [];
  // B3: single decorative grass InstancedMesh; null when the tier's
  // grassDensity is 0 (the "low" tier never creates it).
  private grassMesh: THREE.InstancedMesh | null = null;

  // instanceId -> harvestable refId, one array per InstancedMesh that can
  // hold harvestable parts. Referenced directly from each mesh's userData
  // (HitUserData.refIds) so WeaponSystem.resolveHit can map an
  // intersection.instanceId back to the right Harvestable.
  private treeTrunkRefIds: number[] = [];
  private treeLeafRefIds: number[] = [];
  private appleRefIds: number[] = [];
  /** One refId array per rock variant mesh, parallel to rockMeshes. */
  private rockRefIds: number[][] = [];

  private nextRefId = 0;
  private harvestableByRefId = new Map<number, Harvestable>();

  // V5 F2b: every Math.random() call used for prop scatter (trees, rocks,
  // crates, shacks, and their per-piece layout variance in props.ts) now
  // goes through this instead. Solo play (seed undefined, the default) keeps
  // using Math.random() directly — same signature as RandFn — so single-
  // player world variety is completely unchanged. Co-op passes a seed
  // derived from the join code (both peers already know it), so every peer
  // scatters an IDENTICAL island: same trees, same rocks, same colliders.
  // Deliberately does NOT cover rollTimeOfDay() below — time-of-day is purely
  // cosmetic lighting, not gameplay state, so it stays independently random
  // per peer exactly as before.
  private rand: RandFn;

  constructor(scene: THREE.Scene, seed?: number) {
    this.scene = scene;
    this.rand = seed !== undefined ? mulberry32(seed) : Math.random;
    this.timeOfDay = rollTimeOfDay();
    this.sunDir = new THREE.Vector3(...this.timeOfDay.sunDir).normalize();
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
   *  (this.sunDir) bit-identical, so this is invisible except to the shadow
   *  camera. No-op unless shadows are enabled for the current tier. */
  updateShadowFrustum(playerPos: THREE.Vector3): void {
    if (!this.sunLight.castShadow) return;
    this.sunLight.position.copy(playerPos).addScaledVector(this.sunDir, SHADOW_LIGHT_DISTANCE);
    this.sunLight.target.position.copy(playerPos);
  }

  private buildSky(): void {
    // D4: every sky input comes from the per-match time-of-day preset; the
    // shader itself is unchanged from Track A2.
    const tod = this.timeOfDay;
    const geo = new THREE.SphereGeometry(WORLD_RADIUS * 6, 16, 12);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(tod.skyTop) },
        horizonColor: { value: new THREE.Color(tod.skyHorizon) },
        bottomColor: { value: new THREE.Color(tod.skyBottom) },
        sunDirection: { value: this.sunDir.clone() },
        sunColor: { value: new THREE.Color(tod.sunColor) },
        cloudColor: { value: new THREE.Color(tod.cloudColor) },
        time: { value: 0 },
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
    this.skyMat = mat;

    // StormManager snapshots this as its "base" fog on first sight, so the
    // storm's fog shift correctly returns to whatever this roll set.
    this.scene.fog = new THREE.Fog(tod.fogColor, WORLD_RADIUS * 0.55, WORLD_RADIUS * 1.35);
  }

  private buildLights(): void {
    const tod = this.timeOfDay;
    const hemi = new THREE.HemisphereLight(tod.hemiSky, tod.hemiGround, tod.hemiIntensity);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(tod.sunLightColor, tod.sunIntensity);
    // Along the match's sun axis; magnitude is irrelevant to a
    // DirectionalLight (only position-minus-target matters), 220 keeps the
    // same order of magnitude as the old (120,180,80) placement.
    sun.position.copy(this.sunDir).multiplyScalar(220);
    sun.castShadow = false;
    this.scene.add(sun);
    // The target must be in the scene graph for its matrixWorld to update when
    // updateShadowFrustum re-aims the light at the player each frame.
    this.scene.add(sun.target);
    this.sunLight = sun;

    const fill = new THREE.AmbientLight(0xffffff, tod.ambientIntensity);
    this.scene.add(fill);
  }

  private buildTerrain(segments: number): void {
    const size = WORLD_RADIUS * 2.3;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));

      // A5: vertex colors are now just a low-frequency brightness tint
      // (±8%) breaking up flat fills — the actual grass/dirt/rock banding
      // is computed per-fragment in applyTerrainBanding's shader patch.
      const tint = 0.92 + fbm2D(x * 0.16 + 40, z * 0.16 + 40, 2) * 0.16;
      colors[i * 3] = tint;
      colors[i * 3 + 1] = tint;
      colors[i * 3 + 2] = tint;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    applyTerrainBanding(mat);
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
    this.rockMeshes = createRockInstancedMeshes(rockCount);
    this.crateMeshes = createCrateInstancedMeshes(crateCount);
    const shackMeshes = createShackInstancedMeshes(shackCount);
    this.shackWallMeshes = shackMeshes.map((m) => m.wall);
    this.shackRoofMeshes = shackMeshes.map((m) => m.roof);

    this.treeTrunkMesh.userData = { kind: "harvestable", refIds: this.treeTrunkRefIds } satisfies HitUserData;
    this.treeLeafMesh.userData = { kind: "harvestable", refIds: this.treeLeafRefIds } satisfies HitUserData;
    // Apples are parts of their tree: a raycast hit on an apple resolves to
    // the owning tree's refId, exactly like a hit on its trunk or leaves.
    this.appleMesh.userData = { kind: "harvestable", refIds: this.appleRefIds } satisfies HitUserData;
    this.rockRefIds = this.rockMeshes.map(() => []);
    this.rockMeshes.forEach((mesh, v) => {
      mesh.userData = { kind: "harvestable", refIds: this.rockRefIds[v] } satisfies HitUserData;
    });
    for (const mesh of [...this.crateMeshes, ...this.shackWallMeshes, ...this.shackRoofMeshes]) {
      mesh.userData = { kind: "prop" } satisfies HitUserData;
    }

    for (const mesh of [
      this.treeTrunkMesh,
      this.treeLeafMesh,
      this.appleMesh,
      ...this.rockMeshes,
      ...this.crateMeshes,
      ...this.shackWallMeshes,
      ...this.shackRoofMeshes,
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
    for (const mesh of [...this.rockMeshes, ...this.crateMeshes, ...this.shackWallMeshes, ...this.shackRoofMeshes]) {
      mesh.receiveShadow = true;
    }

    // B3 grass: one decorative InstancedMesh for the whole island, capacity
    // grassDensity clusters per tree. grassDensity 0 ("low") skips the
    // feature entirely — no mesh, no texture, no draw call. Deliberately NOT
    // a raycast target or collider: bullets and players pass through scrub.
    const grassPerTree = quality.grassDensity;
    if (grassPerTree > 0) {
      this.grassMesh = createGrassInstancedMesh(treeCount * grassPerTree);
      this.scene.add(this.grassMesh);
    }

    this.scatterTrees(treeCount, 0.75, kindOuterRadius, grassPerTree);
    this.scatterRocks(rockCount, 1.1, kindOuterRadius);
    this.scatterCrates(crateCount, 0.85, staticOuterRadius);
    this.scatterShacks(shackCount, 2.6, staticOuterRadius);
  }

  private randomIslandPoint(minR: number, maxR: number): { x: number; z: number } {
    const angle = this.rand() * Math.PI * 2;
    const r = minR + this.rand() * (maxR - minR);
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

  private scatterTrees(count: number, radius: number, outerRadius: number, grassPerTree: number): void {
    let placed = 0;
    let applesPlaced = 0;
    let grassPlaced = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;
      const { x, z } = this.randomIslandPoint(10, outerRadius);
      const y = terrainHeight(x, z);
      if (y < 0.1 || this.tooClose(x, z, radius + 1)) continue;

      const anchor = new THREE.Vector3(x, y, z);
      const layout = makeTreeLayout(this.rand);
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
      const isAppleTree = this.rand() < APPLE_TREE_CHANCE;
      if (isAppleTree) {
        for (const apple of makeAppleLayouts(layout.leaves, this.rand)) {
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

      // B3: a few grass/scrub clusters hugging each tree. Anchored to the
      // terrain height at their own offset (not the trunk's), so they sit on
      // the ground even on a slope. Decorative only — no collider, no
      // harvestable part, not tied to the tree's health scaling.
      if (this.grassMesh && grassPerTree > 0) {
        for (let g = 0; g < grassPerTree; g++) {
          const layout = makeGrassLayout(this.rand);
          const gx = x + layout.position.x;
          const gz = z + layout.position.z;
          const gy = terrainHeight(gx, gz);
          if (gy < 0.08) continue; // keep scrub off the beach/waterline
          const grassInstanceId = grassPlaced++;
          this.grassMesh.setMatrixAt(
            grassInstanceId,
            composeInstanceMatrix(
              new THREE.Vector3(gx, gy - 0.02, gz),
              new THREE.Vector3(0, 0, 0),
              layout.quaternion,
              layout.scale,
              1
            )
          );
          this.grassMesh.setColorAt(grassInstanceId, layout.color);
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
    if (this.grassMesh) {
      this.grassMesh.count = grassPlaced;
      this.grassMesh.instanceMatrix.needsUpdate = true;
      if (this.grassMesh.instanceColor) this.grassMesh.instanceColor.needsUpdate = true;
    }
  }

  private scatterRocks(count: number, radius: number, outerRadius: number): void {
    let placed = 0;
    let attempts = 0;
    // B4: per-variant instance cursors — each variant mesh fills its own
    // buffer independently as the random variant picks come in.
    const placedPerVariant = new Array(ROCK_VARIANT_COUNT).fill(0);
    while (placed < count && attempts < count * 20) {
      attempts++;
      const { x, z } = this.randomIslandPoint(10, outerRadius);
      const y = terrainHeight(x, z);
      if (y < 0.1 || this.tooClose(x, z, radius + 1)) continue;

      const anchor = new THREE.Vector3(x, y, z);
      const layout = makeRockLayout(this.rand);
      const refId = this.nextRefId++;
      const variant = Math.floor(this.rand() * ROCK_VARIANT_COUNT);
      const mesh = this.rockMeshes[variant];
      const instanceId = placedPerVariant[variant]++;

      mesh.setMatrixAt(
        instanceId,
        composeInstanceMatrix(anchor, layout.position, layout.quaternion, layout.scale, 1)
      );
      mesh.setColorAt(instanceId, layout.color);
      this.rockRefIds[variant][instanceId] = refId;

      const collider: Collider = { position: anchor, radius };
      this.colliders.push(collider);

      const harvestable: Harvestable = {
        kind: "rock",
        parts: [
          {
            mesh,
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

    this.rockMeshes.forEach((mesh, v) => {
      mesh.count = placedPerVariant[v];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  private scatterCrates(count: number, radius: number, outerRadius: number): void {
    let placed = 0;
    let attempts = 0;
    const placedPerVariant = new Array(CRATE_VARIANT_COUNT).fill(0);
    while (placed < count && attempts < count * 20) {
      attempts++;
      const { x, z } = this.randomIslandPoint(14, outerRadius);
      const y = terrainHeight(x, z);
      if (y < 0.1 || this.tooClose(x, z, radius + 1.2)) continue;

      const anchor = new THREE.Vector3(x, y, z);
      const variant = Math.floor(this.rand() * CRATE_VARIANT_COUNT);
      const layout = makeCrateLayout(variant, this.rand);
      const mesh = this.crateMeshes[variant];
      mesh.setMatrixAt(
        placedPerVariant[variant]++,
        composeInstanceMatrix(anchor, layout.position, layout.quaternion, layout.scale, 1)
      );

      this.colliders.push({ position: anchor, radius });
      placed++;
    }

    this.crateMeshes.forEach((mesh, v) => {
      mesh.count = placedPerVariant[v];
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  private scatterShacks(count: number, radius: number, outerRadius: number): void {
    let placed = 0;
    let attempts = 0;
    const placedPerVariant = new Array(SHACK_VARIANT_COUNT).fill(0);
    while (placed < count && attempts < count * 20) {
      attempts++;
      const { x, z } = this.randomIslandPoint(14, outerRadius);
      const y = terrainHeight(x, z);
      if (y < 0.1 || this.tooClose(x, z, radius + 1.2)) continue;

      const anchor = new THREE.Vector3(x, y, z);
      const variant = Math.floor(this.rand() * SHACK_VARIANT_COUNT);
      const layout = makeShackLayout(variant, this.rand);
      const wallMesh = this.shackWallMeshes[variant];
      const roofMesh = this.shackRoofMeshes[variant];
      const instanceId = placedPerVariant[variant]++;

      wallMesh.setMatrixAt(
        instanceId,
        composeInstanceMatrix(anchor, layout.wall.position, layout.wall.quaternion, layout.wall.scale, 1)
      );
      wallMesh.setColorAt(instanceId, layout.wall.color);
      roofMesh.setMatrixAt(
        instanceId,
        composeInstanceMatrix(anchor, layout.roof.position, layout.roof.quaternion, layout.roof.scale, 1)
      );

      this.colliders.push({ position: anchor, radius });
      placed++;
    }

    this.shackWallMeshes.forEach((wallMesh, v) => {
      wallMesh.count = placedPerVariant[v];
      wallMesh.instanceMatrix.needsUpdate = true;
      if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
      const roofMesh = this.shackRoofMeshes[v];
      roofMesh.count = placedPerVariant[v];
      roofMesh.instanceMatrix.needsUpdate = true;
    });
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
    // Slow cloud drift for the A2 sky shader.
    this.skyMat.uniforms.time.value = nowSec;
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
