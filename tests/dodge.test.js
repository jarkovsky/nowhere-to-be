import test from 'node:test';
import assert from 'node:assert/strict';
import { createDodge, stepDodge } from '../src/world/dodge.js';

/**
 * Drives a car north (towards -z) at `speed` from (0, start) for `seconds`, past an animal
 * whose routine keeps it at (x, 0). Returns where the animal was, and how far the car was
 * from it, every step.
 */
function driveAt(x, { speed = 7, start = 30, seconds = 8 } = {}) {
  const dodge = createDodge();
  const steps = [];
  for (let t = 0; t < seconds; t += 0.05) {
    const car = { x: 0, z: start - speed * t, vx: 0, vz: -speed };
    const at = stepDodge(dodge, x, 0, car, 0.05);
    steps.push({ ...at, gap: Math.hypot(at.x - car.x, at.z - car.z), carZ: car.z });
  }
  return steps;
}

test('an animal in the way lets the car come close, then runs clear at the last moment', () => {
  const steps = driveAt(0.5);
  const run = steps.findIndex(step => step.moving === 'run');
  assert.ok(run > 0, 'it runs');
  // Not before the car is about a second away, and not so late the car hits it.
  assert.ok(steps[run].gap < 10 && steps[run].gap > 6, `ran with the car ${steps[run].gap.toFixed(1)} m away`);
  for (const step of steps.filter(step => Math.abs(step.carZ - step.z) < 2.5)) {
    assert.ok(Math.abs(step.x) > 2.2, 'clear of the car as it passes');
  }
  // It runs to the side it was already on.
  assert.ok(steps.find(step => Math.abs(step.carZ) < 0.1).x > 0);
});

test("an animal beside the car's path stays where it is", () => {
  assert.ok(driveAt(5).every(step => step.moving === null && step.x === 5));
});

test('once the car has gone, the animal walks back', () => {
  const steps = driveAt(-0.5, { seconds: 20 });
  assert.ok(steps.some(step => step.moving === 'walk'));
  assert.ok(Math.abs(steps.at(-1).x + 0.5) < 1e-6 && Math.abs(steps.at(-1).z) < 1e-6);
});

test('a car creeping up on an animal makes it trot away', () => {
  const steps = driveAt(0.3, { speed: 1, start: 6, seconds: 6 });
  assert.ok(steps.every(step => step.gap > 1.5));
});
