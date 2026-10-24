import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCar } from '../src/vehicles/car.js';

const box = new THREE.Box3();
const middle = new THREE.Vector3();

/** How high the middle of each of the car's lamps is, left then right. */
function lampHeights(car) {
  car.root.updateMatrixWorld(true);
  const lamps = [];
  car.body.traverse(object => {
    if (!object.isMesh || object.material.emissive?.getHex() !== 0xffd88e) return;
    object.geometry.computeBoundingBox();
    lamps.push(box.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld).getCenter(middle).clone());
  });
  return lamps.sort((a, b) => a.x - b.x).map(lamp => lamp.y);
}

/** Whether each pop-up lamp stands up above the bonnet, left then right; null while one is on its way. */
function standing(car) {
  return lampHeights(car).map(y => (y > 0.88 ? true : y < 0.75 ? false : null));
}

/** The roadster, at the origin, by day. */
function roadster() {
  const car = createCar();
  car.customize('orange', [], 'miata');
  car.setLights(0, false);
  return car;
}

/** Runs the car's animation on from `time` for `seconds`, moving it along if it is `driving`. */
function run(car, time, seconds, driving = true) {
  for (let t = time; t < time + seconds; t += 0.05) {
    if (driving) car.root.position.z -= 0.3;
    car.animate(t);
  }
  return time + seconds;
}

test("the roadster's pop-up lamps stand up after dark and fold away by day", () => {
  const car = roadster();
  assert.deepEqual(standing(car), [false, false]);
  car.setLights(1, false);
  let time = run(car, 0, 0.2);
  assert.deepEqual(standing(car), [null, null], 'they turn up rather than jump');
  time = run(car, time, 1);
  assert.deepEqual(standing(car), [true, true]);
  assert.equal(car.headlight.intensity, 55);
  car.setLights(0, false);
  run(car, time, 1);
  assert.deepEqual(standing(car), [false, false]);
  assert.equal(car.headlight.intensity, 0);
});

test('they flip up and back down for the horn, and down and back up at night', () => {
  const car = roadster();
  car.wink();
  let time = run(car, 0, 0.6);
  assert.deepEqual(standing(car), [true, true]);
  time = run(car, time, 1.2);
  assert.deepEqual(standing(car), [false, false]);
  car.setLights(1, false);
  time = run(car, time, 1);
  car.wink();
  time = run(car, time, 0.6);
  assert.deepEqual(standing(car), [false, false]);
  assert.equal(car.headlight.intensity, 0, 'the beam goes out with them');
  run(car, time, 1.2);
  assert.deepEqual(standing(car), [true, true]);
});

test('a parked roadster winks once, with one lamp, and with the other the next time', () => {
  const car = roadster();
  let time = run(car, 0, 4.6, false);
  assert.deepEqual(standing(car).sort(), [false, true]);
  const first = standing(car);
  time = run(car, time, 6, false);
  assert.deepEqual(standing(car), [false, false]);
  time = run(car, time, 1);
  run(car, time, 4.6, false);
  assert.deepEqual(
    standing(car),
    first.map(up => !up),
  );
});

test('lamps flashed on for a moment hold them up long enough to stand right up', () => {
  const car = roadster();
  car.setLights(1, false);
  car.animate(0);
  car.setLights(0, false);
  let time = run(car, 0.05, 0.6);
  assert.deepEqual(standing(car), [true, true]);
  run(car, time, 1.2);
  assert.deepEqual(standing(car), [false, false]);
});

test('the other vehicles have no pop-up lamps, and their lamps stay put', () => {
  const car = createCar();
  car.customize('saloon');
  const before = lampHeights(car);
  car.setLights(1, false);
  car.wink();
  run(car, 0, 1);
  assert.deepEqual(lampHeights(car), before);
});
