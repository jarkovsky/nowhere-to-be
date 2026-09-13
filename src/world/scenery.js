// The landscape itself: ground, trail, water, vegetation, distant peaks and the fence.
import * as THREE from 'three';
import { createRandom, smoothstep } from '../core/math.js';
import {
  LAKE,
  ROAD,
  ROAD_HALF_WIDTH,
  CREEK,
  CREEK_HALF_WIDTH,
  CAMP_TRAIL,
  BRIDGE,
  TUNNEL,
  WATERFALL,
  CAMP,
  CABIN,
  LOOKOUT,
  SPAWN,
  VALLEY_RADIUS,
  HABITATS,
  SURFACES,
  YETI,
  lakeDistance,
} from './layout.js';
import { AXIS, GRID, heights, terrainHeight, naturalHeight, creekLevel, POOL } from './terrain.js';
import { PartsBuilder, flatMaterial, vertexColorMaterial, triangleGeometry } from './build.js';

const random = createRandom(82741);

const GROUND = {
  meadow: new THREE.Color('#a5b383'),
  dry: new THREE.Color('#c1be8b'),
  high: new THREE.Color('#939f87'),
  shore: new THREE.Color('#cfc9a0'),
  bank: new THREE.Color('#a9a78f'),
  snow: new THREE.Color('#eef1ea'),
  leaves: new THREE.Color('#bf8a4f'),
};

