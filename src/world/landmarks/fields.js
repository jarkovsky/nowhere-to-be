// The upland farm: a timber cottage and a tractor shed where the fields track
// ends, a rapeseed field, young crops, and three machines at work. One tractor
// ploughs a field of stubble and the furrows appear behind it, with gulls
// following the plough; another mows a meadow; and a combine harvester cuts the
// wheat, leaving stubble and rows of straw. When a field is done and nobody is
// watching, it quietly grows back and the work starts again.
import * as THREE from 'three';
import { createRandom, fractalNoise, valueNoise } from '../../core/math.js';
import { createSteering, steer } from '../../core/steering.js';
import { chassisPose } from '../../core/suspension.js';
import { vehicleParts } from '../../vehicles/car.js';
import { FARMSTEAD, FIELDS, FIELD_PLOTS, fieldPoint } from '../layout.js';
import { headingOf } from '../path.js';
import { terrainHeight } from '../terrain.js';
import { SWAY, detailMap, foliageMaterial, groundMaterial } from '../detail.js';
import { PartsBuilder, flatMaterial, gableRoof, gableEnds, localFrame, createSmoke, tintable } from '../build.js';

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
const CHAFF = 10;
/** Spacing of the drill rows the wheat is sown in. */
const ROW = 0.6;
/** Height of the standing wheat to the tops of its rows, and how much lower it is between them. */
const WHEAT = 0.95;
const FURROW = 0.12;
/** Length of the cells the standing wheat is built in along the lanes. */
const WHEAT_CELL = 4;
/** Radius of the wheat's rounded corners, and how much lower it is right at its edge. */
const CORNER = 1.4;
const SHOULDER = 0.14;
/**
 * The stalks hang down from the top along the edges of the wheat in teeth about this wide, in
 * front of the shade this far in.
 */
const TOOTH = 0.28;
const INSET = 0.3;
/** Within this of the camera, stalks stand along the edges of the wheat and ears nod out of its top. */
const STALK_RANGE = 32;
/** Stalks along the edges, and ears along the top of each row, about this far apart. */
const STALK_GAP = 0.055;
const EAR_GAP = 0.32;

/** Ground colours: [base, stripe] for each crop, and for the ground once it is worked. */
const CROPS = {
  stubble: ['#cdbb7e', '#c1ad6f'],
  meadow: ['#8fa864', '#86a05b'],
  rapeseed: ['#e8ce4b', '#dcc23f'],
  young: ['#a3bc70', '#8ea85f'],
  ploughed: ['#8b6f4e', '#775c3f'],
  mown: ['#b9c47f', '#cbbd72'],
  cut: ['#dccb90', '#cfbc7e'], // the stubble the combine leaves, in rows
};
/** The wheat: riper in patches, darker down between the rows and among the stalks. */
const WHEAT_COLORS = {
  ripe: new THREE.Color('#e2bf56'),
  pale: new THREE.Color('#ecd47e'),
  late: new THREE.Color('#cdb75c'),
  furrow: new THREE.Color('#a98b3d'),
  foot: new THREE.Color('#2f2e17'),
};
/** The straw the combine leaves in a row down the middle of each pass: [top, sides]. */
const STRAW = [new THREE.Color('#ead99a'), new THREE.Color('#d3bd78')];

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

