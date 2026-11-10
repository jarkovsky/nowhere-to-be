import './dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCarState, stepDriving } from '../src/core/driving.js';
import { handlingOf } from '../src/core/handling.js';
import { clamp } from '../src/core/math.js';
import { HOOK_REACH, createRescue, ditchDepth, pickSpot, pullSpeed, stepRescue, towEye } from '../src/core/rescue.js';
import { OUTER_ROAD, RING_ROAD, ROAD, STRANDED, STRANDED_SPOTS, SURFACES, TRACKS } from '../src/world/layout.js';
import { headingOf } from '../src/world/path.js';
import { camperVan, createVehicle, pickup, saloon } from '../src/vehicles/traffic.js';
import { circlesOf, routeOff } from '../src/world/stranded.js';
import { flatWorld, steerTowards } from './helpers.js';

const pathOf = spot => TRACKS.find(track => track.id === spot.track).path;
const MODELS = [camperVan, saloon, pickup].map(model => createVehicle(model()));

// --- Where they are -------------------------------------------------------------------

test('every spot is on one of the side tracks it was meant for, beside a straight stretch', () => {
  const allowed = ['tower', 'fields', 'farm-horses', 'orchard', 'spring', 'east-ford', 'winter-log', 'desert'];
  assert.ok(STRANDED_SPOTS.length >= 8);
  for (const spot of STRANDED_SPOTS) {
    assert.ok(allowed.includes(spot.track), `${spot.track}`);
    const path = pathOf(spot);
    const near = path.nearest(spot.x, spot.z);
    assert.ok(
      Math.abs(near.distance - STRANDED.aside) < 0.3,
      `${spot.track} ${spot.s}: ${near.distance.toFixed(1)} m off`,
    );
    assert.equal(Math.sign(near.side), spot.side);
    // Straight: the track turns very little for 14 m either way.
    const a = path.at(spot.s - 14);
    const b = path.at(spot.s + 14);
    const turn = Math.abs(Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz));
    assert.ok(turn < 0.4, `${spot.track} ${spot.s}: turns ${turn.toFixed(2)} rad`);
    // The tracks that are to be left alone have nothing to do with it.
    for (const other of TRACKS.filter(track => track.id !== spot.track)) {
      assert.ok(!other.path.isNear(spot.x, spot.z, 12), `${spot.track} ${spot.s} is near ${other.id}`);
    }
  }
});

test('the spots are apart, and a long way from the roads', () => {
  for (const spot of STRANDED_SPOTS) {
    for (const other of STRANDED_SPOTS) {
      if (other !== spot) assert.ok(Math.hypot(spot.x - other.x, spot.z - other.z) > 60);
    }
    for (const road of [ROAD, RING_ROAD, OUTER_ROAD]) assert.ok(!road.isNear(spot.x, spot.z, 14));
  }
});

test('no spot is within 25 m of a patch of mud on the ground', () => {
  for (const spot of STRANDED_SPOTS) {
    for (const patch of SURFACES.filter(p => p.id === 'mud')) {
      const edge = Math.hypot(spot.x - patch.x, spot.z - patch.z) - Math.max(patch.rx, patch.rz);
      assert.ok(edge >= 25, `${spot.track} ${spot.s} is ${edge.toFixed(0)} m from mud`);
    }
  }
});

test('whichever vehicle it is, its obstacle is outside the band the track drives on', () => {
  for (const spot of STRANDED_SPOTS) {
    const path = pathOf(spot);
    for (const vehicle of MODELS) {
      for (const c of circlesOf(spot.x, spot.z, spot.heading, vehicle.along)) {
        const edge = path.nearest(c.x, c.z).distance - c.radius;
        assert.ok(edge > 4.6, `${spot.track} ${spot.s}: its edge is ${edge.toFixed(1)} m from the middle`);
      }
    }
  }
});

test('in the ditch it is tail towards the track, and a vehicle is as long as its obstacle', () => {
  for (const spot of STRANDED_SPOTS) {
    const rescue = createRescue({ spot, length: 4.6, lateral: (x, z) => pathOf(spot).nearest(x, z).distance });
    const eye = towEye(rescue);
    const path = pathOf(spot);
    assert.ok(path.nearest(eye.x, eye.z).distance < path.nearest(spot.x, spot.z).distance, 'its tail is nearer');
    assert.ok(ditchDepth(rescue) > 0.99);
  }
});

