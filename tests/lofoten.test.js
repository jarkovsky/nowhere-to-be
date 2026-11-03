import test from 'node:test';
import assert from 'node:assert/strict';
import './dom.js';
import * as THREE from 'three';
import { HULL, RAMP } from '../src/core/ferry.js';
import { angleDelta, clamp } from '../src/core/math.js';
import { createObstacleIndex } from '../src/core/collision.js';
import { createCarState, stepDriving } from '../src/core/driving.js';
import { chassisPose } from '../src/core/suspension.js';
import {
  FERRY_LANE,
  FERRY_QUAY,
  FJORD,
  HERDS,
  LOFOTEN,
  LOFOTEN_QUAY,
  PADS,
  VALLEY_RADIUS,
  insideFence,
  lofotenness,
  winterness,
} from '../src/world/layout.js';
import { headingOf } from '../src/world/path.js';
import { drivingHeight, isDriveable, quayHeight, terrainHeight, waterDepth, waterLevel } from '../src/world/terrain.js';
import { buildScenery } from '../src/world/scenery.js';
import { buildLofoten } from '../src/world/landmarks/lofoten.js';
import { buildFjord } from '../src/world/landmarks/fjord.js';

const scene = new THREE.Scene();
const { obstacles } = buildScenery(scene);
buildFjord(scene, obstacles);
buildLofoten(scene, obstacles);

const roads = Object.entries(LOFOTEN.roads);
const { dock } = LOFOTEN_QUAY;
/** The way the ferry faces at a dock, out over the water. */
const outOf = d => ({ x: -Math.sin(d.heading), z: -Math.cos(d.heading) });

test('the ferry lane runs from one dock to the other, straight out of the first and straight in to the second', () => {
  const [from, to] = [FERRY_LANE.at(0), FERRY_LANE.at(FERRY_LANE.length)];
  assert.ok(Math.hypot(from.x - FERRY_QUAY.dock.x, from.z - FERRY_QUAY.dock.z) < 0.01);
  assert.ok(Math.hypot(to.x - dock.x, to.z - dock.z) < 0.01);
  // The first 40 m go straight out along the head dock's heading.
  const out = outOf(FERRY_QUAY.dock);
  for (let s = 0; s <= 40; s += 2) {
    const p = FERRY_LANE.at(s);
    const along = (p.x - from.x) * out.x + (p.z - from.z) * out.z;
    const across = (p.x - from.x) * out.z - (p.z - from.z) * out.x;
    assert.ok(Math.abs(across) < 0.4, `${across.toFixed(2)} m off the dock's line at ${s} m`);
    assert.ok(Math.abs(along - s) < 0.4);
  }
  // The last 60 m (and more) lie on the line out of the far dock, ending on it, facing the quay.
  const back = outOf(dock);
  for (let s = FERRY_LANE.length - 80; s <= FERRY_LANE.length; s += 2) {
    const p = FERRY_LANE.at(s);
    const across = (p.x - dock.x) * back.z - (p.z - dock.z) * back.x;
    assert.ok(
      Math.abs(across) < 0.05,
      `${across.toFixed(3)} m off the quay's line at ${(FERRY_LANE.length - s).toFixed(0)} m out`,
    );
  }
  assert.ok(to.dx * back.x + to.dz * back.z < -0.999, 'it comes in towards the quay');
});

test('the ferry lane is smooth, never bending tighter than 80 m round', () => {
  const step = 4;
  let tightest = Infinity;
  for (let s = 0; s + 2 * step <= FERRY_LANE.length; s += 2) {
    const [a, b, c] = [FERRY_LANE.at(s), FERRY_LANE.at(s + step), FERRY_LANE.at(s + 2 * step)];
    const turn = Math.abs(angleDelta(Math.atan2(b.z - a.z, b.x - a.x), Math.atan2(c.z - b.z, c.x - b.x)));
    if (turn > 1e-9) tightest = Math.min(tightest, step / turn);
  }
  assert.ok(tightest > 80, `${tightest.toFixed(0)} m round`);
});

