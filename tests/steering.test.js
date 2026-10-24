import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarState, steerAngle, stepDriving } from '../src/core/driving.js';
import { createSteering, steer } from '../src/core/steering.js';
import { flatWorld } from './helpers.js';

const STEP = 1 / 60;

/** Goes round a bend of `radius` metres (positive to the left) at `speed` for `seconds`, steering as it goes. */
function round(steering, radius, speed, seconds, heading = 0) {
  let angle = 0;
  for (let t = 0; t < seconds; t += STEP) {
    heading += (speed / radius) * STEP;
    angle = steer(steering, heading, speed, STEP);
  }
  return { angle, heading };
}

test('the front wheels turn as far as a bicycle would need for the bend, the way it bends', () => {
  const left = round(createSteering(3), 20, 8, 2).angle;
  assert.ok(Math.abs(left - Math.atan(3 / 20)) < 0.005, `left ${left}`);
  const right = round(createSteering(3), -20, 8, 2).angle;
  assert.ok(Math.abs(right + Math.atan(3 / 20)) < 0.005, `right ${right}`);
  // A longer vehicle turns its wheels further for the same bend.
  assert.ok(round(createSteering(6), 20, 8, 2).angle > left + 0.1);
});

test('the wheels ease into a bend rather than snap', () => {
  const steering = createSteering(3);
  const { angle } = round(steering, 20, 8, 0.05);
  assert.ok(angle > 0 && angle < Math.atan(3 / 20) * 0.6, `after a moment ${angle}`);
});

test('a tight turn stops at full lock', () => {
  assert.ok(Math.abs(round(createSteering(2.4), 1.8, 1.7, 2).angle - 0.58) < 1e-3);
  assert.ok(Math.abs(round(createSteering(3.9, 0.7), 3, 1.4, 2).angle - 0.7) < 1e-3);
});

test('reversing round a bend turns the wheels the way that makes the bend', () => {
  // Backing up with the wheels to the left swings the nose right: the heading goes down.
  const steering = createSteering(3);
  let heading = 0;
  for (let t = 0; t < 2; t += STEP) {
    heading -= (3 / 20) * STEP;
    steer(steering, heading, -3, STEP);
  }
  assert.ok(Math.abs(steering.angle - Math.atan(3 / 20)) < 0.005, `${steering.angle}`);
});

test('a vehicle steered by its back wheels turns them the other way', () => {
  const angle = round(createSteering(-3.9), 20, 2, 3).angle;
  assert.ok(Math.abs(angle + Math.atan(3.9 / 20)) < 0.005, `${angle}`);
});

test('stopped, the wheels stay as they were; going straight again, they straighten', () => {
  const steering = createSteering(3);
  const { angle, heading } = round(steering, 20, 8, 2);
  for (let t = 0; t < 1; t += STEP) steer(steering, heading, 0, STEP);
  assert.equal(steering.angle, angle);
  for (let t = 0; t < 1; t += STEP) steer(steering, heading, 8, STEP);
  assert.ok(Math.abs(steering.angle) < 0.001);
});

test('being put somewhere else, or coming back into sight, does not flick the wheels', () => {
  const steering = createSteering(3);
  steer(steering, 0, 8, STEP);
  steer(steering, 2, 8, STEP);
  assert.equal(steering.angle, 0);
  steering.heading = null;
  steer(steering, 2.3, 8, STEP);
  assert.equal(steering.angle, 0);
});

test('it agrees with how the player car turns its wheels', () => {
  const state = createCarState({ x: 0, z: 0, heading: 0 });
  const steering = createSteering(2.44);
  const world = flatWorld();
  for (let t = 0; t < 4; t += STEP) {
    stepDriving(state, { cruise: true, steer: 0.5 }, STEP, world);
    steer(steering, state.heading, state.speed, STEP);
  }
  const player = steerAngle(state.steering, state.speed);
  assert.ok(Math.abs(steering.angle - player) < 0.04, `copy ${steering.angle}, player ${player}`);
});
