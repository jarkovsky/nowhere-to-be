// The upland farm: a timber cottage and a tractor shed where the fields track
// ends, a rapeseed field, young crops, and three machines at work. One tractor
// ploughs a field of stubble and the furrows appear behind it, with gulls
// following the plough; another mows a meadow; and a combine harvester cuts the
// wheat, leaving stubble and rows of straw. When a field is done and nobody is
// watching, it quietly grows back and the work starts again.
import * as THREE from 'three';
import { chassisPose } from '../../core/suspension.js';
import { vehicleParts } from '../../vehicles/car.js';
import { FARMSTEAD, FIELDS, FIELD_PLOTS, fieldPoint } from '../layout.js';
import { headingOf } from '../path.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, flatMaterial, gableRoof, gableEnds, localFrame, createSmoke } from '../build.js';

/** Width of one pass of the plough or the mower. */
const LANE = 3.6;
/** Width of the combine's cutting table, and so of each pass it makes. */
const HEADER = 6;
/** Length of the cells the worked ground appears in behind a tractor. */
const CELL = 2;
const RUBBER = '#2c302e';
const STEEL = '#6b706b';
const DARK = '#3a3f3a';
const COMBINE = '#7ea33b';
const WHITE = '#f1efe6';
const GLASS = '#4f6f73';
/** Puffs of chaff behind the combine. */
const CHAFF = 8;

