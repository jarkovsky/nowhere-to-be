import test from 'node:test';
import assert from 'node:assert/strict';
import { PARKED, wayOut } from '../src/world/access.js';

test('every parked vehicle can drive out to the roads without crossing grass', () => {
  const stranded = PARKED.filter(spot => wayOut(spot.x, spot.z) === Infinity).map(spot => spot.name);
  assert.deepEqual(stranded, []);
});
