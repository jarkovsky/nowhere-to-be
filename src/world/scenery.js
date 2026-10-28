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
  DRIVEWAYS,
  onDriveway,
  onForecourt,
  RAILWAY,
  HALT,
  BRIDGE,
  TUNNEL,
  WATERFALL,
  CAMP,
  CABIN,
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
  DESERT,
  inFjord,
  inCrop,
  onAirfield,
  onPaved,
  onGravel,
  nearRiver,
  rockiness,
  lakeDistance,
  desertness,
} from './layout.js';
import {
  terrainHeight,
  naturalHeight,
  placementHeight,
  brookLevel,
  creekLevel,
  riverLevel,
  snowCover,
  waterLevel,
  POOL,
  FORDS,
} from './terrain.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PartsBuilder, flatMaterial, freeze, prism, tintable, vertexColorMaterial } from './build.js';
import { SWAY, foliageMaterial, groundMaterial } from './detail.js';
import { growsTall } from './trample.js';
import { createGround } from './ground.js';
import { createGrass } from './grass.js';
import { boulderGeometry } from './rocks.js';
import { createScatter } from './scatter.js';
import { buildDesertScenery, desertGround, desertTakes } from './sand.js';

const random = createRandom(82741);

// Autumn: golden meadows with olive-green and russet patches, browner high up, and cool grey rock.
const GROUND = {
  meadow: new THREE.Color('#b08e48'),
  lush: new THREE.Color('#7b8946'),
  dry: new THREE.Color('#c49850'),
  russet: new THREE.Color('#a4673a'),
  high: new THREE.Color('#978359'),
  rock: new THREE.Color('#8f9097'),
  alpine: new THREE.Color('#a4a1a0'),
  shore: new THREE.Color('#d8c996'),
  bank: new THREE.Color('#a6a387'),
  snow: new THREE.Color('#eef1ea'),
  leaves: new THREE.Color('#c4873f'),
  mud: new THREE.Color('#7a6446'),
  stone: new THREE.Color('#b3a891'),
};
const rockTone = new THREE.Color();

/**
 * Colour of the ground at a grid point, into `out`. `up` is the Y of its normal: 1 on flat
 * ground. Returns how grassy it is there, from 0 to 1, for the grass (see grass.js).
 */
