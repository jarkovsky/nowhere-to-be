import test from 'node:test';
import assert from 'node:assert/strict';
import { createObstacleIndex, penetration } from '../src/core/collision.js';

test('the obstacle index only returns nearby obstacles', () => {
  const near = { x: 3, z: 4, radius: 1 };
  const far = { x: 300, z: -200, radius: 1 };
  const wall = { ax: -50, az: 10, bx: 50, bz: 10, radius: 0.5 };
  const index = createObstacleIndex([near, far, wall]);
  const found = [...index.near(0, 0, 3)];
  assert.ok(found.includes(near));
  assert.ok(!found.includes(far));
  assert.ok([...index.near(40, 9, 2)].includes(wall), 'long capsules are indexed along their length');
});

test('penetration pushes a circle out of circles and capsules', () => {
  const hit = penetration(1, 0, 1, { x: 0, z: 0, radius: 0.5 });
  assert.deepEqual([hit.nx, hit.nz], [1, 0]);
  assert.ok(Math.abs(hit.depth - 0.5) < 1e-9);
  assert.equal(penetration(5, 0, 1, { x: 0, z: 0, radius: 0.5 }), null);
  const side = penetration(0, 0.8, 1, { ax: -10, az: 0, bx: 10, bz: 0, radius: 0.2 });
  assert.ok(side.nz === 1 && Math.abs(side.depth - 0.4) < 1e-9);
});

test('obstacles with a top or a base only stop things at the right level', async () => {
  const { atLevel } = await import('../src/core/collision.js');
  const wall = { x: 0, z: 0, radius: 1, top: 20 };
  const rim = { x: 0, z: 0, radius: 1, base: 18 };
  assert.ok(atLevel(wall, -Infinity) && atLevel(wall, 5) && !atLevel(wall, 20));
  assert.ok(!atLevel(rim, -Infinity) && !atLevel(rim, 5) && atLevel(rim, 20));
  const index = createObstacleIndex([wall, rim]);
  assert.deepEqual([...index.near(0, 0, 1)], [wall]);
  assert.deepEqual([...index.near(0, 0, 1, 20)], [rim]);
});
