import test from 'node:test';
import assert from 'node:assert/strict';
import './dom.js';
import { createObstacleIndex } from '../src/core/collision.js';
import { createCarState, stepDriving } from '../src/core/driving.js';
import {
  HULL,
  allAboard,
  createFerry,
  deckHeight,
  isCarrying,
  quayEnd,
  stepFerry,
  toLocal,
  walls,
} from '../src/core/ferry.js';
import { createPath } from '../src/world/path.js';
import { FERRY_QUAY, FJORD } from '../src/world/layout.js';
import {
  addFloatingDeck,
  drivingHeight,
  isDriveable,
  quayHeight,
  terrainHeight,
  waterDepth,
} from '../src/world/terrain.js';

const STEP = 1 / 60;
const { dock } = FERRY_QUAY;
const out = { x: -Math.sin(dock.heading), z: -Math.cos(dock.heading) };
const along = (d, side = 0) => [dock.x + out.x * d + out.z * side, dock.z + out.z * d - out.x * side];

/** Straight out from the dock and back, for the logic on its own; the real routes are in world/ferry.js. */
function routes() {
  const spin = createPath([along(0), along(20), along(40, 8), along(50), along(40, -8), along(20), along(0)]);
  const voyage = createPath([along(0), along(60), along(200)]);
  return { spin, voyage };
}

function newFerry() {
  return createFerry({ dock, quay: FERRY_QUAY, level: FJORD.level, ...routes() });
}

/** The corners of a car 4.4 m long and 2 m wide. */
function cornersOf(car) {
  const sin = Math.sin(car.heading);
  const cos = Math.cos(car.heading);
  return [2.2, -2.2].flatMap(a => [-1, 1].map(s => ({ x: car.x - sin * a + cos * s, z: car.z - cos * a - sin * s })));
}

/** Runs the ferry on, with the car driven where it isn't carried, until `done()`. Returns how long that took. */
function run(ferry, { car = null, input = {}, world = null, others = [], seconds = 300, done = () => false, watch }) {
  for (let t = 0; t < seconds; t += STEP) {
    if (done()) return t;
    stepFerry(ferry, STEP, { car, corners: car ? cornersOf(car) : [], others });
    if (car && world && !isCarrying(ferry)) stepDriving(car, input, STEP, world);
    watch?.(t);
  }
  return Infinity;
}

const docked = ferry => () => ferry.phase === 'docked';

/** Where the car is in the quay's own frame: across, and out over the water. */
function onQuayFrame({ x, z }) {
  const cos = Math.cos(FERRY_QUAY.rotation);
  const sin = Math.sin(FERRY_QUAY.rotation);
  const dx = x - FERRY_QUAY.x;
  const dz = z - FERRY_QUAY.z;
  return { across: dx * cos - dz * sin, out: dx * sin + dz * cos };
}

test('the ferry comes in from the far end, lowers the ramp at the quay and says it has arrived', () => {
  const ferry = newFerry();
  const events = [];
  const took = run(ferry, { done: docked(ferry), watch: () => events.push(...ferry.events) });
  assert.ok(took < 120, `docked after ${took.toFixed(0)} s`);
  assert.ok(events.includes('loading') && events.includes('arrived'));
  assert.equal(ferry.ramps[quayEnd(ferry) < 0 ? 0 : 1], 0, 'its ramp is down at the quay');
  assert.equal(ferry.ramps[quayEnd(ferry) < 0 ? 1 : 0], 1, 'and up at the other end');
  assert.ok(Math.hypot(ferry.x - dock.x, ferry.z - dock.z) < 0.01);
});

test('where its ramp rests on the quay, the deck meets the quay, and the deck is only there while the ramp is down', () => {
  const ferry = newFerry();
  run(ferry, { done: docked(ferry) });
  const end = quayEnd(ferry);
  const tip = along(-(HULL.halfLength + 2.4));
  const onRamp = deckHeight(ferry, ...tip);
  assert.ok(Math.abs(onRamp - quayHeight(...tip)) < 0.05, `${onRamp} against ${quayHeight(...tip)}`);
  assert.ok(deckHeight(ferry, ...along(0)) > FJORD.level + 0.8);
  // The other end's ramp is up: nothing to drive on past that end.
  assert.equal(deckHeight(ferry, ...along(HULL.halfLength + 1)), null);
  assert.equal(end, 1);
});

