// The logging camp: a glade at the edge of the woods with stacks of felled logs, an old skidder
// parked beside a small log cabin with a stove pipe, a sawmill shed with a round saw blade and a
// neat stack of planks, an axe in a chopping block, and stumps all round the edge of the glade.
import * as THREE from 'three';
import { createRandom } from '../../core/math.js';
import { LOGGING } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';
import { framer } from './frame.js';
import { gabledHouse } from './house.js';

const BARKS = ['#6e4f35', '#7b5a3c', '#5f4630', '#84613f'];
/** The wood showing at the cut end of a log or stump, a little different from log to log. */
const ENDS = ['#d3ab6c', '#c99d5c', '#dbb77d'];
const PLANKS = ['#d1ae74', '#c6a064', '#d8b77f'];
const STICKER = '#8a6a43';
const IRON = '#46443f';
const STEEL = '#c9cdc8';
const WEATHERED = '#76624a';
const TIN = '#a9b0ab';
const SKIDDER = '#c0873a';
const SKIDDER_DARK = '#8a5c28';
const TYRE = '#2b2a28';

const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();
const cut = new Map();

/**
 * A round timber `length` long, with its axis up Y, the bark round it and the pale wood at its
 * two ends: a log, or with its length short, a stump.
 */
function timber(length, radius, sides = 7) {
  const key = `${length}|${radius}|${sides}`;
  if (cut.has(key)) return cut.get(key);
  const geometry = new THREE.CylinderGeometry(radius, radius, length, sides).toNonIndexed();
  geometry.deleteAttribute('uv');
  cut.set(key, geometry);
  return geometry;
}

/**
 * Adds a timber from `timber()` to `parts` at (x, y, z) turned as `parts.add` would: its bark
 * painted `bark`, its ends `end`.
 */
function addTimber(parts, geometry, bark, end, transform) {
  const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = transform;
  const part = geometry.clone();
  quaternion.setFromEuler(euler.set(rx, ry, rz, 'YXZ'));
  part.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(sx, sy, sz)));
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(normals.count * 3);
  const [barkColor, endColor] = [new THREE.Color(bark), new THREE.Color(end)];
  for (let i = 0; i < normals.count; i++) {
    const color = Math.abs(normals.getY(i)) > 0.9 ? endColor : barkColor;
    colors.set([color.r, color.g, color.b], i * 3);
  }
  part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.parts.push(part);
}

/** A stump: a short timber with its roots spreading at the foot, standing at (x, z). */
function stump(parts, { x, z, scale, rotation }, random) {
  const y = terrainHeight(x, z);
  const [radius, height] = [0.3 * scale, 0.35 + random() * 0.25];
  const bark = BARKS[Math.floor(random() * BARKS.length)];
  const end = ENDS[Math.floor(random() * ENDS.length)];
  addTimber(parts, timber(height, radius), bark, end, { x, y: y + height / 2 - 0.05, z, ry: rotation });
  addTimber(parts, timber(0.22, radius * 1.35), bark, bark, { x, y: y + 0.05, z, ry: rotation + 0.3 });
}

/** Stacks of felled logs, thick end out, each row of the pyramid resting in the dips of the row below. */
function logStacks(parts, obstacles) {
  const random = createRandom(4601);
  const radius = 0.28;
  for (const stack of LOGGING.stacks) {
    const { at, local, rotation } = framer(stack);
    const pitch = radius * 2 * 0.94;
    for (let row = 0; row < stack.logs; row++) {
      const count = stack.logs - row;
      for (let k = 0; k < count; k++) {
        const length = 3.9 + random() * 0.9;
        addTimber(
          parts,
          timber(length, radius * (0.9 + random() * 0.2)),
          BARKS[Math.floor(random() * BARKS.length)],
          ENDS[Math.floor(random() * ENDS.length)],
          at((random() - 0.5) * 0.3, radius * 0.6 + row * pitch * 0.87, (k - (count - 1) / 2) * pitch, {
            rz: Math.PI / 2,
          }),
        );
      }
    }
    // A stake at each end of the bottom row holds the pile.
    for (const end of [-2.15, 2.15]) {
      for (const side of [-1, 1]) {
        parts.box(0.1, stack.logs * pitch * 0.87 + 0.25, 0.1, '#5a432e', at(end, 0.6, side * (stack.logs / 2) * pitch));
      }
    }
    obstacles.push({ ...local(0, 0), halfX: 2.6, halfZ: (stack.logs * pitch) / 2 + 0.3, rotation, radius: 0 });
  }
}