// --- A careless driver is never held up ---------------------------------------------------

/**
 * Drives a car along the track past the spot at cruise, aiming `bias` metres to one side of the
 * middle and swinging that `zigzag` metres either way every 6 s, with the traveller's body in the
 * way as the game has it. Returns how far along it got and how long it stood still.
 */
function passBy(spot, direction, { bias = 0, zigzag = 0 } = {}) {
  const path = pathOf(spot);
  const from = clamp(spot.s - direction * 45, 0, path.length);
  const goal = clamp(spot.s + direction * 45, 0, path.length);
  const start = path.at(from);
  const dir = { x: start.dx * direction, z: start.dz * direction };
  const car = createCarState({ x: start.x, z: start.z, heading: headingOf(dir.x, dir.z) });
  Object.assign(car, { speed: 6, vx: dir.x * 6, vz: dir.z * 6 });
  const circles = MODELS[spot.index % MODELS.length];
  const world = { ...flatWorld({ surface: 'track' }), dynamic: circlesOf(spot.x, spot.z, spot.heading, circles.along) };
  const held = {};
  let reached = false;
  let still = 0;
  let longest = 0;
  for (let step = 0; step < 60 * 40 && !reached; step++) {
    const near = path.nearest(car.x, car.z);
    reached = Math.abs(near.s - goal) < 4;
    const aim = bias + zigzag * Math.sin((step / 60) * ((2 * Math.PI) / 6));
    const ahead = path.offset(near.s + direction * 7, aim);
    const desired = Math.atan2(-(ahead.x - car.x), -(ahead.z - car.z));
    stepDriving(car, { cruise: true, steer: steerTowards(car, desired, held) }, 1 / 60, world);
    still = step > 120 && Math.abs(car.speed) < 0.3 ? still + 1 : 0;
    longest = Math.max(longest, still / 60);
  }
  return { reached, longest };
}

test('a careless driver, off line or zig-zagging, drives past every spot in either direction without being held up', () => {
  for (const spot of STRANDED_SPOTS) {
    for (const direction of [1, -1]) {
      for (const options of [{}, { bias: -3 }, { bias: 3 }, { bias: 2 }, { bias: -2 }, { zigzag: 2.5 }]) {
        const label = `${spot.track} ${spot.s} ${direction > 0 ? 'out' : 'back'} ${JSON.stringify(options)}`;
        const { reached, longest } = passBy(spot, direction, options);
        assert.ok(reached, `${label}: did not get past`);
        assert.ok(longest < 1, `${label}: stood still ${longest.toFixed(1)} s`);
      }
    }
  }
});

// --- The state machine, with a fake car --------------------------------------------------

/** A straight track along the Z axis with the traveller 6.6 m to one side, tail towards it. */
function straight() {
  const spot = { x: 6.6, z: 0, heading: headingOf(0.34, 0.94), index: 0 };
  const route = {
    length: 400,
    at: d => ({ x: 0, z: d, dx: 0, dz: 1 }),
    nearest: () => ({ s: 0 }),
  };
  const rescue = createRescue({ spot, length: 4.6, lateral: x => Math.abs(x), route: () => route });
  return { spot, rescue };
}

const hookOf = car => ({ x: car.x, z: car.z + 2.1 });

/** Drives the fake car along the track towards -Z at `speed`, held to the rescue's cap, for `seconds`. */
function drive(rescue, car, seconds, { speed = 6, handling, watch = () => {} } = {}) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    car.speed = speed;
    if (rescue.cap !== null) car.speed = Math.min(car.speed, rescue.cap);
    car.z += ((speed < 0 ? 1 : -1) * Math.abs(car.speed)) / 60;
    stepRescue(rescue, car, hookOf(car), 1 / 60, { handling });
    if (rescue.cap !== null) car.speed = Math.min(car.speed, rescue.cap);
    watch(t);
  }
}

test('the rope hooks on as the car passes, at cruise, with nothing for the child to do', () => {
  const { rescue } = straight();
  const car = { x: 0, z: 40, speed: 6 };
  const events = [];
  drive(rescue, car, 9, { watch: () => events.push(...rescue.events) });
  assert.ok(events.includes('hook'));
  assert.equal(rescue.phase === 'stuck', false);
  assert.ok(rescue.rope.attached || rescue.phase !== 'hooked');
});

