// The old mine: a timber-framed adit in a stone portal at the foot of a hill, boarded up a metre
// inside, with narrow-gauge rails coming out of it past two ore carts, a spoil heap, a small
// wooden headframe over a shaft, a tin-roofed shed and a lamp on a post. The ground rises behind
// the portal (see MINE.hill in layout.js), so the tunnel goes into the hillside.
import * as THREE from 'three';
import { createRandom } from '../../core/math.js';
import { MINE } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';
import { framer } from './frame.js';
import { gabledHouse } from './house.js';

const STONE = '#a29a86';
const STONE_DARK = '#8d8672';
const MOSS = '#7d8148';
const TIMBER = '#8a7050';
const TIMBER_DARK = '#4f3d2a';
const LINING = '#3a2d22';
const PLANK = '#8e7753';
const IRON = '#4a4743';
const RUST = '#8a4b30';
const TIN = '#a9b0ab';
const TIN_LIGHT = '#c4cac5';
const ORE = '#7d7a72';

/** Narrow gauge: the rails are this far apart. */
const GAUGE = 0.62;
/** The portal's wall stands this far in front of the hill, and the boards a metre inside the mouth. */
const MOUTH = -0.6;
const BOARDS = -1.6;

/**
 * The portal: a stone wall let into the hillside with a low opening in it, lined and framed with
 * timber, a dark passage behind, and rough boards nailed across it a metre in. Returns its obstacles.
 */
function portal(parts) {
  const frame = framer(MINE);
  const { at, local, rotation } = frame;
  const [depth, top, floor] = [3.6, 4.5, -1.2];
  const front = MOUTH;
  const centre = front - depth / 2;
  const [open, height] = [2.2, 2.9];
  // The wall either side of the opening, and over it.
  for (const side of [-1, 1]) {
    const x = side * (open / 2 + 1.15);
    parts.box(2.3, top - floor, depth, STONE, at(x, (top + floor) / 2, centre));
    // The wing walls run back into the hillside at an angle, lower than the portal.
    parts.box(
      1.2,
      3.4 - floor,
      3.2,
      STONE_DARK,
      at(side * 4.3, (3.4 + floor) / 2, front - 0.7, { ry: rotation - side * 0.55 }),
    );
  }
  parts.box(open + 4.6, top - (height + 0.35), depth, STONE, at(0, (top + height + 0.35) / 2, centre));
  // Rough boulders along the top and the foot of the wall, so it looks like part of the hill.
  const boulder = new THREE.IcosahedronGeometry(1, 0);
  const rock = createRandom(4559);
  for (let k = 0; k < 9; k++) {
    const x = -3.6 + k * 0.9 + (rock() - 0.5) * 0.4;
    const size = 0.45 + rock() * 0.35;
    parts.add(
      boulder,
      k % 2 ? STONE_DARK : STONE,
      at(x, top + 0.05 + size * 0.2, front - 0.7 - rock() * 2.2, {
        sx: size * 1.3,
        sy: size * 0.7,
        sz: size,
        ry: rock() * 3,
      }),
    );
  }
  // Grass and moss on the top of it.
  parts.box(open + 4.8, 0.14, depth + 0.1, MOSS, at(0, top + 0.07, centre));
  // The passage: timber lined, dark inside, with a black end.
  parts.box(0.08, height, depth - 0.2, LINING, at(-open / 2 + 0.04, height / 2, centre));
  parts.box(0.08, height, depth - 0.2, LINING, at(open / 2 - 0.04, height / 2, centre));
  parts.box(open - 0.16, 0.08, depth - 0.2, LINING, at(0, height - 0.04, centre));
  parts.box(open - 0.16, height - 0.08, 0.06, '#120f0d', at(0, (height - 0.08) / 2, front - depth + 0.25));
  // The frame in the mouth: two posts, a lintel and a cap board over it, a short brace each side.
  for (const side of [-1, 1]) {
    parts.box(0.34, height - 0.1, 0.34, TIMBER, at(side * (open / 2 - 0.1), (height - 0.1) / 2 - 0.0, front - 0.25));
    parts.beam(
      { ...local(side * (open / 2 - 0.3), front - 0.25), y: frame.at(0, 0, 0).y + height - 0.75 },
      { ...local(side * (open / 2 - 0.75), front - 0.25), y: frame.at(0, 0, 0).y + height - 0.12 },
      0.14,
      TIMBER,
    );
  }
  parts.box(open + 0.5, 0.34, 0.4, TIMBER, at(0, height + 0.05, front - 0.2));
  parts.box(open + 0.9, 0.1, 0.5, TIMBER_DARK, at(0, height + 0.27, front - 0.2));
  // Boards across the opening a metre inside it, nailed to the lining, no two the same.
  const random = createRandom(4561);
  for (let k = 0; k < 6; k++) {
    const y = 0.28 + k * 0.45;
    parts.box(open - 0.16, 0.26, 0.07, PLANK, at(0, y, BOARDS, { ry: rotation, rz: (random() - 0.5) * 0.05 }));
  }
  parts.beam(
    { ...local(-0.9, BOARDS - 0.07), y: frame.at(0, 0, 0).y + 0.3 },
    { ...local(0.9, BOARDS - 0.07), y: frame.at(0, 0, 0).y + 2.5 },
    0.12,
    TIMBER_DARK,
    0.1,
  );
  // The stone and the timber and the boards: nothing gets in.
  return [
    { ...local(0, (front + BOARDS) / 2 - 0.3), halfX: open / 2 + 0.6, halfZ: 1.3, rotation, radius: 0 },
    { ...local(0, centre), halfX: open / 2 + 2.3, halfZ: depth / 2, rotation, radius: 0 },
    ...[-1, 1].map(side => ({
      ...local(side * 4.7, front - 0.5),
      halfX: 1.1,
      halfZ: 1.3,
      rotation: rotation - side * 0.55,
      radius: 0,
    })),
  ];
}

