// The landscape itself: ground, trail, water, vegetation, distant peaks and the fence.
import * as THREE from 'three';
import { angleDelta, createRandom, fractalNoise, lerp, smoothstep, valueNoise } from '../core/math.js';
import {
  LAKE,
  ROAD,
  ROAD_HALF_WIDTH,
  CREEK,
  CREEK_HALF_WIDTH,
  BROOK,
  BROOK_HALF_WIDTH,
  SPRING,
  OXBOW,
  TRACK_ROCKS,
  FORD,
  CAMP_TRAIL,
  TRACKS,
  TRAILS,
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
  DEPOT,
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
  GRAVEL,
  GRAVEL_HALF_WIDTH,
  RIVERS,
  ROCK_FIELDS,
  ROCK_GATE,
  ROCK_FIN,
  FJORD,
  FJORD_VILLAGE,
  FARMS,
  VILLAGE,
  PONDS,
  inFjord,
  inCrop,
  onAirfield,
  onPaved,
  onGravel,
  nearRiver,
  rockiness,
  lakeDistance,
} from './layout.js';
import { terrainHeight, naturalHeight, brookLevel, creekLevel, riverLevel, snowCover, POOL, FORDS } from './terrain.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PartsBuilder, flatMaterial, freeze, prism, tintable, vertexColorMaterial } from './build.js';
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
  mud: new THREE.Color('#7a6446'),
  stone: new THREE.Color('#b3a891'),
};
const rockTone = new THREE.Color();

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
  if (h < FJORD.level + 1.5 && inFjord(x, z, 6))
    out.lerp(GROUND.bank, 1 - smoothstep(h, FJORD.level + 0.4, FJORD.level + 1.5));
  if (x > 135 && x < 245 && z > -85 && z < -30) {
    const creek = CREEK.nearest(x, z);
    if (creek.distance < 9) out.lerp(GROUND.bank, 1 - smoothstep(creek.distance, 5, 9));
  }
  if (BROOK.isNear(x, z, 6)) out.lerp(GROUND.bank, 1 - smoothstep(BROOK.nearest(x, z).distance, 2.5, 6));
  const river = nearRiver(x, z, 12);
  if (river)
    out.lerp(GROUND.bank, 1 - smoothstep(river.distance, river.river.halfWidth + 1, river.river.halfWidth + 7));
  // Gravel on the oxbow's shore and over its bed, where it shows through the shallows.
  if (OXBOW.path.isNear(x, z, 16)) {
    const { s, distance } = OXBOW.path.nearest(x, z);
    out.lerp(GROUND.bank, 1 - smoothstep(distance - OXBOW.halfWidth(s), 0.5, 2.5));
  }
  // Bare rock, paler in places and darker in others.
  const rocky = rockiness(x, z);
  if (rocky > 0) out.lerp(rockTone.copy(GROUND.stone).lerp(GROUND.rock, valueNoise(x / 9, z / 9, 61)), rocky * 0.9);
  for (const patch of SURFACES) {
    // Mud's ragged edge comes from noise rather than the shared random numbers, so that
    // adding a patch of it doesn't move every tree placed after the ground.
    const ragged = patch.id === 'mud' ? (valueNoise(x / 2.5, z / 2.5, 9) - 0.5) * 0.5 : (random() - 0.5) * 0.12;
    const d = Math.hypot((x - patch.x) / patch.rx, (z - patch.z) / patch.rz) + ragged;
    if (d < 1 && patch.id === 'snow') out.copy(GROUND.snow);
    if (d < 1 && patch.id === 'leaves') out.lerp(GROUND.leaves, 0.75);
    if (d < 1.2 && patch.id === 'mud') out.lerp(GROUND.mud, 0.85 * (1 - smoothstep(d, 0.8, 1.2)));
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
export function ribbon(path, halfWidth, color, options) {
  return ribbonMesh(ribbonGeometry(path, halfWidth, color, options));
}

/** Shaded like the ground beneath it, so it doesn't show its facets where the ground doesn't. */
export function ribbonMesh(geometry) {
  const material = groundMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

export function ribbonGeometry(
  path,
  halfWidth,
  color,
  { lift = 0.06, offset = 0, skip = () => false, across = 4 } = {},
) {
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
  return geometry;
}

function inTunnel(s) {
  return Math.abs(ROAD.wrap(s - TUNNEL.s + ROAD.length / 2) - ROAD.length / 2) < TUNNEL.length / 2 + 4;
}

function onBridge(s) {
  const delta = Math.abs(ROAD.wrap(s - BRIDGE.s + ROAD.length / 2) - ROAD.length / 2);
  return delta < BRIDGE.length / 2 - 0.6;
}

/**
 * A flat strip of water along a stream, `halfWidth` either side of it at `level(s)`, leaving
 * out the stretches where `skip(s)` and stopping for good where `until(s)`.
 */
function waterStrip(path, halfWidth, level, { skip = () => false, until = () => false } = {}) {
  const positions = [];
  let previous = null;
  for (const { x, z, dx, dz, s } of path.samples) {
    if (until(s)) break;
    if (skip(s)) {
      previous = null;
      continue;
    }
    const y = level(s);
    const left = [x + dz * halfWidth, y, z - dx * halfWidth];
    const right = [x - dz * halfWidth, y, z + dx * halfWidth];
    if (previous) positions.push(...previous[0], ...previous[1], ...left, ...previous[1], ...right, ...left);
    previous = [left, right];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
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
  const creek = new THREE.Mesh(
    waterStrip(CREEK, CREEK_HALF_WIDTH + 1.7, creekLevel, { until: s => creekLevel(s) < LAKE.level }),
    creekMaterial,
  );
  creek.receiveShadow = true;
  scene.add(creek);

  // The brook, from its spring pool down over the ford and into the lake, and the rivers out
  // in the outlands. Their edges reach into the banks, which hide them. They are clear enough
  // to see the road under the water at the fords.
  const brookMaterial = new THREE.MeshLambertMaterial({
    color: '#7fb8bb',
    emissive: '#285f63',
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const atLake = s => {
    const p = BROOK.at(s);
    return lakeDistance(p.x, p.z) < 1.03;
  };
  const brook = new THREE.Mesh(
    waterStrip(BROOK, BROOK_HALF_WIDTH + 3, brookLevel, { skip: s => s < SPRING.radius, until: atLake }),
    brookMaterial,
  );
  brook.receiveShadow = true;
  scene.add(brook);
  for (const river of RIVERS) {
    inPieces(river.path, outside => {
      const level = s => riverLevel(river, s);
      const water = new THREE.Mesh(
        waterStrip(river.path, river.halfWidth + 3, level, { skip: outside }),
        brookMaterial,
      );
      water.receiveShadow = true;
      scene.add(water);
    });
  }
  const spring = new THREE.Mesh(new THREE.CircleGeometry(SPRING.radius + 1.2, 20).rotateX(-Math.PI / 2), brookMaterial);
  spring.position.set(SPRING.x, brookLevel(0), SPRING.z);
  scene.add(spring);

  const poolGeometry = new THREE.CircleGeometry(WATERFALL.poolRadius + 2.5, 28);
  poolGeometry.rotateX(-Math.PI / 2);
  const pool = new THREE.Mesh(poolGeometry, creekMaterial);
  pool.position.set(POOL.x, POOL.level, POOL.z);
  scene.add(pool);

  // Flecks of foam drifting downstream and gentle glints on the lake.
  const foamCount = 66;
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
      const brookReach = BROOK.length * 0.86;
      foamSeeds.forEach((seed, i) => {
        // Every third fleck drifts down the brook instead of the creek.
        const inBrook = i % 3 === 0;
        const s = ((seed.offset + time * seed.speed) % 1) * (inBrook ? brookReach : usable);
        const p = (inBrook ? BROOK : CREEK).offset(s, seed.side * (inBrook ? 0.6 : 1));
        dummy.position.set(p.x, (inBrook ? brookLevel(s) : creekLevel(s)) + 0.03, p.z);
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
/**
 * Trees and rocks far off are drawn a square of this side at a time. Their far shapes are so
 * plain that drawing some out of view costs less than drawing more, smaller squares.
 */
const FAR_CELL = 480;

/** Circles kept clear of trees and rocks. */
const CLEARINGS = [
  { x: SPAWN.x, z: SPAWN.z, r: 16 },
  { x: DEPOT.x, z: DEPOT.z, r: 26 },
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
  { ...ROADWORKS.path.at(0), r: 20 },
  { ...ROADWORKS.path.at(ROADWORKS.gravel), r: 40 },
  { x: HELIPAD.x, z: HELIPAD.z, r: 20 },
  { x: CHAPEL.x, z: CHAPEL.z, r: 9 },
  { x: SUMMIT.x, z: SUMMIT.z, r: 16 },
  { x: FARMSTEAD.x, z: FARMSTEAD.z, r: 22 },
  { x: FIELDS.x, z: FIELDS.z, r: FIELDS.radius },
  { ...AIRFIELD.hangar, r: 22 },
  { ...AIRFIELD.tower, r: 12 },
  { x: ROCK_GATE.x, z: ROCK_GATE.z, r: ROCK_GATE.span },
  // Along the fin of rock out to the arch: its sides lean out a long way where it stands tall.
  ...ROCK_FIN.path.samples.filter((_, i) => i % 6 === 0).map(({ x, z }) => ({ x, z, r: 13 })),
  ...[...FJORD_VILLAGE.houses, ...FJORD_VILLAGE.boathouses].map(({ x, z }) => ({ x, z, r: 9 })),
  { x: FJORD_VILLAGE.church.x, z: FJORD_VILLAGE.church.z, r: 12 },
  ...FARMS.flatMap(farm => [
    { x: farm.x, z: farm.z, r: 28 },
    { x: farm.paddock.x, z: farm.paddock.z, r: farm.paddock.radius + 4 },
    ...(farm.sty ? [{ x: farm.sty.x, z: farm.sty.z, r: farm.sty.radius + 3 }] : []),
  ]),
  ...VILLAGE.houses.map(({ x, z }) => ({ x, z, r: 10 })),
  { x: VILLAGE.fireStation.x, z: VILLAGE.fireStation.z, r: 14 },
  ...PONDS.map(({ x, z, radius }) => ({ x, z, r: radius + 6 })),
  ...GNOMES.map(gnome => ({ ...gnome, r: 4 })),
  // Room round each viewpoint at the end of a marked trail, for a clear view out in front of it
  // and for the camera, which swings out behind the car to take it in.
  ...TRAILS.flatMap(({ view }) =>
    [-6, 18].map(back => ({
      x: view.x + Math.sin(view.heading) * back,
      z: view.z + Math.cos(view.heading) * back,
      r: 16,
    })),
  ),
  // The mud lies on the tracks, which are kept clear anyway.
  ...SURFACES.filter(p => p.id !== 'mud').map(p => ({ x: p.x, z: p.z, r: Math.max(p.rx, p.rz) + 4 })),
];

/** True in or just around a patch of mud. */
const inMud = (x, z) => SURFACES.some(p => p.id === 'mud' && Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz) < 1.15);

/** Nothing grows in the crop fields, nor within a couple of metres of them. */
const outsideCrops = (x, z) => !inCrop(x, z, 2);

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
  if (onPaved(x, z, road) || onGravel(x, z, road - 1)) return false;
  // The airfield's levelled ground is kept as open, mown grass.
  const { ground } = AIRFIELD;
  if (x > ground.x0 - 6 && x < ground.x1 + 6 && z > ground.z0 - 6 && z < ground.z1 + 6) return false;
  if (x > 130 && x < 250 && z > -90 && z < -20 && CREEK.isNear(x, z, 10)) return false;
  if (BROOK.isNear(x, z, 7) || Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.radius + 6) return false;
  if (OXBOW.path.isNear(x, z, 14)) return false;
  return !nearRiver(x, z, 11) && !inFjord(x, z, 3);
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
  // One try for every 275 square metres, out to a band of woods beyond the fence.
  const reach = VALLEY_RADIUS + 160;
  for (let i = 0; i < (2 * reach) ** 2 / 275; i++) {
    const x = (random() - 0.5) * 2 * reach;
    const z = (random() - 0.5) * 2 * reach;
    const r = Math.hypot(x, z);
    // Beyond the fence the woods are thinner: only seen from afar, through the haze.
    if (r > reach || (r > VALLEY_RADIUS + 10 && random() < 0.6) || !isClearGround(x, z)) continue;
    // Woods in some places, open meadows in others. They are kept open enough to drive through.
    const woods = smoothstep(fractalNoise(x / 150 + 3.3, z / 150 + 8.1, 2, 5), 0.36, 0.6);
    if (random() > 0.1 + woods * 0.9) continue;
    const height = terrainHeight(x, z);
    // Trees thin out towards the treeline and stop at it, and hardly grow on bare rock.
    if (random() < smoothstep(height, 84, 104) || steepness(x, z) > 0.9) continue;
    if (random() < rockiness(x, z) * 0.85) continue;
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
  scatter.add({
    geometry: pineGeometry(true),
    far: pineGeometry(false),
    near: PINE_DETAIL,
    cell: FAR_CELL,
    material: trees,
    items: pines.map(tinted(conifer)),
  });
  scatter.add({ geometry: round, far: round, cell: FAR_CELL, material: trees, items: rounds.map(tinted(turned)) });
  scatter.add({
    geometry: birch,
    far: birch,
    cell: FAR_CELL,
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

  // Stumps and fallen logs in the woods, by about one pine in sixty.
  const stumps = [];
  const logs = [];
  for (const tree of pines) {
    if (random() > 1 / 60 || Math.hypot(tree.x, tree.z) > VALLEY_RADIUS - 8) continue;
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

/**
 * Stones along the brook and round its spring. They have numbers of their own, so they
 * don't move anything else that is scattered.
 */
function buildBrookStones(scene) {
  const stoneRandom = createRandom(5150);
  const shapes = [0, 1, 2, 3].map(seed => boulderGeometry(seed + 11, { moss: 0.5 }));
  const parts = [];
  const stone = (x, z, size, tall = 0.7) => {
    const shape = shapes[Math.floor(stoneRandom() * shapes.length)];
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, terrainHeight(x, z) - size * 0.12, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, stoneRandom() * 6.3, 0)),
      new THREE.Vector3(size, size * tall, size),
    );
    parts.push(shape.clone().applyMatrix4(matrix));
  };
  for (let s = 2; s < BROOK.length - 14; s += 2.6) {
    if (Math.abs(s - FORD.brook) < 10) continue;
    const side = stoneRandom() < 0.5 ? -1 : 1;
    const p = BROOK.offset(s, side * (BROOK_HALF_WIDTH + 0.4 + stoneRandom() * 1.4));
    stone(p.x, p.z, 0.25 + stoneRandom() * 0.4);
  }
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + stoneRandom() * 0.4;
    const d = SPRING.radius + 0.8 + stoneRandom() * 0.8;
    stone(SPRING.x + Math.cos(a) * d, SPRING.z + Math.sin(a) * d, 0.3 + stoneRandom() * 0.45);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), vertexColorMaterial);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

/**
 * The rocks across the tracks, which the car drives over rather than bumps into (see
 * rockHeight): as high as the bumps the tyres ride over, a little wider than them.
 */
function buildTrackRocks(scatter) {
  const stoneRandom = createRandom(6421);
  const shapes = [0, 1, 2, 3].map(seed => boulderGeometry(seed + 11, { moss: 0.3 }));
  const items = TRACK_ROCKS.map(rock => {
    const size = rock.r * 0.85;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(rock.x, terrainHeight(rock.x, rock.z) - size * 0.12, rock.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, stoneRandom() * 6.3, 0)),
      new THREE.Vector3(size, rock.h / 0.72, size),
    );
    return { matrix, shape: Math.floor(stoneRandom() * shapes.length) };
  });
  scatter.add({ geometry: shapes, far: shapes[0], near: UNDERGROWTH_RANGE, range: 600, items });
}

/** Stones along the rivers' edges, though not where the roads ford them. They have numbers of their own. */
function buildRiverStones(scatter) {
  const stoneRandom = createRandom(7321);
  const shapes = [0, 1, 2, 3].map(seed => boulderGeometry(seed + 11, { moss: 0.5 }));
  const items = [];
  for (const river of RIVERS) {
    const fords = FORDS.filter(ford => ford.river === river);
    for (let s = 2; s < river.path.length; s += 1.8 + stoneRandom() * 2.4) {
      const side = stoneRandom() < 0.5 ? -1 : 1;
      const p = river.path.offset(s, side * (river.halfWidth - 0.8 + stoneRandom() * 2.6));
      const size = 0.3 + stoneRandom() * 0.6;
      const turn = stoneRandom() * 6.3;
      const shape = Math.floor(stoneRandom() * shapes.length);
      if (Math.hypot(p.x, p.z) > VALLEY_RADIUS + 60) continue;
      if (fords.some(ford => Math.hypot(ford.x - p.x, ford.z - p.z) < river.halfWidth + 8)) continue;
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, terrainHeight(p.x, p.z) - size * 0.12, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0)),
        new THREE.Vector3(size, size * 0.7, size),
      );
      items.push({ matrix, shape });
    }
  }
  scatter.add({ geometry: shapes, near: UNDERGROWTH_RANGE, items });
}

function buildRocks(scatter, obstacles) {
  const shapes = [0, 1, 2, 3, 4].map(seed => boulderGeometry(seed));
  const lists = shapes.map(() => []);
  const add = rock => lists[Math.floor(random() * shapes.length)].push(rock);

  const across = 2 * VALLEY_RADIUS;
  // Boulders scattered across the valley, one try for every 2720 square metres, often with a
  // few smaller stones beside them.
  for (let i = 0; i < across ** 2 / 2720; i++) {
    const x = (random() - 0.5) * across;
    const z = (random() - 0.5) * across;
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
  // Outcrops on steep ground, mostly up in the northern crags: a try for every 123 square
  // metres, and no more than one for every 5440.
  let outcrops = 0;
  for (let i = 0; i < across ** 2 / 123 && outcrops < across ** 2 / 5440; i++) {
    const x = (random() - 0.5) * across;
    const z = (random() - 0.5) * across;
    if (Math.hypot(x, z) > VALLEY_RADIUS + 15 || steepness(x, z) < 0.55 || !isClearGround(x, z, { road: 10 })) continue;
    add({ x, z, size: 1.6 + random() * 2.6, rotation: random() * 6.3, tilt: (random() - 0.5) * 0.4, tall: 1.4 });
    outcrops++;
  }
  // Rocky ground is strewn with boulders, a try for every 70 square metres, and here and
  // there a tall tower of rock stands among them, away from the roads.
  for (const field of ROCK_FIELDS) {
    for (let i = 0; i < (Math.PI * field.radius ** 2) / 70; i++) {
      const a = random() * Math.PI * 2;
      const d = Math.sqrt(random()) * field.radius;
      const x = field.x + Math.cos(a) * d;
      const z = field.z + Math.sin(a) * d;
      if (random() > rockiness(x, z) || !isClearGround(x, z, { road: 7 })) continue;
      const tower = random() < 0.06 && !onGravel(x, z, 16) && !TRACKS.some(track => track.path.isNear(x, z, 12));
      const size = tower ? 2.4 + random() * 1.8 : 0.5 + random() ** 2 * 2.6;
      const tall = tower ? 2.6 + random() * 1.6 : 1;
      add({ x, z, size, rotation: random() * 6.3, tilt: (random() - 0.5) * 0.3, tall });
    }
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
  scatter.add({ geometry: shapes, far: boulderGeometry(5, { detail: 0 }), near: ROCK_DETAIL, cell: FAR_CELL, items });
}

/** Wildflowers and grass tufts: tiny, numerous and shadowless. */
function buildGroundCover(scatter) {
  const dummy = new THREE.Object3D();
  const flowerColors = ['#f3efdf', '#e9c75a', '#b49ac8', '#dd8f6e', '#8fa56a', '#8fa56a', '#8fa56a'];
  const flowers = [];
  const tufts = [];
  // A try for every 58 square metres, and no more than one flower for every 237.
  const across = 2 * VALLEY_RADIUS;
  for (let i = 0; i < across ** 2 / 58 && flowers.length < across ** 2 / 237; i++) {
    const x = (random() - 0.5) * across;
    const z = (random() - 0.5) * across;
    if (Math.hypot(x, z) > VALLEY_RADIUS - 4 || !isClearGround(x, z, { road: 6 }) || inMud(x, z)) continue;
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
  const grass = foliageMaterial('grass', DETAIL_RANGE);
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

/** Long grass grows this close to the camera, rising out of the ground as it comes into range. */
const LONG_GRASS_RANGE = 150;

/** True where long grass can grow: off every trail, road and track, and out of the water, the mud and the snow. */
function isLongGrassGround(x, z) {
  if (Math.hypot(x, z) > VALLEY_RADIUS - 3) return false;
  if (ROAD.isNear(x, z, ROAD_HALF_WIDTH + 0.8) || CAMP_TRAIL.isNear(x, z, 2.8) || RAILWAY.isNear(x, z, 4.5))
    return false;
  if (onPaved(x, z, ROAD_HALF_WIDTH + 0.8) || onAirfield(x, z, 2)) return false;
  if (onGravel(x, z, GRAVEL_HALF_WIDTH + 0.8)) return false;
  if (TRACKS.some(track => track.path.isNear(x, z, track.ruts ? 1.6 : 1.3))) return false;
  if (CLEARINGS.some(c => Math.hypot(x - c.x, z - c.z) < c.r * 0.7) || inMud(x, z)) return false;
  if (Math.hypot(x - FIELDS.x, z - FIELDS.z) < FIELDS.radius + 4) return false;
  if (lakeDistance(x, z) < 2.4 || (x > 130 && x < 250 && z > -90 && z < -20 && CREEK.isNear(x, z, 6))) return false;
  if (BROOK.isNear(x, z, 3.2) || nearRiver(x, z, 7) || inFjord(x, z, 3) || OXBOW.path.isNear(x, z, 11)) return false;
  const h = terrainHeight(x, z);
  return h < 92 && snowCover(x, z, h) < 0.2 && steepness(x, z) < 0.5;
}

/**
 * Long grass in patches across the meadows and along the edges of the woods, taller in the
 * middle of a patch than at its edges. It sways, and bends away from the car. It has numbers
 * of its own, so it doesn't move anything else.
 */
function buildLongGrass(scatter) {
  const grassRandom = createRandom(6011);
  const dummy = new THREE.Object3D();
  const items = [];
  /** A clump at (x, z), `height` from 0 to 1 of the tallest, tinted round the patch's own `hue`. */
  const clump = (x, z, height, hue) => {
    if (!isLongGrassGround(x, z)) return;
    dummy.position.set(x, terrainHeight(x, z) - 0.05, z);
    dummy.rotation.set(0, grassRandom() * 6.3, 0);
    const width = 1 + grassRandom() * 0.5;
    dummy.scale.set(width, height * (0.8 + grassRandom() * 0.4), width);
    dummy.updateMatrix();
    // Some clumps have gone over to seed, golden, among the green.
    const golden = grassRandom() < 0.12 + hue * 0.5;
    items.push({
      matrix: dummy.matrix.clone(),
      color: new THREE.Color().setHSL(
        golden ? 0.11 + grassRandom() * 0.03 : 0.2 - hue * 0.05 + grassRandom() * 0.04,
        golden ? 0.58 : 0.45 + grassRandom() * 0.15,
        golden ? 0.46 + grassRandom() * 0.08 : 0.34 + grassRandom() * 0.09,
      ),
    });
  };
  // Patches of it, a few metres to ten across, in some meadows and along the edges of the woods:
  // a try for every 35 square metres inside the fence, and no more than a patch for every 1580.
  let patches = 0;
  const area = Math.PI * VALLEY_RADIUS ** 2;
  for (let attempt = 0; attempt < area / 35 && patches < area / 1580; attempt++) {
    const a = grassRandom() * Math.PI * 2;
    const r = Math.sqrt(grassRandom()) * (VALLEY_RADIUS - 8);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const meadow = smoothstep(fractalNoise(cx / 90 + 1.3, cz / 90 + 7.7, 2, 91), 0.45, 0.68);
    // The same noise as the woods: there is more of it where the woods begin.
    const woods = fractalNoise(cx / 150 + 3.3, cz / 150 + 8.1, 2, 5);
    const edge = 1 - smoothstep(Math.abs(woods - 0.42), 0, 0.08);
    // Most of it within sight of the trails and tracks, though not along them.
    const seen =
      ROAD.isNear(cx, cz, 60) ||
      CAMP_TRAIL.isNear(cx, cz, 40) ||
      onPaved(cx, cz, 50) ||
      onGravel(cx, cz, 50) ||
      TRACKS.some(track => track.path.isNear(cx, cz, 40));
    const chance = Math.max(meadow, edge * 0.8) * (seen ? 1 : 0.2);
    if (grassRandom() > chance || !isLongGrassGround(cx, cz)) continue;
    patches++;
    const hue = grassRandom() * 0.4;
    const radius = 3 + grassRandom() * 8;
    const stretch = 0.55 + grassRandom() * 0.7;
    const turn = grassRandom() * Math.PI;
    const ragged = grassRandom() * 6.3;
    const count = Math.round(radius * radius * stretch * Math.PI * 0.55);
    for (let k = 0; k < count; k++) {
      // Thicker and taller towards the middle, with a ragged edge.
      const t = Math.sqrt(grassRandom());
      const b = grassRandom() * Math.PI * 2;
      const reach = t * radius * (0.75 + 0.25 * Math.sin(b * 3 + ragged));
      const u = Math.cos(b) * reach;
      const v = Math.sin(b) * reach * stretch;
      clump(
        cx + u * Math.cos(turn) - v * Math.sin(turn),
        cz + u * Math.sin(turn) + v * Math.cos(turn),
        1 - 0.5 * t * t,
        hue,
      );
    }
  }
  // Seven flat blades leaning out from the middle, each with a face on both sides.
  const blades = new PartsBuilder();
  for (let k = 0; k < 7; k++) {
    const height = 0.7 + ((k * 0.37) % 1) * 0.5;
    for (const face of [1, -1]) {
      const blade = new THREE.BufferGeometry();
      blade.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-0.065 * face, 0, 0, 0.065 * face, 0, 0, 0, height, 0], 3),
      );
      blade.computeVertexNormals();
      const spot = 0.06 + (k % 3) * 0.1;
      blades.add(blade, '#ffffff', {
        x: Math.cos(k * 2.4) * spot,
        z: Math.sin(k * 2.4) * spot,
        ry: Math.PI / 2 - k * 2.4,
        rx: 0.18 + (k % 2) * 0.17,
      });
    }
  }
  scatter.add({
    geometry: tintable(blades.geometry()),
    near: LONG_GRASS_RANGE,
    shadows: false,
    material: foliageMaterial('grass', LONG_GRASS_RANGE),
    items,
  });
}

/**
 * A ring of snow-capped mountains beyond the fence, merged into one mesh. Each is a cone that
 * steepens towards its summit, with ridges running down it and snow lying lower in the gullies
 * between them, smooth-shaded like the ground and with the same detail drawn on it.
 */
function buildPeaks(scene) {
  const MOUNTAINS = 40;
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
  const mouth = FJORD.path.at(FJORD.path.length);
  const fjordAngle = Math.atan2(mouth.x, mouth.z);
  for (let m = 0; m < MOUNTAINS; m++) {
    let angle = (m / MOUNTAINS) * Math.PI * 2;
    const distance = VALLEY_RADIUS + 200 + random() * 250;
    const radius = 130 + random() * 110;
    // None stands in the way of the fjord: one that would stands beside it instead.
    const clear = (radius + 70) / distance;
    const off = angleDelta(fjordAngle, angle);
    if (Math.abs(off) < clear) angle = fjordAngle + (off < 0 ? -clear : clear);
    const cx = Math.sin(angle) * distance;
    const cz = Math.cos(angle) * distance;
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

/** Where the link roads and the new road meet the ring. */
const PAVED_JOINS = [...LINKS.map(link => link.path.at(link.path.length)), ROADWORKS.path.at(0)];

export const ASPHALT = '#7d7f79';

/**
 * Lays a long road in pieces about 300 m long, so the pieces out of view are skipped:
 * `lay(outside)` is called for each, with `outside(s)` true away from that piece.
 */
function inPieces(path, lay) {
  const pieces = Math.max(1, Math.round(path.length / 300));
  for (let k = 0; k < pieces; k++) {
    const from = (k / pieces) * path.length;
    const to = ((k + 1) / pieces) * path.length + 1.5;
    lay(s => s < from || s > to);
  }
}

/** The paved roads: grey asphalt with a dashed white line down the middle. */
function buildPavedRoads(scene) {
  const dashes = s => s % 9 > 4.5;
  inPieces(RING_ROAD, outside => {
    const asphalt = ribbonGeometry(RING_ROAD, ROAD_HALF_WIDTH, ASPHALT, { lift: 0.07, skip: outside });
    const line = ribbonGeometry(RING_ROAD, 0.1, '#eeece2', {
      lift: 0.09,
      across: 1,
      skip: s => outside(s) || dashes(s),
    });
    scene.add(ribbonMesh(mergeGeometries([asphalt, line])));
  });
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

/** The gravel roads in the outlands: pale gravel worn darker in two wheel tracks. */
function buildGravelRoads(scene) {
  for (const path of GRAVEL) {
    // The roads out from the ring start at its edge, and tuck under the outer road where they join it.
    const off = s => {
      const p = path.at(s);
      return onPaved(p.x, p.z, ROAD_HALF_WIDTH + 0.4) || (!path.closed && s > path.length - 3);
    };
    inPieces(path, outside => {
      const skip = s => outside(s) || off(s);
      const gravel = ribbonGeometry(path, GRAVEL_HALF_WIDTH, '#bdae8b', { lift: 0.06, skip });
      const tracks = [-1.15, 1.15].map(offset =>
        ribbonGeometry(path, 0.4, '#a69676', { lift: 0.075, offset, across: 1, skip }),
      );
      scene.add(ribbonMesh(mergeGeometries([gravel, ...tracks])));
    });
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
  buildGravelRoads(scene);
  for (const track of TRACKS) {
    // Tracks that leave a paved or gravel road start at its edge.
    const paved = s => {
      const p = track.path.at(s);
      return onPaved(p.x, p.z, ROAD_HALF_WIDTH + 0.4) || onGravel(p.x, p.z, GRAVEL_HALF_WIDTH + 0.2);
    };
    if (track.ruts) {
      for (const offset of [-0.85, 0.85])
        scene.add(ribbon(track.path, 0.32, '#b3a078', { lift: 0.05, offset, skip: paved }));
    } else {
      scene.add(ribbon(track.path, 0.8, '#cdbf96', { lift: 0.05, skip: paved }));
    }
  }
  const water = buildWater(scene);
  // What would grow in the crop fields is left out as it is added rather than where it is
  // placed, so that leaving it out doesn't move everything placed after it.
  const everything = createScatter(scene);
  const scatter = {
    ...everything,
    add: kind =>
      everything.add({
        ...kind,
        items: kind.items.filter(({ matrix: m }) => outsideCrops(m.elements[12], m.elements[14])),
      }),
  };
  buildTrees(scatter, obstacles);
  buildRocks(scatter, obstacles);
  buildBrookStones(scene);
  buildTrackRocks(scatter);
  buildRiverStones(scatter);
  buildGroundCover(scatter);
  buildLongGrass(scatter);
  buildPeaks(scene);
  buildFences(scene, scatter);
  freeze(scene);
  parent.add(scene);
  return {
    obstacles: obstacles.filter(o => o.x === undefined || outsideCrops(o.x, o.z)),
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
