// The oxbow in the hollow south of the trail: still water, clear at its edges so the gravel
// shows through and darker where it is deep, reeds and bulrushes along its banks and over its
// silted-up ends, water lilies on its quiet stretches, stones on the shore by the ford, and a
// plank footbridge across it a little way along from the ford.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom, lerp, smoothstep } from '../../core/math.js';
import { OXBOW, TRACKS } from '../layout.js';
import { OXBOW_LEVEL, terrainHeight } from '../terrain.js';
import { PartsBuilder, prism, vertexColorMaterial } from '../build.js';
import { boulderGeometry } from '../rocks.js';

const SHALLOW = new THREE.Color('#a3cfc6');
const DEEP = new THREE.Color('#5b989a');
const REEDS = ['#8c9f55', '#9aa95d', '#7f9450', '#b0ad66'];
const BULRUSH = '#6b472b';
const LILIES = ['#6f9a4a', '#7fa955', '#668f45'];
const PLANK = '#a07f58';
const TIMBER = '#6c5440';

/** Where the footbridge crosses, in metres along the oxbow. */
const BRIDGE_S = 29;

const track = TRACKS.find(t => t.id === 'oxbow').path;

/** True on or beside the ford, where nothing is put in the car's way. */
function byTheFord(x, z, clearance) {
  return track.isNear(x, z, clearance) && Math.hypot(x - OXBOW.ford.x, z - OXBOW.ford.z) < 24;
}

/**
 * The water's surface: a strip along the oxbow reaching a little way under its banks. Each
 * corner is coloured and made see-through by how deep the water is beneath it.
 */
