// The height field shared by the ground mesh, the car and everything placed
// on the ground. Heights live on a grid that is fine across the valley floor
// and coarse out under the distant mountains.
import { clamp, lerp, smoothstep } from '../core/math.js';
import {
  WORLD_SIZE,
  VALLEY_RADIUS,
  LAKE,
  ROAD,
  ROAD_HALF_WIDTH,
  CREEK,
  CREEK_HALF_WIDTH,
  CAMP_TRAIL,
  WATERFALL,
  BRIDGE,
  TUNNEL,
  PADS,
  lakeDistance,
} from './layout.js';

const HALF = WORLD_SIZE / 2;
const INNER = 385;
const FINE_CELL = 3.5;
const FINE_CELLS = Math.round((2 * INNER) / FINE_CELL);
const COARSE_CELLS = 26;
const COARSE_CELL = (HALF - INNER) / COARSE_CELLS;

/** World coordinate of every grid line, identical for X and Z. */
export const AXIS = Float64Array.from([
  ...Array.from({ length: COARSE_CELLS }, (_, i) => -HALF + i * COARSE_CELL),
  ...Array.from({ length: FINE_CELLS + 1 }, (_, i) => -INNER + i * FINE_CELL),
  ...Array.from({ length: COARSE_CELLS }, (_, i) => INNER + (i + 1) * COARSE_CELL),
]);
export const GRID = AXIS.length;

function gridCoordinate(value) {
  let g;
  if (value < -INNER) g = (value + HALF) / COARSE_CELL;
  else if (value <= INNER) g = COARSE_CELLS + (value + INNER) / FINE_CELL;
  else g = COARSE_CELLS + FINE_CELLS + (value - INNER) / COARSE_CELL;
  return clamp(g, 0, GRID - 1.000001);
}

/** Rolling meadows, a rim of steep hillsides and the lake basin. */
export function naturalHeight(x, z) {
  const r = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  let h = 4 + Math.sin(x * 0.019) * 5 + Math.cos(z * 0.022) * 5 + Math.sin(x * 0.035 + z * 0.014) * 3;
  h += Math.max(0, r - 180) * 0.2;
  h += Math.max(0, r - 245) * 0.12 * (1 + Math.sin(angle * 5 + 0.5));
  h += 18 * Math.exp(-((x + 125) ** 2 + (z + 95) ** 2) / 12000);
  const lake = lakeDistance(x, z);
  if (lake < 1.34) h = lerp(-5.5, h, smoothstep(lake, 0.9, 1.34));
  return h;
}

const heights = new Float32Array(GRID * GRID);

function sampleGrid(x, z) {
  const gx = gridCoordinate(x);
  const gz = gridCoordinate(z);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const u = gx - ix;
  const v = gz - iz;
  const i = iz * GRID + ix;
  const a = heights[i];
  const b = heights[i + 1];
  const c = heights[i + GRID];
  const d = heights[i + GRID + 1];
  // Same diagonal split as the ground mesh, so the car follows every facet.
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

/** Calls `visit(index, x, z, distance)` for grid vertices within `radius` of a point. */
function forEachVertexNear(x, z, radius, visit) {
  const x0 = Math.floor(gridCoordinate(x - radius));
  const x1 = Math.ceil(gridCoordinate(x + radius));
  const z0 = Math.floor(gridCoordinate(z - radius));
  const z1 = Math.ceil(gridCoordinate(z + radius));
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const distance = Math.hypot(AXIS[ix] - x, AXIS[iz] - z);
      if (distance <= radius) visit(iz * GRID + ix, AXIS[ix], AXIS[iz], distance);
    }
  }
}

/** For every vertex near a path: the closest sample index and distance to it. */
function nearestSamples(path, radius) {
  const nearest = new Map();
  path.samples.forEach((sample, index) => {
    forEachVertexNear(sample.x, sample.z, radius, (vertex, _x, _z, distance) => {
      const current = nearest.get(vertex);
      if (!current || distance < current.distance) nearest.set(vertex, { index, distance });
    });
  });
  return nearest;
}

function smoothProfile(values, window, closed) {
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = -window; k <= window; k++) {
      const j = closed ? (i + k + values.length) % values.length : i + k;
      if (j < 0 || j >= values.length) continue;
      sum += values[j];
      count++;
    }
    return sum / count;
  });
}

/** Level the ground across a path so the car doesn't lean sideways on it. */
function levelAlong(path, flatWidth, falloff) {
  const profile = smoothProfile(
    path.samples.map(p => sampleGrid(p.x, p.z)),
    14,
    path.closed,
  );
  const reach = s => flatWidth(s) + falloff;
  const maxReach = Math.max(...path.samples.map(p => reach(p.s)));
  for (const [vertex, { index, distance }] of nearestSamples(path, maxReach)) {
    const s = path.samples[index].s;
    const weight = 1 - smoothstep(distance, flatWidth(s), reach(s));
    heights[vertex] = lerp(heights[vertex], profile[index], weight);
  }
  return profile;
}

function isInTunnel(s) {
  const delta = Math.abs(ROAD.wrap(s - TUNNEL.s + ROAD.length / 2) - ROAD.length / 2);
  return delta < TUNNEL.length / 2 + 6;
}

// --- Build the height field -------------------------------------------------

for (let iz = 0; iz < GRID; iz++) {
  for (let ix = 0; ix < GRID; ix++) heights[iz * GRID + ix] = naturalHeight(AXIS[ix], AXIS[iz]);
}

