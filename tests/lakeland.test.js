import './dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createObstacleIndex, penetration } from '../src/core/collision.js';
import { VEHICLES } from '../src/core/journal.js';
import { createRide, fitRide, stepRide } from '../src/core/ride.js';
import { createCar } from '../src/vehicles/car.js';
import { createDrivingWorld } from '../src/world/drivable.js';
import { buildLandmarks } from '../src/world/landmarks/index.js';
import {
  GRAVEL_HALF_WIDTH,
  HERDS,
  LAKELAND,
  OUTER_ROAD,
  RIVERS,
  SPANS,
  TRACKS,
  VALLEY_RADIUS,
  inLakeland,
  insideFence,
} from '../src/world/layout.js';
import { createPath, headingOf } from '../src/world/path.js';
import { buildScenery } from '../src/world/scenery.js';
import {
  drivingHeight,
  onDeck,
  spanHeight,
  terrainHeight,
  wadingDepth,
  waterDepth,
  waterLevel,
} from '../src/world/terrain.js';
import { steerTowards } from './helpers.js';

// The whole world, with everything solid in it.
const scene = new THREE.Scene();
const scenery = buildScenery(scene);
const obstacles = [...scenery.obstacles];
const landmarks = buildLandmarks(scene, obstacles);
const solid = createObstacleIndex(obstacles);

const STEP = 1 / 60;
const [gate, causeway, trestle] = SPANS;
const tracks = TRACKS.filter(track => track.land);
const shore = tracks.find(track => track.id === 'lakeshore').path;
const gorge = tracks.find(track => track.id === 'gorge').path;
/** The road in and every track, by name. */
const ways = [['road', LAKELAND.road], ...tracks.map(track => [track.id, track.path])];

/** A path the other way round. */
const back = path => createPath(path.samples.map(p => [p.x, p.z]).reverse());
/** The stretch of a path from `from` to `to` metres along it, as a path of its own. */
function stretch(path, from, to) {
  const points = [];
  for (let s = Math.max(0, from); s <= Math.min(path.length, to); s += 2) points.push([path.at(s).x, path.at(s).z]);
  return createPath(points);
}

const model = createCar();
/**
 * Drives a vehicle from the garage along `path` at cruise with the game's own step, in the world
 * as it is. A careless driver aims `bias` metres to one side, and swings `zigzag` metres either
 * way. Reports how far it got, the longest it stood still, and `watch(car, s)` is called every step.
 */
function drive(path, { name = 'offroader', bias = 0, zigzag = 0, watch = null } = {}) {
  model.customize('orange', [], name);
  const start = path.at(2);
  const wheels = model.spec.wheels.map(wheel => ({ ...wheel }));
  const ride = fitRide(createRide({ x: start.x, z: start.z, heading: headingOf(start.dx, start.dz) }), name, wheels, {
    ...model.size,
  });
  const car = ride.state;
  const world = createDrivingWorld(car, { obstacles: solid, cropAt: landmarks.cropAt });
  car.y = drivingHeight(car.x, car.z, Infinity);
  stepRide(ride, {}, STEP, world, { held: true });
  const held = {};
  const length = path.length - 5;
  let [reached, still, stopped] = [2, 0, 0];
  for (let i = 0; i < 60 * 600 && reached < length; i++) {
    const near = path.nearest(car.x, car.z);
    if (near.distance > 7) return { problem: `left the way ${reached.toFixed(0)} m along`, reached, stopped };
    reached = Math.max(reached, near.s);
    const aim = bias + zigzag * Math.sin((i / 60) * ((2 * Math.PI) / 6));
    const ahead = path.offset(near.s + 7, aim);
    const desired = Math.atan2(-(ahead.x - car.x), -(ahead.z - car.z));
    stepRide(ride, { cruise: true, steer: steerTowards(car, desired, held) }, STEP, world);
    still = i > 180 && Math.abs(car.speed) < 0.3 ? still + 1 : 0;
    stopped = Math.max(stopped, still / 60);
    if (stopped > 4) return { problem: `held up ${reached.toFixed(0)} m along`, reached, stopped };
    watch?.(car, near.s);
  }
  return {
    problem: reached < length ? `only got ${reached.toFixed(0)} of ${length.toFixed(0)} m` : null,
    reached,
    stopped,
  };
}

