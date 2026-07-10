import * as THREE from "three";
import { WORLD_RADIUS, TREE_COUNT, ROCK_COUNT, CRATE_COUNT, HARVEST_YIELD } from "../core/constants";
import type { Collider, Harvestable } from "../core/types";
import { terrainHeight } from "./terrain";
import { createTree, createRock, createCrate, createShack } from "./props";

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

export class World {
  scene: THREE.Scene;
  colliders: Collider[] = [];
  harvestables: Harvestable[] = [];
  raycastTargets: THREE.Object3D[] = [];
  terrainMesh!: THREE.Mesh;
  sunLight!: THREE.DirectionalLight;

  private nextRefId = 0;
  private harvestableByRefId = new Map<number, Harvestable>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build(): void {
    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildWater();
    this.scatterProps();
  }

  getHeightAt(x: number, z: number): number {
    return terrainHeight(x, z);
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
    this.sunLight = sun;

    const fill = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(fill);
  }

  private buildTerrain(): void {
    const size = WORLD_RADIUS * 2.3;
    const segments = 140;
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
    mesh.userData = { kind: "terrain" };
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

  private scatterProps(): void {
    this.scatterKind(TREE_COUNT, 0.75, () => createTree(), "tree");
    this.scatterKind(ROCK_COUNT, 1.1, () => createRock(), "rock");
    this.scatterStatic(CRATE_COUNT, 0.85, () => createCrate());
    this.scatterStatic(5, 2.6, () => createShack());
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

  private scatterStatic(count: number, radius: number, factory: () => THREE.Group): void {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;
      const { x, z } = this.randomIslandPoint(14, WORLD_RADIUS * 0.85);
      const y = terrainHeight(x, z);
      if (y < 0.1 || this.tooClose(x, z, radius + 1.2)) continue;

      const group = factory();
      group.position.set(x, y, z);
      this.scene.add(group);

      const collider: Collider = { position: group.position, radius };
      this.colliders.push(collider);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.userData = { kind: "prop" };
          this.raycastTargets.push(obj);
        }
      });
      placed++;
    }
  }

  private scatterKind(
    count: number,
    radius: number,
    factory: () => THREE.Group,
    kind: "tree" | "rock"
  ): void {
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;
      const { x, z } = this.randomIslandPoint(10, WORLD_RADIUS * 0.88);
      const y = terrainHeight(x, z);
      if (y < 0.1 || this.tooClose(x, z, radius + 1)) continue;

      const group = factory();
      group.position.set(x, y, z);
      this.scene.add(group);

      const refId = this.nextRefId++;
      const collider: Collider = { position: group.position, radius };
      this.colliders.push(collider);

      const harvestable: Harvestable = {
        kind,
        group,
        hp: 100,
        maxHp: 100,
        alive: true,
        respawnAt: 0,
        collider,
        basePosition: group.position.clone(),
      };
      this.harvestableByRefId.set(refId, harvestable);
      this.harvestables.push(harvestable);

      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.userData = { kind: "harvestable", refId };
          this.raycastTargets.push(obj);
        }
      });

      placed++;
    }
  }

  getHarvestable(refId: number): Harvestable | undefined {
    return this.harvestableByRefId.get(refId);
  }

  /** Returns the amount of material yielded (0 if the target was already depleted). */
  harvest(refId: number): number {
    const h = this.harvestableByRefId.get(refId);
    if (!h || !h.alive) return 0;
    h.hp -= HARVEST_YIELD * 4;
    if (h.hp <= 0) {
      h.alive = false;
      h.group.visible = false;
      h.respawnAt = performance.now() / 1000 + 14;
      const idx = this.colliders.indexOf(h.collider);
      if (idx >= 0) this.colliders.splice(idx, 1);
    } else {
      const s = THREE.MathUtils.clamp(h.hp / h.maxHp, 0.35, 1);
      h.group.scale.set(s, s, s);
    }
    return HARVEST_YIELD;
  }

  update(nowSec: number): void {
    for (const h of this.harvestables) {
      if (!h.alive && nowSec >= h.respawnAt) {
        h.alive = true;
        h.hp = h.maxHp;
        h.group.visible = true;
        h.group.scale.set(1, 1, 1);
        this.colliders.push(h.collider);
      }
    }
  }
}
