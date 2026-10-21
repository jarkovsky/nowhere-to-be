// The upland farm: a timber cottage and a tractor shed where the fields track
// ends, a rapeseed field, young crops, and two tractors at work. One ploughs a
// field of stubble and the furrows appear behind it, with gulls following the
// plough; the other mows a meadow. When a field is done and nobody is watching,
// it quietly grows back and the work starts again.
import * as THREE from 'three';
import { chassisPose } from '../../core/suspension.js';
import { vehicleParts } from '../../vehicles/car.js';
import { FARMSTEAD, FIELDS, FIELD_PLOTS, fieldPoint } from '../layout.js';
import { headingOf } from '../path.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, flatMaterial, gableRoof, gableEnds, localFrame, createSmoke } from '../build.js';

/** Width of one pass of the plough or the mower. */
const LANE = 3.6;
/** Length of the cells the worked ground appears in behind a tractor. */
const CELL = 2;
const RUBBER = '#2c302e';
const STEEL = '#6b706b';

/** Ground colours: [base, stripe] for each crop, and for the ground once it is worked. */
const CROPS = {
  stubble: ['#cdbb7e', '#c1ad6f'],
  meadow: ['#8fa864', '#86a05b'],
  rapeseed: ['#e8ce4b', '#dcc23f'],
  young: ['#a3bc70', '#8ea85f'],
  ploughed: ['#8b6f4e', '#775c3f'],
  mown: ['#b9c47f', '#cbbd72'],
};

