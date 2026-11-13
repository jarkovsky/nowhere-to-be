// The height field shared by the ground mesh, the car and everything placed on the ground, and
// the questions asked of it. Heights live on a grid that is fine across the valley floor, a little
// coarser out in the outlands and coarse under the distant mountains (see heightfield.js).
import { clamp, lerp, smoothstep, valueNoise } from '../core/math.js';
import { BoulderField } from './boulderfield.js';
import {
  WORLD_SIZE,
  LAKE,
  ROAD,
  ROAD_HALF_WIDTH,
  CREEK,
  CREEK_HALF_WIDTH,
  BROOK,
  BROOK_HALF_WIDTH,
  SPRING,
  OXBOW,
  TRACK_ROCKS,
  RAILWAY,
  RAIL_GRADE,
  LEVEL_CROSSING,
  WATERFALL,
  BRIDGE,
  BRIDGES,
  JETTY,
  HEAPS,
  RIVERS,
  ROCK_GATE,
  ROCK_FIN,
  FJORD,
  FERRY_QUAYS,
  inFjord,
  insideFence,
  PONDS,
  lakeDistance,
  nearRiver,
  winterness,
  ROUGH,
} from './layout.js';
import {
  BROOK_DEPTH,
  OXBOW_REACH,
  WATER_DEPTH,
  buildHeightField,
  gridCoordinate,
  heightSampler,
  smoothProfile,
  unpackField,
} from './heightfield.js';
import { compiled } from './compiled.js';

export { AXIS, GRID, GRID_BANDS, naturalHeight } from './heightfield.js';

/**
 * Everything the height field was built into. A page loads it, worked out ahead of time (see
 * compiled.js); anywhere else it is built here.
 */
export const heightField = compiled ? unpackField(compiled.heights) : buildHeightField();
const { heights, desert: desertBox, pondLevels, riverWater, creekBed, brookBed, railBed } = heightField;
export { heights };

/**
 * Where a gravel road or a track crosses a river: `s` along the road, `level` the road's surface
 * in the water. Found where the road comes closest to the river.
 */
export const FORDS = heightField.fords;

/** The oxbow's water, just below the lowest ground around it. */
export const OXBOW_LEVEL = heightField.oxbowLevel;
const POOL_LEVEL = creekBed[0] + WATER_DEPTH;
const SPRING_LEVEL = brookBed[0] + BROOK_DEPTH;
const sampleGrid = heightSampler(heights);

// --- Queries -----------------------------------------------------------------

/** Ground height at any point, matching the rendered ground exactly. */
export const terrainHeight = sampleGrid;

/**
 * The height of the land at a point as it was before the desert was laid over it. The trees, rocks
 * and grass are tried at spot after spot from one run of random numbers, and which of them are kept
 * goes by how high and steep the land is, so they are placed by this: that way the desert moves none
 * of them outside it, and inside it, it clears them away (see desertTakes). Elsewhere it is the
 * ground's height.
 */
export function placementHeight(x, z) {
  const { ix0, ix1, iz0, iz1, columns, before } = desertBox;
  const gx = gridCoordinate(x);
  const gz = gridCoordinate(z);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  if (ix < ix0 || ix >= ix1 || iz < iz0 || iz >= iz1) return sampleGrid(x, z);
  const u = gx - ix;
  const v = gz - iz;
  const i = (iz - iz0) * columns + ix - ix0;
  const [a, b, c, d] = [before[i], before[i + 1], before[i + columns], before[i + columns + 1]];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

/** Water surface height of the creek at a distance along it. */
export function creekLevel(s) {
  const i = clamp(Math.round(s / CREEK.spacing), 0, creekBed.length - 1);
  return creekBed[i] + WATER_DEPTH;
}

export const POOL = { x: WATERFALL.x, z: WATERFALL.z, level: POOL_LEVEL };

/** Water surface height of the brook at a distance along it. */
export function brookLevel(s) {
  const i = clamp(Math.round(s / BROOK.spacing), 0, brookBed.length - 1);
  return brookBed[i] + BROOK_DEPTH;
}

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
  if (CREEK.isNear(x, z, CREEK_HALF_WIDTH + 4)) level = Math.max(level, creekLevel(CREEK.nearest(x, z).s));
  if (BROOK.isNear(x, z, BROOK_HALF_WIDTH + 4)) level = Math.max(level, brookLevel(BROOK.nearest(x, z).s));
  if (Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.radius + 2) level = Math.max(level, SPRING_LEVEL);
  if (OXBOW.path.isNear(x, z, OXBOW_REACH)) level = Math.max(level, OXBOW_LEVEL);
  const river = nearRiver(x, z, 12);
  if (river) level = Math.max(level, riverLevel(river.river, river.s));
  if (inFjord(x, z, 6)) level = Math.max(level, FJORD.level);
  PONDS.forEach((pond, i) => {
    if (Math.hypot(x - pond.x, z - pond.z) < pond.radius + 2) level = Math.max(level, pondLevels[i]);
  });
  return level;
}