/** A narrow-gauge ore cart on its rails at (0, 0, z): a tub of planks on an iron frame, loaded with ore or empty. */
export function oreCart(parts, at, { color = RUST, loaded = false } = {}) {
  parts.box(0.82, 0.12, 1.5, IRON, at(0, 0.34, 0));
  for (const x of [-GAUGE / 2, GAUGE / 2]) {
    for (const z of [-0.5, 0.5]) {
      parts.add(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10), IRON, at(x, 0.17, z, { rz: Math.PI / 2 }));
    }
  }
  // The tub, wider at the top than the bottom, with its rim.
  parts.box(0.9, 0.5, 1.4, color, at(0, 0.65, 0));
  parts.box(1.08, 0.22, 1.58, color, at(0, 1.0, 0));
  // The rim, with the load or the dark of the empty tub inside it.
  for (const side of [-1, 1]) {
    parts.box(0.06, 0.08, 1.64, IRON, at(side * 0.57, 1.14, 0));
    parts.box(1.14, 0.08, 0.06, IRON, at(0, 1.14, side * 0.82));
  }
  parts.box(1.04, 0.02, 1.5, loaded ? '#5f5c55' : '#2d2824', at(0, 1.115, 0));
  for (const z of [-0.4, 0.4]) parts.box(1.1, 0.5, 0.03, IRON, at(0, 0.7, z * 1.3));
  // A coupling hook at each end.
  for (const z of [-1, 1]) parts.box(0.06, 0.06, 0.24, IRON, at(0, 0.34, z * 0.87));
  if (loaded) {
    const heap = new THREE.IcosahedronGeometry(0.5, 0);
    parts.add(heap, ORE, at(0, 1.2, 0, { sx: 1.0, sy: 0.55, sz: 1.5 }));
    for (const [x, z, shade] of [
      [-0.2, -0.3, '#9c9684'],
      [0.25, 0.2, '#6c6a63'],
      [0, 0.45, '#b3a46a'],
    ]) {
      parts.add(new THREE.IcosahedronGeometry(0.17, 0), shade, at(x, 1.38, z, { ry: x * 9 }));
    }
  }
}

