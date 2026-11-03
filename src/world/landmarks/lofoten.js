// The Lofoten coast at the far end of the fjord, under snow: a quay where the ferry ties up, a
// small fishing village of red and ochre cabins on stilts along the water's edge, a white
// church, racks of stockfish hung out to dry, boats at a jetty, a lighthouse on the knoll at
// the end of the shore, and roads of packed snow through it all and round the flats behind.
// The mountains, the snow and the animals are made elsewhere (see terrain.js, scenery.js and
// herds.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FJORD, LOFOTEN, LOFOTEN_QUAY } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, createSmoke, localFrame } from '../build.js';
import { ribbonGeometry, ribbonMesh } from '../scenery.js';
import { snowOver } from '../snow.js';
import { ferryQuay } from './fjord.js';
import { gabledHouse } from './house.js';
import { framer } from './frame.js';

const WHITE = '#f1ede2';
const GLASS = '#3f5559';
const PLANK = '#8a6a49';
const PILE = '#5d4a39';
const TAR = '#403b38';
const TURF = '#7d8c5a';
const STONE = '#8e8f86';
const FISH = '#eadfc6';

/** A window with a white frame, in a wall facing +Z. */
function framedWindow(parts, at, lx, ly, lz) {
  parts.box(1, 1.1, 0.1, WHITE, at(lx, ly, lz));
  parts.box(0.76, 0.86, 0.1, GLASS, at(lx, ly, lz + 0.03));
}

/**
 * A fisherman's cabin on stilts at the water's edge, its long side to the shore: boards painted
 * red or ochre, white window frames and a dark or turf roof, with a deck out in front over the
 * shallows and a pole of stockfish hung under the eaves.
 */
function cabin(parts, obstacles, spot, index) {
  const frame = framer(spot);
  const { at, ground } = frame;
  const [width, depth, lift] = [spot.long, 4.6, 1.3];
  const [eave, ridge] = [lift + 2.5, lift + 3.9];
  // Stilts down to the ground under each of the corners and the middle of the long sides.
  const stilt = (lx, lz) => {
    const low = ground(lx, lz) - ground(0, 0) - 0.5;
    parts.box(0.26, lift - 0.05 - low, 0.26, PILE, at(lx, (lift - 0.05 + low) / 2, lz));
  };
  for (const sx of [-0.46, 0, 0.46]) for (const sz of [-0.44, 0.44]) stilt(sx * width, sz * depth);
  parts.box(width + 0.3, 0.22, depth + 0.3, PLANK, at(0, lift - 0.1, 0));
  obstacles.push(
    gabledHouse(parts, frame, {
      width,
      depth,
      base: lift,
      eave,
      ridge: ridge + 0.05,
      overhang: 0.45,
      ridgeAlong: 'x',
      walls: spot.paint,
      roof: index % 3 === 1 ? TURF : TAR,
    }),
  );
  // The deck in front, with a rail, on stilts of its own.
  parts.box(width * 0.8, 0.14, 1.7, PLANK, at(0, lift - 0.07, depth / 2 + 0.85));
  for (const sx of [-0.38, 0.38]) stilt(sx * width, depth / 2 + 1.55);
  parts.box(width * 0.8, 0.08, 0.08, WHITE, at(0, lift + 0.95, depth / 2 + 1.65));
  for (const sx of [-0.4, 0, 0.4]) parts.box(0.09, 0.95, 0.09, WHITE, at(sx * width, lift + 0.48, depth / 2 + 1.65));
  parts.box(1.1, 2, 0.12, '#3d5b6b', at(-width * 0.3, lift + 1.1, depth / 2 + 0.02)); // door
  for (const sx of [0.05, 0.32]) framedWindow(parts, at, sx * width, lift + 1.45, depth / 2 + 0.03);
  framedWindow(parts, at, -width * 0.46, lift + 1.45, depth / 2 + 0.03);
  // A pole of stockfish under the eaves.
  parts.box(width * 0.8, 0.07, 0.07, PLANK, at(0, eave - 0.3, depth / 2 + 0.28));
  for (let k = -Math.floor(width * 1.7) / 2; k <= Math.floor(width * 1.7) / 2; k++)
    parts.box(0.1, 0.5, 0.05, FISH, at(k * 0.3, eave - 0.6, depth / 2 + 0.28));
  parts.box(0.5, 1.2, 0.5, STONE, at(width * 0.3, ridge + 0.1, -0.8)); // chimney
  return at(width * 0.3, ridge + 0.9, -0.8);
}

