// The orchard: rows of apple and pear trees with wide grassy lanes between them, windfalls in
// the grass under them, stacks of crates at the ends of the rows, a ladder against one tree,
// a row of painted beehives along the side and a fruit stall by the track at the foot, with
// crates of apples on its counter and a heap of pumpkins beside it.
import * as THREE from 'three';
import { createRandom } from '../../core/math.js';
import { ORCHARD } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';
import { foliageMaterial } from '../detail.js';
import { FRUIT, fruitTreeGeometry } from '../scenery.js';
import { framer } from './frame.js';

const WOOD = '#9a7550';
const DARK_WOOD = '#6f5238';
const CRATE = '#b48a55';
const ROOF = '#8f4a35';
const PUMPKIN = '#d9792b';
/** The hives are painted in bright colours, as they often are, each its own. */
const HIVES = ['#4f86b8', '#e0b13d', '#6b9a54', '#c0563f'];

/** Leaves on the trees: the apples' still mostly green, the pears' gone yellow and orange. */
function leafColor(fruit, random) {
  return fruit === 'pear'
    ? new THREE.Color().setHSL(0.1 + random() * 0.03, 0.62, 0.44 + random() * 0.06)
    : new THREE.Color().setHSL(0.17 + random() * 0.05, 0.38 + random() * 0.08, 0.35 + random() * 0.06);
}

