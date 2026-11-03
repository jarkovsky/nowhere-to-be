import test from 'node:test';
import assert from 'node:assert/strict';
import './dom.js';
import { createObstacleIndex } from '../src/core/collision.js';
import { createCarState, stepDriving } from '../src/core/driving.js';
import {
  HULL,
  LANES,
  allAboard,
  berthFor,
  createFerry,
  deckHeight,
  isCarrying,
  quayEnd,
  stepFerry,
  toLocal,
  walls,
} from '../src/core/ferry.js';
import { createPath } from '../src/world/path.js';
import { FERRY_QUAY, FJORD, LOFOTEN_QUAY } from '../src/world/layout.js';
import {
  addFloatingDeck,
  drivingHeight,
  isDriveable,
  quayHeight,
  terrainHeight,
  waterDepth,
} from '../src/world/terrain.js';

const STEP = 1 / 60;
const { dock } = FERRY_QUAY;
const far = LOFOTEN_QUAY.dock;
const out = { x: -Math.sin(dock.heading), z: -Math.cos(dock.heading) };
const along = (d, side = 0) => [dock.x + out.x * d + out.z * side, dock.z + out.z * d - out.x * side];
const farOut = { x: -Math.sin(far.heading), z: -Math.cos(far.heading) };
const alongFar = d => [far.x + farOut.x * d, far.z + farOut.z * d];

/** Straight out from the dock at the head of the fjord, across and straight in to the far one, for the logic on its own; the real way is in world/ferry.js. */
function route() {
  return createPath([along(0), along(40), alongFar(40), alongFar(0)]);
}

function newFerry() {
  return createFerry({
    docks: [
      { dock, quay: FERRY_QUAY },
      { dock: far, quay: LOFOTEN_QUAY },
    ],
    route: route(),
    level: FJORD.level,
  });
}

/** The corners of a car 4.4 m long and 2 m wide. */
function cornersOf(car) {
  const sin = Math.sin(car.heading);
  const cos = Math.cos(car.heading);
  return [2.2, -2.2].flatMap(a => [-1, 1].map(s => ({ x: car.x - sin * a + cos * s, z: car.z - cos * a - sin * s })));
}

/** Runs the ferry on, with the car driven where it isn't carried, until `done()`. Returns how long that took. */
function run(
  ferry,
  { car = null, input = {}, world = null, others = [], ready = true, seconds = 300, done = () => false, watch },
) {
  for (let t = 0; t < seconds; t += STEP) {
    if (done()) return t;
    stepFerry(ferry, STEP, { car, corners: car ? cornersOf(car) : [], others, ready });
    if (car && world && !isCarrying(ferry)) stepDriving(car, input, STEP, world);
    watch?.(t);
  }
  return Infinity;
}

/** Tied up at the head of the fjord (0) or on the Lofoten coast (1). */
const docked =
  (ferry, at = 0) =>
  () =>
    ferry.phase === 'docked' && ferry.at === at;

/** Where the car is in a quay's own frame: across, and out over the water. */
function onQuayFrame({ x, z }, quay = FERRY_QUAY) {
  const cos = Math.cos(quay.rotation);
  const sin = Math.sin(quay.rotation);
  const dx = x - quay.x;
  const dz = z - quay.z;
  return { across: dx * cos - dz * sin, out: dx * sin + dz * cos };
}

test('the ferry comes over from the far side, lowers the ramp at the head of the fjord and says it has arrived', () => {
  const ferry = newFerry();
  const events = [];
  const took = run(ferry, { done: docked(ferry), watch: () => events.push(...ferry.events) });
  assert.ok(took < 120, `docked after ${took.toFixed(0)} s`);
  assert.ok(events.includes('loading') && events.includes('arrived'));
  assert.equal(ferry.ramps[quayEnd(ferry) < 0 ? 0 : 1], 0, 'its ramp is down at the quay');
  assert.equal(ferry.ramps[quayEnd(ferry) < 0 ? 1 : 0], 1, 'and up at the other end');
  assert.ok(Math.hypot(ferry.x - dock.x, ferry.z - dock.z) < 0.01);
});

