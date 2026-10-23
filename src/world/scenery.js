// The landscape itself: ground, trail, water, vegetation, distant peaks and the fence.
import * as THREE from 'three';
import { createRandom, fractalNoise, lerp, smoothstep, valueNoise } from '../core/math.js';
import {
  LAKE,
  ROAD,
  ROAD_HALF_WIDTH,
  CREEK,
  CREEK_HALF_WIDTH,
  CAMP_TRAIL,
  TRACKS,
  RAILWAY,
  HALT,
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
  ROADWORKS,
  HELIPAD,
  CHAPEL,
  SUMMIT,
  FIELDS,
  FARMSTEAD,
  KNOLLS,
  SPAWN,
  VALLEY_RADIUS,
  UPLANDS_RADIUS,
  HABITATS,
  SURFACES,
  YETI,
  GNOMES,
  RING_ROAD,
  LINKS,
  AIRFIELD,
  PAVED,
  onAirfield,
  onPaved,
  lakeDistance,
} from './layout.js';
import { terrainHeight, naturalHeight, creekLevel, snowCover, POOL } from './terrain.js';
import { PartsBuilder, flatMaterial, freeze, prism, tintable } from './build.js';
import { SWAY, foliageMaterial, groundMaterial } from './detail.js';
import { createGround } from './ground.js';
import { boulderGeometry } from './rocks.js';
import { createScatter } from './scatter.js';

const random = createRandom(82741);

const GROUND = {
  meadow: new THREE.Color('#9db266'),
  lush: new THREE.Color('#7fa458'),
  dry: new THREE.Color('#c9b96f'),
  high: new THREE.Color('#7f9262'),
  rock: new THREE.Color('#9a968c'),
  alpine: new THREE.Color('#a8a596'),
  shore: new THREE.Color('#d8c996'),
  bank: new THREE.Color('#a6a387'),
  snow: new THREE.Color('#eef1ea'),
  leaves: new THREE.Color('#c4873f'),
};

