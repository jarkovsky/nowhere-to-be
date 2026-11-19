import './dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLandmarks } from '../src/world/landmarks/index.js';
import { LAKELAND, TRACKS } from '../src/world/layout.js';
import { buildScenery } from '../src/world/scenery.js';
import { terrainHeight } from '../src/world/terrain.js';

const scene = new THREE.Scene();
buildScenery(scene);
const landmarks = buildLandmarks(scene, []);
const mine = landmarks.places.hamlet.group.userData.obstacles;
const { houses, boathouse } = LAKELAND.hamlet;
const roads = [LAKELAND.road, ...TRACKS.filter(track => track.land).map(track => track.path)];
const isBox = o => 'halfX' in o;
/** A boat is the box of half-width 0.75 and half-length 1.7 (the one inside the boathouse has none of its own). */
const isBoat = o => isBox(o) && o.halfX === 0.75 && o.halfZ === 1.7;
/** A building's walls: a box of at least 2.4 m to the side. */
const buildings = mine.filter(o => isBox(o) && Math.max(o.halfX, o.halfZ) >= 2.4);

/** Points along an obstacle's outline and through it, 0.5 m apart, so two things joined come within 0.75 m. */
function sample(o) {
  const points = [];
  if (isBox(o)) {
    const [c, s] = [Math.cos(o.rotation), Math.sin(o.rotation)];
    for (let a = -o.halfX; a <= o.halfX + 1e-9; a += o.halfX / Math.ceil(o.halfX / 0.5)) {
      for (let b = -o.halfZ; b <= o.halfZ + 1e-9; b += o.halfZ / Math.ceil(o.halfZ / 0.5)) {
        points.push({ x: o.x + a * c + b * s, z: o.z - a * s + b * c });
      }
    }
  } else if ('ax' in o) {
    const n = Math.ceil(Math.hypot(o.bx - o.ax, o.bz - o.az) / 0.5);
    for (let i = 0; i <= n; i++) points.push({ x: o.ax + ((o.bx - o.ax) * i) / n, z: o.az + ((o.bz - o.az) * i) / n });
  } else {
    points.push({ x: o.x, z: o.z });
  }
  return points;
}
const reach = o => o.radius ?? 0;
const gap = (a, b) => {
  let least = Infinity;
  for (const p of sample(a)) for (const q of sample(b)) least = Math.min(least, Math.hypot(p.x - q.x, p.z - q.z));
  return least - reach(a) - reach(b);
};
const covers = (o, x, z) => {
  if (!isBox(o)) return false;
  const [dx, dz] = [x - o.x, z - o.z];
  const [c, s] = [Math.cos(o.rotation), Math.sin(o.rotation)];
  return Math.abs(dx * c - dz * s) <= o.halfX && Math.abs(dx * s + dz * c) <= o.halfZ;
};

test('each cottage and the boathouse has a solid box of its own standing over its site', () => {
  for (const site of [...houses, boathouse]) {
    assert.ok(
      mine.some(o => covers(o, site.x, site.z) && Math.max(o.halfX, o.halfZ) >= 2.4),
      `${site.x.toFixed(0)}, ${site.z.toFixed(0)}`,
    );
  }
  assert.equal(buildings.length, 5);
});

test('the ground under each building varies by less than 0.4 m', () => {
  for (const o of buildings) {
    const heights = sample(o).map(p => terrainHeight(p.x, p.z));
    assert.ok(Math.max(...heights) - Math.min(...heights) < 0.4, `${o.x.toFixed(0)}, ${o.z.toFixed(0)}`);
  }
});

test('nothing solid is near the road or a track, or on the square', () => {
  for (const o of mine) {
    for (const p of sample(o)) {
      assert.ok(Math.hypot(p.x - LAKELAND.square.x, p.z - LAKELAND.square.z) - reach(o) >= 14, 'the square');
      for (const road of roads) {
        const keep = road === LAKELAND.road ? 4.5 : 3;
        assert.ok(road.nearest(p.x, p.z).distance - reach(o) >= keep, `${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
      }
    }
  }
});

test('everything stands on dry ground, except the boats, which may be at the waterline', () => {
  for (const o of mine) {
    for (const p of sample(o)) {
      const above = terrainHeight(p.x, p.z) - LAKELAND.level;
      assert.ok(above > (isBoat(o) ? -0.05 : 0.2), `${p.x.toFixed(0)}, ${p.z.toFixed(0)} is ${above.toFixed(2)} m up`);
    }
  }
});

test('all of it is within 80 m of the square', () => {
  for (const o of mine) {
    for (const p of sample(o)) assert.ok(Math.hypot(p.x - LAKELAND.square.x, p.z - LAKELAND.square.z) < 80);
  }
});

test('two solid things are either joined or at least 6 m apart, so no car can wedge between them', () => {
  for (let i = 0; i < mine.length; i++) {
    for (let j = i + 1; j < mine.length; j++) {
      const apart = gap(mine[i], mine[j]);
      assert.ok(apart <= 0.75 || apart >= 6, `${i} and ${j} are ${apart.toFixed(1)} m apart`);
    }
  }
});
