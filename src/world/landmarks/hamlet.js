// The hamlet at the end of the road into the lakeland: four timber cottages round the square, each
// facing it, and a boathouse on the shore with rowing boats drawn up beside it. The cottages are
// roubenky of the Orlické hory: dark logs laid in courses with pale chinking showing between them,
// the log ends crossing at the corners, on a low stone footing under a steep roof with deep
// eaves, the gable ends boarded upright, with small white-framed windows, a stone chimney and a
// door in the long wall that faces the square. No two are the same: one has a porch and smoke
// from its chimney, one a lean-to woodshed, one a bench and a woodpile, one a split-rail fence
// along its garden.
import * as THREE from 'three';
import { createRandom } from '../../core/math.js';
import { LAKELAND } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, createSmoke, gableEnds, gableRoof, localFrame } from '../build.js';

const CHINK = '#cfc4a6';
const LOGS = ['#7d5a3d', '#6e4d35', '#8a6542', '#76543b'];
const STONE = '#8d897d';
const STONE_LOW = '#75726a';
const BOARDS = '#a08460';
const BATTEN = '#7a5d41';
const FRAME = '#f1ede2';
const GLASS = '#4a5b68';
const SEAT = '#8a6a49';
const POST = '#5f4532';
const TAN = '#c9a875';
const BARK = ['#6a5038', '#5a432f', '#76593e'];

/** Where the logs begin above the ground, and how high each course is and how far apart they lie. */
const SILL = 0.46;
const PITCH = 0.34;
const LOG = 0.29;
const THICK = 0.28;

/** One of the four cottages: its size, its roof, its door and windows, and what is built on to it. */
const COTTAGES = [
  {
    length: 8,
    depth: 5.6,
    roof: '#6e7479',
    stripe: '#5f656a',
    door: { along: -1.3, color: '#4c5d4f' },
    windows: [-3, 1.4, 3],
    end: [0],
    back: [-1.5, 1.5],
    porch: true,
    smoke: true,
    chimney: 2.3,
  },
  {
    length: 6.6,
    depth: 5.4,
    roof: '#8d6b4b',
    stripe: '#795a3f',
    door: { along: 0.9, color: '#6a3f35' },
    windows: [-1.5, 2.5],
    end: [],
    back: [0],
    westEnd: [0],
    shed: true,
    chimney: -1.5,
  },
  {
    length: 7.4,
    depth: 5.6,
    roof: '#7f786d',
    stripe: '#6c665c',
    door: { along: -0.4, color: '#3f4f63' },
    windows: [-2.5, 1.7],
    end: [0],
    back: [1],
    bench: true,
    woodpile: true,
    chimney: 1.6,
  },
  {
    length: 6.8,
    depth: 5.6,
    roof: '#9b7b57',
    stripe: '#85694a',
    door: { along: 1, color: '#5a4636' },
    windows: [-1.9, 2.6],
    end: [0],
    back: [-0.5],
    fence: true,
    chimney: -1.6,
  },
];

/** A site's ground level and the two ways of placing something by its own measurements: `local` for the map, `at` for a part. */
function framer({ x, z, rotation }) {
  const y = terrainHeight(x, z);
  const local = localFrame(x, z, rotation);
  const at = (lx, ly, lz, extra = {}) => ({ ...local(lx, lz), y: y + ly, ry: rotation, ...extra });
  return { x, z, y, rotation, local, at };
}

/** A box obstacle `halfX` by `halfZ` about the point (lx, lz) of a frame. */
const block = (frame, lx, lz, halfX, halfZ) => ({
  ...frame.local(lx, lz),
  halfX,
  halfZ,
  rotation: frame.rotation,
  radius: 0,
});

/** The courses of slats, laid along the ridge, that make a roof read as shingled. `place(c, y, extra)` puts a part `c` across from the ridge. */
function shingles(parts, place, { length, half, rise, ridge, overhang, color, ridgeColor }) {
  const slope = Math.atan2(rise, half);
  const run = half + overhang;
  for (let u = 0.45; u < run - 0.2; u += 0.95 * Math.cos(slope)) {
    for (const side of [-1, 1]) {
      const top = ridge + 0.15 - (rise / half) * u;
      parts.box(length + overhang * 2 - 0.04, 0.06, 0.3, color, place(side * u, top, { rx: side * slope }));
    }
  }
  parts.box(length + overhang * 2 - 0.04, 0.14, 0.3, ridgeColor, place(0, ridge + 0.17));
}