for (const pad of PADS) {
  const level = naturalHeight(pad.x, pad.z);
  forEachVertexNear(pad.x, pad.z, pad.radius + pad.falloff, (vertex, _x, _z, distance) => {
    heights[vertex] = lerp(heights[vertex], level, 1 - smoothstep(distance, pad.radius, pad.radius + pad.falloff));
  });
}

levelAlong(CAMP_TRAIL, () => 2.4, 5);
// The tunnel floor is levelled wider than the bore so no ground pokes inside.
const roadProfile = levelAlong(ROAD, s => (isInTunnel(s) ? 9 : ROAD_HALF_WIDTH + 1.4), 7);

/** Height of the trail surface at the bridge, used to dig the creek deep enough. */
const roadAtBridge = roadProfile[ROAD.samples.findIndex(p => p.s === BRIDGE.s)];

// The creek bed always runs downhill and stays well below its banks.
const POOL_DEPTH = 1.1;
const WATER_DEPTH = 0.55;
const creekBed = (() => {
  const bank = CREEK.samples.map(p => sampleGrid(p.x, p.z));
  const bridgeS = CREEK.nearest(BRIDGE.x, BRIDGE.z).s;
  // Falls from the pool, a gully deep enough to need the bridge, then the lake.
  const profile = [
    [0, bank[0] - 1.6],
    [bridgeS, roadAtBridge - 3],
    [CREEK.length, LAKE.level - 1.2],
  ];
  let lowest = Infinity;
  return CREEK.samples.map((p, i) => {
    const k = p.s < bridgeS ? 0 : 1;
    const [s0, h0] = profile[k];
    const [s1, h1] = profile[k + 1];
    const bed = Math.min(lerp(h0, h1, (p.s - s0) / (s1 - s0)), bank[i] - 1.5);
    lowest = Math.min(lowest, bed);
    return lowest;
  });
})();

for (const [vertex, { index, distance }] of nearestSamples(CREEK, 18)) {
  const bank = creekBed[index] + Math.max(0, distance - CREEK_HALF_WIDTH) * 0.55;
  heights[vertex] = Math.min(heights[vertex], bank);
}

const POOL_LEVEL = creekBed[0] + WATER_DEPTH;
forEachVertexNear(WATERFALL.x, WATERFALL.z, 22, (vertex, _x, _z, distance) => {
  const bowl = POOL_LEVEL - POOL_DEPTH + Math.max(0, distance - WATERFALL.poolRadius * 0.55) * 0.5;
  heights[vertex] = Math.min(heights[vertex], bowl);
});

export { heights };

// --- Queries -----------------------------------------------------------------

/** Ground height at any point, matching the rendered ground exactly. */
export const terrainHeight = sampleGrid;

/** Water surface height of the creek at a distance along it. */
export function creekLevel(s) {
  const i = clamp(Math.round(s / CREEK.spacing), 0, creekBed.length - 1);
  return creekBed[i] + WATER_DEPTH;
}

export const POOL = { x: WATERFALL.x, z: WATERFALL.z, level: POOL_LEVEL };

/** Height of the water surface at a point, or -Infinity where it's dry. */
export function waterLevel(x, z) {
  let level = -Infinity;
  if (lakeDistance(x, z) < 1.4) level = LAKE.level;
  if (Math.hypot(x - POOL.x, z - POOL.z) < WATERFALL.poolRadius + 6) level = Math.max(level, POOL.level);
  if (x > 135 && x < 235 && z > -75 && z < -35) {
    const creek = CREEK.nearest(x, z);
    if (creek.distance < CREEK_HALF_WIDTH + 4) level = Math.max(level, creekLevel(creek.s));
  }
  return level;
}

export function waterDepth(x, z) {
  return Math.max(0, waterLevel(x, z) - terrainHeight(x, z));
}

// --- The bridge deck -----------------------------------------------------------

function bridgeLocal(x, z) {
  const dx = x - BRIDGE.x;
  const dz = z - BRIDGE.z;
  return { along: dx * BRIDGE.dx + dz * BRIDGE.dz, side: -dx * BRIDGE.dz + dz * BRIDGE.dx };
}

const bridgeEnds = [-1, 1].map(sign =>
  terrainHeight(BRIDGE.x + (BRIDGE.dx * sign * BRIDGE.length) / 2, BRIDGE.z + (BRIDGE.dz * sign * BRIDGE.length) / 2),
);

/** Top of the bridge planks at a distance along the bridge, from its centre. */
export function deckHeight(along) {
  const t = clamp(along / BRIDGE.length + 0.5, 0, 1);
  return lerp(bridgeEnds[0], bridgeEnds[1], t) + Math.sin(t * Math.PI) * 0.45 + 0.12;
}

export function bridgeHeight(x, z) {
  const { along, side } = bridgeLocal(x, z);
  if (Math.abs(side) > BRIDGE.width / 2 || Math.abs(along) > BRIDGE.length / 2) return null;
  return deckHeight(along);
}

/** The surface the tyres rest on: the bridge deck where there is one, otherwise the ground. */
export function drivingHeight(x, z) {
  const ground = terrainHeight(x, z);
  const deck = bridgeHeight(x, z);
  return deck === null ? ground : Math.max(ground, deck);
}

/** True where the car is allowed to be: inside the fence and out of deep water. */
export function isDriveable(x, z) {
  if (Math.hypot(x, z) > VALLEY_RADIUS) return false;
  if (bridgeHeight(x, z) !== null) return true;
  return waterDepth(x, z) < 0.95;
}