function groundColor(x, z, h, up, out) {
  let grass = Math.hypot(x, z) < VALLEY_RADIUS - 3 ? 1 : 0;
  out
    .copy(GROUND.meadow)
    .lerp(GROUND.dry, Math.min(1, 0.3 + 0.25 * Math.sin(x * 0.009 + z * 0.017) + Math.max(0, h - 15) * 0.006));
  // Patches of greener grass and of grass gone russet, so the meadows aren't one flat colour.
  out.lerp(GROUND.lush, smoothstep(fractalNoise(x / 70 + 4.1, z / 70 + 1.7, 2, 31), 0.5, 0.72) * 0.8);
  out.lerp(GROUND.russet, smoothstep(fractalNoise(x / 52 + 9.2, z / 52 + 3.4, 2, 47), 0.56, 0.76) * 0.6);
  if (h > 45) out.lerp(GROUND.high, Math.min(1, (h - 45) / 80));
  // Bare rock and scree where the ground is steep.
  const steep = smoothstep(up, 0.86, 0.7);
  out.lerp(GROUND.rock, steep * 0.85);
  grass *= 1 - steep;
  // High up, the grass gives way to stony ground and then snow, which doesn't settle on cliffs.
  out.lerp(GROUND.alpine, smoothstep(h, 86, 108) * 0.75);
  grass *= 1 - smoothstep(h, 84, 100);
  if (h > 90) out.lerp(GROUND.snow, snowCover(x, z, h) * smoothstep(up, 0.6, 0.78));
  // Along the water: sand, gravel and stones, then nothing under the water itself.
  const shore = amount => {
    out.lerp(GROUND.bank, amount);
    grass *= 1 - Math.min(1, amount * 1.3);
  };
  if (lakeDistance(x, z) < 2.2) {
    const sand = 1 - smoothstep(h, LAKE.level + 0.35, LAKE.level + 0.9);
    out.lerp(GROUND.shore, sand);
    grass *= 1 - sand;
  }
  if (h < FJORD.level + 1.5 && inFjord(x, z, 6)) shore(1 - smoothstep(h, FJORD.level + 0.4, FJORD.level + 1.5));
  if (CREEK.isNear(x, z, 9)) shore(1 - smoothstep(CREEK.nearest(x, z).distance, 5, 9));
  if (BROOK.isNear(x, z, 6)) shore(1 - smoothstep(BROOK.nearest(x, z).distance, 2.5, 6));
  const river = nearRiver(x, z, 12);
  if (river) shore(1 - smoothstep(river.distance, river.river.halfWidth + 1, river.river.halfWidth + 7));
  // Gravel on the oxbow's shore and over its bed, where it shows through the shallows.
  if (OXBOW.path.isNear(x, z, 16)) {
    const { s, distance } = OXBOW.path.nearest(x, z);
    shore(1 - smoothstep(distance - OXBOW.halfWidth(s), 0.5, 2.5));
  }
  if (grass > 0 && waterLevel(x, z) > h - 0.3) grass = 0;
  // Bare rock, paler in places and darker in others.
  const rocky = rockiness(x, z);
  if (rocky > 0) out.lerp(rockTone.copy(GROUND.stone).lerp(GROUND.rock, valueNoise(x / 9, z / 9, 61)), rocky * 0.9);
  grass *= 1 - Math.min(1, rocky * 1.6);
  for (const patch of SURFACES) {
    // Mud's ragged edge comes from noise rather than the shared random numbers, so that
    // adding a patch of it doesn't move every tree placed after the ground.
    const ragged = patch.id === 'mud' ? (valueNoise(x / 2.5, z / 2.5, 9) - 0.5) * 0.5 : (random() - 0.5) * 0.12;
    const ux = (x - patch.x) / patch.rx;
    const uz = (z - patch.z) / patch.rz;
    const d = Math.sqrt(ux * ux + uz * uz) + ragged;
    if (d < 1 && patch.id === 'snow') out.copy(GROUND.snow);
    if (d < 1 && patch.id === 'leaves') out.lerp(GROUND.leaves, 0.75);
    if (d < 1.2 && patch.id === 'mud') out.lerp(GROUND.mud, 0.85 * (1 - smoothstep(d, 0.8, 1.2)));
    if (d < 1.2 && patch.id !== 'leaves') grass *= smoothstep(d, 0.9, 1.2);
    if (d < 1 && patch.id === 'leaves') grass *= 0.4;
  }
  desertGround(x, z, up, out);
  if (grass > 0) grass *= 1 - smoothstep(desertness(x, z), 0.05, 0.45);
  out.multiplyScalar(0.96 + random() * 0.08);
  return grass;
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
  // Each row of corners across the path is stored once and shared by the quads either side of
  // it: `rows` holds the first vertex of each, or -1 where the path is skipped.
  const { samples } = path;
  const rows = samples.map(sample => !skip(sample.s));
  const vertices = rows.filter(Boolean).length * (across + 1);
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const colors = new Float32Array(vertices * 3);
  let v = 0;
  samples.forEach((sample, i) => {
    if (!rows[i]) return (rows[i] = -1);
    rows[i] = v / 3;
    for (let j = 0; j <= across; j++, v += 3) {
      const side = offset + ((j / across) * 2 - 1) * halfWidth;
      const x = sample.x - sample.dz * side;
      const z = sample.z + sample.dx * side;
      const patch = 1 - smoothstep(Math.hypot((x - SNOW.x) / SNOW.rx, (z - SNOW.z) / SNOW.rz), 0.78, 1);
      const snow = Math.max(patch, snowCover(x, z));
      positions.set([x, terrainHeight(x, z) + lift, z], v);
      normals.set(groundNormal(x, z), v);
      tint.copy(base).lerp(PACKED_SNOW, snow).toArray(colors, v);
    }
  });
  const indices = [];
  const count = path.closed ? rows.length : rows.length - 1;
  for (let i = 0; i < count; i++) {
    const a = rows[i];
    const b = rows[(i + 1) % rows.length];
    if (a < 0 || b < 0) continue;
    for (let j = 0; j < across; j++) indices.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

const inTunnel = s => ROAD.apart(s, TUNNEL.s) < TUNNEL.length / 2 + 4;
const onBridge = s => ROAD.apart(s, BRIDGE.s) < BRIDGE.length / 2 - 0.6;

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
  ...PONDS.filter(pond => pond !== DESERT.oasis).map(({ x, z, radius }) => ({ x, z, r: radius + 6 })),
  ...GNOMES.map(gnome => ({ ...gnome, r: 4 })),
  // The mud lies on the tracks, which are kept clear anyway.
  ...SURFACES.filter(p => p.id !== 'mud').map(p => ({ x: p.x, z: p.z, r: Math.max(p.rx, p.rz) + 4 })),
];

/**
 * The tracks that the trees, rocks and grass are kept off. The desert's track and its oasis are
 * left out of these and of the clearings: everything is tried in turn from the same run of random
 * numbers, so keeping something off them would move everything placed after it. The desert
 * clears its own ground instead (see desertTakes).
 */
const PLACED_TRACKS = TRACKS.filter(track => !track.desert);

/** True in or just around a patch of mud. */
const inMud = (x, z) =>
  SURFACES.some(p => p.id === 'mud' && ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 < 1.15 ** 2);

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
  if (CLEARINGS.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r)) return false;
  if (nearWalkway(HABITATS.deer, x, z, 5) || nearWalkway(HABITATS.ducks, x, z, 5)) return false;
  if (ROAD.isNear(x, z, road) || CAMP_TRAIL.isNear(x, z, 6) || RAILWAY.isNear(x, z, 9)) return false;
  if (PLACED_TRACKS.some(track => track.path.isNear(x, z, 5))) return false;
  if (onPaved(x, z, road) || onGravel(x, z, road - 1) || onDriveway(x, z, 4)) return false;
  // The airfield's levelled ground is kept as open, mown grass.
  const { ground } = AIRFIELD;
  if (x > ground.x0 - 6 && x < ground.x1 + 6 && z > ground.z0 - 6 && z < ground.z1 + 6) return false;
  if (CREEK.isNear(x, z, 10)) return false;
  if (BROOK.isNear(x, z, 7) || Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.radius + 6) return false;
  if (OXBOW.path.isNear(x, z, 14)) return false;
  return !nearRiver(x, z, 11) && !inFjord(x, z, 3);
}

