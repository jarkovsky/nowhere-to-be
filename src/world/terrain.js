// The height field shared by the ground mesh, the car and everything placed
// on the ground. Heights live on a grid that is fine across the valley floor
// and coarse out under the distant mountains.
import { clamp, fractalNoise, lerp, smoothstep, valueNoise } from '../core/math.js';
import {
  WORLD_SIZE,
  VALLEY_RADIUS,
  LAKE,
  ROAD,
  ROAD_HALF_WIDTH,
  CREEK,
  CREEK_HALF_WIDTH,
  CAMP_TRAIL,
  TRACKS,
  RAILWAY,
  RAIL_GRADE,
  LEVEL_CROSSING,
  WATERFALL,
  BRIDGE,
  JETTY,
  TUNNEL,
  PADS,
  KNOLLS,
  SERLICH,
  MESA,
  SUMMIT,
  FIELDS,
  UPLAND_HILLS,
  AIRFIELD,
  LINKS,
  RING_ROAD,
  lakeDistance,
  ringRadius,
} from './layout.js';

const HALF = WORLD_SIZE / 2;
const INNER = 560;
const MIDDLE = 780;

/**
 * The grid along each axis: fine 3.5 m cells across the middle, where the car
 * can go, medium cells out to the far side of the fence, then coarse ones under
 * the distant mountains.
 */
const BANDS = [
  { from: -HALF, to: -MIDDLE, cells: 20 },
  { from: -MIDDLE, to: -INNER, cells: 40 },
  { from: -INNER, to: INNER, cells: 320 },
  { from: INNER, to: MIDDLE, cells: 40 },
  { from: MIDDLE, to: HALF, cells: 20 },
];
{
  let start = 0;
  for (const band of BANDS) {
    Object.assign(band, { start, size: (band.to - band.from) / band.cells });
    start += band.cells;
  }
}
const FINE = BANDS[2];

/** World coordinate of every grid line, identical for X and Z. */
export const AXIS = Float64Array.from([
  ...BANDS.flatMap(band => Array.from({ length: band.cells }, (_, i) => band.from + i * band.size)),
  HALF,
]);
export const GRID = AXIS.length;

function gridCoordinate(value) {
  let g;
  if (value >= -INNER && value <= INNER) g = FINE.start + (value + INNER) / FINE.size;
  else {
    const band = BANDS.find(b => value <= b.to) ?? BANDS[BANDS.length - 1];
    g = band.start + (value - band.from) / band.size;
  }
  return clamp(g, 0, GRID - 1.000001);
}

const LAKE_BED = -5.5;

const bump = (x, z, cx, cz, radius, height) => height * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / radius ** 2);

const softplus = x => (x > 30 ? x : Math.log1p(Math.exp(x)));

/**
 * How high the rim has risen at a distance from the centre: it climbs steadily out
 * of the valley, levels off onto the uplands past the old fence, and rises into a
 * wall of mountains beyond the new one. Higher in five ragged lobes, lower in the
 * passes between them.
 */
function rimHeight(r, angle) {
  const lobes = 1 + Math.sin(angle * 5 + 0.5);
  const valley = (r0 => Math.max(0, r0 - 180) * 0.2 + Math.max(0, r0 - 245) * 0.12 * lobes)(Math.min(r, 330));
  const climb = 0.2 + 0.12 * lobes;
  const uplands = r > 330 ? climb * 42 * (1 - Math.exp(-(r - 330) / 42)) : 0;
  const wall = softplus((r - 672) / 14) * 14 * (0.45 + 0.12 * lobes);
  return valley + uplands + wall;
}

