import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { angleDelta, clamp } from '../src/core/math.js';
import { createObstacleIndex, penetration } from '../src/core/collision.js';
import { createCarState, stepDriving } from '../src/core/driving.js';
import {
  ROAD,
  CAMP_TRAIL,
  TRACKS,
  JETTY,
  RING_ROAD,
  ROADWORKS,
  ORCHARD,
  BRIDGES,
  CROSSINGS,
  RIVERS,
  ROUGH,
  CRASH,
  MINE,
} from '../src/world/layout.js';
import { chassisPose } from '../src/core/suspension.js';
import { localFrame } from '../src/world/build.js';
import { createPath, headingOf } from '../src/world/path.js';
import {
  FORDS,
  drivingHeight,
  isDriveable,
  onDeck,
  wadingDepth,
  waterDepth,
  waterLevel,
} from '../src/world/terrain.js';
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
import { buildFishing } from '../src/world/landmarks/fishing.js';
import { buildCrash } from '../src/world/landmarks/crash.js';
import { buildMine } from '../src/world/landmarks/mine.js';
import { buildLogging } from '../src/world/landmarks/logging.js';
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
  buildFishing,
  buildCrash,
  buildMine,
  buildLogging,
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
 * `watch(car)`, if given, is called after every step, and `inWorld` is the world to drive in.
 */
