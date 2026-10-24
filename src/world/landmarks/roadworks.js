// Roadworks on a new road off the upland road. The first stretch is finished
// asphalt, like the road it joins; a road roller and a grader work the gravel
// base after it; at the far end an excavator digs and loads a dump truck, while
// a skid steer loader fetches gravel from a pile. A site cabin, piles, pipes and
// cones lie around.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lerp, smoothstep } from '../../core/math.js';
import { ROADWORKS, ROAD_HALF_WIDTH } from '../layout.js';
import { headingOf } from '../path.js';
import { drivingHeight, terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';
import { ASPHALT, ribbonGeometry, ribbonMesh } from '../scenery.js';

const YELLOW = '#e3b23c';
const DARK = '#3b3f3c';
const RUBBER = '#2c302e';
const GLASS = '#4f6f73';
const ORANGE = '#d9752e';
const HALF_WIDTH = ROAD_HALF_WIDTH;

const { path, asphalt, gravel, heaps } = ROADWORKS;
/** The heap the skid steer fetches gravel from. */
const GRAVEL_HEAP = heaps.find(heap => heap.id === 'gravel');

/** A point beside the new road: `along` metres along it and `side` metres to its right, on the ground. Past the end it runs straight on. */
function roadside(along, side = 0) {
  const p = path.offset(along, side);
  const over = Math.max(0, along - path.length);
  const x = p.x + p.dx * over;
  const z = p.z + p.dz * over;
  return { x, y: terrainHeight(x, z), z, heading: headingOf(p.dx, p.dz) };
}

/** Puts a group on the ground (or up on a heap) at a spot, facing `heading`. */
function place(object, spot, heading = spot.heading) {
  object.position.set(spot.x, drivingHeight(spot.x, spot.z), spot.z);
  object.rotation.y = heading;
}

function wheel(parts, x, y, z, radius, width) {
  parts.add(new THREE.CylinderGeometry(radius, radius, width, 10), RUBBER, { x, y, z, rz: Math.PI / 2 });
  parts.add(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.02, 8), YELLOW, {
    x,
    y,
    z,
    rz: Math.PI / 2,
  });
}

/** Steps through `keys` ([time, ...values]) in a loop of `length` seconds, easing between them. */
function keyframes(keys, length, time) {
  const t = time % length;
  let i = keys.length - 1;
  while (keys[i][0] > t) i--;
  const [t0, ...a] = keys[i];
  const [t1, ...b] = i + 1 < keys.length ? keys[i + 1] : [length, ...keys[0].slice(1)];
  const k = smoothstep(t, t0, t1);
  return a.map((value, j) => value + (b[j] - value) * k);
}

// --- Machines. Each faces local -Z. ------------------------------------------