test('the rope does not hook a car that is further off than its reach, or going faster than cruise', () => {
  const { rescue } = straight();
  const far = { x: -HOOK_REACH - 3, z: 40, speed: 6 };
  drive(rescue, far, 12);
  assert.equal(rescue.phase, 'stuck');
  const { rescue: again } = straight();
  const fast = { x: 0, z: 40, speed: 15 };
  for (let t = 0; t < 8; t += 1 / 60) {
    fast.z -= 15 / 60;
    stepRescue(again, fast, hookOf(fast), 1 / 60);
  }
  assert.equal(again.phase, 'stuck');
});

test('stopped beside it, the car hooks on too', () => {
  const { rescue } = straight();
  const car = { x: 0, z: 0, speed: 0 };
  stepRescue(rescue, car, hookOf(car), 1 / 60);
  assert.equal(rescue.phase, 'hooked');
});

test('driving on, the rope tightens, the car slows to a crawl and the traveller comes up out of the ditch behind it', () => {
  const { rescue } = straight();
  const car = { x: 0, z: 30, speed: 6 };
  let slowest = Infinity;
  let depth = 1;
  let outAt = null;
  drive(rescue, car, 30, {
    handling: handlingOf('offroader'),
    watch: t => {
      if (rescue.cap !== null) slowest = Math.min(slowest, car.speed);
      if (outAt === null && rescue.phase !== 'hooked' && rescue.phase !== 'stuck') outAt = t;
      if (rescue.phase === 'hooked') depth = Math.min(depth, ditchDepth(rescue));
    },
  });
  assert.ok(slowest < 2.5, `pulled at ${slowest.toFixed(1)} m/s`);
  assert.ok(slowest >= 1.4, 'never stalled');
  assert.ok(outAt !== null && outAt < 15, `out after ${outAt} s`);
  assert.ok(depth < 1, 'it rose out of the ditch');
  assert.equal(rescue.rope.attached, false, 'the rope dropped');
});

test('once it is out it flashes its lights, toots once, and drives off along the track', () => {
  const { rescue } = straight();
  const car = { x: 0, z: 30, speed: 6 };
  const events = [];
  let flashed = 0;
  let was = false;
  const run = () => {
    events.push(...rescue.events);
    if (rescue.flashing && !was) flashed++;
    was = rescue.flashing;
  };
  drive(rescue, car, 14, { watch: run });
  assert.equal(rescue.phase === 'out' || rescue.phase === 'leaving', true);
  for (let t = 0; t < 4; t += 1 / 60) {
    car.z -= 6 / 60;
    stepRescue(rescue, car, hookOf(car), 1 / 60);
    run();
  }
  assert.equal(events.filter(e => e === 'toot').length, 1);
  assert.equal(rescue.phase, 'leaving');
  // It drives away from the car, down the route, at about 5 m/s.
  const z = rescue.z;
  for (let t = 0; t < 5; t += 1 / 60) {
    car.z -= 6 / 60;
    stepRescue(rescue, car, hookOf(car), 1 / 60);
  }
  assert.ok(rescue.z - z > 10, `moved ${(rescue.z - z).toFixed(1)} m`);
  assert.ok(Math.abs(rescue.speed) < 5.2);
  assert.ok(Math.abs(rescue.x) < 3, 'on the track');
});

test('it keeps behind the car if the car is in its way, and finally is gone', () => {
  const { rescue } = straight();
  const car = { x: 0, z: 30, speed: 6 };
  drive(rescue, car, 20);
  // The car stands in front of it on the track.
  const stop = { x: 0, z: rescue.z + 14, speed: 0 };
  assert.equal(rescue.phase, 'leaving');
  for (let t = 0; t < 10; t += 1 / 60) stepRescue(rescue, stop, hookOf(stop), 1 / 60);
  assert.ok(stop.z - rescue.z > 6, `${(stop.z - rescue.z).toFixed(1)} m behind`);
  const away = { x: 0, z: -200, speed: 0 };
  for (let t = 0; t < 200 && rescue.phase !== 'gone'; t += 1 / 60) stepRescue(rescue, away, hookOf(away), 1 / 60);
  assert.equal(rescue.phase, 'gone');
});

