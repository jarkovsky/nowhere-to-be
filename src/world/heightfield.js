// The height field: the grid the heights live on, the lie of the land before anything is built
// on it, and the building of the heights over the grid. It is worked out from the layout alone,
// so it can be built ahead of time (see compile.js) and loaded by the page as plain data;
// terrain.js answers the questions asked of it.
import { clamp, fractalNoise, lerp, smoothstep, valueNoise } from '../core/math.js';
import {
  WORLD_SIZE,
  VALLEY_RADIUS,
  LAKE,
  ROAD,
  ROAD_HALF_WIDTH,
  CREEK,
  CREEK_HALF_WIDTH,
  BROOK,
  BROOK_HALF_WIDTH,
  FORD,
  SPRING,
  OXBOW,
  CAMP_TRAIL,
  TRACKS,
  DRIVEWAYS,
  RAILWAY,
  RAIL_GRADE,
  LEVEL_CROSSING,
  WATERFALL,
  BRIDGE,
  BRIDGES,
  isBridged,
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
  ROADWORKS,
  RING_ROAD,
  OUTER_ROAD,
  CONNECTORS,
  GRAVEL,
  VALLEY_GRAVEL,
  GRAVEL_HALF_WIDTH,
  OUTLAND_HILLS,
  RIVERS,
  VALLEY_RIVERS,
  VALLEY_TRACKS,
  LAKELAND,
  SPANS,
  FORD_DEPTH,
  ROCK_HILL,
  MINE,
  FJORD,
  LOFOTEN,
  PONDS,
  DESERT,
  lakeDistance,
  rockiness,
  ruggedness,
  RUGGED_HILLS,
  ROUGH,
  gullyDepth,
  ROUGH_GROUND,
  ringRadius,
  outerRadius,
} from './layout.js';
import { createPath } from './path.js';

const HALF = WORLD_SIZE / 2;
const INNER = 560;
const MIDDLE = 1060;
/** The fine cells continue on the negative side of both axes this far, to cover the Lofoten coast. */
const COAST = 1480;
/**
 * Beyond the fence on the positive side the cells were once all this size, out to the edge. Where
 * they are now finer, to cover the lakeland, four go into each, so every line of the grid as it
 * was is still a line of it (see legacyLines).
 */
const OUTER_CELL = (HALF - MIDDLE) / 40;
/** The fine cells continue on the positive side this far: 28 of the cells there once were. */
const LAKES = MIDDLE + 28 * OUTER_CELL;

/**
 * The grid along each axis: fine 3.5 m cells across the middle, cells of about
 * 4.5 m out to the far side of the fence (on the negative side, out past the Lofoten coast, and
 * on the positive side past the lakeland), then coarse ones under the distant mountains.
 * Every band starts on a multiple of four grid lines, so the ground can be drawn far off with
 * every second or fourth line (see ground.js).
 */
const BANDS = [
  { from: -HALF, to: -COAST, cells: 16 },
  { from: -COAST, to: -MIDDLE, cells: 96 },
  { from: -MIDDLE, to: -INNER, cells: 112 },
  { from: -INNER, to: INNER, cells: 320 },
  { from: INNER, to: MIDDLE, cells: 112 },
  { from: MIDDLE, to: LAKES, cells: 112 },
  { from: LAKES, to: HALF, cells: 12 },
];
{
  let start = 0;
  for (const band of BANDS) {
    Object.assign(band, { start, size: (band.to - band.from) / band.cells });
    start += band.cells;
  }
}
const FINE = BANDS[3];
/** The bands of the grid, for shaders that look heights up: where each starts, its first grid line and its cell size. */
export const GRID_BANDS = BANDS.map(({ from, to, start, size }) => ({ from, to, start, size }));

/** World coordinate of every grid line, identical for X and Z. */
export const AXIS = Float64Array.from([
  ...BANDS.flatMap(band => Array.from({ length: band.cells }, (_, i) => band.from + i * band.size)),
  HALF,
]);
export const GRID = AXIS.length;

export function gridCoordinate(value) {
  let g;
  if (value >= -INNER && value <= INNER) g = FINE.start + (value + INNER) / FINE.size;
  else {
    const band = BANDS.find(b => value <= b.to) ?? BANDS[BANDS.length - 1];
    g = band.start + (value - band.from) / band.size;
  }
  return clamp(g, 0, GRID - 1.000001);
}

/**
 * The two grid lines either side of `value` as the grid was before the lakeland, and how far
 * between them it lies, as [line, next line, 0 to 1]: beyond the fence on the positive side
 * those were the coarse cells, whose lines are every fourth of the finer ones there now.
 */
export function legacyLines(value) {
  if (value < MIDDLE) {
    const g = gridCoordinate(value);
    const line = Math.floor(g);
    return [line, line + 1, g - line];
  }
  const cell = Math.min(39, Math.floor((value - MIDDLE) / OUTER_CELL));
  const index = k => (k <= 28 ? BANDS[5].start + 4 * k : BANDS[6].start + k - 28);
  return [index(cell), index(cell + 1), (value - MIDDLE - cell * OUTER_CELL) / OUTER_CELL];
}

const LAKE_BED = -5.5;

/** A rounded hill. Further than three times its radius away it has fallen to nothing. */
function bump(x, z, cx, cz, radius, height) {
  const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / radius ** 2;
  return d2 > 9 ? 0 : height * Math.exp(-d2);
}

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
  const wall = softplus((r - VALLEY_RADIUS + 8) / 14) * 14 * (0.45 + 0.12 * lobes);
  return valley + uplands + wall;
}

const HILLS = [...KNOLLS, SERLICH, SUMMIT, ...UPLAND_HILLS, ...OUTLAND_HILLS, ROCK_HILL, ...RUGGED_HILLS, MINE.hill];

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
  for (const hill of HILLS) h += bump(x, z, hill.x, hill.z, hill.radius, hill.height);
  h += MESA.height * (1 - smoothstep(Math.hypot(x - MESA.x, z - MESA.z), MESA.top, MESA.edge));
  // Rough, rocky hills to the north (negative Z), smoothing out on the slopes of Šerlich
  // and growing more rugged out in the uplands.
  const crags = smoothstep(-z, 150, 240) * smoothstep(Math.hypot(x - SERLICH.x, z - SERLICH.z), 50, 95);
  if (crags > 0) {
    // Out in the uplands the crags grow taller and further apart.
    const out = smoothstep(r, 345, 430);
    const near = Math.max(0, fractalNoise(v / 52, u / 52, 3, 23) - 0.3) * 34;
    const far = out > 0 ? Math.max(0, fractalNoise(v / 95 + 4.1, u / 95 + 2.7, 3, 29) - 0.32) * 62 : 0;
    // They give way to passes where the upland road and the outer road go through.
    const pass = r > 420 ? 1 - smoothstep(Math.abs(r - ringRadius(angle)), 30, 120) : 0;
    const outerPass = r > 640 ? 1 - smoothstep(Math.abs(r - outerRadius(angle)), 25, 90) : 0;
    h += crags * lerp(near, far, out) * (1 - 0.9 * Math.max(pass, outerPass));
  }
  // Out in the outlands the land rolls in broader swells.
  const outlands = smoothstep(r, 640, 760);
  if (outlands > 0) h += outlands * (fractalNoise(u / 260 + 1.3, v / 260 + 5.7, 3, 71) - 0.5) * 34;
  // Rocky ground is broken up into knobs and ledges.
  const rocky = rockiness(x, z);
  if (rocky > 0) h += rocky * (fractalNoise(u / 24 + 3.7, v / 24 + 1.9, 3, 83) - 0.45) * 9;
  // The rugged country is cut into sharp ridges and knobbly ground.
  const rugged = ruggedness(x, z);
  if (rugged > 0) {
    const ridge = 1 - Math.abs(2 * fractalNoise(u / 62 + 2.9, v / 62 + 8.3, 2, 53) - 1);
    h += rugged * (ridge * ridge * 13 + (valueNoise(u / 17, v / 17, 59) - 0.5) * 4);
  }
  // A shelf behind the waterfall, so the stream drops off real high ground.
  h += 12 * smoothstep(x - WATERFALL.x, 4, 36) * (1 - smoothstep(Math.abs(z - WATERFALL.z), 26, 70));
  // The Lofoten coast and its mountains take over beyond the fence, and nothing in the valley changes.
  const outside = x < -700 && z < -700 ? smoothstep(Math.hypot(x, z), 1060, 1180) : 0;
  return outside > 0 ? lerp(h, lofotenHeight(x, z, h), outside) : h;
}