test('the lakeland lies beyond the valley, joined to it over the pass, with all of it inside the fence', () => {
  const apart = Math.hypot(LAKELAND.x, LAKELAND.z);
  assert.ok(apart > VALLEY_RADIUS + 100, 'its middle is well outside the valley');
  assert.ok(apart < VALLEY_RADIUS + LAKELAND.radius - 20, 'the two fences run into each other');
  const start = LAKELAND.road.at(0);
  assert.ok(OUTER_ROAD.nearest(start.x, start.z).distance < 1, 'its road leaves the outer road');
  assert.ok(Math.hypot(start.x, start.z) < VALLEY_RADIUS && !inLakeland(start.x, start.z));
  for (const [name, path] of ways) {
    for (const p of path.samples) assert.ok(insideFence(p.x, p.z, 8), `${name} at ${p.s.toFixed(0)} m`);
  }
  const { hamlet, castle, crag, square, falls } = LAKELAND;
  for (const place of [...hamlet.houses, hamlet.boathouse, castle, crag, square, falls]) {
    assert.ok(inLakeland(place.x, place.z, 30), `${place.x.toFixed(0)}, ${place.z.toFixed(0)}`);
  }
});

test('its road and tracks climb gently and lie level from side to side', () => {
  for (const [name, path] of ways) {
    // The road is on its bridge over the gorge; the gorge track is down under it.
    const height = (x, z) => drivingHeight(x, z, name === 'road' ? Infinity : -Infinity);
    for (let s = 3; s < path.length - 9; s += 1) {
      const [a, b] = [path.at(s), path.at(s + 6)];
      const grade = Math.abs(height(b.x, b.z) - height(a.x, a.z)) / 6;
      assert.ok(grade < 0.22, `${name} climbs ${grade.toFixed(2)} at ${s} m`);
      const lean = Math.abs(height(a.x - a.dz * 1.2, a.z + a.dx * 1.2) - height(a.x + a.dz * 1.2, a.z - a.dx * 1.2));
      assert.ok(lean / 2.4 < 0.26, `${name} leans ${(lean / 2.4).toFixed(2)} at ${s} m`);
    }
  }
});

test('the lake is still water round a dry island, and the bar across the narrows is shallow enough to wade', () => {
  const { level, castle, shallows } = LAKELAND;
  const out = causeway.deck.at(causeway.length / 2);
  assert.equal(waterLevel(out.x, out.z), level);
  assert.ok(level - terrainHeight(out.x, out.z) > 1.5, 'the lake is deep under the causeway');
  assert.ok(terrainHeight(castle.x, castle.z) > level + 4, 'the knoll stands well above the water');
  const length = Math.hypot(shallows.to.x - shallows.from.x, shallows.to.z - shallows.from.z);
  const [dx, dz] = [(shallows.to.x - shallows.from.x) / length, (shallows.to.z - shallows.from.z) / length];
  let wet = 0;
  for (let along = 0; along <= length; along += 2) {
    const [x, z] = [shallows.from.x + dx * along, shallows.from.z + dz * along];
    const depth = level - terrainHeight(x, z);
    assert.ok(depth < 0.4, `the bar is ${depth.toFixed(2)} m under ${along} m along`);
    assert.ok(wadingDepth(x, z) < 0.4);
    if (depth > 0.1) wet++;
  }
  assert.ok(wet * 2 > 40, `${wet * 2} m of it is under water`);
  // Off the bar, a little way to either side of its middle, the water is deep.
  for (const side of [-18, 18]) {
    const [x, z] = [shallows.from.x + dx * (length / 2) - dz * side, shallows.from.z + dz * (length / 2) + dx * side];
    assert.ok(level - terrainHeight(x, z) > 1, `deep water ${side} m off the bar`);
  }
  // The shore track is what wades it.
  const middle = [shallows.from.x + dx * (length / 2), shallows.from.z + dz * (length / 2)];
  assert.ok(shore.nearest(...middle).distance < 2);
});