/** Geometry for quads draped over the ground. Each quad is four [lx, lz] corners in the farmland's frame. */
function drape(quads, lift) {
  const positions = new Float32Array(quads.length * 18);
  const colors = new Float32Array(quads.length * 18);
  const tint = new THREE.Color();
  quads.forEach(({ corners, color }, q) => {
    const world = corners.map(([lx, lz]) => {
      const p = fieldPoint(lx, lz);
      return [p.x, terrainHeight(p.x, p.z) + lift, p.z];
    });
    tint.set(color);
    [0, 2, 1, 0, 3, 2].forEach((corner, i) => {
      positions.set(world[corner], q * 18 + i * 3);
      colors.set([tint.r, tint.g, tint.b], q * 18 + i * 3);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function fieldMesh(geometry, offset) {
  const material = flatMaterial('#ffffff', {
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** A plot covered in rows of a crop: strips a third of a lane wide, in cells along the rows. */
function rows(plot, [base, stripe]) {
  const quads = [];
  for (let x = plot.x0; x < plot.x1 - 0.01; x += LANE / 3) {
    const color = Math.round((x - plot.x0) / (LANE / 3)) % 2 ? stripe : base;
    for (let z = plot.z0; z < plot.z1 - 0.01; z += CELL * 2) {
      const x1 = Math.min(plot.x1, x + LANE / 3);
      const z1 = Math.min(plot.z1, z + CELL * 2);
      quads.push({
        corners: [
          [x, z],
          [x1, z],
          [x1, z1],
          [x, z1],
        ],
        color,
      });
    }
  }
  return quads;
}

/** The way a tractor works a plot: up one lane, round at the headland, down the next. */
function laneRoute(plot) {
  const lanes = Math.floor((plot.x1 - plot.x0) / LANE);
  const length = plot.z1 - plot.z0;
  const turn = (Math.PI * LANE) / 2;
  return {
    lanes,
    length,
    total: lanes * length + (lanes - 1) * turn,
    /** Position and direction (in the farmland's frame) after `d` metres, and how much ground is worked. */
    at(d) {
      const i = Math.min(lanes - 1, Math.floor(d / (length + turn)));
      const t = d - i * (length + turn);
      const way = i % 2 ? -1 : 1;
      const x = plot.x0 + (i + 0.5) * LANE;
      if (t <= length || i === lanes - 1) {
        const along = Math.min(t, length);
        return { lx: x, lz: way > 0 ? plot.z0 + along : plot.z1 - along, dx: 0, dz: way, worked: i * length + along };
      }
      const a = (t - length) / (LANE / 2);
      const end = way > 0 ? plot.z1 : plot.z0;
      return {
        lx: x + (LANE / 2) * (1 - Math.cos(a)),
        lz: end + way * Math.sin(a) * (LANE / 2),
        dx: Math.sin(a),
        dz: way * Math.cos(a),
        worked: (i + 1) * length,
      };
    },
  };
}

/**
 * The worked ground, built in the order the tractor works it, so showing the
 * first n cells (with the draw range) shows exactly what is done so far.
 */
function workedGround(plot, route, [base, stripe]) {
  const quads = [];
  for (let i = 0; i < route.lanes; i++) {
    const x0 = plot.x0 + i * LANE;
    const cells = Math.ceil(route.length / CELL);
    for (let k = 0; k < cells; k++) {
      const a = Math.min(route.length, k * CELL);
      const b = Math.min(route.length, (k + 1) * CELL);
      const [za, zb] = i % 2 ? [plot.z1 - b, plot.z1 - a] : [plot.z0 + a, plot.z0 + b];
      for (let strip = 0; strip < 3; strip++) {
        const xa = x0 + (strip * LANE) / 3;
        const xb = xa + LANE / 3;
        quads.push({
          corners: [
            [xa, za],
            [xb, za],
            [xb, zb],
            [xa, zb],
          ],
          color: strip === 1 ? stripe : base,
        });
      }
    }
  }
  const mesh = fieldMesh(drape(quads, 0.09), -4);
  const cellsPerLane = Math.ceil(route.length / CELL);
  return {
    mesh,
    /** Shows the ground worked so far, `worked` metres along the lanes. */
    show(worked) {
      const lane = Math.floor(worked / route.length);
      const cells = lane * cellsPerLane + Math.floor((worked - lane * route.length) / CELL);
      mesh.geometry.setDrawRange(0, Math.max(0, cells) * 18);
    },
  };
}

function wheel(radius, width) {
  return new PartsBuilder()
    .add(new THREE.CylinderGeometry(radius, radius, width, 12), RUBBER, { rz: Math.PI / 2 })
    .add(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 10), '#e0c46a', { rz: Math.PI / 2 })
    .mesh();
}

/** A copy of the garage's tractor in the farm's own colour, with something hitched behind. */
function farmTractor(color, implement) {
  const { painted, trim, spec } = vehicleParts('tractor');
  const root = new THREE.Group();
  root.add(painted.mesh({ material: flatMaterial(color) }), trim.mesh());
  const wheels = spec.wheels.map(({ x, z, radius, width = 0.4 }) => {
    const mesh = wheel(radius, width);
    mesh.position.set(x, radius + 0.06, z);
    root.add(mesh);
    return { mesh, radius };
  });
  const tool = new PartsBuilder();
  tool.box(0.2, 0.15, 1.2, STEEL, { y: 0.75, z: 2.6 }); // drawbar
  if (implement === 'plough') {
    tool.box(2.4, 0.18, 0.2, STEEL, { y: 0.8, z: 3.2, ry: 0.35 });
    for (let k = 0; k < 4; k++) {
      tool.box(0.1, 0.65, 0.1, STEEL, { x: -0.9 + k * 0.6, y: 0.45, z: 3.55 - k * 0.22 });
      tool.add(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 10), '#9aa09a', {
        x: -0.9 + k * 0.6,
        y: 0.3,
        z: 3.55 - k * 0.22,
        rz: Math.PI / 2,
        ry: 0.5,
      });
    }
  } else {
    tool.box(2.8, 0.3, 1.3, '#c9452f', { y: 0.4, z: 3.6 }); // mower deck
    tool.box(2.9, 0.08, 1.4, '#3f4541', { y: 0.58, z: 3.6 });
    for (const x of [-1.3, 1.3])
      tool.add(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 8), RUBBER, { x, y: 0.2, z: 4.3, rz: Math.PI / 2 });
  }
  root.add(tool.mesh());
  root.traverse(child => {
    if (child.isMesh) child.castShadow = true;
  });
  return { root, wheels };
}

/** Gulls that wheel round behind the plough, looking for worms. One instanced mesh. */
function gullFlock(scene, count) {
  const parts = new PartsBuilder()
    .box(0.5, 0.16, 0.18, '#f4f3ec')
    .box(0.14, 0.12, 0.12, '#f4f3ec', { x: 0.3, y: 0.06 })
    .box(0.08, 0.04, 0.05, '#e0b649', { x: 0.4, y: 0.05 });
  for (const side of [-1, 1]) {
    parts.box(0.3, 0.03, 0.55, '#dfe2df', { y: 0.1, z: side * 0.32, rx: side * 0.35 });
    parts.box(0.22, 0.03, 0.4, '#5d625f', { x: -0.02, y: 0.24, z: side * 0.75, rx: side * -0.15 });
  }
  const mesh = new THREE.InstancedMesh(parts.geometry(), flatMaterial('#ffffff', { vertexColors: true }), count);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

/** The cottage, the shed and the bales where the track ends. */
function buildFarmstead(scene, parts, obstacles) {
  const { rotation } = FARMSTEAD;
  const local = localFrame(FARMSTEAD.x, FARMSTEAD.z, rotation);
  const y = terrainHeight(FARMSTEAD.x, FARMSTEAD.z);
  const at = (lx, ly, lz, extra = {}) => ({ ...local(lx, lz), y: y + ly, ry: rotation, ...extra });
  const turned = rotation + Math.PI / 2;

  // A log cottage: dark timber with white chinking between the logs, on a stone footing.
  const cottage = { x: -4, z: -2 };
  parts.box(7.6, 0.5, 5.6, '#9a978a', at(cottage.x, 0.05, cottage.z));
  parts.box(7, 2.8, 5, '#6e4d34', at(cottage.x, 1.6, cottage.z));
  for (let k = 0; k < 6; k++) parts.box(7.04, 0.07, 5.04, '#efe8d8', at(cottage.x, 0.6 + k * 0.42, cottage.z));
  parts.add(gableEnds(5, 7, 3, 5.4), '#7d5a3d', at(cottage.x, 0, cottage.z, { ry: turned }));
  parts.add(gableRoof(5, 7, 2.95, 5.5, 0.5), '#58514b', at(cottage.x, 0, cottage.z, { ry: turned }));
  parts.box(0.7, 1.9, 0.7, '#8e8b7f', at(cottage.x + 2, 5.1, cottage.z - 0.8)); // chimney
  parts.box(1, 1.9, 0.12, '#4f5e52', at(cottage.x - 1.6, 1.15, cottage.z + 2.53)); // door
  for (const lx of [0.4, 2.2]) {
    parts.box(1.05, 0.95, 0.12, '#f1ede2', at(cottage.x + lx, 1.75, cottage.z + 2.53));
    parts.box(0.8, 0.7, 0.14, '#e8cf8a', at(cottage.x + lx, 1.75, cottage.z + 2.54));
  }
  parts.box(1.6, 0.12, 0.25, '#7a5436', at(cottage.x - 1.6, 0.55, cottage.z + 2.9)); // bench
  obstacles.push(
    { ...local(cottage.x - 1.8, cottage.z), radius: 3 },
    { ...local(cottage.x + 1.8, cottage.z), radius: 3 },
  );

  // An open shed for the tractors, with bales stacked at the back.
  const shed = { x: 7, z: -3 };
  for (const lx of [-2.6, 2.6]) {
    for (const lz of [-2.2, 2.2]) {
      parts.box(0.22, 3.2, 0.22, '#7a5a3e', at(shed.x + lx, 1.6, shed.z + lz));
      obstacles.push({ ...local(shed.x + lx, shed.z + lz), radius: 0.3 });
    }
  }
  parts.add(gableRoof(5.4, 4.6, 3.1, 4.3, 0.35), '#6f6b63', at(shed.x, 0, shed.z, { ry: turned }));
  for (const [lx, ly] of [
    [-1.4, 0.6],
    [0, 0.6],
    [1.4, 0.6],
    [-0.7, 1.75],
    [0.7, 1.75],
  ]) {
    parts.add(
      new THREE.CylinderGeometry(0.6, 0.6, 1.1, 10),
      '#d9c071',
      at(shed.x + lx, ly, shed.z - 1.4, { rx: Math.PI / 2 }),
    );
  }
  for (const [lx, lz] of [
    [-11.5, 2],
    [-12.6, 4.4],
  ]) {
    parts.add(
      new THREE.CylinderGeometry(0.75, 0.75, 1.2, 10),
      '#d9c071',
      at(lx, 0.72, lz, { rz: Math.PI / 2, ry: rotation + lx }),
    );
    obstacles.push({ ...local(lx, lz), radius: 0.9 });
  }
  return createSmoke(scene, at(cottage.x + 2, 6.2, cottage.z - 0.8), { rise: 7, size: 0.45 });
}

export function buildFields(scene, obstacles) {
  // The crops, each a little apart from the next so the edges read as separate fields.
  const { plough, mow, rapeseed, young } = FIELD_PLOTS;
  const crops = [
    ...rows(plough, CROPS.stubble),
    ...rows(mow, CROPS.meadow),
    ...rows(rapeseed, CROPS.rapeseed),
    ...rows(young, CROPS.young),
  ];
  scene.add(fieldMesh(drape(crops, 0.05), -2));

  const parts = new PartsBuilder();
  const smoke = buildFarmstead(scene, parts, obstacles);
  scene.add(parts.mesh());

  // The two tractors, each part of the way through its field.
  const workers = [
    { plot: plough, implement: 'plough', color: '#b5402f', speed: 1.7, start: 0.38, crop: CROPS.ploughed },
    { plot: mow, implement: 'mower', color: '#4f8a4b', speed: 2.1, start: 0.62, crop: CROPS.mown },
  ].map(worker => {
    const route = laneRoute(worker.plot);
    const tractor = farmTractor(worker.color, worker.implement);
    const ground = workedGround(worker.plot, route, worker.crop);
    scene.add(tractor.root, ground.mesh);
    return { ...worker, route, tractor, ground, d: route.total * worker.start };
  });
  const gulls = gullFlock(scene, 4);
  const dummy = new THREE.Object3D();
  const colliders = [];
  let time = 0;

  const toWorld = (dx, dz) => {
    const cos = Math.cos(FIELDS.rotation);
    const sin = Math.sin(FIELDS.rotation);
    return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos };
  };

  return {
    /** Circles round the tractors and what they pull, for collisions. */
    colliders,
    getState: () => workers.map(w => ({ worked: w.route.at(w.d).worked, done: w.d >= w.route.total })),
    update(dt, player) {
      time += dt;
      smoke.update(time);
      colliders.length = 0;
      const farFromFields = !player || Math.hypot(player.x - FIELDS.x, player.z - FIELDS.z) > 220;
      for (const worker of workers) {
        const { route, tractor } = worker;
        const here = route.at(worker.d);
        const p = fieldPoint(here.lx, here.lz);
        const facing = toWorld(here.dx, here.dz);
        const heading = headingOf(facing.x, facing.z);
        // Stop for the car rather than drive into it.
        const ahead = { x: p.x + facing.x * 3.5, z: p.z + facing.z * 3.5 };
        const blocked = player && Math.hypot(player.x - ahead.x, player.z - ahead.z) < 4.5;
        if (worker.d >= route.total) {
          // Done. The field grows back while nobody is looking.
          if (farFromFields) worker.d = 0;
        } else if (!blocked) {
          worker.d = Math.min(route.total, worker.d + worker.speed * dt);
          for (const w of tractor.wheels) w.mesh.rotation.x -= (worker.speed * dt) / w.radius;
        }
        const pose = chassisPose(p.x, p.z, heading, terrainHeight);
        tractor.root.position.set(p.x, pose.height, p.z);
        tractor.root.rotation.set(pose.pitch, heading, pose.roll, 'YXZ');
        // The worked ground starts behind the plough or the mower, not under the cab.
        worker.ground.show(Math.max(0, here.worked - 4));
        for (const along of [-1.2, 1.2, 3.6]) {
          colliders.push({ x: p.x - facing.x * along, z: p.z - facing.z * along, radius: 1.3 });
        }
        worker.position = p;
        worker.facing = facing;
      }

      // The gulls circle a few metres behind the plough.
      const plougher = workers[0];
      for (let i = 0; i < 4; i++) {
        const a = time * (0.5 + i * 0.07) + i * 1.7;
        const cx = plougher.position.x - plougher.facing.x * 7;
        const cz = plougher.position.z - plougher.facing.z * 7;
        const radius = 3.5 + i * 0.8;
        const x = cx + Math.cos(a) * radius;
        const z = cz + Math.sin(a) * radius;
        dummy.position.set(x, terrainHeight(x, z) + 3 + Math.sin(time * 1.3 + i) * 0.8 + i * 0.4, z);
        dummy.rotation.set(0.3, -a - Math.PI / 2, 0, 'YXZ'); // flying round the circle, banked into it
        dummy.updateMatrix();
        gulls.setMatrixAt(i, dummy.matrix);
      }
      gulls.instanceMatrix.needsUpdate = true;
    },
  };
}
