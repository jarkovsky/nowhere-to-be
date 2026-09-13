export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(value, edge0, edge1) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach towards `target`. */
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));

/** Signed shortest difference between two angles, in radians. */
export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Small deterministic PRNG (mulberry32) so the valley looks the same on every visit. */
export function createRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance from point P to segment AB, plus the clamped position along it (0..1). */
export function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq ? clamp(((px - ax) * dx + (pz - az) * dz) / lengthSq, 0, 1) : 0;
  return { distance: Math.hypot(px - ax - dx * t, pz - az - dz * t), t };
}

function hash(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. The same inputs always give the same result. */
export function valueNoise(x, z, seed = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const u = (x - ix) * (x - ix) * (3 - 2 * (x - ix));
  const v = (z - iz) * (z - iz) * (3 - 2 * (z - iz));
  const top = lerp(hash(ix, iz, seed), hash(ix + 1, iz, seed), u);
  const bottom = lerp(hash(ix, iz + 1, seed), hash(ix + 1, iz + 1, seed), u);
  return lerp(top, bottom, v);
}

/** Several octaves of value noise, each finer and fainter than the last. Roughly [0, 1]. */
export function fractalNoise(x, z, octaves = 3, seed = 0) {
  let sum = 0;
  let total = 0;
  let amplitude = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x, z, seed + i) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    x *= 2.03;
    z *= 2.03;
  }
  return sum / total;
}
