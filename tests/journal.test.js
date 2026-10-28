import test from 'node:test';
import assert from 'node:assert/strict';
import { createJournal, sanitise, SAVE_KEY } from '../src/core/journal.js';

const pick = ({ vehicle, color }) => ({ vehicle, color });

function memoryStorage(initial) {
  const map = new Map(initial ? [[SAVE_KEY, JSON.stringify(initial)]] : []);
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}

test('car choices survive a reload', () => {
  const storage = memoryStorage();
  const journal = createJournal(storage);
  journal.save({
    color: 'blue',
    vehicle: 'lorry',
    decorations: ['flag', 'teddy', 'tent'],
    camp: true,
  });
  assert.deepEqual(createJournal(storage).get(), journal.get());
});

test('corrupt or edited saves fall back to safe values', () => {
  assert.equal(createJournal({ getItem: () => '{broken', setItem() {} }).get().vehicle, 'offroader');
  const cleaned = sanitise({
    gnomes: [1, 2],
    color: 'neon',
    vehicle: 'rocket',
    horn: 'siren',
    decorations: ['rocket', 'flag', 'flag'],
    camp: 'yes',
  });
  assert.equal(cleaned.gnomes, undefined, 'garden gnomes are no longer collected');
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

test('saves with one of the old lorries get the lorry, in the paint nearest its colour', () => {
  assert.deepEqual(pick(sanitise({ vehicle: 'oliver', color: 'orange' })), { vehicle: 'lorry', color: 'blue' });
  assert.deepEqual(pick(sanitise({ vehicle: 'ruda', color: 'sage' })), { vehicle: 'lorry', color: 'orange' });
  // Old saves without a colour, or with the rainbow, still get the lorry's own colour, and the rainbow stays unlocked.
  assert.deepEqual(pick(sanitise({ vehicle: 'oliver' })), { vehicle: 'lorry', color: 'blue' });
  const rainbow = sanitise({ vehicle: 'ruda', color: 'rainbow', rainbow: true });
  assert.deepEqual(pick(rainbow), { vehicle: 'lorry', color: 'orange' });
  assert.equal(rainbow.rainbow, true);
});

test('saves with another vehicle keep their paint', () => {
  assert.deepEqual(pick(sanitise({ vehicle: 'hyundai', color: 'sage' })), { vehicle: 'hyundai', color: 'sage' });
  assert.deepEqual(pick(sanitise({ vehicle: 'lorry', color: 'berry' })), { vehicle: 'lorry', color: 'berry' });
  assert.deepEqual(pick(sanitise({ vehicle: 'miata', color: 'yellow' })), { vehicle: 'miata', color: 'yellow' });
  assert.deepEqual(pick(sanitise({ vehicle: 'mercedes', color: 'rainbow', rainbow: true })), {
    vehicle: 'mercedes',
    color: 'rainbow',
  });
});

test('an old lorry save is changed over once, and then kept', () => {
  const storage = memoryStorage({ vehicle: 'ruda', color: 'yellow' });
  const journal = createJournal(storage);
  assert.deepEqual(pick(journal.get()), { vehicle: 'lorry', color: 'orange' });
  journal.save({ color: 'yellow' });
  assert.deepEqual(pick(createJournal(storage).get()), { vehicle: 'lorry', color: 'yellow' });
});

test('rainbow paint needs to be unlocked first', () => {
  assert.equal(sanitise({ color: 'rainbow' }).color, 'orange');
  assert.equal(sanitise({ color: 'rainbow', rainbow: true }).color, 'rainbow');
});

test('the minimap and leaning back to reverse stay off until switched on', () => {
  assert.equal(sanitise({}).minimap, false);
  assert.equal(sanitise({}).tiltReverse, false);
  assert.equal(sanitise({ minimap: 'yes', tiltReverse: 1 }).minimap, false);
  assert.equal(sanitise({ minimap: 'yes', tiltReverse: 1 }).tiltReverse, false);
  const storage = memoryStorage();
  createJournal(storage).save({ minimap: true, tiltReverse: true });
  assert.equal(createJournal(storage).get().minimap, true);
  assert.equal(createJournal(storage).get().tiltReverse, true);
});

test('the game keeps working when storage is unavailable', () => {
  const journal = createJournal({
    getItem: () => null,
    setItem() {
      throw new Error('quota');
    },
  });
  assert.equal(journal.save({ color: 'blue' }), false);
  assert.equal(journal.isPersistent(), false);
  assert.equal(journal.get().color, 'blue');
  assert.equal(createJournal(null).save({ color: 'blue' }), false);
});
