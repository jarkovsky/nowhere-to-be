// The marked trails, Czech style. Each trail's mark is a stripe of its colour between two white
// ones, painted round wooden posts beside the path every thirty metres or so and at its bends.
// Where a trail leaves the main trail a metal signpost carries a white arrow with its mark,
// pointing the way, and where it ends there is a bench, or a wooden platform, facing the view.
import * as THREE from 'three';
import { angleDelta } from '../../core/math.js';
import { ROAD, TRAILS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame } from '../build.js';

const WHITE = '#f1ede2';
const POST = '#7d6a4f';
const WOOD = '#8a6446';
const DARK_WOOD = '#5f4532';
const METAL = '#8e938d';

/** The longest stretch of path between two marks, and the shortest, which only a bend can make. */
export const MARK_GAP = 32;
export const BEND_GAP = 14;
/** A bend that turns the path this far (in radians, over 12 m) gets a mark of its own. */
export const BEND = 0.35;
/** How far along its path each trail's signpost stands, just off the edge of the main trail. */
export const SIGNPOST_AT = 11;
/** How far to the side of the path the posts stand. */
const BESIDE = 2.6;

/** How far the path turns over the 12 m around `s`: positive to the right, negative to the left. */
export function turnAt(path, s) {
  const a = path.at(s - 6);
  const b = path.at(s + 6);
  return -angleDelta(Math.atan2(a.dx, a.dz), Math.atan2(b.dx, b.dz));
}

/**
 * Where the marks go along `path`: one soon after the signpost, then one every `MARK_GAP` metres,
 * one at each bend, on its outside so it is seen ahead (and more along a long one), and a last one
 * just before the end.
 */
export function markSpots(path) {
  const spots = [];
  const first = SIGNPOST_AT + 8;
  const last = path.length - 6;
  const bend = s => Math.abs(turnAt(path, s));
  for (let s = first; s <= last; s++) {
    const since = spots.length ? s - spots[spots.length - 1].s : Infinity;
    const bending = bend(s) > BEND;
    const apex = bending && bend(s) >= bend(s - 1) && bend(s) >= bend(s + 1);
    if (since >= MARK_GAP || (apex && since >= BEND_GAP) || (bending && since >= BEND_GAP + 4))
      spots.push({ s, side: bending ? -Math.sign(turnAt(path, s)) : 1 });
  }
  if (last - spots[spots.length - 1].s > BEND_GAP) spots.push({ s: last, side: 1 });
  return spots.map(({ s, side }) => ({ s, side, ...path.offset(s, side * BESIDE) }));
}

/** A post with the mark painted round it near the top: white, the trail's colour, white. */
function addMark(parts, { x, z }, color) {
  const y = terrainHeight(x, z);
  parts.box(0.3, 1.95, 0.3, POST, { x, y: y + 0.77, z });
  parts.box(0.34, 0.06, 0.34, DARK_WOOD, { x, y: y + 1.77, z });
  const bands = [
    [1.6, WHITE],
    [1.47, color],
    [1.34, WHITE],
  ];
  for (const [h, paint] of bands) parts.box(0.315, 0.13, 0.315, paint, { x, y: y + h, z });
}

/**
 * A metal signpost with a white arrow pointing along the trail, and the trail's mark at the
 * arrow's tail. `towards` is the way it points.
 */
function addSignpost(parts, { x, z }, towards, color) {
  const y = terrainHeight(x, z);
  parts.add(new THREE.CylinderGeometry(0.065, 0.07, 2.8, 8), METAL, { x, y: y + 1.2, z });
  parts.add(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 8), '#6f746e', { x, y: y + 2.62, z });
  const yaw = Math.atan2(towards.x - x, towards.z - z);
  const along = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const at = d => ({ x: x + along.x * d, z: z + along.z * d });
  const height = 0.26;
  const length = 0.95;
  const plate = y + 2.3;
  // A white plate with a thin dark edge, pointed at the end: the point is a square turned on its
  // corner, half of it showing past the end of the plate.
  for (const [grow, thick, paint] of [
    [0.035, 0.02, '#3d4440'],
    [0, 0.026, WHITE],
  ]) {
    parts.box(thick, height + grow, length + grow, paint, { ...at(0.05 + length / 2), y: plate, ry: yaw });
    const side = (height + grow) / Math.SQRT2;
    parts.box(thick, side, side, paint, { ...at(0.05 + length), y: plate, ry: yaw, rx: Math.PI / 4 });
  }
  // The mark, a stripe of the trail's colour in the white near the tail, on both faces.
  parts.box(0.034, 0.08, 0.22, color, { ...at(0.22), y: plate, ry: yaw });
}