test('where its ramp rests on the quay, the deck meets the quay, and the deck is only there while the ramp is down', () => {
  const ferry = newFerry();
  run(ferry, { done: docked(ferry) });
  const end = quayEnd(ferry);
  const tip = along(-(HULL.halfLength + 2.4));
  const onRamp = deckHeight(ferry, ...tip);
  assert.ok(Math.abs(onRamp - quayHeight(...tip)) < 0.05, `${onRamp} against ${quayHeight(...tip)}`);
  assert.ok(deckHeight(ferry, ...along(0)) > FJORD.level + 0.8);
  // The other end's ramp is up: nothing to drive on past that end.
  assert.equal(deckHeight(ferry, ...along(HULL.halfLength + 1)), null);
  assert.equal(end, 1);
});

test('a car driven down the quay and aboard is taken across, faces the far quay there, and drives off onto it', () => {
  const ferry = newFerry();
  const remove = addFloatingDeck({ height: (x, z) => deckHeight(ferry, x, z) });
  try {
    run(ferry, { done: docked(ferry) });
    // From the end of the road, facing out over the water, on cruise.
    const [x, z] = along(-(FERRY_QUAY.berth + 1));
    const car = createCarState({ x, z, heading: dock.heading });
    const world = {
      obstacles: createObstacleIndex([]),
      dynamic: [],
      surface: () => 'road',
      slope: (x, z, heading) => {
        const dx = -Math.sin(heading) * 1.5;
        const dz = -Math.cos(heading) * 1.5;
        return (drivingHeight(x + dx, z + dz) - drivingHeight(x - dx, z - dz)) / 3;
      },
      isDriveable,
      waterDepth: () => 0,
    };
    Object.defineProperty(world, 'dynamic', { get: () => walls(ferry) });
    const cruise = { cruise: true };
    const boarded = run(ferry, { car, input: cruise, world, done: () => isCarrying(ferry), seconds: 40 });
    assert.ok(boarded < 25, 'it drives aboard and the ferry takes it');
    assert.ok(allAboard(ferry, cornersOf(car)), 'all of it on the deck');
    const local = toLocal(ferry, car.x, car.z);
    let drift = 0;
    const sailed = run(ferry, {
      car,
      input: cruise,
      world,
      done: () => !isCarrying(ferry),
      seconds: 200,
      watch: () => {
        const now = toLocal(ferry, car.x, car.z);
        drift = Math.max(drift, Math.hypot(now.x - local.x, now.z - local.z));
      },
    });
    assert.ok(sailed > 50 && sailed < 120, `across and the ramp down after ${sailed.toFixed(1)} s`);
    assert.ok(drift < 0.01, 'it stayed where it was parked on the deck');
    assert.equal(ferry.at, 1, 'at the far quay');
    assert.ok(Math.hypot(ferry.x - far.x, ferry.z - far.z) < 0.01);
    assert.equal(quayEnd(ferry), -1, 'its front end is at the quay there');
    const facing = Math.cos(car.heading - (far.heading + Math.PI));
    assert.ok(facing > 0.99, 'the car faces the quay');
    // Still on cruise, it drives off onto the quay's ramp.
    run(ferry, {
      car,
      input: cruise,
      world,
      done: () => onQuayFrame(car, LOFOTEN_QUAY).out < LOFOTEN_QUAY.to - 3,
      seconds: 20,
    });
    assert.ok(onQuayFrame(car, LOFOTEN_QUAY).out < LOFOTEN_QUAY.to - 3, 'off the ferry');
    assert.ok(quayHeight(car.x, car.z) !== null, 'on the quay there');
  } finally {
    remove();
  }
});

test('a car that stays aboard is taken back again, the ferry turning round on the way so it faces the land', () => {
  const ferry = newFerry();
  run(ferry, { done: docked(ferry) });
  // Parked well in, facing out over the water.
  const car = createCarState({ x: along(8)[0], z: along(8)[1], heading: dock.heading });
  run(ferry, { car, done: docked(ferry, 1), seconds: 200 });
  assert.ok(Math.cos(car.heading - (far.heading + Math.PI)) > 0.99, 'across, it faces the quay there');
  let turned = 0;
  let before = ferry.heading;
  const back = run(ferry, {
    car,
    done: () => ferry.phase === 'docked' && ferry.at === 0 && !isCarrying(ferry),
    seconds: 200,
    watch: () => {
      turned += Math.abs(Math.atan2(Math.sin(ferry.heading - before), Math.cos(ferry.heading - before)));
      before = ferry.heading;
    },
  });
  assert.ok(back < 150, `back after ${back.toFixed(0)} s`);
  assert.ok(turned > 2.9, 'it turned round on the way');
  assert.ok(Math.cos(car.heading - (dock.heading + Math.PI)) > 0.99, 'and the car faces the land');
});