function excavator() {
  const root = new THREE.Group();
  const base = new PartsBuilder();
  for (const x of [-1.25, 1.25]) {
    base.box(0.75, 0.85, 4.2, RUBBER, { x, y: 0.42 });
    base.box(0.6, 0.3, 3.6, DARK, { x, y: 0.9 });
  }
  base.box(1.6, 0.5, 2.6, DARK, { y: 0.85 });
  root.add(base.mesh());

  const upper = new THREE.Group();
  upper.position.y = 1.15;
  root.add(upper);
  const body = new PartsBuilder();
  body.box(2.7, 1.1, 3, YELLOW, { y: 0.55, z: 0.4 });
  body.box(2.7, 0.9, 0.8, '#c99a2e', { y: 0.65, z: 1.95 }); // counterweight
  body.box(1, 1.6, 1.3, YELLOW, { x: -0.8, y: 1.85, z: -0.55 }); // cab
  body.box(1.02, 1, 1.1, GLASS, { x: -0.8, y: 1.95, z: -0.55 });
  body.box(0.9, 0.95, 0.06, GLASS, { x: -0.8, y: 1.95, z: -1.22 });
  body.add(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), DARK, { x: 0.8, y: 1.5, z: 1.2 }); // exhaust
  upper.add(body.mesh());

  // The arm: boom, stick and bucket, each on its own hinge.
  const boom = new THREE.Group();
  boom.position.set(0.35, 1, -1);
  upper.add(boom);
  boom.add(new PartsBuilder().box(0.45, 0.55, 4.6, YELLOW, { z: -2.3 }).mesh());
  const stick = new THREE.Group();
  stick.position.z = -4.6;
  boom.add(stick);
  stick.add(new PartsBuilder().box(0.36, 0.45, 3, YELLOW, { z: -1.5 }).mesh());
  const bucket = new THREE.Group();
  bucket.position.z = -3;
  stick.add(bucket);
  const scoop = new PartsBuilder().box(1, 0.7, 0.8, '#c99a2e', { y: -0.2, z: -0.35 });
  for (let i = -2; i <= 2; i++) scoop.box(0.1, 0.12, 0.25, DARK, { x: i * 0.2, y: -0.5, z: -0.8 });
  bucket.add(scoop.mesh());

  // Dig in front, swing round to the truck on the left, tip the load, swing back.
  const cycle = [
    // time, swing, boom, stick, bucket
    [0, 0, 0.5, -1.2, 0.7],
    [3, 0, 0.05, -2, 0.7],
    [5, 0, 0.1, -1.5, -0.8],
    [8, 1.75, 0.75, -1.4, -0.8],
    [10, 1.75, 0.7, -1.2, 1],
    [11, 1.75, 0.7, -1.2, 1],
  ];
  return {
    root,
    update(time) {
      const [swing, lift, reach, curl] = keyframes(cycle, 14, time);
      upper.rotation.y = swing;
      boom.rotation.x = lift;
      stick.rotation.x = reach;
      bucket.rotation.x = curl;
    },
  };
}

function dumpTruck() {
  const parts = new PartsBuilder();
  parts.box(1.2, 0.45, 7.2, DARK, { y: 0.95 }); // chassis
  parts.box(2.45, 1.5, 1.8, ORANGE, { y: 2, z: -2.9 }); // cab
  parts.box(2.3, 0.7, 0.06, GLASS, { y: 2.35, z: -3.82 });
  for (const x of [-1.23, 1.23]) parts.box(0.06, 0.6, 1.1, GLASS, { x, y: 2.35, z: -2.95 });
  parts.box(2.5, 0.3, 0.3, DARK, { y: 0.9, z: -3.85 }); // bumper
  for (const x of [-0.85, 0.85]) parts.box(0.32, 0.2, 0.06, '#fff3ce', { x, y: 1.4, z: -3.82 });
  parts.box(2.5, 1.3, 4.6, '#8e918c', { y: 2.05, z: 1 }); // tipper
  parts.box(2.3, 0.35, 4.3, '#8c7457', { y: 2.85, z: 1 }); // a load of earth
  parts.add(new THREE.ConeGeometry(1.3, 0.7, 7), '#8c7457', { y: 3.3, z: 1.3, sx: 0.9, sz: 1.6 });
  for (const z of [-2.6, 1, 2.4]) {
    for (const x of [-1.05, 1.05]) wheel(parts, x, 0.62, z, 0.62, 0.45);
  }
  return parts.mesh();
}

function roller() {
  const root = new THREE.Group();
  const parts = new PartsBuilder();
  for (const x of [-1.15, 1.15]) parts.box(0.15, 1, 1.7, YELLOW, { x, y: 0.95, z: -1.5 }); // drum frame
  parts.box(2.45, 0.2, 1.7, YELLOW, { y: 1.55, z: -1.5 });
  parts.box(0.6, 0.45, 0.9, DARK, { y: 1.1, z: -0.3 }); // articulation
  parts.box(1.9, 1.1, 2.3, YELLOW, { y: 1.35, z: 0.95 });
  for (const x of [-0.78, 0.78]) {
    parts.add(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 10), RUBBER, { x, y: 0.62, z: 1.25, rz: Math.PI / 2 });
  }
  // Seat under a canopy.
  parts.box(0.6, 0.5, 0.6, DARK, { y: 2.1, z: 0.7 });
  for (const x of [-0.85, 0.85]) {
    for (const z of [0.1, 1.6]) parts.box(0.08, 1.5, 0.08, DARK, { x, y: 2.65, z });
  }
  parts.box(1.9, 0.1, 1.7, YELLOW, { y: 3.42, z: 0.85 });
  root.add(parts.mesh());
  const drum = new PartsBuilder()
    .add(new THREE.CylinderGeometry(0.75, 0.75, 2.1, 12), '#6a6f6b', { rz: Math.PI / 2 })
    .box(2.12, 0.1, 0.12, '#565b57', { y: 0.7 })
    .mesh();
  drum.position.set(0, 0.75, -1.5);
  root.add(drum);
  return { root, drum, length: 4.6 };
}