/** Water surface height of a pond. */
export const pondLevel = pond => pondLevels[PONDS.indexOf(pond)];

/** Water surface height of a river at a distance along it. */
export function riverLevel(river, s) {
  const water = riverWater[RIVERS.indexOf(river)];
  return water[clamp(Math.round(s / river.path.spacing), 0, water.length - 1)];
}

/** Roughly where the snow starts, in metres above the valley floor. */
export const SNOWLINE = 116;

/** How snowy the ground is from its height alone: 0 below the snowline, 1 above it. The line wanders a little. */
export function highSnow(x, z, h = terrainHeight(x, z)) {
  const line = SNOWLINE + (valueNoise(x / 37, z / 37, 41) - 0.5) * 16;
  return smoothstep(h, line - 1.5, line + 1.5);
}

/** How snowy the ground is: snow lies above the snowline, and everywhere in the winter. */
export function snowCover(x, z, h = terrainHeight(x, z)) {
  return Math.max(winterness(x, z), highSnow(x, z, h));
}

export function waterDepth(x, z) {
  return Math.max(0, waterLevel(x, z) - terrainHeight(x, z));
}

// --- The bridge deck -----------------------------------------------------------

function bridgeLocal(bridge, x, z) {
  const dx = x - bridge.x;
  const dz = z - bridge.z;
  return { along: dx * bridge.dx + dz * bridge.dz, side: -dx * bridge.dz + dz * bridge.dx };
}

/** The ground at either end of each bridge, from the end behind to the end ahead. */
const bridgeEnds = BRIDGES.map(bridge =>
  [-1, 1].map(sign =>
    terrainHeight(bridge.x + (bridge.dx * sign * bridge.length) / 2, bridge.z + (bridge.dz * sign * bridge.length) / 2),
  ),
);

/**
 * Top of a bridge's deck at a distance along it, from its centre (the creek's bridge unless
 * given): it starts at the ground, `lift` above it, and rises in a gentle arch.
 */
export function deckHeight(along, bridge = BRIDGE) {
  const t = clamp(along / bridge.length + 0.5, 0, 1);
  const [behind, ahead] = bridgeEnds[BRIDGES.indexOf(bridge)];
  return lerp(behind, ahead, t) + Math.sin(t * Math.PI) * bridge.arch + bridge.lift;
}

/** The bridge whose deck is at a point, or null. */
export function bridgeAt(x, z) {
  for (const bridge of BRIDGES) {
    const reach = bridge.length / 2 + bridge.width / 2;
    if (Math.abs(x - bridge.x) > reach || Math.abs(z - bridge.z) > reach) continue;
    const { along, side } = bridgeLocal(bridge, x, z);
    if (Math.abs(side) <= bridge.width / 2 && Math.abs(along) <= bridge.length / 2) return bridge;
  }
  return null;
}

