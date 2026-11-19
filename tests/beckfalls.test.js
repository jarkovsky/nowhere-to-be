import './dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBeckFalls } from '../src/world/landmarks/beckfalls.js';
import { buildLandmarks } from '../src/world/landmarks/index.js';
import { LAKELAND, RIVERS, TRACKS, inLakeland } from '../src/world/layout.js';
import { buildScenery } from '../src/world/scenery.js';
import { terrainHeight } from '../src/world/terrain.js';

const scene = new THREE.Scene();
const scenery = buildScenery(scene);
const obstacles = [...scenery.obstacles];
const landmarks = buildLandmarks(scene, obstacles);
const { group } = landmarks.places.beckfalls;
/** The rock and the boulders at its foot, and the stretches of the rail round the rim of the hollow. */
const mine = group.userData.obstacles.filter(o => o.ax === undefined);
const rail = group.userData.obstacles.filter(o => o.ax !== undefined);

const start = RIVERS.at(-1).path.at(0);
const gorge = TRACKS.find(track => track.id === 'gorge').path;
const end = gorge.at(gorge.length);
/** Metres upstream of the beck's start (negative downstream) that a point lies. */
const upstream = (x, z) => (x - start.x) * -start.dx + (z - start.z) * -start.dz;

test('the falls stand upstream of the start of the beck, the rock within 30 m of it and the ribs up the walls within 40', () => {
  assert.ok(mine.length >= 8);
  for (const o of mine) {
    assert.ok(upstream(o.x, o.z) - o.radius > 0, `obstacle at ${o.x.toFixed(1)}, ${o.z.toFixed(1)} reaches the start`);
    assert.ok(Math.hypot(o.x - start.x, o.z - start.z) < (o.radius > 3 ? 30 : 40));
  }
});

test('nothing solid is within 3 m of the gorge track or 10 m of its end', () => {
  for (const o of mine) {
    assert.ok(gorge.nearest(o.x, o.z).distance - o.radius > 3, 'too near the track');
    assert.ok(Math.hypot(o.x - end.x, o.z - end.z) - o.radius > 10, 'too near the end of the track');
  }
});

test('its solid parts are one run of overlapping circles, with no gap between them a car could wedge into', () => {
  const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius;
  const joined = new Set([mine[0]]);
  for (let grown = true; grown; ) {
    grown = false;
    for (const o of mine) {
      if (!joined.has(o) && [...joined].some(p => gap(o, p) < 0)) joined.add(o) && (grown = true);
    }
  }
  assert.equal(joined.size, mine.length);
});

test('the rock reaches at least 9 m above the floor of the hollow and the landmark moves its water', () => {
  const floor = terrainHeight(start.x - start.dx * 10, start.z - start.dz * 10);
  const box = new THREE.Box3().setFromObject(group.getObjectByName('rock'));
  assert.ok(box.max.y - floor >= 9, `only ${(box.max.y - floor).toFixed(1)} m`);
  const own = buildBeckFalls(new THREE.Group(), []);
  assert.equal(typeof own.update, 'function');
  own.update(1.5);
  // The rock, the water, the streaks on it and the rail.
  const draws = [];
  group.traverse(m => m.isMesh && draws.push(m));
  assert.ok(draws.length <= 4);
  let triangles = 0;
  for (const m of draws) {
    const each = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    triangles += each * (m.isInstancedMesh ? m.count : 1);
  }
  assert.ok(triangles < 6000, `${triangles} triangles`);
});

/** How far a point is from a stretch of the rail. */
const off = (o, x, z) => {
  const [dx, dz] = [o.bx - o.ax, o.bz - o.az];
  const t = Math.max(0, Math.min(1, ((x - o.ax) * dx + (z - o.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - o.ax - dx * t, z - o.az - dz * t);
};

test('the rock, a rib up each wall and a rail from each rib to the fence of the land shut off the walls above the fall', () => {
  // Two rails, each of stretches joined end to end, on ground a car can drive away from.
  const runs = [];
  for (const o of rail) {
    const run = runs.at(-1);
    if (run && Math.hypot(run.at(-1).bx - o.ax, run.at(-1).bz - o.az) < 0.01) run.push(o);
    else runs.push([o]);
  }
  assert.equal(runs.length, 2);
  for (const run of runs) {
    for (const o of run) {
      const length = Math.hypot(o.bx - o.ax, o.bz - o.az);
      assert.ok(length > 1 && length < 3.3, `a stretch of ${length.toFixed(1)} m`);
      const rise = Math.abs(terrainHeight(o.bx, o.bz) - terrainHeight(o.ax, o.az)) / length;
      assert.ok(rise < 0.6, `the rail climbs ${rise.toFixed(2)} in one`);
    }
    // It starts inside the top boulder of a rib, and ends beyond the fence.
    const [first, last] = [run[0], run.at(-1)];
    assert.ok(mine.some(o => Math.hypot(o.x - first.ax, o.z - first.az) < o.radius - 0.3));
    assert.ok(Math.hypot(last.bx - LAKELAND.x, last.bz - LAKELAND.z) > LAKELAND.radius + 1);
    assert.ok(!inLakeland(last.bx, last.bz));
  }
  // Spreading over the ground a metre at a time from the floor of the gorge, round everything
  // solid here and inside the land's fence, the open rim either side is reached and nothing behind
  // the rock is: not the walls beside it, the slope above it or the strip up to the fence.
  const right = { x: start.dz, z: -start.dx };
  const at = (along, across) => [
    Math.round(start.x - start.dx * along + right.x * across),
    Math.round(start.z - start.dz * along + right.z * across),
  ];
  const shut = (x, z) =>
    !inLakeland(x, z) ||
    mine.some(o => Math.hypot(o.x - x, o.z - z) < o.radius + 0.3) ||
    rail.some(o => off(o, x, z) < 0.75);
  const reached = new Set();
  const queue = [at(-10, 0)];
  while (queue.length) {
    const [x, z] = queue.pop();
    const key = `${x},${z}`;
    if (reached.has(key) || Math.hypot(x - start.x, z - start.z) > 110 || shut(x, z)) continue;
    reached.add(key);
    queue.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
  }
  const got = (along, across) => reached.has(at(along, across).join(','));
  for (const [along, across] of [
    [-10, 0],
    [2, 10],
    [5, 45],
    [18, 58],
    [-5, -50],
    [5, -45],
    [40, 40],
  ])
    assert.ok(got(along, across), `${along} m upstream, ${across} to the right is open`);
  for (const [along, across] of [
    [19, 14],
    [19, -14],
    [20, 22],
    [20, -24],
    [18, -34],
    [27, 0],
    [38, 0],
    [30, -30],
    [36, 12],
    [44, -8],
  ])
    assert.ok(!got(along, across), `${along} m upstream, ${across} to the right is shut off`);
});

test('nothing solid stands close enough beside the rail, on the side a car can be, to wedge one between them', () => {
  for (const o of obstacles) {
    if (group.userData.obstacles.includes(o) || o.climb) continue;
    const [x, z] = o.ax === undefined ? [o.x, o.z] : [(o.ax + o.bx) / 2, (o.az + o.bz) / 2];
    const gap = Math.min(...rail.map(stretch => off(stretch, x, z))) - (o.radius ?? 0) - 0.25;
    assert.ok(gap < 0.9 || gap > 5.5, `a gap of ${gap.toFixed(1)} m at (${x.toFixed(1)}, ${z.toFixed(1)})`);
  }
});