/** A wooden house on a stone footing, its long side to the road, with white frames round the windows. */
function house(parts, obstacles, spot) {
  const frame = framer(spot);
  const { at, ground } = frame;
  const [width, depth, eave, ridge] = [7.2, 5.4, 3.4, 5.5];
  const corners = [-1, 1].flatMap(sx => [-1, 1].map(sz => ground((sx * width) / 2, (sz * depth) / 2)));
  const drop = ground(0, 0) - Math.min(...corners);
  parts.box(width + 0.4, 0.6 + drop, depth + 0.4, STONE, at(0, -drop / 2, 0));
  obstacles.push(
    gabledHouse(parts, frame, {
      width,
      depth,
      base: 0.2,
      eave: eave + 0.2,
      ridge: ridge + 0.05,
      overhang: 0.45,
      ridgeAlong: 'x',
      walls: spot.paint,
      roof: spot.roof,
    }),
  );
  parts.box(1.1, 2.1, 0.12, '#3d5b6b', at(-1.6, 1.25, depth / 2 + 0.02)); // door
  parts.box(1.4, 0.16, 0.16, WHITE, at(-1.6, 2.4, depth / 2 + 0.05));
  for (const lx of [0.6, 2.4]) framedWindow(parts, at, lx, 2, depth / 2 + 0.03);
  parts.box(0.7, 1.6, 0.7, STONE, at(2, ridge + 0.2, -0.8)); // chimney
  return at(2, ridge + 1.2, -0.8);
}

/** A white wooden church with a dark roof, a squat tower over its door and a spire. */
function church(parts, obstacles, spot) {
  const frame = framer(spot);
  const { at, local, ground } = frame;
  const [width, depth] = [6.4, 10];
  const drop = ground(0, 0) - Math.min(ground(-3.5, -5.5), ground(3.5, 5.5), ground(-3.5, 5.5), ground(3.5, -5.5));
  parts.box(width + 0.5, 0.7 + drop, depth + 0.5, STONE, at(0, -drop / 2, 0));
  gabledHouse(parts, frame, { width, depth, base: 0.3, eave: 4.4, ridge: 8, overhang: 0.4, walls: WHITE, roof: TAR });
  // The tower stands over the end with the door, a little wider than the nave is.
  parts.box(3.4, 9, 3.4, WHITE, at(0, 4.5, depth / 2 - 1.2));
  parts.box(3.9, 0.3, 3.9, TAR, at(0, 9.1, depth / 2 - 1.2));
  parts.add(
    new THREE.ConeGeometry(2.4, 4.6, 4),
    TAR,
    at(0, 11.5, depth / 2 - 1.2, { ry: spot.rotation + Math.PI / 4 }),
  );
  parts.box(0.12, 1.6, 0.12, '#c9c4b4', at(0, 14.6, depth / 2 - 1.2));
  parts.box(0.7, 0.12, 0.12, '#c9c4b4', at(0, 14.8, depth / 2 - 1.2));
  parts.box(1.5, 2.5, 0.14, '#7d2a20', at(0, 1.55, depth / 2 + 0.55)); // door
  parts.box(1.9, 0.18, 0.18, WHITE, at(0, 2.9, depth / 2 + 0.6));
  for (const side of [-1, 1]) {
    for (const lz of [-3, -0.2]) {
      parts.box(0.12, 1.9, 1, WHITE, at(side * (width / 2 + 0.02), 2.9, lz));
      parts.box(0.1, 1.5, 0.7, GLASS, at(side * (width / 2 + 0.05), 2.9, lz));
    }
    parts.box(0.1, 1.2, 0.6, GLASS, at(side * 1.72, 6.4, depth / 2 - 1.2)); // belfry slits
  }
  obstacles.push({ ...local(0, 0), halfX: 3.8, halfZ: 5.7, rotation: spot.rotation, radius: 0 });
}

/**
 * A rack for drying fish (hjell): a long frame of tall poles in pairs with cross poles between
 * them, hung with rows of stockfish in pairs, tied by the tails.
 */