/** Rise over run of the land at a point, as it was before the desert (see placementHeight). */
function steepness(x, z) {
  const h = placementHeight(x, z);
  return Math.hypot(placementHeight(x + 1, z) - h, placementHeight(x, z + 1) - h);
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
export function pineGeometry(detailed) {
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

export function roundTreeGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.2, 0.3, 3.4, 5), TRUNK, { y: 1.7 });
  parts.add(new THREE.IcosahedronGeometry(2.4, 0), LEAVES, { y: 4.6, sy: 1.15 });
  parts.add(new THREE.IcosahedronGeometry(1.6, 0), LEAVES, { x: 0.9, y: 5.8, z: 0.4 });
  parts.add(new THREE.IcosahedronGeometry(1.3, 0), LEAVES, { x: -1.1, y: 4.2, z: -0.6, ry: 1 });
  return tintable(parts.geometry(), [TRUNK]);
}

export function birchGeometry() {
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

export function bushGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.IcosahedronGeometry(0.9, 0), LEAVES, { y: 0.55, sy: 0.75 });
  parts.add(new THREE.IcosahedronGeometry(0.65, 0), LEAVES, { x: 0.75, y: 0.45, z: 0.2, sy: 0.8 });
  parts.add(new THREE.IcosahedronGeometry(0.55, 0), LEAVES, { x: -0.6, y: 0.4, z: -0.3, sy: 0.8 });
  return tintable(parts.geometry());
}

export function stumpGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.42, 0.55, 0.7, 7), '#80694b', { y: 0.3 });
  parts.add(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 7), '#c9ad7c', { y: 0.66 });
  return parts.geometry();
}