test('it waits while a car is on the quay or a friend is half aboard, and sails across now and then once nobody is near', () => {
  const ferry = newFerry();
  run(ferry, { done: docked(ferry) });
  // Parked on the quay's ramp, by the ferry: it waits.
  const [x, z] = along(-(HULL.halfLength + 5));
  const car = createCarState({ x, z, heading: dock.heading });
  run(ferry, { car, seconds: 120 });
  assert.equal(ferry.phase, 'docked');
  // A friend half on the ferry keeps it from leaving with the car parked aboard.
  const aboard = createCarState({ x: along(-6)[0], z: along(-6)[1], heading: dock.heading });
  const half = [
    { x: along(-HULL.halfLength + 1)[0], z: along(-HULL.halfLength + 1)[1] },
    { x, z },
  ];
  run(ferry, { car: aboard, others: [{ points: half, margin: 1 }], seconds: 10 });
  assert.equal(ferry.phase, 'docked');
  assert.ok(!isCarrying(ferry));
  // Gone off into the valley, it sails across empty, and comes back with cars.
  const away = createCarState({ x: dock.x + 300, z: dock.z + 300, heading: 0 });
  const events = [];
  const left = run(ferry, { car: away, done: () => ferry.phase === 'sailing' && ferry.to === 1, seconds: 100 });
  assert.ok(left < 100 && !isCarrying(ferry));
  run(ferry, { car: away, done: docked(ferry), seconds: 300, watch: () => events.push(...ferry.events) });
  assert.ok(events.includes('loading') && events.includes('arrived'));
});

test('it waits for the friends coming along to be aboard, though not for ever', () => {
  const ferry = newFerry();
  run(ferry, { done: docked(ferry) });
  const car = createCarState({ x: along(-6)[0], z: along(-6)[1], heading: dock.heading });
  run(ferry, { car, ready: false, seconds: 30 });
  assert.equal(ferry.phase, 'docked', 'still waiting for them');
  const went = run(ferry, { car, ready: true, done: () => isCarrying(ferry), seconds: 5 });
  assert.ok(went < 0.1, 'all aboard, it goes');
  // Waiting for friends that never come, it goes in the end.
  const again = newFerry();
  run(again, { done: docked(again) });
  const gave = run(again, { car, ready: false, done: () => isCarrying(again), seconds: 120 });
  assert.ok(gave > 40 && gave < 50, `went after ${gave.toFixed(0)} s`);
});

test('with the car on the far side it comes across for it, and waits there while the car is about', () => {
  const ferry = newFerry();
  run(ferry, { done: docked(ferry) });
  // On the coast, near the quay there.
  const [x, z] = alongFar(-(LOFOTEN_QUAY.berth + 6));
  const car = createCarState({ x, z, heading: far.heading + Math.PI });
  const came = run(ferry, { car, done: docked(ferry, 1), seconds: 200 });
  assert.ok(came < 120, `there after ${came.toFixed(0)} s`);
  // Driving about on the coast, out of sight of the quay, the ferry stays.
  const about = createCarState({ x: x + farOut.x * -150, z: z + farOut.z * -150, heading: 0 });
  run(ferry, { car: about, seconds: 200 });
  assert.equal(ferry.phase, 'docked');
  assert.equal(ferry.at, 1);
});

test('a car taken somewhere else while aboard is let go', () => {
  const ferry = newFerry();
  run(ferry, { done: docked(ferry) });
  const car = createCarState({ x: along(-5)[0], z: along(-5)[1], heading: dock.heading });
  run(ferry, { car, done: () => ferry.phase === 'sailing', seconds: 20 });
  assert.ok(isCarrying(ferry));
  car.x += 300;
  run(ferry, { car, seconds: 0.1 });
  assert.ok(!isCarrying(ferry));
});

