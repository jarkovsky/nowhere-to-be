import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarState, stepDriving } from '../src/core/driving.js';
import { segmentDistance } from '../src/core/math.js';
import { ROPE, WAIT, createTow, isTowed, planRoute, stepTow } from '../src/core/tow.js';
import { flatWorld } from './helpers.js';

const HOLE = { x: 0, z: 0, radius: 5.5, bog: 3.4 };
const HOME = { x: -14, z: -10, heading: -Math.PI / 2 }; // parked facing east
const CAR = { front: 2.2, rear: 2.1, back: 2.1, trailer: null };
const CRUISE = { cruise: true };
const world = flatWorld({ surface: 'mud' });

/** A car heading towards the hole from `distance` metres away along `bearing` (radians, 0 is from the south). */
function approach(bearing, distance = 20) {
  const x = Math.sin(bearing) * distance;
  const z = Math.cos(bearing) * distance;
  return createCarState({ x, z, heading: Math.atan2(x, z) });
}

/** Drives the car and the tow on together for `seconds`, calling `watch` after every step. */
function run(tow, car, input, seconds, body = CAR, watch = () => {}) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    if (!isTowed(tow)) stepDriving(car, input, 1 / 60, world);
    stepTow(tow, car, input, 1 / 60, body);
    watch(t);
  }
}

/** Runs until `done()`, for at most `seconds`. Returns how long it took. */
function runUntil(tow, car, input, done, seconds = 60, body = CAR, watch = () => {}) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    if (done()) return t;
    run(tow, car, input, 1 / 60, body, watch);
  }
  return Infinity;
}

const fromHole = car => Math.hypot(car.x - HOLE.x, car.z - HOLE.z);

test('a car that drives into the hole slows to a stop near its middle, sunk in, with its wheels spinning', () => {
  const tow = createTow({ hole: HOLE, home: HOME });
  const car = approach(0);
  const took = runUntil(tow, car, CRUISE, () => tow.phase === 'stuck', 10);
  assert.ok(took < 6, 'it stops');
  assert.ok(fromHole(car) < 2, `stopped ${fromHole(car).toFixed(1)} m from the middle`);
  run(tow, car, CRUISE, 0.5);
  assert.ok(tow.sink > 0.15, 'it has sunk in');
  assert.ok(tow.slip > 4, 'the wheels spin');
  assert.equal(car.speed, 0);
});

test('stuck, it goes nowhere forwards, but can creep back out the way it came', () => {
  const tow = createTow({ hole: HOLE, home: HOME });
  const car = approach(0);
  runUntil(tow, car, CRUISE, () => tow.phase === 'stuck');
  const { x, z } = car;
  run(tow, car, { forward: true }, 1.5);
  assert.ok(Math.hypot(car.x - x, car.z - z) < 0.01, 'held fast');
  let fastest = 0;
  runUntil(
    tow,
    car,
    { backward: true },
    () => tow.phase === 'free',
    10,
    CAR,
    () => {
      fastest = Math.max(fastest, Math.abs(car.speed));
    },
  );
  assert.equal(tow.phase, 'free');
  assert.ok(car.z > z, 'back the way it came');
  assert.ok(fastest < 1.5, `crept out at ${fastest.toFixed(2)} m/s`);
});

