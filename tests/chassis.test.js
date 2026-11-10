import test from 'node:test';
import assert from 'node:assert/strict';
import { createChassis, restingPose, springLayout, stepChassis, unsettle } from '../src/core/chassis.js';
import { createCarState, stepDriving } from '../src/core/driving.js';
import { DEFAULT_HANDLING as HANDLING } from '../src/core/handling.js';
import { chassisPose } from '../src/core/suspension.js';
import { flatWorld } from './helpers.js';

const STEP = 1 / 60;
const LAYOUT = springLayout([-1.08, 1.08].flatMap(x => [-1.2, 1.24].map(z => ({ x, z, radius: 0.59 }))));
const flat = () => 0;

/** Drives the car and its springs together for `seconds`, calling `watch(state, chassis)` after each step. */
function ride(state, chassis, input, seconds, world, sample, watch) {
  for (let t = 0; t < seconds; t += STEP) {
    stepDriving(state, input, STEP, world);
    stepChassis(chassis, state, HANDLING, LAYOUT, STEP, sample);
    watch?.(state, chassis);
  }
}

test('standing on flat or sloping ground, the body rests where the old fit to the ground put it', () => {
  for (const sample of [flat, (x, z) => -0.3 * z, (x, z) => 0.2 * x + 0.1 * z]) {
    for (const heading of [0, 1, 2.5]) {
      const rest = { ...restingPose(3, 4, heading, sample, LAYOUT, HANDLING.clearance) };
      const old = chassisPose(3, 4, heading, sample);
      assert.ok(Math.abs(rest.height - old.height) < 0.02, `height ${rest.height} against ${old.height}`);
      assert.ok(Math.abs(rest.pitch - old.pitch) < 1e-6 && Math.abs(rest.roll - old.roll) < 1e-6);
    }
  }
});

test('put somewhere new, the body starts at rest there', () => {
  const chassis = createChassis();
  const state = createCarState({ x: 0, z: 0, heading: 0 });
  stepChassis(chassis, state, HANDLING, LAYOUT, STEP, flat);
  Object.assign(state, { x: 200, z: -50 });
  const sample = (x, z) => 0.1 * x;
  stepChassis(chassis, state, HANDLING, LAYOUT, STEP, sample);
  const rest = restingPose(200, -50, 0, sample, LAYOUT, HANDLING.clearance);
  assert.ok(Math.abs(chassis.height - rest.height) < 1e-9 && Math.abs(chassis.roll - rest.roll) < 1e-9);
  assert.deepEqual([chassis.rising, chassis.pitching, chassis.rolling], [0, 0, 0]);
  // And after being told to forget where it was, wherever it is.
  unsettle(chassis);
  stepChassis(chassis, state, HANDLING, LAYOUT, STEP, flat);
  assert.equal(chassis.height, restingPose(200, -50, 0, flat, LAYOUT, HANDLING.clearance).height);
});

test('pulling away the nose lifts, braking it dips, and once stopped the body rocks back and settles', () => {
  const state = createCarState({ x: 0, z: 0, heading: 0 });
  const chassis = createChassis();
  const world = flatWorld();
  let squat = 0;
  ride(state, chassis, { forward: true }, 1, world, flat, (_, c) => (squat = Math.max(squat, c.pitch)));
  ride(state, chassis, { forward: true }, 6, world, flat);
  let dive = 0;
  ride(state, chassis, { brake: true }, 3, world, flat, (s, c) => {
    if (s.speed > 0) dive = Math.min(dive, c.pitch);
  });
  assert.ok(squat > 0.01, `squatted ${squat.toFixed(3)} rad`);
  assert.ok(dive < -0.02, `dived ${dive.toFixed(3)} rad`);
  // Stopped: it swings back past level, then comes to rest.
  let back = 0;
  const hard = createCarState({ x: 0, z: 0, heading: 0 });
  const swing = createChassis();
  ride(hard, swing, { cruise: true }, 6, world, flat);
  ride(hard, swing, { brake: true }, 4, world, flat, (s, c) => {
    if (s.speed === 0) back = Math.max(back, c.pitch);
  });
  assert.ok(back > 0.002, `rocked back ${back.toFixed(4)} rad`);
  assert.ok(Math.abs(swing.pitch) < 0.002 && Math.abs(swing.pitching) < 0.01, 'and settled');
});

test('over a step in the ground the body rises after the wheels, swings past a little and settles', () => {
  const step = (x, z) => (z < -12 ? 0.15 : 0);
  const state = createCarState({ x: 0, z: 0, heading: 0 });
  const chassis = createChassis();
  const world = flatWorld();
  let lag = 0;
  let over = 0;
  let after = 0;
  ride(state, chassis, { cruise: true }, 8, world, step, (s, c) => {
    const rest = restingPose(s.x, s.z, s.heading, step, LAYOUT, HANDLING.clearance).height;
    lag = Math.min(lag, c.height - rest);
    if (s.z < -16) over = Math.max(over, c.height - rest);
    if (s.z < -40) after = Math.max(after, Math.abs(c.height - rest));
  });
  assert.ok(lag < -0.02, `the body lagged ${lag.toFixed(3)} m behind the wheels`);
  assert.ok(over > 0.003 && over < 0.08, `it swung ${over.toFixed(3)} m past`);
  assert.ok(after < 0.003, `still ${after.toFixed(4)} m out well after`);
});

test('in a bend the body leans out, and never further than the springs go', () => {
  const state = createCarState({ x: 0, z: 0, heading: 0 });
  const chassis = createChassis();
  let lean = 0;
  ride(state, chassis, { cruise: true }, 6, flatWorld(), flat);
  ride(state, chassis, { cruise: true, left: true }, 3, flatWorld(), flat, (_, c) => (lean = Math.min(lean, c.roll)));
  assert.ok(lean < -0.02, `leaned ${lean.toFixed(3)} rad`);
  assert.ok(lean > -0.1);
});

test('a rock under its middle lifts the body by its underside, and one between the wheels lower than that leaves it be', () => {
  const rock = height => (x, z) => {
    const d2 = (x * x + z * z) / 0.6 ** 2;
    return d2 < 1 ? height * (1 - d2) : 0;
  };
  const low = restingPose(0, 0, 0, rock(0.2), LAYOUT, HANDLING.clearance).height;
  const high = restingPose(0, 0, 0, rock(0.6), LAYOUT, HANDLING.clearance).height;
  const level = restingPose(0, 0, 0, flat, LAYOUT, HANDLING.clearance).height;
  assert.equal(low, level);
  assert.ok(Math.abs(high - level - (0.6 - HANDLING.clearance)) < 0.02, `lifted ${(high - level).toFixed(3)} m`);
});

test('a tyre starts up a rock before its middle is over it', () => {
  // A kerb 20 cm high starting 0.2 m ahead of the front tyres.
  const kerb = (x, z) => (z < -(LAYOUT.front + 0.2) ? 0.2 : 0);
  // restingPose writes into the same object each time.
  const rest = { ...restingPose(0, 0, 0, kerb, LAYOUT, HANDLING.clearance) };
  const level = { ...restingPose(0, 0, 0, flat, LAYOUT, HANDLING.clearance) };
  assert.ok(rest.pitch > 0.01, `pitched ${rest.pitch.toFixed(3)}`);
  assert.ok(rest.height > level.height);
});