test('the causeway and the trestle bridge stand in the lake, clear of the water, and meet the track at both ends', () => {
  for (const span of [causeway, trestle]) {
    const middle = span.deck.at(span.length / 2);
    assert.ok(LAKELAND.level - terrainHeight(middle.x, middle.z) > 1.5, `${span.id} is over deep water`);
    assert.ok(span.length > 50, `${span.id} is ${span.length.toFixed(0)} m long`);
    for (let s = 0; s <= span.length; s += 1) {
      const p = span.deck.at(s);
      assert.ok(onDeck(p.x, p.z), `${span.id} at ${s} m`);
      assert.ok(spanHeight(p.x, p.z) > LAKELAND.level + 0.5, `${span.id} is clear of the water at ${s} m`);
      assert.equal(wadingDepth(p.x, p.z), 0);
    }
    for (const end of [0, span.length]) {
      const p = span.deck.at(end);
      assert.ok(
        Math.abs(spanHeight(p.x, p.z) - terrainHeight(p.x, p.z)) < 0.25,
        `${span.id} meets the ground at ${end} m`,
      );
      assert.ok(terrainHeight(p.x, p.z) > LAKELAND.level + 0.3, `${span.id} ends on dry land`);
    }
  }
  const [end, top] = [trestle.deck.at(0), trestle.deck.at(trestle.length / 2)];
  assert.ok(spanHeight(top.x, top.z) - spanHeight(end.x, end.z) > 1.5, 'the trestle bridge rises in the middle');
});

test('the stone bridge carries the road high over the gorge, and the beck and its track pass under it', () => {
  const middle = gate.deck.at(gate.length / 2);
  const deck = spanHeight(middle.x, middle.z);
  const floor = terrainHeight(middle.x, middle.z);
  assert.ok(deck - floor > 8, `the deck is ${(deck - floor).toFixed(1)} m over the gorge`);
  // Up on the road the deck is the ground; down in the gorge the floor is.
  assert.equal(drivingHeight(middle.x, middle.z, deck), deck);
  assert.equal(drivingHeight(middle.x, middle.z, floor + 1), floor);
  assert.ok(onDeck(middle.x, middle.z, deck) && !onDeck(middle.x, middle.z, floor + 1));
  const beck = RIVERS.at(-1).path;
  assert.ok(beck.nearest(middle.x, middle.z).distance < 6, 'the beck runs under the middle of it');
  const under = gorge.nearest(middle.x, middle.z);
  assert.ok(under.distance < 11, `the track is ${under.distance.toFixed(1)} m from the middle of the arch`);
  // Its parapets stop what is on the deck, and nothing down on the track.
  for (let s = under.s - 25; s <= under.s + 25; s += 1) {
    const p = gorge.at(s);
    const level = terrainHeight(p.x, p.z);
    for (const obstacle of solid.near(p.x, p.z, 4)) {
      if (obstacle.base !== undefined && level + 1 <= obstacle.base) continue;
      assert.equal(penetration(p.x, p.z, 2.2, obstacle), null, `something stands on the track ${s.toFixed(0)} m along`);
    }
  }
});

test('its herds wander on dry, gentle ground inside the fence', () => {
  const herds = HERDS.filter(herd => inLakeland(herd.x, herd.z));
  assert.deepEqual(herds.map(herd => herd.kind).sort(), ['boar', 'deer', 'moose']);
  for (const { kind, x, z, radius } of herds) {
    assert.ok(inLakeland(x, z, radius + 30), `the ${kind} keep well inside the fence`);
    for (let dx = -radius; dx <= radius; dx += 3) {
      for (let dz = -radius; dz <= radius; dz += 3) {
        if (Math.hypot(dx, dz) > radius) continue;
        const [px, pz] = [x + dx, z + dz];
        assert.equal(waterDepth(px, pz), 0, `the ${kind}' patch is dry at (${px.toFixed(0)}, ${pz.toFixed(0)})`);
        const rise = Math.hypot(
          terrainHeight(px + 2, pz) - terrainHeight(px, pz),
          terrainHeight(px, pz + 2) - terrainHeight(px, pz),
        );
        assert.ok(rise / 2 < 0.4, `the ${kind}' patch is gentle at (${px.toFixed(0)}, ${pz.toFixed(0)})`);
        assert.equal(spanHeight(px, pz), null, `the ${kind} keep off the bridges`);
      }
    }
  }
});

