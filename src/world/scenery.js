// The landscape itself: ground, trail, water, vegetation, distant peaks and the fence.
import * as THREE from 'three';
import { createRandom, fractalNoise, smoothstep } from '../core/math.js';
import {
  LAKE,
  ROAD,
  ROAD_HALF_WIDTH,
  CREEK,
  CREEK_HALF_WIDTH,
  CAMP_TRAIL,
  TRACKS,
  BRIDGE,
  TUNNEL,
  WATERFALL,
  CAMP,
  CABIN,
  LOOKOUT,
  FARM,
  TOWER,
  WINDMILL,
  JETTY,
  KNOLLS,
  SPAWN,
  VALLEY_RADIUS,
  HABITATS,
  SURFACES,
  YETI,
  lakeDistance,
} from './layout.js';
import { AXIS, GRID, heights, terrainHeight, naturalHeight, creekLevel, POOL } from './terrain.js';
import { PartsBuilder, flatMaterial, vertexColorMaterial, triangleGeometry } from './build.js';
import { boulderGeometry } from './rocks.js';

const random = createRandom(82741);

const GROUND = {
  meadow: new THREE.Color('#a5b383'),
  lush: new THREE.Color('#91a872'),
  dry: new THREE.Color('#c1be8b'),
  high: new THREE.Color('#939f87'),
  rock: new THREE.Color('#a39d8b'),
  shore: new THREE.Color('#d3caa0'),
  bank: new THREE.Color('#a9a78f'),
  snow: new THREE.Color('#eef1ea'),
  leaves: new THREE.Color('#bf8a4f'),
};

/** Colour of one ground triangle. `up` is the Y of its normal: 1 on flat ground. */
function groundColor(x, z, h, up, out) {
  out
    .copy(GROUND.meadow)
    .lerp(GROUND.dry, Math.min(1, 0.3 + 0.25 * Math.sin(x * 0.009 + z * 0.017) + Math.max(0, h - 15) * 0.012));
  // Patches of greener grass, so the meadows aren't one flat colour.
  out.lerp(GROUND.lush, smoothstep(fractalNoise(x / 70 + 4.1, z / 70 + 1.7, 2, 31), 0.5, 0.72) * 0.8);
  if (h > 45) out.lerp(GROUND.high, Math.min(1, (h - 45) / 80));
  // Bare rock and scree where the ground is steep.
  out.lerp(GROUND.rock, smoothstep(up, 0.86, 0.7) * 0.85);
  if (lakeDistance(x, z) < 2.2) out.lerp(GROUND.shore, 1 - smoothstep(h, LAKE.level + 0.35, LAKE.level + 0.9));
  if (x > 135 && x < 245 && z > -85 && z < -30) {
    const creek = CREEK.nearest(x, z);
    if (creek.distance < 9) out.lerp(GROUND.bank, 1 - smoothstep(creek.distance, 5, 9));
  }
  for (const patch of SURFACES) {
    const d = Math.hypot((x - patch.x) / patch.rx, (z - patch.z) / patch.rz) + (random() - 0.5) * 0.12;
    if (d < 1 && patch.id === 'snow') out.copy(GROUND.snow);
    if (d < 1 && patch.id === 'leaves') out.lerp(GROUND.leaves, 0.75);
  }
  return out.multiplyScalar(0.96 + random() * 0.08);
}

