import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCarState, stepDriving } from '../src/core/driving.js';
import { KNOCK, LIE, createFences } from '../src/world/fences.js';
import { flatWorld } from './helpers.js';

/** A straight fence across the way at z = -10, posts every 2.6 m, and a car coming at it from z = 0. */
function setup() {
  const fences = createFences();
  const points = Array.from({ length: 11 }, (_, k) => ({ x: (k - 5) * 2.6, y: 0, z: -10 }));
  fences.add(points);
  const mesh = fences.mesh();
  const world = flatWorld({ obstacles: fences.obstacles });
  return { fences, mesh, world };
}

/** Drives the car on for `seconds`, knocking fences first each step as the game does. */
function run(fences, world, car, input, seconds) {
  let knocked = false;
  for (let t = 0; t < seconds; t += 1 / 60) {
    knocked = fences.knock(car, 1 / 60) || knocked;
    stepDriving(car, input, 1 / 60, world);
    fences.update(1 / 60, car);
  }
  return knocked;
}

/** Where piece `index` of the mesh is, its middle. */
function middleOf(mesh, index) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

test('driven into fast enough, the fence goes over and the car goes through, a little slower', () => {
  const { fences, world } = setup();
  const car = createCarState({ x: 0.5, z: 0, heading: 0 });
  run(fences, world, car, { cruise: true }, 1);
  const before = car.speed;
  assert.ok(before > KNOCK, 'up to speed');
  const knocked = run(fences, world, car, { cruise: true }, 2.5);
  assert.ok(knocked, 'it knocked the fence down');
  assert.ok(car.z < -14, `through, at z ${car.z.toFixed(1)}`);
  // The stretch hit and the one either side are down; the rest still stand.
  const down = fences.obstacles.filter(obstacle => obstacle.off).length;
  assert.equal(down, 3);
});

test('crept up to slowly, the fence stops the car and stays up', () => {
  const { fences, world } = setup();
  const car = createCarState({ x: 0.5, z: -6, heading: 0 });
  let knocked = false;
  for (let t = 0; t < 4; t += 1 / 60) {
    // Rolling on at a walk, whatever stops it.
    car.vz = Math.min(car.vz, -1.2);
    knocked = fences.knock(car, 1 / 60) || knocked;
    stepDriving(car, {}, 1 / 60, world);
  }
  assert.equal(knocked, false);
  assert.ok(car.z > -10 + 2.1 - 0.1, `stopped at z ${car.z.toFixed(2)}`);
  assert.ok(fences.obstacles.every(obstacle => !obstacle.off));
});

test('the knocked-down stretch lies flat on the far side, and stands up again a while later once the car is well away', () => {
  const { fences, mesh, world } = setup();
  const car = createCarState({ x: 0.5, z: 0, heading: 0 });
  run(fences, world, car, { cruise: true }, 3);
  // Every piece that went over lies low, beyond the line of the fence.
  const moved = [];
  for (let i = 0; i < mesh.count; i++) {
    const at = middleOf(mesh, i);
    if (at.z < -10.3) moved.push(at);
  }
  assert.ok(moved.length >= 6, `${moved.length} pieces went over`);
  for (const at of moved) assert.ok(at.y < 0.4, `a piece lies at ${at.y.toFixed(2)} m up`);
  // Still lying there after a long time with the car close by.
  fences.update(LIE + 5, { x: 0, z: -14 });
  fences.update(0.1, { x: 0, z: -14 });
  assert.equal(fences.obstacles.filter(obstacle => obstacle.off).length, 3);
  // Up again once the car has gone.
  fences.update(0.1, { x: 0, z: -200 });
  assert.ok(fences.obstacles.every(obstacle => !obstacle.off));
  for (let i = 0; i < mesh.count; i++) assert.ok(middleOf(mesh, i).z > -10.3);
});

test('a gate in the fence is drawn as a gate, and goes over with the rest', () => {
  const fences = createFences();
  const points = Array.from({ length: 5 }, (_, k) => ({ x: (k - 2) * 2.6, y: 0, z: -10 }));
  fences.add(points, { gates: [1] });
  const mesh = fences.mesh();
  // Five posts, two rails on each of three stretches, six bars in the gate.
  assert.equal(mesh.count, 5 + 3 * 2 + 6);
});
