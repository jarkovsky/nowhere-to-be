import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAR, createCarState } from '../src/core/driving.js';
import { handlingOf } from '../src/core/handling.js';
import { VEHICLES } from '../src/core/journal.js';
import { createAtmosphere } from '../src/world/atmosphere.js';
import { TRACKS, surfaceAt, winterness } from '../src/world/layout.js';
import { puddleSize, puddleSpots } from '../src/world/puddles.js';
import { onDeck, waterDepth } from '../src/world/terrain.js';
import { createCar } from '../src/vehicles/car.js';
import { drive, flatWorld } from './helpers.js';

const HOME = { x: 0, z: 0 };
/** Somewhere the rain falls as snow. */
const SNOWY = { x: 640, z: -640 };

function atmosphere() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.FogExp2();
  return createAtmosphere(scene, new THREE.DirectionalLight(), new THREE.HemisphereLight());
}

/** Lets `seconds` go by under `preset`, at `place`, and returns the wetness. */
function pass(sky, seconds, preset, place = HOME) {
  sky.setPreset(preset);
  for (let t = 0; t < seconds; t += 0.25) sky.update(0.25, place, true);
  return sky.getState().wetness;
}

test('the ground wets over a minute or two of rain, and dries over a few minutes after, faster by day', () => {
  const sky = atmosphere();
  assert.equal(sky.getState().wetness, 0);
  const soaked = pass(sky, 30, 'rain');
  assert.ok(soaked > 0.2 && soaked < 0.8, `after 30 s: ${soaked.toFixed(2)}`);
  const wet = pass(sky, 120, 'rain');
  assert.ok(wet > 0.85, `after 2.5 minutes: ${wet.toFixed(2)}`);
  // Fine weather by day, then the same by night.
  const day = atmosphere();
  pass(day, 150, 'rain');
  const night = atmosphere();
  pass(night, 150, 'rain');
  const sunny = pass(day, 90, 'day');
  const dark = pass(night, 90, 'night');
  assert.ok(sunny < dark, `the sun dries it faster: ${sunny.toFixed(2)} against ${dark.toFixed(2)}`);
  assert.ok(dark > 0.5, 'and it is slow to dry in the night');
  assert.ok(pass(day, 400, 'day') < 0.02, 'but in the end it is dry');
});

test('rain does not wet the ground where it falls as snow', () => {
  assert.ok(winterness(SNOWY.x, SNOWY.z) > 0.9);
  const sky = atmosphere();
  assert.ok(pass(sky, 200, 'rain', SNOWY) < 0.05);
});

test('the sky has a morning mist that burns off, and none at night or noon', () => {
  const sky = atmosphere();
  const mist = preset => {
    sky.setPreset(preset);
    for (let t = 0; t < 30; t += 0.5) sky.update(0.5, HOME, false);
    return sky.getState().mist;
  };
  assert.equal(mist('day'), 0);
  assert.equal(mist('night'), 0);
  // Auto, an hour before the sun clears the hills, and again when it is high.
  sky.setTime(300);
  const early = mist('auto');
  sky.setTime(60);
  const late = mist('auto');
  assert.ok(early > late, `the mist thins as the sun climbs: ${early.toFixed(2)}, then ${late.toFixed(2)}`);
});

test('the puddles are picked in fixed places on dry ground along the tracks, and fill and shrink with the wet', () => {
  const spots = puddleSpots();
  assert.deepEqual(spots, puddleSpots(), 'the same places every time');
  assert.ok(spots.length >= 8 && spots.length <= 40, `${spots.length} puddles`);
  for (const spot of spots) {
    assert.ok(waterDepth(spot.x, spot.z) <= 0 && !onDeck(spot.x, spot.z));
    assert.equal(surfaceAt(spot.x, spot.z), 'grass');
    assert.ok(
      TRACKS.some(track => track.path.isNear(spot.x, spot.z, 2)),
      'on a track',
    );
    assert.ok(spot.r > 0.8 && spot.r < 1.7);
  }
  for (const [i, a] of spots.entries()) {
    for (const b of spots.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 24, 'spread out');
  }
  const [first, last] = [spots[0], spots.at(-1)];
  assert.equal(puddleSize(first, 0), 0);
  assert.ok(first.need < last.need, 'the deepest hollows fill first');
  assert.equal(puddleSize(last, 1), 1);
  assert.ok(puddleSize(first, 0.4) > puddleSize(first, 0.2), 'they grow as it wets, and so shrink as it dries');
});

test('every vehicle still holds a bend at cruise on wet road and gravel', () => {
  const car = createCar();
  for (const name of VEHICLES) {
    car.customize('orange', [], name);
    const handling = handlingOf(name, car.spec.wheels);
    for (const surface of ['road', 'track']) {
      const turned = wetness => {
        const world = { ...flatWorld({ surface }), wetness: () => wetness };
        const state = Object.assign(createCarState({ x: 0, z: 0, heading: 0 }), { handling });
        drive(state, { cruise: true }, 8, world);
        assert.ok(
          Math.abs(state.speed - CAR.cruiseSpeed) < 0.4,
          `${name} on wet ${surface}: ${state.speed.toFixed(2)}`,
        );
        let widest = 0;
        for (let t = 0; t < 3; t += 1 / 60) {
          drive(state, { cruise: true, steer: 0.6 }, 1 / 60, world);
          widest = Math.max(
            widest,
            Math.abs(
              Math.atan2(
                state.vx * Math.cos(state.heading) - state.vz * Math.sin(state.heading),
                Math.abs(state.speed),
              ),
            ),
          );
        }
        return { heading: state.heading, widest, speed: state.speed };
      };
      const dry = turned(0);
      const wet = turned(1);
      assert.ok(
        wet.widest < Math.max(dry.widest * 1.3, 0.1),
        `${name} on wet ${surface}: slid ${wet.widest.toFixed(2)} against ${dry.widest.toFixed(2)}`,
      );
      assert.ok(Math.abs(wet.heading) > Math.abs(dry.heading) * 0.85, `${name} on wet ${surface} still turns`);
      assert.ok(wet.speed > dry.speed - 0.5, `${name} on wet ${surface}: keeps its pace in the bend`);
    }
  }
});
