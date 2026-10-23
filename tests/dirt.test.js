import test from 'node:test';
import assert from 'node:assert/strict';
import { stepDirt } from '../src/core/dirt.js';

const drive = (dirt, surface, seconds, { speed = 7, rain = 0 } = {}) => {
  for (let t = 0; t < seconds; t += 0.05) dirt = stepDirt(dirt, { surface, speed, rain }, 0.05);
  return dirt;
};

test('a drive through the mud cakes the car, and grass only leaves it dusty', () => {
  assert.ok(drive(0, 'mud', 3) > 0.9);
  const dusty = drive(0, 'grass', 300);
  assert.ok(dusty > 0.3 && dusty <= 0.4);
  // Grass doesn't clean off mud, either.
  assert.equal(drive(0.9, 'grass', 10), 0.9);
});

test('water washes the car, even crawling through it, and rain does slowly', () => {
  assert.equal(drive(1, 'water', 3), 0);
  assert.ok(drive(1, 'water', 5, { speed: 0.5 }) < 0.1);
  assert.ok(drive(1, 'road', 30, { rain: 1 }) < 0.2);
});

test('standing still in the mud adds nothing', () => {
  assert.equal(drive(0, 'mud', 10, { speed: 0 }), 0);
});