export function logGeometry() {
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
    const height = placementHeight(x, z);
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

/** The mossy stones by the brook and the rivers, made the first time they are wanted. */
let mossy = null;
const mossyStones = () => (mossy ??= [0, 1, 2, 3].map(seed => boulderGeometry(seed + 11, { moss: 0.5 })));

/** Where a stone `size` across and `height` high stands at (x, z), sunk a little, turned by `turn`. */
function stoneMatrix(x, z, size, height, turn) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, terrainHeight(x, z) - size * 0.12, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0)),
    new THREE.Vector3(size, height, size),
  );
}

/**
 * Stones along the brook and round its spring. They have numbers of their own, so they
 * don't move anything else that is scattered.
 */
function buildBrookStones(scene) {
  const stoneRandom = createRandom(5150);
  const shapes = mossyStones();
  const parts = [];
  const stone = (x, z, size) => {
    const shape = shapes[Math.floor(stoneRandom() * shapes.length)];
    parts.push(shape.clone().applyMatrix4(stoneMatrix(x, z, size, size * 0.7, stoneRandom() * 6.3)));
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
    const matrix = stoneMatrix(rock.x, rock.z, rock.r * 0.85, rock.h / 0.72, stoneRandom() * 6.3);
    return { matrix, shape: Math.floor(stoneRandom() * shapes.length) };
  });
  scatter.add({ geometry: shapes, far: shapes[0], near: UNDERGROWTH_RANGE, range: 600, items });
}

/** Stones along the rivers' edges, though not where the roads ford them. They have numbers of their own. */
function buildRiverStones(scatter) {
  const stoneRandom = createRandom(7321);
  const shapes = mossyStones();
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
      items.push({ matrix: stoneMatrix(p.x, p.z, size, size * 0.7, turn), shape });
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
    if (placementHeight(x, z) < 80 && Math.hypot(x, z) > UPLANDS_RADIUS && random() < 0.4) continue;
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

/**
 * A few wildflowers from one spot, to draw many of: thin stems with a leaf or two at the foot,
 * each with a head of five petals round a yellow middle, facing up and cupped a little. The petals
 * are white, to take each one's own colour; the stems, the leaves and the middles keep theirs.
 */
function flowerGeometry() {
  const [STEM, LEAF, MIDDLE] = ['#7d9c4b', '#8aa857', '#e5b83b'];
  const parts = new PartsBuilder();
  /** A flat triangle with a face on both sides. */
  const both = (a, b, c) => prism([a, b, c, a, c, b]);
  for (const [x, z, height, turn] of [
    [0, 0, 0.42, 0],
    [0.09, 0.05, 0.33, 2.1],
    [-0.06, 0.08, 0.26, 4.4],
  ]) {
    parts.add(both([x - 0.012, 0, z], [x + 0.012, 0, z], [x, height, z]), STEM);
    const at = (angle, r, lift) => [x + Math.cos(angle) * r, height + lift, z + Math.sin(angle) * r];
    for (let k = 0; k < 5; k++) {
      const a = turn + (k * Math.PI * 2) / 5;
      parts.add(prism([at(0, 0, 0), at(a + 0.38, 0.085, 0.03), at(a - 0.38, 0.085, 0.03)]), '#ffffff');
    }
    parts.add(prism([at(turn, 0.028, 0.014), at(turn + 4.2, 0.028, 0.014), at(turn + 2.1, 0.028, 0.014)]), MIDDLE);
  }
  for (const a of [0.6, 3.5]) {
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    parts.add(both([-dz * 0.02, 0, dx * 0.02], [dz * 0.02, 0, -dx * 0.02], [dx * 0.11, 0.14, dz * 0.11]), LEAF);
  }
  return tintable(parts.geometry(), [STEM, LEAF, MIDDLE]);
}

/** Wildflowers: tiny, numerous and shadowless. */
function buildGroundCover(scatter) {
  const dummy = new THREE.Object3D();
  // Daisies, buttercups, clover, cornflowers and the odd poppy.
  const flowerColors = ['#f4f1e6', '#f4f1e6', '#f0cf4a', '#f0cf4a', '#c98fc4', '#7f96d8', '#dd5b3e'];
  const flowers = [];
  const tufts = [];
  // A try for every 58 square metres, and no more than one patch of flowers for every 237.
  const across = 2 * VALLEY_RADIUS;
  for (let i = 0; i < across ** 2 / 58 && flowers.length < across ** 2 / 237; i++) {
    const x = (random() - 0.5) * across;
    const z = (random() - 0.5) * across;
    if (Math.hypot(x, z) > VALLEY_RADIUS - 4 || !isClearGround(x, z, { road: 6 }) || inMud(x, z)) continue;
    if (placementHeight(x, z) > 96) continue;
    // Flowers gather in drifts; tufts of long grass grow everywhere else.
    const drift = fractalNoise(x / 40 + 2, z / 40 + 6, 2, 17);
    if (drift > 0.55) flowers.push({ x, z, color: flowerColors[Math.floor(random() * flowerColors.length)] });
    else if (random() < 0.5) tufts.push({ x, z });
  }
  const flowerItems = flowers.map(flower => {
    dummy.position.set(flower.x, terrainHeight(flower.x, flower.z) - 0.02, flower.z);
    dummy.rotation.set(0, random() * 3, 0);
    dummy.scale.setScalar(0.7 + random() * 0.8);
    dummy.updateMatrix();
    return { matrix: dummy.matrix.clone(), color: new THREE.Color(flower.color) };
  });
  const grass = foliageMaterial('grass', DETAIL_RANGE);
  scatter.add({ geometry: flowerGeometry(), near: DETAIL_RANGE, shadows: false, material: grass, items: flowerItems });

  // The grass covers the meadows now (see grass.js), so the tufts that once dotted them aren't
  // drawn. Their random numbers are still drawn, so nothing placed after them moves.
  // Their random numbers are still drawn, four to a tuft, so nothing placed after them moves.
  for (let i = 0; i < tufts.length * 4; i++) random();
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
  if (PLACED_TRACKS.some(track => track.path.isNear(x, z, track.ruts ? 1.6 : 1.3))) return false;
  if (onDriveway(x, z, 0.8)) return false;
  if (CLEARINGS.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r * 0.7) ** 2) || inMud(x, z)) return false;
  if (Math.hypot(x - FIELDS.x, z - FIELDS.z) < FIELDS.radius + 4) return false;
  if (lakeDistance(x, z) < 2.4 || CREEK.isNear(x, z, 6)) return false;
  if (BROOK.isNear(x, z, 3.2) || nearRiver(x, z, 7) || inFjord(x, z, 3) || OXBOW.path.isNear(x, z, 11)) return false;
  const h = placementHeight(x, z);
  return h < 92 && snowCover(x, z, h) < 0.2 && steepness(x, z) < 0.5;
}

