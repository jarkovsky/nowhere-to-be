import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAVITY } from '../src/core/chassis.js';
import { createObstacleIndex } from '../src/core/collision.js';
import { createRide, fitRide, placeRide, stepRide } from '../src/core/ride.js';

const STEP = 1 / 60;

/** A world with nothing in it but the ground, as high as `height(x, z)` says. */
function groundWorld(height, surface = 'road') {
  return {
    obstacles: createObstacleIndex([]),
    dynamic: [],
    surface: () => surface,
    slope: (x, z, heading) => {
      const dx = -Math.sin(heading) * 1.5;
      const dz = -Math.cos(heading) * 1.5;
      return (height(x + dx, z + dz) - height(x - dx, z - dz)) / 3;
    },
    height,
    isDriveable: () => true,
  };
}

/**
 * Drives `ride` for `seconds` with `input` (or what `input(ride)` gives each step), calling
 * `watch(ride, before)` after each step, `before` being how fast the body was rising before it.
 * Stops early once `watch` returns true.
 */
function run(ride, input, seconds, world, watch) {
  for (let t = 0; t < seconds; t += STEP) {
    const before = ride.chassis.rising;
    stepRide(ride, typeof input === 'function' ? input(ride) : input, STEP, world);
    if (watch?.(ride, before)) return;
  }
}

/** A car facing -Z at (0, 0) on the ground `height`, its body at rest. */
function startOn(height, name) {
  const ride = createRide({ x: 0, z: 0, heading: 0 });
  if (name) fitRide(ride, name, WHEELS[name]);
  const world = groundWorld(height);
  stepRide(ride, {}, STEP, world, { held: true });
  return { ride, world };
}

/** A low saloon's wheels, for a car with little wheel travel. */
const WHEELS = { saloon: [-0.8, 0.8].flatMap(x => [-1.3, 1.3].map(z => ({ x, z, radius: 0.32 }))) };

/** Flat ground 10 m up that ends in a cliff 20 m ahead of the start. */
const cliff = (x, z) => (z > -20 ? 10 : 0);

test('driven off a cliff, the car falls no faster than anything falls, and lands on its wheels and drives on', () => {
  const { ride, world } = startOn(cliff);
  let hardest = 0;
  let longest = 0;
  let fastest = 0;
  run(ride, { forward: true }, 8, world, ({ chassis }, before) => {
    hardest = Math.max(hardest, -(chassis.rising - before) / STEP);
    longest = Math.max(longest, chassis.air);
    fastest = Math.max(fastest, -chassis.rising);
  });
  assert.ok(hardest <= GRAVITY * 1.0001, `brought down at ${(hardest / GRAVITY).toFixed(2)} g`);
  // Ten metres takes a little under a second and a half to fall, and ends at 14 m/s.
  assert.ok(longest > 1.1 && longest < 1.6, `in the air ${longest.toFixed(2)} s`);
  assert.ok(fastest > 12 && fastest < 14.5, `fell at ${fastest.toFixed(1)} m/s`);
  const { state, chassis } = ride;
  assert.ok(state.z < -60, `got to ${state.z.toFixed(0)}`);
  assert.equal(chassis.air, 0);
  assert.ok(chassis.front === 1 && chassis.back === 1);
  assert.ok(Math.abs(chassis.pitch) < 0.05 && Math.abs(chassis.roll) < 0.02, 'it stands level again');
  assert.ok(Math.abs(chassis.height - chassis.ground.height) < 0.05);
});

test('in the air nothing drives, brakes or steers the car', () => {
  const flights = [{ forward: true }, { brake: true }, { backward: true, left: true }, {}].map(input => {
    const { ride, world } = startOn(cliff);
    run(ride, { forward: true }, 8, world, ({ state }) => state.air > 0.05);
    const { state } = ride;
    const off = { speed: Math.hypot(state.vx, state.vz), heading: state.heading };
    run(ride, input, 8, world, ({ chassis }) => chassis.air === 0);
    return {
      lost: off.speed - Math.hypot(state.vx, state.vz),
      turned: Math.abs(state.heading - off.heading),
      x: state.x,
    };
  });
  for (const flight of flights) {
    assert.ok(Math.abs(flight.lost) < 0.2, `its speed over the ground changed by ${flight.lost.toFixed(2)} m/s`);
    assert.ok(flight.turned < 0.02, `it turned ${flight.turned.toFixed(3)} rad`);
    assert.ok(Math.abs(flight.x - flights[0].x) < 0.05, 'it came down in the same place whatever was pressed');
  }
});

