import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/core/math.js';
import { packField, unpackField } from '../src/world/heightfield.js';
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

test('the height field comes from the worker as it was built', () => {
  // What the worker sends is copied as a message would be.
  const sent = unpackField(structuredClone(packField(heightField)));
  assert.deepEqual(sent, heightField);
  sent.fords.forEach((ford, i) => {
    assert.equal(ford.river, heightField.fords[i].river);
    assert.equal(ford.path, heightField.fords[i].path);
  });
});
