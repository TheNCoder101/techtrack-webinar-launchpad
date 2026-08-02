// Tiny seeded PRNG for co-op world generation (V5 F2b) — see World.ts. Both
// peers derive the same numeric seed from the co-op join code (which they
// both already know before either constructs a World), so every
// Math.random() call in prop scatter becomes reproducible across peers with
// zero new protocol messages and no handshake ordering requirement.

/** Same shape as `Math.random`: call with no args, get a float in [0, 1). */
export type RandFn = () => number;

/** mulberry32 — a tiny, fast, decent-quality PRNG. Given the same 32-bit
 *  seed it produces the exact same sequence of floats every time, which is
 *  the only property that matters here (this is not used anywhere
 *  security-sensitive). */
export function mulberry32(seed: number): RandFn {
  let a = seed >>> 0;
  return function mulberry32Next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hashes an arbitrary string (the co-op peer id, which embeds the 4-char
 *  join code — see Game's World construction) down to a 32-bit seed. djb2:
 *  tiny and more than sufficient for fanning a short join code out to a
 *  well-distributed seed — this has no security properties to uphold. */
export function seedFromString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}
