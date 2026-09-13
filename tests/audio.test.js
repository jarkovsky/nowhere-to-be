import test from 'node:test';
import assert from 'node:assert/strict';
import { engineRpm } from '../src/core/audio.js';

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