/** A few logs lying where they were dropped, between the sawmill and the road. */
function looseLogs(parts, obstacles) {
  const random = createRandom(4603);
  const { at, local, rotation } = framer({ ...LOGGING.planks, rotation: LOGGING.rotation + 0.3 });
  for (const [lx, lz] of [
    [-5, 6],
    [-4.2, 7.1],
  ]) {
    const length = 3.4 + random();
    addTimber(
      parts,
      timber(length, 0.27),
      BARKS[1],
      ENDS[0],
      at(lx, 0.27, lz, { rz: Math.PI / 2, ry: rotation + lz * 0.1 }),
    );
  }
  obstacles.push({ ...local(-4.6, 6.5), halfX: 1.9, halfZ: 1.0, rotation, radius: 0 });
}

/** The cabin: a log wall, a shingled roof, a plank door and a window, and a stove pipe through the roof. */
function cabin(parts, obstacles) {
  const frame = framer(LOGGING.cabin);
  const { at } = frame;
  const [width, depth, eave, ridge] = [4.6, 3.8, 2.3, 3.5];
  obstacles.push(
    gabledHouse(parts, frame, {
      width: width - 0.3,
      depth: depth - 0.3,
      eave,
      ridge,
      overhang: 0.55,
      walls: '#5f4630',
      roof: '#675344',
    }),
  );
  // Horizontal logs all round, the corners crossing and sticking out as they do on a log cabin.
  const random = createRandom(4607);
  const rows = Math.floor(eave / 0.32);
  for (let row = 0; row < rows; row++) {
    const y = 0.17 + row * 0.32;
    for (const side of [-1, 1]) {
      const bark = BARKS[Math.floor(random() * BARKS.length)];
      addTimber(
        parts,
        timber(width + 0.4, 0.17, 6),
        bark,
        ENDS[1],
        at(0, y, side * (depth / 2 - 0.2), { rz: Math.PI / 2 }),
      );
      addTimber(
        parts,
        timber(depth + 0.4, 0.17, 6),
        bark,
        ENDS[1],
        at(side * (width / 2 - 0.2), y + 0.16, 0, { rx: Math.PI / 2 }),
      );
    }
  }
  // Door and window in the front wall, which is the gable end.
  parts.box(0.95, 1.8, 0.07, '#3f2f22', at(-0.8, 0.9, depth / 2 + 0.05));
  parts.box(0.5, 0.5, 0.05, '#2b2f31', at(0.9, 1.35, depth / 2 + 0.05));
  parts.box(0.62, 0.06, 0.07, '#3f2f22', at(0.9, 1.63, depth / 2 + 0.06));
  parts.box(0.62, 0.06, 0.07, '#3f2f22', at(0.9, 1.07, depth / 2 + 0.06));
  // A step of split log in front of the door.
  addTimber(parts, timber(1.1, 0.2), BARKS[0], ENDS[0], at(-0.8, 0.12, depth / 2 + 0.55, { rz: Math.PI / 2 }));
  // The stove pipe, with a cap, through the back slope of the roof.
  const half = width / 2;
  const pipeX = -1.2;
  const roofAt = ridge + 0.15 - ((ridge - eave) / half) * Math.abs(pipeX);
  parts.add(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 8), IRON, at(pipeX, roofAt + 0.55, -0.7));
  parts.add(new THREE.CylinderGeometry(0.17, 0.1, 0.14, 8), IRON, at(pipeX, roofAt + 1.33, -0.7));
  // Firewood stacked against the side wall.
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 6 - row; k++) {
      addTimber(
        parts,
        timber(0.55, 0.11, 6),
        BARKS[(k + row) % BARKS.length],
        ENDS[k % ENDS.length],
        at(-width / 2 - 0.5 - 0.02 * k, 0.11 + row * 0.2, -1.2 + k * 0.23 + row * 0.12, { rz: Math.PI / 2 }),
      );
    }
  }
}

