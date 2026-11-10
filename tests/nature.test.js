import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  BEDS,
  CALLS,
  SOUND_FILES,
  loopWindow,
  natureLevels,
  pickFile,
  rollCall,
  samplePlace,
} from '../src/core/nature.js';
import { createRandom } from '../src/core/math.js';
import { DESERT, LAKE, LOFOTEN, SUMMIT, WATERFALL, WINTER } from '../src/world/layout.js';

const none = { woods: 0, river: 0, falls: 0, sea: 0, coast: 0, high: 0, winter: 0, desert: 0 };
const at = (place, weather) => natureLevels({ ...none, ...place }, weather);
const sum = object => Object.values(object).reduce((a, b) => a + b, 0);

test('every sound file is there and credited', () => {
  const credits = readFileSync(new URL('../public/sounds/CREDITS.md', import.meta.url), 'utf8');
  for (const file of SOUND_FILES) {
    assert.ok(existsSync(new URL(`../public/sounds/${file}.mp3`, import.meta.url)), `${file} is missing`);
    assert.ok(credits.includes(`\`${file}.mp3\``), `${file} is not credited`);
  }
  assert.ok(
    credits.match(/https:\/\/freesound\.org\/people\/\S+\/sounds\/\d+\//g).length >= 14,
    'each has its source page',
  );
});

test('a valley day has songbirds, and the rain, the night and the winter take them away', () => {
  assert.ok(at({}, { day: 1 }).calls.songbird > 1);
  assert.equal(at({}, { day: 1, rain: 0.5 }).calls.songbird, 0, 'birds stop while it rains');
  assert.equal(at({}, { day: 0 }).calls.songbird, 0, 'none at night');
  assert.equal(at({ winter: 1 }, { day: 1 }).calls.songbird, 0, 'none in the snow');
  assert.equal(at({ desert: 1 }, { day: 1 }).calls.songbird, 0, 'none in the desert');
  assert.ok(
    at({ winter: 1 }).calls.songbird === 0 &&
      at({ winter: 1 }).calls.woodpecker === 0 &&
      at({ winter: 1 }).calls.crow === 0,
  );
});

test('each place has its own bed, fading in with how much of the place it is', () => {
  assert.ok(at({ woods: 1 }).beds.pines > 0.9);
  assert.ok(at({ woods: 0.5 }).beds.pines < at({ woods: 1 }).beds.pines);
  assert.equal(at({ woods: 1, winter: 1 }).beds.pines, 0, 'no pines in the snow');
  assert.ok(at({ river: 1 }).beds.river > at({ river: 0.3 }).beds.river, 'louder nearer');
  assert.ok(at({ falls: 1 }).beds.falls > 0.9);
  assert.ok(at({ sea: 1, coast: 1 }).beds.waves > 0.9 && at({ sea: 1, coast: 1 }).calls.gull > 0.5);
  assert.equal(at({ sea: 0.5 }).calls.gull, 0, 'the lake has waves but no gulls');
  assert.ok(at({ high: 1 }).beds.high > 0.9);
  assert.ok(at({ winter: 1 }).beds.cold > 0.9 && at({ desert: 1 }).beds.dry > 0.9);
  assert.equal(at({ winter: 1 }).beds.dry, 0);
  assert.equal(sum(at({ winter: 1 }, { day: 1 }).calls), 0, 'the snow is silent but for the wind');
});

test('crickets come with a warm night, and an owl only very rarely', () => {
  assert.equal(at({}, { day: 1 }).beds.crickets, 0);
  assert.ok(at({}, { day: 0 }).beds.crickets > 0.9);
  assert.equal(at({ winter: 1 }, { day: 0 }).beds.crickets, 0);
  assert.equal(at({}, { day: 0, rain: 0.6 }).beds.crickets > 0.5, false, 'quiet in the rain');
  assert.equal(at({}, { day: 1 }).calls.owl, 0);
  assert.ok(
    at({}, { day: 0 }).calls.owl > 0 && at({ woods: 1 }, { day: 0 }).calls.owl < 0.5,
    'less than one every two minutes',
  );
});

test('every level is between 0 and 1, and nothing is loud everywhere', () => {
  const random = createRandom(5);
  for (let i = 0; i < 400; i++) {
    const place = Object.fromEntries(Object.keys(none).map(key => [key, random()]));
    const { beds, calls } = natureLevels(place, { day: random(), rain: random() });
    for (const name of BEDS) assert.ok(beds[name] >= 0 && beds[name] <= 1, name);
    for (const kind of Object.keys(CALLS)) assert.ok(calls[kind] >= 0 && calls[kind] <= 3, kind);
  }
});

test('the places on the map sound as they should', () => {
  const lake = samplePlace(LAKE.x + LAKE.rx + 6, LAKE.z);
  assert.ok(lake.sea > 0.3 && lake.coast === 0, 'the lake shore');
  assert.ok(samplePlace(WATERFALL.x - 12, WATERFALL.z).falls > 0.9);
  assert.ok(samplePlace(DESERT.x, DESERT.z).desert > 0.9);
  assert.ok(samplePlace(WINTER.x, WINTER.z).winter > 0.9);
  assert.ok(samplePlace(SUMMIT.x, SUMMIT.z).high > 0.9);
  const coast = samplePlace(LOFOTEN.x, LOFOTEN.z);
  assert.ok(coast.winter > 0.9 && coast.sea > 0.3, 'the Lofoten coast is snowy and by the sea');
});

test('calls are rare, spaced out and never the same file twice running', () => {
  const random = createRandom(9);
  const last = {};
  const heard = [];
  // An hour of a valley day, a frame at a time.
  for (let t = 0; t < 3600; t += 1 / 30) {
    const kind = rollCall(at({ woods: 0.5 }, { day: 1 }).calls, last, t, 1 / 30, random);
    if (kind) heard.push({ kind, t });
  }
  assert.ok(heard.length > 20 && heard.length < 400, `${heard.length} calls an hour`);
  for (let i = 1; i < heard.length; i++) assert.ok(heard[i].t - heard[i - 1].t >= 4, 'two calls on top of one another');
  const birds = heard.filter(call => call.kind === 'songbird');
  for (let i = 1; i < birds.length; i++) assert.ok(birds[i].t - birds[i - 1].t >= 9, 'songbirds too close together');

  const files = [];
  for (let i = 0; i < 100; i++) files.push(pickFile('songbird', last, random));
  for (let i = 1; i < files.length; i++) assert.notEqual(files[i], files[i - 1]);
  assert.equal(new Set(files).size, CALLS.songbird.length, 'all of them get a turn');
  assert.equal(pickFile('crow', {}, random), 'crow', 'one file just plays again');
});

/** A fake decoded buffer of noise, with `head` and `tail` samples of silence round it. */
function padded(head, tail, rate = 1000, body = 4000) {
  const random = createRandom(3);
  const data = Float32Array.from({ length: head + body + tail }, (_, i) =>
    i < head || i >= head + body ? 0 : (random() * 2 - 1) * 0.5,
  );
  return { sampleRate: rate, length: data.length, duration: data.length / rate, getChannelData: () => data };
}

test('a loop skips the silence an encoder pads it with, and keeps all of one with none', () => {
  assert.deepEqual(loopWindow(padded(500, 1200)), { start: 0.5, end: 4.5 });
  assert.deepEqual(loopWindow(padded(500, 0)), { start: 0.5, end: 4.5 });
  assert.deepEqual(loopWindow(padded(0, 1200)), { start: 0, end: 4 });
  assert.deepEqual(loopWindow(padded(0, 0)), { start: 0, end: 4 }, 'nothing padded: the whole buffer');
  const whole = padded(200, 100);
  assert.deepEqual(loopWindow(whole), { start: 0, end: whole.duration }, 'a few quiet samples are not padding');
});