/** A small window, with its frame, glazing bars and sill, on the wall `side` of a cottage. */
function window(parts, wall, along, y, w, h, shutters) {
  parts.box(w + 0.24, h + 0.24, 0.1, FRAME, wall(along, y, 0.02));
  parts.box(w, h, 0.12, GLASS, wall(along, y, 0.02));
  parts.box(0.05, h, 0.14, FRAME, wall(along, y, 0.02));
  parts.box(w, 0.05, 0.14, FRAME, wall(along, y, 0.02));
  parts.box(w + 0.4, 0.07, 0.24, FRAME, wall(along, y - h / 2 - 0.15, 0.1));
  if (!shutters) return;
  for (const side of [-1, 1]) {
    parts.box(0.3, h + 0.2, 0.05, shutters, wall(along + side * (w / 2 + 0.29), y, 0.03));
  }
}

/** A cottage, standing at `site` with its door towards (+Z of its own frame) the square. */
function cottage(scene, parts, obstacles, spec, site, random) {
  const frame = framer(site);
  const { at, local } = frame;
  const { length: L, depth: D } = spec;
  const courses = 8;
  const eave = SILL + courses * PITCH - 0.05;
  const half = D / 2;
  const rise = half * 0.95;
  const ridge = eave + rise;

  // The footing: a darker course under a lighter one, standing out from the logs all round.
  parts.box(L + 0.3, 0.7, D + 0.3, STONE_LOW, at(0, -0.05, 0));
  parts.box(L + 0.22, 0.24, D + 0.22, STONE, at(0, 0.38, 0));

  // The logs, a course at a time: in one the long walls run through to cross past the corners,
  // in the next the end walls do. Between them the chinking shows as a pale stripe.
  parts.box(L - 0.12, eave - SILL - 0.04, D - 0.12, CHINK, at(0, (eave + SILL - 0.04) / 2, 0));
  for (let k = 0; k < courses; k++) {
    const y = SILL + k * PITCH + LOG / 2;
    const long = k % 2 === 0;
    const colour = () => LOGS[Math.floor(random() * LOGS.length)];
    for (const side of [-1, 1]) {
      const lz = side * (D / 2 - THICK / 2);
      const lx = side * (L / 2 - THICK / 2);
      parts.box(long ? L + 0.3 : L - THICK * 2, LOG, THICK, colour(), at(0, y, lz));
      parts.box(THICK, LOG, long ? D - THICK * 2 : D + 0.3, colour(), at(lx, y, 0));
    }
  }

  // Part of a wall's face, `out` from it: where along a wall, how high, and how far out.
  const walls = {
    front: (along, y, out) => at(along, y, D / 2 + out),
    back: (along, y, out) => at(-along, y, -D / 2 - out, { ry: frame.rotation + Math.PI }),
    east: (along, y, out) => at(L / 2 + out, y, -along, { ry: frame.rotation + Math.PI / 2 }),
    west: (along, y, out) => at(-L / 2 - out, y, along, { ry: frame.rotation - Math.PI / 2 }),
  };
  // Parts on a wall's face, already turned to it.
  const onWall = name => (along, y, out) => walls[name](along, y, out);

  // The roof, its shingles, and the gable ends boarded upright under it.
  const turn = { ry: frame.rotation + Math.PI / 2 };
  parts.add(gableEnds(D, L - 0.04, eave - 0.03, ridge), BOARDS, at(0, 0, 0, turn));
  parts.add(gableRoof(D, L, eave, ridge, 0.5), spec.roof, at(0, 0, 0, turn));
  shingles(parts, (c, y, extra = {}) => at(0, y, c, extra), {
    length: L,
    half,
    rise,
    ridge,
    overhang: 0.5,
    color: spec.stripe,
    ridgeColor: spec.stripe,
  });
  for (const end of ['east', 'west']) {
    for (let u = -half + 0.5; u < half - 0.3; u += 0.9) {
      const h = rise * (1 - Math.abs(u) / half) - 0.12;
      if (h > 0.2) parts.box(0.13, h, 0.05, BATTEN, onWall(end)(u, eave + h / 2, 0.0));
    }
  }

  // The chimney, in stone, up through the roof near one end.
  const chimney = { lx: spec.chimney + (spec.chimney > 0 ? L / 2 - 2.5 : 0), top: ridge + 1 };
  parts.box(0.8, chimney.top - ridge + 1.2, 0.8, STONE, at(chimney.lx, (chimney.top + ridge - 1.2) / 2, 0));
  parts.box(1, 0.14, 1, STONE_LOW, at(chimney.lx, chimney.top + 0.07, 0));

  // The door, with its stone step or porch, and the windows.
  const door = spec.door;
  const front = onWall('front');
  parts.box(1.3, 2.25, 0.08, FRAME, front(door.along, SILL + 1.1, 0.0));
  parts.box(1, 2.05, 0.1, door.color, front(door.along, SILL + 1.04, 0.02));
  parts.box(0.1, 0.1, 0.1, '#c9b38a', front(door.along + 0.34, SILL + 1, 0.1));
  const step = spec.porch ? { w: 3, d: 1.7 } : { w: 1.5, d: 0.9 };
  parts.box(step.w, 0.56, step.d, STONE, front(door.along, 0.18, step.d / 2 + 0.05));
  const shutters = [null, '#5d6f5e', null, '#6c4a40'][COTTAGES.indexOf(spec)];
  for (const along of spec.windows) window(parts, front, along, 1.55 + SILL, 0.8, 0.9, shutters);
  for (const along of spec.back) window(parts, onWall('back'), along, 1.55 + SILL, 0.8, 0.9, null);
  for (const along of spec.end) window(parts, onWall('east'), along, 1.55 + SILL, 0.7, 0.8, null);
  for (const along of spec.westEnd ?? []) window(parts, onWall('west'), along, 1.55 + SILL, 0.7, 0.8, null);

  obstacles.push(block(frame, 0, 0, L / 2 + 0.15, D / 2 + 0.15));

  if (spec.porch) {
    // Two posts under a little sloping roof, over a deck as wide as the step.
    const out = D / 2 + step.d;
    for (const side of [-1, 1]) {
      parts.box(0.16, 2.5, 0.16, POST, at(door.along + side * (step.w / 2 - 0.2), 1.7, out - 0.2));
    }
    parts.box(step.w + 0.4, 0.1, step.d + 0.5, spec.roof, at(door.along, 3.0, D / 2 + step.d / 2 + 0.15, { rx: 0.2 }));
    obstacles.push(block(frame, door.along, D / 2 + step.d / 2 - 0.1, step.w / 2, step.d / 2 + 0.1));
  }

  if (spec.shed) {
    // A lean-to against the east end, its roof falling away from the house, with split logs stacked in it.
    const wide = 2.5;
    const depth = 4.2;
    const lz = -0.4;
    const high = eave - 0.35;
    const low = 1.95;
    const drop = Math.atan2(high - low, wide);
    for (const side of [-1, 1])
      parts.box(0.16, low, 0.16, POST, at(L / 2 + wide - 0.15, low / 2 - 0.05, lz + side * (depth / 2 - 0.1)));
    parts.box(
      wide + 0.5,
      0.12,
      depth + 0.4,
      spec.roof,
      at(L / 2 + wide / 2 + 0.1, (high + low) / 2 + 0.05, lz, { rz: -drop }),
    );
    parts.box(0.1, low - 0.3, depth - 0.3, BOARDS, at(L / 2 + 0.05, (low + 0.1) / 2 - 0.05, lz));
    stack(parts, random, at, {
      lx: L / 2 + wide / 2 - 0.1,
      lz,
      width: depth - 0.5,
      deep: wide - 0.7,
      rows: 7,
      across: false,
    });
    obstacles.push(block(frame, L / 2 + wide / 2, lz, wide / 2, depth / 2));
  }

  if (spec.woodpile) {
    // Split logs stacked against the back wall, their ends showing.
    stack(parts, random, at, { lx: L / 2 - 1, lz: -D / 2 - 0.4, width: 2.2, deep: 0.7, rows: 5, across: true });
    obstacles.push(block(frame, L / 2 - 1, -D / 2 - 0.35, 1.15, 0.45));
  }

  if (spec.bench) {
    // A plank bench against the front wall beside the door.
    const lx = door.along - 2;
    const lz = D / 2 + 0.38;
    parts.box(1.6, 0.07, 0.42, SEAT, at(lx, 0.55, lz));
    parts.box(1.6, 0.34, 0.05, SEAT, at(lx, 0.8, lz - 0.2, { rx: 0.06 }));
    for (const side of [-1, 1]) parts.box(0.09, 0.5, 0.4, POST, at(lx + side * 0.65, 0.28, lz));
    obstacles.push(block(frame, lx, lz - 0.02, 0.85, 0.28));
  }

  if (spec.fence) fence(parts, obstacles, frame, L / 2 + 6.6, -4.2, 4.2);

  if (spec.smoke) {
    return createSmoke(scene, at(chimney.lx, chimney.top + 0.3, 0), { count: 6, rate: 0.1, rise: 8, size: 0.5 });
  }
  return null;
}

