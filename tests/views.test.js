import test from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTORS, LOFOTEN, JETTY, LOOKOUTS, OUTER_ROAD, ROAD, TRACKS } from '../src/world/layout.js';
import { terrainHeight, isDriveable } from '../src/world/terrain.js';
import { STILL_TIME, asksToMove, createViews, lookoutAt } from '../src/core/views.js';

const idle = { forward: false, backward: false, left: false, right: false, brake: false, cruise: false, steer: 0 };
const roads = [
  ROAD,
  OUTER_ROAD,
  ...CONNECTORS.map(c => c.path),
  ...TRACKS.map(t => t.path),
  ...Object.values(LOFOTEN.roads).map(r => r.path ?? r),
];

test('every lookout is on dry ground, on or right beside a road or track', () => {
  assert.ok(LOOKOUTS.length >= 6 && LOOKOUTS.length <= 8);
  for (const spot of LOOKOUTS) {
    // The jetty is driven out along from its root on the shore, so that is where the road is measured to.
    const [x, z] = spot.id === 'jetty' ? [JETTY.x, JETTY.z + 2] : [spot.x, spot.z];
    const near = Math.min(...roads.filter(p => p?.nearest).map(p => p.nearest(x, z).distance));
    assert.ok(near < 12, `${spot.id} is ${near.toFixed(1)} m from the nearest road`);
    assert.ok(spot.radius >= 7 && spot.radius <= 15, spot.id);
    assert.ok(Number.isFinite(spot.bearing));
  }
});

test('the view does not begin until the car has stood still on a lookout for a few seconds', () => {
  const spot = LOOKOUTS[0];
  const views = createViews(LOOKOUTS);
  const car = { x: spot.x, z: spot.z, speed: 0 };
  let watch = null;
  for (let t = 0; t < STILL_TIME - 0.2; t += 0.1) watch = views.watch(car, idle, 0.1);
  assert.equal(watch, null);
  for (let t = 0; t < 0.5; t += 0.1) watch = views.watch(car, idle, 0.1);
  assert.ok(watch && views.isShowing());
  // It looks out along the bearing, from the car.
  assert.ok(Math.abs(Math.atan2(watch.x - car.x, watch.z - car.z) - spot.bearing) < 0.1);
});

test('the view never begins away from a lookout, while moving, or while something else holds the car', () => {
  const views = createViews(LOOKOUTS);
  const spot = LOOKOUTS[1];
  for (let t = 0; t < 10; t += 0.1) assert.equal(views.watch({ x: 0, z: 0, speed: 0 }, idle, 0.1), null);
  for (let t = 0; t < 10; t += 0.1) assert.equal(views.watch({ x: spot.x, z: spot.z, speed: 2 }, idle, 0.1), null);
  for (let t = 0; t < 10; t += 0.1) {
    assert.equal(views.watch({ x: spot.x, z: spot.z, speed: 0 }, idle, 0.1, { held: true }), null);
  }
});

test('the view ends at once on throttle, steering, cruise or letting the brake go, and waits for the car to move again after a touch', () => {
  const spot = LOOKOUTS[2];
  const car = { x: spot.x, z: spot.z, speed: 0 };
  const show = (input = idle) => {
    const views = createViews(LOOKOUTS);
    for (let t = 0; t < 4; t += 0.1) views.watch(car, input, 0.1);
    assert.ok(views.isShowing());
    return views;
  };
  for (const ask of [
    { forward: true },
    { backward: true },
    { left: true },
    { right: true },
    { cruise: true },
    { steer: 0.6 },
  ]) {
    const views = show();
    assert.equal(views.watch(car, { ...idle, ...ask }, 0.1), null, JSON.stringify(ask));
    assert.ok(!views.isShowing());
  }
  // Held on the brake with cruise on, the car is still; letting go ends the view.
  const braked = show({ ...idle, brake: true, cruise: true });
  assert.ok(braked.watch(car, { ...idle, brake: true, cruise: true }, 0.1));
  assert.equal(braked.watch(car, { ...idle, cruise: true }, 0.1), null);
  // Touching the camera ends it and it stays ended while the car stands.
  const touched = show();
  assert.equal(touched.watch(car, idle, 0.1, { touched: true }), null);
  for (let t = 0; t < 10; t += 0.1) assert.equal(touched.watch(car, idle, 0.1), null);
  touched.watch({ ...car, speed: 1 }, idle, 0.1);
  for (let t = 0; t < 4; t += 0.1) touched.watch(car, idle, 0.1);
  assert.ok(touched.isShowing());
  assert.ok(!asksToMove(idle) && lookoutAt(LOOKOUTS, spot.x, spot.z));
});

test('the camera at the settled view is above the ground and has clear ground between it and the car', () => {
  for (const spot of LOOKOUTS) {
    const views = createViews(LOOKOUTS);
    const car = { x: spot.x, z: spot.z, speed: 0 };
    let watch = null;
    for (let t = 0; t < 4; t += 0.1) watch = views.watch(car, idle, 0.1);
    // Where the chase camera settles: behind the car on the line from the view, at its boom.
    const yaw = Math.atan2(car.x - watch.x, car.z - watch.z);
    const elevation = Math.atan2(6, 14) + watch.pitch;
    const boom = Math.hypot(14, 6) * watch.zoom;
    const eye = {
      x: car.x + Math.sin(yaw) * Math.cos(elevation) * boom,
      z: car.z + Math.cos(yaw) * Math.cos(elevation) * boom,
      y: terrainHeight(car.x, car.z) + Math.sin(elevation) * boom,
    };
    for (let f = 0; f <= 1; f += 0.05) {
      const x = car.x + (eye.x - car.x) * f;
      const z = car.z + (eye.z - car.z) * f;
      const y = terrainHeight(car.x, car.z) + 1.8 + (eye.y - terrainHeight(car.x, car.z) - 1.8) * f;
      assert.ok(y > terrainHeight(x, z) + 0.3 || f < 0.1, `${spot.id} camera line at ${f.toFixed(2)} is in the ground`);
    }
    assert.ok(isDriveable(car.x, car.z) || spot.id === 'jetty', `${spot.id} is somewhere the car can stand`);
  }
});
