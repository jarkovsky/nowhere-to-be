import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  ANIMAL_FILES,
  RECORDED_FILES,
  SURFACE_TYRES,
  TYRE_FILES,
  pickVariant,
  rotorRate,
  tyreBed,
} from '../src/core/recorded.js';
import { createRandom } from '../src/core/math.js';

const credits = readFileSync(new URL('../public/sounds/CREDITS.md', import.meta.url), 'utf8');

test('every recorded sound is there, credited, and small', () => {
  let bytes = 0;
  for (const file of RECORDED_FILES) {
    const url = new URL(`../public/sounds/${file}.mp3`, import.meta.url);
    assert.ok(existsSync(url), `${file} is missing`);
    assert.ok(credits.includes(`\`${file}.mp3\``), `${file} is not credited`);
    bytes += statSync(url).size;
  }
  assert.ok(bytes < 3e6, `${bytes} bytes`);
});

test('every credit names its source page and a CC0 recording', () => {
  const section = credits.slice(credits.indexOf('## Recorded in place'));
  assert.match(section, /CC0 1\.0/);
  for (const file of RECORDED_FILES.filter(name => name !== 'owl')) {
    const row = section.split('\n').find(line => line.includes(`\`${file}.mp3\``));
    assert.ok(row, `${file} has no row`);
    assert.match(row, /https:\/\/freesound\.org\/people\/\S+\/sounds\/\d+\//, file);
  }
});

test('each animal has at least two variants and its calls never repeat', () => {
  assert.deepEqual(Object.keys(ANIMAL_FILES).sort(), [
    'baa',
    'cluck',
    'honk',
    'hoot',
    'howl',
    'moo',
    'neigh',
    'oink',
    'quack',
  ]);
  const random = createRandom(5);
  for (const [kind, files] of Object.entries(ANIMAL_FILES)) {
    assert.ok(files.length >= 2, kind);
    const last = {};
    let previous = null;
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
      const file = pickVariant(files, kind, last, random);
      assert.notEqual(file, previous, `${kind} repeated ${file}`);
      previous = file;
      seen.add(file);
    }
    assert.equal(seen.size, files.length, `${kind} never plays some variant`);
  }
});

test('every kind of ground the tyres can be on maps to a loop, or deliberately to none', () => {
  // The kinds `effectAt` in src/world/surfaces.js can return.
  const source = readFileSync(new URL('../src/world/surfaces.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function effectAt'), source.indexOf('const UP'));
  const kinds = new Set([...body.matchAll(/return '(\w+)'/g)].map(match => match[1]));
  // The patches from the layout (`id: 'mud'`, 'leaves', 'puddle') and the sand come back through `surfaceAt`.
  for (const kind of ['mud', 'leaves', 'puddle', 'sand', 'grass']) kinds.add(kind);
  for (const kind of kinds) assert.ok(kind in SURFACE_TYRES, `${kind} has no entry`);
  for (const kind of ['water', 'puddle', 'mud']) assert.equal(tyreBed(kind), null, `${kind} keeps its own sound`);
  for (const kind of ['snow', 'leaves', 'sand', 'crop']) assert.equal(tyreBed(kind), kind);
  assert.equal(tyreBed('grass', 'tarmac'), 'tarmac');
  assert.equal(tyreBed('grass', 'gravel'), 'gravel');
  assert.equal(tyreBed('grass', 'grass'), 'grass');
  assert.equal(tyreBed('grass'), 'grass');
  // Every loop it can pick has a file.
  for (const kind of kinds) {
    for (const ground of ['grass', 'gravel', 'tarmac']) {
      const bed = tyreBed(kind, ground);
      if (bed) assert.ok(TYRE_FILES[bed], `${kind} on ${ground}`);
    }
  }
});

test('the rotor recordings play faster as the blades beat faster, within bounds', () => {
  for (const plane of [false, true]) {
    const [low, high] = plane ? [18, 44] : [4, 18];
    assert.ok(rotorRate(plane, high) > rotorRate(plane, low));
    assert.ok(rotorRate(plane, low) >= 0.5 && rotorRate(plane, high) <= 1.3);
  }
});