/** A stack of split logs: rows of bark-coloured logs with their pale ends showing on the outer side. */
function stack(parts, random, at, { lx, lz, width, deep, rows, across }) {
  for (let row = 0; row < rows; row++) {
    const y = 0.1 + row * 0.19 + 0.09;
    const jitter = random() * 0.1;
    const colour = BARK[row % BARK.length];
    if (across) {
      parts.box(width - jitter, 0.17, deep, colour, at(lx, y, lz));
      parts.box(width - jitter - 0.04, 0.14, 0.05, TAN, at(lx, y, lz - deep / 2 - 0.02));
    } else {
      parts.box(deep, 0.17, width - jitter, colour, at(lx, y, lz));
      parts.box(0.05, 0.14, width - jitter - 0.04, TAN, at(lx + deep / 2 + 0.02, y, lz));
    }
  }
  for (const side of [-1, 1]) {
    if (across)
      parts.box(
        0.1,
        rows * 0.19 + 0.1,
        0.1,
        POST,
        at(lx + side * (width / 2 + 0.05), (rows * 0.19 + 0.1) / 2, lz - deep / 2),
      );
    else
      parts.box(
        0.1,
        rows * 0.19 + 0.1,
        0.1,
        POST,
        at(lx + deep / 2, (rows * 0.19 + 0.1) / 2, lz + side * (width / 2 + 0.05)),
      );
  }
}

