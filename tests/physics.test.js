import test from 'node:test';
import assert from 'node:assert/strict';
import { penetration } from '../src/core/collision.js';
import { CAR, createCarState, stepDriving } from '../src/core/driving.js';
import { createRandom } from '../src/core/math.js';
import { flatWorld } from './helpers.js';

const INPUTS = [
  { cruise: true },
  { forward: true },
  { forward: true, left: true },
  { forward: true, right: true },
  { cruise: true, right: true },
  { backward: true },
  { backward: true, left: true },
  { brake: true },
  {},
];

/** The middle and the radius of a circle round an obstacle. */
function around(obstacle) {
  if ('ax' in obstacle) {
    const half = Math.hypot(obstacle.bx - obstacle.ax, obstacle.bz - obstacle.az) / 2;
    return { x: (obstacle.ax + obstacle.bx) / 2, z: (obstacle.az + obstacle.bz) / 2, r: half + obstacle.radius };
  }
  return { x: obstacle.x, z: obstacle.z, r: Math.hypot(obstacle.halfX ?? 0, obstacle.halfZ ?? 0) + obstacle.radius };
}

/**
 * Trees, posts, fences and walls scattered round the start, `apart` metres clear of each other
 * at least (more than the car is wide, so it never has to squeeze between two), and clear of the start.
 */
function scatter(random, apart, count = 60) {
  const obstacles = [];
  for (let tries = 0; obstacles.length < count && tries < count * 20; tries++) {
    const x = (random() - 0.5) * 90;
    const z = (random() - 0.5) * 90;
    const kind = random();
    let obstacle;
    if (kind < 0.4) obstacle = { x, z, radius: 0.2 + random() * 2 };
    else if (kind < 0.7) {
      const angle = random() * Math.PI;
      const length = 2 + random() * 8;
      const [bx, bz] = [x + Math.cos(angle) * length, z + Math.sin(angle) * length];
      obstacle = { ax: x, az: z, bx, bz, radius: 0.1 + random() * 0.5 };
    } else {
      obstacle = {
        x,
        z,
        halfX: 0.3 + random() * 4,
        halfZ: 0.3 + random() * 4,
        rotation: random() * Math.PI,
        radius: 0,
      };
    }
    const circle = around(obstacle);
    if (Math.hypot(circle.x, circle.z) < circle.r + 4) continue;
    if (
      obstacles.some(other => {
        const near = around(other);
        return Math.hypot(near.x - circle.x, near.z - circle.z) < near.r + circle.r + apart;
      })
    )
      continue;
    obstacles.push(obstacle);
  }
  return obstacles;
}

/** How far the car's body is into the deepest of `obstacles`. */
function overlap(car, obstacles) {
  let deepest = 0;
  for (const end of [-1, 1]) {
    const x = car.x - Math.sin(car.heading) * CAR.bodyOffset * end;
    const z = car.z - Math.cos(car.heading) * CAR.bodyOffset * end;
    for (const obstacle of obstacles)
      deepest = Math.max(deepest, penetration(x, z, CAR.bodyRadius, obstacle)?.depth ?? 0);
  }
  return deepest;
}

/**
 * Drives the car about at random for `seconds` among `obstacles`, at frame rates from 20 to 240
 * a second with now and then a long frame, calling `watch(car, before, dt)` after each step.
 */
function wander(random, obstacles, seconds, watch) {
  const world = flatWorld({ obstacles });
  const car = createCarState({ x: 0, z: 0, heading: random() * Math.PI * 2 });
  let input = {};
  for (let t = 0; t < seconds; ) {
    if (random() < 0.03) input = INPUTS[Math.floor(random() * INPUTS.length)];
    const dt = random() < 0.03 ? 0.2 : 1 / (20 + random() * 220);
    const before = { ...car };
    stepDriving(car, input, dt, world);
    t += dt;
    watch(car, before, dt);
  }
}

