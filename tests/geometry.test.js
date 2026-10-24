import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom.js';
import { checkEverything } from '../src/dev/checks.js';

const baseline = JSON.parse(readFileSync(new URL('./geometry-baseline.json', import.meta.url), 'utf8'));

test('no landmark or model has more geometry faults than recorded in the baseline', () => {
  const worse = [];
  for (const [id, counts] of Object.entries(checkEverything())) {
    for (const [kind, count] of Object.entries(counts)) {
      const allowed = baseline[id]?.[kind] ?? 0;
      if (count > allowed) worse.push(`${id}: ${count} ${kind} (baseline ${allowed})`);
    }
  }
  // Look at them in the object viewer (npm run dev, then /viewer.html). Once fixed, or if
  // they really are fine, `npm run geometry` records the new counts.
  assert.deepEqual(worse, []);
});

test('the checks find a floating part, an open plane, two faces that flicker and a floor the car sinks into', async () => {
  const THREE = await import('three');
  const { inspect } = await import('../src/dev/inspect.js');
  const { PartsBuilder } = await import('../src/world/build.js');
  const kinds = build =>
    inspect(build(new PartsBuilder()).mesh(), { ground: () => 0, drivable: () => 0 }).map(i => i.kind);
  assert.deepEqual(
    kinds(p => p.box(1, 1, 1, '#fff', { y: 0.5 })),
    [],
  );
  assert.deepEqual(
    kinds(p => p.box(1, 1, 1, '#fff', { y: 2 })),
    ['floating'],
  );
  assert.deepEqual(
    kinds(p => p.add(new THREE.PlaneGeometry(1, 1), '#fff', { y: 0.5 })),
    ['one-sided'],
  );
  assert.deepEqual(
    kinds(p => p.box(1, 1, 1, '#fff', { y: 0.5 }).box(0.5, 1, 0.5, '#f00', { y: 0.5, x: 0.25, z: 0.1 })),
    ['flicker'],
  );
  assert.deepEqual(
    kinds(p => p.box(3, 0.4, 3, '#fff', { y: 0.2 })),
    ['sinks'],
  );
});
