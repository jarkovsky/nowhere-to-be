// The desert to the south. Sandstone buttes stand over the dunes, two of them close enough together
// to make a narrow canyon that the track winds through. At the end of the track is an oasis: a pool
// among palm trees with reeds round its edge, a wind pump turning in the breeze over a tank and a
// trough, and two mud-brick houses. A petrol station stands beside the outer road with a camper van
// at the pump, its lights coming on at night, and tumbleweed rolls across the sand with the wind.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom, smoothstep, valueNoise } from '../../core/math.js';
import { DESERT } from '../layout.js';
import { pondLevel, terrainHeight } from '../terrain.js';
import { PartsBuilder, prism, tintable, vertexColorMaterial } from '../build.js';
import { foliageMaterial } from '../detail.js';
import { boulderGeometry } from '../rocks.js';
import { ribbonGeometry, ribbonMesh } from '../scenery.js';
import { dryTuftGeometry } from '../sand.js';
import { createPath, headingOf } from '../path.js';
import { camperVan, createVehicle } from '../../vehicles/traffic.js';
import { framer } from './frame.js';

/** The way the wind blows across the desert, from the west-south-west (see the dunes in terrain.js). */
const WIND = new THREE.Vector2(0.89, -0.45);

// --- The buttes ------------------------------------------------------------------------------

/** Bands of redder and paler sandstone, a couple of metres deep each. */
const STRATA = ['#c47645', '#b4693b', '#cf8956', '#a95f37', '#c58050'].map(c => new THREE.Color(c));
const SCREE = new THREE.Color('#cf9d6c');
const DUST = new THREE.Color('#d39a68');

/** How far out a butte reaches at an angle (radians from east, towards the south), at the foot of its walls. */
function reachAt({ rx, rz }, angle) {
  return 1 / Math.hypot(Math.cos(angle) / rx, Math.sin(angle) / rz);
}

/**
 * The rings a butte is built of, from the foot of its scree up to its top, as [how far out, how
 * high]: the scree, up to 1.4 m above the highest ground under the walls, then the walls, in bands
 * of stone a few metres deep, stepping in at two ledges, up to a flat top, by fractions of its height.
 */
const PROFILE = [
  [1.2, 0],
  [1.0, 1.4],
  [0.99, 0.15],
  [0.98, 0.28],
  [0.97, 0.42],
  [0.93, 0.43],
  [0.925, 0.53],
  [0.92, 0.64],
  [0.915, 0.74],
  [0.87, 0.75],
  [0.865, 0.88],
  [0.86, 1],
];
const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const facet = new THREE.Triangle(...corners);
const facing = new THREE.Vector3();

/**
 * A butte where it stands: its outline wanders round it, the same all the way up, and its walls
 * are banded, stepped and grooved. The foot of the scree is sunk into the sand wherever it reaches,
 * and the walls start above the highest ground under them. Returns the geometry and its outline.
 */