test('the convoy from the depot finds room on the deck round the car, the longest first in the emptiest lanes', () => {
  const sizes = {
    lorry: { half: 1.3, front: 2.7, back: 10.7 },
    flatbed: { half: 1.3, front: 4.3, back: 5.9 },
    hyundai: { half: 1.06, front: 2.2, back: 2.2 },
    mercedes: { half: 1.09, front: 2.4, back: 2.4 },
    offroader: { half: 1.3, front: 2.2, back: 2.2 },
  };
  const deckLength = 2 * HULL.halfLength;
  /** Parks them one after another round a car standing at `car`, and says where each went. */
  const park = (car, names) => {
    const taken = [car];
    return names.map(name => {
      const { half, front, back } = sizes[name];
      const berth = berthFor(taken, { half, length: front + back });
      if (berth) taken.push({ across: berth.across, half, near: berth.nose - front - back, far: berth.nose });
      return berth && { name, ...berth, tail: berth.nose - front - back };
    });
  };
  // A lorry driving with the other lorry, the race cars, the flatbed and the off-roader, the car
  // stopped in the middle lane just aboard, or well in, or over to one side.
  const convoy = ['lorry', 'hyundai', 'mercedes', 'offroader', 'flatbed'];
  for (const car of [
    { across: 0, half: 1.2, near: 0.5, far: 6 },
    { across: 0, half: 1.2, near: 30, far: 36 },
    { across: LANES[2] - 0.4, half: 1.2, near: 4, far: 10 },
  ]) {
    const berths = park(car, convoy);
    assert.ok(berths.every(Boolean), `all aboard round a car at ${car.across}, ${car.near}: ${JSON.stringify(berths)}`);
    for (const b of berths) {
      assert.ok(b.tail >= 0.3 && b.nose <= deckLength, `${b.name} all on the deck`);
      assert.ok(Math.abs(b.across) + sizes[b.name].half < HULL.lanes, `${b.name} between the casings`);
    }
  }
  // On an empty deck the lorry goes in as far as it can, and the next one takes another lane.
  const [lorry, flatbed] = park({ across: 0, half: 0, near: Infinity, far: Infinity }, ['lorry', 'flatbed']);
  assert.ok(lorry.nose > deckLength - 1.5);
  assert.notEqual(flatbed.across, lorry.across);
  // A full deck has no room.
  const full = LANES.map(across => ({ across, half: 1.3, near: 1, far: deckLength }));
  assert.equal(berthFor(full, { half: 1.06, length: 4.4 }), null);
});

test('the whole way across the ferry stays out on deep water, clear of the shore', async () => {
  const { createFerry: buildFerry } = await import('../src/world/ferry.js');
  const THREE = await import('three');
  const ferry = buildFerry(new THREE.Scene(), { onHorn: () => {} });
  const at = { x: 0, z: 0 };
  ferry.dock(0);
  const check = label => {
    const { x, z, heading } = ferry.getState();
    for (const lx of [-HULL.halfBeam, HULL.halfBeam]) {
      for (const lz of [-HULL.halfLength, HULL.halfLength]) {
        at.x = x + lx * Math.cos(heading) + lz * Math.sin(heading);
        at.z = z - lx * Math.sin(heading) + lz * Math.cos(heading);
        const depth = FJORD.level - terrainHeight(at.x, at.z);
        assert.ok(depth > 1, `${label}: a corner ${depth.toFixed(1)} m deep at ${at.x.toFixed(0)}, ${at.z.toFixed(0)}`);
      }
    }
  };
  // Parked aboard, the car is taken across, and stays there.
  const car = createCarState({ x: along(-4)[0], z: along(-4)[1], heading: dock.heading });
  let sailed = 0;
  for (let t = 0; t < 200 && ferry.getState().at === 0; t += STEP) {
    ferry.update(STEP, { player: car, corners: cornersOf(car), listener: car });
    if (ferry.getState().phase === 'sailing') {
      sailed++;
      if (sailed % 30 === 0) check('across');
    }
  }
  assert.ok(sailed > 0);
  for (let t = 0; t < 20; t += STEP) ferry.update(STEP, { player: car, corners: cornersOf(car), listener: car });
  check('at the far quay');
});
