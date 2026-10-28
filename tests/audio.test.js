import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { engineRpm } from '../src/core/audio.js';
import { TRACKS, shuffleOrder } from '../src/core/music.js';
import { createRandom } from '../src/core/math.js';

test('the engine idles, revs through the gears and drops at each shift', () => {
  assert.equal(engineRpm(0, 0), 850);
  assert.ok(engineRpm(0, 1) > engineRpm(0, 0), 'blipping the throttle while stopped');
  let previous = engineRpm(0.5, 1);
  let shifts = 0;
  for (let speed = 0.6; speed <= 14; speed += 0.1) {
    const rpm = engineRpm(speed, 1);
    if (rpm < previous - 500) shifts++;
    assert.ok(rpm <= 4200, `over-revving at ${speed.toFixed(1)} m/s`);
    previous = rpm;
  }
  assert.equal(shifts, 3, 'four gears, three up-shifts');
  assert.equal(engineRpm(-3, 1), engineRpm(3, 1), 'reverse sounds like first gear');
});

test('the music plays every track once a round, never the same one twice running', () => {
  const random = createRandom(12);
  let last = -1;
  for (let round = 0; round < 200; round++) {
    const order = shuffleOrder(TRACKS.length, last, random);
    assert.deepEqual(
      [...order].sort(),
      TRACKS.map((_, i) => i),
    );
    assert.notEqual(order[0], last, 'the last track of a round opening the next');
    last = order.at(-1);
  }
  assert.deepEqual(shuffleOrder(1, 0), [0], 'one track just plays again');
});

test('every music track has its file', () => {
  for (const track of TRACKS) assert.ok(existsSync(new URL(`../public/music/${track}.mp3`, import.meta.url)), track);
});
