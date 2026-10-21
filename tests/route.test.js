import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { angleDelta, clamp } from '../src/core/math.js';
import { createObstacleIndex, penetration } from '../src/core/collision.js';
import { createCarState, stepDriving } from '../src/core/driving.js';
import { ROAD, CAMP_TRAIL, TRACKS, JETTY, GNOMES } from '../src/world/layout.js';
import { headingOf } from '../src/world/path.js';
import { drivingHeight, isDriveable, waterLevel } from '../src/world/terrain.js';
import { buildScenery } from '../src/world/scenery.js';
import { buildBridge } from '../src/world/landmarks/bridge.js';
import { buildTunnel } from '../src/world/landmarks/tunnel.js';
import { buildWaterfall } from '../src/world/landmarks/waterfall.js';
import { buildFarm } from '../src/world/landmarks/farm.js';
import { buildTower } from '../src/world/landmarks/tower.js';
import { buildWindmill } from '../src/world/landmarks/windmill.js';
import { buildJetty } from '../src/world/landmarks/jetty.js';
import { buildHut } from '../src/world/landmarks/hut.js';
import { buildBunkers } from '../src/world/landmarks/bunkers.js';
import { buildRailway } from '../src/world/landmarks/railway.js';
import { buildRoadworks } from '../src/world/landmarks/roadworks.js';
import { buildSummit } from '../src/world/landmarks/summit.js';
import { buildFields } from '../src/world/landmarks/fields.js';
import { createSurfaces } from '../src/world/surfaces.js';
import { LANE } from '../src/vehicles/traffic.js';

// The real trees, rocks, railings, fences, buildings, tunnel walls and cliffs.
const scene = new THREE.Scene();
const { obstacles } = buildScenery(scene);
for (const build of [
  buildBridge,
  buildTunnel,
  buildWaterfall,
  buildFarm,
  buildTower,
  buildWindmill,
  buildJetty,
  buildHut,
  buildBunkers,
  buildRailway,
  buildRoadworks,
  buildSummit,
  buildFields,
]) {
  build(scene, obstacles);
}
obstacles.push(...createSurfaces(scene, {}).obstacles);

const world = {
  obstacles: createObstacleIndex(obstacles),
  dynamic: [],
  surface: () => 'road',
  slope: (x, z, heading) => {
    const dx = -Math.sin(heading) * 1.5;
    const dz = -Math.cos(heading) * 1.5;
    return (drivingHeight(x + dx, z + dz) - drivingHeight(x - dx, z - dz)) / 3;
  },
  isDriveable,
};

/** Steers along a path like a careful driver and reports how far it got. */
function followPath(path, length) {
  const start = path.at(0);
  const car = createCarState({ x: start.x, z: start.z, heading: headingOf(start.dx, start.dz) });
  let progress = 0;
  let lastS = 0;
  for (let step = 0; step < 60 * 400 && progress < length; step++) {
    const near = path.nearest(car.x, car.z);
    if (near.distance > 6) return { progress, stuck: `left the path at s=${progress.toFixed(0)}` };
    // Distance travelled along the path, allowing for the loop wrapping round.
    let delta = near.s - lastS;
    if (path.closed) delta = ((delta + path.length * 1.5) % path.length) - path.length / 2;
    progress += delta;
    lastS = near.s;
    const ahead = path.at(near.s + 7);
    const desired = Math.atan2(-(ahead.x - car.x), -(ahead.z - car.z));
    stepDriving(car, { cruise: true, steer: clamp(angleDelta(car.heading, desired) * 2.5, -1, 1) }, 1 / 60, world);
  }
  return { progress };
}

test('nothing blocks the trail all the way round the loop', () => {
  const result = followPath(ROAD, ROAD.length - 10);
  assert.equal(result.stuck, undefined, result.stuck);
  assert.ok(
    result.progress >= ROAD.length - 10,
    `only reached ${result.progress.toFixed(0)} of ${ROAD.length.toFixed(0)} m`,
  );
});

test('the campsite spur is clear', () => {
  const result = followPath(CAMP_TRAIL, CAMP_TRAIL.length - 4);
  assert.equal(result.stuck, undefined, result.stuck);
  assert.ok(result.progress >= CAMP_TRAIL.length - 4);
});

test('every side track can be driven from end to end', () => {
  for (const track of TRACKS) {
    const result = followPath(track.path, track.path.length - 4);
    assert.equal(result.stuck, undefined, `${track.id}: ${result.stuck}`);
    assert.ok(result.progress >= track.path.length - 4, `${track.id} only reached ${result.progress.toFixed(0)} m`);
  }
});

test('the car can drive from the shore path out to the end of the jetty', () => {
  const out = { x: -Math.sin(JETTY.heading), z: -Math.cos(JETTY.heading) };
  const start = { x: JETTY.x - out.x * 8, z: JETTY.z - out.z * 8 };
  const car = createCarState({ ...start, heading: JETTY.heading });
  for (let step = 0; step < 60 * 12; step++) stepDriving(car, { forward: true }, 1 / 60, world);
  const along = (car.x - JETTY.x) * out.x + (car.z - JETTY.z) * out.z;
  assert.ok(along > JETTY.length - 4, `stopped ${along.toFixed(1)} m along the jetty`);
  assert.ok(along < JETTY.length, 'the railing at the end stops the car');
  assert.ok(drivingHeight(car.x, car.z) > waterLevel(car.x, car.z), 'still on the planks, above the water');
});

test("nothing stands in the other travellers' lanes", () => {
  const index = createObstacleIndex(obstacles);
  for (const p of ROAD.samples) {
    for (const side of [-LANE, LANE]) {
      const x = p.x - p.dz * side;
      const z = p.z + p.dx * side;
      for (const obstacle of index.near(x, z, 4)) {
        assert.equal(penetration(x, z, 1, obstacle), null, `blocked at ${x.toFixed(0)}, ${z.toFixed(0)}`);
      }
    }
  }
});

test('every gnome has room for the car right beside it', () => {
  const index = createObstacleIndex(obstacles);
  for (const gnome of GNOMES) {
    let room = 0;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = gnome.x + Math.cos(a) * 2.6;
      const z = gnome.z + Math.sin(a) * 2.6;
      if (!isDriveable(x, z)) continue;
      if ([...index.near(x, z, 3)].every(obstacle => !penetration(x, z, 1.15, obstacle))) room++;
    }
    assert.ok(room >= 4, `only ${room} spots beside the gnome at ${gnome.x}, ${gnome.z}`);
  }
});