/** Where the snow is blown into long low drifts on the Lofoten coast: the wind comes from the north-west. */
const COAST_WIND = { x: 0.7, z: 0.71 };

/** The flat land on the Lofoten coast sits this high above the water, give or take its swells and drifts. */
const STRANDFLAT = FJORD.level + 2.4;
/** Inside this far from the coast's middle the land is the strandflat; it rises to the foot of the mountains by the fence. */
const FLATS = LOFOTEN.radius - 90;

/**
 * The Lofoten coast: a low, flat shore (the strandflat) with soft swells and long drifts and a
 * few rounded knolls of rock, rising gently to the foot of the mountains by the fence and then
 * steeply into jagged peaks. `wild` is the landscape there otherwise, a wall of rock.
 */
function lofotenHeight(x, z, wild) {
  const d = Math.hypot(x - LOFOTEN.x, z - LOFOTEN.z);
  // Far from the coast the mountains are only a little more broken up, and not at all near the valley.
  const broken =
    (1 - smoothstep(d, LOFOTEN.radius + 250, LOFOTEN.radius + 450)) * smoothstep(Math.hypot(x, z), 1060, 1200);
  if (d > LOFOTEN.radius + 620) return wild + jaggedPeaks(x, z, broken);
  // Close to the bay the land lies low and level, so the quay's road meets it gently.
  const fromBay = Math.hypot(x - FJORD.bay.x, z - FJORD.bay.z);
  const inland = fromBay > FJORD.bay.reach + 90 ? 1 : smoothstep(fromBay - FJORD.bay.shore(x, z), 0, 90);
  const swell = (fractalNoise(x / 140 + 11.3, z / 140 + 5.1, 3, 301) - 0.5) * 3.2 * (0.35 + 0.65 * inland);
  const ripple = (valueNoise(x / 33, z / 33, 307) - 0.5) * 0.9;
  const across = x * COAST_WIND.x + z * COAST_WIND.z + (fractalNoise(x / 90, z / 90, 2, 311) - 0.5) * 60;
  const drift = Math.sin(across / 11) * 0.28 * (0.5 + valueNoise(x / 70, z / 70, 313));
  let flat = STRANDFLAT + swell + ripple + drift - 1.3 * (1 - inland);
  for (const knoll of LOFOTEN.knolls) flat += bump(x, z, knoll.x, knoll.z, knoll.radius, knoll.height);
  const lowland = flat + smoothstep(d, FLATS, LOFOTEN.radius) * 24;
  if (d <= LOFOTEN.radius) return lowland;
  // Past the fence the ground climbs steeply, at first about as steep as the ground is high, into
  // jagged mountains, which in the end join the wall of rock there is out beyond them.
  const out = d - LOFOTEN.radius;
  const crown = lowland + 340 * (1 - Math.exp(-out / 240)) + jaggedPeaks(x, z, smoothstep(out, 15, 220) * broken);
  return lerp(crown, Math.max(crown, wild + jaggedPeaks(x, z, broken)), smoothstep(out, 380, 620));
}

/** Ridges, crags and spires for the mountains round the Lofoten coast, up to 250 m, `amount` of them. */
function jaggedPeaks(x, z, amount) {
  if (amount <= 0) return 0;
  const u = x * 0.8 - z * 0.6;
  const v = x * 0.6 + z * 0.8;
  const ridge = 1 - Math.abs(2 * fractalNoise(u / 85 + 5.7, v / 85 + 1.3, 3, 321) - 1);
  const crag = 1 - Math.abs(2 * fractalNoise(u / 34 + 1.1, v / 34 + 6.2, 2, 337) - 1);
  const spire = Math.max(0, fractalNoise(u / 40 + 2.2, v / 40 + 9.1, 2, 331) - 0.35);
  return amount * (ridge ** 2.2 * 120 + crag * crag * 30 + spire * 90);
}

// --- The lakeland --------------------------------------------------------------------------

const BECK_RIVER = RIVERS.find(river => river.id === 'beck');
const BECK = BECK_RIVER.path;
const RAVINE = TRACKS.find(track => track.id === 'ravine').path;

/** The sample of `path` nearest a point and how far off it is, or null where none is within `reach`. */
function closest(path, box, x, z, reach) {
  if (x < box.x0 - reach || x > box.x1 + reach || z < box.z0 - reach || z > box.z1 + reach) return null;
  let [best, least] = [null, reach * reach];
  for (const sample of path.samples) {
    const d2 = (x - sample.x) ** 2 + (z - sample.z) ** 2;
    if (d2 < least) [best, least] = [sample, d2];
  }
  return best && { s: best.s, distance: Math.sqrt(least) };
}
const boxOf = ({ samples }) => ({
  x0: Math.min(...samples.map(p => p.x)),
  x1: Math.max(...samples.map(p => p.x)),
  z0: Math.min(...samples.map(p => p.z)),
  z1: Math.max(...samples.map(p => p.z)),
});
const [BECK_BOX, RAVINE_BOX] = [boxOf(BECK), boxOf(RAVINE)];

/**
 * How high the floor of the gorge lies at each of the beck's samples: it falls steeply at first,
 * then gently to the lake, and past the beck's mouth it dips under the lake's water. Like any
 * river's, it lies level where a track fords it.
 */
const BECK_FLOOR = (() => {
  const { level, mouth } = LAKELAND;
  const floor = BECK.samples.map(({ s }) =>
    s > mouth ? level + 0.3 - 0.15 * (s - mouth) : level + 0.3 + 26 * (1 - s / mouth) ** 1.6,
  );
  for (const site of BECK_RIVER.sites.filter(site => site.kind !== 'pool')) {
    const here = floor[Math.round(site.s / BECK.spacing)];
    BECK.samples.forEach(({ s }, i) => {
      floor[i] = lerp(floor[i], here, 1 - smoothstep(Math.abs(s - site.s), 14, 44));
    });
  }
  return floor;
})();

