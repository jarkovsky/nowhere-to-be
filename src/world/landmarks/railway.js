// The branch line: ballast, sleepers and rails from the buffer stop at the
// halt, over the level crossing and up the cutting to a stone tunnel portal.
// The crossing has Czech-style warning lights (two red lamps that flash in
// turn while a train is near, and a white lamp that blinks slowly while the
// way is clear) and red-and-white half barriers.
import * as THREE from 'three';
import { RAILWAY, HALT, LEVEL_CROSSING, ROAD, ROAD_HALF_WIDTH } from '../layout.js';
import { CROSSING_REACH, railLevel, terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';
import { LANE } from '../../vehicles/traffic.js';
import { framer } from './frame.js';

/** Height of the top of the rails above the bed. The train's wheels stand on it. */
export const RAIL_TOP = 0.4;
const GAUGE = 1.435;
const BALLAST = '#9a958b';
const SLEEPER = '#6f5c4a';
const RAIL = '#8a867e';
const STONE = '#b3ab98';

/** A point beside the line: `along` metres along it, `side` metres to its right, `up` above the bed. */
function trackside(along, side = 0, up = 0) {
  const p = RAILWAY.offset(along, side);
  return { x: p.x, y: railLevel(along) + up, z: p.z, ry: Math.atan2(p.dx, p.dz) };
}

function buildTrack(parts) {
  const onRoad = s => Math.abs(s - LEVEL_CROSSING.s) < CROSSING_REACH;
  const end = RAILWAY.length;
  for (let s = 0; s < end; s += 2) {
    if (onRoad(s + 1)) continue;
    // Ballast in short lengths, so it follows the curves and the climb.
    const a = trackside(s);
    const b = trackside(Math.min(s + 2.1, end));
    parts.beam({ ...a, y: a.y + 0.02 }, { ...b, y: b.y + 0.02 }, 3.2, BALLAST, 0.3);
  }
  for (let s = 0.4; s < end; s += 0.65) {
    if (!onRoad(s)) parts.box(2.5, 0.12, 0.24, SLEEPER, trackside(s, 0, 0.22));
  }
  for (const side of [-GAUGE / 2, GAUGE / 2]) {
    for (let s = 0; s < end; s += 1) {
      const a = trackside(s, side, RAIL_TOP - 0.07);
      const b = trackside(Math.min(s + 1, end), side, RAIL_TOP - 0.07);
      parts.beam(a, b, 0.1, RAIL, 0.14);
    }
  }
  // Rubber panels between and beside the rails where the trail crosses.
  for (let s = LEVEL_CROSSING.s - CROSSING_REACH; s < LEVEL_CROSSING.s + CROSSING_REACH; s += 1) {
    for (const [side, width] of [
      [0, GAUGE - 0.16],
      [-GAUGE / 2 - 0.5, 0.8],
      [GAUGE / 2 + 0.5, 0.8],
    ]) {
      const a = trackside(s, side);
      const b = trackside(s + 1, side);
      a.y = terrainHeight(a.x, a.z) + 0.1;
      b.y = terrainHeight(b.x, b.z) + 0.1;
      parts.beam(a, b, width, '#4c4f4a', 0.12);
    }
  }
}

function buildBufferStop(parts, obstacles) {
  const at = (side, up, extra = {}) => ({ ...trackside(-0.6, side, up), ...extra });
  for (const side of [-0.7, 0.7]) parts.box(0.25, 1.1, 0.25, '#5d5f58', at(side, 0.7));
  for (let i = 0; i < 4; i++) {
    parts.box(0.52, 0.4, 0.3, i % 2 ? '#f2efe6' : '#c8302a', at(-0.78 + i * 0.52, 1.3));
  }
  const p = trackside(-0.6);
  obstacles.push({ x: p.x, z: p.z, radius: 1.3 });
}

function buildHalt(parts, obstacles) {
  const { from, to, side } = HALT;
  const edge = side * 1.75; // the platform edge, just clear of the train
  const width = 3;
  const middle = side * (1.75 + width / 2);
  for (let s = from; s < to; s += 2) {
    const a = trackside(s, middle, 0.38);
    const b = trackside(Math.min(s + 2.05, to), middle, 0.38);
    parts.beam(a, b, width, '#b7b2a6', 0.75);
    parts.beam(
      trackside(s, edge + side * 0.2, 0.77),
      trackside(Math.min(s + 2.05, to), edge + side * 0.2, 0.77),
      0.25,
      '#f1ede2',
      0.03,
    );
  }
  // A brick shelter at the back of the platform, with a bench and a timetable.
  const shelter = trackside((from + to) / 2, side * 4.3, 0.75);
  const { at, local } = framer({ x: shelter.x, z: shelter.z, rotation: shelter.ry }, shelter.y);
  // Local Z runs along the line and local X points to its left, so `out` points away from the track.
  const out = -side;
  const back = out * 0.9;
  parts.box(0.3, 2.5, 4.4, '#b8664a', at(back, 1.25, 0));
  for (const lz of [-2.1, 2.1]) parts.box(1.8, 2.5, 0.25, '#b8664a', at(back - out * 0.75, 1.25, lz));
  parts.box(2.6, 0.18, 5, '#5d4a3e', at(back - out * 0.7, 2.6, 0, { rz: out * 0.12 }));
  parts.box(0.5, 0.1, 3, '#8a6446', at(back - out * 0.45, 0.48, 0));
  parts.box(0.06, 1, 0.8, '#e8c53a', at(back - out * 0.17, 1.55, 1.2)); // timetable
  for (const s of [from + 3, to - 3]) {
    const lamp = trackside(s, side * 3.9, 0.75);
    parts.add(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6), '#4f5a55', { ...lamp, y: lamp.y + 1.8 });
    parts.box(0.5, 0.18, 0.3, '#4f5a55', { ...lamp, y: lamp.y + 3.6 });
  }
  // The platform and shelter are solid.
  const a = trackside(from, middle);
  const b = trackside(to, middle);
  obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: width / 2 });
  obstacles.push({ ...local(back - out * 0.7, 0), radius: 2.3 });
}

