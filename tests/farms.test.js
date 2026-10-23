import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OUTER_ROAD, FARMS, HERDS, VILLAGE, PONDS, TRACKS } from '../src/world/layout.js';
import { isDriveable, waterDepth, waterLevel, pondLevel } from '../src/world/terrain.js';
import { createHerds } from '../src/world/herds.js';

test('farm animals stay in their paddocks, and wild ones keep to dry ground', () => {
  for (const farm of FARMS) {
    assert.ok(HERDS.some(herd => Math.hypot(herd.x - farm.paddock.x, herd.z - farm.paddock.z) < 1));
    assert.ok(TRACKS.some(track => track.id === `farm-${farm.id}`));
  }
  for (const herd of HERDS) assert.ok(waterDepth(herd.x, herd.z) === 0, `${herd.kind} start in water`);
});

test('herds run from a car that comes close, and from a honk, and settle within their patch', () => {
  const herds = createHerds(new THREE.Scene());
  const herd = HERDS.findIndex(h => h.kind === 'horse');
  const { x, z, radius } = HERDS[herd];
  const animals = () => herds.getState()[herd].animals;
  // Let them settle, with the car far away.
  const away = { x: x + 400, z, speed: 0 };
  for (let t = 0; t < 30; t += 0.1) herds.update(0.1, away);
  // A car drives right up to the first one.
  const first = animals()[0];
  const car = { x: first.x + 3, z: first.z, speed: 5 };
  for (let t = 0; t < 1.1; t += 0.1) herds.update(0.1, car);
  assert.ok(animals()[0].speed > 2, 'it runs');
  for (let t = 0; t < 20; t += 0.1) herds.update(0.1, car);
  for (const animal of animals())
    assert.ok(Math.hypot(animal.x - x, animal.z - z) <= radius + 0.01, 'inside the fence');
  assert.deepEqual(herds.hearHorn(x, z), ['neigh']);
  assert.deepEqual(herds.hearHorn(x + 900, z), []);
});

test('the village pond holds water, and the village has its fire station', () => {
  for (const pond of PONDS) {
    assert.ok(waterDepth(pond.x, pond.z) > 0.6);
    assert.equal(waterLevel(pond.x, pond.z), pondLevel(pond));
  }
  const { fireStation } = VILLAGE;
  assert.ok(isDriveable(fireStation.x, fireStation.z));
  assert.ok(OUTER_ROAD.nearest(fireStation.x, fireStation.z).distance < 25, 'by the road');
});
