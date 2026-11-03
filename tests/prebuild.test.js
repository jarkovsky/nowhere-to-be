import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/core/math.js';
import { packField, unpackField } from '../src/world/heightfield.js';
import { GROUND_DRAWS, SCENERY_SEED, shadeGround } from '../src/world/groundcolor.js';
import { heightField } from '../src/world/terrain.js';

test('skipping random numbers lands where drawing them would', () => {
  for (const count of [0, 1, 17, 123457]) {
    const [drawn, skipped] = [createRandom(SCENERY_SEED), createRandom(SCENERY_SEED)];
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

test('the ground draws as many random numbers as the scenery skips for it', () => {
  // The trees, rocks and flowers are placed from where the ground's colours leave off.
  const random = createRandom(SCENERY_SEED);
  let draws = 0;
  shadeGround(() => {
    draws++;
    return random();
  });
  assert.equal(draws, GROUND_DRAWS);
});