test('driving off it goes round the friends coming the other way on the track, and does not run into them', () => {
  const { rescue } = straight();
  const car = { x: 0, z: 30, speed: 6 };
  drive(rescue, car, 20);
  assert.equal(rescue.phase, 'leaving');
  const friend = { x: 0, z: rescue.z + 14 };
  const away = { x: 0, z: -100, speed: 0 };
  let closest = Infinity;
  for (let t = 0; t < 14; t += 1 / 60) {
    stepRescue(rescue, away, hookOf(away), 1 / 60, { others: [friend] });
    closest = Math.min(closest, Math.hypot(rescue.x - friend.x, rescue.z - friend.z));
  }
  assert.ok(closest > 2.8, `passed ${closest.toFixed(1)} m from it`);
  assert.ok(rescue.z > friend.z + 5, 'and carried on past it');
});

test('reversing or turning back, the rope goes slack and then comes off, and the traveller waits for next time', () => {
  const { rescue, spot } = straight();
  const car = { x: 0, z: -1, speed: 0 };
  stepRescue(rescue, car, hookOf(car), 1 / 60);
  assert.equal(rescue.phase, 'hooked');
  // Pulled a little way, then the car goes back.
  drive(rescue, car, 2.5);
  const moved = Math.hypot(rescue.x - spot.x, rescue.z - spot.z);
  assert.ok(moved > 0.5, 'it was pulled');
  // It backs up beside it: the rope goes slack and holds nothing back. Left like that, it comes off.
  for (let t = 0; t < 3; t += 1 / 60) {
    car.speed = -3;
    car.z += 3 / 60;
    stepRescue(rescue, car, hookOf(car), 1 / 60);
    assert.equal(rescue.cap, null, 'nothing holds the car back while the rope is slack');
    assert.equal(rescue.phase, 'hooked');
  }
  car.speed = 0;
  for (let t = 0; t < 15; t += 1 / 60) stepRescue(rescue, car, hookOf(car), 1 / 60);
  assert.equal(rescue.phase, 'stuck');
  assert.equal(rescue.rope.attached, false);
  // It has slipped back into the ditch where it was.
  assert.ok(Math.hypot(rescue.x - spot.x, rescue.z - spot.z) < 0.1);
  assert.ok(ditchDepth(rescue) > 0.99);
  // And it hooks on again on a later pass, but not at once while the car is still beside it.
  const near = { x: 0, z: 0, speed: 0 };
  stepRescue(rescue, near, hookOf(near), 1 / 60);
  assert.equal(rescue.phase, 'stuck');
  const away = { x: 0, z: 40, speed: 6 };
  stepRescue(rescue, away, hookOf(away), 1 / 60);
  drive(rescue, away, 8);
  assert.equal(rescue.phase === 'stuck', false);
});

test('a car that pulls it the wrong way is held to the crawl for only a few seconds before the rope slips off', () => {
  const { rescue } = straight();
  // Driving along a line out in the field, the traveller is dragged along it, never up onto the track.
  const car = { x: 11, z: -2, speed: 3 };
  stepRescue(rescue, car, hookOf(car), 1 / 60);
  assert.equal(rescue.phase, 'hooked');
  let held = 0;
  for (let t = 0; t < 40 && rescue.phase === 'hooked'; t += 1 / 60) {
    car.speed = rescue.cap === null ? 3 : Math.min(3, rescue.cap);
    car.z -= car.speed / 60;
    stepRescue(rescue, car, hookOf(car), 1 / 60);
    if (rescue.cap !== null) held += 1 / 60;
  }
  assert.equal(rescue.phase, 'stuck');
  assert.ok(held < 15, `held to a crawl for ${held.toFixed(1)} s`);
});

test('a car that goes far off lets go of the rope', () => {
  const { rescue } = straight();
  const car = { x: 0, z: 0, speed: 0 };
  stepRescue(rescue, car, hookOf(car), 1 / 60);
  assert.equal(rescue.phase, 'hooked');
  car.z = -80;
  stepRescue(rescue, car, hookOf(car), 1 / 60);
  assert.equal(rescue.phase, 'stuck');
});

