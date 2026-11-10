import test from 'node:test';
import assert from 'node:assert/strict';
import './dom.js';
import * as THREE from 'three';
import { RAILWAY } from '../src/world/layout.js';
import {
  BOULDERS,
  CLIMB_LIMIT,
  boulderLift,
  drivingHeight,
  heapHeight,
  onDeck,
  rockHeight,
  rutHeight,
  terrainHeight,
} from '../src/world/terrain.js';
import { buildScenery } from '../src/world/scenery.js';
import { buildLandmarks } from '../src/world/landmarks/index.js';

// Every boulder set down while the world is built, the ones too tall to ride over as well.
const everyBoulder = [];
const add = BOULDERS.add.bind(BOULDERS);
BOULDERS.add = (geometry, elements) => {
  const climb = add(geometry, elements);
  everyBoulder.push({ geometry, elements: Array.from(elements), climb });
  return climb;
};
const scene = new THREE.Scene();
const obstacles = [...buildScenery(scene).obstacles];
buildLandmarks(scene, obstacles);

const TOLERANCE = 0.05;
/** The grid under a boulder is at most 10 cm apart, so its edge may be out by that far sideways. */
const AROUND = [0.04, 0.09, 0.14].flatMap(r =>
  Array.from({ length: 8 }, (_, k) => [Math.cos(k * 0.785) * r, Math.sin(k * 0.785) * r]),
);

/** The mesh of a boulder as it was placed. */
function meshOf({ geometry, elements }) {
  const mesh = new THREE.Mesh(geometry);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.fromArray(elements);
  mesh.updateMatrixWorld(true);
  return mesh;
}

const caster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
/** The height of the mesh's top at (x, z) by a ray from above, or null where the ray misses it. */
function rayHeight(mesh, x, z, from) {
  caster.set(new THREE.Vector3(x, from, z), down);
  const hit = caster.intersectObject(mesh)[0];
  return hit ? hit.point.y : null;
}

/** What the tyres rested on before the boulders were in it. */
const without = (x, z) => terrainHeight(x, z) + Math.max(rockHeight(x, z), heapHeight(x, z)) + rutHeight(x, z);

/** Boulders in the field with no other boulder within half a metre, spread through the whole list. */
function loneBoulders(count) {
  // Not by a deck or the railway, whose own surface would be in the way of the comparison.
  const open = ({ x0, x1, z0, z1 }) =>
    !RAILWAY.isNear((x0 + x1) / 2, (z0 + z1) / 2, 15) &&
    ![x0, x1, (x0 + x1) / 2].some(x => [z0, z1, (z0 + z1) / 2].some(z => onDeck(x, z)));
  const boulders = BOULDERS.boulders
    .filter(open)
    .filter(
      a =>
        !BOULDERS.boulders.some(
          b => b !== a && a.x0 - 0.5 < b.x1 && a.x1 + 0.5 > b.x0 && a.z0 - 0.5 < b.z1 && a.z1 + 0.5 > b.z0,
        ),
    );
  const step = Math.max(1, Math.floor(boulders.length / count));
  return boulders.filter((_, i) => i % step === 0).slice(0, count);
}

test('there are boulders to drive over, and taller ones left out of the height field', () => {
  assert.equal(CLIMB_LIMIT, 1);
  assert.ok(BOULDERS.boulders.length > 1000);
  assert.ok(everyBoulder.some(b => b.climb > CLIMB_LIMIT));
  assert.equal(BOULDERS.boulders.length, everyBoulder.filter(b => b.climb <= CLIMB_LIMIT).length);
});

test('over a boulder the tyres rest on its drawn top, within 5 cm', () => {
  const lone = loneBoulders(25);
  assert.ok(lone.length >= 20);
  let hits = 0;
  let misses = 0;
  for (const boulder of lone) {
    const record = everyBoulder.find(b => b.elements[12] === boulder.e[12] && b.elements[14] === boulder.e[14]);
    const mesh = meshOf(record);
    const expected = (x, z) => {
      const hit = rayHeight(mesh, x, z, boulder.top + 1);
      return hit === null ? without(x, z) : Math.max(without(x, z), hit);
    };
    const step = Math.max(0.08, (boulder.x1 - boulder.x0) / 30);
    for (let x = boulder.x0 - 0.3; x <= boulder.x1 + 0.3; x += step) {
      for (let z = boulder.z0 - 0.3; z <= boulder.z1 + 0.3; z += step) {
        const hit = rayHeight(mesh, x, z, boulder.top + 1);
        const wanted = expected(x, z);
        const got = drivingHeight(x, z);
        if (hit === null) {
          // Off the boulder the surface is what it was, except within a grid step of its edge.
          const near = AROUND.some(([dx, dz]) => {
            const other = rayHeight(mesh, x + dx, z + dz, boulder.top + 1);
            return other !== null && other > without(x + dx, z + dz);
          });
          if (!near) {
            assert.equal(got, without(x, z), `off the boulder at ${x}, ${z}`);
            misses++;
          }
          continue;
        }
        hits++;
        if (Math.abs(got - wanted) <= TOLERANCE) continue;
        // On a near-vertical wall a hair's breadth sideways is a long way up: the surface must
        // then match the drawn one a few centimetres to the side.
        const sideways = AROUND.map(([dx, dz]) => expected(x + dx, z + dz));
        assert.ok(
          got >= Math.min(wanted, ...sideways) - TOLERANCE && got <= Math.max(wanted, ...sideways) + TOLERANCE,
          `at ${x.toFixed(2)}, ${z.toFixed(2)}: drove ${got.toFixed(3)}, drawn ${wanted.toFixed(3)}`,
        );
      }
    }
  }
  assert.ok(hits > 2000 && misses > 200, `${hits} on, ${misses} off`);
});