function waterGeometry() {
  const across = 10;
  const color = new THREE.Color();
  const rows = OXBOW.path.samples.map(({ s }) => {
    const half = OXBOW.halfWidth(s) + 2.5;
    if (half < 1.5) return null;
    return Array.from({ length: across + 1 }, (_, j) => {
      const { x, z } = OXBOW.path.offset(s, ((j / across) * 2 - 1) * half);
      const deep = smoothstep(OXBOW_LEVEL - terrainHeight(x, z), 0.05, 0.65);
      color.copy(SHALLOW).lerp(DEEP, deep);
      return { position: [x, OXBOW_LEVEL, z], color: [color.r, color.g, color.b, lerp(0.3, 0.82, deep)] };
    });
  });
  const positions = [];
  const colors = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const [a, b] = [rows[i], rows[i + 1]];
    if (!a || !b) continue;
    for (let j = 0; j < across; j++) {
      for (const corner of [a[j], a[j + 1], b[j], a[j + 1], b[j + 1], b[j]]) {
        positions.push(...corner.position);
        colors.push(...corner.color);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  return geometry;
}

/** Reeds along both banks, thicker towards the ends, which are all reeds; the ford and the footbridge are left clear. */
function addReeds(parts, random) {
  // A leaf: a flat blade a metre tall with a face on both sides, and a stalk of two crossed.
  const [left, right, top] = [
    [-0.07, -0.5, 0],
    [0.07, -0.5, 0],
    [0, 0.5, 0],
  ];
  const leaf = [left, right, top, right, left, top];
  const blade = prism(leaf);
  const stalk = prism([...leaf, ...leaf.map(([x, y]) => [0, y, x])]);
  const head = new THREE.CylinderGeometry(0.075, 0.075, 0.4, 4);
  const clump = (x, z, size) => {
    for (let k = 7 + Math.floor(random() * 6); k > 0; k--) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * 0.65 * size;
      const height = (1.3 + random() * 0.9) * size;
      const at = { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
      // Each stem grows out of the bank where it stands, which slopes.
      const y = terrainHeight(at.x, at.z);
      if (random() < 0.3) {
        // A bulrush: a straight stalk with its brown head near the top.
        parts.add(stalk, REEDS[0], { ...at, y: y + height * 0.55, sy: height * 1.15, sx: 0.6, sz: 0.6 });
        parts.add(head, BULRUSH, { ...at, y: y + height * 0.95 });
      } else {
        const tilt = { rx: (random() - 0.5) * 0.3, rz: (random() - 0.5) * 0.3, ry: random() * 3 };
        parts.add(blade, REEDS[Math.floor(random() * REEDS.length)], {
          ...at,
          y: y + height / 2 - 0.1,
          sy: height,
          ...tilt,
        });
      }
    }
  };
  const { length } = OXBOW.path;
  for (let s = 1; s < length - 1; s += 0.9 + random() * 0.9) {
    const halfWidth = OXBOW.halfWidth(s);
    const ends = Math.min(s, length - s);
    if (halfWidth < 1) {
      // The silted-up ends: reeds all across.
      for (let k = 0; k < 2; k++) {
        const p = OXBOW.path.offset(s, (random() - 0.5) * 5);
        clump(p.x, p.z, 0.9 + random() * 0.4);
      }
      continue;
    }
    for (const side of [-1, 1]) {
      // Fewer on the near bank, so the water can be seen from the trail.
      const chance = (side > 0 ? 0.3 : 0.55) + 0.4 * (1 - smoothstep(ends, 8, 18));
      if (random() > chance || Math.abs(s - BRIDGE_S) < 2.5) continue;
      const p = OXBOW.path.offset(s, side * (halfWidth + (random() - 0.4) * 1.8));
      if (byTheFord(p.x, p.z, 7)) continue;
      clump(p.x, p.z, 0.8 + random() * 0.5);
    }
  }
}

/** A water lily's flower: two rings of pointed petals, the inner one standing up more, round a middle. */
function bloom() {
  const petals = [];
  for (const [count, reach, lift, turn] of [
    [8, 0.14, 0.03, 0],
    [6, 0.09, 0.08, 0.5],
  ]) {
    for (let k = 0; k < count; k++) {
      const a = turn + (k * Math.PI * 2) / count;
      const at = (angle, r, y) => [Math.cos(angle) * r, y, Math.sin(angle) * r];
      petals.push(at(a, 0.02, 0), at(a + 0.3, reach * 0.55, lift * 0.6), at(a, reach, lift));
      petals.push(at(a, 0.02, 0), at(a, reach, lift), at(a - 0.3, reach * 0.55, lift * 0.6));
    }
  }
  const middle = [0, 2.1, 4.2].map(a => [Math.cos(a) * 0.03, 0.045, Math.sin(a) * 0.03]);
  return { petals: prism(petals), middle: prism([middle[0], middle[2], middle[1]]) };
}

/** Water lilies in a few patches on the quieter water, away from the ford. */
function addLilies(parts, random) {
  const pad = new THREE.CircleGeometry(1, 9, 0.5, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2);
  const flower = bloom();
  for (const [s, side] of [
    [7, 0.6],
    [10.5, -2.4],
    [35, 2.6],
    [40, -1.4],
    [44.5, 1.2],
  ]) {
    for (let k = 4 + Math.floor(random() * 4); k > 0; k--) {
      const p = OXBOW.path.offset(s + (random() - 0.5) * 3.5, side + (random() - 0.5) * 2.4);
      if (OXBOW_LEVEL - terrainHeight(p.x, p.z) < 0.15 || byTheFord(p.x, p.z, 9)) continue;
      const r = 0.4 + random() * 0.35;
      const color = LILIES[Math.floor(random() * LILIES.length)];
      // Each pad in a patch a little higher than the next, so where they overlap they don't flicker.
      const y = OXBOW_LEVEL + 0.008 + k * 0.0025;
      parts.add(pad, color, { x: p.x, y, z: p.z, sx: r, sz: r, ry: random() * 6.3 });
      if (random() < 0.3) {
        const at = { x: p.x, y: y + 0.02, z: p.z, ry: r * 9 };
        parts.add(flower.petals, '#f3eee2', at).add(flower.middle, '#e8c24a', at);
      }
    }
  }
}

/**
 * Pebbles on the shore either side of the ford, off the wheel tracks, and a few bigger stones
 * further off. Returns their shapes, to be drawn with everything else.
 */
function stones(obstacles, random) {
  const shapes = [0, 1, 2, 3].map(seed => boulderGeometry(seed + 31, { moss: 0.2 }));
  const pebbles = [0, 1, 2, 3].map(seed => boulderGeometry(seed + 31, { moss: 0.2, detail: 0 }));
  const parts = [];
  const stone = (x, z, size) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, terrainHeight(x, z) - size * 0.15, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * 6.3, 0)),
      new THREE.Vector3(size, size * 0.6, size),
    );
    const shape = Math.floor(random() * shapes.length);
    parts.push((size < 0.4 ? pebbles : shapes)[shape].clone().applyMatrix4(matrix));
  };
  const { x, z, dx, dz } = OXBOW.ford;
  for (let k = 0; k < 60; k++) {
    // Across the oxbow at the ford, then to one side of the track.
    const t = (random() < 0.5 ? -1 : 1) * (5 + random() * 9);
    const side = (random() < 0.5 ? -1 : 1) * (1.7 + random() * 3);
    const px = x + dx * t - dz * side;
    const pz = z + dz * t + dx * side;
    if (track.isNear(px, pz, 1.6)) continue;
    stone(px, pz, 0.1 + random() ** 2 * 0.25);
  }
  for (const [s, side, size] of [
    [13, -8.2, 0.9],
    [15.5, -9.4, 0.5],
    [24, 9.8, 0.75],
    [33, -7.5, 0.6],
    [47, 6.2, 0.8],
  ]) {
    const p = OXBOW.path.offset(s, side);
    stone(p.x, p.z, size);
    if (size >= 0.5) obstacles.push({ x: p.x, z: p.z, radius: size * 0.9 });
  }
  return parts;
}