function buildGround() {
  const cells = GRID - 1;
  const positions = new Float32Array(cells * cells * 18);
  const colors = new Float32Array(cells * cells * 18);
  const color = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let p = 0;
  const vertex = (ix, iz) => {
    positions[p] = AXIS[ix];
    positions[p + 1] = heights[iz * GRID + ix];
    positions[p + 2] = AXIS[iz];
    p += 3;
  };
  for (let iz = 0; iz < cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      // Two triangles per cell, split along the same diagonal as terrainHeight().
      for (const triangle of [
        [
          [ix, iz],
          [ix, iz + 1],
          [ix + 1, iz],
        ],
        [
          [ix + 1, iz],
          [ix, iz + 1],
          [ix + 1, iz + 1],
        ],
      ]) {
        const start = p;
        for (const [vx, vz] of triangle) vertex(vx, vz);
        const cx = (positions[start] + positions[start + 3] + positions[start + 6]) / 3;
        const cy = (positions[start + 1] + positions[start + 4] + positions[start + 7]) / 3;
        const cz = (positions[start + 2] + positions[start + 5] + positions[start + 8]) / 3;
        a.fromArray(positions, start);
        b.fromArray(positions, start + 3).sub(a);
        c.fromArray(positions, start + 6).sub(a);
        const up = Math.abs(c.cross(b).normalize().y);
        groundColor(cx, cz, cy, up, color);
        for (let k = 0; k < 3; k++) colors.set([color.r, color.g, color.b], start + k * 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, vertexColorMaterial);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

const SNOW = SURFACES.find(patch => patch.id === 'snow');
const PACKED_SNOW = new THREE.Color('#e3e8e4');

/**
 * A strip draped over the ground along a path, optionally offset sideways or
 * skipping a stretch. Where it crosses the snowfield it is snowed over too.
 */
function ribbon(path, halfWidth, color, { lift = 0.06, offset = 0, skip = () => false } = {}) {
  const base = new THREE.Color(color);
  const tint = new THREE.Color();
  const across = 4;
  const rows = [];
  for (const sample of path.samples) {
    if (skip(sample.s)) {
      rows.push(null);
      continue;
    }
    const row = [];
    for (let j = 0; j <= across; j++) {
      const side = offset + ((j / across) * 2 - 1) * halfWidth;
      const x = sample.x - sample.dz * side;
      const z = sample.z + sample.dx * side;
      const snow = 1 - smoothstep(Math.hypot((x - SNOW.x) / SNOW.rx, (z - SNOW.z) / SNOW.rz), 0.78, 1);
      row.push({
        position: [x, terrainHeight(x, z) + lift, z],
        color: tint.copy(base).lerp(PACKED_SNOW, snow).toArray(),
      });
    }
    rows.push(row);
  }
  const positions = [];
  const colors = [];
  const count = path.closed ? rows.length : rows.length - 1;
  for (let i = 0; i < count; i++) {
    const a = rows[i];
    const b = rows[(i + 1) % rows.length];
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
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = flatMaterial('#ffffff', {
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function onBridge(s) {
  const delta = Math.abs(ROAD.wrap(s - BRIDGE.s + ROAD.length / 2) - ROAD.length / 2);
  return delta < BRIDGE.length / 2 - 0.6;
}

function buildWater(scene) {
  const lakeMaterial = flatMaterial('#6fa8a6', { emissive: '#1d4c50', emissiveIntensity: 0.25 });
  const lakeGeometry = new THREE.CircleGeometry(1, 72);
  lakeGeometry.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lakeGeometry, lakeMaterial);
  // Big enough to reach the shore everywhere; the ground hides the rest.
  lake.scale.set(LAKE.rx * 2.05, 1, LAKE.rz * 2.05);
  lake.position.set(LAKE.x, LAKE.level, LAKE.z);
  lake.receiveShadow = true;
  scene.add(lake);

  // The creek: a ribbon of water following the bed, stopping where it meets the lake.
  const creekMaterial = flatMaterial('#86bfc0', { emissive: '#285f63', emissiveIntensity: 0.3 });
  const halfWidth = CREEK_HALF_WIDTH + 1.7;
  const positions = [];
  let previous = null;
  for (const sample of CREEK.samples) {
    const level = creekLevel(sample.s);
    if (level < LAKE.level) break;
    const left = [sample.x + sample.dz * halfWidth, level, sample.z - sample.dx * halfWidth];
    const right = [sample.x - sample.dz * halfWidth, level, sample.z + sample.dx * halfWidth];
    if (previous) positions.push(...previous[0], ...previous[1], ...left, ...previous[1], ...right, ...left);
    previous = [left, right];
  }
  const creekGeometry = new THREE.BufferGeometry();
  creekGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  creekGeometry.computeVertexNormals();
  const creek = new THREE.Mesh(creekGeometry, creekMaterial);
  creek.receiveShadow = true;
  scene.add(creek);

  const poolGeometry = new THREE.CircleGeometry(WATERFALL.poolRadius + 2.5, 28);
  poolGeometry.rotateX(-Math.PI / 2);
  const pool = new THREE.Mesh(poolGeometry, creekMaterial);
  pool.position.set(POOL.x, POOL.level, POOL.z);
  scene.add(pool);

  // Flecks of foam drifting downstream and gentle glints on the lake.
  const foamCount = 46;
  const foam = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.6, 0.1),
    new THREE.MeshBasicMaterial({ color: '#e4f3ee', transparent: true, opacity: 0.55 }),
    foamCount,
  );
  const foamSeeds = Array.from({ length: foamCount }, () => ({
    offset: random(),
    side: (random() - 0.5) * 2.6,
    speed: 0.025 + random() * 0.02,
  }));
  foam.frustumCulled = false;
  scene.add(foam);

  // Glints on the lake: one instanced mesh, gently stretching.
  const glints = [];
  for (let i = 0; i < 28; i++) {
    const x = LAKE.x + (random() - 0.5) * LAKE.rx * 1.8;
    const z = LAKE.z + (random() - 0.5) * LAKE.rz * 1.8;
    if (lakeDistance(x, z) <= 0.85) glints.push({ x, z, length: 2 + random() * 7, width: 0.12 + random() * 0.12 });
  }
  const glintMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#c3dccf', transparent: true, opacity: 0.35 }),
    glints.length,
  );
  glintMesh.frustumCulled = false;
  scene.add(glintMesh);

  const dummy = new THREE.Object3D();
  let time = 0;
  return {
    update(dt) {
      time += dt;
      glints.forEach((glint, i) => {
        dummy.position.set(glint.x, LAKE.level + 0.04, glint.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(glint.length * (1 + Math.sin(time * 0.35 + i) * 0.14), 1, glint.width);
        dummy.updateMatrix();
        glintMesh.setMatrixAt(i, dummy.matrix);
      });
      glintMesh.instanceMatrix.needsUpdate = true;
      const usable = CREEK.length * 0.72;
      foamSeeds.forEach((seed, i) => {
        const s = ((seed.offset + time * seed.speed) % 1) * usable;
        const p = CREEK.offset(s, seed.side);
        dummy.position.set(p.x, creekLevel(s) + 0.03, p.z);
        dummy.rotation.set(-Math.PI / 2, 0, Math.atan2(p.dx, p.dz) + Math.PI / 2);
        dummy.updateMatrix();
        foam.setMatrixAt(i, dummy.matrix);
      });
      foam.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Circles kept clear of trees and rocks. */
const CLEARINGS = [
  { x: SPAWN.x, z: SPAWN.z, r: 16 },
  { x: CAMP.x, z: CAMP.z, r: 24 },
  { x: CABIN.x, z: CABIN.z, r: 14 },
  { x: LOOKOUT.x, z: LOOKOUT.z, r: 26 },
  { x: TUNNEL.x, z: TUNNEL.z, r: 34 },
  { x: BRIDGE.x, z: BRIDGE.z, r: 18 },
  { x: WATERFALL.x, z: WATERFALL.z, r: 26 },
  { x: FARM.x, z: FARM.z, r: 40 },
  { x: TOWER.x, z: TOWER.z, r: 14 },
  { x: WINDMILL.x, z: WINDMILL.z, r: 20 },
  { x: JETTY.x - 4, z: JETTY.z, r: 16 },
  { x: HABITATS.sheep.x, z: HABITATS.sheep.z, r: 18 },
  { x: HABITATS.burrow.x, z: HABITATS.burrow.z, r: 10 },
  { x: YETI.x, z: YETI.z, r: 10 },
  ...SURFACES.map(p => ({ x: p.x, z: p.z, r: Math.max(p.rx, p.rz) + 4 })),
];

function nearWalkway({ start, end }, x, z, clearance) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - start.x - dx * t, z - start.z - dz * t) < clearance;
}

function isClearGround(x, z, { road = 9 } = {}) {
  const r = Math.hypot(x, z);
  if (Math.abs(r - VALLEY_RADIUS - 1.8) < 4) return false;
  if (lakeDistance(x, z) < 2.2 && terrainHeight(x, z) < LAKE.level + 0.8) return false;
  if (CLEARINGS.some(c => Math.hypot(x - c.x, z - c.z) < c.r)) return false;
  if (nearWalkway(HABITATS.deer, x, z, 5) || nearWalkway(HABITATS.ducks, x, z, 5)) return false;
  if (r < 400 && ROAD.nearest(x, z).distance < road) return false;
  if (CAMP_TRAIL.nearest(x, z).distance < 6) return false;
  if (TRACKS.some(track => track.path.nearest(x, z).distance < 5)) return false;
  if (x > 130 && x < 250 && z > -90 && z < -20 && CREEK.nearest(x, z).distance < 10) return false;
  return true;
}

/** Rise over run of the ground at a point. */
function steepness(x, z) {
  const h = terrainHeight(x, z);
  return Math.hypot(terrainHeight(x + 1, z) - h, terrainHeight(x, z + 1) - h);
}

function pineGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.19, 0.28, 3, 5), '#7a6d52', { y: 1.5 });
  [
    [2.2, 5.5, 4],
    [1.75, 4.7, 5.8],
    [1.25, 3.6, 7.6],
  ].forEach(([radius, height, y]) => {
    parts.add(new THREE.ConeGeometry(radius, height, 6), '#6f8a5e', { y, ry: y });
  });
  return parts.geometry();
}

function roundTreeGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.2, 0.3, 3.4, 5), '#7a6d52', { y: 1.7 });
  parts.add(new THREE.IcosahedronGeometry(2.4, 0), '#8c9c62', { y: 4.6, sy: 1.15 });
  parts.add(new THREE.IcosahedronGeometry(1.6, 0), '#8c9c62', { x: 0.9, y: 5.8, z: 0.4 });
  return parts.geometry();
}

function birchGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.13, 0.18, 5.2, 5), '#ece8dc', { y: 2.6 });
  for (const [y, ry] of [
    [1.2, 0],
    [2.3, 2],
    [3.4, 4],
  ]) {
    parts.box(0.2, 0.09, 0.2, '#3f4440', { y, ry });
  }
  parts.add(new THREE.IcosahedronGeometry(1.5, 0), '#b4c271', { y: 5.4, sy: 1.5 });
  parts.add(new THREE.IcosahedronGeometry(1.05, 0), '#a9bb66', { x: 0.7, y: 4.4, z: -0.3, sy: 1.3 });
  parts.add(new THREE.IcosahedronGeometry(0.9, 0), '#b4c271', { x: -0.6, y: 6.6, z: 0.3 });
  return parts.geometry();
}

function bushGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.IcosahedronGeometry(0.9, 0), '#7f965d', { y: 0.55, sy: 0.75 });
  parts.add(new THREE.IcosahedronGeometry(0.65, 0), '#89a064', { x: 0.75, y: 0.45, z: 0.2, sy: 0.8 });
  parts.add(new THREE.IcosahedronGeometry(0.55, 0), '#768d55', { x: -0.6, y: 0.4, z: -0.3, sy: 0.8 });
  return parts.geometry();
}

function stumpGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.42, 0.55, 0.7, 7), '#80694b', { y: 0.3 });
  parts.add(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 7), '#c9ad7c', { y: 0.66 });
  return parts.geometry();
}

function logGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.33, 0.38, 4.2, 7), '#7d6346', { y: 0.32, rz: Math.PI / 2 });
  for (const x of [-2.1, 2.1])
    parts.add(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 7), '#c6aa78', { x, y: 0.32, rz: Math.PI / 2 });
  parts.box(0.12, 0.7, 0.12, '#7d6346', { x: 0.6, y: 0.75, rz: -0.5 });
  return parts.geometry();
}

/**
 * Places a list of { x, z, scale, rotation, tilt?, sx?, sy? } as instanced meshes:
 * one per quarter of the valley, so whole quarters can be skipped when out of
 * view, and one for everything beyond the fence, which never casts shadows.
 */
function instanced(scene, geometry, items, options = {}) {
  const groups = new Map();
  for (const item of items) {
    const key =
      Math.hypot(item.x, item.z) > VALLEY_RADIUS + 25 ? 'far' : `${Math.sign(item.x) || 1},${Math.sign(item.z) || 1}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const [key, group] of groups) {
    instancedGroup(scene, geometry, group, { ...options, shadows: key !== 'far' && options.shadows !== false });
  }
}

function instancedGroup(scene, geometry, items, { shadows = true, sink = 0.2, tint } = {}) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const mesh = new THREE.InstancedMesh(geometry, vertexColorMaterial, items.length);
  items.forEach((item, i) => {
    dummy.position.set(item.x, terrainHeight(item.x, item.z) - sink * item.scale, item.z);
    dummy.rotation.set(item.tilt ?? 0, item.rotation, 0);
    dummy.scale.set(item.scale * (item.sx ?? 1), item.scale * (item.sy ?? 1), item.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (tint) mesh.setColorAt(i, tint(item, color));
  });
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
}

function buildTrees(scene, obstacles) {
  const pines = [];
  const rounds = [];
  const birches = [];
  const bushes = [];
  for (let i = 0; i < 3400; i++) {
    const x = (random() - 0.5) * 1000;
    const z = (random() - 0.5) * 1000;
    const r = Math.hypot(x, z);
    if (r > 490 || !isClearGround(x, z)) continue;
    // Dense woods in some places, open meadows in others.
    const woods = smoothstep(fractalNoise(x / 150 + 3.3, z / 150 + 8.1, 2, 5), 0.36, 0.6);
    if (random() > 0.1 + woods * 0.9) continue;
    const tree = { x, z, scale: 0.65 + random() * 1.0, rotation: random() * Math.PI * 2 };
    const height = terrainHeight(x, z);
    const roll = random();
    if (r > 300 || height > 45) pines.push(tree);
    else if (roll < 0.16) rounds.push(tree);
    else if (roll < 0.3) birches.push({ ...tree, scale: 0.8 + random() * 0.5 });
    else pines.push(tree);
    // A few bushes at the edge of the woods.
    if (r < VALLEY_RADIUS - 6 && random() < 0.35) {
      const a = random() * Math.PI * 2;
      const bush = { x: x + Math.cos(a) * 4, z: z + Math.sin(a) * 4, scale: 0.7 + random() * 0.7, rotation: a };
      if (isClearGround(bush.x, bush.z, { road: 6 })) bushes.push(bush);
    }
  }
  // Lone trees on top of the open knolls.
  for (const knoll of KNOLLS.slice(1)) rounds.push({ x: knoll.x, z: knoll.z, scale: 1.7, rotation: knoll.x });

  const leafy = (hue, spread) => (_, color) =>
    color.setHSL(hue + random() * spread, 0.25 + random() * 0.25, 0.75 + random() * 0.3);
  instanced(scene, pineGeometry(), pines, { tint: leafy(0.22, 0.06) });
  instanced(scene, roundTreeGeometry(), rounds, { tint: leafy(0.16, 0.06) });
  instanced(scene, birchGeometry(), birches, { tint: leafy(0.15, 0.05) });
  instanced(scene, bushGeometry(), bushes, { sink: 0.1, shadows: false, tint: leafy(0.2, 0.08) });
  for (const tree of [...pines, ...rounds, ...birches]) {
    if (Math.hypot(tree.x, tree.z) < VALLEY_RADIUS + 5)
      obstacles.push({ x: tree.x, z: tree.z, radius: 0.3 * tree.scale });
  }

  // Stumps and fallen logs in the woods.
  const stumps = [];
  const logs = [];
  for (const tree of pines.slice(0, 900)) {
    if (random() > 0.06 || Math.hypot(tree.x, tree.z) > VALLEY_RADIUS - 8) continue;
    const a = random() * Math.PI * 2;
    const spot = { x: tree.x + Math.cos(a) * 5, z: tree.z + Math.sin(a) * 5, scale: 0.8 + random() * 0.5, rotation: a };
    if (!isClearGround(spot.x, spot.z, { road: 7 }) || steepness(spot.x, spot.z) > 0.35) continue;
    (random() < 0.5 ? stumps : logs).push(spot);
  }
  instanced(scene, stumpGeometry(), stumps, { sink: 0.05 });
  instanced(scene, logGeometry(), logs, { sink: 0.08 });
  for (const item of stumps) obstacles.push({ x: item.x, z: item.z, radius: 0.5 * item.scale });
  for (const item of logs) {
    const half = 2.1 * item.scale;
    const dx = Math.cos(item.rotation) * half;
    const dz = -Math.sin(item.rotation) * half;
    obstacles.push({ ax: item.x - dx, az: item.z - dz, bx: item.x + dx, bz: item.z + dz, radius: 0.36 * item.scale });
  }
}

function buildRocks(scene, obstacles) {
  const shapes = [0, 1, 2, 3, 4].map(seed => boulderGeometry(seed));
  const lists = shapes.map(() => []);
  const add = rock => lists[Math.floor(random() * shapes.length)].push(rock);

  // Boulders scattered across the valley, often with a few smaller stones beside them.
  for (let i = 0; i < 170; i++) {
    const x = (random() - 0.5) * 720;
    const z = (random() - 0.5) * 720;
    if (!isClearGround(x, z, { road: 8 })) continue;
    const size = 0.6 + random() ** 2 * 2.4;
    add({ x, z, size, rotation: random() * 6.3, tilt: (random() - 0.5) * 0.3 });
    for (let k = Math.floor(random() * 3); k > 0; k--) {
      const a = random() * Math.PI * 2;
      const d = size * (1.2 + random() * 0.8);
      const stone = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, size: size * (0.25 + random() * 0.3) };
      if (isClearGround(stone.x, stone.z, { road: 7 }))
        add({ ...stone, rotation: random() * 6.3, tilt: random() * 0.4 });
    }
  }
  // Outcrops on steep ground, mostly up in the northern crags.
  let outcrops = 0;
  for (let i = 0; i < 3000 && outcrops < 110; i++) {
    const x = (random() - 0.5) * 900;
    const z = (random() - 0.5) * 900;
    if (Math.hypot(x, z) > 470 || steepness(x, z) < 0.55 || !isClearGround(x, z, { road: 10 })) continue;
    add({ x, z, size: 1.6 + random() * 2.6, rotation: random() * 6.3, tilt: (random() - 0.5) * 0.4, tall: 1.4 });
    outcrops++;
  }

  lists.forEach((list, shape) => {
    const items = list.map(rock => ({
      x: rock.x,
      z: rock.z,
      scale: rock.size,
      rotation: rock.rotation,
      tilt: rock.tilt,
      sx: 1.25,
      sy: rock.tall ?? 1,
    }));
    instanced(scene, shapes[shape], items, {
      sink: 0.18,
      tint: (_, color) => color.setScalar(0.92 + random() * 0.14),
    });
    for (const rock of list) {
      if (rock.size > 0.9) obstacles.push({ x: rock.x, z: rock.z, radius: rock.size * 1.05 });
    }
  });
}

/** Wildflowers and grass tufts: tiny, numerous and shadowless. */
function buildGroundCover(scene) {
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const flowerColors = ['#f3efdf', '#e9c75a', '#b49ac8', '#dd8f6e', '#8fa56a', '#8fa56a', '#8fa56a'];
  const flowers = [];
  const tufts = [];
  for (let i = 0; i < 9000 && flowers.length < 2600; i++) {
    const x = (random() - 0.5) * 640;
    const z = (random() - 0.5) * 640;
    if (Math.hypot(x, z) > VALLEY_RADIUS - 4 || !isClearGround(x, z, { road: 6 })) continue;
    // Flowers gather in drifts; tufts of long grass grow everywhere else.
    const drift = fractalNoise(x / 40 + 2, z / 40 + 6, 2, 17);
    if (drift > 0.55) flowers.push({ x, z, color: flowerColors[Math.floor(random() * flowerColors.length)] });
    else if (random() < 0.5) tufts.push({ x, z });
  }
  const flowerMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.16, 0.5, 4),
    flatMaterial('#ffffff'),
    flowers.length,
  );
  flowers.forEach((flower, i) => {
    dummy.position.set(flower.x, terrainHeight(flower.x, flower.z) + 0.2, flower.z);
    dummy.rotation.set(0, random() * 3, 0);
    dummy.scale.setScalar(0.7 + random() * 0.8);
    dummy.updateMatrix();
    flowerMesh.setMatrixAt(i, dummy.matrix);
    flowerMesh.setColorAt(i, tint.set(flower.color));
  });
  scene.add(flowerMesh);

  const blades = new PartsBuilder();
  for (let k = 0; k < 3; k++) {
    blades.add(new THREE.ConeGeometry(0.07, 0.75, 3, 1, true), '#ffffff', {
      x: Math.cos(k * 1.7) * 0.14,
      y: 0.3,
      z: Math.sin(k * 1.7) * 0.14,
      rz: (k - 1) * 0.2,
    });
  }
  const tuftMesh = new THREE.InstancedMesh(
    blades.geometry(),
    flatMaterial('#ffffff', { vertexColors: true }),
    tufts.length,
  );
  tufts.forEach((tuft, i) => {
    dummy.position.set(tuft.x, terrainHeight(tuft.x, tuft.z), tuft.z);
    dummy.rotation.set(0, random() * 6.3, 0);
    dummy.scale.setScalar(0.8 + random() * 0.7);
    dummy.updateMatrix();
    tuftMesh.setMatrixAt(i, dummy.matrix);
    tuftMesh.setColorAt(i, tint.setHSL(0.2 + random() * 0.05, 0.3, 0.42 + random() * 0.12));
  });
  scene.add(tuftMesh);
}

/** A ring of snow-capped peaks beyond the fence, merged into one mesh. */
function buildPeaks(scene) {
  const positions = [];
  const colors = [];
  const snow = new THREE.Color('#e6e8da');
  const rock = new THREE.Color();
  const color = new THREE.Color();
  const tones = ['#8caaa3', '#97aaa8', '#9eafb0', '#899e99'];
  for (let m = 0; m < 26; m++) {
    const angle = (m / 26) * Math.PI * 2;
    const distance = 500 + random() * 155;
    const cx = Math.sin(angle) * distance;
    const cz = Math.cos(angle) * distance;
    const radius = 95 + random() * 100;
    const height = 115 + random() * 135;
    const base = naturalHeight(cx, cz) - 18;
    rock.set(tones[m % 4]);
    const sides = 11;
    const rings = 6;
    const jitter = Array.from({ length: sides }, () => 0.8 + random() * 0.4);
    const points = [];
    for (let j = 0; j <= rings; j++) {
      const f = j / rings;
      const rr = radius * (1 - f);
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const wobble = j > 0 && j < rings ? (random() - 0.5) * height * 0.12 : 0;
        points.push([
          cx + Math.cos(a) * rr * jitter[k] + f * radius * 0.13,
          base + height * f + wobble,
          cz + Math.sin(a) * rr * jitter[k],
        ]);
      }
    }
    const triangle = (a, b, c) => {
      positions.push(...points[a], ...points[b], ...points[c]);
      const f = ((points[a][1] + points[b][1] + points[c][1]) / 3 - base) / height;
      color.copy(f > 0.64 ? snow : rock).multiplyScalar(0.9 + random() * 0.16);
      for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
    };
    for (let j = 0; j < rings; j++) {
      for (let k = 0; k < sides; k++) {
        const a = j * sides + k;
        const b = j * sides + ((k + 1) % sides);
        triangle(a, a + sides, b);
        if (j < rings - 1) triangle(b, a + sides, b + sides);
      }
    }
  }
  scene.add(new THREE.Mesh(triangleGeometry(positions, colors), vertexColorMaterial));
}

/** Split-rail fence around the valley and low posts beside the trail. */
function buildFences(scene) {
  const radius = VALLEY_RADIUS + 1.8;
  const count = Math.ceil((2 * Math.PI * radius) / 6);
  const points = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const x = Math.sin(a) * radius;
    const z = Math.cos(a) * radius;
    return { x, z, y: terrainHeight(x, z) };
  });
  const material = flatMaterial('#8d886b');
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 2.2, 0.24), material, count);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.15, 1), material, count * 2);
  const dummy = new THREE.Object3D();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  points.forEach((p, i) => {
    const next = points[(i + 1) % count];
    dummy.position.set(p.x, p.y + 0.55, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
    [0.65, 1.3].forEach((height, level) => {
      a.set(p.x, p.y + height, p.z);
      b.set(next.x, next.y + height, next.z);
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.lookAt(b);
      dummy.scale.set(1, 1, a.distanceTo(b));
      dummy.updateMatrix();
      rails.setMatrixAt(i * 2 + level, dummy.matrix);
    });
  });
  for (const mesh of [posts, rails]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const trailPosts = new PartsBuilder();
  for (let i = 0; i < 44; i++) {
    const s = (i / 44) * ROAD.length;
    if (onBridge(s) || Math.abs(ROAD.wrap(s - TUNNEL.s + ROAD.length / 2) - ROAD.length / 2) < TUNNEL.length / 2 + 4)
      continue;
    const side = i % 2 ? 1 : -1;
    const p = ROAD.offset(s, side * (ROAD_HALF_WIDTH + 1.8));
    const y = terrainHeight(p.x, p.z);
    trailPosts.box(0.22, 1.5, 0.22, '#a3956f', { x: p.x, y: y + 0.35, z: p.z, ry: i });
  }
  scene.add(trailPosts.mesh());
}

export function buildScenery(scene) {
  const obstacles = [];
  scene.add(buildGround());
  scene.add(ribbon(ROAD, ROAD_HALF_WIDTH, '#cfc29c', { skip: onBridge }));
  scene.add(ribbon(CAMP_TRAIL, 2.1, '#c7b994', { lift: 0.05 }));
  for (const track of TRACKS) {
    if (track.ruts) {
      for (const offset of [-0.85, 0.85]) scene.add(ribbon(track.path, 0.32, '#b3a078', { lift: 0.05, offset }));
    } else {
      scene.add(ribbon(track.path, 0.8, '#cdbf96', { lift: 0.05 }));
    }
  }
  const water = buildWater(scene);
  buildTrees(scene, obstacles);
  buildRocks(scene, obstacles);
  buildGroundCover(scene);
  buildPeaks(scene);
  buildFences(scene);
  return { obstacles, update: dt => water.update(dt) };
}