test('the gorge has steep walls but no cliffs, and a car driven at them from its floor is stopped, not thrown', () => {
  const beck = RIVERS.at(-1).path;
  // Nowhere a car can get to does the ground rise more than three metres in one: the beck's banks
  // are not cut into the foot of the walls.
  let steepest = { rise: 0 };
  for (let x = LAKELAND.x - LAKELAND.radius; x <= LAKELAND.x + LAKELAND.radius; x += 3) {
    for (let z = LAKELAND.z - LAKELAND.radius; z <= LAKELAND.z + LAKELAND.radius; z += 3) {
      if (!inLakeland(x, z) || waterDepth(x, z) > 0.9) continue;
      const h = terrainHeight(x, z);
      const rise = Math.max(Math.abs(terrainHeight(x + 1, z) - h), Math.abs(terrainHeight(x, z + 1) - h));
      if (rise > steepest.rise) steepest = { rise, x, z };
    }
  }
  assert.ok(steepest.rise < 3.2, `a rise of ${steepest.rise.toFixed(1)} in one at (${steepest.x}, ${steepest.z})`);

  // From one side of the floor, across the beck and at the wall, at cruising speed and flat out.
  for (const name of ['offroader', 'racer']) {
    model.customize('orange', [], name);
    const wheels = model.spec.wheels.map(wheel => ({ ...wheel }));
    for (const input of [{ cruise: true, cruiseSpeed: 6 }, { forward: true }]) {
      for (let s = 30; s <= LAKELAND.mouth - 70; s += 40) {
        const p = beck.at(s);
        for (const side of [-1, 1]) {
          const to = { x: -p.dz * side, z: p.dx * side };
          const spawn = { x: p.x - to.x * 7, z: p.z - to.z * 7, heading: headingOf(to.x, to.z) };
          const ride = fitRide(createRide(spawn), name, wheels, { ...model.size });
          const world = createDrivingWorld(ride.state, { obstacles: solid, cropAt: landmarks.cropAt });
          ride.state.y = drivingHeight(spawn.x, spawn.z);
          stepRide(ride, {}, STEP, world, { held: true });
          let [air, off] = [0, 0];
          for (let i = 0; i < 60 * 8; i++) {
            stepRide(ride, input, STEP, world);
            air = Math.max(air, ride.chassis.air);
            off = Math.max(off, ride.state.y - terrainHeight(ride.state.x, ride.state.z));
          }
          const where = `the ${name} ${input.cruise ? 'at cruising speed' : 'flat out'}, ${s} m down the beck`;
          assert.ok(air < 0.5 && off < 1.5, `${where}: ${air.toFixed(1)} s in the air, ${off.toFixed(1)} m up`);
        }
      }
    }
  }
});

test('nothing gets under the ends of the stone bridge, into its stonework or up through its road', () => {
  // Where the bank comes up to within a car's height of the arch, something solid from the ground
  // up stands over it: along the middle of the deck and along both parapets.
  const step = 0.5;
  let covered = 0;
  for (let s = 0; s <= gate.length; s += step) {
    for (const side of [-gate.width / 2, 0, gate.width / 2]) {
      const at = gate.deck.at(s);
      const [x, z] = [at.x - at.dz * side, at.z + at.dx * side];
      const ground = terrainHeight(x, z);
      const deck = spanHeight(x, z);
      if (deck === null || deck - ground > 3 || deck - ground < 1.6) continue;
      // Something down on the bank here, too far below the road to be on it.
      const blocked = [...solid.near(x, z, 1, ground)].some(
        obstacle => obstacle.base === undefined && penetration(x, z, 0.5, obstacle),
      );
      assert.ok(blocked, `nothing stops a car on the bank under the deck ${s.toFixed(1)} m along it`);
      covered++;
    }
  }
  assert.ok(covered > 6, 'the bank comes up under both ends of the bridge');
  // And where there is room under the arch, nothing does: the beck and the track run through.
  const under = gorge.nearest(gate.x, gate.z).sample;
  assert.ok(spanHeight(under.x, under.z) - terrainHeight(under.x, under.z) > 8);
  assert.equal(
    [...solid.near(under.x, under.z, 2, terrainHeight(under.x, under.z))].some(obstacle =>
      penetration(under.x, under.z, 2, obstacle),
    ),
    false,
  );
});