function groundColor(x, z, h, out) {
  out
    .copy(GROUND.meadow)
    .lerp(GROUND.dry, Math.min(1, 0.3 + 0.25 * Math.sin(x * 0.009 + z * 0.017) + Math.max(0, h - 15) * 0.012));
  if (h > 55) out.lerp(GROUND.high, Math.min(1, (h - 55) / 100));
  if (lakeDistance(x, z) < 1.22) out.lerp(GROUND.shore, 0.85);
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
        groundColor(cx, cz, cy, color);
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

/** A strip draped over the ground along a path, optionally skipping a stretch. */
function ribbon(path, halfWidth, color, { lift = 0.06, skip = () => false } = {}) {
  const positions = [];
  const across = 4;
  const rows = [];
  for (const sample of path.samples) {
    if (skip(sample.s)) {
      rows.push(null);
      continue;
    }
    const row = [];
    for (let j = 0; j <= across; j++) {
      const side = ((j / across) * 2 - 1) * halfWidth;
      const x = sample.x - sample.dz * side;
      const z = sample.z + sample.dx * side;
      row.push([x, terrainHeight(x, z) + lift, z]);
    }
    rows.push(row);
  }
  const count = path.closed ? rows.length : rows.length - 1;
  for (let i = 0; i < count; i++) {
    const a = rows[i];
    const b = rows[(i + 1) % rows.length];
    if (!a || !b) continue;
    for (let j = 0; j < across; j++) {
      positions.push(...a[j], ...a[j + 1], ...b[j], ...a[j + 1], ...b[j + 1], ...b[j]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const material = flatMaterial(color, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
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
  lake.scale.set(LAKE.rx * 1.15, 1, LAKE.rz * 1.15);
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

  const glints = [];
  const glintMaterial = new THREE.MeshBasicMaterial({ color: '#c3dccf', transparent: true, opacity: 0.35 });
  for (let i = 0; i < 28; i++) {
    const x = LAKE.x + (random() - 0.5) * LAKE.rx * 1.8;
    const z = LAKE.z + (random() - 0.5) * LAKE.rz * 1.8;
    if (lakeDistance(x, z) > 0.85) continue;
    const glint = new THREE.Mesh(new THREE.PlaneGeometry(2 + random() * 7, 0.12 + random() * 0.12), glintMaterial);
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(x, LAKE.level + 0.04, z);
    scene.add(glint);
    glints.push(glint);
  }

  const dummy = new THREE.Object3D();
  let time = 0;
  return {
    update(dt) {
      time += dt;
      glints.forEach((glint, i) => (glint.scale.x = 1 + Math.sin(time * 0.35 + i) * 0.14));
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

function isClearGround(x, z, { road = 9, water = 1.28 } = {}) {
  const r = Math.hypot(x, z);
  if (Math.abs(r - VALLEY_RADIUS - 1.8) < 4) return false;
  if (lakeDistance(x, z) < water) return false;
  if (CLEARINGS.some(c => Math.hypot(x - c.x, z - c.z) < c.r)) return false;
  if (nearWalkway(HABITATS.deer, x, z, 5) || nearWalkway(HABITATS.ducks, x, z, 5)) return false;
  if (r < 400 && ROAD.nearest(x, z).distance < road) return false;
  if (CAMP_TRAIL.nearest(x, z).distance < 6) return false;
  if (x > 130 && x < 250 && z > -90 && z < -20 && CREEK.nearest(x, z).distance < 10) return false;
  return true;
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

function buildVegetation(scene, obstacles) {
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const pines = [];
  const rounds = [];
  for (let i = 0; i < 2300; i++) {
    const x = (random() - 0.5) * 1000;
    const z = (random() - 0.5) * 1000;
    const r = Math.hypot(x, z);
    if (r > 490 || !isClearGround(x, z)) continue;
    // Leave open meadows between the woods.
    if (Math.sin(x * 0.034) * Math.cos(z * 0.042) < -0.28 && random() < 0.9) continue;
    const tree = { x, z, scale: 0.65 + random() * 1.0, rotation: random() * Math.PI * 2 };
    (r < 300 && random() < 0.16 ? rounds : pines).push(tree);
  }

  const place = (trees, geometry, hue) => {
    const mesh = new THREE.InstancedMesh(geometry, vertexColorMaterial, trees.length);
    trees.forEach((tree, i) => {
      dummy.position.set(tree.x, terrainHeight(tree.x, tree.z) - 0.2, tree.z);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tint.setHSL(hue + random() * 0.06, 0.25 + random() * 0.25, 0.75 + random() * 0.3));
      if (Math.hypot(tree.x, tree.z) < VALLEY_RADIUS + 5)
        obstacles.push({ x: tree.x, z: tree.z, radius: 0.3 * tree.scale });
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  place(pines, pineGeometry(), 0.22);
  place(rounds, roundTreeGeometry(), 0.16);

  // Boulders in three shapes so instancing doesn't look repetitive.
  const rockShapes = [0, 1, 2].map(seed => {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const position = geometry.attributes.position;
    const jitter = createRandom(400 + seed);
    for (let i = 0; i < position.count; i++) {
      position.setXYZ(
        i,
        position.getX(i) * (0.8 + jitter() * 0.4),
        position.getY(i) * (0.7 + jitter() * 0.4),
        position.getZ(i) * (0.8 + jitter() * 0.4),
      );
    }
    return geometry;
  });
  const rocks = [[], [], []];
  for (let i = 0; i < 340; i++) {
    const x = (random() - 0.5) * 720;
    const z = (random() - 0.5) * 720;
    if (!isClearGround(x, z, { road: 7, water: 1.15 })) continue;
    rocks[i % 3].push({ x, z, size: 0.5 + random() ** 2 * 3, rotation: random() * Math.PI * 2 });
  }
  rocks.forEach((list, shape) => {
    const mesh = new THREE.InstancedMesh(rockShapes[shape], flatMaterial('#9da28d'), list.length);
    list.forEach((rock, i) => {
      dummy.position.set(rock.x, terrainHeight(rock.x, rock.z) + rock.size * 0.15, rock.z);
      dummy.rotation.set(0, rock.rotation, 0);
      dummy.scale.set(rock.size * 1.35, rock.size * 0.75, rock.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (rock.size > 1.1) obstacles.push({ x: rock.x, z: rock.z, radius: rock.size * 0.95 });
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // Wildflowers and grass tufts: tiny, numerous and shadowless.
  const flowerColors = ['#f3efdf', '#e9c75a', '#b49ac8', '#dd8f6e', '#8fa56a', '#8fa56a', '#8fa56a'];
  const flowers = [];
  for (let i = 0; i < 4200 && flowers.length < 2600; i++) {
    const x = (random() - 0.5) * 640;
    const z = (random() - 0.5) * 640;
    if (Math.hypot(x, z) > VALLEY_RADIUS - 4 || !isClearGround(x, z, { road: 6, water: 1.25 })) continue;
    flowers.push({ x, z, color: flowerColors[Math.floor(random() * flowerColors.length)] });
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
  const water = buildWater(scene);
  buildVegetation(scene, obstacles);
  buildPeaks(scene);
  buildFences(scene);
  return { obstacles, update: dt => water.update(dt) };
}
