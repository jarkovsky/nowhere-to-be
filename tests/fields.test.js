import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FIELDS } from '../src/world/layout.js';
import { buildFields } from '../src/world/landmarks/fields.js';

const run = (fields, seconds, player) => {
  for (let t = 0; t < seconds; t += 1 / 30) fields.update(1 / 30, player);
};

test('the tractors work their fields and stop for the car', () => {
  const fields = buildFields(new THREE.Scene(), []);
  const far = { x: 0, z: 0 };
  run(fields, 0.1, far);
  const before = fields.getState().map(w => w.worked);
  run(fields, 10, far);
  const after = fields.getState().map(w => w.worked);
  after.forEach((worked, i) => assert.ok(worked > before[i] + 10, `tractor ${i} worked ${worked - before[i]} m`));

  // Park in front of each tractor: it waits.
  const [plough] = fields.colliders;
  const ahead = { x: 2 * plough.x - fields.colliders[1].x, z: 2 * plough.z - fields.colliders[1].z };
  const waiting = fields.getState()[0].worked;
  run(fields, 3, ahead);
  assert.ok(fields.getState()[0].worked - waiting < 0.5, 'the plough waits for the car');
});

test('a finished field grows back only while nobody is near', () => {
  const fields = buildFields(new THREE.Scene(), []);
  const near = { x: FIELDS.x, z: FIELDS.z - 150 };
  run(fields, 1500, near);
  assert.ok(
    fields.getState().every(w => w.done),
    'both fields get finished',
  );
  run(fields, 1, near);
  assert.ok(
    fields.getState().every(w => w.done),
    'and stay finished while someone is watching',
  );
  run(fields, 1, { x: 0, z: 0 });
  assert.ok(
    fields.getState().every(w => !w.done && w.worked < 3),
    'then start again',
  );
});