/** The landscape before anything is levelled or dug out. */
function wildHeight(x, z) {
  const r = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  // Noise is sampled on rotated axes so no ridge lines up with the grid.
  const u = x * 0.8 - z * 0.6;
  const v = x * 0.6 + z * 0.8;
  // Broad swells, smaller hummocks and a gentle regular roll.
  let h = 4 + (fractalNoise(u / 190 + 7.3, v / 190 + 3.1, 3) - 0.5) * 22;
  h += (valueNoise(u / 48, v / 48, 11) - 0.5) * 4;
  h += Math.sin(x * 0.019) * 2.5 + Math.cos(z * 0.022) * 2.5;
  h += rimHeight(r, angle);

  h += bump(x, z, -125, -95, 110, 18); // the foothills of Echo Mountain
  for (const knoll of [...KNOLLS, SERLICH, SUMMIT, ...UPLAND_HILLS])
    h += bump(x, z, knoll.x, knoll.z, knoll.radius, knoll.height);
  h += MESA.height * (1 - smoothstep(Math.hypot(x - MESA.x, z - MESA.z), MESA.top, MESA.edge));
  // Rough, rocky hills to the north (negative Z), smoothing out on the slopes of Šerlich
  // and growing more rugged out in the uplands.
  const crags = smoothstep(-z, 150, 240) * smoothstep(Math.hypot(x - SERLICH.x, z - SERLICH.z), 50, 95);
  if (crags > 0) {
    // Out in the uplands the crags grow taller and further apart.
    const out = smoothstep(r, 345, 430);
    const near = Math.max(0, fractalNoise(v / 52, u / 52, 3, 23) - 0.3) * 34;
    const far = out > 0 ? Math.max(0, fractalNoise(v / 95 + 4.1, u / 95 + 2.7, 3, 29) - 0.32) * 62 : 0;
    // They give way to a pass where the upland road goes through.
    const pass = r > 420 ? 1 - smoothstep(Math.abs(r - ringRadius(angle)), 30, 120) : 0;
    h += crags * lerp(near, far, out) * (1 - 0.9 * pass);
  }
  // A shelf behind the waterfall, so the stream drops off real high ground.
  h += 12 * smoothstep(x - WATERFALL.x, 4, 36) * (1 - smoothstep(Math.abs(z - WATERFALL.z), 26, 70));
  return h;
}