test('no tree or rock of the lakeland stands on its fence or within 6 m inside it', () => {
  // Round the fence, wherever the land is its own and not the pass into the valley.
  let checked = 0;
  for (const obstacle of scenery.obstacles) {
    if (obstacle.x === undefined || obstacle.climb) continue;
    const beyond = Math.hypot(obstacle.x - LAKELAND.x, obstacle.z - LAKELAND.z) - LAKELAND.radius;
    if (beyond < -40 || beyond > 5 || Math.hypot(obstacle.x, obstacle.z) < VALLEY_RADIUS + 30) continue;
    checked++;
    assert.ok(
      beyond + obstacle.radius < -5.5,
      `at ${obstacle.x.toFixed(0)}, ${obstacle.z.toFixed(0)}, ${-beyond.toFixed(1)} m inside the fence`,
    );
  }
  assert.ok(checked > 20);
});

test('nothing solid stands on the road or the tracks of the lakeland', () => {
  for (const [name, path] of ways) {
    // A track's band is as wide as the causeway is between its logs.
    const half = name === 'road' ? GRAVEL_HALF_WIDTH : 2;
    for (let s = 0; s <= path.length; s += 1) {
      const p = path.at(s);
      const level = drivingHeight(p.x, p.z, name === 'road' ? Infinity : -Infinity);
      for (const obstacle of solid.near(p.x, p.z, half + 2)) {
        // What stands above or below the way is not on it, and boulders in a stream bed are driven over.
        if (obstacle.base !== undefined && level + 1 <= obstacle.base) continue;
        if (obstacle.top !== undefined && level >= obstacle.top) continue;
        if (obstacle.climb) continue;
        assert.equal(penetration(p.x, p.z, half, obstacle), null, `${name}: blocked ${s} m along`);
      }
    }
  }
});

test('the off-roader drives the road and every track of the lakeland both ways without being held up', () => {
  const deck = spanHeight(gate.x, gate.z);
  for (const [name, path] of ways) {
    for (const [way, route] of [
      ['out', path],
      ['back', back(path)],
    ]) {
      let nearest = Infinity;
      let level = null;
      const run = drive(route, {
        watch(car) {
          const apart = Math.hypot(car.x - gate.x, car.z - gate.z);
          if (apart < nearest) [nearest, level] = [apart, car.y];
        },
      });
      assert.equal(run.problem, null, `${name} ${way}: ${run.problem}`);
      assert.ok(run.stopped < 1.5, `${name} ${way}: stood still for ${run.stopped.toFixed(1)} s`);
      // Over the gorge on the road, and under the bridge on the gorge track.
      if (name === 'road') assert.ok(Math.abs(level - deck) < 0.8, `on the bridge at ${level.toFixed(1)} m`);
      if (name === 'gorge') assert.ok(level < deck - 8, `under the bridge at ${level.toFixed(1)} m`);
    }
  }
});

test('every vehicle in the garage crosses the stone bridge, the causeway and the trestle bridge', () => {
  const routes = [
    ['the stone bridge', stretch(LAKELAND.road, gate.from - 40, gate.to + 40)],
    ['the causeway and the trestle bridge', stretch(shore, 0, trestle.to + 25)],
  ];
  for (const name of VEHICLES) {
    for (const [label, route] of routes) {
      const run = drive(route, { name });
      assert.equal(run.problem, null, `${name} over ${label}: ${run.problem}`);
      assert.ok(run.stopped < 1.5, `${name} over ${label}: stood still for ${run.stopped.toFixed(1)} s`);
    }
  }
});

test('a careless driver is steered on to the bridges and never ends up in the lake', () => {
  const routes = [stretch(LAKELAND.road, gate.from - 40, gate.to + 40), stretch(shore, 0, trestle.to + 25)];
  for (const route of [...routes, ...routes.map(back)]) {
    for (const options of [{ bias: -1.5 }, { bias: 1.5 }, { bias: -2.2 }, { bias: 2.2 }, { zigzag: 1.5 }]) {
      let deepest = 0;
      const run = drive(route, {
        ...options,
        watch: car => (deepest = Math.max(deepest, wadingDepth(car.x, car.z, car.y))),
      });
      const label = JSON.stringify(options);
      assert.equal(run.problem, null, `${label}: ${run.problem}`);
      assert.ok(run.stopped < 2, `${label}: stood still for ${run.stopped.toFixed(1)} s`);
      assert.ok(deepest < 0.4, `${label}: in ${deepest.toFixed(1)} m of water`);
    }
  }
});