function grader() {
  const parts = new PartsBuilder();
  // A long arched frame from the front axle back to the cab, with the blade slung under it.
  parts.box(0.5, 0.55, 4.6, YELLOW, { y: 1.75, z: -1.6 });
  parts.beam({ x: 0, y: 1.75, z: -3.9 }, { x: 0, y: 1, z: -4.2 }, 0.5, YELLOW, 0.5);
  parts.box(2, 0.3, 0.4, DARK, { y: 0.8, z: -4.1 }); // front axle
  parts.box(1.5, 0.15, 1.5, DARK, { y: 1.1, z: -1.2 }); // blade circle
  parts.box(3.6, 0.65, 0.14, '#55585a', { y: 0.45, z: -1, ry: 0.45 }); // blade
  parts.box(1.7, 1.7, 1.6, YELLOW, { y: 2.45, z: 1 }); // cab
  parts.box(1.72, 1, 1.4, GLASS, { y: 2.65, z: 1 });
  parts.box(1.5, 1, 0.06, GLASS, { y: 2.65, z: 0.19 });
  parts.box(1.9, 0.12, 1.9, YELLOW, { y: 3.35, z: 1 });
  parts.box(1.8, 1.2, 2.1, YELLOW, { y: 1.6, z: 2.95 }); // engine
  parts.add(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6), DARK, { x: 0.6, y: 2.5, z: 3.4 });
  for (const x of [-0.95, 0.95]) {
    wheel(parts, x, 0.55, -4.1, 0.55, 0.4);
    for (const z of [1.9, 3.3]) wheel(parts, x, 0.6, z, 0.6, 0.45);
  }
  return { root: parts.mesh(), length: 8.4 };
}

function skidSteer() {
  const root = new THREE.Group();
  const parts = new PartsBuilder();
  parts.box(1.4, 0.9, 2.2, '#ece7da', { y: 0.85 });
  parts.box(1.1, 1, 1.2, '#2f3430', { y: 1.75, z: -0.1 }); // cab cage
  parts.box(0.9, 0.8, 0.06, GLASS, { y: 1.75, z: -0.72 });
  parts.box(1.2, 0.1, 1.3, '#ece7da', { y: 2.3, z: -0.1 });
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.72, 0.72]) {
      parts.add(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), RUBBER, { x, y: 0.38, z, rz: Math.PI / 2 });
    }
  }
  root.add(parts.mesh());
  // Lifting arms along the sides, pivoting at the back, with the bucket on the front.
  const arms = new THREE.Group();
  arms.position.set(0, 1.9, 0.9);
  root.add(arms);
  const lift = new PartsBuilder();
  for (const x of [-0.82, 0.82]) lift.beam({ x, y: 0, z: 0 }, { x, y: -1.25, z: -2.3 }, 0.14, ORANGE, 0.26);
  lift.box(1.75, 0.55, 0.6, '#55585a', { y: -1.35, z: -2.55 });
  arms.add(lift.mesh());
  return { root, arms, length: 3.4 };
}

// --- The site ---------------------------------------------------------------

function buildSurfaces(scene) {
  const end = path.length;
  const stretch = (from, to) => s => s < from || s > to;
  // The asphalt is laid just like the upland road's, with the same dashed line down the middle.
  // It tucks under the edge of the ring where it joins it, and stops square across.
  const dashes = s => s % 9 > 4.5;
  const line = stretch(HALF_WIDTH + 1, asphalt - 2);
  const surfaces = [
    ribbonGeometry(path, HALF_WIDTH, ASPHALT, { lift: 0.06, skip: stretch(HALF_WIDTH - 1.5, asphalt) }),
    ribbonGeometry(path, 0.1, '#eeece2', { lift: 0.08, across: 1, skip: s => line(s) || dashes(s) }),
    ribbonGeometry(path, HALF_WIDTH, '#a9a395', { lift: 0.05, skip: stretch(asphalt - 1, gravel) }),
    ribbonGeometry(path, HALF_WIDTH + 0.8, '#9c8466', { lift: 0.04, skip: stretch(gravel - 1, end) }),
    junctionCorners(7),
  ];
  scene.add(ribbonMesh(mergeGeometries(surfaces)));
}

