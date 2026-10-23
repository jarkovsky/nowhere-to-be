import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KRYSTOF, ROCK_GATE } from '../src/world/layout.js';
import { terrainHeight, waterLevel } from '../src/world/terrain.js';
import { AIR_AMBULANCE, VALLEY_RESCUE, createHelicopter } from '../src/vehicles/helicopter.js';

/** Flies a whole round after a honk by the pad, noting where it went. */
function flyRound(spec) {
  const helicopter = createHelicopter(new THREE.Scene(), spec);
  const { pad } = spec;
  assert.equal(helicopter.hearHorn({ x: pad.x + 200, z: pad.z }), false, 'too far away to hear');
  assert.equal(helicopter.hearHorn({ x: pad.x + 10, z: pad.z }), true);
  assert.equal(helicopter.getState().phase, 'starting');
  const flight = [];
  for (let t = 0; t < 400 && (t < 10 || helicopter.getState().phase !== 'parked'); t += 0.05) {
    helicopter.update(0.05);
    flight.push(helicopter.getState());
  }
  return { helicopter, flight };
}

for (const [name, spec, clearance] of [
  ['red and white helicopter', VALLEY_RESCUE, 15],
  ['yellow air ambulance', AIR_AMBULANCE, 5],
]) {
  test(`a honk beside its pad sends the ${name} off on its round and back onto the pad`, () => {
    const { helicopter, flight } = flyRound(spec);
    const { phase, x, z } = helicopter.getState();
    assert.equal(phase, 'parked');
    assert.ok(Math.hypot(x - spec.pad.x, z - spec.pad.z) < 0.01, 'back on the pad');
    const ground = terrainHeight(spec.pad.x, spec.pad.z);
    assert.ok(Math.max(...flight.map(p => p.y)) > ground + 30, 'it actually flew');
    const lowest = Math.min(
      ...flight
        .filter(p => p.phase === 'flying')
        .map(p => p.y - Math.max(terrainHeight(p.x, p.z), waterLevel(p.x, p.z))),
    );
    assert.ok(lowest > clearance, `skimmed the ground at ${lowest.toFixed(1)} m`);
  });
}

test('the air ambulance flies under the rock arch and along the fjord', () => {
  const { flight } = flyRound(AIR_AMBULANCE);
  const road = terrainHeight(ROCK_GATE.x, ROCK_GATE.z);
  const underArch = flight.filter(p => Math.hypot(p.x - ROCK_GATE.x, p.z - ROCK_GATE.z) < 4);
  assert.ok(underArch.length > 0, 'it passes through the arch');
  for (const p of underArch)
    assert.ok(p.y - road < ROCK_GATE.height - 7, `too high for the arch at ${(p.y - road).toFixed(1)} m`);
  const overFjord = flight.filter(p => waterLevel(p.x, p.z) > -Infinity && p.y - waterLevel(p.x, p.z) < 16);
  assert.ok(overFjord.length > 100, 'low over the water for a while');
});

test('the air ambulance goes out on its own every few minutes', () => {
  const helicopter = createHelicopter(new THREE.Scene(), AIR_AMBULANCE);
  for (let t = 0; t < KRYSTOF.every - 1; t += 0.5) helicopter.update(0.5);
  assert.equal(helicopter.getState().phase, 'parked');
  helicopter.update(2);
  assert.notEqual(helicopter.getState().phase, 'parked');
});
