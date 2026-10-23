import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FARM, FARMS, FIELDS, HERDS, VILLAGE, fieldPoint, inCrop } from '../src/world/layout.js';
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