function buildTrees(scene, obstacles) {
  const dummy = new THREE.Object3D();
  const random = createRandom(4447);
  for (const fruit of ['apple', 'pear']) {
    const trees = ORCHARD.trees.filter(tree => tree.fruit === fruit);
    const mesh = new THREE.InstancedMesh(fruitTreeGeometry(fruit), foliageMaterial('crowns'), trees.length);
    trees.forEach((tree, i) => {
      dummy.position.set(tree.x, terrainHeight(tree.x, tree.z) - 0.1, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, leafColor(fruit, random));
      obstacles.push({ x: tree.x, z: tree.z, radius: 0.24 * tree.scale });
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

/** Fruit that has fallen into the grass under each tree, a few apples or pears to a tree. */
function windfalls(parts) {
  const random = createRandom(4451);
  const apple = new THREE.IcosahedronGeometry(0.09, 0);
  for (const tree of ORCHARD.trees) {
    const count = 3 + Math.floor(random() * 5);
    for (let k = 0; k < count; k++) {
      const a = random() * Math.PI * 2;
      const r = 0.6 + random() * 1.8 * tree.scale;
      const [x, z] = [tree.x + Math.cos(a) * r, tree.z + Math.sin(a) * r];
      // Some have lain there a while and gone brown.
      const color = random() < 0.25 ? '#8a5a32' : FRUIT[tree.fruit];
      parts.add(apple, color, { x, y: terrainHeight(x, z) + 0.05, z, ry: a, sy: tree.fruit === 'pear' ? 1.3 : 0.9 });
    }
  }
}

/**
 * A wooden crate at (lx, lz) in a frame, its foot `y` up, turned by `turn`, and `full` of fruit
 * of the colour given or empty.
 */
function crate(parts, { at, rotation }, lx, y, lz, { full = null, turn = 0 } = {}) {
  const [w, h, d] = [0.62, 0.34, 0.44];
  const ry = rotation + turn;
  parts.box(w, h, d, CRATE, at(lx, y + h / 2, lz, { ry }));
  // The gap between the slats, all the way round.
  parts.box(w + 0.02, 0.03, d + 0.02, DARK_WOOD, at(lx, y + h * 0.55, lz, { ry }));
  if (full) parts.box(w - 0.08, 0.04, d - 0.08, full, at(lx, y + h - 0.01, lz, { ry }));
}

/** The fruit stall: a counter under a little roof on four posts, with crates of fruit on it. */
function buildStall(parts, obstacles) {
  const frame = framer(ORCHARD.stall);
  const { at } = frame;
  const [width, depth] = [3.2, 1.1];
  parts.box(width, 0.9, depth, WOOD, at(0, 0.4, 0));
  parts.box(width + 0.12, 0.06, depth + 0.12, DARK_WOOD, at(0, 0.88, 0)); // the top of the counter
  for (const [lx, lz] of [
    [-1.63, -0.53],
    [1.63, -0.53],
    [-1.63, 0.53],
    [1.63, 0.53],
  ]) {
    parts.box(0.1, lz < 0 ? 2.7 : 2.35, 0.1, DARK_WOOD, at(lx, lz < 0 ? 1.3 : 1.12, lz));
  }
  // The roof slopes down to the front, over the counter.
  parts.box(width + 0.6, 0.08, depth + 0.9, ROOF, at(0, 2.5, 0.1, { rx: 0.32 }));
  // A board on the roof's front edge, tipped with it, with an apple and a pear painted large on
  // it, so it can be seen what is sold here. `onBoard(u, v, w)` is across it, up it and out of it.
  const tip = 0.32;
  const onBoard = (u, v, w, extra = {}) =>
    at(u, 2.62 + v * Math.cos(tip) - w * Math.sin(tip), 0.78 + v * Math.sin(tip) + w * Math.cos(tip), {
      rx: tip,
      ...extra,
    });
  parts.box(1.28, 0.58, 0.04, DARK_WOOD, onBoard(0, 0, -0.03));
  parts.box(1.2, 0.5, 0.06, '#d8bd8a', onBoard(0, 0, 0));
  for (const [u, fruit, shape, lean] of [
    [-0.27, 'apple', { sz: 0.45 }, -1],
    [0.27, 'pear', { sy: 1.35, sz: 0.45 }, 1],
  ]) {
    const radius = fruit === 'apple' ? 0.15 : 0.12;
    parts.add(new THREE.IcosahedronGeometry(radius, 1), FRUIT[fruit], onBoard(u, -0.03, 0.05, shape));
    parts.box(0.03, 0.09, 0.03, '#6b4a2e', onBoard(u, 0.16, 0.05));
    parts.box(0.11, 0.05, 0.02, '#5d8a3e', onBoard(u - lean * 0.06, 0.17, 0.05, { rz: lean * 0.5 }));
  }
  // Crates of apples and pears on the counter, and more on the ground beside it.
  [
    [-1.0, FRUIT.apple],
    [0, FRUIT.pear],
    [1.0, '#8fae46'],
  ].forEach(([lx, full]) => crate(parts, frame, lx, 0.91, 0.05, { full, turn: 0.05 * lx }));
  crate(parts, frame, -2.1, 0, 0.1, { full: FRUIT.apple, turn: 0.2 });
  crate(parts, frame, -2.1, 0.34, 0.1, { full: FRUIT.apple, turn: 0.1 });
  // A heap of pumpkins at the end of the stall towards the road, one on top of the others.
  const pumpkin = new THREE.IcosahedronGeometry(0.34, 1);
  for (const [lx, lz, size, lift] of [
    [2.15, 0.45, 1, 0],
    [2.75, 0.2, 0.85, 0],
    [2.3, -0.25, 0.9, 0],
    [2.9, -0.4, 0.7, 0],
    [2.45, 0.12, 0.75, 0.4],
  ]) {
    const y = frame.ground(lx, lz) - frame.ground(0, 0) + 0.24 * size + lift;
    parts.add(pumpkin, PUMPKIN, at(lx, y, lz, { sx: size, sy: size * 0.72, sz: size }));
    parts.box(0.05, 0.12, 0.05, '#6f6a3a', at(lx, y + 0.27 * size, lz));
  }
  obstacles.push({
    ...frame.local(0, 0.1),
    halfX: width / 2 + 0.2,
    halfZ: depth / 2 + 0.3,
    rotation: frame.rotation,
    radius: 0,
  });
  obstacles.push({ ...frame.local(2.5, 0.05), radius: 0.75 });
}

/** The beehives: painted boxes on low stands, each with a lid and a slot at the foot of its front. */
function buildHives(parts, obstacles) {
  ORCHARD.hives.forEach((hive, i) => {
    const { at, local, rotation } = framer(hive);
    for (const lx of [-0.26, 0.26]) parts.box(0.08, 0.32, 0.5, DARK_WOOD, at(lx, 0.14, 0));
    parts.box(0.62, 0.5, 0.52, HIVES[i % HIVES.length], at(0, 0.52, 0));
    parts.box(0.64, 0.06, 0.54, '#f0e8d4', at(0, 0.62, 0)); // a pale band between the boxes
    parts.box(0.74, 0.08, 0.64, '#5b5a55', at(0, 0.81, 0)); // the lid
    parts.box(0.34, 0.04, 0.04, '#2b2622', at(0, 0.33, 0.27)); // the slot the bees go in by
    obstacles.push({ ...local(0, 0), halfX: 0.4, halfZ: 0.35, rotation, radius: 0 });
  });
}

/** Stacks of crates at the foot of some of the rows, empty and waiting for the picking. */
function buildCrates(parts, obstacles) {
  ORCHARD.crates.forEach((spot, i) => {
    const frame = framer({ ...spot, rotation: ORCHARD.rotation + i * 0.4 });
    crate(parts, frame, -0.34, 0, 0);
    crate(parts, frame, 0.34, 0, 0.04, { turn: 0.06 });
    crate(parts, frame, 0, 0.34, 0.02, { turn: -0.1, full: i === 1 ? FRUIT.apple : null });
    obstacles.push({ ...frame.local(0, 0), radius: 0.75 });
  });
}

/** A wooden ladder leaning against a tree, up into its crown. */
function buildLadder(parts, obstacles) {
  const { x, z, tree } = ORCHARD.ladder;
  const [dx, dz] = [tree.x - x, tree.z - z];
  const length = Math.hypot(dx, dz);
  const [ux, uz] = [dx / length, dz / length];
  // Across the ladder, level.
  const [sx, sz] = [-uz, ux];
  const foot = terrainHeight(x, z);
  const top = { x: x + ux * (length - 0.3), y: foot + 2.9, z: z + uz * (length - 0.3) };
  for (const side of [-0.22, 0.22]) {
    parts.beam(
      { x: x + sx * side, y: foot - 0.05, z: z + sz * side },
      { x: top.x + sx * side, y: top.y, z: top.z + sz * side },
      0.05,
      WOOD,
      0.07,
    );
  }
  for (let k = 1; k <= 8; k++) {
    const t = k / 9;
    const [px, py, pz] = [x + (top.x - x) * t, foot + (top.y - foot) * t, z + (top.z - z) * t];
    parts.beam(
      { x: px - sx * 0.22, y: py, z: pz - sz * 0.22 },
      { x: px + sx * 0.22, y: py, z: pz + sz * 0.22 },
      0.035,
      WOOD,
    );
  }
  obstacles.push({ x, z, radius: 0.4 });
}

export function buildOrchard(scene, obstacles) {
  buildTrees(scene, obstacles);
  const parts = new PartsBuilder();
  windfalls(parts);
  buildStall(parts, obstacles);
  buildHives(parts, obstacles);
  buildCrates(parts, obstacles);
  buildLadder(parts, obstacles);
  scene.add(parts.mesh());
}