/** The rails out of the mouth, on sleepers, ending at a timber buffer. */
function rails(parts, obstacles) {
  const { local, rotation } = framer(MINE);
  const at = (lx, lz) => {
    const p = local(lx, lz);
    return { ...p, y: terrainHeight(p.x, p.z) };
  };
  const [from, to] = [BOARDS + 0.3, MINE.railLength];
  for (let z = from; z < to - 0.01; z += 1) {
    const next = Math.min(z + 1, to);
    for (const x of [-GAUGE / 2, GAUGE / 2]) {
      const [a, b] = [at(x, z), at(x, next)];
      parts.beam({ ...a, y: a.y + 0.13 }, { ...b, y: b.y + 0.13 }, 0.07, IRON, 0.07);
    }
  }
  for (let z = from + 0.2; z < to; z += 0.75) {
    const p = at(0, z);
    parts.box(1.0, 0.08, 0.16, TIMBER_DARK, { x: p.x, y: p.y + 0.04, z: p.z, ry: rotation });
  }
  // The buffer: a sleeper across the end on two stakes.
  const end = at(0, to + 0.2);
  parts.box(1.3, 0.3, 0.22, TIMBER, { x: end.x, y: end.y + 0.3, z: end.z, ry: rotation });
  for (const side of [-0.5, 0.5]) {
    const p = at(side, to + 0.2);
    parts.box(0.14, 0.5, 0.14, TIMBER_DARK, { x: p.x, y: p.y + 0.25, z: p.z, ry: rotation });
  }
  obstacles.push({ ...local(0, to + 0.2), halfX: 0.7, halfZ: 0.15, rotation, radius: 0 });
  MINE.carts.forEach((z, i) => {
    const frame = framer({ ...local(0, z), rotation }, undefined);
    oreCart(parts, frame.at, { color: i ? '#6a645b' : RUST, loaded: i === 0 });
    obstacles.push({ ...local(0, z), halfX: 0.62, halfZ: 0.85, rotation, radius: 0 });
  });
}

/** The spoil heap: rubble tipped out of the carts, rough grey stone in a low cone. */
function spoilHeap(parts, obstacles) {
  const random = createRandom(4567);
  const { x, z, radius } = MINE.spoil;
  const rubble = new THREE.IcosahedronGeometry(1, 0);
  const shades = ['#8c877b', '#7b7569', '#9a9283', '#6f6a60', '#a39a86'];
  const ground = terrainHeight(x, z);
  // Three mounds, each smaller than the last and sunk into the one below it, with the foot
  // sunk well into the ground, which slopes under it.
  for (const [across, up, high, shade] of [
    [1, -0.3, 1.7, 1],
    [0.66, 0.5, 1.5, 3],
    [0.38, 1.2, 1.3, 0],
  ]) {
    parts.add(rubble, shades[shade], {
      x,
      y: ground + up,
      z,
      sx: radius * across,
      sy: high,
      sz: radius * across * 0.9,
      ry: 0.4 + up,
    });
  }
  // Lumps of rock half buried in the sides of it.
  for (let k = 0; k < 14; k++) {
    const a = random() * Math.PI * 2;
    const r = (0.25 + random() * 0.55) * radius;
    const [px, pz] = [x + Math.cos(a) * r, z + Math.sin(a) * r];
    const size = 0.5 + random() * 0.7;
    // On the surface of the mounds at that distance.
    const surface = Math.max(0.2, 2.3 * Math.sqrt(Math.max(0, 1 - (r / (radius * 0.95)) ** 2)) - 0.8);
    parts.add(rubble, shades[Math.floor(random() * shades.length)], {
      x: px,
      y: ground + surface - size * 0.1,
      z: pz,
      sx: size * 1.2,
      sy: size * 0.65,
      sz: size,
      ry: random() * 3,
      rx: random() * 0.4,
    });
  }
  obstacles.push({ x, z, radius: radius - 0.8 });
}