test('crept over an edge, the car tips forward about its back wheels before it goes, and is not left hanging there', () => {
  for (const name of [undefined, 'saloon']) {
    // A step down of a metre and a half.
    const { ride, world } = startOn((x, z) => (z > -8 ? 1.5 : 0), name);
    let tipped = 0;
    run(ride, { cruise: true, cruiseSpeed: 1.5 }, 40, world, ({ chassis }) => {
      if (chassis.back > 0.5 && chassis.front === 0) tipped = Math.min(tipped, chassis.pitch);
    });
    assert.ok(tipped < -0.1, `${name ?? 'offroader'}: its nose went down ${(-tipped).toFixed(2)} rad over the edge`);
    assert.ok(ride.state.z < -20, `${name ?? 'offroader'}: it got to ${ride.state.z.toFixed(1)}`);
    assert.ok(ride.chassis.front === 1 && ride.chassis.back === 1 && Math.abs(ride.chassis.pitch) < 0.05);
  }
});

test('coming down on a slope, the car keeps its speed along the slope and loses only what went into the ground', () => {
  // Off a ledge onto ground falling away at one in two, four metres down.
  const slope = 0.5;
  const { ride, world } = startOn((x, z) => (z > -20 ? 10 : 6 + slope * (z + 20)));
  const { state } = ride;
  let last = null;
  let impact = 0;
  let after = null;
  run(ride, { forward: true }, 8, world, ({ chassis }) => {
    if (chassis.air > 0) last = { flat: Math.hypot(state.vx, state.vz), vy: state.vy };
    else if (last && !after) {
      impact = Math.max(impact, state.impact);
      if (state.impact > 0) after = { speed: state.speed };
    }
    return after !== null;
  });
  assert.ok(last && after, 'it flew and landed');
  const steep = Math.hypot(1, slope);
  const into = (-last.vy - slope * last.flat) / steep;
  const along = (last.flat - slope * last.vy) / steep;
  assert.ok(into > 2, `it met the ground at ${into.toFixed(1)} m/s`);
  assert.ok(Math.abs(impact - into) < 0.15 * into + 0.3, `felt ${impact.toFixed(1)} of ${into.toFixed(1)} m/s`);
  assert.ok(impact < -last.vy * 0.8, 'not the whole of its fall, on a slope');
  assert.ok(
    Math.abs(after.speed - along) < 0.05 * along + 0.3,
    `went on at ${after.speed.toFixed(1)} of ${along.toFixed(1)} m/s`,
  );
});

test('down a steep hill the car goes as fast along it as it is driven, and drops no faster than that takes it', () => {
  const slope = 0.8;
  const { ride, world } = startOn((x, z) => slope * z);
  const { state, chassis } = ride;
  let dropping = 0;
  run(ride, { cruise: true, cruiseSpeed: 6 }, 12, world, () => {
    dropping = Math.max(dropping, -chassis.rising);
  });
  const steep = Math.hypot(1, slope);
  assert.ok(Math.abs(state.speed - 6) < 0.3, `along the hill at ${state.speed.toFixed(2)} m/s`);
  assert.ok(Math.abs(Math.hypot(state.vx, state.vz) - 6 / steep) < 0.3, 'over the ground it is slower');
  assert.ok(dropping < (6 * slope) / steep + 0.6, `dropped at ${dropping.toFixed(2)} m/s`);
  assert.ok(chassis.front === 1 && chassis.back === 1, 'its wheels stay on the hill');
});

test('left to roll down a long hill with the pedals up, the car never runs away faster than it could be driven', () => {
  for (const slope of [0.3, 0.5]) {
    const { ride, world } = startOn((x, z) => slope * z);
    let fastest = 0;
    run(ride, { forward: true }, 1, world);
    run(ride, {}, 40, world, ({ state }) => {
      fastest = Math.max(fastest, state.speed);
    });
    const top = ride.state.handling.top;
    assert.ok(fastest > top * 0.8, `it rolled, to ${fastest.toFixed(1)} m/s`);
    assert.ok(fastest < top + 2.5, `one in ${(1 / slope).toFixed(1)}: reached ${fastest.toFixed(1)} m/s, top ${top}`);
  }
});

test('over a crest at cruising speed the wheels stay on the ground, and taken flat out they leave it', () => {
  // Up one in five for 80 m and down the same the other side.
  const crest = (x, z) => 16 - 0.2 * Math.abs(z + 80);
  const flown = input => {
    const { ride, world } = startOn(crest);
    let air = 0;
    let least = 1;
    let hardest = 0;
    run(ride, input, 40, world, ({ chassis, state }) => {
      air = Math.max(air, chassis.air);
      hardest = Math.max(hardest, state.impact);
      if (state.z < -70 && state.z > -100) least = Math.min(least, Math.max(chassis.front, chassis.back));
      return state.z < -130;
    });
    return { air, least, hardest, z: ride.state.z };
  };
  const calm = flown({ cruise: true, cruiseSpeed: 6 });
  assert.equal(calm.air, 0, 'at cruising speed it never leaves the ground');
  assert.ok(calm.least > 0.9, `and keeps its footing: ${calm.least.toFixed(2)}`);
  assert.equal(calm.hardest, 0, 'with no bump');
  const fast = flown({ forward: true });
  // Going up at 12 m/s it would be a second or so before it came down the far side.
  assert.ok(fast.air > 0.4 && fast.air < 1.2, `flat out it flies for ${fast.air.toFixed(2)} s`);
  assert.ok(fast.hardest > 1.5 && fast.hardest < 8, `and lands with a bump of ${fast.hardest.toFixed(1)} m/s`);
  assert.ok(fast.z < -130, 'and drives on');
});

