import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, createCarState, rearSteerAngle, steerAngle } from '../src/core/driving.js';
import { HANDLING, handlingOf } from '../src/core/handling.js';
import { VEHICLES } from '../src/core/journal.js';
import { createCar } from '../src/vehicles/car.js';
import { drive, flatWorld } from './helpers.js';

const START = { x: 0, z: 0, heading: 0 };

// Every vehicle in the garage, with its axles where its own wheels are.
const car = createCar();
const VEHICLE = Object.fromEntries(
  VEHICLES.map(name => {
    car.customize('orange', [], name);
    return [name, handlingOf(name, car.spec.wheels)];
  }),
);

/** A car standing at the start, driving like `name`. */
function vehicle(name, place = START) {
  return Object.assign(createCarState(place), { handling: VEHICLE[name] });
}

/** How far ahead of where it started the car is, in metres (it starts facing -Z). */
const gone = state => -state.z;

/** How fast it is going sideways, and how far its heading is from the way it is going. */
const lateral = state => state.vx * Math.cos(state.heading) - state.vz * Math.sin(state.heading);

test('every vehicle in the garage has handling of its own, with its axles where its wheels are', () => {
  assert.deepEqual(Object.keys(HANDLING).sort(), [...VEHICLES].sort());
  for (const [name, handling] of Object.entries(VEHICLE)) {
    assert.ok(handling.front > 0.5 && handling.rear > 0.5, `${name}: axles at ${handling.front}, ${handling.rear}`);
    assert.ok(handling.track > 1.4 && handling.track < 2.4, `${name}: track ${handling.track}`);
  }
  // The flatbed's two back axles count as one between them, so it has the longest wheelbase.
  car.customize('orange', [], 'flatbed');
  const back = [...new Set(car.spec.wheels.map(wheel => wheel.z).filter(z => z > 0))];
  assert.equal(back.length, 2);
  assert.ok(Math.abs(VEHICLE.flatbed.rear - (back[0] + back[1]) / 2) < 1e-9);
  assert.ok(
    VEHICLE.flatbed.wheelbase > VEHICLE.lorry.wheelbase && VEHICLE.lorry.wheelbase > VEHICLE.offroader.wheelbase,
  );
});

test('every vehicle holds 6 m/s on cruise on the road and on grass, and keeps climbing a steep hill', () => {
  for (const name of VEHICLES) {
    for (const surface of ['road', 'grass']) {
      const state = drive(vehicle(name), { cruise: true }, 10, flatWorld({ surface }));
      assert.ok(Math.abs(state.speed - CAR.cruiseSpeed) < 0.3, `${name} on ${surface}: ${state.speed.toFixed(2)} m/s`);
    }
    // Up a 25% grass hill, the heavy ones slow to a crawl but none stops.
    const hill = drive(vehicle(name), { cruise: true }, 12, flatWorld({ surface: 'grass', slope: 0.25 }));
    assert.ok(hill.speed > 2.5, `${name} up the hill: ${hill.speed.toFixed(2)} m/s`);
  }
  const climb = name => drive(vehicle(name), { cruise: true }, 12, flatWorld({ surface: 'grass', slope: 0.25 })).speed;
  assert.ok(climb('offroader') > 5.7, `the off-roader slowed to ${climb('offroader').toFixed(2)} m/s`);
  assert.ok(climb('lorry') < climb('offroader') - 1, 'the lorry labours up it');
});

test('on cruise every vehicle turns about as sharply as its wheels point, and soon', () => {
  for (const name of VEHICLES) {
    const handling = VEHICLE[name];
    const state = drive(vehicle(name), { cruise: true }, 8, flatWorld({ surface: 'grass' }));
    const before = state.heading;
    drive(state, { cruise: true, steer: 0.5 }, 0.5, flatWorld({ surface: 'grass' }));
    const early = state.yawRate;
    drive(state, { cruise: true, steer: 0.5 }, 2, flatWorld({ surface: 'grass' }));
    const front = steerAngle(state.steering, state.speed, handling);
    const back = rearSteerAngle(front, state.speed, handling);
    const asked = (state.speed * (Math.tan(front) - Math.tan(back))) / handling.wheelbase;
    assert.ok(state.heading > before, `${name} turned left`);
    assert.ok(
      Math.abs(state.yawRate - asked) < asked * 0.2,
      `${name}: turning ${state.yawRate.toFixed(2)}, wheels ask ${asked.toFixed(2)}`,
    );
    // The lorries, heavy and long, are slower to come round.
    assert.ok(early > asked * 0.65, `${name}: only ${early.toFixed(2)} after half a second`);
  }
});

test('pushed too hard into a bend, a vehicle runs wide rather than spinning, and braking in it never spins it round', () => {
  for (const name of VEHICLES) {
    for (const surface of ['road', 'snow']) {
      const world = flatWorld({ surface });
      const state = drive(vehicle(name), { forward: true }, 10, world);
      const speed = state.speed;
      let widest = 0;
      let fastestTurn = 0;
      for (let t = 0; t < 3; t += 1 / 60) {
        drive(state, { forward: true, left: true }, 1 / 60, world);
        widest = Math.max(widest, Math.abs(Math.atan2(lateral(state), Math.abs(state.speed))));
        fastestTurn = Math.max(fastestTurn, Math.abs(state.yawRate));
      }
      const kinematic = (speed * Math.tan(steerAngle(1, speed, VEHICLE[name]))) / VEHICLE[name].wheelbase;
      if (surface === 'snow') assert.ok(fastestTurn < kinematic * 0.8, `${name} on snow: no running wide`);
      // Each is let slide only as far as its stability control allows, the rally car furthest.
      const slip = Math.atan(VEHICLE[name].slide * 1.3) + 0.12;
      assert.ok(widest < slip, `${name} on ${surface}: slid ${widest.toFixed(2)} rad`);
      // Brakes on hard, still steering, then off the wheel: it stops, more or less pointing the way it went.
      const heading = state.heading;
      drive(state, { brake: true, left: true }, 0.5, world);
      drive(state, { brake: true }, 4, world);
      assert.equal(state.speed, 0, `${name} on ${surface} stopped`);
      assert.ok(
        Math.abs(state.heading - heading) < 1.6,
        `${name} on ${surface}: turned ${(state.heading - heading).toFixed(2)}`,
      );
    }
  }
});