test('after a few seconds the tractor comes round in front, pulls the car out onto firm ground and goes home', () => {
  const tow = createTow({ hole: HOLE, home: HOME });
  const car = approach(0);
  runUntil(tow, car, CRUISE, () => tow.phase === 'stuck');
  const waited = runUntil(tow, car, CRUISE, () => tow.tractor.mode === 'out', 10);
  assert.ok(Math.abs(waited - WAIT) < 0.1, `set off after ${waited.toFixed(1)} s`);
  assert.deepEqual(tow.events, ['toot']);

  runUntil(tow, car, CRUISE, () => isTowed(tow), 30);
  assert.ok(isTowed(tow), 'the rope goes on');
  // In front of the car, facing on the way it was going, with the rope's length between them.
  assert.ok(tow.tractor.z < car.z - 6, 'in front');
  assert.ok(Math.abs(Math.sin(tow.tractor.heading - car.heading)) < 0.05, 'facing the same way');
  const gap = Math.hypot(tow.rope.hitch.x - tow.rope.end.x, tow.rope.hitch.z - tow.rope.end.z);
  assert.ok(gap < ROPE && gap > ROPE * 0.6, `rope ${gap.toFixed(1)} m between them`);

  // The controls do nothing while it is on the rope.
  const toots = [];
  runUntil(
    tow,
    car,
    { backward: true, left: true },
    () => tow.phase === 'free',
    20,
    CAR,
    () => toots.push(...tow.events),
  );
  assert.equal(tow.phase, 'free', 'let go');
  assert.ok(fromHole(car) > HOLE.radius + 1, 'on firm ground');
  assert.ok(car.z < 0, 'pulled on through, the way it was going');
  assert.ok(Math.abs(car.heading) < 0.05, 'still facing the same way');
  assert.equal(tow.rope.attached, false, 'the rope drops');
  run(tow, car, {}, 1, CAR, () => toots.push(...tow.events));
  assert.deepEqual(toots, ['toot']);

  runUntil(tow, car, {}, () => tow.tractor.mode === 'home', 60);
  assert.equal(tow.tractor.mode, 'home');
  assert.ok(Math.hypot(tow.tractor.x - HOME.x, tow.tractor.z - HOME.z) < 0.01, 'parked where it was');
  assert.ok(Math.abs(Math.sin(tow.tractor.heading - HOME.heading)) < 1e-6);
  assert.equal(tow.rope.shown, false);
});

test('once let go the car drives away, and the hole only holds it again once the tractor is home', () => {
  const tow = createTow({ hole: HOLE, home: HOME });
  const car = approach(0);
  runUntil(tow, car, CRUISE, () => tow.tractor.mode === 'unhitch', 60);
  const { z } = car;
  // It waits for the tractor to drive out of its way first.
  const waited = runUntil(tow, car, CRUISE, () => tow.phase === 'free', 10);
  assert.ok(waited < 4, `waited ${waited.toFixed(1)} s`);
  assert.ok(Math.abs(car.z - z) < 1e-9);
  run(tow, car, { forward: true }, 1);
  assert.ok(car.z < z - 1, 'drives away');

  // Straight back in, it drives through.
  let held = false;
  runUntil(
    tow,
    car,
    { backward: true },
    () => car.z > HOLE.radius + 3,
    20,
    CAR,
    () => {
      held ||= tow.phase !== 'free';
    },
  );
  assert.ok(car.z > HOLE.radius + 3 && !held, 'through the hole and out');

  runUntil(tow, car, {}, () => tow.tractor.mode === 'home', 60);
  runUntil(tow, car, { forward: true }, () => tow.phase !== 'free', 10);
  assert.equal(tow.phase, 'bogging', 'it holds the car again');
});

test('if the car gets out by itself before the tractor arrives, the tractor turns back', () => {
  const tow = createTow({ hole: HOLE, home: HOME });
  const car = approach(0);
  runUntil(tow, car, CRUISE, () => tow.tractor.mode === 'out');
  run(tow, car, CRUISE, 1);
  runUntil(tow, car, { backward: true }, () => tow.phase === 'free', 10);
  assert.equal(tow.phase, 'free');
  run(tow, car, {}, 0.1);
  assert.equal(tow.tractor.mode, 'back');
  runUntil(tow, car, {}, () => tow.tractor.mode === 'home', 60);
  assert.equal(tow.tractor.mode, 'home');
});