function buildPortal(parts, obstacles) {
  const end = RAILWAY.length;
  const mouth = trackside(end);
  // Local Z runs into the hill.
  const { at, local } = framer({ x: mouth.x, z: mouth.z, rotation: mouth.ry }, mouth.y);
  const walls = [];
  const span = 3.4; // half the width of the bore
  const depth = 12; // the headwall reaches back under the hillside, over the end of the cutting
  // A stone headwall either side of the bore and over it, with wing walls holding back the cutting.
  for (const side of [-1, 1]) {
    parts.box(5, 11.5, depth, STONE, at(side * (span + 2.5), 4.75, depth / 2));
    parts.box(3, 7, 1.6, STONE, at(side * (span + 6.4), 2.5, 0.4, { ry: mouth.ry - side * 0.55 }));
    walls.push(
      { ...local(side * (span + 2.5), depth / 2), halfX: 2.7, halfZ: depth / 2 + 0.2, rotation: mouth.ry, radius: 0 },
      { ...local(side * (span + 6.4), 0.4), halfX: 1.7, halfZ: 1, rotation: mouth.ry - side * 0.55, radius: 0 },
    );
  }
  parts.box(span * 2, 4.6, depth, STONE, at(0, 8.2, depth / 2));
  // A round arch of darker voussoirs round the opening, and a coping along the top.
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * Math.PI;
    parts.box(1.2, 0.7, 0.4, '#8f877a', at(Math.cos(a) * span, 4.3 + Math.sin(a) * 1.8, -0.1, { rz: a - Math.PI / 2 }));
  }
  for (const side of [-1, 1]) parts.box(0.6, 4.6, 0.4, '#8f877a', at(side * (span + 0.2), 2, -0.1));
  parts.box(span * 2 + 10.6, 0.5, 1.2, '#8f877a', at(0, 10.7, 0.4)); // coping
  parts.box(span * 2 + 10, 0.3, depth - 1, '#a3ad80', at(0, 10.6, depth / 2 + 0.5)); // turf on top
  // Inside: dark walls and roof, and darkness just inside the headwall. The train runs on into it.
  const dark = 5;
  for (const side of [-1, 1]) parts.box(0.3, 7, dark, '#2a2d2a', at(side * (span - 0.1), 3.3, dark / 2));
  parts.box(span * 2, 0.3, dark, '#2a2d2a', at(0, 5.9, dark / 2));
  parts.box(span * 2, 7, 0.3, '#0c0d0c', at(0, 3.3, dark));
  const a = local(-span - 2, 1);
  const b = local(span + 2, 1);
  obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 0.8 }, ...walls);
}

/**
 * The crossing's warning lights and barriers. Each approach has a signal on
 * its right-hand verge, with a half barrier that lowers across its own lane.
 */