test('the water is at least 2.5 m deep for 12 m either side of the ferry lane, all the way down the fjord and across the bay', () => {
  for (let s = 0; s <= FERRY_LANE.length; s += 3) {
    for (const side of [-12, -6, 0, 6, 12]) {
      const p = FERRY_LANE.offset(s, side);
      assert.equal(waterLevel(p.x, p.z), FJORD.level, `dry at ${s.toFixed(0)} m, ${side} m aside`);
      assert.ok(
        waterDepth(p.x, p.z) >= 2.5,
        `${waterDepth(p.x, p.z).toFixed(1)} m at ${s.toFixed(0)} m, ${side} m aside`,
      );
    }
  }
});

test('the ferry at the far dock lies in deep water from end to end, its ramp reaching the end of the quay', () => {
  const out = outOf(dock);
  const side = { x: out.z, z: -out.x };
  const [near, far] = [-HULL.halfLength - RAMP, HULL.halfLength + RAMP];
  let shallowest = Infinity;
  for (let along = near; along <= far; along += 1.5) {
    for (let across = -HULL.halfBeam; across <= HULL.halfBeam; across += 1.65) {
      const [x, z] = [dock.x + out.x * along + side.x * across, dock.z + out.z * along + side.z * across];
      // The end by the quay lies over the quay's own ramp, which is deck rather than water.
      if (quayHeight(x, z) !== null) continue;
      shallowest = Math.min(shallowest, waterDepth(x, z));
    }
  }
  assert.ok(shallowest >= 2.5, `${shallowest.toFixed(2)} m under the ferry`);
  // The water reaches in to the end of the ramp, like at the head of the fjord.
  const frame = LOFOTEN.at;
  const [tx, tz] = frame(0, LOFOTEN_QUAY.to + 0.5);
  assert.ok(waterDepth(tx, tz) > 2, `${waterDepth(tx, tz).toFixed(1)} m at the end of the ramp`);
  for (const lx of [-4, 4]) assert.ok(waterDepth(...frame(lx, LOFOTEN_QUAY.to + 0.5)) > 2);
});

test('the quay stands on the shore: its land end meets the ground, and a road leads from it into the village', () => {
  const [lx, lz] = LOFOTEN.at(0, LOFOTEN_QUAY.from - 0.5);
  assert.ok(Math.abs(terrainHeight(lx, lz) - LOFOTEN_QUAY.low) < 0.5, `${terrainHeight(lx, lz).toFixed(2)} m`);
  for (const behind of [3, 8, 14]) {
    const [x, z] = LOFOTEN.at(0, -behind);
    assert.ok(terrainHeight(x, z) >= FJORD.level + 0.2, 'dry behind it');
    assert.ok(
      Math.abs(terrainHeight(x, z) - LOFOTEN_QUAY.low) < 1.2,
      `${behind} m back is ${terrainHeight(x, z).toFixed(2)} m`,
    );
    assert.ok(isDriveable(x, z));
  }
  const start = LOFOTEN.roads.quay.at(0);
  assert.ok(Math.hypot(start.x - LOFOTEN_QUAY.x, start.z - LOFOTEN_QUAY.z) < 2.5, 'the road starts at the quay');
  // It joins the loop, which runs on past the church.
  const end = LOFOTEN.roads.quay.at(LOFOTEN.roads.quay.length);
  assert.ok(LOFOTEN.roads.loop.isNear(end.x, end.z, 2));
  assert.ok(
    Math.hypot(
      LOFOTEN.church.x - LOFOTEN.roads.church.at(LOFOTEN.roads.church.length).x,
      LOFOTEN.church.z - LOFOTEN.roads.church.at(LOFOTEN.roads.church.length).z,
    ) < 40,
  );
});