/** How high the floor of the gorge lies, `s` metres down the beck. */
function gorgeFloor(s) {
  const u = clamp(s / BECK.spacing, 0, BECK_FLOOR.length - 1);
  const i = Math.min(Math.floor(u), BECK_FLOOR.length - 2);
  return lerp(BECK_FLOOR[i], BECK_FLOOR[i + 1], u - i);
}

/**
 * How far the level floor of the gorge reaches either side of the beck: a round hollow under the
 * waterfall, wide enough to turn in, a floor that widens and narrows down the gorge, more room
 * where the side ravine comes in, and a fan spreading out to the lake.
 */
function gorgeHalfWidth(s) {
  const { mouth, confluence } = LAKELAND;
  const wandering = 9 + 2 * Math.sin(s / 31 + 0.8) + 1.2 * Math.sin(s / 13 + 2.2);
  return (
    wandering +
    8 * (1 - smoothstep(s, 14, 50)) +
    5 * (1 - smoothstep(Math.abs(s - confluence), 6, 26)) +
    10 * smoothstep(s, mouth - 60, mouth - 10)
  );
}

/**
 * How much of the ground at a point is the lakeland's: all of it inside its fence and in the
 * mountains round it, none of it in the valley, where it reaches only into the gap the road
 * comes through. Its mountains reach further out the further they are from the valley, so they
 * stay clear of the rivers that run into the valley's rim.
 */
export function lakelandHold(x, z) {
  const d = Math.hypot(x - LAKELAND.x, z - LAKELAND.z);
  if (d > LAKELAND.radius + 330) return 0;
  const r = Math.hypot(x, z);
  const inside = 1 - smoothstep(d, LAKELAND.radius - 40, LAKELAND.radius);
  const reach = 105 + 220 * smoothstep(r, 1150, 1400);
  const beyond =
    smoothstep(r, VALLEY_RADIUS, VALLEY_RADIUS + 60) * (1 - smoothstep(d - LAKELAND.radius, 0.55 * reach, reach));
  return Math.max(inside, beyond);
}

/**
 * The lakeland's ground before the gorge is cut into it: the bed of the lake and the tarn,
 * shelving from their edges; a shelf of gentle ground along the shore, a bluff up from it, nearer
 * the water in some places than in others, and a bench of rolling ground above, rising to the
 * pass; the knoll on the island and the crag; low hills towards the edge, and round it all the
 * foot of the mountains, which wanders in and out and climbs steeply beyond the fence, except
 * where the road comes in over the pass.
 */
function lakelandBench(x, z) {
  const { level, radius, crag, shallows } = LAKELAND;
  const ashore = LAKELAND.ashore(x, z);
  if (ashore < 0) {
    const bed = level - 5 * (1 - Math.exp(ashore * 0.05));
    // The bar across the narrows lies just under the water, and falls away either side of it.
    const [bx, bz] = [shallows.to.x - shallows.from.x, shallows.to.z - shallows.from.z];
    const t = clamp(((x - shallows.from.x) * bx + (z - shallows.from.z) * bz) / (bx * bx + bz * bz), 0, 1);
    const off = Math.hypot(x - shallows.from.x - bx * t, z - shallows.from.z - bz * t);
    return Math.max(bed, level - shallows.depth - Math.max(0, off - shallows.half) * 0.2);
  }
  const wander = (fractalNoise(x / 110 + 5.3, z / 110 + 1.9, 2, 433) - 0.5) * 60;
  const bluff = (9 + 7 * valueNoise(x / 160, z / 160, 437)) * smoothstep(ashore + wander, 45, 110);
  const swell = (fractalNoise(x / 95 + 3.1, z / 95 + 8.7, 3, 401) - 0.5) * 8 * smoothstep(ashore, 15, 70);
  const ripple = (valueNoise(x / 27, z / 27, 409) - 0.5) * 1.2 * smoothstep(ashore, 8, 30);
  let h =
    level +
    1.05 * (1 - Math.exp(-ashore / 2.2)) +
    0.05 * Math.max(0, ashore - 4) +
    bluff +
    0.03 * Math.max(0, ashore - 120) +
    swell +
    ripple;
  const isle = LAKELAND.onIsland(x, z);
  if (isle > 0) h += 5 * smoothstep(isle, 16, 32);
  h += bump(x, z, crag.x, crag.z, crag.radius, crag.height) * smoothstep(ashore, 0, 30);

  const d = Math.hypot(x - LAKELAND.x, z - LAKELAND.z);
  if (d < radius - 220) return h;
  const { a, c } = LAKELAND.local(x, z);
  const pass = (1 - smoothstep(Math.abs(c - 26), 55, 120)) * smoothstep(-a, 250, 330);
  if (pass >= 1) return h;
  // The mountains' foot is nearer in some places and further off in others.
  const warp =
    (fractalNoise(x / 150 + 9.1, z / 150 + 4.4, 2, 421) - 0.5) * 70 * smoothstep(d, radius - 200, radius - 60);
  const out = d + warp - radius;
  const turn = Math.atan2(z - LAKELAND.z, x - LAKELAND.x);
  const lobes = 0.5 + 0.3 * Math.sin(turn * 5 + 0.7) + 0.2 * Math.sin(turn * 11 + 2.9);
  const hills = 10 * smoothstep(out, -150, -30) * (0.3 + 1.4 * valueNoise(x / 130, z / 130, 447));
  // The slopes climb about as steeply as the valley's own, so trees stand on them, and steepen
  // into crags further back.
  const foot = softplus((out + 12) / 15) * 15 * (0.42 + 0.12 * lobes);
  const crags = softplus((out - 130) / 40) * 40 * 0.4 + jaggedPeaks(x, z, 0.5 * smoothstep(out, 70, 240));
  return h + (hills + foot + crags) * (1 - pass);
}

/** The height the side ravine's track comes down at, `s` metres along it: from the bench at the road to the floor of the gorge. */
const ravineLevel = (() => {
  const first = RAVINE.samples[0];
  const top = lakelandBench(first.x, first.z);
  const bottom = gorgeFloor(LAKELAND.confluence) + 0.3;
  return s => lerp(top, bottom, 0.35 * smoothstep(s, 8, RAVINE.length - 6) + (0.65 * s) / RAVINE.length);
})();

/**
 * The lakeland's ground: the lie of it (see lakelandBench) with the gorge the beck has cut down
 * through the bench, between ragged walls of rock, and the side ravine a track comes down into it.
 */
