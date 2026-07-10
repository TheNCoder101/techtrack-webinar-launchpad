import { WORLD_RADIUS } from "../core/constants";
import { fbm2D, lerp, smoothstepClamp } from "./noise";

// Analytic height field for the island. Shared by the terrain mesh builder,
// the player controller, prop scattering and bot AI so everything agrees on
// "the ground" without needing per-frame raycasts against the mesh.
export function terrainHeight(x: number, z: number): number {
  const dist = Math.sqrt(x * x + z * z);

  const island = 1 - smoothstepClamp(dist, WORLD_RADIUS * 0.52, WORLD_RADIUS * 0.96);
  const base = fbm2D(x * 0.018, z * 0.018, 5) * 11;
  const hills = fbm2D(x * 0.06 + 100, z * 0.06 + 100, 3) * 2.6;
  let h = (base + hills) * island - 1.5 * (1 - island);

  if (dist > WORLD_RADIUS * 0.96) {
    h -= (dist - WORLD_RADIUS * 0.96) * 0.55;
  }

  // Flatten the spawn plateau near the origin so the player doesn't start on a slope.
  const spawnFlat = 1 - smoothstepClamp(dist, 5, 20);
  h = lerp(h, 0.6, spawnFlat);

  return h;
}

export function isInBounds(x: number, z: number): boolean {
  return Math.sqrt(x * x + z * z) < WORLD_RADIUS * 0.94;
}
