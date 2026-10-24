import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom.js';
import { checkEverything, findingKey } from '../src/dev/checks.js';

const baseline = JSON.parse(readFileSync(new URL('./geometry-baseline.json', import.meta.url), 'utf8'));

test('every geometry fault in the world is one recorded in the baseline, and every one recorded is still there', () => {
  const unexpected = [];
  const gone = [];
  const results = checkEverything();
  for (const id of Object.keys(baseline)) if (!(id in results)) gone.push(`${id}: no such landmark or model`);
  for (const [id, issues] of Object.entries(results)) {
    const known = baseline[id] ?? {};
    const keys = new Set();
    for (const issue of issues) {
      const key = findingKey(issue);
      keys.add(key);
      if (!(key in known)) unexpected.push(`${id}: ${issue.kind} ${issue.message}`);
    }
    for (const key of Object.keys(known)) if (!keys.has(key)) gone.push(`${id}: ${key}`);
  }
  // Look at new ones with `npm run check -- <id>` or in the object viewer (npm run dev, then
  // /viewer.html). Once fixed, or if they really are fine, `npm run geometry` records the new list.
  assert.deepEqual(unexpected, [], 'new faults');
  assert.deepEqual(gone, [], 'faults in the baseline that are no longer there: record the list again');
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

test('a part only counts as held up where its surface meets another, not where their boxes overlap', async () => {
  const { inspect } = await import('../src/dev/inspect.js');
  const { PartsBuilder } = await import('../src/world/build.js');
  const kinds = build => inspect(build(new PartsBuilder()).mesh(), { ground: () => 0 }).map(i => i.kind);
  // Two diagonal beams side by side, their boxes overlapping either way, the second either just
  // beside the first or well clear of it.
  const beams = (p, apart) =>
    p
      .beam({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 3 }, 0.2, '#fff')
      .beam({ x: apart, y: 1, z: 1 }, { x: apart, y: 2.5, z: 2.5 }, 0.2, '#fff');
  assert.deepEqual(
    kinds(p => beams(p, 0.6)),
    ['floating'],
  );
  assert.deepEqual(
    kinds(p => beams(p, 0.25)),
    [],
  );
});

test('a roof standing clear of the walls under it is found, a roof resting on them is not', async () => {
  const { inspect } = await import('../src/dev/inspect.js');
  const { PartsBuilder, hipRoof } = await import('../src/world/build.js');
  const house = lift =>
    new PartsBuilder()
      .box(6, 3, 6, '#fff', { y: 1.5 })
      // A pyramid roof whose eaves reach out 0.6 m past the walls; its slope crosses the wall line 0.4 m up.
      .add(hipRoof(7.2, 7.2, 3 + lift - 0.4, 0, 0, 5 + lift), '#a33', {})
      .mesh();
  const gaps = lift => inspect(house(lift), { ground: () => 0 }).filter(i => i.kind === 'roof-gap');
  assert.deepEqual(gaps(0), []);
  const found = gaps(0.5);
  assert.ok(found.length > 0);
  assert.ok(Math.abs(found[0].gap - 0.5) < 0.02, `gap ${found[0].gap}`);
});

test('hidden parts are left out, and a surface made to be seen from both sides is not see-through', async () => {
  const THREE = await import('three');
  const { inspect } = await import('../src/dev/inspect.js');
  const { PartsBuilder, bothSides } = await import('../src/world/build.js');
  const root = new THREE.Group();
  root.add(new PartsBuilder().box(1, 1, 1, '#fff', { y: 0.5 }).mesh());
  const hidden = new THREE.Group();
  hidden.visible = false;
  hidden.add(new PartsBuilder().box(1, 1, 1, '#fff', { y: 3 }).mesh());
  root.add(hidden);
  assert.deepEqual(inspect(root, { ground: () => 0 }), []);
  const sheet = new PartsBuilder().add(bothSides(new THREE.PlaneGeometry(1, 1)), '#fff', { y: 0.5 }).mesh();
  assert.deepEqual(
    inspect(sheet, { ground: () => 0 }).map(i => i.kind),
    [],
  );
});

test('a wall that stands out past the obstacles round it is found', async () => {
  const { inspect } = await import('../src/dev/inspect.js');
  const { PartsBuilder } = await import('../src/world/build.js');
  const { createObstacleIndex } = await import('../src/core/collision.js');
  const house = new PartsBuilder().box(8, 3, 5, '#fff', { y: 1.5 }).mesh();
  const found = obstacles =>
    inspect(house, { ground: () => 0, obstacles: createObstacleIndex(obstacles) }).filter(i => i.kind === 'drive-in');
  // A circle round its middle leaves the corners out; a box round its walls doesn't.
  assert.equal(found([{ x: 0, z: 0, radius: 4 }]).length, 1);
  assert.deepEqual(found([{ x: 0, z: 0, halfX: 4.1, halfZ: 2.6, rotation: 0, radius: 0 }]), []);
});
