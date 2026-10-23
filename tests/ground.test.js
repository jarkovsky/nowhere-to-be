import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGround } from '../src/world/ground.js';
import { AXIS } from '../src/world/terrain.js';

const triangles = mesh => mesh.geometry.index.count / 3;

/** The widest grid cell under a tile, from where its edges fall on the grid. */
function cellSize(mesh) {
  const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
  const across = (from, to) => (to - from) / (AXIS.filter(a => a > from + 0.01 && a < to - 0.01).length + 1);
  return Math.max(across(box.min.x, box.max.x), across(box.min.z, box.max.z));
}

test('far from the camera, the ground is drawn with every second or fourth grid line wherever cells allow', () => {
  const ground = createGround((x, z, height, up, out) => out.setRGB(0.4, 0.5, 0.3));
  const tiles = ground.group.children;
  const full = tiles.map(triangles);
  ground.update({ x: 1e5, z: 1e5 });
  tiles.forEach((tile, i) => {
    // Cells are joined up to 15 m across.
    const size = cellSize(tile);
    const stride = [4, 2].find(s => size * s <= 15.01) ?? 1;
    // A quarter or a sixteenth of the triangles, and a little more for the skirts round the edge.
    assert.ok(triangles(tile) <= (full[i] / stride ** 2) * 1.3, `a tile of ${size.toFixed(1)} m cells drawn in full`);
  });
});
