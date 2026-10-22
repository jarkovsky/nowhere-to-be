import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIRFIELD } from '../src/world/layout.js';
import { createPlanes } from '../src/vehicles/plane.js';
import { terrainHeight } from '../src/world/terrain.js';

const away = { x: 0, z: 0 };
const onRunway = { x: AIRFIELD.x, z: 120 };
const stand = { x: 560, z: 184 };

/** Steps the plane until `until(state)` holds, recording the phases it passes through. */
function run(planes, player, seconds, until = () => false) {
  const phases = [];
  let lowest = Infinity;
  for (let t = 0; t < seconds; t += 1 / 20) {
    planes.update(1 / 20, { player: typeof player === 'function' ? player(planes.getState()) : player });
    const state = planes.getState();
    if (phases.at(-1) !== state.phase) phases.push(state.phase);
    // Away from the airfield, once it has climbed out.
    const out = Math.hypot(state.x - AIRFIELD.x, state.z - 116) > 400;
    if (state.phase === 'flying' && out) lowest = Math.min(lowest, state.y - terrainHeight(state.x, state.z));
    if (until(state)) break;
  }
  return { phases, lowest, state: planes.getState() };
}

test('the plane flies a loop round the uplands and comes back to its stand', () => {
  const planes = createPlanes(new THREE.Scene(), []);
  assert.equal(planes.hearHorn(stand), true, 'a honk beside it sends it off');
  const { phases, lowest, state } = run(planes, away, 600, s => s.phase === 'parked');
  assert.deepEqual(phases, [
    'starting',
    'taxiOut',
    'holding',
    'rolling',
    'flying',
    'landing',
    'rollout',
    'stopping',
    'parked',
  ]);
  assert.ok(lowest > 40, `it stays well clear of the hills (${lowest.toFixed(1)} m)`);
  assert.ok(Math.hypot(state.x - stand.x, state.z - stand.z) < 1, 'and parks where it started');
});

test('the plane waits while someone is on the runway', () => {
  const planes = createPlanes(new THREE.Scene(), []);
  planes.hearHorn(stand);
  const { state } = run(planes, onRunway, 120);
  assert.equal(state.phase, 'holding');
  assert.equal(run(planes, away, 30, s => s.phase === 'flying').state.phase, 'flying');
});

test('the plane goes round again if the runway is busy as it comes in to land', () => {
  const planes = createPlanes(new THREE.Scene(), []);
  planes.hearHorn(stand);
  run(planes, away, 120, s => s.phase === 'flying');
  // Someone drives onto the runway while it is away, and leaves once it has gone round again.
  const { phases, state } = run(
    planes,
    s => (s.laps < 2 ? onRunway : away),
    900,
    s => s.phase === 'parked',
  );
  assert.equal(state.laps, 2, 'it flew the loop again');
  assert.ok(phases.includes('landing') && phases.at(-1) === 'parked', 'and landed once the runway was clear');
});
