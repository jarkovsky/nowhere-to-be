import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournal, sanitise, SAVE_KEY } from '../src/core/journal.js';

function memoryStorage(initial) {
  const map = new Map(initial ? [[SAVE_KEY, JSON.stringify(initial)]] : []);
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}

test('gnomes are recorded once and survive a reload, with the car choices', () => {
  const storage = memoryStorage();
  const journal = createJournal(storage);
  assert.equal(journal.collectGnome(3), true);
  assert.equal(journal.collectGnome(3), false);
  journal.save({
    color: 'blue',
    vehicle: 'tractor',
    decorations: ['flag', 'teddy', 'tent'],
    camp: true,
  });
  assert.deepEqual(createJournal(storage).get(), journal.get());
});

test('corrupt or edited saves fall back to safe values', () => {
  assert.deepEqual(createJournal({ getItem: () => '{broken', setItem() {} }).get().gnomes, []);
  const cleaned = sanitise({
    gnomes: [1, -1, 'x', 2.5],
    color: 'neon',
    vehicle: 'rocket',
    horn: 'siren',
    decorations: ['rocket', 'flag', 'flag'],
    camp: 'yes',
  });
  assert.deepEqual(cleaned.gnomes, [1]);
  assert.equal(cleaned.color, 'orange');
  assert.equal(cleaned.vehicle, 'offroader');
  assert.equal(cleaned.horn, undefined, 'horn sounds are no longer chosen');
  assert.deepEqual(cleaned.decorations, ['flag']);
  assert.equal(cleaned.camp, false);
});

test('saves from before roof items could be combined keep their single item', () => {
  assert.deepEqual(sanitise({ decoration: 'teddy' }).decorations, ['teddy']);
  assert.deepEqual(sanitise({ decoration: 'none' }).decorations, []);
});

test('rainbow paint needs to be unlocked first', () => {
  assert.equal(sanitise({ color: 'rainbow' }).color, 'orange');
  assert.equal(sanitise({ color: 'rainbow', rainbow: true }).color, 'rainbow');
});

test('the game keeps working when storage is unavailable', () => {
  const journal = createJournal({
    getItem: () => null,
    setItem() {
      throw new Error('quota');
    },
  });
  assert.equal(journal.collectGnome(2), true);
  assert.equal(journal.isPersistent(), false);
  assert.deepEqual(journal.get().gnomes, [2]);
  assert.equal(createJournal(null).collectGnome(2), true);
});
