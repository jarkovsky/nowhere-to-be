import test from 'node:test';
import assert from 'node:assert/strict';
import { LONG_GRASS_RANGE, addLongGrass, findLongGrass, isLongGrassGround } from '../src/world/longgrass.js';

// The long grass as the scenery adds it: what it tells the scatter about its patches.
const found = findLongGrass();
let kind;
addLongGrass({ addPatches: given => (kind = given) }, found);
const patches = Array.from({ length: kind.count }, (_, index) => ({ ...kind.where(index), ...kind.grow(index) }));
const spots = patches.flatMap(({ matrices }) =>
  Array.from({ length: matrices.length / 16 }, (_, i) => ({ x: matrices[i * 16 + 12], z: matrices[i * 16 + 14] })),
);

test('long grass grows in patches, on ground where it can', () => {
  assert.ok(kind.count > 500, `${kind.count} patches`);
  assert.ok(spots.length > 50000, `${spots.length} clumps`);
  for (const { x, z } of spots.filter((_, i) => i % 97 === 0)) assert.ok(isLongGrassGround(x, z), `at ${x}, ${z}`);
});

test('a patch grown by itself is the same every time, and stays within the reach it gives', () => {
  for (const index of [0, 1, 17, kind.count - 1]) {
    const again = kind.grow(index);
    assert.deepEqual(again.matrices, patches[index].matrices);
    assert.deepEqual(again.colors, patches[index].colors);
  }
  for (const { x, z, radius, matrices } of patches) {
    for (let i = 0; i < matrices.length; i += 16)
      assert.ok(Math.hypot(matrices[i + 12] - x, matrices[i + 14] - z) <= radius + 1e-3);
  }
});

test('no spot has more clumps near it than room is kept for', () => {
  for (const eye of spots.filter((_, i) => i % 1511 === 0)) {
    const near = spots.filter(({ x, z }) => (x - eye.x) ** 2 + (z - eye.z) ** 2 <= LONG_GRASS_RANGE ** 2).length;
    assert.ok(near <= kind.most, `${near} clumps near ${eye.x}, ${eye.z}, room for ${kind.most}`);
  }
});