function buildCrossing(scene, parts, obstacles) {
  const red = [0, 1].map(
    () => new THREE.MeshLambertMaterial({ color: '#5a1d16', emissive: '#ff3a1c', emissiveIntensity: 0 }),
  );
  const white = new THREE.MeshLambertMaterial({ color: '#cfd2cc', emissive: '#f4f7ff', emissiveIntensity: 0 });
  const arms = [];
  for (const direction of [1, -1]) {
    // Stand back far enough to be clear of the line, whatever the crossing angle.
    let along = 4;
    let spot;
    do {
      spot = ROAD.offset(LEVEL_CROSSING.roadS - direction * along, direction * (ROAD_HALF_WIDTH + 1.2));
      along += 0.5;
    } while (RAILWAY.nearest(spot.x, spot.z).distance < 4.2 && along < 20);
    const y = terrainHeight(spot.x, spot.z);
    // The signal faces oncoming traffic.
    const facing = Math.atan2(-spot.dx * direction, -spot.dz * direction) + Math.PI;
    const { at, local } = framer({ x: spot.x, z: spot.z, rotation: facing }, y);
    parts.add(new THREE.CylinderGeometry(0.1, 0.12, 4.4, 8), '#a9ada7', at(0, 2.2, 0));
    // The cross: two red-and-white boards.
    for (const tilt of [0.6, -0.6]) {
      for (let k = -2; k <= 2; k++) {
        const r = k * 0.3;
        parts.box(0.3, 0.2, 0.05, k % 2 ? '#f2efe6' : '#c8302a', {
          ...at(Math.cos(tilt) * r, 4.15 + Math.sin(tilt) * r, -0.12),
          rz: tilt,
        });
      }
    }
    parts.box(1, 0.5, 0.25, '#202321', at(0, 3.45, -0.05)); // lamp housing
    parts.box(0.36, 0.36, 0.2, '#202321', at(0, 3.02, -0.05));
    for (const [k, lx] of [
      [0, -0.25],
      [1, 0.25],
    ]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 12).rotateX(Math.PI / 2), red[k]);
      const p = at(lx, 3.45, -0.2);
      lamp.position.set(p.x, p.y, p.z);
      lamp.rotation.y = facing;
      scene.add(lamp);
    }
    const moon = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12).rotateX(Math.PI / 2), white);
    const m = at(0, 3.02, -0.17);
    moon.position.set(m.x, m.y, m.z);
    moon.rotation.y = facing;
    scene.add(moon);
    obstacles.push({ x: spot.x, z: spot.z, radius: 0.35 });

    // The barrier pivots on a post beside the signal and reaches almost to the middle of the trail,
    // which is along the signal's local +X.
    const base = local(0.6, 0);
    parts.box(0.5, 1.3, 0.5, '#a9ada7', { x: base.x, y: y + 0.65, z: base.z, ry: facing });
    const hinge = new THREE.Group();
    hinge.position.set(base.x, y + 1.15, base.z);
    hinge.rotation.y = facing;
    const arm = new THREE.Group();
    hinge.add(arm);
    const length = ROAD_HALF_WIDTH + 1.2 - 0.6 - 0.5;
    const stripes = new PartsBuilder();
    for (let i = 0; i < 9; i++) {
      stripes.box(length / 9, 0.12, 0.08, i % 2 ? '#f2efe6' : '#c8302a', { x: 0.3 + (i + 0.5) * (length / 9) });
    }
    arm.add(stripes.mesh());
    scene.add(hinge);
    // Where the arm reaches when it is down, for collisions.
    const tip = local(0.9 + length, 0);
    arms.push({ arm, collider: { ax: base.x, az: base.z, bx: tip.x, bz: tip.z, radius: 0.2 } });
  }

  // Traffic waits short of the crossing in both lanes.
  const blockers = [-LANE, LANE].map(side => ROAD.offset(LEVEL_CROSSING.roadS, side));
  let lowered = 0; // 0 is up, 1 is down
  let closedFor = 0;
  let time = 0;
  return {
    blockers: () => (lowered > 0.05 ? blockers : []),
    colliders: () => (lowered > 0.7 ? arms.map(a => a.collider) : []),
    update(dt, closed) {
      time += dt;
      closedFor = closed ? closedFor + dt : 0;
      // The barriers wait for the lights to flash for a few seconds before coming down.
      const target = closedFor > 3 ? 1 : 0;
      lowered = Math.max(0, Math.min(1, lowered + (target ? dt / 4 : -dt / 3)));
      for (const { arm } of arms) arm.rotation.z = (1 - Math.min(1, lowered * 1.25)) * (Math.PI / 2);
      const flash = Math.floor(time * 2) % 2;
      red[0].emissiveIntensity = closed && flash === 0 ? 1.6 : 0;
      red[1].emissiveIntensity = closed && flash === 1 ? 1.6 : 0;
      white.emissiveIntensity = !closed && Math.floor(time * 1.2) % 2 === 0 ? 1.1 : 0;
    },
  };
}

export function buildRailway(scene, obstacles) {
  const parts = new PartsBuilder();
  buildTrack(parts);
  buildBufferStop(parts, obstacles);
  buildHalt(parts, obstacles);
  buildPortal(parts, obstacles);
  const crossing = buildCrossing(scene, parts, obstacles);
  scene.add(parts.mesh());
  return crossing;
}
