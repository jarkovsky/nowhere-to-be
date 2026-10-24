import test from 'node:test';
import assert from 'node:assert/strict';
import { createObstacleIndex, mayTouch, penetration } from '../src/core/collision.js';

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

test("penetration pushes a circle on a capsule's middle line out to one side, not along it", () => {
  const hit = penetration(0, 0, 1.15, { ax: -10, az: 0, bx: 10, bz: 0, radius: 0.25 });
  assert.ok(Math.abs(hit.nx) < 1e-12);
  assert.equal(Math.abs(hit.nz), 1);
  assert.ok(Math.abs(hit.depth - 1.4) < 1e-9);
});

test('a box pushes a circle out of the side it is nearest, turned however the box is', () => {
  const box = { x: 10, z: 5, halfX: 4, halfZ: 2, rotation: 0, radius: 0 };
  // Beside the long side, the end and a corner.
  const side = penetration(10, 7.5, 1, box);
  assert.ok(Math.abs(side.nz - 1) < 1e-9 && Math.abs(side.depth - 0.5) < 1e-9);
  const end = penetration(14.5, 5, 1, box);
  assert.ok(Math.abs(end.nx - 1) < 1e-9 && Math.abs(end.depth - 0.5) < 1e-9);
  const corner = penetration(14.5, 7.5, 1, box);
  assert.ok(Math.abs(corner.nx - Math.SQRT1_2) < 1e-9 && Math.abs(corner.depth - (1 - Math.SQRT1_2)) < 1e-9);
  assert.equal(penetration(16, 5, 1, box), null);
  // Inside it, out through the nearest side.
  const inside = penetration(10, 6.5, 1, box);
  assert.ok(Math.abs(inside.nz - 1) < 1e-9 && Math.abs(inside.depth - 1.5) < 1e-9);
  // Turned a quarter, its long side runs along Z, like a localFrame turned the same way.
  const turned = { ...box, rotation: Math.PI / 2 };
  const along = penetration(10, 9.5, 1, turned);
  assert.ok(along && Math.abs(along.nz - 1) < 1e-9 && Math.abs(along.depth - 0.5) < 1e-9);
  assert.equal(penetration(13.5, 5, 1, turned), null);
  // Rounded edges reach further.
  assert.ok(penetration(16, 5, 1, { ...box, radius: 1.2 }));
});

test('the obstacle index finds boxes along their whole length', () => {
  const box = { x: 0, z: 0, halfX: 30, halfZ: 1, rotation: Math.PI / 4, radius: 0 };
  const index = createObstacleIndex([box]);
  assert.ok([...index.near(20, -20, 1)].includes(box));
  assert.ok(![...index.near(60, 60, 1)].includes(box));
});

test('a circle that touches an obstacle is always within reach of its bounds', () => {
  const obstacles = [
    { x: 2, z: -1, radius: 1.15 },
    { ax: -3, az: 4, bx: 6, bz: -2, radius: 0.6 },
    { x: 1, z: 0, halfX: 3, halfZ: 1.5, rotation: 0.6, radius: 0.3 },
  ];
  for (const obstacle of obstacles) {
    let touching = 0;
    for (let x = -8; x <= 10; x += 0.25) {
      for (let z = -8; z <= 8; z += 0.25) {
        if (!penetration(x, z, 1.5, obstacle)) continue;
        touching++;
        assert.ok(mayTouch(obstacle, x, z, 1.5), `(${x}, ${z})`);
      }
    }
    assert.ok(touching > 0);
    assert.ok(!mayTouch(obstacle, 30, 30, 1.5));
  }
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
