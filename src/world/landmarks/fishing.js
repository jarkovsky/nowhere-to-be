// The fishing hut: a small wooden hut on short stilts on the bank of the river, with a porch in
// front, a little jetty out over the water, a rowing boat pulled up on the bank, a bench to look
// at the river from and a fishing rod leaning against the wall. All of it is solid, so the car
// goes round.
import * as THREE from 'three';
import { FISHING } from '../layout.js';
import { terrainHeight, waterLevel } from '../terrain.js';
import { PartsBuilder } from '../build.js';
import { framer } from './frame.js';
import { gabledHouse } from './house.js';

const WALL = '#a97a52';
const DARK_WOOD = '#5f4532';
const PLANK = '#a8875f';
const POST = '#6f5843';
const ROOF = '#6d4a3a';
const HULL = '#3f7a88';
const GUNWALE = '#efe6cf';

/** The hut itself, on its stilts, with the porch, the steps and the rail round them. */
function buildHut(parts, obstacles) {
  const frame = framer(FISHING);
  const { at, ground } = frame;
  const [width, depth, floor] = [3.1, 2.6, 0.98];
  // Short stilts under the corners and the middle of each side, down into the ground.
  for (const [lx, lz] of [
    [-1.4, -1.2],
    [1.4, -1.2],
    [-1.4, 1.2],
    [1.4, 1.2],
    [0, -1.2],
    [0, 1.2],
  ]) {
    const bottom = ground(lx, lz) - terrainHeight(FISHING.x, FISHING.z) - 0.3;
    parts.box(0.22, floor - 0.1 - bottom, 0.22, POST, at(lx, (floor - 0.1 + bottom) / 2, lz));
  }
  parts.box(width + 0.2, 0.12, depth + 0.2, PLANK, at(0, floor - 0.1, 0));
  // The porch along the front, a little wider than the hut.
  parts.box(width + 0.4, 0.1, 1.3, PLANK, at(0, floor - 0.11, depth / 2 + 0.7));
  for (const lx of [-1.55, 1.55]) parts.box(0.2, 1.17, 0.2, POST, at(lx, 0.285, depth / 2 + 1.2));

  const house = gabledHouse(parts, frame, {
    width,
    depth,
    base: floor - 0.06,
    eave: floor + 1.95,
    ridge: floor + 2.85,
    walls: WALL,
    roof: ROOF,
    overhang: 0.45,
    margin: 0,
  });
  // The door, with a window on the other side of the front, and a small one in each side wall.
  parts.box(0.85, 1.6, 0.1, DARK_WOOD, at(0.55, floor + 0.8, depth / 2));
  parts.box(0.06, 0.1, 0.06, '#d8c38a', at(0.9, floor + 0.85, depth / 2 + 0.07));
  for (const [lx, lz, across] of [
    [-0.7, depth / 2, 0],
    [width / 2, 0, Math.PI / 2],
    [-width / 2, 0, Math.PI / 2],
  ]) {
    const ry = frame.rotation + across;
    parts.box(0.8, 0.7, 0.08, '#efe6cf', at(lx, floor + 1.1, lz, { ry }));
    parts.box(0.64, 0.54, 0.12, '#2e3a40', at(lx, floor + 1.1, lz, { ry }));
  }
  // A stove pipe through the roof, off to one side so that it stands on a slope of it.
  parts.box(0.2, 1.1, 0.2, '#595e63', at(-0.9, floor + 3, -0.5));
  parts.box(0.3, 0.06, 0.3, '#3c4044', at(-0.9, floor + 3.58, -0.5));

  // Two steps down from the front of the porch, sunk into the ground below.
  [0.62, 0.32].forEach((top, k) =>
    parts.box(0.9, top + 0.3, 0.35, PLANK, at(-0.75, (top - 0.3) / 2, depth / 2 + 1.53 + k * 0.35)),
  );
  // The porch rail along the front and the sides, with a gap for the steps.
  const rail = (a, b) => {
    const [pa, pb] = [frame.local(...a), frame.local(...b)];
    const y = terrainHeight(FISHING.x, FISHING.z) + floor + 0.85;
    parts.beam({ ...pa, y }, { ...pb, y }, 0.08, POST, 0.08);
  };
  rail([1.6, depth / 2 + 1.25], [-0.2, depth / 2 + 1.25]);
  rail([1.6, depth / 2 + 1.25], [1.6, depth / 2]);
  rail([-1.6, depth / 2 + 1.25], [-1.6, depth / 2]);
  rail([-1.6, depth / 2 + 1.25], [-1.15, depth / 2 + 1.25]);

  // The rod, leaning on the wall beside the door: a handle, a thin blank and a reel.
  const foot = { ...frame.local(1.2, depth / 2 + 0.95), y: terrainHeight(FISHING.x, FISHING.z) + floor - 0.04 };
  const tip = { ...frame.local(1.15, depth / 2 + 0.02), y: foot.y + 1.75 };
  const along = t => ({
    x: foot.x + (tip.x - foot.x) * t,
    y: foot.y + (tip.y - foot.y) * t,
    z: foot.z + (tip.z - foot.z) * t,
  });
  parts.beam(foot, along(0.3), 0.05, DARK_WOOD);
  parts.beam(along(0.3), tip, 0.025, '#7a6446');
  parts.box(0.09, 0.09, 0.05, '#8a8f93', { ...along(0.17), ry: frame.rotation });
  // A bucket on the porch.
  parts.add(new THREE.CylinderGeometry(0.2, 0.16, 0.34, 8), '#5f8a96', at(-1.3, floor - 0.05 + 0.17, depth / 2 + 0.9));

  obstacles.push({ ...house, ...frame.local(0, 0.65), halfX: width / 2 + 0.3, halfZ: depth / 2 + 1.4 });
}

