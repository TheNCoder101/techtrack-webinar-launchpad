import * as THREE from "three";
import { WORLD_RADIUS } from "./constants";

// One stage of the storm. The zone holds at `radius` for `waitDuration`
// seconds, then (if there is a next stage) shrinks to the next stage's
// radius over that stage's `shrinkDuration`. `damagePerSec` is the tick
// damage applied to anyone caught outside while this stage is active.
export interface StormStage {
  radius: number;
  shrinkDuration: number;
  waitDuration: number;
  damagePerSec: number;
}

// NOTE: pacing/damage numbers are first-pass placeholders — correctness over
// feel. Human playtesting owns the final tuning (see V2 backlog).
export const STORM_STAGES: StormStage[] = [
  { radius: WORLD_RADIUS * 0.97, shrinkDuration: 0, waitDuration: 25, damagePerSec: 2 },
  { radius: WORLD_RADIUS * 0.66, shrinkDuration: 20, waitDuration: 28, damagePerSec: 4 },
  { radius: WORLD_RADIUS * 0.42, shrinkDuration: 16, waitDuration: 24, damagePerSec: 7 },
  { radius: WORLD_RADIUS * 0.24, shrinkDuration: 13, waitDuration: 20, damagePerSec: 10 },
  { radius: WORLD_RADIUS * 0.1, shrinkDuration: 11, waitDuration: Infinity, damagePerSec: 14 },
];

const WALL_HEIGHT = 55;
const WALL_COLOR = 0x8b5cf6;
// Fog shift while the player stands inside the storm (outside the safe zone).
const STORM_FOG_COLOR = new THREE.Color(0x6d5497);
const STORM_FOG_NEAR = WORLD_RADIUS * 0.18;
const STORM_FOG_FAR = WORLD_RADIUS * 0.95;

type StormPhase = "waiting" | "shrinking";

export interface StormStatus {
  label: string;
  /** Seconds until the phase ends, or null for the final held zone. */
  secondsLeft: number | null;
}

// Classic battle-royale shrinking safe zone. Timer-driven state machine in
// the same spirit as AirdropManager: absolute nowSec deadlines, updated once
// per frame from the render loop. The zone center stays at the world origin
// (deliberately simple — no zone drift); only the radius animates.
export class StormManager {
  readonly center = new THREE.Vector3(0, 0, 0);

  private stageIndex = 0;
  private phase: StormPhase = "waiting";
  private phaseStartedAt: number;
  private phaseEndsAt: number;
  private currentRadius = STORM_STAGES[0].radius;

  private wall: THREE.Mesh;
  private wallMat: THREE.MeshBasicMaterial;

  // Fog blend: 0 = normal sky fog, 1 = full storm fog. Eased toward the
  // player's inside/outside state each frame so the shift never pops.
  private fogT = 0;
  private baseFogColor = new THREE.Color();
  private baseFogNear = 0;
  private baseFogFar = 0;
  private fogCaptured = false;
  private workColor = new THREE.Color();

  constructor(private scene: THREE.Scene) {
    const nowSec = performance.now() / 1000;
    this.phaseStartedAt = nowSec;
    this.phaseEndsAt = nowSec + STORM_STAGES[0].waitDuration;

    // Same translucent open-cylinder trick as AirdropManager's crate beacon,
    // scaled up to a world-sized storm wall. Unit radius so update() can set
    // the live radius via scale.
    const geo = new THREE.CylinderGeometry(1, 1, WALL_HEIGHT, 64, 1, true);
    this.wallMat = new THREE.MeshBasicMaterial({
      color: WALL_COLOR,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });
    this.wall = new THREE.Mesh(geo, this.wallMat);
    this.wall.position.set(this.center.x, WALL_HEIGHT / 2 - 2, this.center.z);
    this.wall.scale.set(this.currentRadius, 1, this.currentRadius);
    this.wall.renderOrder = 5;
    scene.add(this.wall);
  }

  get radius(): number {
    return this.currentRadius;
  }