/** The square the grass mask covers, a metre to a texel: everywhere inside the fence. */
const GRASS_AREA = { x0: -1024, z0: -1024, size: 2048 };

/**
 * Where the grass doesn't grow, or only short, at a metre to a texel (see grass.js): the
 * trails, roads, tracks and railway, with a short verge either side and short grass between
 * the ruts of a track, the yards round buildings, the crop fields and the airfield. The water,
 * rock, snow, sand and mud are left out by the ground's colouring instead (see groundColor).
 */
function grassMask() {
  const { x0, z0, size } = GRASS_AREA;
  const bytes = new Uint8Array(size * size);
  const mark = (i, value) => {
    if (value > bytes[i]) bytes[i] = value;
  };
  /** Marks within `half` of a segment, easing off over `soft` more, up to `value` (0 to 1). */
  const segment = (ax, az, bx, bz, half, soft, value) => {
    const reach = half + soft;
    const reach2 = reach * reach;
    const [dx, dz] = [bx - ax, bz - az];
    const length2 = dx * dx + dz * dz || 1e-9;
    const tx0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach - x0));
    const tx1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + reach - x0));
    const tz0 = Math.max(0, Math.floor(Math.min(az, bz) - reach - z0));
    const tz1 = Math.min(size - 1, Math.ceil(Math.max(az, bz) + reach - z0));
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const px = x0 + tx + 0.5 - ax;
        const pz = z0 + tz + 0.5 - az;
        const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / length2));
        const d2 = (px - dx * t) ** 2 + (pz - dz * t) ** 2;
        if (d2 < reach2) mark(tz * size + tx, Math.round(255 * value * (1 - smoothstep(Math.sqrt(d2), half, reach))));
      }
    }
  };
  const along = (path, half, soft, { value = 1, offset = 0, skip = () => false } = {}) => {
    const end = path.closed ? path.length : path.length - 0.01;
    for (let s = 0; s < end; s += 1) {
      if (skip(s)) continue;
      const a = path.offset(s, offset);
      const b = path.offset(Math.min(s + 1, path.closed ? s + 1 : path.length), offset);
      segment(a.x, a.z, b.x, b.z, half, soft, value);
    }
  };
  const disc = (x, z, half, soft, value = 1) => segment(x, z, x, z, half, soft, value);
  /** Marks every texel in a box where `inside(x, z)` holds. */
  const where = (bx0, bx1, bz0, bz1, inside, value = 1) => {
    for (let tz = Math.max(0, Math.floor(bz0 - z0)); tz <= Math.min(size - 1, Math.ceil(bz1 - z0)); tz++) {
      for (let tx = Math.max(0, Math.floor(bx0 - x0)); tx <= Math.min(size - 1, Math.ceil(bx1 - x0)); tx++) {
        if (inside(x0 + tx + 0.5, z0 + tz + 0.5)) mark(tz * size + tx, Math.round(255 * value));
      }
    }
  };

  along(ROAD, ROAD_HALF_WIDTH - 0.2, 1.1);
  along(CAMP_TRAIL, 2, 0.9);
  for (const path of PAVED) along(path, ROAD_HALF_WIDTH - 0.1, 1.2);
  along(ROADWORKS.path, ROAD_HALF_WIDTH, 1.5);
  for (const path of GRAVEL) along(path, GRAVEL_HALF_WIDTH - 0.1, 1.1);
  for (const { path, halfWidth } of DRIVEWAYS) along(path, halfWidth, 0.8);
  along(RAILWAY, 1.7, 0.8);
  for (const track of TRACKS) {
    if (track.ruts) {
      for (const offset of [-0.85, 0.85]) along(track.path, 0.6, 0.45, { offset });
      along(track.path, 0.5, 0.3, { value: 0.55 });
    } else {
      along(track.path, 0.8, 0.45);
    }
  }
  // Round the buildings and in their yards, and a little round each gnome, so it can be seen.
  const yards = [
    [SPAWN, 8],
    [DEPOT, 16],
    [CABIN, 8],
    [TUNNEL, 20],
    [FARM, 14],
    [TOWER, 6],
    [WINDMILL, 7],
    [{ ...RAILWAY.at((HALT.from + HALT.to) / 2) }, 14],
    [ROADWORKS.path.at(ROADWORKS.gravel), 22],
    [HELIPAD, 10],
    [CHAPEL, 6],
    [FARMSTEAD, 10],
    [AIRFIELD.hangar, 18],
    [AIRFIELD.tower, 8],
    ...FJORD_VILLAGE.houses.map(house => [house, 4.5]),
    [FJORD_VILLAGE.church, 7],
    ...FARMS.map(farm => [farm, 12]),
    ...VILLAGE.houses.map(house => [house, 5]),
    [VILLAGE.fireStation, 11],
  ];
  for (const [{ x, z }, r] of yards) disc(x, z, r, 3, 0.8);
  disc(AIRFIELD.hangar.x, AIRFIELD.hangar.z, 14, 1);
  for (const gnome of GNOMES) disc(gnome.x, gnome.z, 1.6, 1.2, 0.8);
  const { ground } = AIRFIELD;
  where(ground.x0 - 6, ground.x1 + 6, ground.z0 - 6, ground.z1 + 6, () => true, 0.6);
  where(ground.x0 - 6, ground.x1 + 6, ground.z0 - 6, ground.z1 + 6, (x, z) => onAirfield(x, z, 1));
  for (const { x, z, r } of [
    { ...FARM, r: 90 },
    { ...FIELDS, r: FIELDS.radius + 10 },
  ]) {
    where(x - r, x + r, z - r, z + r, (px, pz) => inCrop(px, pz, 1));
  }
  for (const yard of [DEPOT, VILLAGE.fireStation]) {
    where(yard.x - 30, yard.x + 30, yard.z - 30, yard.z + 30, onForecourt);
  }

  const texture = new THREE.DataTexture(bytes, size, size, THREE.RedFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { clear: texture, clearBytes: bytes, area: GRASS_AREA };
}