export function bridgeHeight(x, z) {
  const bridge = bridgeAt(x, z);
  return bridge ? deckHeight(bridgeLocal(bridge, x, z).along, bridge) : null;
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

// --- The ferry quay, and decks that move ---------------------------------------------------

/** Top of the steel ramp out from the ferry quay at a point, or null off it. */
export function quayHeight(x, z) {
  for (const { x: qx, z: qz, rotation, from, to, width, low, high } of FERRY_QUAYS) {
    const dx = x - qx;
    const dz = z - qz;
    if (dx * dx + dz * dz > (to + width) ** 2) continue;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const lz = dx * sin + dz * cos;
    if (lz < from || lz > to || Math.abs(dx * cos - dz * sin) > width / 2) continue;
    return lerp(low, high, (lz - from) / (to - from));
  }
  return null;
}

/** Decks that move about, like the ferry's: each { height(x, z) } says how high it is at a point, or null off it. */
const floating = [];

/** Adds a deck that moves about to what can be driven on. Returns a function that takes it away again. */
export function addFloatingDeck(deck) {
  floating.push(deck);
  return () => floating.splice(floating.indexOf(deck), 1);
}

function floatingHeight(x, z) {
  for (const deck of floating) {
    const height = deck.height(x, z);
    if (height !== null) return height;
  }
  return null;
}

/**
 * True where the tyres are on planks or steel rather than ground: the bridge, the part of the
 * jetty above the beach, the quay's ramp and the ferry.
 */
export function onDeck(x, z) {
  if (bridgeHeight(x, z) !== null || quayHeight(x, z) !== null || floatingHeight(x, z) !== null) return true;
  return jettyHeight(x, z) !== null && JETTY_DECK > terrainHeight(x, z);
}

// --- The railway track ---------------------------------------------------------------

/**
 * How far the road over the level crossing reaches along the line either side, allowing for the
 * angle. The railway lays rubber panels there instead of ballast and sleepers.
 */
export const CROSSING_REACH = (() => {
  const rail = RAILWAY.at(LEVEL_CROSSING.s);
  const road = ROAD.at(LEVEL_CROSSING.roadS);
  return (ROAD_HALF_WIDTH + 0.6) / Math.abs(rail.dx * road.dz - rail.dz * road.dx);
})();

/**
 * What the tyres ride on crossing the railway, or null away from it: the sleepers between the
 * ends of the sleepers, then the ballast's shoulders easing down to the ground (the railway
 * builds them at these heights over the bed), and the rubber panels where the road crosses.
 */
function trackHeight(x, z) {
  if (!RAILWAY.isNear(x, z, 2.4)) return null;
  const { sample, side } = RAILWAY.nearest(x, z);
  const off = Math.abs(side);
  if (off > 2.1) return null;
  const s = sample.s + (x - sample.x) * sample.dx + (z - sample.z) * sample.dz;
  if (s < 0 || s > RAILWAY.length) return null;
  if (Math.abs(s - LEVEL_CROSSING.s) < CROSSING_REACH) return off < 1.62 ? terrainHeight(x, z) + 0.16 : null;
  const bed = railLevel(s);
  if (off < 1.25) return bed + 0.28;
  if (off < 1.6) return bed + 0.17;
  return lerp(bed + 0.17, terrainHeight(x, z), (off - 1.6) / 0.5);
}

// --- The rocks on the tracks --------------------------------------------------------

// Each rock is listed in the square cells it touches, so a point only checks the few near it.
const ROCK_CELL = 4;
const rockCell = (cx, cz) => cx * 65536 + cz;
const rockCells = new Map();
// The rock steps across the rough trail are bumps of the same kind.
for (const rock of [...TRACK_ROCKS, ...ROUGH.rocks]) {
  for (let cx = Math.floor((rock.x - rock.r) / ROCK_CELL); cx <= Math.floor((rock.x + rock.r) / ROCK_CELL); cx++) {
    for (let cz = Math.floor((rock.z - rock.r) / ROCK_CELL); cz <= Math.floor((rock.z + rock.r) / ROCK_CELL); cz++) {
      const key = rockCell(cx, cz);
      if (!rockCells.has(key)) rockCells.set(key, []);
      rockCells.get(key).push(rock);
    }
  }
}

/** How far the rocks lift the tyres at a point: a smooth dome over each one. */
export function rockHeight(x, z) {
  const nearby = rockCells.get(rockCell(Math.floor(x / ROCK_CELL), Math.floor(z / ROCK_CELL)));
  if (!nearby) return 0;
  let lift = 0;
  for (const rock of nearby) {
    const d2 = ((x - rock.x) ** 2 + (z - rock.z) ** 2) / rock.r ** 2;
    if (d2 < 1) lift = Math.max(lift, rock.h * (1 - d2) ** 2);
  }
  return lift;
}

// --- The boulders and stones ----------------------------------------------------------

/** The tallest boulder, in metres above the ground, that any vehicle could drive over. Taller ones are solid. */
export const CLIMB_LIMIT = 1.0;

/** Every boulder and stone low enough to ride over, with the shape of its top. */
export const BOULDERS = new BoulderField((x, z) => terrainHeight(x, z), CLIMB_LIMIT, WORLD_SIZE / 2);

/**
 * Sets a boulder drawn as `geometry` (see boulderGeometry) at the matrix `elements`, in the
 * height field if it is low enough. Returns its climb: how high its top stands above the ground
 * at its middle.
 */
export function placeBoulder(geometry, elements) {
  return BOULDERS.add(geometry, elements);
}

/** The climb of a boulder drawn as `geometry` at the matrix `elements`, without setting it down. */
export function boulderClimb(geometry, elements) {
  return BOULDERS.climb(geometry, elements);
}

/** How far the boulders and stones raise the surface above the ground at a point: 0 off them. */
export function boulderLift(x, z) {
  const top = BOULDERS.topAt(x, z);
  return top === -Infinity ? 0 : Math.max(0, top - terrainHeight(x, z));
}

// --- The deep ruts on the rough trail ---------------------------------------------------

/**
 * Stretches of the rough trail are a built-up bed of churned earth: a hump along the middle with a
 * rut dug deep for each wheel, the bed `lift` above the ground and the ruts `depth` below that.
 * The bed is drawn by the lookout's builder, from the same numbers.
 */
export const RUTS = { lift: 0.5, depth: 0.42, flat: 2.2, edge: 4, wheels: 1.08, width: 0.5 };

// Each trail sample along a rutted stretch is listed in the 4 m cells it can reach, so a point only checks the few near it.
const RUT_CELL = 4;
const rutCells = new Map();
for (const { from, to } of ROUGH.ruts) {
  for (const sample of ROUGH.path.samples) {
    if (sample.s < from - RUT_CELL || sample.s > to + RUT_CELL) continue;
    const entry = {
      sample,
      weight: smoothstep(sample.s, from, from + 6) * (1 - smoothstep(sample.s, to - 6, to)),
    };
    for (
      let cx = Math.floor((sample.x - RUTS.edge) / RUT_CELL);
      cx <= Math.floor((sample.x + RUTS.edge) / RUT_CELL);
      cx++
    ) {
      for (
        let cz = Math.floor((sample.z - RUTS.edge) / RUT_CELL);
        cz <= Math.floor((sample.z + RUTS.edge) / RUT_CELL);
        cz++
      ) {
        const key = rockCell(cx, cz);
        if (!rutCells.has(key)) rutCells.set(key, []);
        rutCells.get(key).push(entry);
      }
    }
  }
}

/** The bed's height above the ground `side` metres from the middle of the trail, where it is fully there. */
export function rutProfile(side) {
  const across = Math.abs(side);
  const rut = Math.max(0, 1 - ((across - RUTS.wheels) / RUTS.width) ** 2);
  return RUTS.lift * (1 - smoothstep(across, RUTS.flat, RUTS.edge)) - RUTS.depth * rut * rut;
}

/** How far the bed of deep ruts lifts the tyres at a point: nothing away from them. */
export function rutHeight(x, z) {
  const nearby = rutCells.get(rockCell(Math.floor(x / RUT_CELL), Math.floor(z / RUT_CELL)));
  if (!nearby) return 0;
  let best = null;
  let nearest = Infinity;
  for (const entry of nearby) {
    const d = (x - entry.sample.x) ** 2 + (z - entry.sample.z) ** 2;
    if (d < nearest) [nearest, best] = [d, entry];
  }
  if (!best || nearest > RUTS.edge ** 2) return 0;
  const { sample, weight } = best;
  return weight * rutProfile((x - sample.x) * -sample.dz + (z - sample.z) * sample.dx);
}

// --- Heaps --------------------------------------------------------------------------

/**
 * How high a heap stands at `t` of the way out from its middle to its edge: a rounded top,
 * sides about as steep as loose gravel lies, and a soft foot.
 */
export function heapProfile(t) {
  return t >= 1 ? 0 : (1 - t * t) ** 2;
}

/** A heap's own lumps, so it isn't perfectly round: up to a tenth of its height either way. */
function heapLumps(heap, x, z) {
  return (valueNoise((x - heap.x) / 1.3 + heap.radius, (z - heap.z) / 1.3, 47) - 0.5) * 0.2;
}

/** How high one heap stands above the ground at a point. */
export function heapSurface(heap, x, z) {
  const t = Math.hypot(x - heap.x, z - heap.z) / heap.radius;
  return t < 1 ? heap.height * heapProfile(t) * (1 + heapLumps(heap, x, z)) : 0;
}

/** How far the heaps lift the tyres at a point. */
export function heapHeight(x, z) {
  let lift = 0;
  for (const heap of HEAPS) {
    if (Math.abs(x - heap.x) < heap.radius && Math.abs(z - heap.z) < heap.radius)
      lift = Math.max(lift, heapSurface(heap, x, z));
  }
  return lift;
}

// --- The rock arch and the fin running out to it ---------------------------------------

/** The ground the arch stands on: the lowest under its feet and in its middle. */
export const GATE_GROUND = (() => {
  const { x, z, dx, dz, span, thickness } = ROCK_GATE;
  const reach = span / 2 + thickness;
  return Math.min(terrainHeight(x, z), ...[-1, 1].map(k => terrainHeight(x - dz * k * reach, z + dx * k * reach)));
})();

/** The height of the arch's flat top, and of the fin's top where it runs out onto it. */
export const GATE_TOP = GATE_GROUND + ROCK_GATE.crown;

/**
 * The fin's top along its path: level with the ground where it leaves the track, going evenly
 * to the top of the arch by the time it reaches the arch's near foot, level over the arch, and
 * evenly down again from its far foot to the ground where it meets the road.
 */
const finLevels = (() => {
  const { path, arch, archEnd } = ROCK_FIN;
  const [first, last] = [path.samples[0], path.samples.at(-1)];
  const [start, end] = [terrainHeight(first.x, first.z), terrainHeight(last.x, last.z)];
  const [up, down] = [arch - 6, archEnd + 6];
  const level = path.samples.map(({ s }) =>
    s < up ? lerp(start, GATE_TOP, s / up) : lerp(GATE_TOP, end, Math.max(0, s - down) / (path.length - down)),
  );
  return smoothProfile(level, 6, false);
})();
const finBox = (() => {
  const xs = ROCK_FIN.path.samples.map(p => p.x);
  const zs = ROCK_FIN.path.samples.map(p => p.z);
  const pad = ROCK_FIN.width;
  return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad };
})();