/** A split-rail fence along z from `from` to `to`, at `lx` from the middle of a cottage, following the ground. */
function fence(parts, obstacles, frame, lx, from, to) {
  const count = Math.round((to - from) / 2.1);
  const posts = [];
  for (let i = 0; i <= count; i++) {
    const lz = from + ((to - from) * i) / count;
    const p = frame.local(lx, lz);
    const y = terrainHeight(p.x, p.z);
    posts.push({ ...p, y });
    parts.box(0.16, 1.1, 0.16, POST, { x: p.x, y: y + 0.45, z: p.z });
  }
  for (let i = 1; i < posts.length; i++) {
    for (const height of [0.45, 0.85]) {
      const [a, b] = [posts[i - 1], posts[i]];
      parts.beam({ x: a.x, y: a.y + height, z: a.z }, { x: b.x, y: b.y + height, z: b.z }, 0.1, SEAT);
    }
  }
  const [a, b] = [posts[0], posts[posts.length - 1]];
  obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 0.2 });
}

/** A rowing boat drawn up on the shore with its bow towards the water, lying along the slope. */
function boat(parts, obstacles, { x, z, rotation, hull, trim, level = null }) {
  const along = k => terrainHeight(x + Math.sin(rotation) * k, z + Math.cos(rotation) * k);
  const across = k => terrainHeight(x + Math.cos(rotation) * k, z - Math.sin(rotation) * k);
  const y = level ?? Math.min(along(0), across(0)) - 0.12;
  const pitch = level === null ? Math.atan2(along(-1.5) - along(1.5), 3) : 0;
  const roll = level === null ? Math.atan2(across(0.55) - across(-0.55), 1.1) : 0;
  const base = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, rotation, roll, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  const piece = (w, h, d, color, px, py, pz, ry = 0) =>
    parts.box(
      w,
      h,
      d,
      color,
      base
        .clone()
        .multiply(
          new THREE.Matrix4().compose(
            new THREE.Vector3(px, py, pz),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
            new THREE.Vector3(1, 1, 1),
          ),
        ),
    );
  piece(0.9, 0.08, 2.7, '#c9b78a', 0, 0.16, 0);
  for (const side of [-1, 1]) {
    piece(0.07, 0.44, 3, hull, side * 0.55, 0.38, 0);
    piece(0.12, 0.07, 3.04, trim, side * 0.55, 0.63, 0);
    piece(0.07, 0.44, 0.85, hull, side * 0.27, 0.38, 1.78, side * 0.62);
  }
  piece(1.1, 0.44, 0.07, hull, 0, 0.38, -1.5);
  for (const pz of [-0.6, 0.45]) piece(1.1, 0.06, 0.3, SEAT, 0, 0.5, pz);
  if (level === null) obstacles.push({ x, z, halfX: 0.75, halfZ: 1.7, rotation, radius: 0 });
}