function butteGeometry(butte) {
  const random = createRandom(butte.seed * 131 + 7);
  const sides = 16;
  const outline = Array.from({ length: sides }, (_, k) => {
    const angle = (k / sides) * Math.PI * 2;
    return { angle, reach: reachAt(butte, angle) * (0.9 + random() * 0.2) };
  });
  const point = (k, scale) => {
    const { angle, reach } = outline[k % sides];
    return [butte.x + Math.cos(angle) * reach * scale, butte.z + Math.sin(angle) * reach * scale];
  };
  const base = Math.max(...outline.map((_, k) => terrainHeight(...point(k, 1))));
  const rings = PROFILE.map(([scale, rise], j) =>
    outline.map((_, k) => {
      // Each corner a little in or out of the line, so the walls are grooved.
      const groove = j === 0 ? 1 : 1 + (random() - 0.5) * 0.06;
      const [x, z] = point(k, scale * groove);
      const y = j === 0 ? terrainHeight(x, z) - 0.4 : base + (j === 1 ? rise : rise * butte.height);
      return [x, y, z];
    }),
  );
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  const triangle = (a, b, c, paint) => {
    positions.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(paint.r, paint.g, paint.b);
  };
  // The scree, the dusty tops of the ledges, and each band of the walls a stone of its own.
  const paintAt = (a, b, c, j) => {
    corners.forEach((corner, i) => corner.fromArray([a, b, c][i]));
    if (j === 0) return color.copy(SCREE).multiplyScalar(0.94 + random() * 0.08);
    if (facet.getNormal(facing).y > 0.6) return color.copy(DUST).multiplyScalar(0.95 + random() * 0.08);
    color.copy(STRATA[(j + butte.seed) % STRATA.length]);
    return color.multiplyScalar(0.93 + valueNoise(a[0] / 4 + a[2] / 5, j, 17) * 0.12);
  };
  for (let j = 0; j + 1 < rings.length; j++) {
    for (let k = 0; k < sides; k++) {
      const [a, b] = [rings[j][k], rings[j][(k + 1) % sides]];
      const [c, d] = [rings[j + 1][k], rings[j + 1][(k + 1) % sides]];
      // Wound to face out: round the ring is clockwise seen from above (+Z is south).
      triangle(a, c, b, paintAt(a, c, b, j));
      triangle(b, c, d, paintAt(b, c, d, j));
    }
  }
  const top = rings[rings.length - 1];
  const middle = [butte.x, top[0][1], butte.z];
  for (let k = 0; k < sides; k++) {
    const [a, b] = [top[k], top[(k + 1) % sides]];
    triangle(middle, b, a, color.copy(DUST).multiplyScalar(0.96 + random() * 0.06));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return { geometry, outline: rings[1].map(([x, , z]) => ({ x, z })), scree: rings[0] };
}

/**
 * The buttes, as one mesh, and the walls of segments round the middle of their scree that the car
 * bumps into. Each is also kept as a mesh of its own, out of the scene, for the camera to look past.
 */
function buildButtes(obstacles) {
  const pieces = DESERT.buttes.map(butte => {
    const { geometry, outline, scree } = butteGeometry(butte);
    // Halfway down the scree, all the way round.
    const ring = outline.map((p, k) => ({ x: (p.x + scree[k][0]) / 2, z: (p.z + scree[k][2]) / 2 }));
    ring.forEach((a, k) => {
      const b = ring[(k + 1) % ring.length];
      obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 0.8 });
    });
    obstacles.push({ x: butte.x, z: butte.z, radius: Math.min(butte.rx, butte.rz) * 0.8 });
    return geometry;
  });
  const mesh = new THREE.Mesh(mergeGeometries(pieces), vertexColorMaterial);
  mesh.castShadow = mesh.receiveShadow = true;
  return { mesh, occluders: pieces.map(geometry => new THREE.Mesh(geometry)) };
}

// --- The oasis -------------------------------------------------------------------------------

const TRUNK = '#b39d7b';
const RINGS = '#91795a';
const COCONUT = '#5c4632';
const FROND = '#9ebd7e';

/**
 * A date palm about seven metres tall: a trunk leaning over in a gentle curve, ringed where the
 * old leaves fell, under a crown of long arching fronds, each folded along its middle and drooping
 * at its tip, with coconuts hanging under them. The fronds take the tree's own tint.
 */
export function palmGeometry() {
  const parts = new PartsBuilder();
  const segments = 6;
  const height = 6.6;
  const lean = 1.4;
  const at = t => [lean * t * t, t * height];
  for (let i = 0; i < segments; i++) {
    const [x0, y0] = at(i / segments);
    const [x1, y1] = at((i + 1) / segments);
    const length = Math.hypot(x1 - x0, y1 - y0) + 0.12;
    const radius = 0.25 - i * 0.018;
    const tilt = -Math.atan2(x1 - x0, y1 - y0);
    parts.add(new THREE.CylinderGeometry(radius - 0.015, radius, length, 7), TRUNK, {
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2 - (i === 0 ? 0.3 : 0),
      rz: tilt,
      sy: i === 0 ? 1 + 0.6 / length : 1,
    });
    parts.add(new THREE.CylinderGeometry(radius + 0.03, radius + 0.03, 0.16, 7), RINGS, { x: x1, y: y1, rz: tilt });
  }
  const [cx, cy] = at(1);
  parts.add(new THREE.IcosahedronGeometry(0.34, 0), RINGS, { x: cx, y: cy + 0.05 });
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1;
    parts.add(new THREE.SphereGeometry(0.15, 6, 4), COCONUT, {
      x: cx + Math.cos(a) * 0.3,
      y: cy - 0.22,
      z: Math.sin(a) * 0.3,
    });
  }
  // The fronds: along each, points [how far out, how high] and how wide either side of the middle.
  const spine = [
    [0, 0.1, 0.05],
    [0.9, 0.55, 0.42],
    [1.9, 0.6, 0.5],
    [2.8, 0.2, 0.38],
    [3.5, -0.55, 0.05],
  ];
  const points = [];
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2 + (f % 2) * 0.2;
    const droop = f % 2 ? 0.3 : 0;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    const along = ([out, rise]) => [cx + dx * out, cy + rise - droop * (out / 3.5), dz * out];
    for (let i = 0; i + 1 < spine.length; i++) {
      const [p, q] = [spine[i], spine[i + 1]];
      const [m0, m1] = [along(p), along(q)];
      // Each side of the frond hangs a little below its middle.
      for (const side of [-1, 1]) {
        const edge = ([out, rise, wide]) => {
          const [x, y, z] = along([out, rise]);
          return [x - dz * side * wide, y - wide * 0.45, z + dx * side * wide];
        };
        const [e0, e1] = [edge(p), edge(q)];
        // Both faces, so it shows from below as well as above.
        points.push(m0, e0, m1, m1, e0, e1, m0, m1, e0, m1, e1, e0);
      }
    }
  }
  parts.add(prism(points), FROND);
  return tintable(parts.geometry(), [TRUNK, RINGS, COCONUT]);
}