function rack(parts, obstacles, spot) {
  const frame = framer(spot);
  const { at, local } = frame;
  const half = spot.length / 2;
  const posts = Math.round(spot.length / 2.6);
  // Each pair of poles stands 1.1 m apart at the foot and leans together at the top, which is
  // `lean` of its height.
  const lean = 0.17;
  const reach = y => 0.55 - lean * y;
  for (let k = 0; k <= posts; k++) {
    const lx = -half + (k * spot.length) / posts;
    for (const side of [-1, 1])
      parts.box(0.14, 3.3, 0.14, PILE, at(lx, 1.6, side * (0.55 - lean * 1.6), { rx: -side * lean }));
    parts.box(0.14, 0.14, 2 * reach(3.1), PILE, at(lx, 3.1, 0));
  }
  for (const y of [1.3, 1.95, 2.6]) {
    for (const side of [-1, 1]) {
      const lz = side * reach(y);
      parts.box(spot.length + 0.4, 0.09, 0.09, PLANK, at(0, y, lz));
      // The fish hang in pairs, a hand's width apart, the first of every pair a little shorter.
      for (let lx = -half + 0.2, n = 0; lx < half; lx += 0.24, n++)
        parts.box(0.11, 0.62 - (n % 2) * 0.07, 0.04, FISH, at(lx, y - 0.34, lz));
    }
  }
  const [a, b] = [local(-half, 0), local(half, 0)];
  obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 0.9 });
}

/**
 * A small fishing boat with a white wheelhouse, at (x, z) afloat or aground, turned by `ry`,
 * `y` high at the waterline. Its length lies along local Z, bow to +Z.
 */
function boat(parts, { x, z, y, ry }, { hull, cabin = WHITE, length = 5.4 }) {
  const frame = localFrame(x, z, ry);
  const at = (lx, ly, lz, extra = {}) => ({ ...frame(lx, lz), y: y + ly, ry, ...extra });
  // The hull stands a full metre out of the water, as a working boat's does.
  parts.box(1.9, 1.1, length, hull, at(0, 0.45, 0));
  // The pointed bow, a hair lower than the hull, so the snow on the two doesn't flicker where they meet.
  parts.box(1.3, 1.06, 1.3, hull, at(0, 0.45, length / 2 + 0.1, { ry: ry + Math.PI / 4 }));
  // A white stripe along each side, just proud of the hull.
  for (const side of [-1, 1]) parts.box(0.05, 0.14, length - 0.3, WHITE, at(side * 0.96, 0.8, -0.1));
  parts.box(1.3, 1, 1.7, cabin, at(0, 1.54, -0.7));
  parts.box(1.34, 0.34, 1.74, GLASS, at(0, 1.76, -0.7));
  parts.box(1.5, 0.1, 1.9, '#5b4a3d', at(0, 2.08, -0.7));
  parts.box(0.1, 2.4, 0.1, '#6f5843', at(0, 2.1, 0.9));
  parts.box(0.1, 0.1, 1.6, '#6f5843', at(0, 2.75, 0.35, { rx: 0.1 }));
}

/** The jetty: planks on piles, out over the shallows from the shore, with fishing boats along it. */
function jetty(parts, obstacles) {
  const { jetty: spot } = LOFOTEN;
  const [root, tip] = [LOFOTEN.shore(-31, 153.5), spot.to];
  const [dx, dz] = [tip.x - root.x, tip.z - root.z];
  const length = Math.hypot(dx, dz);
  const heading = Math.atan2(dx, dz);
  const frame = localFrame(root.x, root.z, heading);
  // The deck stands well above the water and the shallows at its foot, like a pier.
  const deck = FJORD.level + 1.45;
  for (let along = 0; along <= length; along += 0.5) {
    const p = frame(0, along);
    parts.box(spot.width, 0.1, 0.44, Math.round(along * 2) % 3 ? PLANK : '#7a5d3f', {
      x: p.x,
      y: deck - 0.05,
      z: p.z,
      ry: heading,
    });
  }
  for (const side of [-1, 1]) {
    const [a, b] = [frame(side * (spot.width / 2 - 0.2), 0), frame(side * (spot.width / 2 - 0.2), length)];
    parts.beam({ ...a, y: deck - 0.22 }, { ...b, y: deck - 0.22 }, 0.18, PILE, 0.22);
  }
  for (let along = 1; along <= length; along += 3.5) {
    for (const side of [-1, 1]) {
      const p = frame(side * (spot.width / 2 - 0.2), along);
      const bottom = Math.min(terrainHeight(p.x, p.z), FJORD.level - 1.2) - 0.4;
      parts.box(0.26, deck - 0.2 - bottom, 0.26, PILE, { x: p.x, y: (deck - 0.2 + bottom) / 2, z: p.z });
      parts.box(0.3, 1.1, 0.3, PILE, { x: p.x, y: deck + 0.45, z: p.z });
    }
  }
  // Boats along both sides: red, blue and green hulls, bows to the shore.
  const hulls = ['#a5382b', '#3f6f8f', '#4f7a5a', '#d8a43f'];
  [10, 19, 28].forEach((along, i) => {
    const side = i % 2 ? 1 : -1;
    const p = frame(side * 2.4, Math.min(along, length - 3));
    boat(parts, { x: p.x, z: p.z, y: FJORD.level - 0.05, ry: heading + Math.PI }, { hull: hulls[i % hulls.length] });
  });
  const p = frame(2.4, 5);
  boat(parts, { x: p.x, z: p.z, y: FJORD.level - 0.05, ry: heading }, { hull: hulls[3], length: 4.6 });
}