/** Height of the fin's top `s` metres along it. */
export function finLevel(s) {
  const u = clamp(s / ROCK_FIN.path.spacing, 0, finLevels.length - 1);
  const i = Math.min(Math.floor(u), finLevels.length - 2);
  return lerp(finLevels[i], finLevels[i + 1], u - i);
}

/** Height of the top of the fin (or of the arch, where the fin runs out onto it) at a point, or null off it. */
export function finHeight(x, z) {
  if (x < finBox.x0 || x > finBox.x1 || z < finBox.z0 || z > finBox.z1) return null;
  const { path, width } = ROCK_FIN;
  const { sample, side } = path.nearest(x, z);
  if (Math.abs(side) > width / 2) return null;
  // Past either end the nearest sample is the end one; only points alongside it count.
  const along = (x - sample.x) * sample.dx + (z - sample.z) * sample.dz;
  if ((sample.s === 0 && along < -0.5) || (sample.s >= path.length - 0.01 && along > 0.5)) return null;
  return finLevel(sample.s + along);
}

/** How far below the top of the fin a car can be and still be driving on it rather than under it. */
const FIN_STEP = 1.5;

/**
 * The surface the tyres rest on: a deck where there is one, otherwise the ground and any rocks,
 * boulders or heaps on it. The road runs under the arch, so the top of the fin and the arch only count
 * for something already up at their level (`from`, how high it was a moment ago).
 */