function followPath(path, length, { bias = 0, zigzag = 0, watch = null, inWorld = world, speed = 0 } = {}) {
  const start = path.at(0);
  const heading = headingOf(start.dx, start.dz);
  const car = createCarState({ x: start.x, z: start.z, heading });
  // Set off already moving, with `speed` metres a second, where the way up to it isn't the point.
  Object.assign(car, { speed, vx: -Math.sin(heading) * speed, vz: -Math.cos(heading) * speed });
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
    stepDriving(car, { cruise: true, steer: clamp(angleDelta(car.heading, desired) * 2.5, -1, 1) }, 1 / 60, inWorld);
    watch?.(car);
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

/** The world as the game has it for water: the tyres in a ford are in water, and on a deck they are on planks. */
const wetWorld = {
  ...world,
  surface: (x, z) => (onDeck(x, z) ? 'road' : waterDepth(x, z) > 0.15 ? 'water' : 'track'),
  waterDepth: wadingDepth,
};

/** A stretch of a road from `from` to `to` metres along it, driven that way (backwards if `to` is less). */
function stretchOf(path, from, to) {
  const points = [];
  const step = Math.sign(to - from) * 2;
  for (let s = from; step > 0 ? s <= to : s >= to; s += step) {
    const p = path.at(s);
    // An open road stops at its ends, and the stretch with it.
    if (!points.length || Math.hypot(p.x - points.at(-1)[0], p.z - points.at(-1)[1]) > 0.5) points.push([p.x, p.z]);
  }
  return createPath(points);
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

/**
 * Drives across a crossing at cruise, in one direction, from far enough back to be up to speed,
 * and reports the slowest it went on the way over, the deepest water it was in, and whether it
 * was ever off the deck while it should have been on it.
 */
function crossAtCruise(crossing, bridge, direction) {
  const { path, s } = crossing;
  const half = bridge ? bridge.length / 2 : crossing.river.halfWidth(crossing.riverS) + 3;
  const run = 40;
  const stretch = stretchOf(path, s - direction * (half + run), s + direction * (half + 30));
  const from = { x: crossing.x, z: crossing.z };
  let slowest = Infinity;
  let deepest = 0;
  let offDeck = null;
  const result = followPath(stretch, stretch.length - 4, {
    inWorld: wetWorld,
    speed: 6,
    watch: car => {
      const between = bridge
        ? Math.abs((car.x - bridge.x) * bridge.dx + (car.z - bridge.z) * bridge.dz) < half - 1
        : Math.hypot(car.x - from.x, car.z - from.z) < half;
      if (!between) return;
      slowest = Math.min(slowest, car.speed);
      deepest = Math.max(deepest, wadingDepth(car.x, car.z));
      if (bridge && !onDeck(car.x, car.z)) offDeck = `${car.x.toFixed(1)}, ${car.z.toFixed(1)}`;
      // Whatever is under it, the wheels are above the water on a bridge.
      if (bridge && drivingHeight(car.x, car.z) < waterLevel(car.x, car.z) + 0.3) offDeck ??= 'in the water';
    },
  });
  return { ...result, slowest, deepest, offDeck };
}

test('every bridge can be driven over at cruise in both directions, and the car stays on the deck', () => {
  const bridged = CROSSINGS.filter(crossing => crossing.style);
  assert.ok(bridged.length >= 5);
  for (const crossing of bridged) {
    const bridge = BRIDGES.find(b => b.path === crossing.path && Math.abs(b.s - crossing.s) < 1);
    for (const direction of [1, -1]) {
      const label = `${bridge.id} (${bridge.style}) ${direction > 0 ? 'forwards' : 'backwards'}`;
      const drive = crossAtCruise(crossing, bridge, direction);
      assert.equal(drive.stuck, undefined, `${label}: ${drive.stuck}`);
      assert.equal(drive.offDeck, null, `${label}: off the deck at ${drive.offDeck}`);
      assert.ok(drive.slowest > 5.7, `${label}: slowed to ${drive.slowest.toFixed(2)} m/s`);
      assert.ok(drive.progress > 60);
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

test('every ford can be driven through at cruise in both directions, in water no deeper than 0.45 m', () => {
  assert.ok(FORDS.length >= 5);
  for (const ford of FORDS) {
    const crossing = CROSSINGS.find(c => c.path === ford.path && Math.abs(c.s - ford.s) < 3);
    for (const direction of [1, -1]) {
      const label = `${ford.river.id} ford at ${ford.x.toFixed(0)}, ${ford.z.toFixed(0)} ${direction > 0 ? 'forwards' : 'backwards'}`;
      const drive = crossAtCruise({ ...crossing, river: ford.river, riverS: ford.riverS }, null, direction);
      assert.equal(drive.stuck, undefined, `${label}: ${drive.stuck}`);
      assert.ok(drive.deepest > 0.1, `${label}: it really is a ford`);
      assert.ok(drive.deepest < 0.45, `${label}: ${drive.deepest.toFixed(2)} m deep`);
      assert.ok(drive.slowest > 5.7, `${label}: slowed to ${drive.slowest.toFixed(2)} m/s`);
    }
  }
  assert.ok(RIVERS.length >= 3);
});

test('the fishing hut can be reached along its track', () => {
  const { path } = TRACKS.find(track => track.id === 'fishing');
  const result = followPath(path, path.length - 4, { inWorld: wetWorld });
  assert.equal(result.stuck, undefined, result.stuck);
});

test('the tracks to the plane, the mine and the logging camp can be driven there and back at cruise speed', () => {
  for (const id of ['crash', 'mine', 'logging']) {
    const { path } = TRACKS.find(track => track.id === id);
    const back = createPath(path.samples.map(p => [p.x, p.z]).reverse());
    for (const [way, route] of [
      ['there', path],
      ['back', back],
    ]) {
      const result = followPath(route, route.length - 4);
      assert.equal(result.stuck, undefined, `${id} ${way}: ${result.stuck}`);
      assert.ok(result.progress >= route.length - 4, `${id} ${way}: only reached ${result.progress.toFixed(0)} m`);
      assert.ok(result.slowest > 5.3, `${id} ${way}: slowed to ${result.slowest.toFixed(1)} m/s`);
    }
  }
});

test('the car cannot drive into the mine, nor through the wrecked plane', () => {
  /** Drives at `to` from `from` for a while at cruise speed, and says how close it got. */
  const driveAt = (from, to) => {
    const car = createCarState({ ...from, heading: Math.atan2(-(to.x - from.x), -(to.z - from.z)) });
    let nearest = Infinity;
    for (let step = 0; step < 60 * 12; step++) {
      stepDriving(car, { cruise: true }, 1 / 60, world);
      nearest = Math.min(nearest, Math.hypot(car.x - to.x, car.z - to.z));
    }
    return { car, nearest };
  };
  // Down the middle of the yard into the mouth, which is boarded up a metre inside it.
  const mine = localFrame(MINE.x, MINE.z, MINE.rotation);
  const yard = driveAt(mine(0, 14), mine(0, -3));
  const inside = (yard.car.x - MINE.x) * Math.sin(MINE.rotation) + (yard.car.z - MINE.z) * Math.cos(MINE.rotation);
  assert.ok(inside > 0.3, `got ${(-inside).toFixed(1)} m into the mine`);
  // At the plane's middle from each side, and at its tail from behind.
  const plane = localFrame(CRASH.x, CRASH.z, CRASH.rotation);
  for (const [name, from, to] of [
    ['the left', plane(-9, 0.4), plane(0, 0.4)],
    ['the right', plane(10, 0.4), plane(0, 0.4)],
    ['behind', plane(0, -12), plane(0, 0)],
  ]) {
    const { nearest } = driveAt(from, to);
    assert.ok(nearest > 0.5, `drove into the plane from ${name}, to ${nearest.toFixed(1)} m of its middle`);
  }
  // And the loose wing and the tail are solid too.
  const wing = driveAt(plane(-9, -8), { x: CRASH.wing.x, z: CRASH.wing.z });
  assert.ok(wing.nearest > 0.5, 'drove through the loose wing');
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
