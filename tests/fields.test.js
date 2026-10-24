import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FARM, FARMS, FIELDS, FIELD_PLOTS, HERDS, VILLAGE, fieldPoint, inCrop } from '../src/world/layout.js';
import { buildFields } from '../src/world/landmarks/fields.js';
import { buildScenery } from '../src/world/scenery.js';
import { localFrame } from '../src/world/build.js';

const run = (fields, seconds, player) => {
  for (let t = 0; t < seconds; t += 1 / 30) fields.update(1 / 30, player);
};

test('the tractors and the combine work their fields and stop for the car', () => {
  const fields = buildFields(new THREE.Scene(), []);
  assert.deepEqual(
    fields.getState().map(w => w.kind),
    ['plough', 'mower', 'combine'],
  );
  const far = { x: 0, z: 0 };
  run(fields, 0.1, far);
  const before = fields.getState().map(w => w.worked);
  run(fields, 10, far);
  const after = fields.getState().map(w => w.worked);
  after.forEach((worked, i) => assert.ok(worked > before[i] + 10, `machine ${i} worked ${worked - before[i]} m`));

  // Park just in front of a machine: it waits. The first collider of each is its front.
  const waitsFor = (index, front, behind) => {
    const length = Math.hypot(front.x - behind.x, front.z - behind.z);
    const ahead = {
      x: front.x + ((front.x - behind.x) / length) * 2.5,
      z: front.z + ((front.z - behind.z) / length) * 2.5,
    };
    const waiting = fields.getState()[index].worked;
    run(fields, 3, ahead);
    return fields.getState()[index].worked - waiting < 0.5;
  };
  const [plough, ploughBody] = fields.colliders;
  assert.ok(waitsFor(0, plough, ploughBody), 'the plough waits for the car');
  const [header, , , combineBody] = fields.colliders.slice(6);
  assert.ok(waitsFor(2, header, combineBody), 'the combine waits for the car');
});

test('a finished field grows back only while nobody is near', () => {
  const fields = buildFields(new THREE.Scene(), []);
  const near = { x: FIELDS.x, z: FIELDS.z - 150 };
  run(fields, 1500, near);
  assert.ok(
    fields.getState().every(w => w.done),
    'every field gets finished',
  );
  run(fields, 1, near);
  assert.ok(
    fields.getState().every(w => w.done),
    'and stay finished while someone is watching',
  );
  run(fields, 1, { x: 0, z: 0 });
  assert.ok(
    fields.getState().every(w => !w.done && w.worked < 3),
    'then start again',
  );
});

test('the machines take turns where their headlands meet, and never run into each other or into the other fields', () => {
  const fields = buildFields(new THREE.Scene(), []);
  const plots = { plough: FIELD_PLOTS.plough, mower: FIELD_PLOTS.mow, combine: FIELD_PLOTS.wheat };
  const cos = Math.cos(FIELDS.rotation);
  const sin = Math.sin(FIELDS.rotation);
  let waited = 0;
  let finished = 0;
  const check = time => {
    const circles = fields.colliders;
    for (const [i, a] of circles.entries()) {
      for (const b of circles.slice(i + 1)) {
        if (a.kind === b.kind) continue;
        // They keep a little room between them, not just out of each other.
        const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius;
        // The messages are only made on failure: this runs millions of times.
        if (!(gap >= 0.2))
          assert.fail(`the ${a.kind} and the ${b.kind} come within ${gap.toFixed(2)} m at ${time.toFixed(1)} s`);
      }
      // In the farmland's frame, clear of every field but its own.
      const lx = (a.x - FIELDS.x) * cos - (a.z - FIELDS.z) * sin;
      const lz = (a.x - FIELDS.x) * sin + (a.z - FIELDS.z) * cos;
      for (const plot of Object.values(FIELD_PLOTS)) {
        if (plot === plots[a.kind]) continue;
        const out = Math.max(plot.x0 - lx, lx - plot.x1, plot.z0 - lz, lz - plot.z1);
        if (!(out >= a.radius)) assert.fail(`the ${a.kind} is in another field at ${time.toFixed(1)} s`);
      }
    }
    const state = fields.getState();
    waited += state.filter(w => w.waiting).length;
    finished += state.filter(w => w.done).length;
  };
  // Many rounds of work, the fields growing back each time with nobody about, then a long while
  // with someone watching, so nothing starts again until every machine has finished.
  let time = 0;
  for (const [seconds, player] of [
    [6000, { x: 0, z: 0 }],
    [1800, { x: FIELDS.x, z: FIELDS.z - 150 }],
  ]) {
    for (let t = 0; t < seconds; t += 1 / 20, time += 1 / 20) {
      fields.update(1 / 20, player);
      check(time);
    }
  }
  assert.ok(waited > 0, 'the machines had to take turns');
  assert.ok(
    fields.getState().every(w => w.done),
    'and none of them was kept waiting for good',
  );
  assert.ok(finished > 0);
});

test('nothing grows in the crop fields, and they keep clear of the farms, the village and the herds', () => {
  const scene = new THREE.Scene();
  const scenery = buildScenery(scene);
  const position = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  // From each spot, the scenery close by is drawn one way and the rest another: between them, all of it.
  const wheat = localFrame(FARM.x, FARM.z, FARM.rotation)(16, 18);
  for (const eye of [wheat, fieldPoint(42, -35), fieldPoint(60, 86)]) {
    scenery.update(0, new THREE.Vector3(eye.x, 0, eye.z));
    scene.traverse(mesh => {
      if (!mesh.isInstancedMesh) return;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        assert.ok(!inCrop(position.x, position.z, 1), `grows at ${position.x.toFixed(1)}, ${position.z.toFixed(1)}`);
      }
    });
  }
  assert.ok(scenery.obstacles.every(o => o.x === undefined || !inCrop(o.x, o.z)));
  for (const { x, z } of [...FARMS, ...VILLAGE.houses, VILLAGE.fireStation]) assert.ok(!inCrop(x, z, 30));
  for (const { x, z, radius } of HERDS) assert.ok(!inCrop(x, z, radius));
});
