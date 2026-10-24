// The upland farm: a timber cottage and a tractor shed where the fields track ends, a rapeseed
// field, young crops, and three machines at work. One tractor ploughs a field of stubble, the
// furrows turning over right behind the plough with gulls following it; another mows a meadow
// of long grass down to short stripes, leaving rows of cut grass; and a combine harvester cuts
// the wheat, leaving stubble and rows of straw. Where their headlands meet they take turns, so
// they never run into each other. When a field is done and nobody is watching, it quietly grows
// back and the work starts again.
import * as THREE from 'three';
import { clamp, createRandom, fractalNoise, valueNoise } from '../../core/math.js';
import { createSteering, steer } from '../../core/steering.js';
import { chassisPose } from '../../core/suspension.js';
import { vehicleParts } from '../../vehicles/car.js';
import { FARMSTEAD, FIELDS, FIELD_PLOTS, fieldPoint } from '../layout.js';
import { headingOf } from '../path.js';
import { terrainHeight } from '../terrain.js';
import { SWAY, detailMap, foliageMaterial, groundMaterial } from '../detail.js';
import { TRAMPLE_PARS, cutTrample, growsTall, pressTrample, trampleUniforms } from '../trample.js';
import { PartsBuilder, flatMaterial, gableRoof, gableEnds, createSmoke, tintable } from '../build.js';
import { framer } from './frame.js';

/** Width of one pass of the plough or the mower. */
const LANE = 3.6;
/** Width of the combine's cutting table, and so of each pass it makes. */
const HEADER = 6;
/** Length of the cells the worked ground and the rows left behind the machines are built in. */
const CELL = 2;
/** How much room the machines keep between them, and how far apart along their routes that is checked. */
const CLEARANCE = 0.8;
const SAMPLE = 0.2;
const RUBBER = '#2c302e';
const STEEL = '#6b706b';
const DARK = '#3a3f3a';
const COMBINE = '#7ea33b';
const WHITE = '#f1efe6';
const GLASS = '#4f6f73';
/** Puffs of chaff behind the combine. */
const CHAFF = 10;
/** Length of the cells a standing crop is built in along the lanes. */
const CROP_CELL = 4;
/** Radius of a standing crop's rounded corners. */
const CORNER = 1.4;
/** Along the edges of a standing crop, the stalks hang down from the top in front of the shade this far in. */
const INSET = 0.3;
/** Furrows the plough turns over in each pass. */
const FURROWS = 7;

/** Ground colours: [base, stripe] for each crop. */
const CROPS = {
  stubble: ['#cdbb7e', '#c1ad6f'],
  rapeseed: ['#e8ce4b', '#dcc23f'],
  young: ['#a3bc70', '#8ea85f'],
  mown: ['#a9bd6e', '#bdc77c'], // the short grass the mower leaves, in stripes
  cut: ['#dccb90', '#cfbc7e'], // the stubble the combine leaves, in rows
};
/** The ploughed ground: the tops of the furrows, their faces, and the bottoms between them. */
const SOIL = [new THREE.Color('#9a7a54'), new THREE.Color('#7d6142'), new THREE.Color('#5a4330')];

const UP = new THREE.Vector3(0, 1, 0);
let stalk = null;
let blades = null;

/**
 * A stalk of wheat with its ear, to draw many of: thin, a little under a metre tall, darker and
 * greener low down, with a long ear nodding over towards +X at the top. Each side is lit as if
 * it faced a little upwards, so the stalks don't flicker light and dark as they turn.
 */