/** A fishing boat pulled up on the beach, its bow to the water: nobody drives into it. */
function aground(parts, obstacles, bearing, hull) {
  const spot = LOFOTEN.shore(bearing, 156);
  const frame = localFrame(spot.x, spot.z, spot.rotation);
  // It rests on the ground, its keel at the height of the lowest ground under it.
  const low = Math.min(
    ...[-2.4, 0, 2.4].flatMap(lz => [-0.95, 0.95].map(lx => terrainHeight(frame(lx, lz).x, frame(lx, lz).z))),
  );
  boat(parts, { x: spot.x, z: spot.z, y: low + 0.1, ry: spot.rotation }, { hull, length: 4.6 });
  const [a, b] = [frame(0, -2.2), frame(0, 2.4)];
  obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 1 });
}

/** The lighthouse on the knoll at the end of the shore: a white tower with a red lantern. */
function lighthouse(parts, obstacles) {
  const { x, z, rotation } = LOFOTEN.lighthouse;
  const y = terrainHeight(x, z);
  const frame = framer({ x, z, rotation });
  const { at } = frame;
  const low = Math.min(...[-1, 1].flatMap(sx => [-1, 1].map(sz => frame.ground(sx * 2.6, sz * 2.6)))) - y;
  parts.box(5.2, 0.9 - low, 5.2, STONE, at(0, (0.1 + 0.55 + low) / 2, 0));
  parts.add(new THREE.CylinderGeometry(1.35, 2, 9.6, 8), WHITE, at(0, 5.6, 0));
  parts.add(new THREE.CylinderGeometry(1.43, 1.9, 1.5, 8), '#b8352a', at(0, 6.1, 0));
  parts.add(new THREE.CylinderGeometry(1.95, 1.45, 0.4, 8), '#3b3a38', at(0, 10.6, 0));
  parts.add(new THREE.CylinderGeometry(1.0, 1.0, 1.5, 8), '#f4dd96', at(0, 11.6, 0));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    parts.box(0.12, 1.5, 0.12, '#b8352a', at(Math.cos(a) * 1.02, 11.6, Math.sin(a) * 1.02));
  }
  parts.add(new THREE.ConeGeometry(1.3, 1.2, 8), '#b8352a', at(0, 12.9, 0));
  parts.box(0.8, 1.5, 0.1, '#7d2a20', at(0, 1.05, 1.8)); // door
  obstacles.push({ x, z, radius: 2.7 });
  return y;
}

/** The roads of packed snow: two pale ruts either side of a trodden middle, in one mesh. */
function roads() {
  const geometries = [];
  for (const path of Object.values(LOFOTEN.roads)) {
    geometries.push(ribbonGeometry(path, 2.9, '#c6d2e8', { lift: 0.05 }));
    for (const offset of [-0.9, 0.9])
      geometries.push(ribbonGeometry(path, 0.38, '#aab8d3', { lift: 0.07, offset, across: 1 }));
  }
  return ribbonMesh(mergeGeometries(geometries));
}

export function buildLofoten(scene, obstacles) {
  const parts = new PartsBuilder();
  ferryQuay(parts, obstacles, LOFOTEN_QUAY);
  const chimneys = LOFOTEN.cabins.map((spot, i) => cabin(parts, obstacles, spot, i));
  const smoking = LOFOTEN.houses.map(spot => house(parts, obstacles, spot));
  church(parts, obstacles, LOFOTEN.church);
  for (const spot of LOFOTEN.racks) rack(parts, obstacles, spot);
  jetty(parts, obstacles);
  aground(parts, obstacles, 9, '#3f6f8f');
  aground(parts, obstacles, -11, '#a5382b');
  lighthouse(parts, obstacles);
  snowOver(parts);
  scene.add(parts.mesh());
  scene.add(roads());
  // Smoke from a cabin and a house.
  const smokes = [chimneys[2], smoking[0]].map(origin => createSmoke(scene, origin, { rise: 6, size: 0.4 }));
  let time = 0;
  return {
    update(dt) {
      time += dt;
      for (const smoke of smokes) smoke.update(time);
    },
  };
}