/** Colour of the ground at a grid point. `up` is the Y of its normal: 1 on flat ground. */
function groundColor(x, z, h, up, out) {
  out
    .copy(GROUND.meadow)
    .lerp(GROUND.dry, Math.min(1, 0.3 + 0.25 * Math.sin(x * 0.009 + z * 0.017) + Math.max(0, h - 15) * 0.006));
  // Patches of greener grass, so the meadows aren't one flat colour.
  out.lerp(GROUND.lush, smoothstep(fractalNoise(x / 70 + 4.1, z / 70 + 1.7, 2, 31), 0.5, 0.72) * 0.8);
  if (h > 45) out.lerp(GROUND.high, Math.min(1, (h - 45) / 80));
  // Bare rock and scree where the ground is steep.
  out.lerp(GROUND.rock, smoothstep(up, 0.86, 0.7) * 0.85);
  // High up, the grass gives way to stony ground and then snow, which doesn't settle on cliffs.
  out.lerp(GROUND.alpine, smoothstep(h, 86, 108) * 0.75);
  if (h > 90) out.lerp(GROUND.snow, snowCover(x, z, h) * smoothstep(up, 0.6, 0.78));
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

/** Which way the ground faces at a point, from the slope around it. */
function groundNormal(x, z) {
  const dx = (terrainHeight(x + 1, z) - terrainHeight(x - 1, z)) / 2;
  const dz = (terrainHeight(x, z + 1) - terrainHeight(x, z - 1)) / 2;
  return new THREE.Vector3(-dx, 1, -dz).normalize().toArray();
}

const SNOW = SURFACES.find(patch => patch.id === 'snow');
const PACKED_SNOW = new THREE.Color('#e3e8e4');

/**
 * A strip draped over the ground along a path, optionally offset sideways or
 * skipping a stretch. Where it crosses snow it is snowed over too.
 */
export function ribbon(path, halfWidth, color, { lift = 0.06, offset = 0, skip = () => false, across = 4 } = {}) {
  const base = new THREE.Color(color);
  const tint = new THREE.Color();
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
      const patch = 1 - smoothstep(Math.hypot((x - SNOW.x) / SNOW.rx, (z - SNOW.z) / SNOW.rz), 0.78, 1);
      const snow = Math.max(patch, snowCover(x, z));
      row.push({
        position: [x, terrainHeight(x, z) + lift, z],
        normal: groundNormal(x, z),
        color: tint.copy(base).lerp(PACKED_SNOW, snow).toArray(),
      });
    }
    rows.push(row);
  }
  const positions = [];
  const normals = [];
  const colors = [];
  const count = path.closed ? rows.length : rows.length - 1;
  for (let i = 0; i < count; i++) {
    const a = rows[i];
    const b = rows[(i + 1) % rows.length];
    if (!a || !b) continue;
    for (let j = 0; j < across; j++) {
      for (const corner of [a[j], a[j + 1], b[j], a[j + 1], b[j + 1], b[j]]) {
        positions.push(...corner.position);
        normals.push(...corner.normal);
        colors.push(...corner.color);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Shaded like the ground beneath it, so it doesn't show its facets where the ground doesn't.
  const material = groundMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function inTunnel(s) {
  return Math.abs(ROAD.wrap(s - TUNNEL.s + ROAD.length / 2) - ROAD.length / 2) < TUNNEL.length / 2 + 4;
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

/** How far away flowers and grass can still be made out. */
const DETAIL_RANGE = 170;
/** Bushes, stumps and logs are a little bigger. */
const UNDERGROWTH_RANGE = 250;
/** Beyond this, rocks are all drawn with one simpler shape. */
const ROCK_DETAIL = 300;
/** The fence beyond this is thinner than a pixel. */
const FENCE_RANGE = 450;

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
  { ...RAILWAY.at((HALT.from + HALT.to) / 2), r: 24 },
  { x: ROADWORKS.site.x, z: ROADWORKS.site.z, r: 32 },
  { x: HELIPAD.x, z: HELIPAD.z, r: 20 },
  { x: CHAPEL.x, z: CHAPEL.z, r: 9 },
  { x: SUMMIT.x, z: SUMMIT.z, r: 16 },
  { x: FARMSTEAD.x, z: FARMSTEAD.z, r: 22 },
  { x: FIELDS.x, z: FIELDS.z, r: FIELDS.radius },
  { ...AIRFIELD.hangar, r: 22 },
  { ...AIRFIELD.tower, r: 12 },
  ...GNOMES.map(gnome => ({ ...gnome, r: 4 })),
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
  if (ROAD.isNear(x, z, road) || CAMP_TRAIL.isNear(x, z, 6) || RAILWAY.isNear(x, z, 9)) return false;
  if (TRACKS.some(track => track.path.isNear(x, z, 5))) return false;
  if (onPaved(x, z, road)) return false;
  // The airfield's levelled ground is kept as open, mown grass.
  const { ground } = AIRFIELD;
  if (x > ground.x0 - 6 && x < ground.x1 + 6 && z > ground.z0 - 6 && z < ground.z1 + 6) return false;
  if (x > 130 && x < 250 && z > -90 && z < -20 && CREEK.isNear(x, z, 10)) return false;
  return true;
}

/** Rise over run of the ground at a point. */
function steepness(x, z) {
  const h = terrainHeight(x, z);
  return Math.hypot(terrainHeight(x + 1, z) - h, terrainHeight(x, z + 1) - h);
}

const TRUNK = '#7a6d52';
const BIRCH_BARK = '#ece8dc';
const BIRCH_MARKS = '#3f4440';
/** Leaves are painted pale, and each tree's own tint gives them their colour. */
const LEAVES = '#e8eae0';

/** A tier of a pine's branches: a cone with a ragged rim, drooping at the tips of the branches. */
function tierGeometry(radius, height, branches) {
  const rim = Array.from({ length: branches * 2 }, (_, i) => {
    const a = (i / (branches * 2)) * Math.PI * 2;
    const tip = i % 2 === 0;
    const r = tip ? radius : radius * 0.62;
    return [Math.cos(a) * r, tip ? -0.3 : 0.14, Math.sin(a) * r];
  });
  const apex = [0, height, 0];
  const under = [0, 0.4, 0];
  const points = [];
  rim.forEach((a, i) => {
    const b = rim[(i + 1) % rim.length];
    points.push(apex, b, a, under, a, b);
  });
  return prism(points);
}

/** Near the camera, a pine has five ragged tiers of branches; further off, three plain cones. */
function pineGeometry(detailed) {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.17, 0.27, 3.2, 5), TRUNK, { y: 1.6 });
  if (detailed) {
    [
      [2.35, 2.9, 1.9],
      [1.95, 2.7, 3.4],
      [1.55, 2.5, 4.9],
      [1.1, 2.3, 6.3],
      [0.62, 2.0, 7.6],
    ].forEach(([radius, height, y], k) => parts.add(tierGeometry(radius, height, 6), LEAVES, { y, ry: k * 0.9 }));
  } else {
    [
      [2.2, 5.5, 4],
      [1.75, 4.7, 5.8],
      [1.25, 3.6, 7.6],
    ].forEach(([radius, height, y]) =>
      parts.add(new THREE.ConeGeometry(radius, height, 6, 1, true), LEAVES, { y, ry: y }),
    );
  }
  return tintable(parts.geometry(), [TRUNK]);
}

function roundTreeGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.2, 0.3, 3.4, 5), TRUNK, { y: 1.7 });
  parts.add(new THREE.IcosahedronGeometry(2.4, 0), LEAVES, { y: 4.6, sy: 1.15 });
  parts.add(new THREE.IcosahedronGeometry(1.6, 0), LEAVES, { x: 0.9, y: 5.8, z: 0.4 });
  parts.add(new THREE.IcosahedronGeometry(1.3, 0), LEAVES, { x: -1.1, y: 4.2, z: -0.6, ry: 1 });
  return tintable(parts.geometry(), [TRUNK]);
}

function birchGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.13, 0.18, 5.2, 5), BIRCH_BARK, { y: 2.6 });
  for (const [y, ry] of [
    [1.2, 0],
    [2.3, 2],
    [3.4, 4],
  ]) {
    parts.box(0.2, 0.09, 0.2, BIRCH_MARKS, { y, ry });
  }
  parts.add(new THREE.IcosahedronGeometry(1.5, 0), LEAVES, { y: 5.4, sy: 1.5 });
  parts.add(new THREE.IcosahedronGeometry(1.05, 0), LEAVES, { x: 0.7, y: 4.4, z: -0.3, sy: 1.3 });
  parts.add(new THREE.IcosahedronGeometry(0.9, 0), LEAVES, { x: -0.6, y: 6.6, z: 0.3 });
  return tintable(parts.geometry(), [BIRCH_BARK, BIRCH_MARKS]);
}

function bushGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.IcosahedronGeometry(0.9, 0), LEAVES, { y: 0.55, sy: 0.75 });
  parts.add(new THREE.IcosahedronGeometry(0.65, 0), LEAVES, { x: 0.75, y: 0.45, z: 0.2, sy: 0.8 });
  parts.add(new THREE.IcosahedronGeometry(0.55, 0), LEAVES, { x: -0.6, y: 0.4, z: -0.3, sy: 0.8 });
  return tintable(parts.geometry());
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

const placement = new THREE.Object3D();

/** Where a scattered item { x, z, scale, rotation, tilt?, sx?, sy? } stands: on the ground, sunk by `sink` of its size. */
function placed(item, sink = 0.2) {
  placement.position.set(item.x, terrainHeight(item.x, item.z) - sink * item.scale, item.z);
  placement.rotation.set(item.tilt ?? 0, item.rotation, 0);
  placement.scale.set(item.scale * (item.sx ?? 1), item.scale * (item.sy ?? 1), item.scale);
  placement.updateMatrix();
  return placement.matrix.clone();
}

/** Pines are drawn in full this close to the camera, and as plain cones beyond. */
const PINE_DETAIL = 150;

/**
 * Tints for the leaves, as [hue, saturation, lightness] and how far each may vary. The woods
 * are just starting to turn: a few larches among the pines have gone gold, and some of the
 * broadleaved trees yellow, orange or red.
 */
const TINTS = {
  spruce: [0.29, 0.34, 0.27, 0.035, 0.08, 0.05],
  larch: [0.11, 0.78, 0.45, 0.012, 0.08, 0.05],
  green: [0.22, 0.4, 0.38, 0.04, 0.1, 0.06],
  yellow: [0.125, 0.76, 0.47, 0.012, 0.08, 0.05],
  orange: [0.07, 0.76, 0.45, 0.015, 0.08, 0.05],
  red: [0.015, 0.66, 0.38, 0.012, 0.08, 0.04],
  birch: [0.19, 0.45, 0.47, 0.03, 0.1, 0.06],
  bush: [0.23, 0.38, 0.34, 0.05, 0.1, 0.06],
};

function tint(name) {
  const [h, s, l, dh, ds, dl] = TINTS[name];
  return new THREE.Color().setHSL(
    h + (random() - 0.5) * 2 * dh,
    s + (random() - 0.5) * 2 * ds,
    l + (random() - 0.5) * 2 * dl,
  );
}