function lakelandHeight(x, z) {
  let h = lakelandBench(x, z);
  if (LAKELAND.ashore(x, z) < 0) return h;
  const ragged = 0.75 + 0.5 * valueNoise(x / 19, z / 19, 449);
  const beck = closest(BECK, BECK_BOX, x, z, 120);
  if (beck) {
    // The walls stand steeper the higher they go, so the gorge stays narrow where the mountains are high.
    const off = Math.max(0, beck.distance - gorgeHalfWidth(beck.s));
    h = Math.min(h, gorgeFloor(beck.s) + (off * 1.5 + Math.max(0, off - 22) * 1.8) * ragged);
  }
  const ravine = closest(RAVINE, RAVINE_BOX, x, z, 40);
  if (ravine) h = Math.min(h, ravineLevel(ravine.s) + Math.max(0, ravine.distance - 4.5) * 1.1 * ragged);
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

/**
 * Height at any point on `heights`, between its grid points. Cells are split along one diagonal,
 * the same as the ground mesh, so the car follows every facet.
 */
export function heightSampler(heights) {
  return function sampleGrid(x, z) {
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
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
}

/** Calls `visit(index, x, z, distance)` for grid vertices within `radius` of a point. */
function forEachVertexNear(x, z, radius, visit) {
  const x0 = Math.floor(gridCoordinate(x - radius));
  const x1 = Math.ceil(gridCoordinate(x + radius));
  const z0 = Math.floor(gridCoordinate(z - radius));
  const z1 = Math.ceil(gridCoordinate(z + radius));
  const limit = radius * radius;
  for (let iz = z0; iz <= z1; iz++) {
    const dz = AXIS[iz] - z;
    for (let ix = x0; ix <= x1; ix++) {
      const dx = AXIS[ix] - x;
      const d2 = dx * dx + dz * dz;
      if (d2 <= limit) visit(iz * GRID + ix, AXIS[ix], AXIS[iz], Math.sqrt(d2));
    }
  }
}

export function smoothProfile(values, window, closed) {
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

const isInTunnel = s => ROAD.apart(s, TUNNEL.s) < TUNNEL.length / 2 + 6;

// --- The desert's dunes ------------------------------------------------------

/** The desert's dunes, track, pads and oasis all lie within this far of its middle, along each axis. */
const DESERT_REACH = 150;

function inDesertBox(x, z) {
  return Math.abs(x - DESERT.x) < DESERT_REACH && Math.abs(z - DESERT.z) < DESERT_REACH;
}

const desertTrack = TRACKS.find(track => track.desert).path;

/** The dunes rise within this distance of the desert's middle. */
const DUNES = 110;
/** The way the wind blows across the desert, from the west-south-west, as the smoke drifts. */
const WIND = { x: 0.89, z: -0.45 };

/**
 * How high the sand dunes stand at a point: long ridges lying across the wind, rising gently on the
 * side it comes from and dropping more steeply on the far side, wandering, swelling and dying away
 * towards the desert's edge. They are kept off the outer road, which runs through on the land as it
 * was, off the ground round the petrol station and the oasis, and low beside the desert's track,
 * so it runs between them and not in a cutting.
 */
function duneHeight(x, z) {
  const dx = x - DESERT.x;
  const dz = z - DESERT.z;
  if (Math.abs(dx) > DUNES || Math.abs(dz) > DUNES) return 0;
  const quiet = (place, from, to) => smoothstep(Math.hypot(x - place.x, z - place.z), from, to);
  const weight =
    (1 - smoothstep(Math.hypot(dx, dz), DUNES * 0.6, DUNES)) *
    smoothstep(Math.abs(Math.hypot(x, z) - outerRadius(Math.atan2(z, x))), 12, 40) *
    quiet(DESERT.station, 24, 44) *
    quiet(DESERT.oasis, 45, 65);
  if (weight <= 0) return 0;
  const beside = smoothstep(desertTrack.nearest(x, z).distance, 4, 24);
  if (beside <= 0) return 0;
  const across = x * WIND.x + z * WIND.z + (fractalNoise(x / 120 + 2.3, z / 120 + 7.1, 2, 61) - 0.5) * 24;
  const t = (((across / 72) % 1) + 1) % 1;
  const ridge = t < 0.65 ? smoothstep(t, 0, 0.65) : 1 - smoothstep(t, 0.65, 1);
  return weight * beside * 3 * ridge * (0.55 + 0.45 * valueNoise(x / 70, z / 70, 63));
}

/** How deep the creek runs. */
export const WATER_DEPTH = 0.55;
/** How deep the brook runs. */
export const BROOK_DEPTH = 0.32;
/** How far out from the oxbow's middle line its water reaches. */
export const OXBOW_REACH = 12;

/**
 * Builds the height field, step by step: the land as it lies, then every road, track and pad
 * levelled across it, the rivers, the creek, the brook, the ponds and the oxbow dug out, and
 * the desert laid over it last. Returns the heights and what was worked out along the way that
 * the questions asked of the ground need again (see terrain.js), all as plain data.
 */
export function buildHeightField() {
  const heights = new Float32Array(GRID * GRID);
  const sampleGrid = heightSampler(heights);

  // Scratch space for nearestSamples(): the closest sample found so far for each vertex.
  const closestIndex = new Int32Array(GRID * GRID).fill(-1);
  const closestDistance = new Float64Array(GRID * GRID);

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

  /**
   * Level the ground across a path so the car doesn't lean sideways on it. The profile
   * along it is the ground smoothed over `window` metres either way, and no steeper than
   * `grade`; `banks` widens the sides of deeper cuttings and embankments so they slope gently.
   */
  function levelAlong(
    path,
    flatWidth,
    falloff,
    { window = 14, banks = 0, grade = Infinity, flatEnds = 0, levels } = {},
  ) {
    // Where a long bridge carries it, it runs straight from the ground at one end of the deck to the
    // ground at the other, and the ground under the deck is left as it lies unless it stands higher.
    const decks = SPANS.filter(span => span.path === path).map(span => ({
      first: path.samples.findIndex(p => p.s >= span.from),
      last: path.samples.findLastIndex(p => p.s <= span.to),
    }));
    const straighten = values => {
      for (const { first, last } of decks) {
        for (let i = first + 1; i < last; i++)
          values[i] = lerp(values[first], values[last], (i - first) / (last - first));
      }
      return values;
    };
    const smooth =
      levels ??
      smoothProfile(
        straighten(path.samples.map(p => sampleGrid(p.x, p.z))),
        Math.round(window / path.spacing),
        path.closed,
      );
    const profile = Number.isFinite(grade) ? limitGrade(smooth, path.spacing, grade, path.closed) : smooth;
    // Where it fords a river it dips into the water, and where it crosses one on a bridge it comes
    // down to the valley floor, on ramps no steeper than it may climb.
    const dips = [
      ...FORDS.map(ford => ({ ...ford, flat: ford.river.halfWidth(ford.riverS) + 1 })),
      ...BRIDGES.filter(bridge => bridge.river).map(bridge => ({
        ...bridge,
        level: riverLevel(bridge.river, bridge.riverS) + 0.4,
        flat: bridge.length / 2,
      })),
    ];
    for (const dip of dips) {
      if (dip.path !== path) continue;
      const ramp = Number.isFinite(grade) ? grade : 0.15;
      path.samples.forEach(({ s }, i) => {
        const along = path.closed
          ? path.length / 2 - Math.abs(path.wrap(s - dip.s) - path.length / 2)
          : Math.abs(s - dip.s);
        profile[i] = Math.min(profile[i], dip.level + Math.max(0, along - dip.flat) * ramp);
      });
    }
    if (flatEnds) {
      // Level for the first and last few metres, so it meets the roads at its ends square on.
      const last = profile.length - 1;
      const [start, end] = [profile[0], profile[last]];
      path.samples.forEach(({ s }, i) => {
        profile[i] = lerp(start, profile[i], smoothstep(s, flatEnds * 0.4, flatEnds * 1.6));
        profile[i] = lerp(end, profile[i], smoothstep(path.length - s, flatEnds * 0.4, flatEnds * 1.6));
      });
    }
    straighten(profile);
    const reach = s => flatWidth(s) + falloff;
    const maxReach = Math.max(...path.samples.map(p => reach(p.s))) + (banks ? 24 : 0);
    for (const [vertex, { index, distance }] of nearestSamples(path, maxReach)) {
      const s = path.samples[index].s;
      const bank = banks ? Math.min(24, Math.abs(heights[vertex] - profile[index]) * banks) : 0;
      const weight = 1 - smoothstep(distance, flatWidth(s), reach(s) + bank);
      // Under a deck only what stands higher than it is cut away, to a little below it.
      const under = decks.some(({ first, last }) => index > first && index < last);
      const level = under ? Math.min(heights[vertex], profile[index] - 0.2) : profile[index];
      heights[vertex] = lerp(heights[vertex], level, weight);
    }
    return profile;
  }

  /**
   * Tilts the ground across a stretch of a path, rising by `slope` for every metre to the side that
   * is already higher, out to 6 m and easing off by 16, so the path runs along a side slope and the
   * car leans on it. The path's own height is left as it is.
   */
  function tiltAcross(path, { from, to, slope }) {
    const bench = 6;
    const reach = 16;
    const stretch = path.samples.filter(p => p.s >= from && p.s <= to);
    let rise = 0;
    for (const p of stretch)
      rise += sampleGrid(p.x - p.dz * 8, p.z + p.dx * 8) - sampleGrid(p.x + p.dz * 8, p.z - p.dx * 8);
    const uphill = rise >= 0 ? 1 : -1;
    for (const [vertex, { index, distance }] of nearestSamples(path, reach)) {
      const p = path.samples[index];
      const along = smoothstep(p.s, from, from + 10) * (1 - smoothstep(p.s, to - 10, to));
      if (along <= 0) continue;
      const side = (AXIS[vertex % GRID] - p.x) * -p.dz + (AXIS[Math.floor(vertex / GRID)] - p.z) * p.dx;
      heights[vertex] += uphill * slope * clamp(side, -bench, bench) * (1 - smoothstep(distance, bench, reach)) * along;
    }
  }

  // --- Build the height field -------------------------------------------------

  for (let iz = 0; iz < GRID; iz++) {
    for (let ix = 0; ix < GRID; ix++) heights[iz * GRID + ix] = naturalHeight(AXIS[ix], AXIS[iz]);
  }

  function flattenPads(pads) {
    for (const pad of pads) {
      const level = pad.level === 'ground' ? sampleGrid(pad.x, pad.z) : (pad.level ?? naturalHeight(pad.x, pad.z));
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

  // Each river runs along a valley floor that falls all the way from its source to its mouth:
  // the lie of the land along it, smoothed, never rising again once it has fallen. It lies level
  // where a road crosses it, ford or bridge, and falls a little more steeply either side of that.
  const riverFloors = VALLEY_RIVERS.map(({ path, sites }) => {
    let lowest = Infinity;
    const natural = smoothProfile(
      path.samples.map(p => sampleGrid(p.x, p.z)),
      Math.round(60 / path.spacing),
      false,
    );
    const falling = natural.map(h => (lowest = Math.min(lowest, h)));
    const floor = smoothProfile(falling, Math.round(20 / path.spacing), false);
    for (const site of sites.filter(site => site.kind !== 'pool')) {
      const level = floor[Math.round(site.s / path.spacing)];
      path.samples.forEach(({ s }, i) => {
        floor[i] = lerp(floor[i], level, 1 - smoothstep(Math.abs(s - site.s), 14, 44));
      });
    }
    return floor;
  });

  /** The water surface along each river, a little below its valley floor. */
  const riverWater = riverFloors.map(floor => floor.map(h => h - 0.4));

  /** Water surface height of a river at a distance along it. */
  function riverLevel(river, s) {
    const water = riverWater[RIVERS.indexOf(river)];
    return water[clamp(Math.round(s / river.path.spacing), 0, water.length - 1)];
  }

  /**
   * Where a gravel road or a track crosses a river: `s` along the road, `level` the road's surface
   * in the water. Found where the road comes closest to the river.
   */
  const FORDS = [];
  const GRAVEL_WIDTH = () => GRAVEL_HALF_WIDTH + 1.2;
  const fordable = [
    ...GRAVEL.map(path => ({ path, width: GRAVEL_WIDTH() })),
    ...TRACKS.map(({ path, width = 2 }) => ({ path, width })),
  ];
  function findFords(river) {
    const water = riverWater[RIVERS.indexOf(river)];
    for (const { path, width } of fordable) {
      const n = path.samples.length;
      const apart = path.samples.map(p => (river.path.isNear(p.x, p.z, 3) ? river.path.nearest(p.x, p.z).distance : 9));
      const at = i => apart[path.closed ? (i + n) % n : clamp(i, 0, n - 1)];
      path.samples.forEach((p, i) => {
        if (apart[i] > 2 || apart[i] > at(i - 1) || apart[i] >= at(i + 1) || isBridged(path, p.s)) return;
        const along = river.path.nearest(p.x, p.z).s;
        const level = water[Math.round(along / river.path.spacing)] - FORD_DEPTH;
        FORDS.push({ river, path, width, s: p.s, riverS: along, x: p.x, z: p.z, level });
      });
    }
  }
  /** Levels the floor of a river's valley along it. */
  const levelValley = river =>
    levelAlong(river.path, s => river.halfWidth(s) + river.bank, river.spread, {
      levels: riverFloors[RIVERS.indexOf(river)],
    });
  VALLEY_RIVERS.forEach(findFords);
  VALLEY_RIVERS.forEach(levelValley);

  // The fjord is dug out of the land before any road is laid: deep still water, sheer walls
  // along its sides and a gentle slope round its head that steepens further back to meet the hills.
  // At its far end it opens out into the bay, where the water shelves quickly to its depth and the
  // shore is a gentle beach rising to the flat coast.
  for (const [vertex, { index, distance }] of nearestSamples(FJORD.path, 230)) {
    const { s } = FJORD.path.samples[index];
    const [x, z] = [AXIS[vertex % GRID], AXIS[Math.floor(vertex / GRID)]];
    const halfWidth = FJORD.widthAt(s, x, z);
    const bed = FJORD.level - 0.6;
    const bay = FJORD.bayness(s);
    // The beach takes over from the sheer walls where the land is the Lofoten coast's.
    const coast = 1 - smoothstep(Math.hypot(x - LOFOTEN.x, z - LOFOTEN.z), LOFOTEN.radius - 20, LOFOTEN.radius + 60);
    const slope = lerp(lerp(0.22, 2.4, smoothstep(s, 20, 90)), 0.16, coast);
    // Back from the water the land rises out of the way of the carving: from further off the middle
    // of the fjord, and from further off the water's edge on the coast.
    const wall = lerp(smoothstep(distance, 100, 170) * 70, smoothstep(distance - halfWidth, 20, 60) * 600, coast);
    const offshore = halfWidth - distance;
    const ground =
      distance < halfWidth
        ? bed - FJORD.depth * lerp(1 - (distance / halfWidth) ** 2, smoothstep(offshore, 0, 12), bay)
        : bed + (distance - halfWidth) * slope + wall;
    heights[vertex] = Math.min(heights[vertex], ground);
  }

  levelAlong(CAMP_TRAIL, () => 2.4, 6);
  // The Lofoten coast's roads of packed snow are laid on its flat land, level across and gentle along.
  // The quay's short road is left to the ground raised under it to meet the ramp (see PADS).
  for (const [name, road] of Object.entries(LOFOTEN.roads)) {
    if (name !== 'quay') levelAlong(road, () => 3, 8, { window: 20, grade: 0.08 });
  }
  // Tracks off the gravel roads are laid after the roads, so they leave them where the roads now are.
  const offGravel = ({ path }) => GRAVEL.some(road => road.isNear(path.samples[0].x, path.samples[0].z, 1));
  const levelTrack = track =>
    levelAlong(track.path, () => track.width ?? 2, 8, { grade: track.grade, window: track.window });
  VALLEY_TRACKS.filter(track => !offGravel(track)).forEach(levelTrack);
  const PAVED_WIDTH = () => ROAD_HALF_WIDTH + 1.4;
  const ringLevels = levelAlong(RING_ROAD, PAVED_WIDTH, 10, { window: 30, banks: 1.5, grade: 0.1 });
  // The gravel road round the outlands follows the land a little more closely than the paved ones.
  const GRAVEL_GRADE = { window: 24, banks: 1.2, grade: 0.12 };
  const outerLevels = levelAlong(OUTER_ROAD, GRAVEL_WIDTH, 10, GRAVEL_GRADE);
  const railProfile = levelRailway();
  // The driveways run from their forecourts down to the road; the pads after them level the forecourts.
  for (const { path, halfWidth } of DRIVEWAYS) levelAlong(path, () => halfWidth + 0.6, 6, { grade: 0.12 });
  // Pads come after the side tracks so the tracks run up onto level ground.
  flattenPads(PADS.filter(pad => !pad.land && !inDesertBox(pad.x, pad.z)));

  // The tunnel floor is levelled wider than the bore so no ground pokes inside.
  const trailWidth = s => (isInTunnel(s) ? 9 : ROAD_HALF_WIDTH + 1.4);
  const roadProfile = levelAlong(ROAD, trailWidth, 10);
  // The paved roads up to the ring leave the finished trail and meet the ring on the level,
  // and climb steadily in between, cutting into the hillside or running on low banks. The
  // gravel roads out to the outer road do the same from the ring. The roads they joined are
  // then put back where they were.
  for (const link of LINKS)
    levelAlong(link.path, PAVED_WIDTH, 10, { window: 30, banks: 1.5, grade: link.grade, flatEnds: 10 });
  // The new road being built off the ring does too, and stays gentle all the way to the site.
  levelAlong(ROADWORKS.path, PAVED_WIDTH, 10, { window: 30, banks: 1.5, grade: 0.04, flatEnds: 10 });
  for (const { path } of CONNECTORS) levelAlong(path, GRAVEL_WIDTH, 10, { ...GRAVEL_GRADE, flatEnds: 10 });
  // The rough trail's dry gully is cut before the trail is laid, so the trail dips into it.
  for (const [vertex] of nearestSamples(ROUGH.gully.path, ROUGH.gully.halfWidth)) {
    heights[vertex] -= gullyDepth(AXIS[vertex % GRID], AXIS[Math.floor(vertex / GRID)]);
  }
  VALLEY_TRACKS.filter(track => offGravel(track) && !track.desert).forEach(levelTrack);
  // The washed-out track and the dry stream bed are dug into the ground once their tracks are levelled.
  for (const entry of ROUGH_GROUND.filter(rough => rough.dig)) {
    for (const [vertex] of nearestSamples(entry.path, entry.half + 3)) {
      const { s, side } = entry.path.nearest(AXIS[vertex % GRID], AXIS[Math.floor(vertex / GRID)]);
      heights[vertex] -= entry.dig(s, side);
    }
  }
  tiltAcross(ROUGH.path, ROUGH.lean);
  // The summit beside the trail is levelled off for the lookout once the trail is laid, so as not to
  // pull the trail's cutting about.
  flattenPads([{ ...ROUGH.lookout, level: sampleGrid(ROUGH.lookout.x, ROUGH.lookout.z) }]);
  levelAlong(ROAD, trailWidth, 0.5, { levels: roadProfile });
  levelAlong(RING_ROAD, PAVED_WIDTH, 0.5, { levels: ringLevels });
  levelAlong(OUTER_ROAD, GRAVEL_WIDTH, 0.5, { levels: outerLevels });

  // Ponds lie in shallow bowls dug into the levelled green, their water just below its edge. The
  // oasis is dug with the rest of the desert, last.
  const pondLevels = PONDS.map(({ x, z }) => sampleGrid(x, z) - 0.3);
  function digPond(pond, level) {
    forEachVertexNear(pond.x, pond.z, pond.radius + 3, (vertex, _x, _z, distance) => {
      const bowl = level - 1.1 * (1 - smoothstep(distance, 0, pond.radius)) + Math.max(0, distance - pond.radius) * 0.4;
      heights[vertex] = Math.min(heights[vertex], bowl);
    });
  }
  PONDS.forEach((pond, i) => {
    if (pond !== DESERT.oasis) digPond(pond, pondLevels[i]);
  });

  // --- River channels ------------------------------------------------------------------------

  // Once the river's channel is dug, the road is put back across it. Its surface is taken here,
  // before the digging.
  const roadStretch = (path, width, from, to) => {
    const points = [];
    for (let k = from; k <= to; k += 2) {
      const p = path.at(k);
      // An open road clamps at its ends, so the stretch stops there.
      if (!points.length || Math.hypot(p.x - points.at(-1)[0], p.z - points.at(-1)[1]) > 0.5) points.push([p.x, p.z]);
    }
    const stretch = createPath(points);
    return { stretch, width, levels: stretch.samples.map(p => sampleGrid(p.x, p.z)) };
  };
  const fordStretch = ({ river, riverS, path, s, width }) => {
    const reach = river.halfWidth(riverS) + 8;
    return roadStretch(path, width, s - reach, s + reach);
  };
  const fordCrossings = FORDS.map(fordStretch);
  // Where a bridge carries a road over a river, the road is put back up to the ends of the deck,
  // and on past them, so the banks the channel is cut with don't cut into it: under the deck the
  // channel is left as it is.
  for (const bridge of BRIDGES) {
    if (!bridge.river) continue;
    const width = GRAVEL.includes(bridge.path)
      ? GRAVEL_WIDTH()
      : (TRACKS.find(t => t.path === bridge.path)?.width ?? 2);
    const [near, far] = [bridge.length / 2 - 0.5, bridge.length / 2 + 16];
    fordCrossings.push(
      roadStretch(bridge.path, width, bridge.s - far, bridge.s - near),
      roadStretch(bridge.path, width, bridge.s + near, bridge.s + far),
    );
  }

  // The channel: deepest in the middle, with banks rising gently from the water's edge. Its width
  // and depth change along the river, its banks wander from side to side, and on the inside of
  // the bends the gravel lies in bars just above the water, which narrows the stream there. The
  // banks are cut no further out than the level floor of the river's valley reaches, so in a gorge
  // they leave the walls standing.
  function digChannel(river) {
    const water = riverWater[RIVERS.indexOf(river)];
    const { samples } = river.path;
    // How sharply the river is turning at each sample: positive to the right, so the right bank is
    // the inside of the bend.
    const turning = samples.map((_, i) => {
      const [a, b] = [samples[Math.max(0, i - 12)], samples[Math.min(samples.length - 1, i + 12)]];
      return a.dx * b.dz - a.dz * b.dx;
    });
    for (const [vertex, { index, distance }] of nearestSamples(river.path, river.widest + Math.min(12, river.bank))) {
      const sample = samples[index];
      const [x, z] = [AXIS[vertex % GRID], AXIS[Math.floor(vertex / GRID)]];
      const halfWidth = river.halfWidth(sample.s) * (0.82 + 0.36 * valueNoise(x / 10, z / 10, 71));
      const across = distance / halfWidth;
      const floor = water[index] - 0.05;
      let surface =
        across < 1 ? floor - river.depth(sample.s) * (1 - across * across) : floor + (distance - halfWidth) * 0.35;
      // The bar lies on the inside of a bend, where the current is slow, and comes and goes along it.
      const rightOf = (x - sample.x) * -sample.dz + (z - sample.z) * sample.dx;
      const bar =
        rightOf * turning[index] > 0 && across < 1.3
          ? smoothstep(Math.abs(turning[index]), 0.08, 0.3) *
            smoothstep(valueNoise(sample.s / 26, 3.3, 5), 0.28, 0.55) *
            (1 - river.engineered(sample.s)) *
            smoothstep(across, 0.3, 0.55)
          : 0;
      if (bar > 0) surface = lerp(surface, Math.max(surface, water[index] + 0.1), bar);
      heights[vertex] = Math.min(heights[vertex], surface);
    }
  }
  VALLEY_RIVERS.forEach(digChannel);
  for (const { stretch, width, levels } of fordCrossings) levelAlong(stretch, () => width, 3, { levels });

  /** Height of the trail surface at the bridge, used to dig the creek deep enough. */
  const roadAtBridge = roadProfile[ROAD.samples.findIndex(p => p.s === BRIDGE.s)];

  // The creek bed always runs downhill and stays well below its banks.
  const POOL_DEPTH = 1.1;
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

  // The brook runs downhill from the spring, rises to just under the trail at the ford so the
  // water there is shallow, and runs on into the lake. Its banks are gentle where the trail
  // dips through it, and steeper elsewhere.
  const roadAtFord = roadProfile[ROAD.samples.findIndex(p => p.s === FORD.s)];
  const brookBed = (() => {
    const bank = BROOK.samples.map(p => sampleGrid(p.x, p.z));
    const atFord = roadAtFord - 0.5;
    let lowest = Infinity;
    const spring = bank[0] - 0.7;
    return BROOK.samples.map((p, i) => {
      // No steeper than a steady fall from the spring to the ford, and never below the ford.
      const steady = lerp(spring, atFord, Math.min(1, p.s / FORD.brook));
      let bed = Math.max(Math.min(bank[i] - 0.7, steady), atFord);
      if (p.s > FORD.brook) bed = lerp(atFord, LAKE.level - 1, (p.s - FORD.brook) / (BROOK.length - FORD.brook));
      lowest = Math.min(lowest, bed);
      return lowest;
    });
  })();
  for (const [vertex, { index, distance }] of nearestSamples(BROOK, 14)) {
    const sample = BROOK.samples[index];
    const ford = 1 - smoothstep(Math.abs(sample.s - FORD.brook), 3, 8);
    const bank = brookBed[index] + Math.max(0, distance - BROOK_HALF_WIDTH) * lerp(0.45, 0.25, ford);
    heights[vertex] = Math.min(heights[vertex], bank);
    // Where the brook runs across a slope, the low side is banked up a little above the water,
    // except at the ford and where it runs out into the lake.
    const levee = distance > BROOK_HALF_WIDTH + 0.6 && distance < BROOK_HALF_WIDTH + 6 && ford < 0.05;
    if (levee && lakeDistance(sample.x, sample.z) > 1.2)
      heights[vertex] = Math.max(heights[vertex], brookBed[index] + BROOK_DEPTH + 0.12);
  }
  // A small pool where the brook starts, with a rim all round.
  const SPRING_LEVEL = brookBed[0] + BROOK_DEPTH;
  forEachVertexNear(SPRING.x, SPRING.z, SPRING.radius + 8, (vertex, _x, _z, distance) => {
    heights[vertex] = Math.min(heights[vertex], SPRING_LEVEL - 0.6 + Math.max(0, distance - SPRING.radius) * 0.5);
    if (
      distance > SPRING.radius + 0.6 &&
      distance < SPRING.radius + 6 &&
      !BROOK.isNear(AXIS[vertex % GRID], AXIS[Math.floor(vertex / GRID)], BROOK_HALF_WIDTH + 1)
    )
      heights[vertex] = Math.max(heights[vertex], SPRING_LEVEL + 0.12);
  });

  // The oxbow's water lies just below the lowest ground around it, so it fills the channel dug
  // for it and no more. The channel shelves smoothly down to its deepest along the middle, which
  // keeps the ford's slopes gentle, and its banks rise out of the water, more gently where the
  // track goes down into it and up out again.
  const OXBOW_LEVEL = Math.min(...nearestSamples(OXBOW.path, OXBOW_REACH).map(([vertex]) => heights[vertex])) - 0.05;
  const oxbowTrack = TRACKS.find(track => track.id === 'oxbow').path;
  for (const [vertex, { index, distance }] of nearestSamples(OXBOW.path, OXBOW_REACH + 6)) {
    const { s } = OXBOW.path.samples[index];
    const halfWidth = OXBOW.halfWidth(s);
    const onTrack =
      1 - smoothstep(oxbowTrack.nearest(AXIS[vertex % GRID], AXIS[Math.floor(vertex / GRID)]).distance, 3, 7);
    const bed =
      distance < halfWidth
        ? OXBOW_LEVEL - OXBOW.depth(s) * (0.5 + 0.5 * Math.cos((Math.PI * distance) / halfWidth))
        : OXBOW_LEVEL + (distance - halfWidth) * lerp(0.35, 0.16, onTrack);
    heights[vertex] = Math.min(heights[vertex], bed);
  }

  // --- The desert ----------------------------------------------------------------------------

  // The desert's dunes, its track, its pads and the hollow for its oasis are laid last, in the square
  // round it. The land in the square as it was before is kept, for placing the scenery by (see
  // placementHeight).
  const desertBox = (() => {
    const ix0 = Math.floor(gridCoordinate(DESERT.x - DESERT_REACH));
    const ix1 = Math.ceil(gridCoordinate(DESERT.x + DESERT_REACH));
    const iz0 = Math.floor(gridCoordinate(DESERT.z - DESERT_REACH));
    const iz1 = Math.ceil(gridCoordinate(DESERT.z + DESERT_REACH));
    const columns = ix1 - ix0 + 1;
    const before = new Float32Array(columns * (iz1 - iz0 + 1));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) before[(iz - iz0) * columns + ix - ix0] = heights[iz * GRID + ix];
    }
    return { ix0, ix1, iz0, iz1, columns, before };
  })();
  // The outer road where it crosses the desert, as it is, to put back once the track has been laid
  // off it and the petrol station beside it.
  const desertRoad = (() => {
    const stretch = createPath(
      OUTER_ROAD.samples
        .filter(p => Math.hypot(p.x - DESERT.x, p.z - DESERT.z) < DESERT_REACH - 20)
        .map(p => [p.x, p.z]),
    );
    return { stretch, levels: stretch.samples.map(p => sampleGrid(p.x, p.z)) };
  })();
  for (let iz = desertBox.iz0; iz <= desertBox.iz1; iz++) {
    for (let ix = desertBox.ix0; ix <= desertBox.ix1; ix++) heights[iz * GRID + ix] += duneHeight(AXIS[ix], AXIS[iz]);
  }
  flattenPads(PADS.filter(pad => inDesertBox(pad.x, pad.z)));
  TRACKS.filter(track => track.desert).forEach(levelTrack);
  const oasis = PONDS.indexOf(DESERT.oasis);
  pondLevels[oasis] = sampleGrid(DESERT.oasis.x, DESERT.oasis.z) - 0.3;
  digPond(DESERT.oasis, pondLevels[oasis]);
  levelAlong(desertRoad.stretch, GRAVEL_WIDTH, 0.5, { levels: desertRoad.levels });

  // --- The lakeland ---------------------------------------------------------------------------

  // The lakeland is laid last of all: its ground, then its beck, its road and its tracks. The land
  // as it was before, wherever the lakeland changes it, is kept for placing the valley's scenery
  // by (see placementHeight).
  const lakelandBox = (() => {
    let [ix0, ix1, iz0, iz1] = [GRID, 0, GRID, 0];
    const reach = LAKELAND.radius + 340;
    const [fromX, toX] = [gridCoordinate(LAKELAND.x - reach), gridCoordinate(LAKELAND.x + reach)].map(Math.round);
    const [fromZ, toZ] = [gridCoordinate(LAKELAND.z - reach), gridCoordinate(LAKELAND.z + reach)].map(Math.round);
    for (let iz = fromZ; iz <= toZ; iz++) {
      for (let ix = fromX; ix <= toX; ix++) {
        if (lakelandHold(AXIS[ix], AXIS[iz]) <= 0) continue;
        [ix0, ix1] = [Math.min(ix0, ix), Math.max(ix1, ix)];
        [iz0, iz1] = [Math.min(iz0, iz), Math.max(iz1, iz)];
      }
    }
    // Its road reaches back into the valley, and the banks it is laid on reach out either side of it.
    for (const { x, z } of LAKELAND.road.samples) {
      [ix0, ix1] = [
        Math.min(ix0, Math.floor(gridCoordinate(x - 60))),
        Math.max(ix1, Math.ceil(gridCoordinate(x + 60))),
      ];
      [iz0, iz1] = [
        Math.min(iz0, Math.floor(gridCoordinate(z - 60))),
        Math.max(iz1, Math.ceil(gridCoordinate(z + 60))),
      ];
    }
    // Out to whole cells of the grid as it was (see legacyLines), which are four of the cells there now.
    [ix0, iz0] = [Math.max(0, ix0 - 4), Math.max(0, iz0 - 4)];
    [ix1, iz1] = [Math.min(GRID - 1, ix1 + 4), Math.min(GRID - 1, iz1 + 4)];
    const columns = ix1 - ix0 + 1;
    const before = new Float32Array(columns * (iz1 - iz0 + 1));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) before[(iz - iz0) * columns + ix - ix0] = heights[iz * GRID + ix];
    }
    return { ix0, ix1, iz0, iz1, columns, before };
  })();
  for (let iz = lakelandBox.iz0; iz <= lakelandBox.iz1; iz++) {
    for (let ix = lakelandBox.ix0; ix <= lakelandBox.ix1; ix++) {
      const hold = lakelandHold(AXIS[ix], AXIS[iz]);
      if (hold <= 0) continue;
      const i = iz * GRID + ix;
      heights[i] = lerp(heights[i], lakelandHeight(AXIS[ix], AXIS[iz]), hold);
    }
  }
  // The beck runs down the floor of its gorge, which is cut already, and out into the lake.
  const beck = RIVERS.find(river => river.id === 'beck');
  riverFloors.push([...BECK_FLOOR]);
  riverWater.push(riverFloors.at(-1).map(h => h - 0.4));
  findFords(beck);
  // A track that runs beside the beck comes close to it more than once at a crossing: one ford each.
  for (let i = FORDS.length - 1; i > 0; i--) {
    const [ford, earlier] = [FORDS[i], FORDS[i - 1]];
    if (ford.river === beck && earlier.river === beck && earlier.path === ford.path && ford.s - earlier.s < 12)
      FORDS.splice(i, 1);
  }
  levelValley(beck);
  // The outer road where the lakeland's road leaves it, as it is, to put back once that is laid.
  const lakelandJoin = (() => {
    const { s } = OUTER_ROAD.nearest(LAKELAND.road.samples[0].x, LAKELAND.road.samples[0].z);
    return roadStretch(OUTER_ROAD, GRAVEL_WIDTH(), s - 50, s + 50);
  })();
  levelAlong(LAKELAND.road, GRAVEL_WIDTH, 10, { ...GRAVEL_GRADE, flatEnds: 10 });
  const landTracks = TRACKS.filter(track => track.land);
  landTracks.forEach(levelTrack);
  flattenPads(PADS.filter(pad => pad.land));
  levelAlong(lakelandJoin.stretch, GRAVEL_WIDTH, 0.5, { levels: lakelandJoin.levels });
  const beckCrossings = FORDS.filter(ford => ford.river === beck).map(fordStretch);
  digChannel(beck);
  for (const { stretch, width, levels } of beckCrossings) levelAlong(stretch, () => width, 3, { levels });

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

  return {
    heights,
    fords: FORDS,
    pondLevels,
    riverWater,
    creekBed,
    brookBed,
    oxbowLevel: OXBOW_LEVEL,
    railBed,
    desert: desertBox,
    lakeland: lakelandBox,
  };
}

// --- As plain data -------------------------------------------------------------------------

/** The roads and tracks a river can be forded on, so a ford can be sent as where its road is in this list. */
const FORD_PATHS = [...GRAVEL, ...TRACKS.map(track => track.path)];

/** The height field as plain data, to be stored (see pack.js): each ford names its river and its road by number. */
export function packField(field) {
  const fords = field.fords.map(ford => ({
    ...ford,
    river: RIVERS.indexOf(ford.river),
    path: FORD_PATHS.indexOf(ford.path),
  }));
  return { ...field, fords };
}

/** The height field again from what packField() gave. */
export function unpackField(data) {
  const fords = data.fords.map(ford => ({ ...ford, river: RIVERS[ford.river], path: FORD_PATHS[ford.path] }));
  return { ...data, fords };
}