test('a car driven down the quay and aboard is taken round and brought back facing the land, and drives off', () => {
  const ferry = newFerry();
  const remove = addFloatingDeck({ height: (x, z) => deckHeight(ferry, x, z) });
  try {
    run(ferry, { done: docked(ferry) });
    // From the end of the road, facing out over the water, on cruise.
    const [x, z] = along(-(FERRY_QUAY.berth + 1));
    const car = createCarState({ x, z, heading: dock.heading });
    const world = {
      obstacles: createObstacleIndex([]),
      dynamic: [],
      surface: () => 'road',
      slope: (x, z, heading) => {
        const dx = -Math.sin(heading) * 1.5;
        const dz = -Math.cos(heading) * 1.5;
        return (drivingHeight(x + dx, z + dz) - drivingHeight(x - dx, z - dz)) / 3;
      },
      isDriveable,
      waterDepth: () => 0,
    };
    Object.defineProperty(world, 'dynamic', { get: () => walls(ferry) });
    const cruise = { cruise: true };
    const boarded = run(ferry, { car, input: cruise, world, done: () => isCarrying(ferry), seconds: 40 });
    assert.ok(boarded < 25, 'it drives aboard and the ferry takes it');
    assert.ok(allAboard(ferry, cornersOf(car)), 'all of it on the deck');
    const local = toLocal(ferry, car.x, car.z);
    let drift = 0;
    let farthest = 0;
    const sailed = run(ferry, {
      car,
      input: cruise,
      world,
      done: () => !isCarrying(ferry),
      seconds: 80,
      watch: () => {
        const now = toLocal(ferry, car.x, car.z);
        drift = Math.max(drift, Math.hypot(now.x - local.x, now.z - local.z));
        farthest = Math.max(farthest, Math.hypot(ferry.x - dock.x, ferry.z - dock.z));
      },
    });
    assert.ok(sailed > 30 && sailed < 45, `back and the ramp down after ${sailed.toFixed(1)} s`);
    assert.ok(drift < 0.01, 'it stayed where it was parked on the deck');
    assert.ok(farthest > 30, 'it went out');
    assert.equal(quayEnd(ferry), -1, 'the other end is at the quay now');
    const facing = Math.cos(car.heading - (dock.heading + Math.PI));
    assert.ok(facing > 0.99, 'the car faces the land');
    // Still on cruise, it drives off and up onto the shore.
    run(ferry, { car, input: cruise, world, done: () => onQuayFrame(car).out < 0, seconds: 20 });
    assert.ok(onQuayFrame(car).out < 0, 'ashore');
    assert.ok(waterDepth(car.x, car.z) < 0.3);
  } finally {
    remove();
  }
});

test('it waits while a car is on the quay or a friend is half aboard, and sets off along the fjord once nobody is near', () => {
  const ferry = newFerry();
  run(ferry, { done: docked(ferry) });
  // Parked on the quay's ramp, by the ferry: it waits.
  const [x, z] = along(-(HULL.halfLength + 5));
  const car = createCarState({ x, z, heading: dock.heading });
  run(ferry, { car, seconds: 120 });
  assert.equal(ferry.phase, 'docked');
  // A friend half on the ferry keeps it from leaving with the car parked aboard.
  const aboard = createCarState({ x: along(-6)[0], z: along(-6)[1], heading: dock.heading });
  const half = [
    { x: along(-HULL.halfLength + 1)[0], z: along(-HULL.halfLength + 1)[1] },
    { x, z },
  ];
  run(ferry, { car: aboard, others: [{ points: half, margin: 1 }], seconds: 10 });
  assert.equal(ferry.phase, 'docked');
  assert.ok(!isCarrying(ferry));
  // Gone off, far from the quay, it leaves.
  const far = createCarState({ x: dock.x + 200, z: dock.z, heading: 0 });
  const left = run(ferry, { car: far, done: () => ferry.phase === 'away', seconds: 200 });
  assert.ok(left < 200);
});

test('a car taken somewhere else while aboard is let go', () => {
  const ferry = newFerry();
  run(ferry, { done: docked(ferry) });
  const car = createCarState({ x: along(-5)[0], z: along(-5)[1], heading: dock.heading });
  run(ferry, { car, done: () => ferry.phase === 'sailing', seconds: 20 });
  assert.ok(isCarrying(ferry));
  car.x += 300;
  run(ferry, { car, seconds: 0.1 });
  assert.ok(!isCarrying(ferry));
});

test('on its short trip and its long one the ferry stays out on deep water, clear of the shore', async () => {
  const { createFerry: buildFerry } = await import('../src/world/ferry.js');
  const THREE = await import('three');
  const ferry = buildFerry(new THREE.Scene(), { onHorn: () => {} });
  const at = { x: 0, z: 0 };
  ferry.dock();
  const check = label => {
    const { x, z, heading } = ferry.getState();
    if (Math.hypot(x - dock.x, z - dock.z) < 1) return;
    for (const lx of [-HULL.halfBeam, HULL.halfBeam]) {
      for (const lz of [-HULL.halfLength, HULL.halfLength]) {
        at.x = x + lx * Math.cos(heading) + lz * Math.sin(heading);
        at.z = z - lx * Math.sin(heading) + lz * Math.cos(heading);
        const depth = FJORD.level - terrainHeight(at.x, at.z);
        assert.ok(depth > 1, `${label}: a corner ${depth.toFixed(1)} m deep at ${at.x.toFixed(0)}, ${at.z.toFixed(0)}`);
      }
    }
  };
  // Parked aboard, the car is taken on the short trip.
  const car = createCarState({ x: along(-4)[0], z: along(-4)[1], heading: dock.heading });
  const corners = cornersOf(car);
  let sailed = false;
  for (let t = 0; t < 60; t += STEP) {
    ferry.update(STEP, { player: car, corners: cornersOf(car), listener: car });
    if (ferry.getState().phase === 'sailing') {
      sailed = true;
      check('short trip');
    }
  }
  assert.ok(sailed && corners.length);
  // With nobody near, it goes off along the fjord.
  const far = { ...car, x: car.x + 300 };
  for (let t = 0; t < 200; t += STEP) {
    ferry.update(STEP, { player: far, corners: cornersOf(far), listener: far });
    if (ferry.getState().phase === 'sailing' && ferry.getState().shown) check('along the fjord');
  }
});
