// Tiny hand-rolled value-noise implementation (no external deps needed for a
// procedural low-poly island). Deterministic given (x, y).

const hash2 = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const valueNoise2D = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tl = hash2(xi, yi);
  const tr = hash2(xi + 1, yi);
  const bl = hash2(xi, yi + 1);
  const br = hash2(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
};

export const fbm2D = (x: number, y: number, octaves = 4): number => {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise2D(x * freq, y * freq) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / max;
};

export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

export const smoothstepClamp = (x: number, edge0: number, edge1: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export { lerp };
