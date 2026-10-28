import test from 'node:test';
import assert from 'node:assert/strict';
import { cutTrample, growsTall, trampledAt, updateTrample } from '../src/world/trample.js';

/** A car like the off-roader, heading north (-Z) from (x, z) at `speed`. */
const car = (x, z, speed = 7) => ({
  x,
  z,
  y: 0,
  heading: 0,
  speed,
  wheels: [-1.08, 1.08].flatMap(wx => [-1.2, 1.24].map(wz => ({ x: wx, z: wz, radius: 0.59 }))),
});

/** Drives a car north along x = `x` from `z0` to `z1`, a frame at a time, then leaves it standing there. */
function drive(x, z0, z1) {
  for (let z = z0; z > z1; z -= 7 / 60) updateTrample(1 / 60, [car(x, z)]);
  updateTrample(1 / 60, [car(x, z1, 0)]);
}

/** Lets `seconds` go by with the car standing at (x, z). */
function wait(seconds, x, z) {
  for (let t = 0; t < seconds; t += 1 / 20) updateTrample(1 / 20, [car(x, z, 0)]);
}

growsTall(0, -10, 30);

test('the stalks lie flat where the wheels went, lean a little under the car, and not at all away from it', () => {
  drive(0, 0, -30);
  for (const z of [-8, -14, -20]) {
    assert.ok(trampledAt(1.08, z) > 0.95, `under the right wheels at ${z}`);
    assert.ok(trampledAt(-1.08, z) > 0.95, `under the left wheels at ${z}`);
    // Two tracks, not a mown strip the width of the car.
    for (const x of [0, 0.5, -0.5]) {
      const between = trampledAt(x, z);
      assert.ok(between > 0.1 && between < 0.3, `between the wheels at ${x}, ${z}: ${between}`);
    }
    assert.equal(trampledAt(3.5, z), 0, `beside the car at ${z}`);
  }
});

test('they stand up again over a couple of minutes, and at once where the crop is cut', () => {
  const flat = trampledAt(1.08, -14);
  wait(45, 0, -30);
  const rising = trampledAt(1.08, -14);
  assert.ok(rising < flat - 0.2 && rising > 0.3, `after 45 s: ${rising}`);
  cutTrample(0, -20, 0, -1, 1, 1, 3);
  assert.equal(trampledAt(1.08, -20), 0, 'cut');
  assert.ok(trampledAt(1.08, -14) > 0, 'not cut');
  wait(120, 0, -30);
  assert.equal(trampledAt(1.08, -14), 0, 'after three minutes');
});

test('a friend following the car lays the stalks over too', () => {
  for (let z = 0; z > -30; z -= 7 / 60) updateTrample(1 / 60, [car(0, z - 10), car(-6, z)]);
  assert.ok(trampledAt(-6 + 1.08, -14) > 0.95);
});

test('nothing is laid over where nothing grows tall enough', () => {
  drive(300, 0, -30);
  assert.equal(trampledAt(301.08, -14), 0);
});

test('what the car leaves far behind it is forgotten', () => {
  drive(0, 0, -30);
  assert.ok(trampledAt(1.08, -14) > 0.9);
  // Off a long way, and back to where it was laid over.
  updateTrample(1 / 60, [car(0, -400, 0)]);
  assert.equal(trampledAt(1.08, -14), 0, 'out of the window');
  updateTrample(1 / 60, [car(0, -30, 0)]);
  assert.equal(trampledAt(1.08, -14), 0, 'cleared when the window came back');
});
