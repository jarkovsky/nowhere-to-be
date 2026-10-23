import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChaseCamera } from '../src/core/camera.js';
import { LOOK_TIME, createLookout } from '../src/core/lookout.js';
import { PLACES, ROAD, ROAD_HALF_WIDTH, TRAILS } from '../src/world/layout.js';
import { isDriveable, terrainHeight } from '../src/world/terrain.js';
import { BEND, BEND_GAP, MARK_GAP, SIGNPOST_AT, buildWaymarks, turnAt } from '../src/world/landmarks/waymarks.js';

const built = buildWaymarks(new THREE.Scene(), []);
const views = TRAILS.map(trail => trail.view);
const ahead = (view, d) => ({ x: view.x - Math.sin(view.heading) * d, z: view.z - Math.cos(view.heading) * d });

test('each trail has its own colour and starts at a signpost beside the main trail', () => {
  assert.ok(TRAILS.length >= 3);
  assert.equal(new Set(TRAILS.map(trail => trail.color)).size, TRAILS.length);
  // The red trail up to the hut is marked by the hut, so it is not here again.
  assert.ok(!TRAILS.some(trail => trail.id === 'red'));
  for (const { id, path } of TRAILS) {
    const start = path.at(0);
    assert.ok(ROAD.nearest(start.x, start.z).distance < ROAD_HALF_WIDTH, `${id} leaves the main trail`);
    const { signpost } = built.find(trail => trail.id === id);
    const fromTrail = ROAD.nearest(signpost.x, signpost.z).distance;
    assert.ok(fromTrail > ROAD_HALF_WIDTH + 1.5 && fromTrail < 16, `${id}'s signpost is ${fromTrail.toFixed(1)} m out`);
  }
});

test('the marks come every 30 m or so, and at every bend', () => {
  for (const { id, path, marks } of built.map(trail => ({
    ...trail,
    path: TRAILS.find(t => t.id === trail.id).path,
  }))) {
    const along = [SIGNPOST_AT, ...marks.map(mark => mark.s), path.length];
    for (let i = 1; i < along.length; i++) {
      const gap = along[i] - along[i - 1];
      assert.ok(gap <= MARK_GAP + 0.5, `${id}: ${gap} m without a mark at s=${along[i - 1]}`);
      if (i > 1 && i < along.length - 1) assert.ok(gap >= BEND_GAP, `${id}: marks only ${gap} m apart`);
    }
    for (let s = SIGNPOST_AT + 8; s < path.length - 6; s++) {
      if (Math.abs(turnAt(path, s)) < BEND) continue;
      assert.ok(
        marks.some(mark => Math.abs(mark.s - s) <= BEND_GAP),
        `${id}: no mark near the bend at s=${s}`,
      );
    }
    for (const mark of marks) {
      const beside = path.nearest(mark.x, mark.z).distance;
      assert.ok(beside > 2 && beside < 3, `${id}: a post ${beside.toFixed(1)} m from the path`);
      assert.ok(isDriveable(mark.x, mark.z) && !ROAD.isNear(mark.x, mark.z, ROAD_HALF_WIDTH + 0.5));
    }
  }
});

test('each trail ends at a viewpoint that looks out over lower ground, marked on the map', () => {
  for (const { id, path, view } of TRAILS) {
    const end = path.at(path.length);
    const fromEnd = Math.hypot(end.x - view.x, end.z - view.z);
    assert.ok(fromEnd > 3 && fromEnd < 10, `${id}'s path ends ${fromEnd.toFixed(1)} m from its viewpoint`);
    const height = terrainHeight(view.x, view.z);
    for (const d of [30, 60]) {
      const out = ahead(view, d);
      assert.ok(terrainHeight(out.x, out.z) < height - 2, `${id} looks out at a hill ${d} m away`);
    }
    // Higher than the main trail where it leaves it.
    const start = path.at(0);
    assert.ok(height > terrainHeight(start.x, start.z) + 10, `${id} hardly climbs`);
    assert.ok(PLACES.some(place => place.id === `view-${id}` && place.x === view.x && place.z === view.z));
  }
});

test('the paths up the trails stay gentle', () => {
  for (const { id, path } of TRAILS) {
    // From the signpost on: where it leaves the main trail, it runs over the trail's own shoulder.
    for (let s = SIGNPOST_AT + 6; s <= path.length - 2; s += 2) {
      const a = path.at(s - 2);
      const b = path.at(s + 2);
      const grade = Math.abs(terrainHeight(b.x, b.z) - terrainHeight(a.x, a.z)) / Math.hypot(b.x - a.x, b.z - a.z);
      assert.ok(grade < 0.26, `${id} climbs at ${grade.toFixed(2)} at s=${s}`);
      const p = path.at(s);
      const tilt = Math.abs(terrainHeight(p.x + p.dz, p.z - p.dx) - terrainHeight(p.x - p.dz, p.z + p.dx)) / 2;
      assert.ok(tilt < 0.2, `${id} tilts by ${tilt.toFixed(2)} at s=${s}`);
    }
  }
});