/** The jetty: planks on posts running out over the water from the bank in front of the hut. */
function buildJetty(parts, obstacles) {
  const { from, to, width, lx } = FISHING.jetty;
  const { local, at, rotation } = framer(FISHING);
  const end = local(lx, to);
  const deck = waterLevel(end.x, end.z) + 0.55;
  for (let lz = from; lz <= to; lz += 0.45) {
    const shade = Math.round(lz * 2) % 3 === 0 ? '#9f7e57' : PLANK;
    parts.box(width, 0.1, 0.4, shade, at(lx, 0, lz, { y: deck - 0.05 }));
  }
  for (const side of [-1, 1]) {
    const edge = lx + side * (width / 2 - 0.2);
    const [a, b] = [local(edge, from), local(edge, to)];
    parts.beam({ ...a, y: deck - 0.22 }, { ...b, y: deck - 0.22 }, 0.14, POST, 0.2);
    for (const lz of [from + 0.08, from + 2.8, from + 5.5, to - 0.08]) {
      const p = local(edge, lz);
      const bottom = terrainHeight(p.x, p.z) - 0.5;
      parts.box(0.2, deck - 0.3 - bottom, 0.2, POST, { x: p.x, y: (deck - 0.3 + bottom) / 2, z: p.z, ry: rotation });
    }
  }
  // A mooring post at the end, with a coil of rope round it.
  const post = local(lx + width / 2 - 0.15, to - 0.2);
  parts.box(0.22, 0.7, 0.22, POST, { x: post.x, y: deck + 0.3, z: post.z, ry: rotation });
  parts.add(new THREE.TorusGeometry(0.15, 0.04, 4, 8), '#c9b78a', {
    x: post.x,
    y: deck + 0.4,
    z: post.z,
    rx: Math.PI / 2,
  });
  obstacles.push({ ...local(lx, (from + to) / 2), halfX: width / 2, halfZ: (to - from) / 2, rotation, radius: 0.1 });
}

/** A rowing boat drawn up on the bank, with the oars across the seats. */
function buildBoat(parts, obstacles) {
  const boat = FISHING.boat;
  // It lies along the slope of the bank, its bow down towards the water.
  const [stern, bow] = [-1.5, 1.5].map(k =>
    terrainHeight(boat.x + Math.sin(boat.rotation) * k, boat.z + Math.cos(boat.rotation) * k),
  );
  const y = terrainHeight(boat.x, boat.z) - 0.1;
  const turn = new THREE.Euler(Math.atan2(stern - bow, 3), boat.rotation, 0, 'YXZ');
  const base = new THREE.Matrix4().compose(
    new THREE.Vector3(boat.x, y, boat.z),
    new THREE.Quaternion().setFromEuler(turn),
    new THREE.Vector3(1, 1, 1),
  );
  const piece = (w, h, d, color, x, py, z, rz = 0, ry = 0) =>
    parts.box(
      w,
      h,
      d,
      color,
      base
        .clone()
        .multiply(
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, py, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)),
            new THREE.Vector3(1, 1, 1),
          ),
        ),
    );
  piece(0.9, 0.08, 2.6, '#c9b78a', 0, 0.12, 0);
  for (const side of [-1, 1]) {
    piece(0.07, 0.42, 3.0, HULL, side * 0.55, 0.33, 0);
    piece(0.16, 0.08, 3.04, GUNWALE, side * 0.55, 0.57, 0);
    // The bow: a plank each side meeting at a point.
    piece(0.07, 0.42, 0.85, HULL, side * 0.27, 0.33, 1.78, 0, side * 0.62);
  }
  piece(1.1, 0.42, 0.07, HULL, 0, 0.33, -1.5);
  piece(1.2, 0.08, 0.14, GUNWALE, 0, 0.57, -1.5);
  for (const z of [-0.7, 0.25]) piece(1.1, 0.06, 0.3, '#8a6a49', 0, 0.42, z);
  // Two oars, blades down the boat, crossed over the seats.
  for (const side of [-1, 1]) {
    parts.beam(
      { ...localInBoat(base, side * 0.3, 0.53, -1.15) },
      { ...localInBoat(base, -side * 0.1, 0.56, 1.1) },
      0.05,
      '#8a6a49',
    );
    piece(0.14, 0.03, 0.5, '#8a6a49', -side * 0.1, 0.56, 1.3);
  }
  obstacles.push({ x: boat.x, z: boat.z, halfX: 0.75, halfZ: 1.7, rotation: boat.rotation, radius: 0 });
}

function localInBoat(base, x, y, z) {
  const p = new THREE.Vector3(x, y, z).applyMatrix4(base);
  return { x: p.x, y: p.y, z: p.z };
}

/** A bench by the water, with a back, facing the river. */
function buildBench(parts, obstacles) {
  const { at, local, rotation } = framer(FISHING.bench);
  parts.box(1.7, 0.07, 0.45, PLANK, at(0, 0.46, 0));
  parts.box(1.7, 0.3, 0.05, PLANK, at(0, 0.8, -0.22, { rx: -0.1 }));
  for (const lx of [-0.7, 0.7]) parts.box(0.08, 0.44, 0.4, POST, at(lx, 0.22, 0));
  for (const lx of [-0.7, 0.7]) parts.box(0.08, 0.5, 0.08, POST, at(lx, 0.6, -0.22));
  obstacles.push({ ...local(0, -0.05), halfX: 0.9, halfZ: 0.35, rotation, radius: 0 });
}

export function buildFishing(scene, obstacles) {
  const parts = new PartsBuilder();
  buildHut(parts, obstacles);
  buildJetty(parts, obstacles);
  buildBoat(parts, obstacles);
  buildBench(parts, obstacles);
  scene.add(parts.mesh());
}