/** The sawmill: a shed open at the front on four posts under a sloping tin roof, with a saw bench and its round blade. */
function sawmill(parts, obstacles) {
  const frame = framer(LOGGING.sawmill);
  const { at, local, rotation } = frame;
  const [width, depth] = [6.6, 3.8];
  for (const [x, z, h] of [
    [-width / 2, -depth / 2, 3.04],
    [width / 2, -depth / 2, 3.04],
    [-width / 2, depth / 2, 2.54],
    [width / 2, depth / 2, 2.54],
  ]) {
    parts.box(0.24, h, 0.24, '#6a5239', at(x, h / 2, z));
  }
  // The roof slopes down to the open front, its ribs running down the slope.
  const tilt = Math.atan2(0.5, depth);
  parts.box(width + 0.7, 0.07, depth + 0.7, TIN, at(0, 2.82, 0, { rx: tilt }));
  for (let k = -9; k <= 9; k++) parts.box(0.06, 0.05, depth + 0.7, '#c4cac5', at(k * 0.36, 2.88, 0, { rx: tilt }));
  // The back wall, boards.
  parts.box(width, 2.5, 0.06, WEATHERED, at(0, 1.3, -depth / 2 + 0.05));
  // The bench the logs run along, on trestles, with the slot the blade runs in.
  for (const x of [-2.4, 1.3]) {
    for (const z of [-0.35, 0.35]) parts.box(0.14, 0.7, 0.14, '#5c4630', at(x, 0.35, z));
  }
  parts.box(5.2, 0.12, 0.45, '#8c7451', at(-0.7, 0.74, -0.38));
  parts.box(5.2, 0.12, 0.45, '#8c7451', at(-0.7, 0.74, 0.38));
  // The blade: a steel disc standing in the slot with a ring of teeth, on a housing over the bench.
  const blade = at(0.6, 1.45, 0);
  parts.add(new THREE.CylinderGeometry(0.95, 0.95, 0.035, 20), STEEL, { ...blade, rx: Math.PI / 2 });
  parts.add(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8), '#6f726e', { ...blade, rx: Math.PI / 2 });
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    parts.box(0.12, 0.1, 0.04, STEEL, {
      ...at(0.6 + Math.sin(a) * 0.98, 1.45 + Math.cos(a) * 0.98, 0),
      rz: -a + 0.5,
    });
  }
  parts.box(0.3, 0.3, 0.9, IRON, at(0.6, 2.2, 0));
  parts.box(0.12, 0.95, 0.12, IRON, at(0.6, 1.76, -0.4));
  parts.box(0.12, 0.95, 0.12, IRON, at(0.6, 1.76, 0.4));
  // The engine that drives it, under the bench at the back.
  parts.box(0.8, 0.55, 0.6, '#8a4b30', at(-1.8, 0.28, -1.3));
  parts.box(0.12, 0.5, 0.12, IRON, at(-1.5, 0.8, -1.3));
  // A log on the bench, half sawn, and sawdust drifted below the blade.
  addTimber(parts, timber(3.6, 0.27), BARKS[0], ENDS[2], at(-1.3, 1.04, 0, { rz: Math.PI / 2 }));
  const dust = new THREE.IcosahedronGeometry(1, 0);
  for (const [x, z, size] of [
    [0.6, 0.9, 0.8],
    [1.4, 0.4, 0.55],
    [-0.5, 1.3, 0.5],
  ]) {
    const p = local(x, z);
    parts.add(dust, '#dcc78f', {
      x: p.x,
      y: terrainHeight(p.x, p.z) + 0.02,
      z: p.z,
      sx: size,
      sy: 0.2,
      sz: size * 0.8,
    });
  }
  obstacles.push({ ...local(0, 0), halfX: width / 2 + 0.5, halfZ: depth / 2 + 0.4, rotation, radius: 0 });
}

/** A stack of sawn planks laid in layers, with strips of wood between the layers to let the air through. */
function plankStack(parts, obstacles) {
  const frame = framer(LOGGING.planks);
  const { at, local, rotation } = frame;
  const [length, width] = [3.4, 1.0];
  const layers = 12;
  for (let k = 0; k < layers; k++) {
    const y = 0.1 + k * 0.13;
    parts.box(length - (k % 3) * 0.06, 0.08, width, PLANKS[k % PLANKS.length], at(0, y, 0));
    for (const x of [-1.5, -0.5, 0.5, 1.5]) parts.box(0.07, 0.05, width + 0.02, STICKER, at(x, y + 0.065, 0));
  }
  parts.box(length + 0.1, 0.12, width + 0.1, '#5a432e', at(0, -0.02, 0));
  parts.box(length - 0.2, 0.05, width + 0.2, '#6a5239', at(0.1, 0.1 + layers * 0.13, 0.05, { ry: rotation + 0.03 }));
  obstacles.push({ ...local(0, 0), halfX: length / 2 + 0.2, halfZ: width / 2 + 0.2, rotation, radius: 0 });
}