test('the top of most of a boulder is within 5 cm without any sideways allowance', () => {
  let close = 0;
  let total = 0;
  for (const boulder of loneBoulders(40)) {
    const mesh = meshOf(everyBoulder.find(b => b.elements[12] === boulder.e[12] && b.elements[14] === boulder.e[14]));
    for (let x = boulder.x0; x <= boulder.x1; x += 0.07) {
      for (let z = boulder.z0; z <= boulder.z1; z += 0.07) {
        const hit = rayHeight(mesh, x, z, boulder.top + 1);
        if (hit === null || hit < terrainHeight(x, z)) continue;
        total++;
        if (Math.abs(drivingHeight(x, z) - hit) <= TOLERANCE) close++;
      }
    }
  }
  assert.ok(close / total > 0.97, `${close} of ${total}`);
});

test('every boulder obstacle says how tall it is, as the top of its drawn shape over the ground at its middle', () => {
  const at = new Map(everyBoulder.map(b => [`${b.elements[12]},${b.elements[14]}`, b]));
  let matched = 0;
  for (const o of obstacles) {
    if (o.x === undefined) continue;
    const boulder = at.get(`${o.x},${o.z}`);
    if (!boulder) {
      assert.equal(o.climb, undefined, `climb on something that isn't a boulder at ${o.x}, ${o.z}`);
      continue;
    }
    assert.equal(typeof o.climb, 'number', `no climb for the boulder at ${o.x}, ${o.z}`);
    // The highest point of the drawn mesh, from its corners.
    const mesh = meshOf(boulder);
    const corner = new THREE.Vector3();
    let top = -Infinity;
    const position = boulder.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      top = Math.max(top, corner.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).y);
    }
    assert.ok(Math.abs(o.climb - (top - terrainHeight(o.x, o.z))) <= TOLERANCE, `climb of the boulder at ${o.x}`);
    matched++;
  }
  assert.ok(matched > 1500, `${matched} boulder obstacles`);
});

test('the height field has the boulders up to the limit, and its highest point is the climb', () => {
  for (const boulder of everyBoulder) {
    const registered = BOULDERS.boulders.some(
      b => b.e[12] === boulder.elements[12] && b.e[14] === boulder.elements[14],
    );
    assert.equal(registered, boulder.climb <= CLIMB_LIMIT);
  }
  let checked = 0;
  for (const boulder of loneBoulders(40)) {
    const record = everyBoulder.find(b => b.elements[12] === boulder.e[12] && b.elements[14] === boulder.e[14]);
    // The highest the tyres can be over it, found by walking over it.
    let top = -Infinity;
    for (let x = boulder.x0; x <= boulder.x1; x += 0.03) {
      for (let z = boulder.z0; z <= boulder.z1; z += 0.03) {
        if (boulderLift(x, z) > 1e-6) top = Math.max(top, drivingHeight(x, z));
      }
    }
    if (top === -Infinity) continue;
    const ground = terrainHeight(record.elements[12], record.elements[14]);
    assert.ok(Math.abs(record.climb - (top - ground)) <= TOLERANCE, `${record.climb} against ${top - ground}`);
    checked++;
  }
  assert.ok(checked > 25);
});

test('away from the boulders the surface is exactly what it was', () => {
  let state = 7;
  const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  let checked = 0;
  for (let i = 0; i < 6000; i++) {
    const x = (random() - 0.5) * 1800;
    const z = (random() - 0.5) * 1800;
    if (BOULDERS.topAt(x, z) !== -Infinity || onDeck(x, z) || RAILWAY.isNear(x, z, 6)) continue;
    assert.equal(boulderLift(x, z), 0);
    assert.equal(drivingHeight(x, z), without(x, z));
    checked++;
  }
  assert.ok(checked > 3000);
});

test('the lift is the boulder’s rise above the ground where it stands, and nothing off it', () => {
  let lifted = 0;
  for (const boulder of loneBoulders(40)) {
    const mesh = meshOf(everyBoulder.find(b => b.elements[12] === boulder.e[12] && b.elements[14] === boulder.e[14]));
    for (let x = boulder.x0; x <= boulder.x1; x += 0.2) {
      for (let z = boulder.z0; z <= boulder.z1; z += 0.2) {
        const hit = rayHeight(mesh, x, z, boulder.top + 1);
        const lift = boulderLift(x, z);
        assert.ok(lift >= 0);
        if (hit === null) continue;
        const rise = Math.max(0, hit - terrainHeight(x, z));
        if (Math.abs(lift - rise) <= TOLERANCE) {
          if (lift > 0) lifted++;
          continue;
        }
        // Only the wall of the boulder, where a few centimetres sideways is a long way up, may differ.
        const near = AROUND.map(([dx, dz]) => {
          const other = rayHeight(mesh, x + dx, z + dz, boulder.top + 1);
          return Math.max(0, (other ?? -Infinity) - terrainHeight(x + dx, z + dz));
        });
        assert.ok(lift >= Math.min(rise, ...near) - TOLERANCE && lift <= Math.max(rise, ...near) + TOLERANCE);
      }
    }
    // The surface is the ground plus the lift.
    const [cx, cz] = [boulder.e[12], boulder.e[14]];
    assert.ok(
      Math.abs(drivingHeight(cx, cz) - terrainHeight(cx, cz) - boulderLift(cx, cz)) < 1e-9 || rockHeight(cx, cz) > 0,
    );
  }
  assert.ok(lifted > 500);
  assert.equal(boulderLift(0, 5000), 0);
  assert.equal(boulderLift(-2500, 40), 0);
});