/** A footbridge of planks on posts, with a handrail each side. It stops the car, which can go round it. */
function addFootbridge(parts, obstacles) {
  const { x, z, dx, dz } = OXBOW.path.at(BRIDGE_S);
  // Along the bridge is across the oxbow.
  const [ax, az] = [-dz, dx];
  const half = OXBOW.halfWidth(BRIDGE_S) + 2.8;
  const at = t => ({ x: x + ax * t, z: z + az * t });
  const yaw = Math.atan2(ax, az);
  const deck = OXBOW_LEVEL + 0.55;
  for (let t = -half; t <= half; t += 0.34) {
    const p = at(t);
    parts.box(1.35, 0.07, 0.29, PLANK, { x: p.x, y: deck, z: p.z, ry: yaw + Math.sin(t * 7) * 0.02 });
  }
  for (const side of [-0.52, 0.52]) {
    const a = at(-half);
    const b = at(half);
    const offset = { x: -az * side, z: ax * side };
    parts.beam(
      { x: a.x + offset.x, y: deck - 0.12, z: a.z + offset.z },
      { x: b.x + offset.x, y: deck - 0.12, z: b.z + offset.z },
      0.12,
      TIMBER,
      0.16,
    );
  }
  for (const side of [-0.66, 0.66]) {
    const offset = (p, k = 1) => ({ x: p.x - az * side * k, z: p.z + ax * side * k });
    let previous = null;
    for (let t = -half + 0.3; t <= half; t += 2.3) {
      const p = offset(at(t));
      const ground = terrainHeight(p.x, p.z) - 0.3;
      const top = deck + 0.85;
      parts.box(0.12, top - ground, 0.12, TIMBER, { x: p.x, y: (top + ground) / 2, z: p.z, ry: yaw });
      const rail = { ...p, y: top };
      if (previous) parts.beam(previous, rail, 0.08, TIMBER, 0.1);
      previous = rail;
    }
  }
  const [a, b] = [at(-half + 0.5), at(half - 0.5)];
  obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 0.95 });
}

export function buildOxbow(scene, obstacles) {
  const random = createRandom(6427);
  const water = new THREE.Mesh(
    waterGeometry(),
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      emissive: '#285f63',
      emissiveIntensity: 0.3,
      transparent: true,
      depthWrite: false,
    }),
  );
  water.receiveShadow = true;
  scene.add(water);

  // Everything else is drawn as one.
  const parts = new PartsBuilder();
  addReeds(parts, random);
  addLilies(parts, random);
  addFootbridge(parts, obstacles);
  const mesh = new THREE.Mesh(mergeGeometries([parts.geometry(), ...stones(obstacles, random)]), vertexColorMaterial);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}
