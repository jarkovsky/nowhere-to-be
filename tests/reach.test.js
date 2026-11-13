import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import './dom.js';
import { buildLandmarks, reachOf } from '../src/world/landmarks/index.js';
import { buildScenery } from '../src/world/scenery.js';
import { SIGHT } from '../src/world/sight.js';

const scene = new THREE.Scene();
const scenery = buildScenery(scene);
const landmarks = buildLandmarks(scene, [...scenery.obstacles]);
const places = Object.entries(landmarks.places).filter(([, place]) => Number.isFinite(place.sphere.radius));

/** A camera at (x, z), a little above the ground, looking the way (dx, dz). */
function cameraAt(x, z, dx = 0, dz = -1) {
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.5, 1900);
  camera.position.set(x, 30, z);
  camera.lookAt(x + dx * 100, 30, z + dz * 100);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

test('nothing in a landmark strays outside the reach it is taken out of view by', () => {
  // A quarter of an hour of everything going on, the car standing by each place in turn, honking.
  const stops = places.map(([, { sphere }]) => ({ x: sphere.center.x, z: sphere.center.z, speed: 0, heading: 0 }));
  for (let step = 0; step < 9000; step++) {
    const player = stops[Math.floor(step / 300) % stops.length];
    if (step % 300 === 0) landmarks.hearHorn(player.x, player.z);
    landmarks.update(0.1, (step % 2000) / 2000, { crossingClosed: step % 900 < 200, player });
    if (step % 1500 !== 1499) continue;
    for (const [name, { group, sphere }] of places) {
      const now = reachOf(group, false);
      const beyond = now.center.distanceTo(sphere.center) + now.radius - sphere.radius;
      assert.ok(beyond <= 0, `${name} reaches ${beyond.toFixed(1)} m further than it says`);
    }
  }
});

test('a landmark is in the picture while the camera can see it or stands close by, and not otherwise', () => {
  const [name, { group, sphere }] = places.find(([name]) => name === 'tower');
  const { x, z } = sphere.center;
  const inScene = () => group.parent === scene;
  // Looked at from afar, in the picture; with the camera turned away, out of it.
  landmarks.show(cameraAt(x, z + 800, 0, -1));
  assert.ok(inScene(), `${name} in view`);
  landmarks.show(cameraAt(x, z + 800, 0, 1));
  assert.ok(!inScene(), `${name} behind the camera`);
  // Close by it stays, whichever way the camera looks: its shadow may still be in view.
  landmarks.show(cameraAt(x, z + 120, 0, 1));
  assert.ok(inScene(), `${name} close by`);
  // Too far off to be made out, it is neither drawn nor kept moving.
  landmarks.show(cameraAt(x, z + SIGHT + sphere.radius + 50, 0, -1));
  assert.ok(!inScene() && !landmarks.places[name].near);
  landmarks.show(cameraAt(x, z + SIGHT - 50, 0, -1));
  assert.ok(landmarks.places[name].near);
});
