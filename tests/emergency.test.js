import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ROAD } from '../src/world/layout.js';
import { createTraffic, LANE } from '../src/vehicles/traffic.js';

/** Runs the traffic with the player parked at `player`, recording what happens. */
function watch(traffic, player, seconds) {
  const seen = { closest: Infinity, pulledOver: false, gone: false };
  for (let t = 0; t < seconds && !seen.gone; t += 1 / 30) {
    traffic.update(1 / 30, { player, night: 0 });
    const emergency = traffic.emergency();
    if (!emergency) {
      seen.gone = true;
      break;
    }
    seen.closest = Math.min(seen.closest, Math.hypot(emergency.x - player.x, emergency.z - player.z));
    if (traffic.getState().some(traveller => traveller.pulledOver)) seen.pulledOver = true;
  }
  return seen;
}

test('an emergency vehicle comes past the player, the others pull over, and then it goes on its way', () => {
  const traffic = createTraffic(new THREE.Scene());
  // Parked on the verge, out of everyone's way.
  const player = ROAD.offset(ROAD.length * 0.55, 8);
  assert.equal(traffic.callOut(player), true);
  const start = traffic.emergency();
  assert.ok(Math.hypot(start.x - player.x, start.z - player.z) > 120, 'it starts out of sight');
  const seen = watch(traffic, player, 180);
  assert.ok(seen.closest < 14, `it drove past (closest ${seen.closest.toFixed(0)} m)`);
  assert.ok(seen.pulledOver, 'other travellers pulled over');
  assert.ok(seen.gone, 'and it left again');
});

test('an emergency vehicle goes round a car stopped in its lane', () => {
  const traffic = createTraffic(new THREE.Scene());
  const s = ROAD.length * 0.55;
  traffic.callOut(ROAD.offset(s, 0));
  // Wherever it was sent from, stand in the lane it drives in.
  const { x, z } = traffic.emergency();
  const direction = ROAD.wrap(ROAD.nearest(x, z).s - s) > ROAD.length / 2 ? 1 : -1;
  const player = ROAD.offset(s, direction * LANE);
  const seen = watch(traffic, player, 180);
  assert.ok(seen.closest < 9 && seen.gone, `it got past (closest ${seen.closest.toFixed(0)} m)`);
});