/** The headframe over the shaft: a four-legged tower with a sheave wheel at its top and a rope down to a boarded collar. */
function headframe(parts, obstacles) {
  const frame = framer(MINE.headframe);
  const { at, local, rotation } = frame;
  const y0 = frame.at(0, 0, 0).y;
  const tower = 6.4;
  const foot = [1.3, 1.1];
  const head = [0.55, 0.45];
  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const [bottom, topPoint] = [local(sx * foot[0], sz * foot[1]), local(sx * head[0], sz * head[1])];
      legs.push([bottom, topPoint]);
      parts.beam({ ...bottom, y: y0 - 0.3 }, { ...topPoint, y: y0 + tower }, 0.26, TIMBER);
    }
  }
  // Braces across the legs at two heights, and a diagonal on each side.
  for (const t of [0.3, 0.62]) {
    const ring = legs.map(([b, p]) => ({
      x: b.x + (p.x - b.x) * t,
      z: b.z + (p.z - b.z) * t,
      y: y0 - 0.3 + (tower + 0.3) * t,
    }));
    for (let k = 0; k < 4; k++) parts.beam(ring[k], ring[[1, 3, 0, 2][k]], 0.12, TIMBER_DARK);
  }
  const pick = (leg, t) => {
    const [b, p] = legs[leg];
    return { x: b.x + (p.x - b.x) * t, z: b.z + (p.z - b.z) * t, y: y0 - 0.3 + (tower + 0.3) * t };
  };
  parts.beam(pick(0, 0.3), pick(2, 0.62), 0.1, TIMBER_DARK);
  parts.beam(pick(1, 0.3), pick(3, 0.62), 0.1, TIMBER_DARK);
  // The platform on top, two posts and the wheel between them, with spokes.
  parts.box(1.5, 0.18, 1.3, TIMBER_DARK, at(0, tower + 0.1, 0));
  for (const x of [-0.4, 0.4]) parts.box(0.12, 1.5, 0.12, TIMBER, at(x, tower + 0.85, 0));
  const wheelY = tower + 1.05;
  parts.add(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 12), IRON, at(0, wheelY, 0, { rz: Math.PI / 2 }));
  parts.add(new THREE.CylinderGeometry(0.4, 0.4, 0.16, 12), TIMBER_DARK, at(0, wheelY, 0, { rz: Math.PI / 2 }));
  for (const turn of [0, Math.PI / 2]) parts.box(0.05, 1.18, 0.06, IRON, at(0, wheelY, 0, { rx: turn + 0.4 }));
  parts.box(0.9, 0.08, 0.08, IRON, at(0, wheelY, 0));
  // The rope from the wheel down to the collar, and a hook on its end.
  parts.box(0.04, tower + 0.5, 0.04, IRON, at(0.04, (tower + 0.4) / 2 + 0.55, 0.0));
  // The collar: a crib of logs round the shaft, with boards over it.
  for (const side of [-1, 1]) {
    parts.box(0.22, 0.5, 1.3, TIMBER_DARK, at(side * 0.55, 0.25, 0));
    parts.box(1.3, 0.5, 0.22, TIMBER_DARK, at(0, 0.25, side * 0.55));
  }
  for (const k of [-0.36, -0.12, 0.12, 0.36]) parts.box(0.22, 0.08, 1.3, PLANK, at(k, 0.54, 0));
  obstacles.push({ ...local(0, 0), halfX: 1.55, halfZ: 1.4, rotation, radius: 0 });
}

/** The shed: plank walls under a tin roof, its ribs catching the light, a door and a small window, and a pipe through the roof. */
function shed(parts, obstacles) {
  const frame = framer(MINE.shed);
  const { at } = frame;
  const [width, depth, eave, ridge] = [3.0, 4.2, 2.2, 3.0];
  obstacles.push(
    gabledHouse(parts, frame, {
      width,
      depth,
      eave,
      ridge,
      overhang: 0.35,
      walls: '#76624a',
      roof: TIN,
    }),
  );
  // The corrugations, down each slope, and a lighter board along the ridge.
  const half = width / 2;
  const slope = Math.atan2(ridge - eave, half);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const x = side * (0.22 + k * 0.32);
      const y = ridge + 0.15 - ((ridge - eave) / half) * Math.abs(x) + 0.04;
      parts.box(0.07, 0.05, depth + 0.6, TIN_LIGHT, at(x, y, 0, { rz: -side * slope }));
    }
  }
  // The door and window on the front, which faces the rails, and boards nailed across the wall.
  parts.box(0.95, 1.8, 0.06, TIMBER_DARK, at(-0.6, 0.9, depth / 2 + 0.03));
  parts.box(0.5, 0.45, 0.05, '#2b2f31', at(0.85, 1.35, depth / 2 + 0.03));
  for (const x of [-1.2, 0, 1.2]) parts.box(0.06, eave - 0.1, 0.03, TIMBER_DARK, at(x, eave / 2, -depth / 2 - 0.02));
  const pipe = ridge + 0.15 - ((ridge - eave) / half) * 0.5;
  parts.add(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), IRON, at(0.5, pipe + 0.35, -0.9));
  parts.add(new THREE.CylinderGeometry(0.14, 0.1, 0.1, 8), IRON, at(0.5, pipe + 0.85, -0.9));
}

