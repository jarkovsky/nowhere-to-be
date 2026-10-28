import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarState, stepDriving } from '../src/core/driving.js';
import { createFences } from '../src/world/fences.js';
import { flatWorld } from './helpers.js';

/** A straight fence across the way at z = -10, posts every 2.6 m. */
function setup() {
  const fences = createFences();
  const points = Array.from({ length: 11 }, (_, k) => ({ x: (k - 5) * 2.6, y: 0, z: -10 }));
  fences.add(points);
  const mesh = fences.mesh();
  const world = flatWorld({ obstacles: fences.obstacles });
  return { fences, mesh, world };
}

test('driven into at cruising speed, the fence stops the car and stays up', () => {
  const { fences, mesh, world } = setup();
  const car = createCarState({ x: 0.5, z: 0, heading: 0 });
  const before = new Float32Array(mesh.instanceMatrix.array);
  for (let t = 0; t < 4; t += 1 / 60) stepDriving(car, { cruise: true }, 1 / 60, world);
  assert.ok(car.z > -10 + 2.1 - 0.1, `stopped at z ${car.z.toFixed(2)}`);
  assert.deepEqual(new Float32Array(mesh.instanceMatrix.array), before, 'nothing in the fence moved');
  assert.equal(fences.obstacles.length, 10);
});

test('a gate in the fence is drawn as a gate', () => {
  const fences = createFences();
  const points = Array.from({ length: 5 }, (_, k) => ({ x: (k - 2) * 2.6, y: 0, z: -10 }));
  fences.add(points, { gates: [1] });
  const mesh = fences.mesh();
  // Five posts, two rails on each of three stretches, six bars in the gate.
  assert.equal(mesh.count, 5 + 3 * 2 + 6);
});