test('a car busy with something else is not hooked', () => {
  const { rescue } = straight();
  const car = { x: 0, z: 0, speed: 0 };
  stepRescue(rescue, car, hookOf(car), 1 / 60, { busy: true });
  assert.equal(rescue.phase, 'stuck');
});

// --- Every vehicle can do it ---------------------------------------------------------------

/** Pulls it out with a real car driven by the driving model, held to the cap as the game does. */
function pullOut(name) {
  const { rescue } = straight();
  const handling = handlingOf(name);
  const car = createCarState({ x: 0, z: 40, heading: 0 });
  car.handling = handling;
  const world = flatWorld({ surface: 'track' });
  let outAt = null;
  let slowest = Infinity;
  for (let t = 0; t < 90 && outAt === null; t += 1 / 60) {
    stepDriving(car, { cruise: true }, 1 / 60, world);
    stepRescue(rescue, car, { x: car.x, z: car.z + 2.1 }, 1 / 60, { handling });
    if (rescue.cap !== null && Math.abs(car.speed) > rescue.cap) {
      const k = rescue.cap / Math.abs(car.speed);
      car.speed *= k;
      car.vx *= k;
      car.vz *= k;
    }
    if (rescue.phase === 'hooked' && rescue.taut > 1) slowest = Math.min(slowest, Math.abs(car.speed));
    if (rescue.phase === 'out') outAt = t;
  }
  return { outAt, slowest };
}

test('the racing car, the lorry and every other vehicle can pull it out, a weaker one more slowly, and none is stalled', () => {
  const results = {};
  for (const name of ['mercedes', 'lorry', 'offroader', 'pickup', 'van', 'tractor']) {
    results[name] = pullOut(name);
    assert.ok(results[name].outAt !== null, `${name} did not pull it out`);
    assert.ok(results[name].outAt < 40, `${name} took ${results[name].outAt?.toFixed(0)} s`);
    assert.ok(results[name].slowest >= 1.2, `${name} was held to ${results[name].slowest.toFixed(2)} m/s`);
  }
  assert.ok(pullSpeed(handlingOf('lorry')) < pullSpeed(handlingOf('mercedes')));
  assert.ok(results.lorry.outAt >= results.mercedes.outAt - 0.5);
});

// --- When and where -----------------------------------------------------------------------

test('the next spot is not the last, is over 150 m away and out of sight', () => {
  const player = { x: 0, z: 0, heading: 0 };
  const front = { x: 0, z: -1 };
  for (let k = 0; k < 40; k++) {
    const spot = pickSpot(STRANDED_SPOTS, player, { last: 3, random: () => (k * 0.137) % 1 });
    if (!spot) continue;
    assert.notEqual(spot.index, 3);
    const distance = Math.hypot(spot.x, spot.z);
    assert.ok(distance > 150);
    const ahead = (spot.x * front.x + spot.z * front.z) / distance;
    assert.ok(ahead < 0.5 || distance > 380);
  }
  assert.equal(pickSpot([{ index: 0, x: 0, z: -200 }], player), null, 'straight ahead and in view');
  assert.ok(pickSpot([{ index: 0, x: 0, z: 200 }], player), 'behind');
  assert.equal(pickSpot([{ index: 0, x: 0, z: 100 }], player), null, 'too close');
});

test('it drives off along the track to the nearest road and out along it', () => {
  for (const spot of STRANDED_SPOTS) {
    const route = routeOff(spot);
    const path = pathOf(spot);
    // It starts where the traveller is, near the track, and ends on a road.
    assert.ok(path.isNear(route.at(route.nearest(spot.x, spot.z).s).x, route.at(route.nearest(spot.x, spot.z).s).z, 8));
    const end = route.at(route.length);
    assert.ok(
      [ROAD, RING_ROAD, OUTER_ROAD].some(road => road.isNear(end.x, end.z, 5)),
      `${spot.track} ${spot.s}`,
    );
    assert.ok(route.length - route.nearest(spot.x, spot.z).s > 40);
    // Nearer the road end than the other.
    const toEnd = spot.s < path.length - spot.s;
    const near = route.at(0);
    assert.ok(Math.hypot(near.x - path.at(toEnd ? path.length : 0).x, near.z - path.at(toEnd ? path.length : 0).z) < 3);
  }
});
