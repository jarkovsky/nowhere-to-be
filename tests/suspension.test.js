import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCar } from '../src/vehicles/car.js';
import { chassisPose, settleWheels } from '../src/core/suspension.js';
import { terrainHeight } from '../src/world/terrain.js';

/** Lowest point of each tyre above the ground. */
function clearances(car, sample) {
  car.root.updateWorldMatrix(true, true);
  const vertex = new THREE.Vector3();
  return car.wheels.map(wheel => {
    const position = wheel.tire.geometry.attributes.position;
    let lowest = Infinity;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(wheel.tire.matrixWorld);
      lowest = Math.min(lowest, vertex.y - sample(vertex.x, vertex.z));
    }
    return lowest;
  });
}

function place(car, x, z, heading, sample, lag = 1) {
  const pose = chassisPose(x, z, heading, sample);
  car.root.position.set(x, pose.height, z);
  car.root.rotation.order = 'YXZ';
  car.root.rotation.y = heading;
  car.root.rotation.x += (pose.pitch - car.root.rotation.x) * lag;
  car.root.rotation.z += (pose.roll - car.root.rotation.z) * lag;
  settleWheels(car, sample);
}

test('the chassis pitches up when the car faces uphill', () => {
  const slope = (x, z) => -0.3 * z;
  assert.ok(chassisPose(0, 0, 0, slope).pitch > 0);
  assert.ok(chassisPose(0, 0, Math.PI, slope).pitch < 0);
  assert.ok(Math.abs(chassisPose(0, 0, Math.PI / 2, slope).pitch) < 1e-10);
});

test('all four tyres touch flat and sloped ground at any heading', () => {
  const car = createCar();
  for (const sample of [() => 0, (x, z) => x * 0.2 - z * 0.3, (x, z) => -x * 0.35 + z * 0.1]) {
    for (let heading = 0; heading < Math.PI * 2; heading += 0.4) {
      place(car, 10, 20, heading, sample);
      for (const gap of clearances(car, sample)) assert.ok(gap >= 0 && gap < 0.018, `gap ${gap}`);
    }
  }
});

test('tyres stay on the real terrain while the body eases into its angle', () => {
  const car = createCar();
  for (let i = 0; i < 110; i++) {
    car.wheels.forEach(wheel => {
      wheel.spin.rotation.x = i * 0.4;
      wheel.pivot.rotation.y = wheel.front ? 0.25 : 0;
    });
    place(car, -90 + i * 1.3, 99 - i * 0.5, Math.sin(i * 0.12), terrainHeight, 0.18);
    for (const gap of clearances(car, terrainHeight))
      assert.ok(gap >= -0.003 && gap < 0.025, `gap ${gap} at step ${i}`);
  }
});
