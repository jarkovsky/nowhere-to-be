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
