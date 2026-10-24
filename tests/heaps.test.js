import test from 'node:test';
import assert from 'node:assert/strict';
import { HEAPS } from '../src/world/layout.js';
import { drivingHeight, heapHeight, terrainHeight } from '../src/world/terrain.js';

test('the heaps lift the tyres in the middle and nothing beyond their edge', () => {
  for (const heap of HEAPS) {
    assert.ok(Math.abs(heapHeight(heap.x, heap.z) - heap.height) < heap.height * 0.12, heap.id);
    assert.equal(heapHeight(heap.x + heap.radius + 0.1, heap.z), 0);
    assert.ok(drivingHeight(heap.x, heap.z) > terrainHeight(heap.x, heap.z) + heap.height * 0.8);
  }
});

test('every heap is gentle enough to drive over', () => {
  for (const heap of HEAPS) {
    let steepest = 0;
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      for (let r = 0; r < heap.radius; r += 0.25) {
        const [x, z] = [heap.x + Math.cos(a) * r, heap.z + Math.sin(a) * r];
        const [x1, z1] = [heap.x + Math.cos(a) * (r + 0.25), heap.z + Math.sin(a) * (r + 0.25)];
        steepest = Math.max(steepest, Math.abs(heapHeight(x1, z1) - heapHeight(x, z)) / 0.25);
      }
    }
    assert.ok(steepest < 0.95, `${heap.id}: ${steepest.toFixed(2)}`);
  }
});
