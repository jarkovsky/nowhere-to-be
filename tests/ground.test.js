import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGround } from '../src/world/ground.js';
import { gridColors } from '../src/world/groundcolor.js';
import { SIGHT } from '../src/world/sight.js';
import { AXIS } from '../src/world/terrain.js';

const triangles = mesh => mesh.geometry.index.count / 3;

/** The widest grid cell under a tile, from where its edges fall on the grid. */
function cellSize(mesh) {
  const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
  const across = (from, to) => (to - from) / (AXIS.filter(a => a > from + 0.01 && a < to - 0.01).length + 1);
  return Math.max(across(box.min.x, box.max.x), across(box.min.z, box.max.z));
}

/** A plain ground, and each of its tiles drawn in full: the camera goes and stands on each in turn. */
function plainGround() {
  const ground = createGround(gridColors((x, z, height, up, out) => out.setRGB(0.4, 0.5, 0.3)));
  const tiles = ground.group.children;
  const full = tiles.map(tile => {
    const { center } = tile.geometry.boundingSphere;
    ground.update({ x: center.x, z: center.z });
    return triangles(tile);
  });
  return { ground, tiles, full };
}

test('far from the camera, the ground is drawn with every second or fourth grid line wherever cells allow', () => {
  const { ground, tiles, full } = plainGround();
  ground.update({ x: 1e5, z: 1e5 });
  tiles.forEach((tile, i) => {
    // Cells are joined up to 15 m across.
    const size = cellSize(tile);
    const stride = [4, 2].find(s => size * s <= 15.01) ?? 1;
    // A quarter or a sixteenth of the triangles, and a little more for the skirts round the edge.
    assert.ok(triangles(tile) <= (full[i] / stride ** 2) * 1.3, `a tile of ${size.toFixed(1)} m cells drawn in full`);
  });
});

test('a tile is only made at the detail it is drawn at, and what it had is let go of', () => {
  const { ground, tiles, full } = plainGround();
  ground.update({ x: 1e5, z: 1e5 });
  // Before the camera has been anywhere, and far from it, no tile is in full that could be plainer.
  const fresh = createGround(gridColors((x, z, height, up, out) => out.setRGB(0.4, 0.5, 0.3)));
  fresh.group.children.forEach((tile, i) => assert.equal(triangles(tile), triangles(tiles[i])));
  // Where the camera is, the ground is in full again, and the plainer triangles are thrown away.
  const middle = tiles.findIndex(tile => tile.geometry.boundingSphere.containsPoint(new THREE.Vector3(0, 0, 0)));
  const plain = tiles[middle].geometry;
  let disposed = false;
  plain.addEventListener('dispose', () => (disposed = true));
  ground.update({ x: 0, z: 0 });
  assert.equal(triangles(tiles[middle]), full[middle]);
  assert.ok(triangles(tiles[middle]) > plain.index.count / 3);
  assert.ok(disposed);
});

test('as the camera drives along, the tiles that change are redrawn one a frame', () => {
  const { ground, tiles } = plainGround();
  ground.update({ x: 0, z: 0 });
  const made = () => tiles.map(tile => tile.geometry.uuid);
  // A long way in small steps: each call changes at most one tile, and they all catch up.
  let most = 0;
  for (let x = 0; x <= 600; x += 5) {
    const before = made();
    ground.update({ x, z: 0 });
    most = Math.max(most, made().filter((id, i) => id !== before[i]).length);
  }
  assert.equal(most, 1);
  for (let k = 0; k < 20; k++) ground.update({ x: 600, z: 0 });
  const caughtUp = made();
  const { tiles: other, ground: jumped } = plainGround();
  jumped.update({ x: 600, z: 0 });
  assert.deepEqual(tiles.map(triangles), other.map(triangles));
  ground.update({ x: 600, z: 0 });
  assert.deepEqual(made(), caughtUp);
});

test('ground too far from the camera to be seen is left out of the picture', () => {
  const { ground, tiles } = plainGround();
  ground.update({ x: 0, z: 0 });
  assert.ok(tiles.every(tile => tile.visible));
  ground.update({ x: 1800 + SIGHT + 100, z: 0 });
  assert.ok(tiles.every(tile => !tile.visible));
  ground.update({ x: 1800 + SIGHT - 400, z: 0 });
  const seen = tiles.filter(tile => tile.visible).length;
  assert.ok(seen > 0 && seen < tiles.length, `${seen} of ${tiles.length} tiles in the picture`);
});
