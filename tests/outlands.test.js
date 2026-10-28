import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OUTER_ROAD, CONNECTORS, RIVERS, TRACKS, rockiness, ROCK_HILL, ROUGH, RUGGED } from '../src/world/layout.js';
import { FORDS, drivingHeight, isDriveable, terrainHeight, waterDepth } from '../src/world/terrain.js';
import { OUTER, createTraffic } from '../src/vehicles/traffic.js';

test('the gravel roads are driveable all the way and never steep', () => {
  for (const path of [OUTER_ROAD, ...CONNECTORS.map(c => c.path)]) {
    for (let s = 10; s <= path.length - (path.closed ? 0 : 10); s += 2) {
      const p = path.at(s);
      const back = path.at(s - 8);
      assert.ok(isDriveable(p.x, p.z), `blocked at ${p.x}, ${p.z}`);
      const grade = Math.abs(drivingHeight(p.x, p.z) - drivingHeight(back.x, back.z)) / 8;
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

test('the rough trail climbs steeply over a ridge to a lookout on the summit and comes down to the road again', () => {
  const { path, lookout, boulders, gully } = ROUGH;
  const height = s => terrainHeight(path.at(s).x, path.at(s).z);
  // It starts and ends on the outer road, and stays inside the rugged sector.
  for (const end of [path.at(0), path.at(path.length)]) assert.ok(OUTER_ROAD.isNear(end.x, end.z, 1), 'on the road');
  for (const { x, z } of path.samples) {
    const angle = ((Math.atan2(z, x) * 180) / Math.PI + 360) % 360;
    assert.ok(angle >= RUGGED.from && angle <= RUGGED.to, `${angle.toFixed(1)} degrees`);
    assert.ok(Math.hypot(x, z) > RUGGED.near && Math.hypot(x, z) < RUGGED.far);
    assert.ok(isDriveable(x, z));
  }
  // The long climb is steep, but never steeper than the car can crawl up at cruise.
  let climb = 0;
  let steepest = 0;
  for (let s = 10; s < path.length; s += 2) {
    const grade = Math.abs(height(s) - height(s - 10)) / 10;
    steepest = Math.max(steepest, grade);
    if (grade > 0.4) climb += 2;
  }
  assert.ok(climb > 80, `only ${climb} m of it is steep`);
  assert.ok(steepest < 0.6, `${steepest.toFixed(2)} at the steepest`);
  // The summit is the top of the trail, over 40 m above the road, and the lookout is level and on it.
  const top = Math.max(...path.samples.map(p => terrainHeight(p.x, p.z)));
  assert.ok(top > height(0) + 40, 'it climbs');
  for (const spot of [lookout, lookout.bench]) {
    assert.ok(Math.abs(terrainHeight(spot.x, spot.z) - terrainHeight(lookout.x, lookout.z)) < 0.3, 'level');
    assert.ok(terrainHeight(spot.x, spot.z) > top - 1, 'at the top');
  }
  // The gully is a dip in the trail, deeper than the rock steps and ruts.
  const middle = gully.path.at(gully.path.length * 0.6);
  const crossing = path.nearest(middle.x, middle.z).s;
  assert.ok(height(crossing) < Math.min(height(crossing - 16), height(crossing + 16)) - 2, 'dips through the gully');
  // Every boulder leaves the car room to pass between it and the trail.
  for (const b of boulders) {
    const gap = path.nearest(b.x, b.z).distance - b.size * 1.05 - 1.15;
    assert.ok(gap > 0.5, `a boulder ${gap.toFixed(2)} m from the car at ${b.x.toFixed(0)}, ${b.z.toFixed(0)}`);
  }
});