test('a heavy lorry is slower to get going and to stop than the off-roader, and the racing car quicker', () => {
  const upTo = (name, speed) => {
    const state = vehicle(name);
    let t = 0;
    for (; t < 30 && state.speed < speed; t += 1 / 60) drive(state, { forward: true }, 1 / 60);
    return t;
  };
  assert.ok(upTo('mercedes', 12) < upTo('offroader', 12) && upTo('offroader', 12) < upTo('lorry', 12));
  const stopping = name => {
    const state = drive(vehicle(name), { forward: true }, 15);
    Object.assign(state, { vx: 0, vz: -10, speed: 10 });
    const from = gone(state);
    drive(state, { brake: true }, 6);
    return gone(state) - from;
  };
  assert.ok(stopping('lorry') > stopping('offroader') * 1.2, `${stopping('lorry')} and ${stopping('offroader')} m`);
});

test('the engine revs up through each gear and drops at each change, and changes up later flat out', () => {
  const state = vehicle('offroader');
  const gears = [];
  let last = state.rpm;
  let drops = 0;
  for (let t = 0; t < 8; t += 1 / 60) {
    const gear = state.gear;
    drive(state, { forward: true }, 1 / 60);
    if (state.gear > gear) {
      gears.push(state.gear);
      if (state.rpm < last - 400) drops++;
    }
    last = state.rpm;
  }
  assert.ok(gears.length >= 3, `changed up ${gears.length} times`);
  assert.equal(drops, gears.length, 'the revs drop at each change up');
  // Gently, on cruise, it settles in a higher gear for 6 m/s than it needs flat out to get there.
  const gentle = drive(vehicle('offroader'), { cruise: true }, 8);
  const hard = vehicle('offroader');
  while (hard.speed < 6) drive(hard, { forward: true }, 1 / 60);
  assert.ok(gentle.gear >= hard.gear, `gear ${gentle.gear} on cruise, ${hard.gear} flat out`);
  assert.ok(gentle.rpm < 2600, `${gentle.rpm.toFixed(0)} rpm on cruise`);
});

test('every vehicle creeps up a hill as steep as the steepest track, and one too steep for anything holds it where it is', () => {
  for (const name of VEHICLES) {
    const state = drive(vehicle(name), { cruise: true }, 10, flatWorld({ surface: 'grass', slope: 0.85 }));
    assert.ok(state.speed > 0.8, `${name} up an 85% hill: ${state.speed.toFixed(2)} m/s`);
  }
  const world = flatWorld({ surface: 'grass', slope: 1.5 });
  const state = vehicle('lorry');
  let backwards = 0;
  for (let t = 0; t < 5; t += 1 / 60) {
    drive(state, { cruise: true }, 1 / 60, world);
    backwards = Math.min(backwards, state.speed);
  }
  assert.ok(backwards > -0.2, `rolled back at ${backwards.toFixed(2)} m/s`);
  assert.ok(Math.abs(gone(state)) < 0.5);
});

/** A boulder `height` high and `radius` across, on its own on flat ground at (0, -15): its shape and its obstacle. */
function rockWorld(height, radius = 1.3) {
  const lift = (x, z) => {
    const d2 = (x ** 2 + (z + 15) ** 2) / radius ** 2;
    return d2 < 1 ? height * (1 - d2) ** 2 : 0;
  };
  return {
    ...flatWorld({ surface: 'grass', obstacles: [{ x: 0, z: -15, radius: radius * 0.9, climb: height }] }),
    height: lift,
    boulderLift: lift,
  };
}

test('a boulder it can climb, a vehicle crawls over and drives on; one too tall for it stops it', () => {
  for (const name of ['offroader', 'expedition', 'tractor']) {
    const world = rockWorld(0.55);
    const state = vehicle(name);
    let slowest = Infinity;
    for (let t = 0; t < 12 && gone(state) < 30; t += 1 / 60) {
      drive(state, { cruise: true }, 1 / 60, world);
      if (gone(state) > 8) slowest = Math.min(slowest, state.speed);
    }
    assert.ok(gone(state) >= 30, `${name} got ${gone(state).toFixed(1)} m`);
    assert.ok(slowest < CAR.cruiseSpeed * 0.6 && slowest > 0.8, `${name} slowed to ${slowest.toFixed(2)} m/s`);
    assert.ok(Math.abs(state.x) < 1, `${name} was knocked ${state.x.toFixed(2)} m aside`);
  }
  for (const name of ['miata', 'mercedes', 'saloon']) {
    const state = drive(vehicle(name), { cruise: true }, 8, rockWorld(0.55));
    assert.ok(gone(state) < 13.5, `${name} drove over a rock taller than it can climb`);
  }
});
