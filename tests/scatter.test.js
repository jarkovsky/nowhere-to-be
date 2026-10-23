import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SHADOW_LAYER, createScatter } from '../src/world/scatter.js';

/** Items every 10 m across a square 1 km wide. */
function grid() {
  const items = [];
  for (let x = -500; x <= 500; x += 10) {
    for (let z = -500; z <= 500; z += 10) items.push({ matrix: new THREE.Matrix4().makeTranslation(x, 0, z) });
  }
  return items;
}

/** Where the instances drawn by the visible meshes (or the shadow meshes) stand. */
function drawn(group, { shadows = false } = {}) {
  const spots = [];
  const matrix = new THREE.Matrix4();
  for (const mesh of group.children) {
    if (!mesh.visible || (mesh.layers.mask === 1 << SHADOW_LAYER) !== shadows) continue;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      spots.push({ x: matrix.elements[12], z: matrix.elements[14], near: mesh.geometry.type === 'BoxGeometry' });
    }
  }
  return spots;
}

test('every item is drawn once, in full near the camera and as its far shape beyond', () => {
  const group = new THREE.Group();
  const scatter = createScatter(group);
  const items = grid();
  scatter.add({ geometry: new THREE.BoxGeometry(), far: new THREE.SphereGeometry(), near: 120, items, shadows: false });
  for (const eye of [
    { x: 0, z: 0 },
    { x: 5, z: 3 },
    { x: 60, z: -20 },
    { x: 400, z: 380 },
    { x: -2000, z: 0 },
  ]) {
    scatter.update(eye, null);
    const spots = drawn(group);
    assert.equal(spots.length, items.length, `at ${eye.x}, ${eye.z}`);
    assert.equal(new Set(spots.map(p => `${p.x},${p.z}`)).size, items.length);
    for (const spot of spots) {
      const distance = Math.hypot(spot.x - eye.x, spot.z - eye.z);
      // The near meshes are refilled every few metres, so their edge can trail the camera a little.
      if (spot.near) assert.ok(distance < 130, `drawn in full ${distance.toFixed(0)} m away`);
      else assert.ok(distance > 110, `drawn plain ${distance.toFixed(0)} m away`);
    }
  }
});

test('small things are only drawn near the camera', () => {
  const group = new THREE.Group();
  const scatter = createScatter(group);
  scatter.add({ geometry: new THREE.BoxGeometry(), near: 60, items: grid(), shadows: false });
  scatter.update({ x: 100, z: 100 }, null);
  const spots = drawn(group);
  assert.ok(spots.length > 80 && spots.length < 140, `${spots.length} drawn`);
  for (const spot of spots) assert.ok(Math.hypot(spot.x - 100, spot.z - 100) <= 60);
});

test('everything standing in the sun’s shadow box casts a shadow', () => {
  const group = new THREE.Group();
  const scatter = createScatter(group);
  scatter.add({ geometry: new THREE.BoxGeometry(), far: new THREE.BoxGeometry(), items: grid() });
  const sun = new THREE.DirectionalLight();
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75 });
  for (const [x, z, height] of [
    [0, 0, 160],
    [210, -130, 45],
  ]) {
    sun.target.position.set(x, 0, z);
    sun.position.set(x - 90, height, z - 85);
    scatter.update({ x, z }, sun);
    // The shadow camera, placed the way the renderer places it.
    const camera = sun.shadow.camera;
    camera.position.copy(sun.position);
    camera.lookAt(sun.target.position);
    camera.updateMatrixWorld();
    const inBox = grid().filter(({ matrix }) => {
      const p = new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(camera.matrixWorldInverse);
      return Math.abs(p.x) <= 75 && Math.abs(p.y) <= 75;
    });
    const casting = new Set(drawn(group, { shadows: true }).map(p => `${p.x},${p.z}`));
    assert.ok(inBox.length > 100);
    for (const { matrix } of inBox) assert.ok(casting.has(`${matrix.elements[12]},${matrix.elements[14]}`));
    // And not much else.
    assert.ok(casting.size < inBox.length * 1.6, `${casting.size} cast shadows for ${inBox.length} in the box`);
  }
});
