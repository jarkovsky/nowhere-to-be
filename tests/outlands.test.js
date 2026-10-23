import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OUTER_ROAD, CONNECTORS, RIVERS, TRACKS, rockiness, ROCK_HILL } from '../src/world/layout.js';
import { FORDS, isDriveable, terrainHeight, waterDepth } from '../src/world/terrain.js';
import { OUTER, createTraffic } from '../src/vehicles/traffic.js';

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

test('the convoy of off-roaders drives round the outer road one behind another', () => {
  const traffic = createTraffic(new THREE.Scene(), OUTER);
  const player = { x: 0, z: 0, speed: 0 };
  for (let t = 0; t < 60; t += 0.1) traffic.update(0.1, { player, night: 0 });
  const [lead, second, third] = traffic.getState();
  for (const follower of [second, third]) assert.ok(follower.speed > 5, 'still moving');
  const gap = Math.hypot(lead.x - second.x, lead.z - second.z);
  assert.ok(gap > 6 && gap < 30, `${gap.toFixed(1)} m behind`);
});