/** The palms round the pool, leaving the side where the track comes in open. */
function palmSpots() {
  const { x, z, radius } = DESERT.oasis;
  const track = DESERT.track.at(-1);
  const arrive = Math.atan2(track.z - z, track.x - x);
  const random = createRandom(2207);
  const spots = [];
  for (let k = 0; k < 9; k++) {
    const angle = arrive + 0.8 + (k / 9) * (Math.PI * 2 - 1.6) + (random() - 0.5) * 0.25;
    const out = radius + 2.5 + random() * 4.5;
    spots.push({
      x: x + Math.cos(angle) * out,
      z: z + Math.sin(angle) * out,
      turn: angle + Math.PI,
      scale: 0.85 + random() * 0.35,
    });
  }
  return spots;
}

/** Reeds round the edge of the pool, some standing in the shallows, though not where the track comes down to it. */
function reedSpots() {
  const { x, z, radius } = DESERT.oasis;
  const track = DESERT.track.at(-1);
  const arrive = Math.atan2(track.z - z, track.x - x);
  const random = createRandom(2311);
  const spots = [];
  for (let k = 0; k < 26; k++) {
    const angle = random() * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(angle - arrive), Math.cos(angle - arrive))) < 0.5) continue;
    const out = radius - 1.2 + random() * 2.2;
    spots.push({ x: x + Math.cos(angle) * out, z: z + Math.sin(angle) * out, scale: 1 + random() * 0.6 });
  }
  return spots;
}

/** The oasis: the pool, the palms round it and boulders on its shore. Returns the reeds round its edge. */
function buildOasis(scene, parts, obstacles) {
  const { x, z, radius } = DESERT.oasis;
  const level = pondLevel(DESERT.oasis);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(radius + 0.8, 36).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: '#4c9ea2', emissive: '#1b4f52', emissiveIntensity: 0.3 }),
  );
  water.position.set(x, level, z);
  water.receiveShadow = true;
  scene.add(water);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const palms = palmSpots();
  const palmMesh = new THREE.InstancedMesh(palmGeometry(), foliageMaterial('trees'), palms.length);
  palms.forEach((palm, i) => {
    dummy.position.set(palm.x, terrainHeight(palm.x, palm.z) - 0.05, palm.z);
    // Leaning out over the water.
    dummy.rotation.set(0, -palm.turn + Math.PI, 0);
    dummy.scale.setScalar(palm.scale);
    dummy.updateMatrix();
    palmMesh.setMatrixAt(i, dummy.matrix);
    // Only lightly, as each palm's tint lands on its trunk as well as its fronds.
    palmMesh.setColorAt(i, tint.setHSL(0.18 + (i % 3) * 0.03, 0.3, 0.84 + (i % 4) * 0.04));
    obstacles.push({ x: palm.x, z: palm.z, radius: 0.35 * palm.scale });
  });
  // Under their broad crowns, the trunks would otherwise stand in their own shade all day.
  palmMesh.castShadow = true;
  scene.add(palmMesh);

  const reeds = reedSpots();
  const reedMesh = new THREE.InstancedMesh(dryTuftGeometry(), foliageMaterial('grass'), reeds.length);
  reeds.forEach((reed, i) => {
    dummy.position.set(reed.x, terrainHeight(reed.x, reed.z) - 0.05, reed.z);
    dummy.rotation.set(0, i * 2.3, 0);
    dummy.scale.set(reed.scale, reed.scale * 2.6, reed.scale);
    dummy.updateMatrix();
    reedMesh.setMatrixAt(i, dummy.matrix);
    reedMesh.setColorAt(i, tint.setHSL(0.21 + (i % 3) * 0.02, 0.45, 0.4));
  });

  // A few sandstone boulders on the shore, which the car bumps into rather than drives over.
  const stone = boulderGeometry(23, { moss: 0 });
  const random = createRandom(4129);
  for (const angle of [0.4, 2.1, 3.3, 4.6, 5.5]) {
    const out = radius + 1.8 + random() * 1.5;
    const [sx, sz] = [x + Math.cos(angle) * out, z + Math.sin(angle) * out];
    const size = 0.45 + random() * 0.4;
    obstacles.push({ x: sx, z: sz, radius: size * 1.1 });
    parts.add(stone, () => SCREE.clone().multiplyScalar(0.85 + random() * 0.15), {
      x: sx,
      y: terrainHeight(sx, sz) - size * 0.2,
      z: sz,
      ry: angle,
      sx: size * 1.2,
      sy: size,
      sz: size,
    });
  }
  return reedMesh;
}