/** A wooden bench facing the way `local` looks out (its -Z), with its legs down to the ground. */
function addBench(parts, local, rotation, { lz = 0, floor = null } = {}) {
  const ground = (lx, dz) => floor ?? terrainHeight(local(lx, lz + dz).x, local(lx, lz + dz).z);
  const seat = Math.max(...[-0.9, 0.9].flatMap(lx => [ground(lx, -0.2), ground(lx, 0.25)])) + 0.48;
  const at = (lx, y, dz) => ({ ...local(lx, lz + dz), y, ry: rotation });
  parts.box(2.2, 0.08, 0.48, WOOD, at(0, seat, 0));
  parts.box(2.2, 0.32, 0.07, WOOD, at(0, seat + 0.36, 0.28));
  for (const lx of [-0.9, 0.9]) {
    const foot = ground(lx, 0);
    const legs = seat - foot + 0.1;
    parts.box(0.09, legs, 0.42, DARK_WOOD, at(lx, foot - 0.1 + legs / 2, 0));
    parts.box(0.09, 0.62, 0.07, DARK_WOOD, at(lx, seat + 0.25, 0.28));
  }
}

/** A wooden viewing platform on legs, with a rail round its front and sides and a bench on it. */
function addPlatform(parts, local, rotation) {
  const width = 3.8;
  const depth = 2.8;
  const ground = (lx, lz) => terrainHeight(local(lx, lz).x, local(lx, lz).z);
  const corners = [-1, 1].flatMap(sx => [-1, 1].map(sz => [(sx * width) / 2, (sz * depth) / 2]));
  const floor = Math.max(...corners.map(([lx, lz]) => ground(lx, lz))) + 0.35;
  const at = (lx, y, lz, extra = {}) => ({ ...local(lx, lz), y, ry: rotation, ...extra });
  parts.box(width, 0.12, depth, WOOD, at(0, floor - 0.06, 0));
  for (let i = 1; i < 6; i++) parts.box(width, 0.02, 0.03, DARK_WOOD, at(0, floor, -depth / 2 + (i * depth) / 6));
  // Legs at the corners and halfway along the front, down into the ground.
  for (const [lx, lz] of [...corners, [0, -depth / 2]]) {
    const foot = ground(lx * 0.95, lz * 0.95) - 0.3;
    parts.box(0.16, floor - foot, 0.16, DARK_WOOD, at(lx * 0.95, (floor + foot) / 2, lz * 0.95));
  }
  // The rail: posts and two rails along the front and both sides; the back is open to step up.
  const rail = [
    [-width / 2, depth / 2],
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
  ].map(([lx, lz]) => [lx * 0.96, lz * 0.96]);
  for (const [lx, lz] of [...rail, [0, (-depth / 2) * 0.96], [(-width / 2) * 0.96, 0], [(width / 2) * 0.96, 0]])
    parts.box(0.1, 1.05, 0.1, DARK_WOOD, at(lx, floor + 0.52, lz));
  for (let i = 0; i < rail.length - 1; i++) {
    for (const h of [0.5, 1.02]) {
      const a = { ...local(...rail[i]), y: floor + h };
      const b = { ...local(...rail[i + 1]), y: floor + h };
      parts.beam(a, b, 0.07, WOOD, 0.08);
    }
  }
  // A step up at the back.
  const back = ground(0, depth / 2 + 0.45);
  if (floor - back > 0.3)
    parts.box(1.2, (floor - back) / 2, 0.5, DARK_WOOD, at(0, back + (floor - back) / 4, depth / 2 + 0.3));
  addBench(parts, local, rotation, { lz: 0.6, floor });
}

/** Builds the marks, signposts and viewpoints of every marked trail. Returns where they are. */
export function buildWaymarks(scene, obstacles) {
  const built = [];
  for (const { id, color, path, view } of TRAILS) {
    const parts = new PartsBuilder();
    const marks = markSpots(path);
    for (const mark of marks) addMark(parts, mark, color);
    // The signpost stands on the grass beside the path, on whichever side is further from the
    // main trail, pointing up the trail.
    const signpost = [-BESIDE, BESIDE]
      .map(side => path.offset(SIGNPOST_AT, side))
      .reduce((a, b) => (ROAD.nearest(a.x, a.z).distance > ROAD.nearest(b.x, b.z).distance ? a : b));
    addSignpost(parts, signpost, path.at(SIGNPOST_AT + 12), color);
    obstacles.push({ x: signpost.x, z: signpost.z, radius: 0.2 });

    const local = localFrame(view.x, view.z, view.heading);
    if (view.platform) {
      addPlatform(parts, local, view.heading);
      const [a, b] = [local(-1.9, 0), local(1.9, 0)];
      obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 1.5 });
    } else {
      addBench(parts, local, view.heading);
      obstacles.push({ ...local(0, 0.1), radius: 1.1 });
    }
    scene.add(parts.mesh());
    built.push({ id, marks, signpost, view });
  }
  return built;
}