// The upland road runs along a broad shelf: near its line the ground eases towards
// a gently graded profile, so the road climbs and dips with the land without cliffs
// or crags in the way.
const RING_STEPS = 720;
const ringProfile = (() => {
  const raw = Array.from({ length: RING_STEPS }, (_, i) => {
    const angle = (i / RING_STEPS) * Math.PI * 2;
    const radius = ringRadius(angle);
    return wildHeight(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  const reach = 30; // fifteen degrees either way
  return raw.map((_, i) => {
    let sum = 0;
    for (let k = -reach; k <= reach; k++) sum += raw[(i + k + RING_STEPS) % RING_STEPS];
    return sum / (2 * reach + 1);
  });
})();

/** The landscape before the farmland is levelled and the lake dug out. */
function roughHeight(x, z) {
  const h = wildHeight(x, z);
  const r = Math.hypot(x, z);
  if (r < 420) return h;
  const angle = Math.atan2(z, x);
  const shelf = 1 - smoothstep(Math.abs(r - ringRadius(angle)), 18, 100);
  if (shelf <= 0) return h;
  const u = ((((angle / (Math.PI * 2)) * RING_STEPS) % RING_STEPS) + RING_STEPS) % RING_STEPS;
  const i = Math.floor(u);
  const level = lerp(ringProfile[i], ringProfile[(i + 1) % RING_STEPS], u - i);
  return lerp(h, level, shelf);
}

const FIELDS_LEVEL = roughHeight(FIELDS.x, FIELDS.z);
const AIRFIELD_LEVEL = roughHeight(
  (AIRFIELD.ground.x0 + AIRFIELD.ground.x1) / 2,
  (AIRFIELD.ground.z0 + AIRFIELD.ground.z1) / 2,
);

/**
 * The untouched landscape: rolling meadows, a few hills, crags to the north,
 * uplands beyond the valley rim, a broad bowl for the lake and level farmland.
 */
export function naturalHeight(x, z) {
  let h = roughHeight(x, z);
  const farmland = 1 - smoothstep(Math.hypot(x - FIELDS.x, z - FIELDS.z), FIELDS.radius, FIELDS.radius + 60);
  if (farmland > 0) {
    const gentle = FIELDS_LEVEL + Math.sin(x * 0.015) * 1.5 + Math.cos(z * 0.012) * 1.5;
    h = lerp(h, gentle, farmland * 0.9);
  }
  const { ground } = AIRFIELD;
  const outside = Math.hypot(Math.max(0, ground.x0 - x, x - ground.x1), Math.max(0, ground.z0 - z, z - ground.z1));
  if (outside < 50) h = lerp(h, AIRFIELD_LEVEL, 1 - smoothstep(outside, 0, 50));
  const lake = lakeDistance(x, z);
  if (lake < 2.1) h = lerp(LAKE_BED, h, smoothstep(lake, 0.92, 2.1));
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

// Scratch space for nearestSamples(): the closest sample found so far for each vertex.
// Only needed while the height field is built, and let go of afterwards.
let closestIndex = new Int32Array(GRID * GRID).fill(-1);
let closestDistance = new Float64Array(GRID * GRID);

/** For every vertex near a path: the closest sample index and distance to it, as [vertex, { index, distance }]. */
function nearestSamples(path, radius) {
  const touched = [];
  path.samples.forEach((sample, index) => {
    forEachVertexNear(sample.x, sample.z, radius, (vertex, _x, _z, distance) => {
      if (closestIndex[vertex] < 0) touched.push(vertex);
      else if (distance >= closestDistance[vertex]) return;
      closestIndex[vertex] = index;
      closestDistance[vertex] = distance;
    });
  });
  const nearest = touched.map(vertex => [vertex, { index: closestIndex[vertex], distance: closestDistance[vertex] }]);
  for (const vertex of touched) closestIndex[vertex] = -1;
  return nearest;
}

function smoothProfile(values, window, closed) {
  const n = values.length;
  // Open paths are extended past their ends by mirroring the slope, so the
  // smoothed profile still starts and finishes at the real ground height.
  const at = j => {
    if (closed) return values[(j + n) % n];
    if (j < 0) return 2 * values[0] - values[Math.min(-j, n - 1)];
    if (j >= n) return 2 * values[n - 1] - values[Math.max(2 * n - 2 - j, 0)];
    return values[j];
  };
  return values.map((_, i) => {
    let sum = 0;
    for (let k = -window; k <= window; k++) sum += at(i + k);
    return sum / (2 * window + 1);
  });
}

/**
 * Keeps a profile from climbing or falling faster than `grade`: halfway between the
 * highest and the lowest profiles that can't, so where the ground is steeper the road
 * cuts into it about as much as it runs on a bank.
 */
function limitGrade(profile, spacing, grade, closed) {
  const n = profile.length;
  const step = grade * spacing;
  const envelope = pick => {
    const out = [...profile];
    for (let pass = 0; pass < (closed ? 2 : 1); pass++) {
      for (let i = 1; i < n + (closed ? 1 : 0); i++)
        out[i % n] = pick(out[i % n], out[i - 1] + step * (pick === Math.min ? 1 : -1));
      for (let i = n - 2; i >= (closed ? -1 : 0); i--)
        out[(i + n) % n] = pick(out[(i + n) % n], out[(i + 1) % n] + step * (pick === Math.min ? 1 : -1));
    }
    return out;
  };
  const upper = envelope(Math.min);
  const lower = envelope(Math.max);
  const out = upper.map((u, i) => (u + lower[i]) / 2);
  if (closed) return out;
  // An open path keeps its ends where they were, so it meets the roads at either end.
  const start = profile[0] - out[0];
  const end = profile[n - 1] - out[n - 1];
  return out.map((h, i) => h + lerp(start, end, i / (n - 1)));
}

/**
 * Level the ground across a path so the car doesn't lean sideways on it. The profile
 * along it is the ground smoothed over `window` metres either way, and no steeper than
 * `grade`; `banks` widens the sides of deeper cuttings and embankments so they slope gently.
 */
function levelAlong(path, flatWidth, falloff, { window = 14, banks = 0, grade = Infinity, flatEnds = 0, levels } = {}) {
  const smooth =
    levels ??
    smoothProfile(
      path.samples.map(p => sampleGrid(p.x, p.z)),
      Math.round(window / path.spacing),
      path.closed,
    );
  const profile = Number.isFinite(grade) ? limitGrade(smooth, path.spacing, grade, path.closed) : smooth;
  if (flatEnds) {
    // Level for the first and last few metres, so it meets the roads at its ends square on.
    const last = profile.length - 1;
    const [start, end] = [profile[0], profile[last]];
    path.samples.forEach(({ s }, i) => {
      profile[i] = lerp(start, profile[i], smoothstep(s, flatEnds * 0.4, flatEnds * 1.6));
      profile[i] = lerp(end, profile[i], smoothstep(path.length - s, flatEnds * 0.4, flatEnds * 1.6));
    });
  }
  const reach = s => flatWidth(s) + falloff;
  const maxReach = Math.max(...path.samples.map(p => reach(p.s))) + (banks ? 24 : 0);
  for (const [vertex, { index, distance }] of nearestSamples(path, maxReach)) {
    const s = path.samples[index].s;
    const bank = banks ? Math.min(24, Math.abs(heights[vertex] - profile[index]) * banks) : 0;
    const weight = 1 - smoothstep(distance, flatWidth(s), reach(s) + bank);
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

function flattenPads() {
  for (const pad of PADS) {
    const level = naturalHeight(pad.x, pad.z);
    forEachVertexNear(pad.x, pad.z, pad.radius + pad.falloff, (vertex, _x, _z, distance) => {
      heights[vertex] = lerp(heights[vertex], level, 1 - smoothstep(distance, pad.radius, pad.radius + pad.falloff));
    });
  }
}

/**
 * The railway bed: an even slope from the halt down to the level crossing, then
 * an even climb, embanked over dips and cut into the hillside up to the tunnel
 * portal. Beyond the portal the hill is left whole.
 */
function levelRailway() {
  const natural = smoothProfile(
    RAILWAY.samples.map(p => sampleGrid(p.x, p.z)),
    20,
    false,
  );
  const crossing = RAILWAY.samples.findIndex(p => p.s >= LEVEL_CROSSING.s);
  const [start, atCrossing] = [natural[0], natural[crossing]];
  const profile = RAILWAY.samples.map((p, i) =>
    i <= crossing
      ? start + ((atCrossing - start) * p.s) / LEVEL_CROSSING.s
      : atCrossing + (p.s - LEVEL_CROSSING.s) * RAIL_GRADE,
  );
  const last = RAILWAY.samples.length - 1;
  // Wide enough for the halt's platform at the start; deeper cuttings and higher embankments get wider banks.
  const flat = s => (s < 40 ? 8 : 3.2);
  for (const [vertex, { index, distance }] of nearestSamples(RAILWAY, 34)) {
    const p = RAILWAY.samples[index];
    // The cutting runs a few metres past the portal, under its headwall; the hill beyond is left whole.
    const beyond = (AXIS[vertex % GRID] - p.x) * p.dx + (AXIS[Math.floor(vertex / GRID)] - p.z) * p.dz;
    if (index === last && beyond > 9) continue;
    const depth = Math.abs(heights[vertex] - profile[index]);
    const weight = 1 - smoothstep(distance, flat(p.s), flat(p.s) + 5 + depth);
    heights[vertex] = lerp(heights[vertex], profile[index], weight);
  }
  return profile;
}

levelAlong(CAMP_TRAIL, () => 2.4, 6);
for (const track of TRACKS) levelAlong(track.path, () => track.width ?? 2, 8);
const PAVED_WIDTH = () => ROAD_HALF_WIDTH + 1.4;
const ringLevels = levelAlong(RING_ROAD, PAVED_WIDTH, 10, { window: 30, banks: 1.5, grade: 0.1 });
const railProfile = levelRailway();
// Pads come after the side tracks so the tracks run up onto level ground.
flattenPads();

// The tunnel floor is levelled wider than the bore so no ground pokes inside.
const trailWidth = s => (isInTunnel(s) ? 9 : ROAD_HALF_WIDTH + 1.4);
const roadProfile = levelAlong(ROAD, trailWidth, 10);
// The paved roads up to the ring leave the finished trail and meet the ring on the level,
// and climb steadily in between, cutting into the hillside or running on low banks. The
// trail and the ring are then put back where the roads joined them.
for (const link of LINKS)
  levelAlong(link.path, PAVED_WIDTH, 10, { window: 30, banks: 1.5, grade: link.grade, flatEnds: 10 });
levelAlong(ROAD, trailWidth, 0.5, { levels: roadProfile });
levelAlong(RING_ROAD, PAVED_WIDTH, 0.5, { levels: ringLevels });

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
// The pool reaches right under the foot of the cliff, so the falls land in water.
forEachVertexNear(WATERFALL.x, WATERFALL.z, 30, (vertex, _x, _z, distance) => {
  const bowl = POOL_LEVEL - POOL_DEPTH + Math.max(0, distance - WATERFALL.poolRadius - 0.8) * 1.4;
  heights[vertex] = Math.min(heights[vertex], bowl);
});

closestIndex = closestDistance = null;

export { heights };

// The rail bed's height along the line. Where the trail was levelled across it
// at the crossing, it eases onto the finished ground instead.
const railBed = smoothProfile(
  RAILWAY.samples.map((p, i) => {
    const onRoad = 1 - smoothstep(ROAD.nearest(p.x, p.z).distance, ROAD_HALF_WIDTH, 18);
    return lerp(railProfile[i], sampleGrid(p.x, p.z), onRoad);
  }),
  8,
  false,
);

// --- Queries -----------------------------------------------------------------

/** Ground height at any point, matching the rendered ground exactly. */
export const terrainHeight = sampleGrid;

/** Water surface height of the creek at a distance along it. */
export function creekLevel(s) {
  const i = clamp(Math.round(s / CREEK.spacing), 0, creekBed.length - 1);
  return creekBed[i] + WATER_DEPTH;
}

export const POOL = { x: WATERFALL.x, z: WATERFALL.z, level: POOL_LEVEL };

/** Height of the railway's bed at distance `s` along the line. */
export function railLevel(s) {
  const last = railBed.length - 1;
  const end = RAILWAY.samples[last].s;
  if (s > end) return railBed[last] + (s - end) * RAIL_GRADE;
  const u = clamp(s / RAILWAY.spacing, 0, last);
  const i = Math.min(Math.floor(u), last - 1);
  return lerp(railBed[i], railBed[i + 1], u - i);
}

/** Height of the water surface at a point, or -Infinity where it's dry. */
export function waterLevel(x, z) {
  let level = -Infinity;
  if (lakeDistance(x, z) < 2) level = LAKE.level;
  if (Math.hypot(x - POOL.x, z - POOL.z) < WATERFALL.poolRadius + 6) level = Math.max(level, POOL.level);
  if (x > 135 && x < 235 && z > -75 && z < -35) {
    const creek = CREEK.nearest(x, z);
    if (creek.distance < CREEK_HALF_WIDTH + 4) level = Math.max(level, creekLevel(creek.s));
  }
  return level;
}

/** Roughly where the snow starts, in metres above the valley floor. */
export const SNOWLINE = 116;

/** How snowy the ground is: 0 below the snowline, 1 above it. The line wanders a little. */
export function snowCover(x, z, h = terrainHeight(x, z)) {
  const line = SNOWLINE + (valueNoise(x / 37, z / 37, 41) - 0.5) * 16;
  return smoothstep(h, line - 1.5, line + 1.5);
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

// --- The jetty -------------------------------------------------------------------

/** The jetty's planks sit at one height, a little above the lake. */
export const JETTY_DECK = LAKE.level + 0.8;

/** Top of the jetty planks at a point, or null off the jetty. It starts under the beach and runs out over the water. */
export function jettyHeight(x, z) {
  const outX = -Math.sin(JETTY.heading);
  const outZ = -Math.cos(JETTY.heading);
  const dx = x - JETTY.x;
  const dz = z - JETTY.z;
  const along = dx * outX + dz * outZ;
  const side = -dx * outZ + dz * outX;
  if (Math.abs(side) > JETTY.width / 2 || along < -6 || along > JETTY.length) return null;
  return JETTY_DECK;
}

/** True where the tyres are on planks rather than ground: the bridge, or the part of the jetty above the beach. */
export function onDeck(x, z) {
  if (bridgeHeight(x, z) !== null) return true;
  return jettyHeight(x, z) !== null && JETTY_DECK > terrainHeight(x, z);
}

/** The surface the tyres rest on: a deck where there is one, otherwise the ground. */
export function drivingHeight(x, z) {
  const ground = terrainHeight(x, z);
  const deck = bridgeHeight(x, z) ?? jettyHeight(x, z);
  return deck === null ? ground : Math.max(ground, deck);
}

/** True where the car is allowed to be: inside the fence and out of deep water. */
export function isDriveable(x, z) {
  if (Math.hypot(x, z) > VALLEY_RADIUS) return false;
  if (bridgeHeight(x, z) !== null || jettyHeight(x, z) !== null) return true;
  return waterDepth(x, z) < 0.95;
}