test('the roads are driveable all the way, gentle and well inside the fence', () => {
  assert.ok(roads.length >= 4);
  const loop = LOFOTEN.roads.loop;
  assert.ok(loop.length > 1000 && loop.length < 1600, `${loop.length.toFixed(0)} m round`);
  for (const [name, path] of roads) {
    for (let s = 0; s <= path.length - (path.closed ? 1 : 0); s += 2) {
      const p = path.at(s);
      const back = path.at(s - 8);
      assert.ok(isDriveable(p.x, p.z), `${name} blocked at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
      assert.ok(insideFence(p.x, p.z, 25), `${name} too near the fence`);
      if (s >= 8 || path.closed) {
        const grade = Math.abs(drivingHeight(p.x, p.z) - drivingHeight(back.x, back.z)) / 8;
        assert.ok(grade < 0.12, `${name}: ${grade.toFixed(2)} steep at ${s.toFixed(0)} m`);
      }
      // And level across, for the car not to lean.
      const [a, b] = [path.offset(s, -3), path.offset(s, 3)];
      assert.ok(
        Math.abs(terrainHeight(a.x, a.z) - terrainHeight(b.x, b.z)) < 0.7,
        `${name} leans at ${s.toFixed(0)} m`,
      );
    }
  }
});

test('nothing solid stands on a road or a drivable band beside it, nor on the open flats', () => {
  const solid = (x, z, margin) =>
    obstacles.some(o => {
      if (o.x !== undefined && o.radius !== undefined && o.halfX === undefined)
        return Math.hypot(x - o.x, z - o.z) < o.radius + margin;
      if (o.ax !== undefined) {
        const [dx, dz] = [o.bx - o.ax, o.bz - o.az];
        const t = clamp(((x - o.ax) * dx + (z - o.az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        return Math.hypot(x - o.ax - dx * t, z - o.az - dz * t) < o.radius + margin;
      }
      if (o.halfX !== undefined) {
        const [cos, sin] = [Math.cos(o.rotation ?? 0), Math.sin(o.rotation ?? 0)];
        const [dx, dz] = [x - o.x, z - o.z];
        return Math.abs(dx * cos - dz * sin) < o.halfX + margin && Math.abs(dx * sin + dz * cos) < o.halfZ + margin;
      }
      return false;
    });
  for (const [name, path] of roads) {
    for (let s = 0; s < path.length; s += 2) {
      for (const side of [-3.4, 0, 3.4]) {
        const p = path.offset(s, side);
        assert.ok(!solid(p.x, p.z, 1.2), `${name}: something in the way at ${s.toFixed(0)} m, ${side} m aside`);
      }
    }
  }
  // The flats inside and just outside the loop are open: nothing solid within 150 m of the middle but the buildings and racks.
  const [fx, fz] = LOFOTEN.at(0, -140);
  for (let dx = -120; dx <= 120; dx += 8) {
    for (let dz = -60; dz <= 60; dz += 8) {
      const [x, z] = [fx + dx, fz + dz];
      if (Math.hypot(x - LOFOTEN.church.x, z - LOFOTEN.church.z) < 20) continue;
      if (LOFOTEN.houses.some(house => Math.hypot(x - house.x, z - house.z) < 12)) continue;
      if (LOFOTEN.racks.some(rack => Math.hypot(x - rack.x, z - rack.z) < 16)) continue;
      assert.ok(!solid(x, z, 0.5), `an obstacle on the open flats at ${x.toFixed(0)}, ${z.toFixed(0)}`);
    }
  }
});

const world = {
  obstacles: createObstacleIndex(obstacles),
  dynamic: [],
  surface: () => 'snow',
  slope: (x, z, heading) => {
    const dx = -Math.sin(heading) * 1.5;
    const dz = -Math.cos(heading) * 1.5;
    return (drivingHeight(x + dx, z + dz) - drivingHeight(x - dx, z - dz)) / 3;
  },
  isDriveable,
};

/** Drives along a path like a careful driver, or a careless one who aims `bias` metres off it or zig-zags `zigzag` metres either way, and reports how far it got. */
function followPath(path, length, { bias = 0, zigzag = 0 } = {}) {
  const start = path.at(0);
  const heading = headingOf(start.dx, start.dz);
  const car = createCarState({ x: start.x, z: start.z, heading });
  let progress = 0;
  let lastS = 0;
  const stats = { roll: 0, pitch: 0, stopped: 0 };
  let still = 0;
  for (let step = 0; step < 60 * 400 && progress < length; step++) {
    const near = path.nearest(car.x, car.z);
    if (near.distance > 7) return { progress, stuck: `left the path at s=${progress.toFixed(0)}` };
    let delta = near.s - lastS;
    if (path.closed) delta = ((delta + path.length * 1.5) % path.length) - path.length / 2;
    progress += delta;
    lastS = near.s;
    const aim = bias + zigzag * Math.sin((step / 60) * ((2 * Math.PI) / 6));
    const ahead = path.offset(near.s + 7, aim);
    const desired = Math.atan2(-(ahead.x - car.x), -(ahead.z - car.z));
    stepDriving(car, { cruise: true, steer: clamp(angleDelta(car.heading, desired) * 2.5, -1, 1) }, 1 / 60, world);
    const pose = chassisPose(car.x, car.z, car.heading, (x, z) => drivingHeight(x, z));
    stats.roll = Math.max(stats.roll, Math.abs(pose.roll));
    stats.pitch = Math.max(stats.pitch, Math.abs(pose.pitch));
    still = step > 180 && Math.abs(car.speed) < 0.3 ? still + 1 : 0;
    stats.stopped = Math.max(stats.stopped, still / 60);
  }
  return { progress, ...stats };
}

test('the loop can be driven all the way round at cruise speed, and so can every spur, never tipping over', () => {
  for (const [name, path] of roads) {
    const length = path.closed ? path.length : path.length - 4;
    const result = followPath(path, length);
    assert.equal(result.stuck, undefined, `${name}: ${result.stuck}`);
    assert.ok(
      result.progress >= length,
      `${name}: only reached ${result.progress.toFixed(0)} of ${path.length.toFixed(0)} m`,
    );
    assert.ok(
      result.roll < 0.25 && result.pitch < 0.25,
      `${name}: rolled ${result.roll.toFixed(2)}, pitched ${result.pitch.toFixed(2)}`,
    );
  }
});

test('a careless driver, aiming off the loop or zig-zagging across it, is never held up', () => {
  const { loop } = LOFOTEN.roads;
  for (const options of [{ bias: -3 }, { bias: 3 }, { zigzag: 2.5 }]) {
    const result = followPath(loop, loop.length, options);
    const label = JSON.stringify(options);
    assert.equal(result.stuck, undefined, `${label}: ${result.stuck}`);
    assert.ok(result.progress >= loop.length, `${label}: only reached ${result.progress.toFixed(0)} m`);
    assert.ok(result.stopped <= 3, `${label}: stood still for ${result.stopped.toFixed(1)} s`);
  }
});

test('the coast cannot be reached over land from the valley: it is far from the fence and the way between is not driveable', () => {
  assert.ok(
    Math.hypot(LOFOTEN.x, LOFOTEN.z) - LOFOTEN.radius - VALLEY_RADIUS > 100,
    'at least 100 m of mountains between',
  );
  // Flood the driveable ground from the valley's edge across the whole stretch between.
  const step = 8;
  const [x0, x1] = [-1500, -560];
  const cols = Math.ceil((x1 - x0) / step);
  const seen = new Set();
  const key = (i, j) => j * 10000 + i;
  const at = (i, j) => [x0 + i * step, x0 + j * step];
  const stack = [];
  // Start from the valley's road near the north-western fence, or any driveable point just inside it.
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < cols; j++) {
      const [x, z] = at(i, j);
      if (Math.hypot(x, z) < VALLEY_RADIUS - 30 && Math.hypot(x, z) > VALLEY_RADIUS - 60 && isDriveable(x, z)) {
        seen.add(key(i, j));
        stack.push([i, j]);
      }
    }
  }
  assert.ok(stack.length > 5, 'somewhere to start');
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const [ni, nj] = [i + di, j + dj];
      if (ni < 0 || nj < 0 || ni >= cols || nj >= cols || seen.has(key(ni, nj))) continue;
      const [x, z] = at(ni, nj);
      if (!isDriveable(x, z)) continue;
      seen.add(key(ni, nj));
      stack.push([ni, nj]);
    }
  }
  for (const [x, z] of [LOFOTEN.at(0, -30), LOFOTEN.at(0, -140), LOFOTEN.at(150, 40)]) {
    assert.ok(isDriveable(x, z), 'the coast itself can be driven');
    assert.ok(
      !seen.has(key(Math.round((x - x0) / step), Math.round((z - x0) / step))),
      'but not reached from the valley',
    );
  }
});

test('the bay is not round: coves and rocky points across the water, while the shore by the village keeps to the round', () => {
  const shoreAt = bearing => {
    const p = LOFOTEN.shore(bearing, 100);
    return FJORD.bay.shore(p.x, p.z);
  };
  const across = Array.from({ length: 200 }, (_, k) => shoreAt(80 + k * 0.5)).concat(
    Array.from({ length: 200 }, (_, k) => shoreAt(-80 - k * 0.5)),
  );
  assert.ok(Math.max(...across) - Math.min(...across) > 35, 'coves and points across the water');
  // By the quay, the cabins on stilts and the jetty, the shore is where they were built for.
  for (let bearing = -46; bearing <= 46; bearing++) assert.ok(Math.abs(shoreAt(bearing) - FJORD.bay.radius) < 1);
  // The ground follows it round the open bay: water out into a cove, dry land on a point. Further
  // round the bay narrows into the fjord, and the fjord's walls take over.
  for (const side of [1, -1]) {
    for (let bearing = 50; bearing <= 100; bearing += 1) {
      const shore = shoreAt(side * bearing);
      const wet = LOFOTEN.shore(side * bearing, shore - 8);
      const dry = LOFOTEN.shore(side * bearing, shore + 8);
      assert.ok(waterDepth(wet.x, wet.z) > 0.5, `water inside the shore at ${side * bearing}°`);
      assert.ok(waterDepth(dry.x, dry.z) < 0.05, `land outside the shore at ${side * bearing}°`);
    }
  }
});

test('the polar bears, the foxes and the reindeer stand inside the fence on dry ground, and so does the whole village', () => {
  const animals = HERDS.filter(h => ['polarBear', 'arcticFox', 'reindeer'].includes(h.kind));
  const bears = animals.filter(h => h.kind === 'polarBear');
  assert.ok(bears.length >= 3, 'a mother with cubs and lone bears');
  assert.ok(
    bears.some(b => b.count === 3 && b.young === 2),
    'a mother with two cubs',
  );
  for (const herd of animals) {
    assert.ok(insideFence(herd.x, herd.z, herd.radius), `${herd.kind} patch within the fence`);
    assert.equal(waterDepth(herd.x, herd.z), 0, `${herd.kind} starts in water`);
    // Every spot a wanderer may pick that is dry is fine; the middle and the edges must not be deep water.
    for (let a = 0; a < Math.PI * 2; a += 0.8) {
      const [x, z] = [herd.x + Math.cos(a) * herd.radius, herd.z + Math.sin(a) * herd.radius];
      assert.ok(waterDepth(x, z) < 0.95, `${herd.kind} could wade out at ${x.toFixed(0)}, ${z.toFixed(0)}`);
    }
  }
  for (const spot of [...LOFOTEN.cabins, ...LOFOTEN.houses, LOFOTEN.church, ...LOFOTEN.racks, LOFOTEN.lighthouse]) {
    assert.ok(insideFence(spot.x, spot.z, 20));
    assert.ok(terrainHeight(spot.x, spot.z) > FJORD.level + 0.4, 'above the water');
  }
  for (const spot of [...LOFOTEN.cabins, ...LOFOTEN.houses, LOFOTEN.church]) {
    assert.ok(
      PADS.some(pad => pad.x === spot.x && pad.z === spot.z),
      'its ground is levelled',
    );
  }
});

test('it is winter all over the coast, and the snow does not reach back into the valley', () => {
  for (const [lx, lz] of [
    [0, -30],
    [0, -140],
    [150, 40],
    [-150, -60],
  ]) {
    const [x, z] = LOFOTEN.at(lx, lz);
    assert.equal(winterness(x, z), 1, `${lx}, ${lz}`);
    assert.ok(lofotenness(x, z) > 0.9);
  }
  assert.equal(lofotenness(...LOFOTEN.at(0, -30)), 1);
  // Round the valley's fence it is as it was.
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    const [x, z] = [Math.cos(a) * (VALLEY_RADIUS - 40), Math.sin(a) * (VALLEY_RADIUS - 40)];
    if (a > 3.3 && a < 4.9) assert.equal(winterness(x, z), 0, `snow in the valley at ${x.toFixed(0)}, ${z.toFixed(0)}`);
  }
  assert.equal(lofotenness(0, 0), 0);
});