/**
 * Long grass in patches across the meadows and along the edges of the woods, taller in the
 * middle of a patch than at its edges. It sways, bends ahead of the car and lies down where the
 * car has driven through it (see trample.js). It has numbers of its own, so it doesn't move
 * anything else.
 */
function buildLongGrass(scatter) {
  const grassRandom = createRandom(6011);
  const dummy = new THREE.Object3D();
  const items = [];
  /** A clump at (x, z), `height` from 0 to 1 of the tallest, tinted round the patch's own `hue`. */
  const clump = (x, z, height, hue) => {
    if (!isLongGrassGround(x, z)) return;
    if (!desertTakes(x, z)) growsTall(x, z, 1);
    dummy.position.set(x, terrainHeight(x, z) - 0.05, z);
    dummy.rotation.set(0, grassRandom() * 6.3, 0);
    const width = 1 + grassRandom() * 0.5;
    dummy.scale.set(width, height * (0.8 + grassRandom() * 0.4), width);
    dummy.updateMatrix();
    // Most clumps have gone over to seed, golden, among a few still olive green.
    const golden = grassRandom() < 0.6 + hue;
    items.push({
      matrix: dummy.matrix.clone(),
      color: new THREE.Color().setHSL(
        golden ? 0.09 + grassRandom() * 0.03 : 0.17 - hue * 0.05 + grassRandom() * 0.03,
        golden ? 0.55 : 0.36 + grassRandom() * 0.1,
        golden ? 0.44 + grassRandom() * 0.08 : 0.3 + grassRandom() * 0.08,
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
      PLACED_TRACKS.some(track => track.path.isNear(cx, cz, 40));
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
  const peaks = new THREE.Mesh(geometry, groundMaterial({ name: 'peaks' }));
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
    if (onBridge(s) || inTunnel(s)) continue;
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
    // A few centimetres above the asphalt, or the two flicker against each other far off.
    const line = ribbonGeometry(RING_ROAD, 0.1, '#eeece2', {
      lift: 0.1,
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
        lift: 0.1,
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
  // Concrete driveways out to the road, a little under the road where they meet it.
  for (const { path, halfWidth } of DRIVEWAYS) scene.add(ribbon(path, halfWidth, '#b9b6ab', { lift: 0.045 }));
  const water = buildWater(scene);
  // What would grow in the crop fields, or in the desert, is left out as it is added rather than
  // where it is placed, so that leaving it out doesn't move everything placed after it.
  const everything = createScatter(scene);
  const grows = (x, z) => outsideCrops(x, z) && !desertTakes(x, z);
  const scatter = {
    ...everything,
    add: kind =>
      everything.add({
        ...kind,
        items: kind.items.filter(({ matrix: m }) => grows(m.elements[12], m.elements[14])),
      }),
  };
  buildTrees(scatter, obstacles);
  buildRocks(scatter, obstacles);
  buildBrookStones(scene);
  buildTrackRocks(scatter);
  buildRiverStones(scatter);
  buildGroundCover(scatter);
  buildLongGrass(scatter);
  const grass = createGrass({ ground: ground.texture, colors: ground.colors, ...grassMask() });
  scene.add(grass.group);
  // Wherever it grows, a car driving through lays it over.
  grass.eachTile((x, z, half) => growsTall(x, z, half));
  buildPeaks(scene);
  buildFences(scene, scatter);
  // The logs' obstacles are left out with them, by their middles.
  const kept = obstacles.filter(o =>
    o.x === undefined ? !desertTakes((o.ax + o.bx) / 2, (o.az + o.bz) / 2) : grows(o.x, o.z),
  );
  kept.push(...buildDesertScenery(everything));
  freeze(scene);
  parent.add(scene);
  return {
    obstacles: kept,
    grass,
    /** `camera` is the camera, and `sun` the light whose shadows are drawn (if any). */
    update(dt, camera, sun) {
      const eye = camera.position;
      SWAY.time.value += dt;
      water.update(dt);
      ground.update(eye);
      scatter.update(eye, sun);
      grass.update(camera);
    },
  };
}