// --- The wind pump ---------------------------------------------------------------------------

const STEEL = '#8d918d';
const GALVANISED = '#aeb1ab';

/**
 * A wind pump: a lattice tower of four legs leaning in to a small platform, braced across, with
 * the pump rod down its middle, a vane behind to keep its wheel to the wind, and beside it a round
 * tank and a trough of water. Returns the wheel, to be turned, and where it turns about.
 */
function windPump(parts, obstacles) {
  const { x, z } = DESERT.windpump;
  const ground = terrainHeight(x, z);
  const height = 8.5;
  const [foot, top] = [1.5, 0.35];
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const corner = (c, y) => {
    const spread = foot + (top - foot) * (y / height);
    return { x: x + c[0] * spread, y: ground + y, z: z + c[1] * spread };
  };
  for (const c of corners) parts.beam(corner(c, -0.3), corner(c, height), 0.1, STEEL);
  for (const y of [0.4, 2.6, 4.8, 6.8]) {
    corners.forEach((c, k) => parts.beam(corner(c, y), corner(corners[(k + 1) % 4], y), 0.06, STEEL));
  }
  // Crossed braces up each face.
  for (const [y0, y1] of [
    [0.4, 2.6],
    [2.6, 4.8],
    [4.8, 6.8],
  ]) {
    corners.forEach((c, k) => {
      const d = corners[(k + 1) % 4];
      parts.beam(corner(c, y0), corner(d, y1), 0.04, STEEL);
      parts.beam(corner(d, y0), corner(c, y1), 0.04, STEEL);
    });
  }
  parts.box(1.1, 0.08, 1.1, STEEL, { x, y: ground + height, z });
  parts.add(new THREE.CylinderGeometry(0.04, 0.04, height + 0.6, 6), GALVANISED, {
    x,
    y: ground + height / 2 - 0.2,
    z,
  });
  // The head on top, turned to the wind: a gearbox, the wheel's axle out in front and the vane behind.
  const facing = Math.atan2(-WIND.x, -WIND.y);
  const [ax, az] = [-WIND.x, -WIND.y];
  const hub = { x: x + ax * 0.75, y: ground + height + 0.55, z: z + az * 0.75 };
  parts.box(0.36, 0.36, 0.7, '#6f736f', { x, y: hub.y, z, ry: facing });
  parts.beam({ x, y: hub.y, z }, hub, 0.08, '#6f736f');
  const tail = { x: x - ax * 2.6, y: hub.y + 0.1, z: z - az * 2.6 };
  parts.beam({ x, y: hub.y, z }, tail, 0.07, STEEL);
  parts.box(0.04, 1.0, 1.6, '#c9c4b6', { x: tail.x + ax * 0.2, y: tail.y + 0.1, z: tail.z + az * 0.2, ry: facing });

  // The tank and the trough beside it, filled from a pipe off the pump.
  const tank = { x: x - 3.2, z: z + 1.2 };
  const tankGround = terrainHeight(tank.x, tank.z);
  parts.add(new THREE.CylinderGeometry(1.4, 1.4, 1.5, 16), GALVANISED, { x: tank.x, y: tankGround + 0.6, z: tank.z });
  parts.add(new THREE.CylinderGeometry(1.32, 1.32, 0.04, 16), '#4f8f94', {
    x: tank.x,
    y: tankGround + 1.27,
    z: tank.z,
  });
  parts.beam({ x, y: ground + 1.2, z }, { x: tank.x, y: tankGround + 1.2, z: tank.z }, 0.06, GALVANISED);
  const trough = { x: x + 0.4, z: z + 3 };
  const troughGround = terrainHeight(trough.x, trough.z);
  const ty = troughGround + 0.3;
  for (const side of [-1, 1]) {
    parts.box(2.8, 0.7, 0.08, '#8b6e50', { x: trough.x, y: ty, z: trough.z + side * 0.42 });
    parts.box(0.08, 0.7, 0.76, '#8b6e50', { x: trough.x + side * 1.36, y: ty, z: trough.z });
  }
  parts.box(2.64, 0.5, 0.76, '#4f8f94', { x: trough.x, y: ty - 0.12, z: trough.z });
  obstacles.push({ x, z, radius: 1.9 });
  obstacles.push({ ...tank, radius: 1.6 });
  obstacles.push({ ax: trough.x - 1.3, az: trough.z, bx: trough.x + 1.3, bz: trough.z, radius: 0.6 });

  // The wheel: eighteen blades between two rings, built facing +Z to be turned to the wind.
  const wheel = new PartsBuilder();
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    wheel.box(0.3, 1.05, 0.03, '#d8d4c8', {
      x: Math.cos(a) * 0.95,
      y: Math.sin(a) * 0.95,
      rz: a - Math.PI / 2,
      ry: 0.45,
    });
  }
  for (const r of [0.5, 1.4]) wheel.add(new THREE.TorusGeometry(r, 0.035, 4, 24), STEEL);
  wheel.add(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8), '#6f736f', { rx: Math.PI / 2 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    wheel.beam({ x: 0, y: 0, z: 0 }, { x: Math.cos(a) * 1.4, y: Math.sin(a) * 1.4, z: 0 }, 0.03, STEEL);
  }
  const mesh = wheel.mesh();
  mesh.position.set(hub.x, hub.y, hub.z);
  mesh.rotation.y = facing;
  return mesh;
}

