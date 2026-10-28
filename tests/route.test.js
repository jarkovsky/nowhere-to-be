import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { angleDelta, clamp } from '../src/core/math.js';
import { createObstacleIndex, penetration } from '../src/core/collision.js';
import { createCarState, stepDriving } from '../src/core/driving.js';
import { ROAD, CAMP_TRAIL, TRACKS, JETTY, RING_ROAD, ROADWORKS, ORCHARD, ROUGH } from '../src/world/layout.js';
import { chassisPose } from '../src/core/suspension.js';
import { localFrame } from '../src/world/build.js';
import { createPath, headingOf } from '../src/world/path.js';
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
import { buildOrchard } from '../src/world/landmarks/orchard.js';
import { buildLookout } from '../src/world/landmarks/lookout.js';
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
  buildOrchard,
  buildLookout,
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

/**
 * Steers along a path like a careful driver and reports how far it got. A careless one aims
 * `bias` metres to the side of it, and swings that aim `zigzag` metres either way every 6 seconds.
 */
function followPath(path, length, { bias = 0, zigzag = 0 } = {}) {
  const start = path.at(0);
  const car = createCarState({ x: start.x, z: start.z, heading: headingOf(start.dx, start.dz) });
  let progress = 0;
  let lastS = 0;
  const stats = { roll: 0, pitch: 0, off: 0, slowest: Infinity, stopped: 0 };
  let still = 0;
  for (let step = 0; step < 60 * 400 && progress < length; step++) {
    const near = path.nearest(car.x, car.z);
    if (near.distance > 6) return { progress, stuck: `left the path at s=${progress.toFixed(0)}` };
    // Distance travelled along the path, allowing for the loop wrapping round.
    let delta = near.s - lastS;
    if (path.closed) delta = ((delta + path.length * 1.5) % path.length) - path.length / 2;
    progress += delta;
    lastS = near.s;
    const aim = bias + zigzag * Math.sin((step / 60) * ((2 * Math.PI) / 6));
    const ahead = path.offset(near.s + 7, aim);
    const desired = Math.atan2(-(ahead.x - car.x), -(ahead.z - car.z));
    stepDriving(car, { cruise: true, steer: clamp(angleDelta(car.heading, desired) * 2.5, -1, 1) }, 1 / 60, world);
    // How far it leans and tips, how far from the path it strays and how slowly it goes, once under way.
    const pose = chassisPose(car.x, car.z, car.heading, (x, z) => drivingHeight(x, z));
    stats.roll = Math.max(stats.roll, Math.abs(pose.roll));
    stats.pitch = Math.max(stats.pitch, Math.abs(pose.pitch));
    stats.off = Math.max(stats.off, near.distance);
    if (step > 180) stats.slowest = Math.min(stats.slowest, car.speed);
    // How long the car stands still at a stretch.
    still = step > 180 && Math.abs(car.speed) < 0.3 ? still + 1 : 0;
    stats.stopped = Math.max(stats.stopped, still / 60);
  }
  return { progress, ...stats };
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

test('every lane of the orchard can be driven up and down, and along the headland across the top', () => {
  const local = localFrame(ORCHARD.x, ORCHARD.z, ORCHARD.rotation);
  const along = points => createPath(points.map(([lx, lz]) => Object.values(local(lx, lz))));
  const lanes = [-18, -9, 0, 9, 18].flatMap(lx => [
    along([
      [lx, 28],
      [lx, 0],
      [lx, -29],
    ]),
    along([
      [lx, -29],
      [lx, 0],
      [lx, 28],
    ]),
  ]);
  for (const path of [
    ...lanes,
    along([
      [-24, -29.5],
      [0, -29.5],
      [24, -29.5],
    ]),
  ]) {
    const result = followPath(path, path.length - 4);
    assert.equal(result.stuck, undefined, result.stuck);
    assert.ok(
      result.progress >= path.length - 4,
      `only reached ${result.progress.toFixed(0)} of ${path.length.toFixed(0)} m`,
    );
  }
});

test('the rough trail can be driven from end to end in both directions, and the car never tips over or strays', () => {
  const there = ROUGH.path;
  const back = createPath([...ROUGH.points].reverse());
  for (const [way, path] of [
    ['out', there],
    ['back', back],
  ]) {
    const result = followPath(path, path.length - 4);
    assert.equal(result.stuck, undefined, `${way}: ${result.stuck}`);
    assert.ok(
      result.progress >= path.length - 4,
      `${way}: only reached ${result.progress.toFixed(0)} of ${path.length.toFixed(0)} m`,
    );
    // It leans to the side on the slope and in the ruts, and pitches on the climb and the steps, but
    // stays well short of tipping over (the car has no way to roll: it only follows the ground).
    assert.ok(result.roll < 0.45, `${way}: leaned ${result.roll.toFixed(2)} rad`);
    assert.ok(result.pitch < 0.8, `${way}: pitched ${result.pitch.toFixed(2)} rad`);
    assert.ok(result.off < 3.5, `${way}: strayed ${result.off.toFixed(1)} m from the trail`);
    // It slows to a crawl over the steep parts, but never stops.
    assert.ok(result.slowest > 2.2, `${way}: slowed to ${result.slowest.toFixed(1)} m/s`);
  }
});

test('nothing solid stands within the rough trail, or 1.2 m to either side of it', () => {
  for (const obstacle of obstacles) {
    for (const p of ROUGH.path.samples) {
      assert.equal(penetration(p.x, p.z, 3.2, obstacle), null, `blocked at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
    }
  }
});

test('a careless driver, aiming off the rough trail or zig-zagging across it, is never held up', () => {
  const back = createPath([...ROUGH.points].reverse());
  for (const [way, path] of [
    ['out', ROUGH.path],
    ['back', back],
  ]) {
    for (const options of [{ bias: -3 }, { bias: -2 }, { bias: 2 }, { bias: 3 }, { zigzag: 2.5 }]) {
      const result = followPath(path, path.length - 4, options);
      const label = `${way} ${JSON.stringify(options)}`;
      assert.equal(result.stuck, undefined, `${label}: ${result.stuck}`);
      assert.ok(result.progress >= path.length - 4, `${label}: only reached ${result.progress.toFixed(0)} m`);
      assert.ok(result.stopped <= 3, `${label}: stood still for ${result.stopped.toFixed(1)} s`);
    }
  }
});

test('the new road can be driven from the upland road to where the digging is', () => {
  const { path } = ROADWORKS;
  const result = followPath(path, path.length - 4);
  assert.equal(result.stuck, undefined, result.stuck);
  assert.ok(result.progress >= path.length - 4, `only reached ${result.progress.toFixed(0)} m`);
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

test("nothing stands in the other travellers' lanes, on the trail or the upland road", () => {
  const index = createObstacleIndex(obstacles);
  for (const p of [...ROAD.samples, ...RING_ROAD.samples]) {
    for (const side of [-LANE, LANE]) {
      const x = p.x - p.dz * side;
      const z = p.z + p.dx * side;
      for (const obstacle of index.near(x, z, 4)) {
        assert.equal(penetration(x, z, 1, obstacle), null, `blocked at ${x.toFixed(0)}, ${z.toFixed(0)}`);
      }
    }
  }
});
