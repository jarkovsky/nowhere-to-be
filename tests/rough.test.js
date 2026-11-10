import './dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createObstacleIndex, penetration } from '../src/core/collision.js';
import { bodyOf, createCarState, stepDriving } from '../src/core/driving.js';
import { handlingOf } from '../src/core/handling.js';
import { VEHICLES } from '../src/core/journal.js';
import { chassisPose } from '../src/core/suspension.js';
import { createCar } from '../src/vehicles/car.js';
import { ROUGH_GROUND, TRACKS, onRoughGround } from '../src/world/layout.js';
import { buildLandmarks } from '../src/world/landmarks/index.js';
import { createPath, headingOf } from '../src/world/path.js';
import { buildScenery } from '../src/world/scenery.js';
import { boulderLift, drivingHeight, isDriveable } from '../src/world/terrain.js';
import { steerTowards } from './helpers.js';

// The whole valley, with the rough ground in it.
const scene = new THREE.Scene();
const scenery = buildScenery(scene);
const obstacles = [...scenery.obstacles];
buildLandmarks(scene, obstacles);

const world = {
  obstacles: createObstacleIndex(obstacles),
  dynamic: [],
  surface: () => 'track',
  slope: (x, z, heading) => {
    const dx = -Math.sin(heading) * 1.5;
    const dz = -Math.cos(heading) * 1.5;
    return (drivingHeight(x + dx, z + dz) - drivingHeight(x - dx, z - dz)) / 3;
  },
  height: (x, z) => drivingHeight(x, z),
  boulderLift,
  isDriveable,
};

/** The track a stretch is on, driven out (`there`) or back, as a path of its own. */
function wayOf(entry, way) {
  return way === 'there' ? entry.path : createPath(entry.path.samples.map(p => [p.x, p.z]).reverse());
}

/** The stretch's start and end along the way it is driven. */
function limitsOf(entry, way) {
  return way === 'there'
    ? { from: entry.from, to: entry.to }
    : { from: entry.path.length - entry.to, to: entry.path.length - entry.from };
}

/**
 * Drives `path` at cruise from 25 m before the stretch to 15 m after it, already going 6 m/s. A
 * careless driver aims `bias` metres to one side, and swings `zigzag` metres either way. Reports how
 * slowly the car went on the stretch, how long it stood still at a stretch, and whether it got to the end.
 */
function driveStretch(entry, way, { name = 'offroader', bias = 0, zigzag = 0, wheels, size } = {}) {
  const path = wayOf(entry, way);
  const { from, to } = limitsOf(entry, way);
  const begin = Math.max(0, from - 25);
  const end = Math.min(path.length - 3, to + 15);
  const points = [];
  for (let s = begin; s <= end; s += 2) points.push([path.at(s).x, path.at(s).z]);
  const route = createPath(points);
  const start = route.at(0);
  const heading = headingOf(start.dx, start.dz);
  const car = Object.assign(createCarState({ x: start.x, z: start.z, heading }), {
    speed: 6,
    vx: -Math.sin(heading) * 6,
    vz: -Math.cos(heading) * 6,
    handling: handlingOf(name, wheels),
    ...(size && { body: bodyOf(size) }),
  });
  const held = {};
  let [progress, lastS, still, slowest, stopped, step] = [0, 0, 0, Infinity, 0, 0];
  for (; step < 60 * 120 && progress < route.length - 2; step++) {
    const near = route.nearest(car.x, car.z);
    if (near.distance > 7) return { stuck: `left the track at ${progress.toFixed(0)} m`, progress };
    progress += near.s - lastS;
    lastS = near.s;
    const aim = bias + zigzag * Math.sin((step / 60) * ((2 * Math.PI) / 6));
    const ahead = route.offset(near.s + 7, aim);
    const desired = Math.atan2(-(ahead.x - car.x), -(ahead.z - car.z));
    stepDriving(car, { cruise: true, steer: steerTowards(car, desired, held) }, 1 / 60, world);
    still = Math.abs(car.speed) < 0.3 ? still + 1 : 0;
    stopped = Math.max(stopped, still / 60);
    // Speed is the car's own along its way; on the stretch it is the middle of it that counts.
    const along = path.nearest(car.x, car.z).s;
    if (along > from + 2 && along < to - 2 && near.distance < 2.5) slowest = Math.min(slowest, car.speed);
  }
  return { progress, slowest, stopped, length: route.length };
}