// --- The mud-brick houses --------------------------------------------------------------------

const ADOBE = '#d6a676';
const PARAPET = '#cc9a6a';
const VIGA = '#6b4e37';

/**
 * A little mud-brick house, its flat roof edged by a low parapet with the ends of its roof beams
 * poking out below it, a blue door and a small window facing the oasis, and a ladder up to the
 * roof. `glow` is the material for its window, which lights up at night.
 */
function adobeHouse(parts, glow, obstacles, house, { width, depth, height }) {
  const { at, local, rotation } = framer(house);
  parts.box(width, height + 0.4, depth, ADOBE, at(0, height / 2 - 0.2, 0));
  parts.box(width + 0.12, 0.4, depth + 0.12, PARAPET, at(0, height + 0.1, 0));
  for (let k = 0; k < 5; k++) {
    const lx = -width / 2 + 0.6 + (k * (width - 1.2)) / 4;
    for (const side of [-1, 1]) parts.box(0.16, 0.16, 0.5, VIGA, at(lx, height - 0.35, side * (depth / 2 + 0.12)));
  }
  parts.box(1, 1.95, 0.08, '#3f6f96', at(-width / 4, 0.92, depth / 2 + 0.02));
  glow.box(0.8, 0.7, 0.08, '#ffffff', at(width / 4, 1.65, depth / 2 + 0.02));
  // The ladder against the side wall, its top resting on the parapet.
  const [rail, lean] = [height + 1.1, 0.1];
  const middle = { x: width / 2 + 0.27, y: rail / 2 - 0.1 };
  const railAt = y => middle.x - (y - middle.y) * Math.tan(lean);
  for (const lz of [-0.25, 0.25]) parts.box(0.07, rail, 0.07, VIGA, at(middle.x, middle.y, lz, { rz: lean }));
  for (let k = 1; k <= 6; k++) {
    const y = k * ((height + 0.6) / 7);
    parts.box(0.05, 0.05, 0.56, VIGA, at(railAt(y), y, 0));
  }
  obstacles.push({ ...local(0, 0), halfX: width / 2 + 0.3, halfZ: depth / 2 + 0.3, rotation, radius: 0 });
  obstacles.push({ ...local(width / 2 + 0.4, 0), radius: 0.6 });
}