/** Cells `cell` metres long down each lane, in working order, as [x0, x1, za, zb] in the farmland's frame. */
function cellsInOrder(plot, route, cell = CELL) {
  const cells = [];
  const perLane = Math.ceil(route.length / cell);
  for (let i = 0; i < route.lanes; i++) {
    const x0 = plot.x0 + i * route.width;
    for (let k = 0; k < perLane; k++) {
      const a = Math.min(route.length, k * cell);
      const b = Math.min(route.length, (k + 1) * cell);
      const [za, zb] = i % 2 ? [plot.z1 - b, plot.z1 - a] : [plot.z0 + a, plot.z0 + b];
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
 * The material for the standing wheat and for the straw the combine leaves. Ears and stalks
 * are drawn in grain from the detail texture, speckled on top and streaked down the sides;
 * waves of wind run over the tops, and the wheat is pressed down where the car drives through.
 * Each vertex knows how far along the combine's route its spot is (`along`) and is held
 * between `from` and `to` metres along it, so the edges follow the combine exactly rather than
 * a cell at a time: wheat behind the cutter bar slides up to it, and the straw grows out of the
 * back. `sway` is how far a vertex moves in the wind.
 */
function cropMaterial(point) {
  const origin = point(0, 0);
  const ahead = point(0, 1);
  const uniforms = {
    cropFrom: { value: -1e6 },
    cropTo: { value: 1e6 },
    // The way the rows run, in the world.
    cropAxis: { value: new THREE.Vector2(ahead.x - origin.x, ahead.z - origin.z) },
  };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, {
      groundDetail: detailMap(),
      swayTime: SWAY.time,
      swayPusher: SWAY.pusher,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CROP_PARS}\n${CROP_ATTRIBUTES}`)
      .replace('#include <begin_vertex>', CROP_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CROP_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${CROP_DETAIL}`);
  };
  return { material, uniforms };
}

const CROP_PARS = /* glsl */ `
  uniform float cropFrom;
  uniform float cropTo;
  uniform vec2 cropAxis;
  uniform float swayTime;
  uniform vec3 swayPusher;
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
  // Pressed down and aside where the car drives through.
  vec2 away = transformed.xz - swayPusher.xz;
  float gap = max( length( away ), 0.001 );
  float press = ( 1.0 - smoothstep( 1.0, 2.6, gap ) ) * sway * step( abs( transformed.y - swayPusher.y ), 3.0 );
  transformed.xz += away / gap * press * 0.25;
  transformed.y -= press * 0.55;
  vCrop = transformed;
  vSway = sway;
`;

const CROP_DETAIL = /* glsl */ `
  {
    float near = 1.0 - smoothstep( 30.0, 150.0, distance( vCrop, cameraPosition ) );
    // Ears and stalks, finer than the shapes: speckled on top, streaked down the sides, and
    // finer still close by.
    float ears = texture2D( groundDetail, vCrop.xz / 1.4 ).a;
    float close = 1.0 - smoothstep( 4.0, 20.0, distance( vCrop, cameraPosition ) );
    ears += ( texture2D( groundDetail, vCrop.xz / 0.37 + 0.5 ).a - 0.5 ) * 0.8 * close;
    // Patches the wind ruffles, drifting over the field, and riper patches that stay put.
    float gusts = texture2D( groundDetail, vCrop.xz / 29.0 - swayTime * vec2( 0.016, 0.01 ) ).r;
    float patches = texture2D( groundDetail, vCrop.xz / 70.0 + 0.4 ).g;
    float wind = ( gusts - 0.5 ) * 0.3 * min( vSway, 1.0 );
    diffuseColor.rgb *= 1.0 + ( ears - 0.5 ) * 0.6 * near + wind + ( patches - 0.5 ) * 0.16;
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
  return geometry;
}

/**
 * Collects the corners of crop triangles. A corner is { lx, lz, lift, color, along, way, sway }
 * (see `cropMaterial`), `lift` above the ground there or above `ground` if it has one. A triangle is lit as it faces, or as if it faced `light`, and then its
 * corners are turned so that its front faces that way too: the sides of the wheat are lit as if
 * they faced a little upwards, as the stalks and ears along them do.
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

const UP = new THREE.Vector3(0, 1, 0);
let stalk = null;

/**
 * A stalk of wheat with its ear, to draw many of: thin, a little under a metre tall, darker and
 * greener low down, with a long ear nodding over towards +X at the top. Each side is lit as if
 * it faced a little upwards, so the stalks don't flicker light and dark as they turn.
 */
function stalkGeometry() {
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
 * Stalks of wheat drawn one by one near the camera: one instanced mesh, refilled when the
 * camera has moved or the combine has cut further. Each of `items` ({ matrix, color, x, z,
 * from, until, slide, start }) is drawn once the combine has cut `from` metres along its route
 * and until it cuts `until`; those along the edge it cuts from (`slide` is the way it goes, along
 * `axis`) are carried along in front of its cutter bar once it has passed `start`.
 */
function nearStalks(items, axis) {
  const size = Math.max(1, items.length);
  const mesh = new THREE.InstancedMesh(stalkGeometry(), foliageMaterial('grass', STALK_RANGE), size);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(size * 3), 3);
  mesh.count = 0;
  mesh.frustumCulled = false;
  // The camera is only known while drawing, so the stalks are filled for where it was last time.
  const eye = new THREE.Vector3(Infinity, 0, Infinity);
  mesh.onBeforeRender = (renderer, scene, camera) => eye.setFromMatrixPosition(camera.matrixWorld);
  const filled = { x: Infinity, z: Infinity, cut: NaN };
  const box = new THREE.Box2();
  for (const { x, z } of items) box.expandByPoint(new THREE.Vector2(x, z));
  const corner = new THREE.Vector2();
  const reach = STALK_RANGE * STALK_RANGE;
  const matrices = mesh.instanceMatrix.array;
  const colors = mesh.instanceColor.array;
  return {
    mesh,
    update(cut) {
      if (!Number.isFinite(eye.x)) return;
      if (Math.hypot(eye.x - filled.x, eye.z - filled.z) < 1.5 && Math.abs(cut - filled.cut) < 0.1) return;
      Object.assign(filled, { x: eye.x, z: eye.z, cut });
      let n = 0;
      if (box.distanceToPoint(corner.set(eye.x, eye.z)) < STALK_RANGE) {
        for (const item of items) {
          if ((item.x - eye.x) ** 2 + (item.z - eye.z) ** 2 > reach || cut < item.from || cut >= item.until) continue;
          item.matrix.toArray(matrices, n * 16);
          if (item.slide && cut > item.start) {
            const shift = item.slide * (cut - item.start);
            const [x, z] = [item.x + axis.x * shift, item.z + axis.y * shift];
            matrices.set([x, terrainHeight(x, z), z], n * 16 + 12);
          }
          item.color.toArray(colors, n * 3);
          n++;
        }
      }
      if (n === 0 && mesh.count === 0) return;
      mesh.count = n;
      for (const attribute of [mesh.instanceMatrix, mesh.instanceColor]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, n * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    },
  };
}

/**
 * Standing wheat on `plot`, in the frame `point` maps from: drill rows down the plot's Z, a
 * little uneven and with rounded corners. Close to the camera, stalks stand along its edges and
 * ears nod out of its top along the rows. It is built in cells down the lanes of `route`, in the
 * order the combine cuts them, so starting the draw range at a later cell hides those cut so
 * far. Without a route it is one lane, never cut.
 */
export function wheatField(plot, point, route = null) {
  const lanes = route ?? { lanes: 1, width: plot.x1 - plot.x0, length: plot.z1 - plot.z0 };
  const random = createRandom(Math.round(plot.x0 * 31 + plot.z1 * 17));
  const crop = cropCorners(point);
  const rows = Math.round(lanes.width / ROW);
  const row = lanes.width / rows;
  const perLane = Math.ceil(lanes.length / WHEAT_CELL);
  let lane = 0;
  let way = 1;
  const alongAt = lz => lane * lanes.length + (way > 0 ? lz - plot.z0 : plot.z1 - lz);
  /** How far (lx, lz) is from the middle of its row, from 0 there to 1 between two rows. */
  const across = lx => Math.abs((((lx - plot.x0) / row) % 1) - 0.5) * 2;
  const height = (lx, lz) => WHEAT + (valueNoise(lx / 6, lz / 6, 5) - 0.5) * 0.16 - across(lx) * FURROW;
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
  /** The top of the wheat at (lx, lz): riper in patches, darker down between the rows. */
  const top = (lx, lz) => {
    const ripeness = fractalNoise(lx / 18, lz / 18, 2, 7);
    const color = WHEAT_COLORS.ripe
      .clone()
      .lerp(ripeness > 0.5 ? WHEAT_COLORS.pale : WHEAT_COLORS.late, Math.abs(ripeness - 0.5) * 1.6)
      .lerp(WHEAT_COLORS.furrow, across(lx) * 0.55);
    const [x, z, ox, oz] = rim(lx, lz, true);
    // Lower along the edge of the field, where the stalks stand up above it.
    const atEdge = ox || oz || Math.min(lx - plot.x0, plot.x1 - lx, lz - plot.z0, plot.z1 - lz) < 1e-6;
    return { lx: x, lz: z, lift: height(lx, lz) - (atEdge ? SHOULDER : 0), color, along: alongAt(lz), way, sway: 1 };
  };
  const foot = ({ lx, lz, along }) => ({ lx, lz, lift: -0.05, color: WHEAT_COLORS.foot, along, way, sway: 0 });
  /**
   * An edge of the wheat through `tops`, facing `outward`: the stalks hang down from its top in
   * ragged teeth, golden at the top and darker lower down, in front of the shade further in,
   * darker still and greener low down. Corners further in keep the `along` of those at the edge,
   * so the edge the combine cuts from slides along in one piece.
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
    // Between two of `tops`, at the height of the top of the wheat between them.
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
      const teeth = Math.max(1, Math.round(Math.hypot(b.lx - a.lx, b.lz - a.lz) / TOOTH));
      for (let k = 0; k < teeth; k++) {
        const [p, q] = [between(a, b, k / teeth), between(a, b, (k + 1) / teeth)];
        const tip = shade(between(a, b, (k + 0.3 + random() * 0.4) / teeth), 0.3 + random() * 0.3, 0.4);
        crop.quad(shade(p, 0.75, 0.55), shade(q, 0.75, 0.55), shade(q, 1, 0.72), shade(p, 1, 0.72), light);
        crop.triangle(shade(p, 0.75, 0.55), tip, shade(q, 0.75, 0.55), light);
      }
    }
  };
  /** Where to break the cell from `za` to `zb` along the rows: finely in the rounded corners. */
  const breaks = (za, zb) => {
    const fine = [0.2, 0.45, 0.75, 1].flatMap(t => [plot.z0 + t * CORNER, plot.z1 - t * CORNER]);
    return [za, ...fine.filter(z => z > za && z < zb), zb].sort((a, b) => a - b);
  };

  const starts = [];
  cellsInOrder(plot, lanes, WHEAT_CELL).forEach(([x0, x1, za, zb], index) => {
    lane = Math.floor(index / perLane);
    way = lane % 2 ? -1 : 1;
    const k = index % perLane;
    starts.push(crop.count);
    const outer = lane === 0 || lane === lanes.lanes - 1;
    const zs = outer ? breaks(za, zb) : [za, zb];
    // The tops of the rows, each a ridge.
    for (let r = 0; r < rows; r++) {
      const [xa, xm, xb] = [x0 + r * row, x0 + (r + 0.5) * row, x0 + (r + 1) * row];
      for (let n = 0; n + 1 < zs.length; n++) {
        const [a, b] = [zs[n], zs[n + 1]];
        crop.quad(top(xa, a), top(xm, a), top(xm, b), top(xa, b));
        crop.quad(top(xm, a), top(xb, a), top(xb, b), top(xm, b));
      }
    }
    // The edges: the near side stands at the edge of the field or of the lane cut before it,
    // and the end the combine comes in from slides along in front of its cutter bar.
    const halfRows = Array.from({ length: rows * 2 + 1 }, (_, n) => x0 + (n * row) / 2);
    edge(
      zs.map(z => top(x0, z)),
      [-1, 0],
    );
    if (lane === lanes.lanes - 1)
      edge(
        zs.map(z => top(x1, z)),
        [1, 0],
      );
    const [near, far] = way > 0 ? [za, zb] : [zb, za];
    if (route || k === 0)
      edge(
        halfRows.map(x => top(x, near)),
        [0, -way],
      );
    if (k === perLane - 1)
      edge(
        halfRows.map(x => top(x, far)),
        [0, way],
      );
  });
  starts.push(crop.count);
  const { material, uniforms } = cropMaterial(point);
  const mesh = new THREE.Mesh(cropGeometry(crop.buffers), material);
  mesh.receiveShadow = true;

  // The stalks close to the camera: along the edges, then the ears along the tops of the rows.
  const items = [];
  const dummy = new THREE.Object3D();
  const origin = point(0, 0);
  const ahead = point(0, 1);
  const axis = new THREE.Vector2(ahead.x - origin.x, ahead.z - origin.z);
  /** A stalk at (lx, lz) whose ear is `height` above the ground, leaning `lean` towards (ox, oz). */
  const stalkHeight = stalkGeometry().boundingBox.max.y;
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
    const warm = random();
    const color = new THREE.Color(1, 0.96 - warm * 0.06, 0.88 - warm * 0.14).multiplyScalar(0.86 + random() * 0.2);
    items.push({ matrix: dummy.matrix.clone(), color, x: p.x, z: p.z, from: -Infinity, ...extra });
  };
  const L = lanes.length;
  /**
   * Stalks along an edge from (ax, az) to (bx, bz), a few missing and some taller, leaning out
   * `outward`, or out of the plot's rounded edge without it. `at(lz)` says when each is drawn.
   */
  const fringe = (ax, az, bx, bz, at, outward = null) => {
    const steps = Math.round(Math.hypot(bx - ax, bz - az) / STALK_GAP);
    for (let n = 0; n < steps; n++) {
      const t = (n + random()) / steps;
      if (random() < 0.12) continue;
      const [px, pz] = [ax + (bx - ax) * t, az + (bz - az) * t];
      const [lx, lz, ox, oz] = outward ? [px, pz, ...outward] : rim(px, pz);
      // Some in front of the edge, some just inside it, their ears above the top of the wheat.
      const out = random() * 0.5 - 0.28;
      const tall = random() < 0.08 ? 0.15 + random() * 0.15 : 0;
      const [x, z] = [lx + ox * out, lz + oz * out];
      const ear = height(x, z) + (out > 0 ? -0.04 : 0.02) + random() * 0.16 + tall;
      stalkAt(x, z, ear, [ox, oz], at(lz), 0.05 + random() * 0.3);
    }
  };
  for (lane = 0; lane < lanes.lanes; lane++) {
    way = lane % 2 ? -1 : 1;
    const x0 = plot.x0 + lane * lanes.width;
    const x1 = x0 + lanes.width;
    const i = lane;
    // Down the near side, bared once the combine has cut the lane before it alongside.
    if (i === 0) fringe(x0, plot.z0, x0, plot.z1, lz => ({ until: alongAt(lz) }));
    else fringe(x0, plot.z0, x0, plot.z1, lz => ({ from: 2 * i * L - alongAt(lz), until: alongAt(lz) }), [-1, 0]);
    if (lane === lanes.lanes - 1) fringe(x1, plot.z0, x1, plot.z1, lz => ({ until: alongAt(lz) }));
    // Across the end it is cut from, carried along in front of the cutter bar, and the far end.
    const [near, far] = way > 0 ? [plot.z0, plot.z1] : [plot.z1, plot.z0];
    fringe(x0, near, x1, near, () => ({ until: (i + 1) * L, slide: route ? way : 0, start: i * L }));
    fringe(x0, far, x1, far, () => ({ until: (i + 1) * L }));
    // The ears out of the top of each row.
    for (let r = 0; r < rows; r++) {
      const xm = x0 + (r + 0.5) * row;
      for (let lz = plot.z0 + random() * EAR_GAP; lz < plot.z1; lz += EAR_GAP * (0.7 + random() * 0.6)) {
        const lx = xm + (random() - 0.5) * row * 0.35;
        if (rim(lx, lz, true)[2] !== 0) continue;
        const nod = random() * Math.PI * 2;
        stalkAt(
          lx,
          lz,
          height(lx, lz) + 0.05 + random() * 0.07,
          [Math.cos(nod), Math.sin(nod)],
          { until: alongAt(lz) },
          random() * 0.25,
        );
      }
    }
  }
  const stalks = nearStalks(items, axis);
  const group = new THREE.Group();
  group.add(mesh, stalks.mesh);
  let cut = -1e6;
  return {
    mesh: group,
    /** Hides the wheat cut so far, `metres` along the lanes, and fills in the stalks near the camera. */
    show(metres = -1e6) {
      if (metres !== cut) {
        cut = metres;
        uniforms.cropFrom.value = cut;
        const start = starts[Math.min(starts.length - 1, cellsDone(lanes, cut, WHEAT_CELL))];
        mesh.geometry.setDrawRange(start, starts.at(-1) - start);
      }
      stalks.update(cut);
    },
  };
}

/**
 * The straw the combine leaves behind it: a low ridge down the middle of each pass, built in
 * the order the combine works, so ending the draw range at a cell shows the straw so far.
 */
function strawSwaths(plot, route, point) {
  const straw = cropCorners(point);
  const across = [-0.62, -0.32, 0, 0.32, 0.62];
  const rise = [0.02, 0.17, 0.26, 0.17, 0.02];
  const perLane = Math.ceil(route.length / CELL);
  const starts = [];
  /** The ridge of straw across the pass at `lz`, as corners from one side to the other. */
  const section = (lx, lz, lane, way) => {
    const width = 0.8 + valueNoise(lz / 2.3, lane * 3.1, 11) * 0.4;
    const height = 0.75 + valueNoise(lz / 1.7, lane * 2.3, 13) * 0.5;
    const along = lane * route.length + (way > 0 ? lz - plot.z0 : plot.z1 - lz);
    return across.map((u, n) => ({
      lx: lx + u * width,
      lz,
      lift: rise[n] * height,
      color: STRAW[n === 2 ? 0 : 1],
      along,
      way,
      sway: 0,
    }));
  };
  /** The end of a row of straw, sloping down to the ground `beyond` the section. */
  const end = (corners, beyond) => {
    const tip = { ...corners[2], lz: corners[2].lz + beyond, lift: 0.02 };
    for (let n = 0; n < 4; n++) straw.triangle(corners[n], corners[n + 1], tip);
  };
  cellsInOrder(plot, route).forEach(([x0, x1, za, zb], index) => {
    const lane = Math.floor(index / perLane);
    const way = lane % 2 ? -1 : 1;
    const [near, far] = way > 0 ? [za, zb] : [zb, za];
    const a = section((x0 + x1) / 2, near, lane, way);
    const b = section((x0 + x1) / 2, far, lane, way);
    starts.push(straw.count);
    for (let n = 0; n < 4; n++) straw.quad(a[n], a[n + 1], b[n + 1], b[n]);
    if (index % perLane === 0) end(a, -way * 0.6);
    end(b, way * 0.6);
  });
  starts.push(straw.count);
  const { material, uniforms } = cropMaterial(point);
  const mesh = new THREE.Mesh(cropGeometry(straw.buffers), material);
  mesh.receiveShadow = true;
  return {
    mesh,
    /** Shows the straw left so far, `worked` metres along the lanes. */
    show(worked) {
      uniforms.cropTo.value = worked;
      const cells = worked > 0 ? cellsDone(route, worked) + 1 : 0;
      mesh.geometry.setDrawRange(0, starts[Math.min(starts.length - 1, cells)]);
    },
  };
}

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
function farmTractor(color, implement) {
  const { painted, trim, spec } = vehicleParts('tractor');
  const root = new THREE.Group();
  root.add(painted.mesh({ material: flatMaterial(color) }), trim.mesh());
  // The small front wheels steer.
  const wheels = spec.wheels.map(w => addWheel(root, w, w.z < 0));
  const axles = spec.wheels.map(w => w.z);
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
    steering: createSteering(Math.max(...axles) - Math.min(...axles)),
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
    ...rows(wheat, CROPS.cut, ROW * 3),
  ];
  scene.add(fieldMesh(drape(crops, 0.05), -2));

  const parts = new PartsBuilder();
  const smoke = buildFarmstead(scene, parts, obstacles);
  scene.add(parts.mesh());

  // The three machines, each part of the way through its field.
  const workers = [
    { plot: plough, machine: farmTractor('#b5402f', 'plough'), speed: 1.7, start: 0.38, crop: CROPS.ploughed },
    { plot: mow, machine: farmTractor('#4f8a4b', 'mower'), speed: 2.1, start: 0.62, crop: CROPS.mown },
    { plot: wheat, machine: combineHarvester(), width: HEADER, speed: 1.4, start: 0.3 },
  ].map(worker => {
    const route = laneRoute(worker.plot, worker.width);
    // Behind the combine, the straw it leaves.
    const ground = worker.crop
      ? workedGround(worker.plot, route, worker.crop)
      : strawSwaths(worker.plot, route, fieldPoint);
    scene.add(worker.machine.root, ground.mesh);
    return { ...worker, route, ground, d: route.total * worker.start };
  });
  const [plougher, , harvester] = workers;
  const standing = wheatField(wheat, fieldPoint, harvester.route);
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
        // It steers round at the end of each lane, where it can be seen.
        if (inSight) {
          const angle = steer(machine.steering, heading, worker.moving ? worker.speed : 0, dt);
          for (const w of machine.wheels) if (w.steers) w.pivot.rotation.y = angle;
        } else machine.steering.heading = null;
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
