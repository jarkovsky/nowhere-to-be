import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HELIPAD } from '../src/world/layout.js';
import { terrainHeight } from '../src/world/terrain.js';
import { createHelicopter } from '../src/vehicles/helicopter.js';

test('a honk beside the helipad sends the helicopter round the valley and back onto the pad', () => {
  let takeOffs = 0;
  const helicopter = createHelicopter(new THREE.Scene(), { onTakeOff: () => takeOffs++ });
  assert.equal(helicopter.hearHorn({ x: HELIPAD.x + 200, z: HELIPAD.z }), false, 'too far away to hear');
  assert.equal(helicopter.hearHorn({ x: HELIPAD.x + 10, z: HELIPAD.z }), true);
  assert.equal(takeOffs, 1);
  let highest = -Infinity;
  let lowestClearance = Infinity;
  for (let t = 0; t < 180 && (t < 10 || helicopter.getState().phase !== 'parked'); t += 0.05) {
    helicopter.update(0.05);
    const { x, y, z, phase } = helicopter.getState();
    highest = Math.max(highest, y);
    if (phase === 'flying') lowestClearance = Math.min(lowestClearance, y - terrainHeight(x, z));
  }
  const { phase, x, z } = helicopter.getState();
  assert.equal(phase, 'parked');
  assert.ok(Math.hypot(x - HELIPAD.x, z - HELIPAD.z) < 0.01, 'back on the pad');
  assert.ok(highest > terrainHeight(HELIPAD.x, HELIPAD.z) + 30, 'it actually flew');
  assert.ok(lowestClearance > 15, `skimmed the ground at ${lowestClearance.toFixed(1)} m`);
});