// --- The petrol station ----------------------------------------------------------------------

const RED = '#c8402f';
const WHITE = '#f2efe6';

/**
 * The petrol station beside the outer road: a concrete forecourt out to the road's edge, a pump
 * island under a canopy, a little shop behind, and a tall sign with a pump on it by the road. Its
 * lights come on at night (`glow`). Returns the camper van parked at the pump.
 */
function petrolStation(scene, parts, glow, obstacles) {
  const { station } = DESERT;
  const frame = framer(station);
  const { at, local, rotation } = frame;
  const { forecourt: f } = station;
  const middle = (f.z0 + f.z1) / 2;
  const across = createPath([local(f.x0, middle), local(f.x1, middle)].map(p => [p.x, p.z]));
  scene.add(ribbonMesh(ribbonGeometry(across, (f.z1 - f.z0) / 2, '#cdc8ba', { lift: 0.05, across: 12 })));

  // The pump island under the canopy.
  const island = 3;
  parts.box(8, 0.25, 1.5, '#d9d5c9', at(0, 0.07, island));
  for (const lx of [-2.2, 2.2]) {
    parts.box(0.8, 1.7, 0.5, RED, at(lx, 1.04, island));
    parts.box(0.84, 0.36, 0.54, WHITE, at(lx, 1.72, island));
    for (const side of [-1, 1]) {
      parts.box(0.48, 0.24, 0.04, '#2c3a3f', at(lx, 1.38, island + side * 0.27));
      // A hose looping down to the nozzle in its holster.
      parts.beam(
        frame.at(lx + 0.42, 1.5, island + side * 0.1),
        frame.at(lx + 0.5, 0.9, island + side * 0.18),
        0.05,
        '#2c2c2a',
      );
      parts.box(0.1, 0.3, 0.12, '#2c2c2a', at(lx + 0.46, 0.8, island + side * 0.2));
    }
  }
  for (const lx of [-4.6, 4.6]) parts.add(new THREE.CylinderGeometry(0.18, 0.18, 4.9, 10), WHITE, at(lx, 2.6, island));
  parts.box(13, 0.5, 8, WHITE, at(0, 5.1, island));
  parts.box(13.1, 0.22, 8.1, RED, at(0, 5.0, island));
  for (const lx of [-4, 0, 4]) glow.box(1.4, 0.05, 0.5, '#ffffff', at(lx, 4.83, island));
  obstacles.push(
    { ...local(-3.6, island), radius: 1 },
    { ...local(3.6, island), radius: 1 },
    { ...local(0, island), radius: 1 },
  );
  for (const lx of [-4.6, 4.6]) obstacles.push({ ...local(lx, island), radius: 0.4 });

  // The shop behind, with a big window onto the forecourt.
  const shop = -8;
  parts.box(9, 3.6, 5, WHITE, at(0, 1.6, shop));
  parts.box(9.6, 0.3, 5.6, RED, at(0, 3.45, shop));
  glow.box(4.6, 1.5, 0.08, '#ffffff', at(-1.2, 1.6, shop + 2.52));
  parts.box(1.1, 2.15, 0.08, '#5b6f78', at(2.8, 1.02, shop + 2.52));
  // Oil drums by its corner.
  ['#3f6e96', RED, '#d9a73a'].forEach((paint, k) => {
    parts.add(
      new THREE.CylinderGeometry(0.3, 0.3, 0.92, 10),
      paint,
      at(5.4 + (k % 2) * 0.66, 0.42, shop + 1.2 + k * 0.5),
    );
  });
  obstacles.push({ ...local(0, shop), halfX: 4.7, halfZ: 2.7, rotation, radius: 0 });
  obstacles.push({ ...local(5.8, shop + 1.7), radius: 1 });

  // The sign by the road, square on to it so it is seen coming both ways: a pump in white on red.
  const sign = { x: f.x1 - 2, z: f.z1 - 3 };
  parts.add(new THREE.CylinderGeometry(0.12, 0.14, 6.4, 8), '#7d7f79', at(sign.x, 3, sign.z));
  parts.box(0.16, 1.9, 1.9, RED, at(sign.x, 6.3, sign.z));
  for (const side of [-1, 1]) {
    // The pump's body, its window standing out from it, and the hose and nozzle beside it.
    const face = (lz, y, w, h, color, out = 0.11) =>
      parts.box(0.04, h, w, color, at(sign.x + side * out, y, sign.z + lz));
    face(-0.15, 6.15, 0.7, 1.05, WHITE);
    face(-0.15, 6.4, 0.42, 0.3, RED, 0.14);
    face(0.36, 6.05, 0.12, 0.7, WHITE);
    face(0.28, 6.45, 0.28, 0.1, WHITE);
  }
  obstacles.push({ ...local(sign.x, sign.z), radius: 0.4 });

  // A camper van filling up, alongside the pumps. It stands square to the compass, a degree or two
  // off the line of the pumps, so the hubs of its wheels, which stand only just proud of the
  // tyres, never look to lie in the same plane as them and flicker.
  const camper = createVehicle(camperVan());
  const parked = local(-0.6, island + 2.1);
  const quarter = Math.PI / 2;
  const heading = Math.round(headingOf(Math.cos(rotation), -Math.sin(rotation)) / quarter) * quarter;
  camper.root.position.set(parked.x, terrainHeight(parked.x, parked.z) + 0.06, parked.z);
  camper.root.rotation.y = heading;
  for (const along of camper.along)
    obstacles.push({ x: parked.x - Math.sin(heading) * along, z: parked.z - Math.cos(heading) * along, radius: 1.2 });
  return camper;
}

