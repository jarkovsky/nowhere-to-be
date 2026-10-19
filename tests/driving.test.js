import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, createCarState, placeCar } from '../src/core/driving.js';
import { drive, flatWorld } from './helpers.js';

const START = { x: 0, z: 0, heading: 0 };

test('accelerates towards top speed and rolls to a stop when released', () => {
  const car = drive(createCarState(START), { forward: true }, 4);
  assert.ok(car.speed > CAR.topSpeed * 0.9 && car.speed <= CAR.topSpeed + 0.01, `speed ${car.speed}`);
  assert.ok(car.z < -30, 'heading 0 drives towards -Z');
  drive(car, {}, 8);
  assert.equal(car.speed, 0);
});

test('left and right steer in opposite directions; reverse goes backwards', () => {
  const left = drive(createCarState(START), { forward: true, left: true }, 1);
  const right = drive(createCarState(START), { forward: true, right: true }, 1);
  assert.ok(left.heading > 0 && right.heading < 0);
  const reversing = drive(createCarState(START), { backward: true }, 2);
  assert.ok(reversing.speed < 0 && reversing.z > 0);
  assert.ok(reversing.speed >= -CAR.reverseSpeed - 0.01);
});

test('turning is tighter at low speed than at high speed', () => {
  const slow = drive(createCarState(START), { cruise: true }, 3);
  const fast = drive(createCarState(START), { forward: true }, 3);
  const slowYaw = drive({ ...slow }, { cruise: true, left: true }, 0.5).heading - slow.heading;
  const fastYaw = drive({ ...fast }, { forward: true, left: true }, 0.5).heading - fast.heading;
  // Radius of the turn = speed / yaw rate.
  assert.ok(slow.speed / slowYaw < fast.speed / fastYaw);
});

test('cruise control holds a steady speed and the brake overrides it', () => {
  const car = drive(createCarState(START), { cruise: true }, 4);
  assert.ok(Math.abs(car.speed - CAR.cruiseSpeed) < 0.3, `speed ${car.speed}`);
  drive(car, { cruise: true, brake: true }, 1.5);
  assert.equal(car.speed, 0);
});

test('snow and leaves on the trail let the car slide but keep its speed; grass slows it', () => {
  const road = drive(createCarState(START), { forward: true }, 5);
  const snow = drive(createCarState(START), { forward: true }, 5, flatWorld({ surface: 'snow' }));
  const leaves = drive(createCarState(START), { forward: true }, 5, flatWorld({ surface: 'leaves' }));
  const grass = drive(createCarState(START), { forward: true }, 5, flatWorld({ surface: 'grass' }));
  assert.ok(Math.abs(snow.speed - road.speed) < 0.1 && Math.abs(leaves.speed - road.speed) < 0.1);
  assert.ok(grass.speed < road.speed * 0.9);
  const lateral = car => Math.abs(car.vx * Math.cos(car.heading) - car.vz * Math.sin(car.heading));
  const roadTurn = drive({ ...road }, { forward: true, left: true }, 0.6);
  const snowTurn = drive(
    { ...snow, speed: road.speed, vx: road.vx, vz: road.vz },
    { forward: true, left: true },
    0.6,
    flatWorld({ surface: 'snow' }),
  );
  assert.ok(lateral(snowTurn) > lateral(roadTurn), 'more sideways slip on snow');
});

test('hills slow the car going up and a parked car stays put', () => {
  const flat = drive(createCarState(START), { forward: true }, 1.5);
  const uphill = drive(createCarState(START), { forward: true }, 1.5, flatWorld({ slope: 0.3 }));
  assert.ok(uphill.speed < flat.speed);
  const parked = drive(createCarState(START), {}, 3, flatWorld({ slope: 0.3 }));
  assert.equal(parked.distance, 0);
});

test('obstacles cannot be driven through, and glancing contact slides past', () => {
  const tree = { x: 0, z: -20, radius: 0.5 };
  const headOn = drive(createCarState(START), { forward: true }, 4, flatWorld({ obstacles: [tree] }));
  assert.ok(headOn.z > tree.z, 'stopped in front of the tree');
  assert.ok(Math.abs(headOn.speed) < 1.5);

  const wall = { ax: 1.6, az: 0, bx: 1.6, bz: -100, radius: 0.2 };
  const sliding = drive(
    { ...createCarState(START), heading: -0.15 },
    { forward: true },
    4,
    flatWorld({ obstacles: [wall] }),
  );
  assert.ok(sliding.x < wall.ax - 1, 'stays on its side of the wall');
  assert.ok(sliding.z < -25, 'keeps moving along it');
});

test('water and the valley edge stop the car without trapping it', () => {
  const isDriveable = (x, z) => z > -10;
  const car = drive(createCarState(START), { forward: true }, 4, flatWorld({ isDriveable }));
  assert.ok(car.z > -10 + 1.5 && car.z < -6, `the bonnet stops at the edge (z ${car.z})`);
  drive(car, { backward: true }, 2, flatWorld({ isDriveable }));
  assert.ok(car.z > -2, 'reversing away works');
});

test('placing the car resets motion but keeps the trip distance', () => {
  const car = drive(createCarState(START), { forward: true }, 2);
  const distance = car.distance;
  placeCar(car, { x: 5, z: 6, heading: 1 });
  assert.deepEqual([car.x, car.z, car.heading, car.speed, car.vx, car.vz], [5, 6, 1, 0, 0, 0]);
  assert.equal(car.distance, distance);
});

test('tilt steers proportionally and the arrow keys override it', () => {
  const half = drive(createCarState(START), { forward: true, steer: 0.5 }, 1);
  const full = drive(createCarState(START), { forward: true, steer: 1 }, 1);
  const overridden = drive(createCarState(START), { forward: true, steer: 1, right: true }, 1);
  assert.ok(half.heading > 0 && full.heading > half.heading);
  assert.ok(overridden.heading < 0);
  const ignored = drive(createCarState(START), { steer: NaN }, 0.1);
  assert.equal(ignored.steering, 0);
});