test('every side track with rough ground is one of the tracks, away from its ends', () => {
  assert.deepEqual(ROUGH_GROUND.map(entry => entry.track).sort(), ['chata', 'crash', 'fishing', 'logging', 'mine']);
  for (const entry of ROUGH_GROUND) {
    const length = TRACKS.find(track => track.id === entry.track).path.length;
    assert.ok(
      entry.to - entry.from >= 10 && entry.to - entry.from <= 30,
      `${entry.id}: ${entry.to - entry.from} m long`,
    );
    assert.ok(entry.from > 10 && entry.to < length - 10, `${entry.id} is too near an end`);
  }
});

test('the ground on each stretch lifts a wheel on both lines, and somewhere is high enough to slow every vehicle', () => {
  for (const entry of ROUGH_GROUND) {
    for (const side of [-1.08, 1.08]) {
      let high = 0;
      let count = 0;
      for (let s = entry.from + 3; s <= entry.to - 3; s += 0.5, count++) {
        const p = entry.path.offset(s, side);
        if (boulderLift(p.x, p.z) > 0.08) high++;
      }
      assert.ok(
        high / count > 0.15,
        `${entry.id}: only ${Math.round((100 * high) / count)}% of the ${side} wheel line is rough`,
      );
    }
    // And somewhere it is high enough to make every vehicle creep.
    let tallest = 0;
    for (let s = entry.from; s <= entry.to; s += 0.25) {
      for (let side = -2.4; side <= 2.4; side += 0.25) {
        const p = entry.path.offset(s, side);
        tallest = Math.max(tallest, boulderLift(p.x, p.z));
      }
    }
    assert.ok(tallest > 0.25 && tallest < 0.75, `${entry.id}: the tallest bump is ${tallest.toFixed(2)} m`);
  }
});

test('nothing solid stands on the drivable band of a rough stretch', () => {
  for (const entry of ROUGH_GROUND) {
    for (let s = entry.from - 4; s <= entry.to + 4; s += 1) {
      const p = entry.path.at(s);
      for (const obstacle of obstacles) {
        assert.equal(penetration(p.x, p.z, 2.6, obstacle), null, `${entry.id}: blocked at ${s} m along`);
      }
    }
  }
});

test('no grass grows on the bare ground of a stretch, and the bare ground follows its outline', () => {
  for (const entry of ROUGH_GROUND) {
    let [bare, covered] = [0, 0];
    for (let s = entry.from - 4; s <= entry.to + 4; s += 1) {
      for (let side = -entry.half - 1; side <= entry.half + 1; side += 0.5) {
        const p = entry.path.offset(s, side);
        const grass = scenery.grass.amountAt(p.x, p.z);
        // Well inside the outline: a metre in, where the mask's soft edge doesn't reach.
        const inside = [-1, 0, 1].every(k => [-1, 0, 1].every(j => entry.shape(s + j, side + k) > 0.9));
        if (inside) {
          bare++;
          assert.ok(onRoughGround(p.x, p.z), `${entry.id}: ${side} m aside at ${s} m is not rough ground`);
          assert.ok(grass < 0.25, `${entry.id}: grass at ${s} m, ${side} m aside`);
        } else if (entry.shape(s, side) === 0 && Math.abs(side) > entry.half) {
          // Out beyond the outline the meadow is as it was.
          covered++;
        }
      }
    }
    assert.ok(bare > 20 && covered > 10, `${entry.id}: ${bare} bare points, ${covered} outside`);
  }
  // A winding bed leaves grass where the bed isn't: not a rectangle.
  const bed = ROUGH_GROUND.find(entry => entry.id === 'stream-bed');
  const grassy = [];
  for (let s = bed.from; s <= bed.to; s += 0.5) {
    const p = bed.path.offset(s, 4);
    grassy.push(bed.shape(s, 4) < 0.05 && scenery.grass.amountAt(p.x, p.z) > 0.3);
  }
  assert.ok(grassy.some(Boolean), 'grass grows on the stretch where the stream bed is not');
});