// --- Tumbleweed ------------------------------------------------------------------------------

/** A tumbleweed: a tangled ball of dry, springy twigs about a metre across. */
export function tumbleweedGeometry() {
  const parts = new PartsBuilder();
  const random = createRandom(3301);
  for (let k = 0; k < 5; k++) {
    parts.add(new THREE.TorusGeometry(0.48, 0.022, 3, 14), k % 2 ? '#b59b6c' : '#9e865c', {
      rx: random() * Math.PI,
      ry: random() * Math.PI,
      rz: random() * Math.PI,
    });
  }
  for (let k = 0; k < 9; k++) {
    const [u, v] = [random() * Math.PI * 2, Math.acos(random() * 2 - 1)];
    const end = new THREE.Vector3().setFromSphericalCoords(0.55, v, u);
    parts.beam(end.clone().multiplyScalar(-1), end, 0.025, '#a68e62');
  }
  return parts.geometry();
}

/** How many tumbleweeds roll across the sand at once, how fast, and how big they are. */
const TUMBLEWEEDS = 3;
const ROLL = 2.6;
const BALL = 0.55;
/** They roll this far across the desert before starting again from its upwind edge. */
const CROSSING = 110;
/** Places they roll round, and how far from each they keep. */
const KEEP_CLEAR = [
  { ...DESERT.oasis, clear: DESERT.oasis.radius + 9 },
  { ...DESERT.station, clear: 19 },
  { ...DESERT.windpump, clear: 6 },
  ...DESERT.houses.map(house => ({ ...house, clear: 7 })),
];