/** Ground colours: [base, stripe] for each crop, and for the ground once it is worked. */
const CROPS = {
  stubble: ['#cdbb7e', '#c1ad6f'],
  meadow: ['#8fa864', '#86a05b'],
  rapeseed: ['#e8ce4b', '#dcc23f'],
  young: ['#a3bc70', '#8ea85f'],
  ploughed: ['#8b6f4e', '#775c3f'],
  mown: ['#b9c47f', '#cbbd72'],
  wheat: ['#e3c35c', '#d6b44e'],
  harvested: ['#cdbb7e', '#e8d690'], // stubble, with a row of straw down the middle of each pass
};
/** The stalks, seen from the side where the wheat is cut. */
const STALKS = '#b89a45';

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
function rows(plot, [base, stripe], lane = LANE) {
  const quads = [];
  for (let x = plot.x0; x < plot.x1 - 0.01; x += lane / 3) {
    const color = Math.round((x - plot.x0) / (lane / 3)) % 2 ? stripe : base;
    for (let z = plot.z0; z < plot.z1 - 0.01; z += CELL * 2) {
      const x1 = Math.min(plot.x1, x + lane / 3);
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

/** The way a machine works a plot: up one lane, round at the headland, down the next. */
function laneRoute(plot, width = LANE) {
  const lanes = Math.floor((plot.x1 - plot.x0) / width);
  const length = plot.z1 - plot.z0;
  const turn = (Math.PI * width) / 2;
  return {
    lanes,
    length,
    width,
    total: lanes * length + (lanes - 1) * turn,
    /**
     * Position and direction (in the farmland's frame) after `d` metres, the lane
     * it is on or has just finished, and how much ground is worked.
     */
    at(d) {
      const i = Math.min(lanes - 1, Math.floor(d / (length + turn)));
      const t = d - i * (length + turn);
      const way = i % 2 ? -1 : 1;
      const x = plot.x0 + (i + 0.5) * width;
      if (t <= length || i === lanes - 1) {
        const along = Math.min(t, length);
        return {
          lx: x,
          lz: way > 0 ? plot.z0 + along : plot.z1 - along,
          dx: 0,
          dz: way,
          lane: i,
          worked: i * length + along,
        };
      }
      const a = (t - length) / (width / 2);
      const end = way > 0 ? plot.z1 : plot.z0;
      return {
        lx: x + (width / 2) * (1 - Math.cos(a)),
        lz: end + way * Math.sin(a) * (width / 2),
        dx: Math.sin(a),
        dz: way * Math.cos(a),
        lane: i,
        worked: (i + 1) * length,
      };
    },
  };
}

/** Cells of `route.length` metres of lane, in working order, as [x0, x1, za, zb] in the farmland's frame. */
function cellsInOrder(plot, route) {
  const cells = [];
  const perLane = Math.ceil(route.length / CELL);
  for (let i = 0; i < route.lanes; i++) {
    const x0 = plot.x0 + i * route.width;
    for (let k = 0; k < perLane; k++) {
      const a = Math.min(route.length, k * CELL);
      const b = Math.min(route.length, (k + 1) * CELL);
      const [za, zb] = i % 2 ? [plot.z1 - b, plot.z1 - a] : [plot.z0 + a, plot.z0 + b];
      cells.push([x0, x0 + route.width, za, zb]);
    }
  }
  return cells;
}

/** How many cells are done once `worked` metres of lane are. */
function cellsDone(route, worked) {
  const perLane = Math.ceil(route.length / CELL);
  const lane = Math.floor(worked / route.length);
  return Math.max(0, lane * perLane + Math.floor((worked - lane * route.length) / CELL));
}

/**
 * The worked ground, built in the order the tractor works it, so showing the
 * first n cells (with the draw range) shows exactly what is done so far.
 */
function workedGround(plot, route, [base, stripe]) {
  const quads = [];
  for (const [x0, , za, zb] of cellsInOrder(plot, route)) {
    for (let strip = 0; strip < 3; strip++) {
      const xa = x0 + (strip * route.width) / 3;
      const xb = xa + route.width / 3;
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
  const mesh = fieldMesh(drape(quads, 0.09), -4);
  return {
    mesh,
    /** Shows the ground worked so far, `worked` metres along the lanes. */
    show(worked) {
      mesh.geometry.setDrawRange(0, cellsDone(route, worked) * 18);
    },
  };
}

/**
 * The wheat still standing: a block of crop a metre tall, built in the order the
 * combine cuts it, so starting the draw range further along hides what is cut.
 */
function standingCrop(plot, route, [base, stripe]) {
  const positions = [];
  const colors = [];
  const tint = new THREE.Color();
  const quad = (corners, color) => {
    tint.set(color);
    for (const corner of [0, 2, 1, 0, 3, 2]) {
      positions.push(...corners[corner]);
      colors.push(tint.r, tint.g, tint.b);
    }
  };
  const point = (lx, lz, lift) => {
    const p = fieldPoint(lx, lz);
    return [p.x, terrainHeight(p.x, p.z) + lift, p.z];
  };
  for (const [x0, x1, za, zb] of cellsInOrder(plot, route)) {
    const outline = [
      [x0, za],
      [x1, za],
      [x1, zb],
      [x0, zb],
    ];
    const top = outline.map(([lx, lz]) => point(lx, lz, 0.95));
    const foot = outline.map(([lx, lz]) => point(lx, lz, 0.05));
    // The top in three rows, the middle one a shade darker.
    for (let row = 0; row < 3; row++) {
      const xa = x0 + ((x1 - x0) * row) / 3;
      const xb = x0 + ((x1 - x0) * (row + 1)) / 3;
      quad(
        [point(xa, za, 0.95), point(xb, za, 0.95), point(xb, zb, 0.95), point(xa, zb, 0.95)],
        row === 1 ? stripe : base,
      );
    }
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      quad([foot[side], foot[next], top[next], top[side]], STALKS);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, flatMaterial('#ffffff', { vertexColors: true, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  const perCell = 7 * 6;
  const total = positions.length / 3;
  return {
    mesh,
    /** Hides the wheat cut so far, `cut` metres along the lanes. */
    show(cut) {
      const start = Math.min(total, cellsDone(route, cut) * perCell);
      mesh.geometry.setDrawRange(start, total - start);
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
  return {
    kind: implement,
    root,
    wheels,
    /** Circles for collisions, as [right, behind, radius] from the middle of the tractor. */
    hits: [
      [0, -1.2, 1.3],
      [0, 1.2, 1.3],
      [0, 3.6, 1.3],
    ],
    /** It stops if the car is within `radius` of a point `ahead` metres in front: [ahead, radius]. */
    reach: [3.5, 4.5],
  };
}

/**
 * A combine harvester, front to -Z like the tractors: a wide cutting table with a
 * turning reel, the cab up high at the front and the grain tank behind it.
 */
function combineHarvester() {
  const root = new THREE.Group();
  const parts = new PartsBuilder();
  parts.box(2.6, 2, 5.2, COMBINE, { y: 1.9, z: 1 }); // body
  parts.box(2.4, 0.7, 1.6, COMBINE, { y: 3.25, z: 2.9 }); // engine
  parts.box(2.6, 1, 2.6, COMBINE, { y: 3.4, z: 0.7 }); // grain tank
  parts.box(2.7, 0.12, 2.7, WHITE, { y: 3.96, z: 0.7 });
  parts.box(1.9, 0.5, 0.4, DARK, { y: 1.3, z: 3.75 }); // straw spreader
  parts.add(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), DARK, { x: 0.8, y: 4, z: 3.2 }); // exhaust
  for (const x of [-1.55, 1.55]) parts.box(0.75, 0.1, 1.9, COMBINE, { x, y: 1.85, z: -0.9 }); // mudguards

  // The cab, on a platform at the front, with a ladder up the left side.
  parts.box(2.6, 0.2, 1.9, DARK, { y: 2.95, z: -1.15 });
  for (const x of [-0.85, 0.85]) {
    for (const z of [-1.95, -0.35]) parts.box(0.08, 1.35, 0.08, DARK, { x, y: 3.7, z });
  }
  parts.box(1.66, 1.3, 1.5, GLASS, { y: 3.7, z: -1.15 });
  parts.box(2, 0.14, 1.9, WHITE, { y: 4.42, z: -1.15 });
  parts.box(0.22, 0.2, 0.22, '#f0a03a', { x: 0.6, y: 4.59, z: -0.5 }); // beacon
  for (const x of [-0.5, 0.5]) parts.box(0.24, 0.14, 0.08, '#fff6d8', { x, y: 4.42, z: -2.12 }); // work lights
  for (const z of [-2.28, -1.98]) parts.box(0.05, 2.75, 0.05, '#b8beb7', { x: -1.2, y: 1.5, z });
  for (let k = 0; k < 6; k++) parts.box(0.05, 0.04, 0.3, '#b8beb7', { x: -1.2, y: 0.4 + k * 0.45, z: -2.13 });

  // The pipe for unloading grain, folded along the left of the tank.
  parts.box(0.32, 0.32, 3.4, COMBINE, { x: -1.5, y: 3.5, z: 1 });
  parts.box(0.3, 0.5, 0.3, DARK, { x: -1.5, y: 3.2, z: -0.6 });

  // The cutting table: a wide tray with pointed dividers at the ends, a cutter bar
  // along the front and an auger across it, fed up into the body.
  parts.beam({ x: 0, y: 1.6, z: -1.4 }, { x: 0, y: 0.9, z: -3 }, 1.3, COMBINE, 0.8);
  parts.box(HEADER, 0.3, 1.5, COMBINE, { y: 0.55, z: -3.6 });
  parts.box(HEADER, 0.9, 0.15, COMBINE, { y: 0.95, z: -2.9 });
  for (const x of [-HEADER / 2, HEADER / 2]) {
    parts.box(0.1, 0.8, 1.6, COMBINE, { x, y: 0.8, z: -3.6 });
    parts.add(new THREE.ConeGeometry(0.2, 0.9, 4), COMBINE, { x, y: 0.45, z: -4.75, rx: -Math.PI / 2 });
  }
  parts.box(HEADER, 0.06, 0.14, STEEL, { y: 0.42, z: -4.36 });
  parts.add(new THREE.CylinderGeometry(0.24, 0.24, HEADER - 0.3, 10), '#d8d2c0', {
    y: 0.92,
    z: -3.25,
    rz: Math.PI / 2,
  });
  for (const x of [-HEADER / 2 + 0.2, HEADER / 2 - 0.2]) {
    parts.beam({ x, y: 1.25, z: -2.9 }, { x, y: 1.55, z: -4 }, 0.14, COMBINE); // reel arms
  }
  root.add(parts.mesh());

  // The reel turns slowly, sweeping the wheat back onto the cutter bar.
  const reel = new THREE.Group();
  reel.position.set(0, 1.55, -4);
  const bats = new PartsBuilder();
  bats.add(new THREE.CylinderGeometry(0.07, 0.07, HEADER - 0.5, 6), STEEL, { rz: Math.PI / 2 });
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    bats.box(HEADER - 0.6, 0.08, 0.08, '#c9452f', { y: Math.sin(a) * 0.62, z: Math.cos(a) * 0.62 });
  }
  for (const x of [-HEADER / 2 + 0.35, 0, HEADER / 2 - 0.35]) {
    for (let k = 0; k < 3; k++) bats.box(0.05, 1.24, 0.05, STEEL, { x, rx: (k * Math.PI) / 3 });
  }
  reel.add(bats.mesh());
  root.add(reel);

  // Big drive wheels under the cab, small steering wheels at the back.
  const wheels = [
    ...[-1.55, 1.55].map(x => ({ x, z: -0.9, radius: 0.85, width: 0.62 })),
    ...[-1.2, 1.2].map(x => ({ x, z: 3, radius: 0.55, width: 0.42 })),
  ].map(({ x, z, radius, width }) => {
    const mesh = wheel(radius, width);
    mesh.position.set(x, radius + 0.06, z);
    root.add(mesh);
    return { mesh, radius };
  });
  root.traverse(child => {
    if (child.isMesh) child.castShadow = true;
  });
  return {
    kind: 'combine',
    root,
    wheels,
    reel,
    hits: [
      [0, -3.9, 1.3],
      [-2.2, -3.7, 1.1],
      [2.2, -3.7, 1.1],
      [0, -0.6, 1.8],
      [0, 2.4, 1.7],
    ],
    reach: [6, 5],
  };
}

/** Chaff blowing out of the back of the combine. One instanced mesh. */
function chaffCloud(scene) {
  const material = new THREE.MeshLambertMaterial({
    color: '#f1e8c6',
    transparent: true,
    opacity: 0.35,
    flatShading: true,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), material, CHAFF);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
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
  const { plough, mow, rapeseed, young, wheat } = FIELD_PLOTS;
  const crops = [
    ...rows(plough, CROPS.stubble),
    ...rows(mow, CROPS.meadow),
    ...rows(rapeseed, CROPS.rapeseed),
    ...rows(young, CROPS.young),
    ...rows(wheat, CROPS.stubble, HEADER),
  ];
  scene.add(fieldMesh(drape(crops, 0.05), -2));

  const parts = new PartsBuilder();
  const smoke = buildFarmstead(scene, parts, obstacles);
  scene.add(parts.mesh());

  // The three machines, each part of the way through its field.
  const workers = [
    { plot: plough, machine: farmTractor('#b5402f', 'plough'), speed: 1.7, start: 0.38, crop: CROPS.ploughed },
    { plot: mow, machine: farmTractor('#4f8a4b', 'mower'), speed: 2.1, start: 0.62, crop: CROPS.mown },
    { plot: wheat, machine: combineHarvester(), width: HEADER, speed: 1.4, start: 0.3, crop: CROPS.harvested },
  ].map(worker => {
    const route = laneRoute(worker.plot, worker.width);
    const ground = workedGround(worker.plot, route, worker.crop);
    scene.add(worker.machine.root, ground.mesh);
    return { ...worker, route, ground, d: route.total * worker.start };
  });
  const [plougher, , harvester] = workers;
  const standing = standingCrop(wheat, harvester.route, CROPS.wheat);
  scene.add(standing.mesh);
  const gulls = gullFlock(scene, 4);
  const chaff = chaffCloud(scene);
  const dummy = new THREE.Object3D();
  const colliders = [];
  let time = 0;

  const toWorld = (dx, dz) => {
    const cos = Math.cos(FIELDS.rotation);
    const sin = Math.sin(FIELDS.rotation);
    return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos };
  };

  return {
    /** Circles round the machines and what they pull, for collisions. */
    colliders,
    getState: () =>
      workers.map(w => ({
        kind: w.machine.kind,
        worked: w.route.at(w.d).worked,
        done: w.d >= w.route.total,
        x: w.machine.root.position.x,
        z: w.machine.root.position.z,
      })),
    update(dt, player) {
      time += dt;
      smoke.update(time);
      colliders.length = 0;
      const distance = player ? Math.hypot(player.x - FIELDS.x, player.z - FIELDS.z) : Infinity;
      const farFromFields = distance > 220;
      // From the valley the machines are specks; skip drawing them.
      const inSight = distance < 330;
      gulls.visible = chaff.visible = inSight;
      for (const worker of workers) worker.machine.root.visible = inSight;
      for (const worker of workers) {
        const { route, machine } = worker;
        const here = route.at(worker.d);
        const p = fieldPoint(here.lx, here.lz);
        const facing = toWorld(here.dx, here.dz);
        const heading = headingOf(facing.x, facing.z);
        // Stop for the car rather than drive into it.
        const [reach, room] = machine.reach;
        const ahead = { x: p.x + facing.x * reach, z: p.z + facing.z * reach };
        const blocked = player && Math.hypot(player.x - ahead.x, player.z - ahead.z) < room;
        worker.moving = false;
        if (worker.d >= route.total) {
          // Done. The field grows back while nobody is looking.
          if (farFromFields) worker.d = 0;
        } else if (!blocked) {
          worker.d = Math.min(route.total, worker.d + worker.speed * dt);
          worker.moving = true;
          for (const w of machine.wheels) w.mesh.rotation.x -= (worker.speed * dt) / w.radius;
        }
        const pose = chassisPose(p.x, p.z, heading, terrainHeight);
        machine.root.position.set(p.x, pose.height, p.z);
        machine.root.rotation.set(pose.pitch, heading, pose.roll, 'YXZ');
        // The worked ground starts behind the machine, not under it.
        worker.ground.show(Math.max(0, here.worked - 4));
        for (const [right, behind, radius] of machine.hits) {
          colliders.push({
            x: p.x - facing.x * behind - facing.z * right,
            z: p.z - facing.z * behind + facing.x * right,
            radius,
          });
        }
        worker.here = here;
        worker.position = p;
        worker.facing = facing;
      }

      // The wheat goes as the cutting table reaches it, but not past the end of the lane.
      const { lane, worked } = harvester.here;
      standing.show(Math.min((lane + 1) * harvester.route.length, worked + 4.4));
      if (harvester.moving) harvester.machine.reel.rotation.x -= dt * 2.2;
      // Chaff blows out of the back of the combine while it works.
      for (let i = 0; i < CHAFF; i++) {
        const t = (time * 0.7 + i / CHAFF) % 1;
        const behind = 4.6 + t * 5;
        const drift = Math.sin(i * 2.3) * t * 1.8;
        const x = harvester.position.x - harvester.facing.x * behind - harvester.facing.z * drift;
        const z = harvester.position.z - harvester.facing.z * behind + harvester.facing.x * drift;
        dummy.position.set(x, terrainHeight(x, z) + 1.1 + t * 1.4, z);
        dummy.rotation.set(t * 3, i, 0);
        dummy.scale.setScalar(harvester.moving ? (0.25 + t * 0.9) * Math.min(1, (1 - t) * 3) : 0);
        dummy.updateMatrix();
        chaff.setMatrixAt(i, dummy.matrix);
      }
      chaff.instanceMatrix.needsUpdate = true;

      // The gulls circle a few metres behind the plough.
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