/** Drives a pretend car along `points` at `speed`, stepping the lookout, and records what it watched. */
function drive(lookout, points, { speed = 7, dt = 1 / 30, stay = 0 } = {}) {
  const car = { x: points[0].x, z: points[0].z };
  const watched = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0; d < length; d += speed * dt) {
      Object.assign(car, { x: a.x + ((b.x - a.x) * d) / length, z: a.z + ((b.z - a.z) * d) / length });
      lookout.step(car, dt);
      watched.push(lookout.watch());
    }
  }
  for (let t = 0; t < stay; t += dt) {
    lookout.step(car, dt);
    watched.push(lookout.watch());
  }
  return watched;
}

const alongTrail = trail => {
  const points = [];
  for (let s = 0; s <= trail.path.length; s += 4) points.push(trail.path.at(s));
  return points;
};

test('arriving at a viewpoint looks out at the view for a few seconds, once a visit', () => {
  for (const trail of TRAILS) {
    const lookout = createLookout(views);
    const points = alongTrail(trail);
    // Nothing on the way up, until the car comes up to the viewpoint.
    const near = points.findIndex(p => Math.hypot(p.x - trail.view.x, p.z - trail.view.z) < 16);
    assert.equal(drive(lookout, points.slice(0, near + 1)).filter(Boolean).length, 0);
    // Then a few seconds, only once however long the car stays.
    const watched = drive(lookout, points.slice(near), { stay: 20 });
    const looking = watched.filter(Boolean);
    assert.ok(Math.abs(looking.length / 30 - LOOK_TIME) < 0.1, `${trail.id} looked for ${looking.length / 30} s`);
    const first = watched.indexOf(looking[0]);
    assert.ok(watched.slice(first, first + looking.length).every(Boolean), 'all in one go');
    // Out over the view, not back down the trail.
    for (const point of looking) {
      const out =
        (point.x - trail.view.x) * -Math.sin(trail.view.heading) +
        (point.z - trail.view.z) * -Math.cos(trail.view.heading);
      assert.ok(out > 80);
    }
    // Back down the trail and up again: it looks out again.
    const back = drive(lookout, [...points].reverse());
    assert.equal(back.filter(Boolean).length, 0);
    assert.ok(drive(lookout, points).some(Boolean));
  }
});

test('driving off again before the end stops looking out', () => {
  const trail = TRAILS[0];
  const lookout = createLookout(views);
  const points = alongTrail(trail);
  drive(lookout, points);
  assert.ok(lookout.watch());
  drive(lookout, [points[points.length - 1], points[0]], { speed: 12 });
  assert.equal(lookout.watch(), null);
});

/**
 * Settles the chase camera behind a car parked by the first viewpoint, then looks out from it.
 * `turn` swings the camera round as friends waiting behind the car would.
 */
function lookOut({ turn } = {}) {
  const view = TRAILS[0].view;
  // The car has come up the trail facing across the view, to its left.
  const car = {
    x: view.x,
    y: terrainHeight(view.x, view.z),
    z: view.z + 6,
    heading: view.heading + 1.4,
    speed: 0,
    turn,
  };
  const camera = new THREE.PerspectiveCamera();
  const chase = createChaseCamera(camera, { occluders: [], groundHeight: () => -100 });
  chase.setMode('chase');
  chase.snap(car, {});
  const run = (seconds, watch) => {
    for (let t = 0; t < seconds; t += 1 / 60) chase.update(1 / 60, car, { watch: watch?.() ?? null });
    return camera.position.clone();
  };
  const before = run(10);
  const lookout = createLookout([view]);
  lookout.step(car, 0);
  const out = { x: -Math.sin(view.heading), z: -Math.cos(view.heading) };
  const during = [];
  for (let t = 0; t < LOOK_TIME; t += 0.5) {
    const position = run(0.5, () => lookout.watch());
    lookout.step(car, 0.5);
    during.push({
      distance: Math.hypot(position.x - car.x, position.z - car.z),
      out: (position.x - car.x) * out.x + (position.z - car.z) * out.z,
    });
  }
  assert.equal(lookout.watch(), null);
  return { car, before, during, after: run(10) };
}

test('the camera swings out wide for the view, then comes back behind the car', () => {
  const { car, before, during, after } = lookOut();
  const usual = Math.hypot(before.x - car.x, before.z - car.z);
  const widest = Math.max(...during.map(d => d.distance));
  // Further out than usual, and round on the far side of the car from the view.
  assert.ok(widest > usual * 1.4);
  assert.ok(during[during.length - 1].out < -10);
  // Slowly: still on its way out after a second.
  assert.ok(during[1].distance < widest * 0.9);
  assert.ok(after.distanceTo(before) < 0.3, `${after.distanceTo(before).toFixed(2)} m from where it was`);
});

test('the view wins over looking back at friends waiting behind, which comes back after', () => {
  const { before, during, after } = lookOut({ turn: 2.4 });
  assert.ok(during[during.length - 1].out < -10);
  assert.ok(after.distanceTo(before) < 0.3, `${after.distanceTo(before).toFixed(2)} m from where it was`);
});