test('driven about at random among things to bump into, the car never ends a step inside one, never goes faster than it can and its numbers stay finite', () => {
  const random = createRandom(11);
  let deepest = 0;
  let fastest = 0;
  for (let run = 0; run < 16; run++) {
    const obstacles = scatter(random, 3.5);
    wander(random, obstacles, 40, (car, before, dt) => {
      for (const key of ['x', 'z', 'vx', 'vz', 'heading', 'speed', 'steering']) {
        assert.ok(Number.isFinite(car[key]), `run ${run}: ${key} is ${car[key]}`);
      }
      deepest = Math.max(deepest, overlap(car, obstacles));
      fastest = Math.max(fastest, Math.hypot(car.vx, car.vz));
      // A step moves it no further than its speed takes it in the time the step stands for,
      // plus a push out of whatever it ran into.
      const moved = Math.hypot(car.x - before.x, car.z - before.z);
      assert.ok(
        moved <= CAR.topSpeed * 1.1 * Math.min(dt, 0.05) + 0.3,
        `run ${run}: moved ${moved.toFixed(2)} m in one step`,
      );
    });
  }
  assert.ok(deepest < 0.01, `ended a step ${deepest.toFixed(3)} m into something`);
  assert.ok(fastest <= CAR.topSpeed * 1.05, `went ${fastest.toFixed(1)} m/s`);
});

test('caught in a gap narrower than it is, the car is held there without going wild or through', () => {
  // Two posts 2 m apart: the car fits through neither way.
  const obstacles = [
    { x: -2.5, z: -6, radius: 1.5 },
    { x: 2.5, z: -6, radius: 1.5 },
  ];
  const world = flatWorld({ obstacles });
  for (const fps of [20, 60, 240]) {
    const car = createCarState({ x: 0, z: 0, heading: 0 });
    let deepest = 0;
    for (let t = 0; t < 8; t += 1 / fps) {
      stepDriving(car, { forward: true, left: t > 4 && t < 5 }, 1 / fps, world);
      deepest = Math.max(deepest, overlap(car, obstacles));
      assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z));
    }
    assert.ok(car.z > -6, `${fps} a second: through, at z ${car.z.toFixed(2)}`);
    assert.ok(deepest < 0.3, `${fps} a second: ${deepest.toFixed(2)} m into a post`);
  }
});

test('at top speed and the longest step there is, the car does not pass through a thin fence', () => {
  const fence = { ax: -200, az: -10, bx: 200, bz: -10, radius: 0.05 };
  const world = flatWorld({ obstacles: [fence] });
  for (const angle of [0, 0.4, 0.9, 1.3]) {
    const car = createCarState({ x: 0, z: 25, heading: angle });
    // Up to speed first, then at the fence, at 5 frames a second (each step is cut to the longest one).
    for (let t = 0; t < 20 && car.z > -9; t += 0.2) stepDriving(car, { forward: true }, 0.2, world);
    for (let k = 0; k < 40; k++) stepDriving(car, { forward: true }, 0.2, world);
    assert.ok(car.z > -10, `heading ${angle}: through the fence, at z ${car.z.toFixed(2)}`);
  }
});

test('the same drive at different frame rates ends up in about the same place', () => {
  const script = [
    [{ cruise: true }, 3],
    [{ cruise: true, left: true }, 2],
    [{ forward: true }, 2],
    [{ forward: true, right: true }, 1.5],
    [{ brake: true }, 1],
    [{ backward: true, left: true }, 2],
    [{}, 2],
  ];
  const ends = [20, 30, 60, 144, 240].map(fps => {
    const car = createCarState({ x: 0, z: 0, heading: 0 });
    const world = flatWorld();
    for (const [input, seconds] of script) {
      for (let i = 0; i < Math.round(seconds * fps); i++) stepDriving(car, input, 1 / fps, world);
    }
    return car;
  });
  for (const car of ends) {
    assert.ok(Math.hypot(car.x - ends[2].x, car.z - ends[2].z) < 1, `${car.x.toFixed(2)}, ${car.z.toFixed(2)}`);
    assert.ok(Math.abs(car.heading - ends[2].heading) < 0.08);
  }
});