test('it is pulled out backwards if it reversed in', () => {
  const tow = createTow({ hole: HOLE, home: HOME });
  const car = createCarState({ x: 0, z: -18, heading: 0 });
  runUntil(tow, car, { backward: true }, () => tow.phase === 'stuck', 20);
  assert.equal(tow.dir, -1);
  runUntil(tow, car, {}, () => tow.tractor.mode === 'unhitch', 60);
  assert.ok(car.z > HOLE.radius + 1, 'out the far side, behind it');
  assert.ok(Math.abs(car.heading) < 0.05, 'still facing the same way');
});

/** How far a point is from the car's outline, its trailer included. */
function apart(x, z, car, body) {
  const fx = -Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  const lines = [[car.x + fx * body.front, car.z + fz * body.front, car.x - fx * body.rear, car.z - fz * body.rear]];
  if (body.trailer) {
    const { x: tx, z: tz, heading, length } = body.trailer;
    lines.push([tx, tz, tx + Math.sin(heading) * length, tz + Math.cos(heading) * length]);
  }
  return Math.min(...lines.map(([ax, az, bx, bz]) => segmentDistance(x, z, ax, az, bx, bz).distance));
}

test('from whichever way the car comes in, the tractor keeps clear of it and its trailer on the way', () => {
  for (const trailer of [false, true]) {
    for (let k = 0; k < 8; k++) {
      const bearing = (k / 8) * Math.PI * 2;
      const tow = createTow({ hole: HOLE, home: HOME });
      const car = approach(bearing);
      runUntil(tow, car, CRUISE, () => tow.phase === 'stuck', 20);
      // A lorry's trailer, straight out behind it.
      const body = trailer
        ? {
            front: 2.5,
            rear: 2.4,
            back: 10.7,
            trailer: {
              x: car.x + Math.sin(car.heading) * 1.9,
              z: car.z + Math.cos(car.heading) * 1.9,
              heading: car.heading,
              length: 8.8,
            },
          }
        : CAR;
      let closest = Infinity;
      runUntil(
        tow,
        car,
        CRUISE,
        () => isTowed(tow),
        40,
        body,
        () => {
          if (tow.tractor.mode === 'out') closest = Math.min(closest, apart(tow.tractor.x, tow.tractor.z, car, body));
        },
      );
      const name = `from ${Math.round((bearing * 180) / Math.PI)} degrees${trailer ? ' with a trailer' : ''}`;
      assert.ok(isTowed(tow), `${name}: the rope goes on`);
      assert.ok(closest > 2.8, `${name}: came within ${closest.toFixed(1)} m`);
      runUntil(tow, car, {}, () => tow.phase === 'free', 20, body);
      assert.ok(fromHole(car) > HOLE.radius + 1, `${name}: out of the mud`);
    }
  }
});

test('a route ends where it was going, facing the way it should', () => {
  const route = planRoute({ x: 0, z: 0, dx: 1, dz: 0 }, { x: 3, z: 12, dx: -1, dz: 0 }, () => true);
  const end = route.at(route.length);
  assert.ok(Math.hypot(end.x - 3, end.z - 12) < 1e-6);
  assert.ok(Math.abs(end.dx + 1) < 1e-6 && Math.abs(end.dz) < 1e-6);
  // It turns no tighter than the tractor can.
  for (let s = 0.5; s < route.length; s += 0.5) {
    const a = route.at(s - 0.5);
    const b = route.at(s);
    const turn = Math.abs(Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz));
    assert.ok(turn <= 0.5 / 4.5 + 1e-6);
  }
});

test('a route keeps to clear ground where it can', () => {
  // A wall straight across the way, with a gap at one end.
  const clear = (x, z) => !(Math.abs(z - 10) < 1 && x < 8);
  const route = planRoute({ x: 0, z: 0, dx: 0, dz: 1 }, { x: 0, z: 20, dx: 0, dz: 1 }, clear, [
    { x: 11, z: 10, dx: 0, dz: 1 },
  ]);
  for (let s = 0; s <= route.length; s += 0.25) {
    const p = route.at(s);
    assert.ok(clear(p.x, p.z), `crosses the wall at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
  }
});