export function drivingHeight(x, z, from = -Infinity) {
  const ground =
    terrainHeight(x, z) + Math.max(rockHeight(x, z), heapHeight(x, z), boulderLift(x, z)) + rutHeight(x, z);
  const deck = bridgeHeight(x, z) ?? jettyHeight(x, z) ?? quayHeight(x, z) ?? floatingHeight(x, z) ?? trackHeight(x, z);
  const surface = deck === null ? ground : Math.max(ground, deck);
  if (from === -Infinity) return surface;
  const fin = finHeight(x, z);
  return fin !== null && from > fin - FIN_STEP ? Math.max(surface, fin) : surface;
}

/** True up on the top of the fin or the arch, for something that was at height `from` a moment ago. */
export function onFin(x, z, from) {
  const fin = finHeight(x, z);
  return fin !== null && from > fin - FIN_STEP;
}

/** How deep the water is that the tyres are in: none on the planks of the bridge or the jetty. */
export function wadingDepth(x, z) {
  return onDeck(x, z) ? 0 : waterDepth(x, z);
}

/** True where the car is allowed to be: inside the fence and out of deep water. */
export function isDriveable(x, z) {
  if (!insideFence(x, z)) return false;
  if (bridgeHeight(x, z) !== null || jettyHeight(x, z) !== null) return true;
  if (quayHeight(x, z) !== null || floatingHeight(x, z) !== null) return true;
  return waterDepth(x, z) < 0.95;
}