test('the off-roader slows to a crawl on each stretch, both ways, and drives on', () => {
  for (const entry of ROUGH_GROUND) {
    for (const way of ['there', 'back']) {
      const label = `${entry.id} ${way}`;
      const drive = driveStretch(entry, way);
      assert.equal(drive.stuck, undefined, `${label}: ${drive.stuck}`);
      assert.ok(
        drive.progress >= drive.length - 4,
        `${label}: only reached ${drive.progress.toFixed(0)} of ${drive.length.toFixed(0)} m`,
      );
      assert.ok(drive.slowest < 3, `${label}: went ${drive.slowest.toFixed(1)} m/s over it`);
      assert.ok(drive.stopped <= 1, `${label}: stood still for ${drive.stopped.toFixed(1)} s`);
    }
  }
});

test('every vehicle in the garage gets over every stretch both ways, never stopping for more than a moment', () => {
  const model = createCar();
  for (const name of VEHICLES) {
    model.customize('orange', [], name);
    for (const entry of ROUGH_GROUND) {
      for (const way of ['there', 'back']) {
        const label = `${name}: ${entry.id} ${way}`;
        const drive = driveStretch(entry, way, { name, wheels: model.spec.wheels, size: model.size });
        assert.equal(drive.stuck, undefined, `${label}: ${drive.stuck}`);
        assert.ok(
          drive.progress >= drive.length - 4,
          `${label}: only reached ${drive.progress.toFixed(0)} of ${drive.length.toFixed(0)} m`,
        );
        assert.ok(drive.slowest < 3, `${label}: went ${drive.slowest.toFixed(1)} m/s over it`);
        assert.ok(drive.stopped <= 1, `${label}: stood still for ${drive.stopped.toFixed(1)} s`);
      }
    }
  }
});

test('a careless off-roader, aiming off the track or zig-zagging across it, is never held up on the rough ground', () => {
  for (const entry of ROUGH_GROUND) {
    for (const way of ['there', 'back']) {
      for (const options of [{ bias: -2 }, { bias: 2 }, { bias: -3 }, { bias: 3 }, { zigzag: 2.5 }]) {
        const label = `${entry.id} ${way} ${JSON.stringify(options)}`;
        const drive = driveStretch(entry, way, options);
        assert.equal(drive.stuck, undefined, `${label}: ${drive.stuck}`);
        assert.ok(
          drive.progress >= drive.length - 4,
          `${label}: only reached ${drive.progress.toFixed(0)} of ${drive.length.toFixed(0)} m`,
        );
        assert.ok(drive.stopped <= 2, `${label}: stood still for ${drive.stopped.toFixed(1)} s`);
      }
    }
  }
});

test('the body rocks on its springs over the rough ground without turning over', () => {
  for (const entry of ROUGH_GROUND) {
    let [roll, pitch] = [0, 0];
    for (let s = entry.from; s <= entry.to; s += 0.5) {
      const p = entry.path.at(s);
      const pose = chassisPose(p.x, p.z, headingOf(p.dx, p.dz), (x, z) => drivingHeight(x, z));
      roll = Math.max(roll, Math.abs(pose.roll));
      pitch = Math.max(pitch, Math.abs(pose.pitch));
    }
    assert.ok(roll < 0.35 && pitch < 0.4, `${entry.id}: rolls ${roll.toFixed(2)}, pitches ${pitch.toFixed(2)}`);
  }
});
