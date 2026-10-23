import test from 'node:test';
import assert from 'node:assert/strict';
import { FJORD, FJORD_VILLAGE, TRACKS, inFjord } from '../src/world/layout.js';
import { isDriveable, terrainHeight, waterDepth, waterLevel } from '../src/world/terrain.js';

test('the fjord is deep water, and the village round its head stands on dry, level ground above it', () => {
  const { head } = FJORD_VILLAGE;
  const out = FJORD.path.at(100);
  assert.ok(inFjord(out.x, out.z));
  assert.ok(waterDepth(out.x, out.z) > 4, 'deep out in the fjord');
  assert.equal(waterLevel(out.x, out.z), FJORD.level);
  assert.ok(!isDriveable(out.x, out.z));
  for (const place of [...FJORD_VILLAGE.houses, ...FJORD_VILLAGE.boathouses, FJORD_VILLAGE.church]) {
    assert.ok(terrainHeight(place.x, place.z) > FJORD.level + 0.5, 'above the water');
    assert.ok(Math.abs(terrainHeight(place.x, place.z) - place.level) < 0.1, 'on its levelled ground');
  }
  assert.ok(waterDepth(head.x, head.z) > 2);
});

test('the road down to the fjord is driveable and no steeper than the hairpins need', () => {
  const { path } = TRACKS.find(track => track.id === 'fjord');
  for (let s = 8; s <= path.length; s += 2) {
    const p = path.at(s);
    const back = path.at(s - 8);
    assert.ok(isDriveable(p.x, p.z), `blocked at ${p.x}, ${p.z}`);
    assert.ok(Math.abs(terrainHeight(p.x, p.z) - terrainHeight(back.x, back.z)) / 8 < 0.3);
  }
  const end = path.at(path.length);
  assert.ok(terrainHeight(end.x, end.z) < FJORD.level + 4, 'it ends by the water');
});