/** A lamp on a post by the rails, with a bracket arm and a lantern hanging from it. */
function lamp(parts, obstacles) {
  const { x, z } = MINE.lamp;
  const y = terrainHeight(x, z);
  parts.box(0.14, 2.7, 0.14, TIMBER, { x, y: y + 1.25, z, ry: MINE.rotation });
  const frame = framer({ x, z, rotation: MINE.rotation }, y);
  // The arm reaches out over the rails, to local -X.
  parts.box(0.8, 0.1, 0.1, TIMBER, frame.at(-0.35, 2.55, 0));
  parts.beam({ ...frame.local(0, 0), y: y + 2.0 }, { ...frame.local(-0.6, 0), y: y + 2.5 }, 0.07, TIMBER_DARK);
  parts.box(0.26, 0.34, 0.26, '#f1d98e', frame.at(-0.65, 2.3, 0));
  parts.box(0.34, 0.07, 0.34, IRON, frame.at(-0.65, 2.52, 0));
  parts.box(0.3, 0.05, 0.3, IRON, frame.at(-0.65, 2.1, 0));
  obstacles.push({ x, z, radius: 0.3 });
}

/** A few barrels and crates by the shed, and a pick leaning on its wall. */
function oddments(parts, obstacles) {
  const { local, rotation } = framer(MINE.shed);
  const at = (lx, lz) => {
    const p = local(lx, lz);
    return { ...p, y: terrainHeight(p.x, p.z) };
  };
  for (const [lx, lz] of [
    [-0.7, 3.0],
    [0.15, 3.15],
  ]) {
    const p = at(lx, lz);
    parts.add(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 10), '#6b5638', { x: p.x, y: p.y + 0.45, z: p.z });
    for (const y of [0.2, 0.7]) {
      parts.add(new THREE.CylinderGeometry(0.355, 0.355, 0.06, 10), IRON, { x: p.x, y: p.y + y, z: p.z });
    }
    obstacles.push({ x: p.x, z: p.z, radius: 0.4 });
  }
  const crate = at(-2.0, 1.4);
  parts.box(0.8, 0.6, 0.8, PLANK, { x: crate.x, y: crate.y + 0.3, z: crate.z, ry: rotation + 0.3 });
  obstacles.push({ x: crate.x, z: crate.z, radius: 0.6 });
  // The pick: a handle leaning against the shed's front wall, its iron head across the top.
  const [foot, top] = [at(1.3, 2.7), at(1.3, 2.09)];
  parts.beam({ ...foot, y: foot.y - 0.02 }, { ...top, y: top.y + 1.5 }, 0.05, TIMBER);
  parts.box(0.55, 0.07, 0.07, IRON, { x: top.x, y: top.y + 1.55, z: top.z, ry: rotation });
}

/** An ore cart on its own at the origin, for the viewer. */
export function oreCartModel(loaded) {
  const parts = new PartsBuilder();
  oreCart(parts, (x, y, z, extra) => ({ x, y, z, ...extra }), { loaded });
  return parts.mesh();
}

export function buildMine(scene, obstacles) {
  const parts = new PartsBuilder();
  obstacles.push(...portal(parts));
  rails(parts, obstacles);
  spoilHeap(parts, obstacles);
  headframe(parts, obstacles);
  shed(parts, obstacles);
  lamp(parts, obstacles);
  oddments(parts, obstacles);
  scene.add(parts.mesh());
}