test('with a wheel hanging over a hollow the car drives on, held by the other wheel of the pair', () => {
  // A trench a metre deep under the left wheels' way, 3 m long.
  const trench = (x, z) => (x < -0.6 && x > -1.6 && z < -8 && z > -11 ? -1 : 0);
  const { ride, world } = startOn(trench);
  let slowest = Infinity;
  let hung = false;
  run(ride, { cruise: true, cruiseSpeed: 4 }, 8, world, ({ state, chassis }) => {
    if (state.z < -6 && state.z > -14) {
      slowest = Math.min(slowest, state.speed);
      assert.ok(chassis.front > 0.5 || chassis.back > 0.5, 'some wheels hold the ground all the way');
      hung ||= chassis.front < 1 || chassis.back < 1 || Math.abs(chassis.roll) > 0.03;
    }
  });
  assert.ok(hung, 'the hollow is felt');
  assert.ok(slowest > 2.5, `it slowed to ${slowest.toFixed(1)} m/s`);
  assert.ok(ride.state.z < -25);
});

test('standing still on any ground the car stays where it is, at rest on its springs', () => {
  for (const height of [
    () => 0,
    (x, z) => 0.4 * z,
    (x, z) => 0.3 * x - 0.2 * z,
    (x, z) => Math.sin(x) * 0.2 + Math.cos(z * 0.7) * 0.2,
  ]) {
    const { ride, world } = startOn(height);
    run(ride, {}, 5, world);
    const { state, chassis } = ride;
    assert.ok(Math.hypot(state.x, state.z) < 1e-9, 'it has not moved');
    assert.ok(Math.abs(chassis.rising) < 1e-3 && Math.abs(chassis.height - chassis.ground.height) < 0.03);
    assert.equal(state.vy, 0);
  }
});

test('a car that is carried is not driven, and one put somewhere else stands at rest there', () => {
  const { ride, world } = startOn(cliff);
  run(ride, { forward: true }, 1, world);
  const at = { x: ride.state.x, z: ride.state.z };
  for (let i = 0; i < 60; i++) stepRide(ride, { forward: true }, STEP, world, { held: true });
  assert.deepEqual({ x: ride.state.x, z: ride.state.z }, at);
  placeRide(ride, { x: 3, z: -40, heading: 1 });
  stepRide(ride, {}, STEP, world);
  assert.equal(ride.state.speed, 0);
  assert.ok(Math.abs(ride.chassis.height - ride.chassis.ground.height) < 1e-9 && ride.chassis.rising === 0);
  assert.equal(ride.state.y, 0);
});

test('whatever is driven over, every number stays finite and the body is never brought down faster than it falls', () => {
  let seed = 5;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  // Ledges, pits, ramps and ridges, some of them sheer.
  const rough = (x, z) =>
    3 * Math.sin(x * 0.11) * Math.cos(z * 0.13) +
    (Math.floor(z / 9) % 3 === 0 ? 1.2 : 0) +
    (Math.floor(x / 7) % 4 === 0 ? -0.8 : 0);
  for (let trial = 0; trial < 12; trial++) {
    const { ride, world } = startOn(rough, trial % 3 === 2 ? 'saloon' : undefined);
    placeRide(ride, { x: random() * 200 - 100, z: random() * 200 - 100, heading: random() * 6.28 });
    let input = {};
    for (let i = 0; i < 1500; i++) {
      if (i % 50 === 0) {
        const kind = random();
        input = {
          forward: kind < 0.6,
          backward: kind > 0.8,
          brake: kind > 0.6 && kind < 0.65,
          steer: random() * 2 - 1,
        };
      }
      const before = ride.chassis.rising;
      stepRide(ride, input, STEP, world);
      const { state, chassis } = ride;
      for (const value of [state.x, state.z, state.y, state.vx, state.vz, state.vy, state.speed, state.heading]) {
        assert.ok(Number.isFinite(value), `trial ${trial} step ${i}`);
      }
      for (const value of [chassis.height, chassis.pitch, chassis.roll, chassis.rising])
        assert.ok(Number.isFinite(value));
      assert.ok(-(chassis.rising - before) / STEP <= GRAVITY * 1.0001, `trial ${trial} step ${i}: pulled down`);
      assert.ok(state.y >= rough(state.x, state.z) - 1e-9, 'its wheels are never under the ground');
      assert.ok(Math.abs(state.speed) < 40);
    }
  }
});
