import * as THREE from "three";

const DEFAULT_MAX_PARTICLES = 220;

interface ParticleSlot {
  active: boolean;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
}

function makeDotTexture(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Single-draw-call GPU-friendly particle burst system (points buffer, fixed
// pool, no per-spawn allocation) used for hit sparks, muzzle flash and
// harvest debris.
export class ParticleSystem {
  private maxParticles: number;
  private geometry: THREE.BufferGeometry;
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private slots: ParticleSlot[] = [];

  constructor(scene: THREE.Scene, maxParticles: number = DEFAULT_MAX_PARTICLES) {
    this.maxParticles = maxParticles;
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1));

    // PointsMaterial only supports a single uniform size, but particles need
    // to shrink individually as they fade — use a small custom shader that
    // reads a per-vertex "size" attribute instead.
    const material = new THREE.ShaderMaterial({
      uniforms: { pointTexture: { value: makeDotTexture() } },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (280.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(pointTexture, gl_PointCoord);
          if (tex.a < 0.02) discard;
          gl_FragColor = vec4(vColor, 1.0) * tex;
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (let i = 0; i < this.maxParticles; i++) {
      this.slots.push({
        active: false,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 0.2,
        gravity: 6,
      });
      this.sizes[i] = 0;
    }
  }

  burst(
    origin: THREE.Vector3,
    color: THREE.Color,
    count: number,
    speed: number,
    spread = 1,
    gravity = 6,
    life = 0.5
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const slot = this.slots[i];
      if (slot.active) continue;

      slot.active = true;
      slot.life = life * (0.7 + Math.random() * 0.6);
      slot.maxLife = slot.life;
      slot.gravity = gravity;
      slot.size = 0.14 + Math.random() * 0.16;

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 0.8 + 0.1,
        (Math.random() - 0.5) * spread
      ).normalize();
      slot.velocity.copy(dir).multiplyScalar(speed * (0.5 + Math.random() * 0.8));

      this.positions[i * 3] = origin.x;
      this.positions[i * 3 + 1] = origin.y;
      this.positions[i * 3 + 2] = origin.z;
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
      this.sizes[i] = slot.size;

      spawned++;
    }
  }

  update(dt: number): void {
    let anyActive = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const slot = this.slots[i];
      if (!slot.active) continue;
      anyActive = true;

      slot.life -= dt;
      if (slot.life <= 0) {
        slot.active = false;
        this.sizes[i] = 0;
        continue;
      }

      slot.velocity.y -= slot.gravity * dt;
      this.positions[i * 3] += slot.velocity.x * dt;
      this.positions[i * 3 + 1] += slot.velocity.y * dt;
      this.positions[i * 3 + 2] += slot.velocity.z * dt;

      const t = slot.life / slot.maxLife;
      this.sizes[i] = slot.size * t;
    }

    if (anyActive) {
      (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      (this.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}
