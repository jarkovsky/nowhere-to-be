// The rendered mesh and the car share this triangular height field.
export const WORLD_SIZE = 1600;
export const VALLEY_RADIUS = 355;
export const SEGMENTS = 240;
export const CELL = WORLD_SIZE / SEGMENTS;
export const LAKE = { x: 93, z: -54, rx: 61, rz: 44, y: -2.2 };
export const SPAWN = { x: -25, z: 99, heading: -0.36 };
export function randomGenerator(seed = 82741) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function lakeDistance(x, z) { return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz); }
export function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  let h = 4 + Math.sin(x * .019) * 5 + Math.cos(z * .022) * 5 + Math.sin(x * .035 + z * .014) * 3;
  h += Math.max(0, r - 180) * .20;
  h += Math.max(0, r - 245) * .12 * (1 + Math.sin(a * 5 + .5));
  h += 18 * Math.exp(-((x + 125) ** 2 + (z + 95) ** 2) / 12000);
  const lake = lakeDistance(x, z);
  if (lake < 1.34) {
    const t = Math.max(0, Math.min(1, (lake - .90) / .44));
    const smooth = t * t * (3 - 2 * t);
    h = -5.5 * (1 - smooth) + h * smooth;
  }
  return h;
}
const heights = new Float32Array((SEGMENTS + 1) ** 2);
for (let z = 0; z <= SEGMENTS; z++) for (let x = 0; x <= SEGMENTS; x++) heights[z * (SEGMENTS + 1) + x] = rawHeight(x * CELL - WORLD_SIZE / 2, z * CELL - WORLD_SIZE / 2);
export { heights };
export function terrainHeight(x, z) {
  const gx = Math.max(0, Math.min(SEGMENTS - .00001, (x + WORLD_SIZE / 2) / CELL));
  const gz = Math.max(0, Math.min(SEGMENTS - .00001, (z + WORLD_SIZE / 2) / CELL));
  const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
  const i = iz * (SEGMENTS + 1) + ix;
  const a = heights[i], b = heights[i + 1], c = heights[i + SEGMENTS + 1], d = heights[i + SEGMENTS + 2];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export function roadPoint(t) {
  const a = t * Math.PI * 2;
  let x = Math.sin(a) * (153 + 20 * Math.sin(a * 3)) - 12, z = Math.cos(a) * (111 + 22 * Math.sin(a * 2)) - 9;
  // Keep the entire trail on the shore, including the bend east of the lake.
  const d = lakeDistance(x, z);
  if (d < 1.44) { x = LAKE.x + (x - LAKE.x) * 1.44 / d; z = LAKE.z + (z - LAKE.z) * 1.44 / d; }
  return { x, z };
}
export const roadPoints = Array.from({ length: 260 }, (_, i) => roadPoint(i / 260));
export function roadDistance(x, z) {
  let d = Infinity;
  for (const p of roadPoints) d = Math.min(d, (x - p.x) ** 2 + (z - p.z) ** 2);
  return Math.sqrt(d);
}