function createTumbleweeds(scene) {
  const random = createRandom(5503);
  const mesh = new THREE.InstancedMesh(tumbleweedGeometry(), vertexColorMaterial, TUMBLEWEEDS);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  // Where each starts, upwind of the middle and to one side or the other of the way the wind blows.
  const across = new THREE.Vector2(-WIND.y, WIND.x);
  const start = weed => {
    const side = (random() - 0.5) * 2 * 80;
    weed.x = DESERT.x - WIND.x * CROSSING + across.x * side;
    weed.z = DESERT.z - WIND.y * CROSSING + across.y * side;
    weed.travelled = 0;
    weed.lift = 0;
    weed.rise = 0;
  };
  const weeds = Array.from({ length: TUMBLEWEEDS }, (_, i) => {
    const weed = { spin: new THREE.Quaternion(), speed: ROLL * (0.8 + random() * 0.4), hop: random() * 3 };
    start(weed);
    // Spread out along the way, so they don't all come at once.
    weed.x += WIND.x * CROSSING * 0.6 * (i + 0.5);
    weed.z += WIND.y * CROSSING * 0.6 * (i + 0.5);
    weed.travelled = CROSSING * 0.6 * (i + 0.5);
    return weed;
  });
  // Rolling with the wind, it turns about the level line square across it.
  const axis = new THREE.Vector3(WIND.y, 0, -WIND.x).normalize();
  const turn = new THREE.Quaternion();
  const dummy = new THREE.Object3D();
  const place = (weed, i) => {
    dummy.position.set(weed.x, terrainHeight(weed.x, weed.z) + BALL * 0.92 + weed.lift, weed.z);
    dummy.quaternion.copy(weed.spin);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  weeds.forEach(place);
  return {
    mesh,
    update(dt, player) {
      const near = player && Math.hypot(player.x - DESERT.x, player.z - DESERT.z) < DESERT.edge + 150;
      mesh.visible = Boolean(near);
      if (!near) return;
      weeds.forEach((weed, i) => {
        // Gusts come and go, so they speed up and slow down.
        const gust = 0.6 + 0.6 * valueNoise(weed.travelled / 9, i * 7.3, 89);
        const step = weed.speed * gust * dt;
        let [x, z] = [weed.x + WIND.x * step, weed.z + WIND.y * step];
        // Round the buttes, the oasis and the buildings rather than through them.
        for (const butte of DESERT.buttes) {
          const out = Math.hypot((x - butte.x) / butte.rx, (z - butte.z) / butte.rz);
          if (out < 1.35) [x, z] = [butte.x + (x - butte.x) * (1.35 / out), butte.z + (z - butte.z) * (1.35 / out)];
        }
        for (const { x: px, z: pz, clear } of KEEP_CLEAR) {
          const out = Math.hypot(x - px, z - pz);
          if (out < clear) [x, z] = [px + ((x - px) * clear) / out, pz + ((z - pz) * clear) / out];
        }
        weed.x = x;
        weed.z = z;
        weed.travelled += step;
        // It bounces along, and hops right up over a car that comes close.
        weed.hop += dt * (2.4 + gust);
        if (player && Math.hypot(player.x - x, player.z - z) < 3 && weed.lift < 0.2) weed.rise = 4.2;
        weed.rise -= 9 * dt;
        weed.lift = Math.max(0, weed.lift + weed.rise * dt);
        if (weed.lift === 0) weed.rise = Math.max(weed.rise, 0) + (Math.sin(weed.hop) > 0.97 ? 2.4 : 0);
        weed.spin.premultiply(turn.setFromAxisAngle(axis, step / BALL));
        if (weed.travelled > CROSSING * 2) start(weed);
        place(weed, i);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// --- The desert ------------------------------------------------------------------------------

/** The reeds, the wind pump's wheel and the camper van are too small to make out from further off than this. */
const DETAIL_RANGE = 420;

export function buildDesert(scene, obstacles) {
  const parts = new PartsBuilder();
  // The windows and lamps, which light up at night.
  const glow = new PartsBuilder();
  const lit = new THREE.MeshLambertMaterial({ color: '#d7dcd6', emissive: '#ffd890', emissiveIntensity: 0 });
  const buttes = buildButtes(obstacles);
  scene.add(buttes.mesh);
  // The small things, which are only drawn from close enough to make them out.
  const details = new THREE.Group();
  scene.add(details);
  const reeds = buildOasis(scene, parts, obstacles);
  const wheel = windPump(parts, obstacles);
  details.add(reeds, wheel);
  DESERT.houses.forEach((house, i) =>
    adobeHouse(
      parts,
      glow,
      obstacles,
      house,
      i ? { width: 4.6, depth: 4, height: 2.7 } : { width: 6, depth: 4.6, height: 3.1 },
    ),
  );
  details.add(petrolStation(scene, parts, glow, obstacles).root);
  scene.add(parts.mesh(), glow.mesh({ material: lit, castShadow: false }));
  const tumbleweeds = createTumbleweeds(scene);

  let time = 0;
  return {
    occluders: buttes.occluders,
    update(dt, night, player) {
      time += dt;
      details.visible = !player || Math.hypot(player.x - DESERT.x, player.z - DESERT.z) < DETAIL_RANGE;
      // The wheel turns faster in the gusts.
      wheel.rotateZ(dt * (1.6 + Math.sin(time * 0.3) * 0.5));
      lit.emissiveIntensity = smoothstep(night, 0.3, 0.7) * 1.4;
      tumbleweeds.update(dt, player);
    },
  };
}