export function stalkGeometry() {
  if (stalk) return stalk;
  const positions = [];
  const normals = [];
  const colors = [];
  const normal = new THREE.Vector3();
  const middle = new THREE.Vector3();
  const add = (corners, tints, inside, upwards) => {
    normal.subVectors(corners[2], corners[1]).cross(new THREE.Vector3().subVectors(corners[0], corners[1]));
    // The stalk and the ear are closed, so each side faces away from the middle of it.
    if (normal.dot(middle.addVectors(corners[0], corners[1]).add(corners[2]).divideScalar(3).sub(inside)) < 0) {
      [corners, tints] = [
        [corners[0], corners[2], corners[1]],
        [tints[0], tints[2], tints[1]],
      ];
      normal.negate();
    }
    normal.normalize().lerp(UP, upwards).normalize();
    corners.forEach((p, n) => {
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(tints[n].r, tints[n].g, tints[n].b);
    });
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const C = hex => new THREE.Color(hex);
  // The stalk: three thin sides, so it shows whichever way it is turned.
  const neck = V(0.035, 0.9, 0);
  const foot = [0, 1, 2].map(k => V(Math.cos(k * 2.1) * 0.017, 0, Math.sin(k * 2.1) * 0.017));
  const [low, high] = [C('#5d6034'), C('#c2a656')];
  for (let k = 0; k < 3; k++) add([foot[k], foot[(k + 1) % 3], neck], [low, low, high], V(0, 0.45, 0), 0.45);
  // The ear: a spindle from the top of the stalk, leaning over.
  const along = V(0.5, 0.87, 0).normalize();
  const across = V(0, 0, 1);
  const up = new THREE.Vector3().crossVectors(across, along);
  const tip = neck.clone().addScaledVector(along, 0.18);
  const waist = neck.clone().addScaledVector(along, 0.08);
  const ring = [0, 1, 2].map(k =>
    waist
      .clone()
      .addScaledVector(across, Math.cos((k * Math.PI * 2) / 3) * 0.027)
      .addScaledVector(up, Math.sin((k * Math.PI * 2) / 3) * 0.027),
  );
  const [base, body, point] = [C('#cfa94c'), C('#ecc860'), C('#dcb34e')];
  for (let k = 0; k < 3; k++) {
    const [a, b] = [ring[k], ring[(k + 1) % 3]];
    add([neck, a, b], [base, body, body], waist, 0.65);
    add([a, tip, b], [body, point, body], waist, 0.65);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  stalk = tintable(geometry);
  return stalk;
}

/**
 * A tuft of meadow grass, to draw many of: six blades up to a metre tall from one root, dark at
 * the root and paler at the tips, leaning out. Each blade is a flat triangle with a face on both
 * sides, lit as if it faced upwards.
 */
function bladeGeometry() {
  if (blades) return blades;
  const positions = [];
  const colors = [];
  const [root, tip] = ['#3f5a28', '#a3bb62'].map(hex => new THREE.Color(hex));
  for (let k = 0; k < 6; k++) {
    const turn = k * 2.4;
    const height = [1, 0.7, 0.85, 0.6, 0.8, 0.9][k];
    const lean = 0.18 + (k % 3) * 0.09;
    const [ax, az] = [Math.cos(turn), Math.sin(turn)];
    const top = [ax * lean * height, height, az * lean * height];
    const sides = [
      [-az * 0.045, 0, ax * 0.045],
      [az * 0.045, 0, -ax * 0.045],
    ];
    for (const [a, b] of [sides, [sides[1], sides[0]]]) {
      positions.push(...a, ...b, ...top);
      colors.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      positions.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  blades = tintable(geometry);
  return blades;
}

/**
 * What a standing crop is like: how tall, in rows how far apart and how much lower between
 * them (and lower still right at its edge), how wide the teeth the stalks hang down in along its
 * edges are, how finely its top is built along the rows so it
 * can be laid over where it is driven through, its colours (riper or seeding in patches, darker
 * between the rows and among the stalks, and once laid over), how uneven its top is (`bumps`
 * across a few metres and across a couple), and the stalks drawn near the camera: along its
 * edges `gap` apart, and out of its top `ears` apart along each row and `spread` across it,
 * rising the first of `poke` above it and up to the second more, out to `range`, each `tint`ed.
 */
const WHEAT = {
  height: 0.95,
  row: 0.6,
  furrow: 0.12,
  shoulder: 0.14,
  tooth: 0.28,
  bumps: [0.17, 0],
  piece: 0.5,
  colors: {
    main: new THREE.Color('#e2bf56'),
    pale: new THREE.Color('#ecd47e'),
    deep: new THREE.Color('#cdb75c'),
    furrow: new THREE.Color('#a98b3d'),
    foot: new THREE.Color('#2f2e17'),
  },
  laid: '#e4c868',
  stalk: stalkGeometry,
  gap: 0.055,
  ears: 0.32,
  spread: 0.35,
  poke: [0.05, 0.07],
  range: 32,
  tint(random) {
    const warm = random();
    return new THREE.Color(1, 0.96 - warm * 0.06, 0.88 - warm * 0.14).multiplyScalar(0.86 + random() * 0.2);
  },
};
const MEADOW = {
  height: 0.6,
  row: 0.75,
  furrow: 0.015,
  shoulder: 0.1,
  tooth: 0.45,
  bumps: [0.12, 0.3],
  piece: 0.75,
  colors: {
    main: new THREE.Color('#7fa04a'),
    pale: new THREE.Color('#b1b46a'),
    deep: new THREE.Color('#5f8a3e'),
    furrow: new THREE.Color('#75984a'),
    foot: new THREE.Color('#25331a'),
  },
  laid: '#9ab45a',
  stalk: bladeGeometry,
  gap: 0.14,
  ears: 0.3,
  spread: 1,
  poke: [0.15, 0.3],
  range: 26,
  // Some tufts have gone over to seed, golden among the green.
  tint(random) {
    if (random() < 0.15) return new THREE.Color(1.35, 1.15, 0.62).multiplyScalar(0.9 + random() * 0.2);
    const dry = random();
    return new THREE.Color(0.92 + dry * 0.14, 0.98, 0.86 - dry * 0.1).multiplyScalar(0.85 + random() * 0.25);
  },
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

/** The fields are drawn like the ground, with its grain, a little in front of it. */
function fieldMesh(geometry, offset) {
  const material = groundMaterial({ polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
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

/**
 * The way a machine works a plot: up one lane, round at the headland, down the next. The
 * first lane runs up the plot's Z, or down it if `first` is -1, and at the end of the last
 * the machine drives on `overrun` metres, until what it pulls has done the end of the lane.
 */
function laneRoute(plot, width = LANE, first = 1, overrun = 0) {
  const lanes = Math.floor((plot.x1 - plot.x0) / width);
  const length = plot.z1 - plot.z0;
  const turn = (Math.PI * width) / 2;
  const way = i => (i % 2 ? -first : first);
  return {
    lanes,
    length,
    width,
    total: lanes * length + (lanes - 1) * turn + overrun,
    /** Which way lane `i` runs along the plot's Z: 1 up it, -1 down it. */
    way,
    /**
     * Position and direction (in the farmland's frame) after `d` metres; the lane it is on or
     * has just finished, how far along that it is, and how much of the lanes that makes; and
     * how far round the turn at the end of the lane it is, from 0 to 1.
     */
    at(d) {
      const i = Math.min(lanes - 1, Math.floor(d / (length + turn)));
      const t = d - i * (length + turn);
      const w = way(i);
      const x = plot.x0 + (i + 0.5) * width;
      if (t <= length || i === lanes - 1) {
        return {
          lx: x,
          lz: w > 0 ? plot.z0 + t : plot.z1 - t,
          dx: 0,
          dz: w,
          lane: i,
          along: t,
          worked: i * length + Math.min(t, length),
          turned: 0,
        };
      }
      const a = (t - length) / (width / 2);
      const end = w > 0 ? plot.z1 : plot.z0;
      return {
        lx: x + (width / 2) * (1 - Math.cos(a)),
        lz: end + w * Math.sin(a) * (width / 2),
        dx: Math.sin(a),
        dz: w * Math.cos(a),
        lane: i,
        along: length,
        worked: (i + 1) * length,
        turned: a / Math.PI,
      };
    },
  };
}

/**
 * How far along the lanes of `route` a machine's tool has worked, as `here` (from its `at`)
 * finds the machine: the tool works `lead` metres in front of it, or behind it if `lead` is
 * negative. A tool in front reaches into the next lane as the machine comes round the turn
 * into it; one behind finishes the end of the lane as the machine goes round.
 */
function reached(route, here, lead) {
  const { lane, along, turned } = here;
  const { length } = route;
  if (lead >= 0) {
    return turned
      ? (lane + 1) * length + lead * clamp(turned * 2 - 1, 0, 1)
      : lane * length + Math.min(length, along + lead);
  }
  return turned ? (lane + 1) * length + lead * (1 - turned) : lane * length + clamp(along + lead, 0, length);
}

/** Cells `cell` metres long down each lane, in working order, as [x0, x1, za, zb] in the farmland's frame. */
function cellsInOrder(plot, route, cell = CELL) {
  const cells = [];
  const perLane = Math.ceil(route.length / cell);
  for (let i = 0; i < route.lanes; i++) {
    const x0 = plot.x0 + i * route.width;
    for (let k = 0; k < perLane; k++) {
      const a = Math.min(route.length, k * cell);
      const b = Math.min(route.length, (k + 1) * cell);
      const [za, zb] = route.way(i) < 0 ? [plot.z1 - b, plot.z1 - a] : [plot.z0 + a, plot.z0 + b];
      cells.push([x0, x0 + route.width, za, zb]);
    }
  }
  return cells;
}

/** How many cells are done once `worked` metres of lane are. */
function cellsDone(route, worked, cell = CELL) {
  const perLane = Math.ceil(route.length / cell);
  const lane = Math.floor(worked / route.length);
  return Math.max(0, lane * perLane + Math.floor((worked - lane * route.length) / cell));
}

/** The circles a machine covers where `here` (from its route's `at`) finds it, as [lx, lz, radius] in the farmland's frame. */
function footprint(machine, { lx, lz, dx, dz }) {
  return machine.hits.map(([right, behind, radius]) => [
    lx - dx * behind - dz * right,
    lz - dz * behind + dx * right,
    radius,
  ]);
}

/**
 * Where two machines' routes come close enough for them to touch, they take turns. Each worker
 * gets its `stretches`, { from, to, worker, clashes }: the parts of its route, in metres along it,
 * where it could touch another machine somewhere on that one's route, each with the stretches of
 * the others it could touch from there. A machine only goes into a stretch while no other is in
 * one that clashes with it, and waits just short of it otherwise, where it is clear of anywhere
 * the others could be. So they never meet, and never both wait for the other.
 */
function shareGround(workers) {
  const GRID = 4;
  const samples = workers.map(({ route, machine }) => {
    const list = [];
    for (let d = 0; d < route.total + SAMPLE; d += SAMPLE) {
      const at = Math.min(d, route.total);
      const circles = footprint(machine, route.at(at));
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, z, r] of circles) {
        box[0] = Math.min(box[0], x - r - CLEARANCE);
        box[1] = Math.min(box[1], z - r - CLEARANCE);
        box[2] = Math.max(box[2], x + r);
        box[3] = Math.max(box[3], z + r);
      }
      list.push({ d: at, circles, box, touches: [], stretch: null });
    }
    return list;
  });
  // Where each route goes, and its samples in a grid, to find those near a point quickly.
  const key = (gx, gz) => gx * 4096 + gz;
  const bounds = samples.map(list =>
    list.reduce(
      (all, { box }) => [
        Math.min(all[0], box[0]),
        Math.min(all[1], box[1]),
        Math.max(all[2], box[2]),
        Math.max(all[3], box[3]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    ),
  );
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const grids = [];
  const gridOf = j => {
    if (grids[j]) return grids[j];
    grids[j] = new Map();
    samples[j].forEach(({ box }, index) => {
      for (let gx = Math.floor(box[0] / GRID); gx <= Math.floor(box[2] / GRID); gx++) {
        for (let gz = Math.floor(box[1] / GRID); gz <= Math.floor(box[3] / GRID); gz++) {
          if (!grids[j].has(key(gx, gz))) grids[j].set(key(gx, gz), []);
          grids[j].get(key(gx, gz)).push(index);
        }
      }
    });
    return grids[j];
  };
  const touching = (a, b) =>
    overlap(a.box, b.box) &&
    a.circles.some(([ax, az, ar]) =>
      b.circles.some(([bx, bz, br]) => Math.hypot(ax - bx, az - bz) < ar + br + CLEARANCE),
    );
  for (let i = 0; i < workers.length; i++) {
    for (let j = i + 1; j < workers.length; j++) {
      if (!overlap(bounds[i], bounds[j])) continue;
      samples[i].forEach((sample, s) => {
        const { box } = sample;
        if (!overlap(box, bounds[j])) return;
        const checked = new Set();
        for (let gx = Math.floor(box[0] / GRID); gx <= Math.floor(box[2] / GRID); gx++) {
          for (let gz = Math.floor(box[1] / GRID); gz <= Math.floor(box[3] / GRID); gz++) {
            for (const t of gridOf(j).get(key(gx, gz)) ?? []) {
              if (checked.has(t)) continue;
              checked.add(t);
              if (!touching(sample, samples[j][t])) continue;
              sample.touches.push([j, t]);
              samples[j][t].touches.push([i, s]);
            }
          }
        }
      });
    }
  }
  // Runs of samples that touch another route make the stretches, from the last sample clear before to the first after.
  workers.forEach((worker, i) => {
    worker.stretches = [];
    for (const sample of samples[i]) {
      if (!sample.touches.length) continue;
      const last = worker.stretches.at(-1);
      if (last && sample.d - SAMPLE <= last.to + SAMPLE) last.to = sample.d + SAMPLE;
      else worker.stretches.push({ from: sample.d - SAMPLE, to: sample.d + SAMPLE, worker, clashes: new Set() });
      sample.stretch = worker.stretches.at(-1);
    }
  });
  samples.forEach(list => {
    for (const sample of list) for (const [j, t] of sample.touches) sample.stretch.clashes.add(samples[j][t].stretch);
  });
}

/** Whether a worker `d` metres along its route (where it is if not given) is inside `stretch`. */
const inside = (stretch, d = stretch.worker.d) => d > stretch.from && d <= stretch.to;

/** Whether `worker` may go on to `next` metres along its route: not into a stretch that clashes with one another machine is in. */
function mayGo(worker, next) {
  return worker.stretches.every(
    stretch =>
      !(next > stretch.from && worker.d <= stretch.from && inside(stretch, next)) ||
      [...stretch.clashes].every(other => !inside(other)),
  );
}

/** Whether `worker` may start again from the beginning of its route. */
function mayStart(worker) {
  return worker.stretches.every(stretch => !inside(stretch, 0) || [...stretch.clashes].every(other => !inside(other)));
}

/**
 * The material for standing crops and for what the machines leave behind them. Each vertex
 * knows how far along the route of the machine working it its spot is (`along`) and is held
 * between `from` and `to` metres along it, so edges follow the machine exactly rather than a
 * cell at a time: a crop behind the cutter slides up to it, and the worked ground and the rows
 * left behind grow out of the back. Standing crops are drawn in grain from the detail texture,
 * speckled on top and streaked down the sides; waves of wind run over the tops (`sway` is how
 * far a vertex moves in the wind, and how high it stands as a share of the crop's `height`);
 * and they are laid over where a car has driven through and bent ahead of one pushing through
 * (see trample.js), lying `laid` coloured. The ploughed ground (`soil`) has clods rather than ears.
 */
function cropMaterial(point, { height = 0, laid = '#ffffff', soil = false } = {}) {
  const origin = point(0, 0);
  const ahead = point(0, 1);
  const uniforms = {
    cropFrom: { value: -1e6 },
    cropTo: { value: 1e6 },
    // The way the rows run, in the world.
    cropAxis: { value: new THREE.Vector2(ahead.x - origin.x, ahead.z - origin.z) },
    cropHeight: { value: height },
    cropLaid: { value: new THREE.Color(laid) },
  };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  if (soil) material.defines = { CROP_SOIL: '' };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, trampleUniforms(), { groundDetail: detailMap(), swayTime: SWAY.time });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CROP_PARS}\n${TRAMPLE_PARS}\n${CROP_ATTRIBUTES}`)
      .replace('#include <begin_vertex>', CROP_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CROP_PARS}\n${TRAMPLE_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${CROP_DETAIL}`);
  };
  return { material, uniforms };
}

const CROP_PARS = /* glsl */ `
  uniform float cropFrom;
  uniform float cropTo;
  uniform vec2 cropAxis;
  uniform float cropHeight;
  uniform vec3 cropLaid;
  uniform float swayTime;
  uniform sampler2D groundDetail;
  varying vec3 vCrop;
  varying float vSway;
`;

const CROP_ATTRIBUTES = /* glsl */ `
  attribute float along;
  attribute float way;
  attribute float sway;
`;

const CROP_VERTEX = /* glsl */ `
  #include <begin_vertex>
  transformed.xz += cropAxis * way * ( clamp( along, cropFrom, cropTo ) - along );
  // Waves of wind rolling over the field.
  float wind = sin( swayTime * 1.3 - dot( transformed.xz, vec2( 0.16, 0.1 ) ) )
    + 0.4 * sin( swayTime * 2.1 + dot( transformed.xz, vec2( 0.07, -0.23 ) ) );
  transformed.xz += vec2( 0.05, 0.032 ) * wind * sway;
  // Laid over the way a car went where it has driven through, or bent ahead of one pushing
  // through: the top comes down as the stalks under it go over, a little below the stalks
  // drawn near the camera so they show lying on it, and forward a little. Lying down, the
  // rows it grew in no longer show in the light.
  if ( sway > 0.0 ) {
    vec3 lay = trampled( transformed );
    float fall = pow( lay.x, 0.8 ) * 1.45;
    float tall = sway * cropHeight;
    transformed.y -= tall * ( 1.0 - cos( min( fall * 1.15, 1.4 ) ) );
    transformed.xz += lay.yz * tall * sin( fall ) * 0.3;
    vec3 up = normalMatrix * vec3( 0.0, 1.0, 0.0 );
    vNormal = normalize( mix( vNormal, up * sign( dot( vNormal, up ) ), smoothstep( 0.3, 1.2, fall ) ) );
  }
  vCrop = transformed;
  vSway = sway;
`;

const CROP_DETAIL = /* glsl */ `
  {
    float near = 1.0 - smoothstep( 30.0, 150.0, distance( vCrop, cameraPosition ) );
    #ifdef CROP_SOIL
      // Clods of earth, and lumps along the furrows.
      float clods = texture2D( groundDetail, vCrop.xz / 0.9 ).a;
      float lumps = texture2D( groundDetail, vCrop.xz / 7.0 + 0.3 ).r;
      diffuseColor.rgb *= 1.0 + ( clods - 0.5 ) * 0.5 * near + ( lumps - 0.5 ) * 0.2;
    #else
      // Ears and stalks, finer than the shapes: speckled on top, streaked down the sides, and
      // finer still close by.
      float ears = texture2D( groundDetail, vCrop.xz / 1.4 ).a;
      float close = 1.0 - smoothstep( 4.0, 20.0, distance( vCrop, cameraPosition ) );
      ears += ( texture2D( groundDetail, vCrop.xz / 0.37 + 0.5 ).a - 0.5 ) * 0.8 * close;
      // Patches the wind ruffles, drifting over the field, and riper patches that stay put.
      float gusts = texture2D( groundDetail, vCrop.xz / 29.0 - swayTime * vec2( 0.016, 0.01 ) ).r;
      float patches = texture2D( groundDetail, vCrop.xz / 70.0 + 0.4 ).g;
      float wind = ( gusts - 0.5 ) * 0.3 * min( vSway, 1.0 );
      // Where it has been driven through, the stalks lie in long streaks the way the car went,
      // paler where they catch the light and darker in the gaps between them, and pressed
      // darker still where the wheels went. Where the top drops away to them, the stalks
      // still standing show their shaded sides.
      vec3 lay = trampledMap( vCrop.xz );
      float laid = smoothstep( 0.15, 0.7, lay.x ) * step( 0.01, vSway );
      vec2 lie = vec2( dot( vCrop.xz, lay.yz ), dot( vCrop.xz, vec2( lay.z, -lay.y ) ) );
      float straws = texture2D( groundDetail, vec2( lie.x / 11.0, lie.y / 1.3 ) ).a;
      straws += ( texture2D( groundDetail, vec2( lie.x / 5.0, lie.y / 0.45 ) + 0.3 ).a - 0.5 ) * 0.8 * close;
      float pressed = smoothstep( 0.85, 0.97, lay.x ) * laid;
      diffuseColor.rgb = mix( diffuseColor.rgb, cropLaid * ( 1.0 - pressed * 0.32 ), laid * 0.85 );
      ears = mix( ears, 0.5 + ( straws - 0.5 ) * 1.7, laid );
      float upright = normalize( cross( dFdx( vCrop ), dFdy( vCrop ) ) ).y;
      float wall = smoothstep( 0.88, 0.55, abs( upright ) ) * smoothstep( 0.9, 0.99, vSway ) * near;
      float streaks = texture2D( groundDetail, vec2( ( vCrop.x + vCrop.z ) / 0.5, vCrop.y / 3.0 ) ).a;
      diffuseColor.rgb *= 1.0 + ( ears - 0.5 ) * 0.6 * near + wind * ( 1.0 - laid ) + ( patches - 0.5 ) * 0.16;
      diffuseColor.rgb *= 1.0 - wall * ( 0.4 + ( streaks - 0.5 ) * 0.5 );
    #endif
  }
`;

/** Geometry for the crop material from its corners, three to a triangle (see `cropMaterial`). */
function cropGeometry({ positions, normals, colors, along, way, sway }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute('way', new THREE.Float32BufferAttribute(way, 1));
  geometry.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
  geometry.computeBoundingSphere();
  // The lists are long and no longer needed, but the builder they came from may be kept.
  for (const list of [positions, normals, colors, along, way, sway]) list.length = 0;
  return geometry;
}

/**
 * Collects the corners of crop triangles. A corner is { lx, lz, lift, color, along, way, sway }
 * (see `cropMaterial`), `lift` above the ground there or above `ground` if it has one. A triangle
 * is lit as it faces, or as if it faced `light`, and then its corners are turned so that its
 * front faces that way too: the sides of the wheat are lit as if they faced a little upwards, as
 * the stalks and ears along them do.
 */
function cropCorners(point) {
  const buffers = { positions: [], normals: [], colors: [], along: [], way: [], sway: [] };
  const corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const normal = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const origin = point(0, 0);
  const triangle = (a, b, c, light = null) => {
    const corners = [a, b, c];
    corners.forEach(({ lx, lz, lift, ground }, n) => {
      const p = point(lx, lz);
      corner[n].set(p.x, (ground ?? terrainHeight(p.x, p.z)) + lift, p.z);
    });
    normal.subVectors(corner[2], corner[1]).cross(edge.subVectors(corner[0], corner[1])).normalize();
    const order = light && normal.dot(light) < 0 ? [0, 2, 1] : [0, 1, 2];
    if (light) normal.copy(light);
    for (const n of order) {
      const { color, along, way, sway } = corners[n];
      buffers.positions.push(corner[n].x, corner[n].y, corner[n].z);
      buffers.normals.push(normal.x, normal.y, normal.z);
      buffers.colors.push(color.r, color.g, color.b);
      buffers.along.push(along);
      buffers.way.push(way);
      buffers.sway.push(sway);
    }
  };
  return {
    buffers,
    triangle,
    quad(a, b, c, d, light) {
      triangle(a, b, c, light);
      triangle(a, c, d, light);
    },
    /** The direction (dx, dz) in the frame, in the world, tipped up by `up`. */
    direction(dx, dz, up) {
      const p = point(dx, dz);
      return new THREE.Vector3(p.x - origin.x, up, p.z - origin.z).normalize();
    },
    get count() {
      return buffers.along.length;
    },
  };
}

/**
 * Something the machines leave behind them, built from `cells` (as from `cellsInOrder`) by
 * `build(cell, index)` with the corners of `parts`, in working order, so drawing up to the cell
 * being worked shows exactly what is done so far, its far end held at the tool.
 */
function workedMesh(route, parts, cells, build, options) {
  const starts = [];
  cells.forEach((cell, index) => {
    starts.push(parts.count);
    build(cell, index);
  });
  starts.push(parts.count);
  const { material, uniforms } = cropMaterial(fieldPoint, options);
  const mesh = new THREE.Mesh(cropGeometry(parts.buffers), material);
  mesh.receiveShadow = true;
  return {
    mesh,
    /** Shows what is left so far, `worked` metres along the lanes. */
    show(worked) {
      uniforms.cropTo.value = worked;
      const cells = worked > 0 ? cellsDone(route, worked) + 1 : 0;
      mesh.geometry.setDrawRange(0, starts[Math.min(starts.length - 1, cells)]);
    },
  };
}

/**
 * The ploughed ground: furrows turned over down each pass, each a ridge of earth with a steep
 * side and a gentle one, lit on top and dark in the bottom between two.
 */
function ploughedGround(plot, route) {
  const soil = cropCorners(fieldPoint);
  const perLane = Math.ceil(route.length / CELL);
  const pitch = route.width / FURROWS;
  const profile = [
    [0, 0.07, SOIL[2]],
    [0.62, 0.22, SOIL[0]],
    [1, 0.07, SOIL[2]],
  ];
  return workedMesh(
    route,
    soil,
    cellsInOrder(plot, route),
    ([x0, , za, zb], index) => {
      const lane = Math.floor(index / perLane);
      const way = route.way(lane);
      const along = lz => lane * route.length + (way > 0 ? lz - plot.z0 : plot.z1 - lz);
      const [near, far] = way > 0 ? [za, zb] : [zb, za];
      for (let f = 0; f < FURROWS; f++) {
        // A little uneven, so the furrows don't look ruled.
        const corner = (n, lz) => {
          const [u, lift, color] = profile[n];
          const bump = n === 1 ? (valueNoise((x0 + f * pitch) / 1.3, lz / 1.7, 23) - 0.5) * 0.08 : 0;
          return { lx: x0 + (f + u) * pitch, lz, lift: lift + bump, color, along: along(lz), way, sway: 0 };
        };
        for (let n = 0; n < 2; n++) soil.quad(corner(n, near), corner(n + 1, near), corner(n + 1, far), corner(n, far));
        // The end of the ridge, where the plough is turning it over.
        soil.triangle(corner(0, far), corner(1, far), corner(2, far));
      }
    },
    { soil: true },
  );
}

/**
 * The rows the machines leave behind them, a low ridge down the middle of each pass: the
 * straw out of the back of the combine, or the cut grass behind the mower, `width` across and
 * `height` tall, in `colors` [top, sides].
 */
function swaths(plot, route, colors, width, height) {
  const straw = cropCorners(fieldPoint);
  const across = [-0.62, -0.32, 0, 0.32, 0.62];
  const rise = [0.02, 0.17, 0.26, 0.17, 0.02].map(lift => (lift / 0.26) * height);
  const perLane = Math.ceil(route.length / CELL);
  /** The ridge across the pass at `lz`, as corners from one side to the other. */
  const section = (lx, lz, lane, way) => {
    const wide = width * (0.8 + valueNoise(lz / 2.3, lane * 3.1, 11) * 0.4);
    const tall = 0.75 + valueNoise(lz / 1.7, lane * 2.3, 13) * 0.5;
    const along = lane * route.length + (way > 0 ? lz - plot.z0 : plot.z1 - lz);
    return across.map((u, n) => ({
      lx: lx + u * wide,
      lz,
      lift: rise[n] * tall,
      color: colors[n === 2 ? 0 : 1],
      along,
      way,
      sway: 0,
    }));
  };
  /** The end of a row, sloping down to the ground `beyond` the section. */
  const end = (corners, beyond) => {
    const tip = { ...corners[2], lz: corners[2].lz + beyond, lift: 0.02 };
    for (let n = 0; n < 4; n++) straw.triangle(corners[n], corners[n + 1], tip);
  };
  return workedMesh(route, straw, cellsInOrder(plot, route), ([x0, x1, za, zb], index) => {
    const lane = Math.floor(index / perLane);
    const way = route.way(lane);
    const [near, far] = way > 0 ? [za, zb] : [zb, za];
    const a = section((x0 + x1) / 2, near, lane, way);
    const b = section((x0 + x1) / 2, far, lane, way);
    for (let n = 0; n < 4; n++) straw.quad(a[n], a[n + 1], b[n + 1], b[n]);
    if (index % perLane === 0) end(a, -way * 0.6);
    end(b, way * 0.6);
  });
}

/**
 * Stalks drawn one by one near the camera: one instanced mesh of `geometry`, refilled when the
 * camera has moved, with those of `items` within `range` of it. The items are lists of numbers,
 * for each stalk in turn: its matrix, its colour, its span and where it stands (x, z). The
 * material hides those whose bit of the crop is cut (see `foliageMaterial`): with a span of
 * [from, until, slide, start] a stalk is drawn once the crop is cut `from` metres along its route
 * and until it is cut `until`, and those along the edge it is cut from (`slide` is the way the
 * machine goes, along the rows) are carried along in front of the cutter once it has passed `start`.
 */
function nearStalks(items, geometry, range, crop) {
  const STEP = 3;
  const [matrices, colors, spans, places] = [items.matrices, items.colors, items.spans, items.places].map(
    list => new Float32Array(list),
  );
  const count = places.length / 2;
  const size = Math.max(1, count);
  // The stalks' own copy of the shape, to carry the spans along with it.
  const shape = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) shape.setAttribute(name, attribute);
  const span = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
  shape.setAttribute('cropSpan', span);
  const mesh = new THREE.InstancedMesh(shape, foliageMaterial('grass', range, crop), size);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(size * 3), 3);
  mesh.count = 0;
  mesh.frustumCulled = false;
  // The camera is only known while drawing, so the stalks are filled for where it was last time.
  const eye = new THREE.Vector3(Infinity, 0, Infinity);
  mesh.onBeforeRender = (renderer, scene, camera) => eye.setFromMatrixPosition(camera.matrixWorld);
  const filled = { x: Infinity, z: Infinity, cut: -Infinity };
  const box = new THREE.Box2();
  for (let i = 0; i < count; i++) box.expandByPoint(new THREE.Vector2(places[i * 2], places[i * 2 + 1]));
  const corner = new THREE.Vector2();
  const reach = (range + STEP) ** 2;
  const copy = (from, to, i, n, width) => {
    for (let k = 0; k < width; k++) to[n * width + k] = from[i * width + k];
  };
  return {
    mesh,
    /** Refills the stalks around the camera if it has moved, or the crop has grown back or been cut much further. */
    update(cut) {
      if (!Number.isFinite(eye.x)) return;
      const moved = Math.hypot(eye.x - filled.x, eye.z - filled.z) > STEP;
      if (!moved && cut >= filled.cut && cut < filled.cut + 10) return;
      Object.assign(filled, { x: eye.x, z: eye.z, cut });
      let n = 0;
      if (box.distanceToPoint(corner.set(eye.x, eye.z)) < range + STEP) {
        for (let i = 0; i < count; i++) {
          // Those already cut stay cut until the crop grows back.
          const [x, z] = [places[i * 2], places[i * 2 + 1]];
          if ((x - eye.x) ** 2 + (z - eye.z) ** 2 > reach || cut >= spans[i * 4 + 1]) continue;
          copy(matrices, mesh.instanceMatrix.array, i, n, 16);
          copy(colors, mesh.instanceColor.array, i, n, 3);
          copy(spans, span.array, i, n, 4);
          n++;
        }
      }
      if (n === 0 && mesh.count === 0) return;
      mesh.count = n;
      for (const attribute of [mesh.instanceMatrix, mesh.instanceColor, span]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, n * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    },
  };
}

/**
 * A standing crop of `stand` (WHEAT or MEADOW) on `plot`, in the frame `point` maps from: rows
 * down the plot's Z, a little uneven and with rounded corners. Close to the camera, stalks stand
 * along its edges and out of its top along the rows. It is built in cells down the lanes of
 * `route`, in the order the machine cuts them, so starting the draw range at a later cell hides
 * those cut so far. Without a route it is one lane, never cut.
 */
function standingCrop(plot, point, route, stand) {
  const lanes = route ?? { lanes: 1, width: plot.x1 - plot.x0, length: plot.z1 - plot.z0, way: () => 1 };
  const random = createRandom(Math.round(plot.x0 * 31 + plot.z1 * 17));
  const crop = cropCorners(point);
  const { colors } = stand;
  const rows = Math.round(lanes.width / stand.row);
  const row = lanes.width / rows;
  const perLane = Math.ceil(lanes.length / CROP_CELL);
  let lane = 0;
  let way = 1;
  const alongAt = lz => lane * lanes.length + (way > 0 ? lz - plot.z0 : plot.z1 - lz);
  /** How far (lx, lz) is from the middle of its row, from 0 there to 1 between two rows. */
  const across = lx => Math.abs((((lx - plot.x0) / row) % 1) - 0.5) * 2;
  const [broad, fine] = stand.bumps;
  const height = (lx, lz) =>
    stand.height *
      (1 + (valueNoise(lx / 6, lz / 6, 5) - 0.5) * broad + (valueNoise(lx / 1.9, lz / 1.9, 9) - 0.5) * fine) -
    across(lx) * stand.furrow;
  /**
   * The edge of the plot nearest (lx, lz), with its corners rounded: the point on it and which
   * way it faces, as [lx, lz, ox, oz]. A point inside the rounded corners is left where it is.
   */
  const rim = (lx, lz, inside = false) => {
    const cx = Math.min(Math.max(lx, plot.x0 + CORNER), plot.x1 - CORNER);
    const cz = Math.min(Math.max(lz, plot.z0 + CORNER), plot.z1 - CORNER);
    const d = Math.hypot(lx - cx, lz - cz);
    if (d === 0 || (inside && d <= CORNER)) return [lx, lz, 0, 0];
    const [ox, oz] = [(lx - cx) / d, (lz - cz) / d];
    return [cx + ox * CORNER, cz + oz * CORNER, ox, oz];
  };
  /** The top of the crop at (lx, lz): riper in patches, darker down between the rows. */
  const top = (lx, lz) => {
    const ripeness = fractalNoise(lx / 18, lz / 18, 2, 7);
    const color = colors.main
      .clone()
      .lerp(ripeness > 0.5 ? colors.pale : colors.deep, Math.abs(ripeness - 0.5) * 1.6)
      .lerp(colors.furrow, across(lx) * 0.55);
    const [x, z, ox, oz] = rim(lx, lz, true);
    // Lower along the edge of the field, where the stalks stand up above it.
    const atEdge = ox || oz || Math.min(lx - plot.x0, plot.x1 - lx, lz - plot.z0, plot.z1 - lz) < 1e-6;
    return {
      lx: x,
      lz: z,
      lift: height(lx, lz) - (atEdge ? stand.shoulder : 0),
      color,
      along: alongAt(lz),
      way,
      sway: 1,
    };
  };
  const foot = ({ lx, lz, along }) => ({ lx, lz, lift: -0.05, color: colors.foot, along, way, sway: 0 });
  /**
   * An edge of the crop through `tops`, facing `outward`: the stalks hang down from its top in
   * ragged teeth, bright at the top and darker lower down, in front of the shade further in,
   * darker still and greener low down. Corners further in keep the `along` of those at the edge,
   * so the edge the machine cuts from slides along in one piece.
   */
  const edge = (tops, [ox, oz]) => {
    const light = crop.direction(ox, oz, 0.6);
    const shade = (corner, lift, darker, inset = 0) => ({
      ...corner,
      lx: corner.lx - ox * inset,
      lz: corner.lz - oz * inset,
      lift: corner.lift * lift,
      color: corner.color.clone().multiplyScalar(darker),
      sway: corner.sway * lift,
    });
    // Between two of `tops`, at the height of the top of the crop between them.
    const ground = ({ lx, lz }) => {
      const p = point(lx, lz);
      return terrainHeight(p.x, p.z);
    };
    const between = (a, b, t) => ({
      ...a,
      lx: a.lx + (b.lx - a.lx) * t,
      lz: a.lz + (b.lz - a.lz) * t,
      lift: a.lift + (b.lift - a.lift) * t,
      along: a.along + (b.along - a.along) * t,
      color: a.color.clone().lerp(b.color, t),
      ground: a.ground + (b.ground - a.ground) * t,
    });
    for (let n = 0; n + 1 < tops.length; n++) {
      const [a, b] = [tops[n], tops[n + 1]].map(top => ({ ...top, ground: ground(top) }));
      crop.quad(
        foot(shade(a, 1, 1, INSET)),
        foot(shade(b, 1, 1, INSET)),
        shade(b, 0.75, 0.3, INSET),
        shade(a, 0.75, 0.3, INSET),
        light,
      );
      const teeth = Math.max(1, Math.round(Math.hypot(b.lx - a.lx, b.lz - a.lz) / stand.tooth));
      for (let k = 0; k < teeth; k++) {
        const [p, q] = [between(a, b, k / teeth), between(a, b, (k + 1) / teeth)];
        const tip = shade(between(a, b, (k + 0.3 + random() * 0.4) / teeth), 0.3 + random() * 0.3, 0.4);
        crop.quad(shade(p, 0.75, 0.55), shade(q, 0.75, 0.55), shade(q, 1, 0.72), shade(p, 1, 0.72), light);
        crop.triangle(shade(p, 0.75, 0.55), tip, shade(q, 0.75, 0.55), light);
      }
    }
  };
  /**
   * Where to break the cell from `za` to `zb` along the rows: every `piece` so the top can be
   * laid over where a car drives through, and finely in the rounded corners.
   */
  const breaks = (za, zb, outer) => {
    const pieces = Math.max(1, Math.round((zb - za) / stand.piece));
    const even = Array.from({ length: pieces - 1 }, (_, n) => za + ((n + 1) * (zb - za)) / pieces);
    const fine = outer ? [0.2, 0.45, 0.75, 1].flatMap(t => [plot.z0 + t * CORNER, plot.z1 - t * CORNER]) : [];
    return [za, ...[...even, ...fine].filter(z => z > za + 0.05 && z < zb - 0.05), zb].sort((a, b) => a - b);
  };

  const starts = [];
  let along = [];
  cellsInOrder(plot, lanes, CROP_CELL).forEach(([x0, x1, za, zb], index) => {
    lane = Math.floor(index / perLane);
    way = lanes.way(lane);
    const k = index % perLane;
    starts.push(crop.count);
    const outer = lane === 0 || lane === lanes.lanes - 1;
    const zs = breaks(za, zb, outer);
    along = k === 0 ? zs : [...along, ...zs];
    // The tops of the rows, each a ridge if it is sown in drill rows.
    for (let r = 0; r < rows; r++) {
      const [xa, xm, xb] = [x0 + r * row, x0 + (r + 0.5) * row, x0 + (r + 1) * row];
      for (let n = 0; n + 1 < zs.length; n++) {
        const [a, b] = [zs[n], zs[n + 1]];
        if (stand.furrow < 0.05) {
          crop.quad(top(xa, a), top(xb, a), top(xb, b), top(xa, b));
          continue;
        }
        crop.quad(top(xa, a), top(xm, a), top(xm, b), top(xa, b));
        crop.quad(top(xm, a), top(xb, a), top(xb, b), top(xm, b));
      }
    }
    if (k < perLane - 1) return;
    // The edges of the lane, with its last cell, so they are drawn until it is all cut: the
    // near side stands at the edge of the field or of the lane cut before it, the end the
    // machine comes in from slides along in front of its cutter, and the far end.
    const lengthwise = [...new Set(along)].sort((a, b) => a - b);
    const halfRows = Array.from({ length: rows * 2 + 1 }, (_, n) => x0 + (n * row) / 2);
    edge(
      lengthwise.map(z => top(x0, z)),
      [-1, 0],
    );
    if (lane === lanes.lanes - 1)
      edge(
        lengthwise.map(z => top(x1, z)),
        [1, 0],
      );
    const [near, far] = way > 0 ? [plot.z0, plot.z1] : [plot.z1, plot.z0];
    edge(
      halfRows.map(x => top(x, near)),
      [0, -way],
    );
    edge(
      halfRows.map(x => top(x, far)),
      [0, way],
    );
  });
  starts.push(crop.count);
  const { material, uniforms } = cropMaterial(point, { height: stand.height, laid: stand.laid });
  const mesh = new THREE.Mesh(cropGeometry(crop.buffers), material);
  mesh.receiveShadow = true;
  // A car anywhere in it lays it over.
  for (let lx = plot.x0; lx < plot.x1 + 4; lx += 4) {
    for (let lz = plot.z0; lz < plot.z1 + 4; lz += 4) {
      const p = point(Math.min(lx, plot.x1), Math.min(lz, plot.z1));
      growsTall(p.x, p.z, 3);
    }
  }

  // The stalks close to the camera: along the edges, then out of the tops of the rows.
  const items = { matrices: [], colors: [], spans: [], places: [] };
  const dummy = new THREE.Object3D();
  const origin = point(0, 0);
  const ahead = point(0, 1);
  const axis = new THREE.Vector2(ahead.x - origin.x, ahead.z - origin.z);
  const geometry = stand.stalk();
  const stalkHeight = geometry.boundingBox.max.y;
  const scale = stand.height / WHEAT.height;
  /** A stalk at (lx, lz) whose top is `height` above the ground, leaning `lean` towards (ox, oz). */
  const stalkAt = (lx, lz, height, [ox, oz], extra, lean) => {
    const p = point(lx, lz);
    const q = point(lx + ox, lz + oz);
    dummy.position.set(p.x, terrainHeight(p.x, p.z), p.z);
    dummy.rotation.set(
      (random() - 0.5) * 0.15,
      Math.atan2(-(q.z - p.z), q.x - p.x) + (random() - 0.5) * 1.2,
      -lean,
      'YXZ',
    );
    dummy.scale.set(1, height / stalkHeight, 1);
    dummy.updateMatrix();
    const { from = -1e6, until = 1e6, slide = 0, start = 0 } = extra;
    items.matrices.push(...dummy.matrix.elements);
    items.colors.push(...stand.tint(random).toArray());
    items.spans.push(...[from, until, slide, start].map(value => clamp(value, -1e6, 1e6)));
    items.places.push(p.x, p.z);
  };
  const L = lanes.length;
  /**
   * Stalks along an edge from (ax, az) to (bx, bz), a few missing and some taller, leaning out
   * `outward`, or out of the plot's rounded edge without it. `at(lz)` says when each is drawn.
   */
  const fringe = (ax, az, bx, bz, at, outward = null) => {
    const steps = Math.round(Math.hypot(bx - ax, bz - az) / stand.gap);
    for (let n = 0; n < steps; n++) {
      const t = (n + random()) / steps;
      if (random() < 0.12) continue;
      const [px, pz] = [ax + (bx - ax) * t, az + (bz - az) * t];
      const [lx, lz, ox, oz] = outward ? [px, pz, ...outward] : rim(px, pz);
      // Some in front of the edge, some just inside it, their tops above the top of the crop.
      const out = random() * 0.5 - 0.28;
      const tall = random() < 0.08 ? (0.15 + random() * 0.15) * scale : 0;
      const [x, z] = [lx + ox * out, lz + oz * out];
      const ear = height(x, z) + ((out > 0 ? -0.04 : 0.02) + random() * 0.16) * scale + tall;
      stalkAt(x, z, ear, [ox, oz], at(lz), 0.05 + random() * 0.3);
    }
  };
  for (lane = 0; lane < lanes.lanes; lane++) {
    way = lanes.way(lane);
    const x0 = plot.x0 + lane * lanes.width;
    const x1 = x0 + lanes.width;
    const i = lane;
    // Down the near side, bared once the lane before it has been cut alongside.
    if (i === 0) fringe(x0, plot.z0, x0, plot.z1, lz => ({ until: alongAt(lz) }));
    else fringe(x0, plot.z0, x0, plot.z1, lz => ({ from: 2 * i * L - alongAt(lz), until: alongAt(lz) }), [-1, 0]);
    if (lane === lanes.lanes - 1) fringe(x1, plot.z0, x1, plot.z1, lz => ({ until: alongAt(lz) }));
    // Across the end it is cut from, carried along in front of the cutter, and the far end.
    const [near, far] = way > 0 ? [plot.z0, plot.z1] : [plot.z1, plot.z0];
    fringe(x0, near, x1, near, () => ({ until: (i + 1) * L, slide: route ? way : 0, start: i * L }));
    fringe(x0, far, x1, far, () => ({ until: (i + 1) * L }));
    // Out of the top of each row.
    for (let r = 0; r < rows; r++) {
      const xm = x0 + (r + 0.5) * row;
      for (let lz = plot.z0 + random() * stand.ears; lz < plot.z1; lz += stand.ears * (0.7 + random() * 0.6)) {
        const lx = xm + (random() - 0.5) * row * stand.spread;
        if (rim(lx, lz, true)[2] !== 0) continue;
        const nod = random() * Math.PI * 2;
        stalkAt(
          lx,
          lz,
          height(lx, lz) + stand.poke[0] + random() * stand.poke[1],
          [Math.cos(nod), Math.sin(nod)],
          { until: alongAt(lz) },
          random() * 0.25,
        );
      }
    }
  }
  const cut = { cropCut: { value: -1e6 }, cropAxis: { value: axis } };
  const stalks = nearStalks(items, geometry, stand.range, cut);
  for (const list of Object.values(items)) list.length = 0;
  const group = new THREE.Group();
  group.add(mesh, stalks.mesh);
  return {
    mesh: group,
    /** Hides the crop cut so far, `metres` along the lanes, and fills in the stalks near the camera. */
    show(metres = -1e6) {
      if (metres !== uniforms.cropFrom.value) {
        uniforms.cropFrom.value = cut.cropCut.value = metres;
        const start = starts[Math.min(starts.length - 1, cellsDone(lanes, metres, CROP_CELL))];
        mesh.geometry.setDrawRange(start, starts.at(-1) - start);
      }
      stalks.update(metres);
    },
  };
}

/** Standing wheat on `plot` (see `standingCrop`), cut by a combine working `route`, or never without one. */
export function wheatField(plot, point, route = null) {
  return standingCrop(plot, point, route, WHEAT);
}

/** The straw the combine leaves in a row down the middle of each pass, and the grass the mower leaves: [top, sides]. */
const STRAW = [new THREE.Color('#ead99a'), new THREE.Color('#d3bd78')];
const HAY = [new THREE.Color('#86a24a'), new THREE.Color('#6d8c3f')];

function wheel(radius, width) {
  return new PartsBuilder()
    .add(new THREE.CylinderGeometry(radius, radius, width, 12), RUBBER, { rz: Math.PI / 2 })
    .add(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 10), '#e0c46a', { rz: Math.PI / 2 })
    .mesh();
}

/** Puts a wheel on a machine, on a pivot that turns it if it `steers`. The wheel itself spins. */
function addWheel(root, { x, z, radius, width = 0.4 }, steers) {
  const pivot = new THREE.Group();
  pivot.position.set(x, radius + 0.06, z);
  const mesh = wheel(radius, width);
  pivot.add(mesh);
  root.add(pivot);
  return { pivot, mesh, radius, steers };
}

/** A copy of the garage's tractor in the farm's own colour, with something hitched behind. */
export function farmTractor(color, implement) {
  const { painted, trim, spec } = vehicleParts('tractor');
  const root = new THREE.Group();
  root.add(painted.mesh({ material: flatMaterial(color) }), trim.mesh());
  // The small front wheels steer.
  const wheels = spec.wheels.map(w => addWheel(root, w, w.z < 0));
  const axles = spec.wheels.map(w => w.z);
  const tool = new PartsBuilder();
  tool.box(0.2, 0.15, 1.2, STEEL, { y: 0.75, z: 2.6 }); // drawbar
  // Each as wide as a pass, so the worked ground comes out of it from one side of the pass to the other.
  if (implement === 'plough') {
    tool.box(3.4, 0.18, 0.2, STEEL, { y: 0.8, z: 3.2, ry: 0.35 });
    for (let k = 0; k < 6; k++) {
      tool.box(0.1, 0.65, 0.1, STEEL, { x: -1.5 + k * 0.6, y: 0.45, z: 3.75 - k * 0.22 });
      tool.add(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 10), '#9aa09a', {
        x: -1.5 + k * 0.6,
        y: 0.3,
        z: 3.75 - k * 0.22,
        rz: Math.PI / 2,
        ry: 0.5,
      });
    }
  } else {
    tool.box(LANE - 0.2, 0.3, 1.3, '#c9452f', { y: 0.4, z: 3.6 }); // mower deck
    tool.box(LANE - 0.1, 0.08, 1.4, '#3f4541', { y: 0.58, z: 3.6 });
    for (const x of [-1.6, 1.6])
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
    steering: createSteering(Math.max(...axles) - Math.min(...axles)),
    /** Circles for collisions, as [right, behind, radius] from the middle of the tractor. */
    hits: [
      [0, -1.2, 1.3],
      [0, 1.2, 1.3],
      [0, 3.6, 1.3],
    ],
    /** It stops if the car is within `radius` of a point `ahead` metres in front: [ahead, radius]. */
    reach: [3.5, 4.5],
    /**
     * Where the mower cuts, from `front` metres in front (behind, if negative) to `back` behind,
     * and half as wide: [front, back, half]. The plough cuts nothing standing.
     */
    cuts: implement === 'mower' ? [-2.9, 4.3, LANE / 2] : null,
  };
}

/**
 * A combine harvester, front to -Z like the tractors: a wide cutting table with a
 * turning reel, the cab up high at the front and the grain tank behind it.
 */
export function combineHarvester() {
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

  // Wheat just cut, lying back across the table on its way to the auger, while it cuts.
  const cutting = new PartsBuilder();
  for (let k = 0; k < 40; k++) {
    const x = -HEADER / 2 + 0.25 + ((k * 0.618) % 1) * (HEADER - 0.5);
    const lean = ((k * 0.377) % 1) - 0.5;
    const color = ['#e2c462', '#d5b552', '#ecd585'][k % 3];
    cutting.box(0.07, 0.05, 1.05, color, { x, y: 0.76 + (k % 4) * 0.025, z: -3.75, rx: -0.1, ry: lean * 0.5 });
    cutting.add(new THREE.ConeGeometry(0.05, 0.22, 3), '#f2dd96', {
      x: x + lean * 0.25,
      y: 0.8 + (k % 4) * 0.025,
      z: -3.15,
      rx: Math.PI / 2 - 0.1,
    });
  }
  const intake = cutting.mesh({ castShadow: false });
  root.add(intake);

  // Big drive wheels under the cab, small steering wheels at the back.
  const wheels = [
    ...[-1.55, 1.55].map(x => addWheel(root, { x, z: -0.9, radius: 0.85, width: 0.62 }, false)),
    ...[-1.2, 1.2].map(x => addWheel(root, { x, z: 3, radius: 0.55, width: 0.42 }, true)),
  ];
  root.traverse(child => {
    if (child.isMesh) child.castShadow = true;
  });
  return {
    kind: 'combine',
    root,
    wheels,
    // From the drive wheels back to the steering wheels: negative, as they are behind.
    steering: createSteering(-3.9),
    reel,
    intake,
    hits: [
      [0, -3.9, 1.3],
      [-2.2, -3.7, 1.1],
      [2.2, -3.7, 1.1],
      [0, -0.6, 1.8],
      [0, 2.4, 1.7],
    ],
    reach: [6, 5],
    /** Where the cutting table cuts, as for the mower. */
    cuts: [4.6, -3.2, HEADER / 2 + 0.1],
  };
}

/** Chaff blowing out of the back of the combine. One instanced mesh. */
function chaffCloud(scene) {
  const material = new THREE.MeshLambertMaterial({
    color: '#ece0b4',
    emissive: '#4a4434',
    transparent: true,
    opacity: 0.22,
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
  const { at, local, rotation } = framer(FARMSTEAD);
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
  // The crops, each a little apart from the next so the edges read as separate fields. The
  // meadow and the wheat stand over the short grass and the stubble they are cut down to.
  const { plough, mow, rapeseed, young, wheat } = FIELD_PLOTS;
  const crops = [
    ...rows(plough, CROPS.stubble),
    ...rows(mow, CROPS.mown),
    ...rows(rapeseed, CROPS.rapeseed),
    ...rows(young, CROPS.young),
    ...rows(wheat, CROPS.cut, WHEAT.row * 3),
  ];
  scene.add(fieldMesh(drape(crops, 0.05), -2));

  const parts = new PartsBuilder();
  const smoke = buildFarmstead(scene, parts, obstacles);
  scene.add(parts.mesh());

  // The three machines, each part of the way through its field. What each works with works
  // `lead` metres in front of it (behind it, if negative), and what it leaves comes out `trail`
  // metres in front. The combine starts at the top of the wheat, so it finishes at the bottom,
  // out of the way of the mower turning at the bottom of the meadow.
  const workers = [
    { plot: plough, machine: farmTractor('#b5402f', 'plough'), speed: 1.7, start: 0.38, lead: -3.3, trail: -3.3 },
    { plot: mow, machine: farmTractor('#4f8a4b', 'mower'), speed: 2.1, start: 0.62, lead: -3, trail: -3.3 },
    {
      plot: wheat,
      machine: combineHarvester(),
      width: HEADER,
      first: -1,
      speed: 1.4,
      start: 0.3,
      lead: 4.4,
      trail: -4,
    },
  ].map(worker => {
    const route = laneRoute(worker.plot, worker.width, worker.first, -Math.min(0, worker.lead, worker.trail));
    return { ...worker, route, d: route.total * worker.start };
  });
  const [plougher, mower, harvester] = workers;
  // What stands before them, and what they leave: furrows, rows of cut grass and rows of straw.
  mower.standing = standingCrop(mow, fieldPoint, mower.route, MEADOW);
  harvester.standing = standingCrop(wheat, fieldPoint, harvester.route, WHEAT);
  plougher.ground = ploughedGround(plough, plougher.route);
  mower.ground = swaths(mow, mower.route, HAY, 1.3, 0.2);
  harvester.ground = swaths(wheat, harvester.route, STRAW, 1, 0.26);
  for (const worker of workers) {
    scene.add(worker.machine.root, worker.ground.mesh);
    if (worker.standing) scene.add(worker.standing.mesh);
  }
  shareGround(workers);
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
    /** Circles round the machines and what they pull, for collisions, each with the `kind` of machine. */
    colliders,
    getState: () =>
      workers.map(w => ({
        kind: w.machine.kind,
        worked: w.route.at(w.d).worked,
        done: w.d >= w.route.total,
        // Waiting for another machine to get out of the way.
        waiting: Boolean(w.waiting),
        x: w.machine.root.position.x,
        z: w.machine.root.position.z,
        steer: w.machine.steering.angle,
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
        worker.moving = worker.waiting = false;
        if (worker.d >= route.total) {
          // Done. The field grows back while nobody is looking, once there is room to start again.
          if (farFromFields && mayStart(worker)) worker.d = 0;
        } else if (!blocked) {
          // And wait for another machine to get out of the way where their headlands meet.
          const next = Math.min(route.total, worker.d + worker.speed * dt);
          if (mayGo(worker, next)) {
            worker.d = next;
            worker.moving = true;
            for (const w of machine.wheels) w.mesh.rotation.x -= (worker.speed * dt) / w.radius;
          } else worker.waiting = true;
        }
        const pose = chassisPose(p.x, p.z, heading, terrainHeight);
        machine.root.position.set(p.x, pose.height, p.z);
        machine.root.rotation.set(pose.pitch, heading, pose.roll, 'YXZ');
        // It steers round at the end of each lane, where it can be seen.
        if (inSight) {
          const angle = steer(machine.steering, heading, worker.moving ? worker.speed : 0, dt);
          for (const w of machine.wheels) if (w.steers) w.pivot.rotation.y = angle;
        } else machine.steering.heading = null;
        // The crop goes and the worked ground comes right at what it works with, and what it
        // leaves comes out behind; and the stalks it cuts stand up straight again, if a car had
        // laid them over.
        worker.standing?.show(reached(route, here, worker.lead));
        worker.ground.show(Math.max(0, reached(route, here, worker.trail)));
        if (worker.standing && worker.moving) {
          const [front, back, half] = machine.cuts;
          cutTrample(p.x, p.z, -Math.sin(heading), -Math.cos(heading), front, back, half);
        }
        // The mower's tractor lays the long grass over as it drives into it.
        if (worker === mower && worker.moving) {
          const wheels = machine.wheels.map(({ pivot, radius }) => ({
            x: pivot.position.x,
            z: pivot.position.z,
            radius,
          }));
          pressTrample({ x: p.x, z: p.z, heading, speed: worker.speed, wheels });
        }
        for (const [right, behind, radius] of machine.hits) {
          colliders.push({
            x: p.x - facing.x * behind - facing.z * right,
            z: p.z - facing.z * behind + facing.x * right,
            radius,
            kind: machine.kind,
          });
        }
        worker.here = here;
        worker.position = p;
        worker.facing = facing;
      }

      if (harvester.moving) harvester.machine.reel.rotation.x -= dt * 2.2;
      harvester.machine.intake.visible = harvester.moving && harvester.here.dx === 0;
      // Chaff blows out of the back of the combine while it works.
      for (let i = 0; i < CHAFF; i++) {
        const t = (time * 0.7 + i / CHAFF) % 1;
        const behind = 4.2 + t * 4.5;
        const drift = Math.sin(i * 2.3) * t * 2.6;
        const x = harvester.position.x - harvester.facing.x * behind - harvester.facing.z * drift;
        const z = harvester.position.z - harvester.facing.z * behind + harvester.facing.x * drift;
        dummy.position.set(x, terrainHeight(x, z) + 1.2 + t * 1.1, z);
        dummy.rotation.set(t * 3, i, 0);
        dummy.scale.setScalar(harvester.moving ? (0.15 + t * 0.7) * Math.min(1, (1 - t) * 3) : 0);
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