/** The boathouse: an open-fronted shed on the shore with a rowing boat under its roof. */
function boathouse(parts, obstacles, site) {
  const frame = framer(site);
  const { at } = frame;
  const W = 5.2;
  const D = 6.4;
  const eave = 2.8;
  const ridge = 4.3;
  const wall = '#8d7b66';

  parts.box(W + 0.1, 0.55, D + 0.1, STONE_LOW, at(0, -0.12, 0));
  parts.box(W - 0.3, eave - 0.14, 0.18, wall, at(0, (eave + 0.14) / 2 - 0.02, -D / 2 + 0.09));
  for (const side of [-1, 1]) {
    parts.box(0.18, eave - 0.14, D, wall, at(side * (W / 2 - 0.09), (eave + 0.14) / 2 - 0.02, 0));
    for (let lz = -D / 2 + 0.9; lz < D / 2 - 0.5; lz += 1.5) {
      parts.box(0.05, eave - 0.2, 0.13, BATTEN, at(side * (W / 2), (eave + 0.14) / 2 - 0.02, lz));
    }
  }
  for (let lx = -W / 2 + 0.8; lx < W / 2 - 0.5; lx += 1.5) {
    parts.box(0.13, eave - 0.2, 0.05, BATTEN, at(lx, (eave + 0.14) / 2 - 0.02, -D / 2));
  }
  // A low plank wall across the front, with the boat showing over it, and a heavy post at each corner.
  parts.box(W - 0.3, 0.5, 0.16, wall, at(0, 0.35, D / 2 - 0.1));
  for (const side of [-1, 1])
    parts.box(0.28, eave - 0.1, 0.28, POST, at(side * (W / 2 - 0.11), (eave + 0.1) / 2, D / 2 - 0.1));
  parts.box(W + 0.1, 0.4, 0.2, POST, at(0, eave - 0.22, D / 2));

  const turn = { ry: frame.rotation };
  parts.add(gableEnds(W, D, eave - 0.03, ridge), BOARDS, at(0, 0, 0, turn));
  parts.add(gableRoof(W, D, eave, ridge, 0.5), '#5a5652', at(0, 0, 0, turn));
  shingles(parts, (c, y, extra = {}) => at(c, y, 0, { ry: frame.rotation + Math.PI / 2, ...extra }), {
    length: D,
    half: W / 2,
    rise: ridge - eave,
    ridge,
    overhang: 0.5,
    color: '#4c4946',
    ridgeColor: '#4c4946',
  });
  for (let u = -W / 2 + 0.6; u < W / 2 - 0.4; u += 0.8) {
    const h = (ridge - eave) * (1 - Math.abs(u) / (W / 2)) - 0.12;
    if (h > 0.2) {
      for (const end of [-1, 1]) parts.box(0.13, h, 0.05, BATTEN, at(u, eave + h / 2, end * (D / 2)));
    }
  }

  // The boat inside, on two bearers.
  for (const side of [-1, 1]) parts.box(0.12, 0.44, 3.4, POST, at(side * 0.4, 0.32, 0.3));
  const inside = frame.local(0, 0.2);
  boat(parts, obstacles, {
    x: inside.x,
    z: inside.z,
    rotation: frame.rotation,
    hull: '#6d9296',
    trim: '#d8d2bf',
    level: frame.y + 0.4,
  });
  obstacles.push(block(frame, 0, 0, W / 2 + 0.1, D / 2 + 0.1));
  return frame;
}

export function buildHamlet(scene, obstacles) {
  const random = createRandom(6119);
  const parts = new PartsBuilder();
  const smokes = [];
  LAKELAND.hamlet.houses.forEach((site, i) => {
    const smoke = cottage(scene, parts, obstacles, COTTAGES[i], site, random);
    if (smoke) smokes.push(smoke);
  });
  const shore = LAKELAND.hamlet.boathouse;
  const house = boathouse(parts, obstacles, shore);
  // Two more boats on the shingle: one drawn up beside the shed, one nearer the water.
  const beside = house.local(3.3, 1.2);
  boat(parts, obstacles, { ...beside, rotation: shore.rotation, hull: '#8c4a3b', trim: '#d8d2bf' });
  const down = house.local(-0.6, 11.4);
  boat(parts, obstacles, { ...down, rotation: shore.rotation + 0.12, hull: '#5f8790', trim: '#d8d2bf' });
  scene.add(parts.mesh());
  return { update: time => smokes.forEach(smoke => smoke.update(time)) };
}
