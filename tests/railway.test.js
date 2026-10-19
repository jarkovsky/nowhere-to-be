import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RAILWAY, LEVEL_CROSSING } from '../src/world/layout.js';
import { railLevel } from '../src/world/terrain.js';
import { createTrain } from '../src/vehicles/train.js';

const FAR_AWAY = { x: 300, z: 300 };

/** Runs the train for `seconds`, calling `check` after every step. */
function run(train, seconds, player = FAR_AWAY, check = () => {}) {
  for (let t = 0; t < seconds; t += 0.1) {
    train.update(0.1, { player });
    check(train);
  }
}

test('the line climbs gently all the way to the tunnel', () => {
  for (let s = 0; s < RAILWAY.length - 1; s += 1) {
    const grade = Math.abs(railLevel(s + 1) - railLevel(s));
    assert.ok(grade < 0.06, `grade ${grade.toFixed(3)} at s=${s}`);
  }
});

test('the train runs up to the tunnel and back, and the crossing is closed whenever it is on it', () => {
  const train = createTrain(new THREE.Scene());
  const phases = new Set();
  run(train, 260, FAR_AWAY, t => {
    phases.add(t.getState().phase);
    if (t.distanceTo(LEVEL_CROSSING) < 5) assert.ok(t.crossingClosed(), 'the train is on an open crossing');
  });
  assert.deepEqual([...phases].sort(), ['away', 'halt', 'in', 'out']);
});

test('the train stops short of a car on the track and goes on once it moves', () => {
  const train = createTrain(new THREE.Scene());
  const parked = RAILWAY.at(LEVEL_CROSSING.s + 50);
  run(train, 90, parked, t => assert.ok(t.distanceTo(parked) > 2.5, 'the train ran into the car'));
  assert.equal(train.getState().phase, 'out');
  assert.equal(train.getState().speed, 0);
  run(train, 60);
  assert.notEqual(train.getState().phase, 'out');
});