/** What colour a broadleaved tree has turned. */
function turned() {
  const roll = random();
  return roll < 0.55 ? 'green' : roll < 0.75 ? 'yellow' : roll < 0.9 ? 'orange' : 'red';
}

function buildTrees(scatter, obstacles) {
  const pines = [];
  const rounds = [];
  const birches = [];
  const bushes = [];
  for (let i = 0; i < 10500; i++) {
    const x = (random() - 0.5) * 1700;
    const z = (random() - 0.5) * 1700;
    const r = Math.hypot(x, z);
    // Beyond the fence the woods are thinner: only seen from afar, through the haze.
    if (r > 840 || (r > VALLEY_RADIUS + 10 && random() < 0.6) || !isClearGround(x, z)) continue;
    // Woods in some places, open meadows in others. They are kept open enough to drive through.
    const woods = smoothstep(fractalNoise(x / 150 + 3.3, z / 150 + 8.1, 2, 5), 0.36, 0.6);
    if (random() > 0.1 + woods * 0.9) continue;
    const height = terrainHeight(x, z);
    // Trees thin out towards the treeline and stop at it.
    if (random() < smoothstep(height, 84, 104) || steepness(x, z) > 0.9) continue;
    const tree = { x, z, scale: 0.65 + random() * 1.0, rotation: random() * Math.PI * 2 };
    const roll = random();
    if ((r > 300 && r < UPLANDS_RADIUS + 40) || height > 45 || r > VALLEY_RADIUS) pines.push(tree);
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

  const tinted =
    (name, sink = 0.2) =>
    tree => ({
      matrix: placed(tree, sink),
      color: tint(typeof name === 'function' ? name(tree) : name),
    });
  // Larches grow among the spruces on the lower slopes.
  const conifer = tree =>
    random() < 0.2 * (1 - smoothstep(terrainHeight(tree.x, tree.z), 60, 90)) ? 'larch' : 'spruce';
  const trees = foliageMaterial('trees');
  const round = roundTreeGeometry();
  const birch = birchGeometry();
  // Pines are everywhere, so they are grouped into smaller cells than the rest.
  scatter.add({
    geometry: pineGeometry(true),
    far: pineGeometry(false),
    near: PINE_DETAIL,
    cell: 240,
    material: trees,
    items: pines.map(tinted(conifer)),
  });
  scatter.add({ geometry: round, far: round, cell: 240, material: trees, items: rounds.map(tinted(turned)) });
  scatter.add({
    geometry: birch,
    far: birch,
    cell: 240,
    material: trees,
    items: birches.map(tinted(() => (random() < 0.4 ? 'yellow' : 'birch'))),
  });
  scatter.add({
    geometry: bushGeometry(),
    near: UNDERGROWTH_RANGE,
    shadows: false,
    material: trees,
    items: bushes.map(tinted('bush', 0.1)),
  });
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
  scatter.add({
    geometry: stumpGeometry(),
    near: UNDERGROWTH_RANGE,
    items: stumps.map(stump => ({ matrix: placed(stump, 0.05) })),
  });
  scatter.add({
    geometry: logGeometry(),
    near: UNDERGROWTH_RANGE,
    items: logs.map(log => ({ matrix: placed(log, 0.08) })),
  });
  for (const item of stumps) obstacles.push({ x: item.x, z: item.z, radius: 0.5 * item.scale });
  for (const item of logs) {
    const half = 2.1 * item.scale;
    const dx = Math.cos(item.rotation) * half;
    const dz = -Math.sin(item.rotation) * half;
    obstacles.push({ ax: item.x - dx, az: item.z - dz, bx: item.x + dx, bz: item.z + dz, radius: 0.36 * item.scale });
  }
}

function buildRocks(scatter, obstacles) {
  const shapes = [0, 1, 2, 3, 4].map(seed => boulderGeometry(seed));
  const lists = shapes.map(() => []);
  const add = rock => lists[Math.floor(random() * shapes.length)].push(rock);

  // Boulders scattered across the valley, often with a few smaller stones beside them.
  for (let i = 0; i < 680; i++) {
    const x = (random() - 0.5) * 2 * VALLEY_RADIUS;
    const z = (random() - 0.5) * 2 * VALLEY_RADIUS;
    if (!isClearGround(x, z, { road: 8 })) continue;
    // Stony ground up high has more of them.
    if (terrainHeight(x, z) < 80 && Math.hypot(x, z) > UPLANDS_RADIUS && random() < 0.4) continue;
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
  for (let i = 0; i < 15000 && outcrops < 340; i++) {
    const x = (random() - 0.5) * 2 * VALLEY_RADIUS;
    const z = (random() - 0.5) * 2 * VALLEY_RADIUS;
    if (Math.hypot(x, z) > VALLEY_RADIUS + 15 || steepness(x, z) < 0.55 || !isClearGround(x, z, { road: 10 })) continue;
    add({ x, z, size: 1.6 + random() * 2.6, rotation: random() * 6.3, tilt: (random() - 0.5) * 0.4, tall: 1.4 });
    outcrops++;
  }

  const items = [];
  lists.forEach((list, shape) => {
    for (const rock of list) {
      const item = {
        x: rock.x,
        z: rock.z,
        scale: rock.size,
        rotation: rock.rotation,
        tilt: rock.tilt,
        sx: 1.25,
        sy: rock.tall ?? 1,
      };
      items.push({ matrix: placed(item, 0.18), color: new THREE.Color().setScalar(0.92 + random() * 0.14), shape });
    }
    for (const rock of list) {
      if (rock.size > 0.9) obstacles.push({ x: rock.x, z: rock.z, radius: rock.size * 1.05 });
    }
  });
  // Far off, one plainer shape stands in for all five.
  scatter.add({ geometry: shapes, far: boulderGeometry(5, { detail: 0 }), near: ROCK_DETAIL, cell: 240, items });
}

/** Wildflowers and grass tufts: tiny, numerous and shadowless. */
function buildGroundCover(scatter) {
  const dummy = new THREE.Object3D();
  const flowerColors = ['#f3efdf', '#e9c75a', '#b49ac8', '#dd8f6e', '#8fa56a', '#8fa56a', '#8fa56a'];
  const flowers = [];
  const tufts = [];
  for (let i = 0; i < 32000 && flowers.length < 7800; i++) {
    const x = (random() - 0.5) * 2 * VALLEY_RADIUS;
    const z = (random() - 0.5) * 2 * VALLEY_RADIUS;
    if (Math.hypot(x, z) > VALLEY_RADIUS - 4 || !isClearGround(x, z, { road: 6 })) continue;
    if (terrainHeight(x, z) > 96) continue;
    // Flowers gather in drifts; tufts of long grass grow everywhere else.
    const drift = fractalNoise(x / 40 + 2, z / 40 + 6, 2, 17);
    if (drift > 0.55) flowers.push({ x, z, color: flowerColors[Math.floor(random() * flowerColors.length)] });
    else if (random() < 0.5) tufts.push({ x, z });
  }
  const flowerItems = flowers.map(flower => {
    dummy.position.set(flower.x, terrainHeight(flower.x, flower.z) + 0.2, flower.z);
    dummy.rotation.set(0, random() * 3, 0);
    dummy.scale.setScalar(0.7 + random() * 0.8);
    dummy.updateMatrix();
    return { matrix: dummy.matrix.clone(), color: new THREE.Color(flower.color) };
  });
  const flowerGeometry = tintable(new PartsBuilder().add(new THREE.ConeGeometry(0.16, 0.5, 4), '#ffffff').geometry());
  const grass = foliageMaterial('grass');
  scatter.add({ geometry: flowerGeometry, near: DETAIL_RANGE, shadows: false, material: grass, items: flowerItems });

  const blades = new PartsBuilder();
  for (let k = 0; k < 3; k++) {
    blades.add(new THREE.ConeGeometry(0.07, 0.75, 3, 1, true), '#ffffff', {
      x: Math.cos(k * 1.7) * 0.14,
      y: 0.3,
      z: Math.sin(k * 1.7) * 0.14,
      rz: (k - 1) * 0.2,
    });
  }
  const tuftItems = tufts.map(tuft => {
    dummy.position.set(tuft.x, terrainHeight(tuft.x, tuft.z), tuft.z);
    dummy.rotation.set(0, random() * 6.3, 0);
    dummy.scale.setScalar(0.8 + random() * 0.7);
    dummy.updateMatrix();
    return {
      matrix: dummy.matrix.clone(),
      color: new THREE.Color().setHSL(0.2 + random() * 0.05, 0.3, 0.42 + random() * 0.12),
    };
  });
  scatter.add({
    geometry: tintable(blades.geometry()),
    near: DETAIL_RANGE,
    shadows: false,
    material: grass,
    items: tuftItems,
  });
}

/** Long grass grows this close to the camera. */
const VERGE_RANGE = 110;

/** True where long grass can grow beside a trail: off every trail, road and track, and out of the water and snow. */
function isVerge(x, z) {
  if (Math.hypot(x, z) > VALLEY_RADIUS - 3) return false;
  if (ROAD.isNear(x, z, ROAD_HALF_WIDTH + 0.4) || CAMP_TRAIL.isNear(x, z, 2.5) || RAILWAY.isNear(x, z, 4.5))
    return false;
  if (onPaved(x, z, ROAD_HALF_WIDTH + 0.4) || onAirfield(x, z, 2)) return false;
  if (TRACKS.some(track => track.path.isNear(x, z, track.ruts ? 1.4 : 1.1))) return false;
  if (CLEARINGS.some(c => Math.hypot(x - c.x, z - c.z) < c.r * 0.7)) return false;
  if (lakeDistance(x, z) < 2.4 || (x > 130 && x < 250 && z > -90 && z < -20 && CREEK.isNear(x, z, 6))) return false;
  const h = terrainHeight(x, z);
  return h < 92 && snowCover(x, z, h) < 0.2 && steepness(x, z) < 0.5;
}

/** Long grass along the edges of the trails and tracks, which sways and bends away from the car. */
function buildVerges(scatter) {
  const edges = [
    { path: ROAD, edge: ROAD_HALF_WIDTH, skip: s => onBridge(s) || inTunnel(s) },
    { path: CAMP_TRAIL, edge: 2.1 },
    ...PAVED.map(path => ({ path, edge: ROAD_HALF_WIDTH })),
    ...TRACKS.filter(track => track.id !== 'roadworks').map(track => ({
      path: track.path,
      edge: track.ruts ? 1.2 : 0.8,
    })),
  ];
  const dummy = new THREE.Object3D();
  const items = [];
  for (const { path, edge, skip = () => false } of edges) {
    for (let s = 0; s < path.length; s += 0.55) {
      if (skip(s)) continue;
      // Thicker in some stretches than others.
      const lush = fractalNoise(s / 23 + edge, path.length / 97, 2, 61);
      for (const side of [-1, 1]) {
        if (random() > 0.25 + lush * 0.75) continue;
        const p = path.offset(s, side * (edge + 0.5 + random() ** 1.6 * 3.5));
        if (!isVerge(p.x, p.z)) continue;
        dummy.position.set(p.x, terrainHeight(p.x, p.z) - 0.05, p.z);
        dummy.rotation.set(0, random() * 6.3, 0);
        dummy.scale.setScalar(0.75 + random() * 0.55);
        dummy.updateMatrix();
        const golden = random() < 0.22;
        items.push({
          matrix: dummy.matrix.clone(),
          color: new THREE.Color().setHSL(
            golden ? 0.11 + random() * 0.03 : 0.2 + random() * 0.05,
            golden ? 0.6 : 0.5 + random() * 0.15,
            golden ? 0.48 + random() * 0.08 : 0.34 + random() * 0.08,
          ),
        });
      }
    }
  }
  const blades = new PartsBuilder();
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4;
    const height = 0.8 + ((k * 0.37) % 1) * 0.55;
    blades.add(new THREE.ConeGeometry(0.09, height, 3, 1, true), '#ffffff', {
      x: Math.cos(a) * (0.1 + (k % 3) * 0.12),
      y: height / 2,
      z: Math.sin(a) * 0.22,
      rx: Math.sin(a) * 0.3,
      rz: -Math.cos(a) * 0.3,
    });
  }
  scatter.add({
    geometry: tintable(blades.geometry()),
    near: VERGE_RANGE,
    shadows: false,
    material: foliageMaterial('grass'),
    items,
  });
}

/**
 * A ring of snow-capped mountains beyond the fence, merged into one mesh. Each is a cone that
 * steepens towards its summit, with ridges running down it and snow lying lower in the gullies
 * between them, smooth-shaded like the ground and with the same detail drawn on it.
 */
function buildPeaks(scene) {
  const SIDES = 40;
  const RINGS = 12;
  const positions = [];
  const colors = [];
  const indices = [];
  const snow = new THREE.Color('#edf0ec');
  const forest = new THREE.Color('#62764f');
  const rock = new THREE.Color();
  const color = new THREE.Color();
  const tones = ['#7d898c', '#858f8c', '#8a9291', '#7a8689'];
  for (let m = 0; m < 30; m++) {
    const angle = (m / 30) * Math.PI * 2;
    const distance = 880 + random() * 200;
    const cx = Math.sin(angle) * distance;
    const cz = Math.cos(angle) * distance;
    const radius = 130 + random() * 110;
    const height = 140 + random() * 150;
    const base = naturalHeight(cx, cz) - 18;
    const ridges = 3 + Math.floor(random() * 3);
    const twist = random() * Math.PI * 2;
    const lean = { x: (random() - 0.5) * radius * 0.3, z: (random() - 0.5) * radius * 0.3 };
    rock.set(tones[m % 4]);
    const first = positions.length / 3;
    const summit = base + height;
    // Where the foot of the mountain meets the ground all round, a little below it so it never floats.
    const feet = [];
    for (let j = 0; j <= RINGS; j++) {
      const f = j / RINGS;
      for (let k = 0; k < SIDES; k++) {
        const a = (k / SIDES) * Math.PI * 2;
        // 1 along a ridge, 0 in the gully between two.
        const ridge = Math.abs(Math.cos(((a + twist) * ridges) / 2)) ** 2;
        // The outline wanders round the mountain but keeps its shape on the way up, so no
        // ring stands out beyond the one below it.
        const wobble = fractalNoise(Math.cos(a) * 1.7 + m * 7.3, Math.sin(a) * 1.7, 2, 400 + m) - 0.5;
        const rough = (valueNoise(k * 0.7, j * 0.9, m) - 0.5) * 0.06;
        const reach = radius * (1 - f) * (0.82 + 0.3 * ridge + wobble * 0.4 + rough);
        const x = cx + Math.cos(a) * reach + lean.x * f;
        const z = cz + Math.sin(a) * reach + lean.z * f;
        if (j === 0) feet[k] = Math.min(base, naturalHeight(x, z) - 25);
        positions.push(x, lerp(feet[k], summit, f ** 1.35) + ridge * height * 0.05 * (1 - f) * f, z);
        const snowline = 0.62 - 0.17 * (1 - ridge) + (valueNoise(a * 6 + m, 3.1, 77) - 0.5) * 0.16;
        color.copy(rock).lerp(forest, 1 - smoothstep(f, 0.05, 0.3));
        color.lerp(snow, smoothstep(f, snowline - 0.03, snowline + 0.03));
        color.multiplyScalar(0.94 + random() * 0.1);
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let j = 0; j < RINGS; j++) {
      for (let k = 0; k < SIDES; k++) {
        const a = first + j * SIDES + k;
        const b = first + j * SIDES + ((k + 1) % SIDES);
        indices.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const peaks = new THREE.Mesh(geometry, groundMaterial());
  peaks.name = 'peaks';
  scene.add(peaks);
}

/** Split-rail fence around the valley and low posts beside the trail. */
function buildFences(scene, scatter) {
  const radius = VALLEY_RADIUS + 1.8;
  const count = Math.ceil((2 * Math.PI * radius) / 6);
  const points = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const x = Math.sin(a) * radius;
    const z = Math.cos(a) * radius;
    return { x, z, y: terrainHeight(x, z) };
  });
  const posts = [];
  const rails = [];
  const dummy = new THREE.Object3D();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  points.forEach((p, i) => {
    const next = points[(i + 1) % count];
    dummy.position.set(p.x, p.y + 0.55, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    posts.push({ matrix: dummy.matrix.clone() });
    for (const height of [0.65, 1.3]) {
      a.set(p.x, p.y + height, p.z);
      b.set(next.x, next.y + height, next.z);
      dummy.position.copy(a).add(b).multiplyScalar(0.5);
      dummy.lookAt(b);
      dummy.scale.set(1, 1, a.distanceTo(b));
      dummy.updateMatrix();
      rails.push({ matrix: dummy.matrix.clone() });
    }
  });
  const wood = '#8d886b';
  const post = new PartsBuilder().box(0.24, 2.2, 0.24, wood).geometry();
  const rail = new PartsBuilder().box(0.14, 0.15, 1, wood).geometry();
  scatter.add({ geometry: post, far: post, range: FENCE_RANGE, items: posts });
  scatter.add({ geometry: rail, far: rail, range: FENCE_RANGE, items: rails });

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

  // White marker posts with a black band along the paved roads, on alternate sides.
  const markers = new PartsBuilder();
  for (const path of [RING_ROAD, ...LINKS.map(link => link.path)]) {
    for (let s = 20, i = 0; s < path.length - 20; s += 24, i++) {
      const side = i % 2 ? 1 : -1;
      const p = path.offset(s, side * (ROAD_HALF_WIDTH + 1.2));
      if (onAirfield(p.x, p.z, 4) || ROAD.isNear(p.x, p.z, ROAD_HALF_WIDTH + 3)) continue;
      if (PAVED_JOINS.some(join => Math.hypot(join.x - p.x, join.z - p.z) < 14)) continue;
      const y = terrainHeight(p.x, p.z);
      const yaw = Math.atan2(p.dx, p.dz);
      markers.box(0.16, 1.1, 0.12, '#f2f0e8', { x: p.x, y: y + 0.45, z: p.z, ry: yaw });
      markers.box(0.17, 0.22, 0.13, '#2c302d', { x: p.x, y: y + 0.85, z: p.z, ry: yaw });
    }
  }
  scene.add(markers.mesh());
}

/** Where the link roads meet the ring. */
const PAVED_JOINS = LINKS.map(link => link.path.at(link.path.length));

const ASPHALT = '#7d7f79';

/** The paved roads: grey asphalt with a dashed white line down the middle. */
function buildPavedRoads(scene) {
  const dashes = s => s % 9 > 4.5;
  // The ring goes all the way round, so it is laid in pieces and the ones out of view are skipped.
  const pieces = 12;
  for (let k = 0; k < pieces; k++) {
    const from = (k / pieces) * RING_ROAD.length;
    const to = ((k + 1) / pieces) * RING_ROAD.length + 1.5;
    const outside = s => s < from || s > to;
    scene.add(ribbon(RING_ROAD, ROAD_HALF_WIDTH, ASPHALT, { lift: 0.07, skip: outside }));
    scene.add(ribbon(RING_ROAD, 0.1, '#eeece2', { lift: 0.09, across: 1, skip: s => outside(s) || dashes(s) }));
  }
  for (const { path } of LINKS) {
    // Each one stops at the edge of the trail, and tucks under the ring where it joins it.
    const between = s => s < ROAD_HALF_WIDTH || s > path.length - 3;
    scene.add(ribbon(path, ROAD_HALF_WIDTH, ASPHALT, { lift: 0.06, skip: between }));
    scene.add(
      ribbon(path, 0.1, '#eeece2', {
        lift: 0.08,
        across: 1,
        skip: s => between(s) || s > path.length - 6 || dashes(s),
      }),
    );
  }
}

export function buildScenery(parent) {
  // None of it ever moves, so it is kept together and frozen in place.
  const scene = new THREE.Group();
  scene.name = 'scenery';
  const obstacles = [];
  const ground = createGround(groundColor);
  scene.add(ground.group);
  scene.add(ribbon(ROAD, ROAD_HALF_WIDTH, '#cfc29c', { skip: onBridge }));
  scene.add(ribbon(CAMP_TRAIL, 2.1, '#c7b994', { lift: 0.05 }));
  buildPavedRoads(scene);
  for (const track of TRACKS) {
    // The roadworks lay their own surface.
    if (track.id === 'roadworks') continue;
    // Tracks that leave a paved road start at its edge.
    const paved = s => {
      const p = track.path.at(s);
      return onPaved(p.x, p.z, ROAD_HALF_WIDTH + 0.4);
    };
    if (track.ruts) {
      for (const offset of [-0.85, 0.85])
        scene.add(ribbon(track.path, 0.32, '#b3a078', { lift: 0.05, offset, skip: paved }));
    } else {
      scene.add(ribbon(track.path, 0.8, '#cdbf96', { lift: 0.05, skip: paved }));
    }
  }
  const water = buildWater(scene);
  const scatter = createScatter(scene);
  buildTrees(scatter, obstacles);
  buildRocks(scatter, obstacles);
  buildGroundCover(scatter);
  buildVerges(scatter);
  buildPeaks(scene);
  buildFences(scene, scatter);
  freeze(scene);
  parent.add(scene);
  return {
    obstacles,
    /** `eye` is where the camera is, `sun` the light whose shadows are drawn (if any), and `car` where the car is. */
    update(dt, eye, sun, car) {
      SWAY.time.value += dt;
      if (car) SWAY.pusher.value.set(car.x, terrainHeight(car.x, car.z), car.z);
      water.update(dt);
      ground.update(eye);
      scatter.update(eye, sun);
    },
  };
}