/** The skidder: an old articulated machine on four big tyres, its dozer blade raised, its grapple crane folded over the back. */
export function skidder(parts, at) {
  // The frame, the engine under its hood at the front and the cab behind it.
  parts.box(1.5, 0.5, 3.4, SKIDDER_DARK, at(0, 0.95, 0));
  parts.box(1.4, 0.85, 1.3, SKIDDER, at(0, 1.5, 1.2));
  parts.box(1.0, 0.1, 0.9, '#6e6b66', at(0, 1.96, 1.5));
  parts.box(1.46, 1.35, 1.35, SKIDDER, at(0, 1.85, -0.3));
  parts.box(1.58, 0.1, 1.45, SKIDDER_DARK, at(0, 2.57, -0.3));
  for (const side of [-1, 1]) {
    parts.box(0.03, 0.75, 1.0, '#3d4a50', at(side * 0.775, 2.0, -0.3));
  }
  parts.box(1.36, 0.62, 0.03, '#3d4a50', at(0, 2.0, 0.39 + 0.01));
  parts.add(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), IRON, at(0.5, 2.5, 1.0));
  // Four wheels, the big ones at the back.
  for (const [x, z, r] of [
    [-1.05, 1.3, 0.62],
    [1.05, 1.3, 0.62],
    [-1.05, -1.15, 0.7],
    [1.05, -1.15, 0.7],
  ]) {
    parts.add(new THREE.CylinderGeometry(r, r, 0.55, 12), TYRE, at(x, r, z, { rz: Math.PI / 2 }));
    parts.add(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.58, 8), '#8d8a7d', at(x, r, z, { rz: Math.PI / 2 }));
  }
  // The blade across the front on two arms.
  parts.box(2.5, 0.7, 0.14, SKIDDER_DARK, at(0, 0.8, 2.45));
  for (const side of [-1, 1]) parts.box(0.12, 0.12, 1.1, IRON, at(side * 0.9, 0.9, 1.9));
  // The crane: a column behind the cab, a boom folded back over it and a grapple hanging from the end.
  parts.box(0.45, 0.9, 0.45, IRON, at(0, 1.6, -1.55));
  parts.beam(at(0, 2.1, -1.55), at(0, 2.9, -0.35), 0.2, SKIDDER);
  parts.beam(at(0, 2.9, -0.35), at(0, 3.1, 0.9), 0.17, SKIDDER);
  parts.box(0.05, 1.3, 0.05, IRON, at(0, 2.45, 0.9));
  for (const side of [-1, 1]) {
    parts.beam(at(side * 0.05, 1.8, 0.9), at(side * 0.42, 1.05, 0.9), 0.07, IRON);
  }
}

/** The skidder on its own at the origin, for the viewer. */
export function skidderModel() {
  const parts = new PartsBuilder();
  skidder(parts, (x, y, z, extra) => ({ x, y, z, ...extra }));
  return parts.mesh();
}

function skidderLandmark(parts, obstacles) {
  const frame = framer(LOGGING.skidder);
  skidder(parts, frame.at);
  obstacles.push({ ...frame.local(0, 0), halfX: 1.5, halfZ: 2.3, rotation: frame.rotation, radius: 0 });
}

/** The chopping block with an axe stuck in it, and chips of wood round its foot. */
function choppingBlock(parts, obstacles) {
  const { x, z, rotation } = LOGGING.block;
  const y = terrainHeight(x, z);
  addTimber(parts, timber(0.55, 0.37, 8), BARKS[0], ENDS[2], { x, y: y + 0.27, z });
  // The axe: its head sunk into the top at the edge, the handle leaning out and up.
  const frame = framer({ x, z, rotation }, y);
  parts.box(0.06, 0.22, 0.14, STEEL, frame.at(0.2, 0.68, 0.0));
  parts.beam({ ...frame.local(0.2, 0), y: y + 0.6 }, { ...frame.local(0.95, 0.05), y: y + 1.35 }, 0.045, '#8c6a43');
  const random = createRandom(4619);
  for (let k = 0; k < 14; k++) {
    const a = random() * Math.PI * 2;
    const r = 0.55 + random() * 0.9;
    const [cx, cz] = [x + Math.cos(a) * r, z + Math.sin(a) * r];
    parts.box(0.14 + random() * 0.1, 0.03, 0.06, ENDS[k % 3], {
      x: cx,
      y: terrainHeight(cx, cz) + 0.02,
      z: cz,
      ry: random() * 3,
    });
  }
  obstacles.push({ x, z, radius: 0.55 });
}

export function buildLogging(scene, obstacles) {
  const parts = new PartsBuilder();
  const random = createRandom(4623);
  for (const spot of LOGGING.stumps) {
    stump(parts, spot, random);
    obstacles.push({ x: spot.x, z: spot.z, radius: 0.4 * spot.scale });
  }
  logStacks(parts, obstacles);
  looseLogs(parts, obstacles);
  cabin(parts, obstacles);
  sawmill(parts, obstacles);
  plankStack(parts, obstacles);
  skidderLandmark(parts, obstacles);
  choppingBlock(parts, obstacles);
  scene.add(parts.mesh());
}