  get damagePerSec(): number {
    // During a shrink, the incoming (smaller, harsher) stage's damage
    // already applies — matches the usual BR escalation curve, where the
    // zone starts punishing you the moment it starts closing, not only once
    // it finishes.
    if (this.phase === "shrinking" && this.stageIndex < STORM_STAGES.length - 1) {
      return STORM_STAGES[this.stageIndex + 1].damagePerSec;
    }
    return STORM_STAGES[this.stageIndex].damagePerSec;
  }

  isOutside(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.center.x;
    const dz = pos.z - this.center.z;
    return dx * dx + dz * dz > this.currentRadius * this.currentRadius;
  }

  status(nowSec: number): StormStatus {
    if (this.phase === "shrinking") {
      return { label: "ZONE SHRINKING", secondsLeft: Math.max(0, this.phaseEndsAt - nowSec) };
    }
    if (this.stageIndex >= STORM_STAGES.length - 1) {
      return { label: "FINAL ZONE", secondsLeft: null };
    }
    return { label: "ZONE SHRINKS IN", secondsLeft: Math.max(0, this.phaseEndsAt - nowSec) };
  }

  update(dt: number, nowSec: number, playerOutside: boolean): void {
    if (this.phase === "waiting") {
      if (nowSec >= this.phaseEndsAt && this.stageIndex < STORM_STAGES.length - 1) {
        this.phase = "shrinking";
        this.phaseStartedAt = nowSec;
        this.phaseEndsAt = nowSec + STORM_STAGES[this.stageIndex + 1].shrinkDuration;
      }
    }

    if (this.phase === "shrinking") {
      const from = STORM_STAGES[this.stageIndex].radius;
      const to = STORM_STAGES[this.stageIndex + 1].radius;
      const duration = Math.max(0.001, this.phaseEndsAt - this.phaseStartedAt);
      const t = THREE.MathUtils.clamp((nowSec - this.phaseStartedAt) / duration, 0, 1);
      this.currentRadius = THREE.MathUtils.lerp(from, to, t);
      if (t >= 1) {
        this.stageIndex += 1;
        this.phase = "waiting";
        this.phaseStartedAt = nowSec;
        this.phaseEndsAt = nowSec + STORM_STAGES[this.stageIndex].waitDuration;
      }
    }

    // Visual: keep the wall at the live radius with a slow rotation and a
    // gentle opacity pulse so it reads as an energy field, not solid glass.
    this.wall.scale.set(this.currentRadius, 1, this.currentRadius);
    this.wall.rotation.y += dt * 0.05;
    this.wallMat.opacity = 0.24 + 0.05 * Math.sin(nowSec * 1.7);

    this.updateFog(dt, playerOutside);
  }

  private updateFog(dt: number, playerOutside: boolean): void {
    const fog = this.scene.fog as THREE.Fog | null;
    if (!fog) return;
    if (!this.fogCaptured) {
      // World.buildSky owns the base fog; snapshot it once on first sight so
      // reverting is exact regardless of what values it shipped with.
      this.baseFogColor.copy(fog.color);
      this.baseFogNear = fog.near;
      this.baseFogFar = fog.far;
      this.fogCaptured = true;
    }

    const target = playerOutside ? 1 : 0;
    const ease = Math.min(1, dt * 2.2);
    this.fogT += (target - this.fogT) * ease;
    if (Math.abs(this.fogT - target) < 0.002) this.fogT = target;

    this.workColor.copy(this.baseFogColor).lerp(STORM_FOG_COLOR, this.fogT);
    fog.color.copy(this.workColor);
    fog.near = THREE.MathUtils.lerp(this.baseFogNear, STORM_FOG_NEAR, this.fogT);
    fog.far = THREE.MathUtils.lerp(this.baseFogFar, STORM_FOG_FAR, this.fogT);
  }

  dispose(): void {
    this.scene.remove(this.wall);
    this.wall.geometry.dispose();
    this.wallMat.dispose();
  }
}
