import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTER_ROAD, CONNECTORS, RIVERS, TRACKS, rockiness, ROCK_HILL } from '../src/world/layout.js';
import { FORDS, isDriveable, terrainHeight, waterDepth } from '../src/world/terrain.js';

test('the gravel roads are driveable all the way and never steep', () => {
  for (const path of [OUTER_ROAD, ...CONNECTORS.map(c => c.path)]) {
    for (let s = 10; s <= path.length - (path.closed ? 0 : 10); s += 2) {
      const p = path.at(s);
      const back = path.at(s - 8);
      assert.ok(isDriveable(p.x, p.z), `blocked at ${p.x}, ${p.z}`);
      const grade = Math.abs(terrainHeight(p.x, p.z) - terrainHeight(back.x, back.z)) / 8;
      assert.ok(grade < 0.2, `${grade.toFixed(2)} steep at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
    }
  }
});

test('wherever a road crosses a river it fords it through shallow water', () => {
  assert.ok(FORDS.length >= RIVERS.length, 'every river is crossed somewhere');
  for (const ford of FORDS) {
    const depth = waterDepth(ford.x, ford.z);
    assert.ok(depth > 0.15 && depth < 0.5, `${depth.toFixed(2)} m deep at ${ford.x.toFixed(0)}, ${ford.z.toFixed(0)}`);
    assert.ok(isDriveable(ford.x, ford.z));
  }
  // Away from the fords, the middle of a river is too deep to drive through.
  const river = RIVERS[0];
  const middle = river.path.at(river.path.length / 2);
  if (!FORDS.some(f => Math.hypot(f.x - middle.x, f.z - middle.z) < 20))
    assert.ok(waterDepth(middle.x, middle.z) > 0.5);
});

test('the rocky hill is all rock, with a track to its top', () => {
  assert.equal(rockiness(ROCK_HILL.x, ROCK_HILL.z), 1);
  const { path } = TRACKS.find(track => track.id === 'rockhill');
  const top = path.at(path.length);
  assert.ok(terrainHeight(top.x, top.z) > terrainHeight(path.at(0).x, path.at(0).z) + 25, 'it climbs');
  for (const p of path.samples) assert.ok(isDriveable(p.x, p.z));
});