/**
 * Asphalt that rounds off the two corners where the new road meets the ring, so it opens out
 * into the junction like a real side road instead of butting square against the ring. Each
 * fills its corner out to a quarter circle `radius` across, from a point tucked under both
 * roads, in small pieces draped over the ground.
 */
function junctionCorners(radius) {
  // `u` across the new road and `v` along it, from the middle of the ring, so the corners meet
  // the road's edges exactly. They reach a little under the ring's edge, which doesn't run
  // quite square to the road in this frame.
  const at = (u, v) => path.offset(v, u);
  const under = 0.3;
  const color = new THREE.Color(ASPHALT).toArray();
  const positions = [];
  const normals = [];
  const colors = [];
  const triangle = (a, b, c) => {
    const up = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
    if (Math.abs(up) < 1e-6) return;
    for (const { x, z } of up > 0 ? [a, b, c] : [a, c, b]) {
      positions.push(x, terrainHeight(x, z) + 0.05, z);
      const normal = new THREE.Vector3(
        terrainHeight(x - 1, z) - terrainHeight(x + 1, z),
        2,
        terrainHeight(x, z - 1) - terrainHeight(x, z + 1),
      ).normalize();
      normals.push(normal.x, normal.y, normal.z);
      colors.push(...color);
    }
  };
  const around = 8;
  const outward = 4;
  for (const side of [-1, 1]) {
    const corner = { u: side * (HALF_WIDTH - 0.8), v: HALF_WIDTH - 0.8 };
    const arc = Array.from({ length: around + 1 }, (_, i) => {
      const a = (i / around) * (Math.PI / 2);
      return {
        u: side * (HALF_WIDTH + radius * (1 - Math.cos(a))),
        v: HALF_WIDTH - under + radius * (1 - Math.sin(a)),
      };
    });
    const point = (i, k) => at(lerp(corner.u, arc[i].u, k / outward), lerp(corner.v, arc[i].v, k / outward));
    for (let i = 0; i < around; i++) {
      for (let k = 0; k < outward; k++) {
        triangle(point(i, k), point(i + 1, k), point(i + 1, k + 1));
        triangle(point(i, k), point(i + 1, k + 1), point(i, k + 1));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function buildClutter(parts, obstacles) {
  const add = (geometry, color, spot, extra = {}) =>
    parts.add(geometry, color, {
      x: spot.x,
      y: spot.y + (extra.y ?? 0),
      z: spot.z,
      ry: extra.ry ?? spot.heading,
      ...extra.t,
    });

  // The site cabin and a portable toilet, near the end of the asphalt.
  const cabin = roadside(asphalt - 4, -10);
  const turn = cabin.heading;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const near = (lx, lz) => ({ x: cabin.x + lx * cos + lz * sin, y: cabin.y, z: cabin.z - lx * sin + lz * cos });
  add(new THREE.BoxGeometry(2.4, 2.6, 6), '#4e7fa8', cabin, { y: 1.6 });
  add(new THREE.BoxGeometry(2.5, 0.12, 6.1), '#e8e4da', cabin, { y: 2.95 });
  add(new THREE.BoxGeometry(0.06, 0.9, 1.4), GLASS, near(1.22, -1.2), { y: 1.9 });
  add(new THREE.BoxGeometry(0.06, 1.9, 0.9), '#e8e4da', near(1.22, 1.4), { y: 1.25 });
  for (const lz of [-2.6, 2.6]) add(new THREE.BoxGeometry(2.2, 0.3, 0.4), '#8e8b80', near(0, lz), { y: 0.15 });
  const toilet = near(0, 4.2);
  add(new THREE.BoxGeometry(1.1, 2.2, 1.1), '#3d6fa8', toilet, { y: 1.1 });
  add(new THREE.BoxGeometry(1.2, 0.1, 1.2), '#e8e4da', toilet, { y: 2.25 });
  obstacles.push({ ...near(0, -0.5), radius: 2.4 }, { ...near(0, 2), radius: 2 }, { ...toilet, radius: 0.8 });

  // Concrete pipes, stacked.
  const pipes = roadside((asphalt + gravel) / 2, -8);
  for (const [lx, ly] of [
    [-0.6, 0.55],
    [0.6, 0.55],
    [0, 1.5],
  ]) {
    const spot = { ...pipes, x: pipes.x + lx * Math.cos(pipes.heading), z: pipes.z - lx * Math.sin(pipes.heading) };
    add(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 10), '#b9b6ad', spot, { y: ly, t: { rx: Math.PI / 2 } });
    for (const end of [-1, 1]) {
      const cap = {
        ...spot,
        x: spot.x - Math.sin(pipes.heading) * end * 1.11,
        z: spot.z - Math.cos(pipes.heading) * end * 1.11,
      };
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 10), '#4a4b45', cap, { y: ly, t: { rx: Math.PI / 2 } });
    }
  }
  obstacles.push({ x: pipes.x, z: pipes.z, radius: 1.6 });

  // Cones along both edges of the unfinished stretch, with a gap where the skid steer comes and goes.
  for (let s = asphalt + 2; s < path.length; s += 6) {
    for (const side of [-1, 1]) {
      if (side > 0 && Math.abs(s - path.nearest(GRAVEL_HEAP.x, GRAVEL_HEAP.z).s) < 3) continue;
      const spot = roadside(s, side * (HALF_WIDTH + 0.5));
      add(new THREE.ConeGeometry(0.25, 0.75, 8), '#e2672f', spot, { y: 0.37 });
      add(new THREE.CylinderGeometry(0.16, 0.19, 0.12, 8), '#f1ede2', spot, { y: 0.42 });
    }
  }
  // Striped barrier boards where the asphalt ends, leaving the middle open.
  for (const side of [-1, 1]) {
    const spot = roadside(asphalt, side * (HALF_WIDTH - 0.6));
    for (let i = 0; i < 4; i++) {
      const lx = (i - 1.5) * 0.4;
      const piece = { ...spot, x: spot.x + lx * Math.cos(spot.heading), z: spot.z - lx * Math.sin(spot.heading) };
      add(new THREE.BoxGeometry(0.4, 0.28, 0.05), i % 2 ? '#f2efe6' : '#c8302a', piece, { y: 0.95 });
    }
    for (const lx of [-0.7, 0.7]) {
      add(
        new THREE.BoxGeometry(0.06, 1, 0.3),
        DARK,
        { ...spot, x: spot.x + lx * Math.cos(spot.heading), z: spot.z - lx * Math.sin(spot.heading) },
        { y: 0.5 },
      );
    }
  }
}

export function buildRoadworks(scene, obstacles) {
  buildSurfaces(scene);
  const parts = new PartsBuilder();
  buildClutter(parts, obstacles);
  scene.add(parts.mesh());

  // The excavator stands just past the end of the road, digging on. The truck waits on its left.
  const end = roadside(path.length + 5);
  const digger = excavator();
  place(digger.root, end);
  scene.add(digger.root);
  obstacles.push({ x: end.x, z: end.z, radius: 2.4 });
  const left = { x: -Math.cos(end.heading), z: Math.sin(end.heading) };
  const back = { x: Math.sin(end.heading), z: Math.cos(end.heading) };
  const truckSpot = { x: end.x + left.x * 6.5 + back.x, z: end.z + left.z * 6.5 + back.z };
  const truck = dumpTruck();
  place(truck, truckSpot, end.heading);
  scene.add(truck);
  for (const along of [-2.5, 0, 2.5]) {
    obstacles.push({ x: truckSpot.x + back.x * along, z: truckSpot.z + back.z * along, radius: 1.4 });
  }

  // Machines that go back and forth: along the gravel, or between the gravel pile and the road.
  const roll = roller();
  const grade = grader();
  const loader = skidSteer();
  for (const machine of [roll, grade, loader]) scene.add(machine.root);
  const machines = [digger.root, truck, roll.root, grade.root, loader.root];
  const shuttles = [
    { machine: roll, side: 1.1, from: asphalt + 3, to: gravel - 3, speed: 1.6, wait: 1.5, at: asphalt + 3, way: 1 },
    { machine: grade, side: -1.5, from: asphalt + 5, to: gravel - 4, speed: 1.1, wait: 3, at: gravel - 4, way: -1 },
  ];
  // It drives from the edge of the road up to the foot of the heap.
  const roadEdge = roadside(path.nearest(GRAVEL_HEAP.x, GRAVEL_HEAP.z).s, 3);
  const reach = Math.hypot(GRAVEL_HEAP.x - roadEdge.x, GRAVEL_HEAP.z - roadEdge.z);
  const toFoot = (reach - GRAVEL_HEAP.radius * 0.45) / reach;
  const pile = {
    x: roadEdge.x + (GRAVEL_HEAP.x - roadEdge.x) * toFoot,
    z: roadEdge.z + (GRAVEL_HEAP.z - roadEdge.z) * toFoot,
  };
  let loaderAt = 0; // 0 at the road, 1 at the pile
  let loaderWay = 1;
  let loaderWait = 0;
  let time = 0;
  const colliders = [];

  function blocked(x, z, player) {
    return player && Math.hypot(player.x - x, player.z - z) < 4.5;
  }

  return {
    /** Circles round the moving machines, for collisions. */
    colliders,
    update(dt, player) {
      time += dt;
      // From further off the machines are specks; skip drawing them.
      const inSight = !player || Math.hypot(player.x - ROADWORKS.site.x, player.z - ROADWORKS.site.z) < 330;
      for (const machine of machines) machine.visible = inSight;
      digger.update(time);
      colliders.length = 0;
      for (const shuttle of shuttles) {
        const { machine } = shuttle;
        const front = path.offset(shuttle.at + shuttle.way * (machine.length / 2 + 1), shuttle.side);
        if (shuttle.pause > 0) shuttle.pause -= dt;
        else if (!blocked(front.x, front.z, player)) {
          shuttle.at += shuttle.way * shuttle.speed * dt;
          if (machine.drum) machine.drum.rotation.x -= (shuttle.speed * dt) / 0.75;
          if (shuttle.at > shuttle.to || shuttle.at < shuttle.from) {
            shuttle.way = -shuttle.way;
            shuttle.at = Math.min(shuttle.to, Math.max(shuttle.from, shuttle.at));
            shuttle.pause = shuttle.wait;
          }
        }
        const spot = roadside(shuttle.at, shuttle.side);
        // Both machines drive forwards towards the far end and reverse back.
        place(machine.root, spot);
        for (const k of [-1, 0, 1]) {
          const p = path.offset(shuttle.at + (k * machine.length) / 3, shuttle.side);
          colliders.push({ x: p.x, z: p.z, radius: 1.25 });
        }
      }

      // The skid steer: forwards to the pile, scoop, back out to the road, tip, and again.
      const heading = Math.atan2(roadEdge.x - pile.x, roadEdge.z - pile.z);
      const x = roadEdge.x + (pile.x - roadEdge.x) * loaderAt;
      const z = roadEdge.z + (pile.z - roadEdge.z) * loaderAt;
      if (loaderWait > 0) loaderWait -= dt;
      else if (!blocked(x, z, player)) {
        loaderAt += (loaderWay * 1.6 * dt) / Math.hypot(pile.x - roadEdge.x, pile.z - roadEdge.z);
        if (loaderAt > 1 || loaderAt < 0) {
          loaderWay = -loaderWay;
          loaderAt = Math.min(1, Math.max(0, loaderAt));
          loaderWait = 2;
        }
      }
      place(loader.root, { x, z }, heading);
      // The bucket rides low on the way to the pile and lifts when it has a load.
      const lifting = loaderWay < 0 ? 1 : 0;
      loader.arms.rotation.x +=
        ((loaderWait > 0 ? 0.9 - lifting * 0.9 : lifting * 0.35) - loader.arms.rotation.x) * Math.min(1, dt * 2);
      colliders.push({ x, z, radius: 1.4 });
    },
  };
}
