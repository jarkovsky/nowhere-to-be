import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE, JETTY, OXBOW, TRACKS } from '../src/world/layout.js';
import {
  OXBOW_LEVEL,
  drivingHeight,
  isDriveable,
  terrainHeight,
  wadingDepth,
  waterDepth,
} from '../src/world/terrain.js';
import { CAR, createCarState, stepDriving } from '../src/core/driving.js';
import { createObstacleIndex } from '../src/core/collision.js';
import { angleDelta } from '../src/core/math.js';
import { drive, flatWorld } from './helpers.js';

const track = TRACKS.find(t => t.id === 'oxbow').path;
const fordS = track.nearest(OXBOW.ford.x, OXBOW.ford.z).s;
/** Depth along the track, `d` metres on from the middle of the ford. */
const depthAcross = d => {
  const p = track.at(fordS + d);
  return waterDepth(p.x, p.z);
};

test('the oxbow comes up to the doors at the ford, and shallows off towards both banks', () => {
  const deepest = Math.max(...[-2, -1, 0, 1, 2].map(depthAcross));
  assert.ok(deepest > 0.6 && deepest < 0.85, `${deepest.toFixed(2)} m at the ford`);
  for (const side of [-1, 1]) {
    let previous = Infinity;
    for (let d = 3; d <= 12; d += 1.5) {
      const depth = depthAcross(side * d);
      assert.ok(depth <= previous + 0.03, `deeper again ${side * d} m from the middle`);
      previous = depth;
    }
    assert.equal(depthAcross(side * 12), 0, 'dry ground either side');
  }
});

test('the oxbow is never too deep for a car, and its water stays in its channel', () => {
  for (let s = 0; s <= OXBOW.path.length; s += 1) {
    const halfWidth = OXBOW.halfWidth(s);
    for (let side = -14; side <= 14; side += 0.5) {
      const p = OXBOW.path.offset(s, side);
      const depth = waterDepth(p.x, p.z);
      assert.ok(depth < 0.85, `${depth.toFixed(2)} m deep at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
      assert.ok(isDriveable(p.x, p.z));
      if (Math.abs(side) > Math.max(0, halfWidth) + 1.5) assert.equal(depth, 0, `water outside the oxbow at s=${s}`);
    }
  }
  assert.ok(OXBOW_LEVEL < terrainHeight(OXBOW.path.at(0).x, OXBOW.path.at(0).z), 'its ends are dry');
});

test('the ford slopes in and out gently, and the track across it is level from side to side', () => {
  for (let d = -16; d <= 16; d += 1) {
    const a = track.at(fordS + d);
    const b = track.at(fordS + d + 1);
    const grade = Math.abs(drivingHeight(b.x, b.z) - drivingHeight(a.x, a.z));
    assert.ok(grade < 0.25, `${(grade * 100).toFixed(0)}% ${d} m from the middle`);
    const tilt = Math.abs(terrainHeight(a.x + a.dz, a.z - a.dx) - terrainHeight(a.x - a.dz, a.z + a.dx)) / 2;
    assert.ok(tilt < 0.1, `leans ${(tilt * 100).toFixed(0)}% ${d} m from the middle`);
  }
});

test('deep water slows the car to a crawl, but it keeps going while the pedal is held', () => {
  const deep = flatWorld({ surface: 'water' });
  deep.waterDepth = () => 0.8;
  const shallow = flatWorld({ surface: 'water' });
  shallow.waterDepth = () => 0.2;
  const crawling = drive(createCarState({ x: 0, z: 0, heading: 0 }), { forward: true }, 4, deep);
  const wading = drive(createCarState({ x: 0, z: 0, heading: 0 }), { forward: true }, 4, shallow);
  assert.ok(crawling.speed > 1.5 && crawling.speed < wading.speed * 0.6, `${crawling.speed.toFixed(2)} m/s`);
  // Even climbing out up a steep bank.
  const climbing = flatWorld({ surface: 'water', slope: 0.2 });
  climbing.waterDepth = () => 0.6;
  const out = drive(createCarState({ x: 0, z: 0, heading: 0 }), { cruise: true }, 4, climbing);
  assert.ok(out.speed > 1, `${out.speed.toFixed(2)} m/s up the bank`);
  // Driving in fast, it slows hard rather than sailing through.
  const fast = drive(createCarState({ x: 0, z: 0, heading: 0 }), { forward: true }, 3);
  drive(fast, { forward: true }, 1, deep);
  assert.ok(fast.speed < CAR.topSpeed * 0.4, `${fast.speed.toFixed(2)} m/s a second in`);
});

test('a car on cruise control crawls through the ford and out the other side without ever stopping', () => {
  const world = {
    obstacles: createObstacleIndex([]),
    dynamic: [],
    surface: (x, z) => (waterDepth(x, z) > 0.15 ? 'water' : 'track'),
    slope: (x, z, heading) => {
      const [dx, dz] = [-Math.sin(heading) * 1.5, -Math.cos(heading) * 1.5];
      return (drivingHeight(x + dx, z + dz) - drivingHeight(x - dx, z - dz)) / 3;
    },
    isDriveable,
    waterDepth,
  };
  const start = track.at(fordS - 20);
  const car = createCarState({ x: start.x, z: start.z, heading: Math.atan2(-start.dx, -start.dz) });
  let slowest = Infinity;
  let time = 0;
  while (track.nearest(car.x, car.z).s < fordS + 16 && time < 20) {
    // Steer for a point a little way along the track.
    const goal = track.at(track.nearest(car.x, car.z).s + 6);
    const steer = angleDelta(car.heading, Math.atan2(car.x - goal.x, car.z - goal.z)) * 2.5;
    stepDriving(car, { cruise: true, steer: Math.max(-1, Math.min(1, steer)) }, 1 / 60, world);
    if (waterDepth(car.x, car.z) > 0.1) slowest = Math.min(slowest, car.speed);
    time += 1 / 60;
  }
  assert.ok(time < 20, 'it got across');
  assert.ok(slowest > 1.5 && slowest < 4, `slowest in the water ${slowest.toFixed(2)} m/s`);
});

test('on the planks of the bridge and the jetty the car is not wading, though there is water underneath', () => {
  const out = { x: JETTY.x - Math.sin(JETTY.heading) * 15, z: JETTY.z - Math.cos(JETTY.heading) * 15 };
  assert.ok(waterDepth(out.x, out.z) > 1 && wadingDepth(out.x, out.z) === 0);
  assert.ok(waterDepth(BRIDGE.x, BRIDGE.z) > 0 && wadingDepth(BRIDGE.x, BRIDGE.z) === 0);
  assert.equal(wadingDepth(OXBOW.ford.x, OXBOW.ford.z), waterDepth(OXBOW.ford.x, OXBOW.ford.z));
});
