import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/core/math.js';
import { compileWorld } from '../src/world/compile.js';
import { unpackField } from '../src/world/heightfield.js';
import { pack, unpack } from '../src/world/pack.js';
import { heightField } from '../src/world/terrain.js';

test('skipping random numbers lands where drawing them would', () => {
  // The last is how many the scenery skips for the ground's old share of its numbers.
  for (const count of [0, 1, 17, 123457, 625 * 625 * 4]) {
    const [drawn, skipped] = [createRandom(82741), createRandom(82741)];
    for (let i = 0; i < count; i++) drawn();
    skipped.skip(count);
    assert.deepEqual([drawn(), drawn()], [skipped(), skipped()], `after ${count}`);
  }
});

test('a run of random numbers can be picked up again from where it had got to', () => {
  const first = createRandom(6011);
  for (let i = 0; i < 1000; i++) first();
  const again = createRandom(first.state());
  assert.deepEqual([first(), first(), first()], [again(), again(), again()]);
});

test('data comes back from its bytes as it went in, typed arrays and all', () => {
  const value = {
    name: 'a',
    list: [1, 2.5, -3e-7, 0.1 + 0.2],
    nested: { floats: Float32Array.of(1.5, -2.25, 1e-20), doubles: Float64Array.of(Math.PI, -1 / 3) },
    arrays: [Int32Array.of(-7, 2 ** 31 - 1), Uint8Array.of(0, 255, 3), Int8Array.of(-128, 127), Uint16Array.of(65535)],
    empty: new Float32Array(0),
  };
  const back = unpack(pack(value));
  assert.deepEqual(back, value);
  assert.ok(back.nested.floats instanceof Float32Array && back.arrays[0] instanceof Int32Array);
  assert.throws(() => unpack(new Uint8Array(16)), /Not packed/);
});

test('the world worked out ahead of time is the one that would be worked out on the page', () => {
  const compiled = compileWorld();
  const loaded = unpack(pack(compiled));
  assert.deepEqual(loaded, compiled);
  // The height field, with every ford back on its own river and road.
  const field = unpackField(loaded.heights);
  assert.deepEqual(field, heightField);
  field.fords.forEach((ford, i) => {
    assert.equal(ford.river, heightField.fords[i].river);
    assert.equal(ford.path, heightField.fords[i].path);
  });
  assert.equal(loaded.ground.colors.length, heightField.heights.length * 4);
});
