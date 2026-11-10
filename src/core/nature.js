// A quiet bed of nature sounds under the engine and the music, so the world is never silent:
// wind in the pines, a river's rush, far-off waves, crickets at night, and now and then a
// bird. The recordings (public/sounds, CC0, see the README) load a little after the game starts
// and fade in and out as the car moves between places and the day goes on.
import { clamp, smoothstep, fractalNoise } from './math.js';
import {
  BROOK,
  CREEK,
  FJORD,
  LAKE,
  WATERFALL,
  desertness,
  inFjord,
  lakeDistance,
  lofotenness,
  nearRiver,
  rockiness,
  winterness,
} from '../world/layout.js';
import { terrainHeight } from '../world/terrain.js';

/** The loops, each a recording cut to repeat without a seam. */
export const BEDS = ['pines', 'high', 'cold', 'dry', 'river', 'falls', 'waves', 'crickets'];

/** The calls heard now and then: which files each can play. A call never plays the file it played last. */
export const CALLS = {
  songbird: ['bird1', 'bird2', 'bird3'],
  woodpecker: ['woodpecker1', 'woodpecker2'],
  crow: ['crow'],
  gull: ['gull1', 'gull2'],
  owl: ['owl'],
};

/** Every file the module plays, without the extension. */
export const SOUND_FILES = [...BEDS, ...Object.values(CALLS).flat()];

/**
 * How loud each loop is when it is fully there, before the master volume. The files are all cut
 * to one loudness, so these are the mix: well under the engine, and the music further above.
 */
const BED_LEVEL = {
  pines: 0.028,
  high: 0.027,
  cold: 0.025,
  dry: 0.028,
  river: 0.031,
  falls: 0.036,
  waves: 0.021,
  crickets: 0.025,
};

/** How loud a call is a short way off, before distance. The clips are all cut to the same peak. */
const CALL_LEVEL = { songbird: 0.035, woodpecker: 0.03, crow: 0.025, gull: 0.025, owl: 0.03 };
/** The most often a call may sound, in seconds between one and the next of its kind. */
const CALL_PAUSE = { songbird: 9, woodpecker: 30, crow: 45, gull: 28, owl: 150 };
/** Seconds of quiet before and after any call, so they never crowd one another. */
const ANY_PAUSE = 4;

/**
 * What the place is like at a point of the map, each from 0 to 1: `woods`, `river` (near running
 * water), `falls` (near the waterfall), `sea` (near the shore of the lake, softer, or the fjord),
 * `coast` (near the fjord alone), `high` (high open ground), `winter` and `desert`.
 */
export function samplePlace(x, z) {
  const near = (distance, close, far) => 1 - smoothstep(distance, close, far);

  let river = 0;
  const running = nearRiver(x, z, 70);
  if (running) river = near(running.distance, 8, 70);
  for (const [path, size] of [
    [CREEK, 0.9],
    [BROOK, 0.65],
  ]) {
    if (path.isNear(x, z, 60)) river = Math.max(river, size * near(path.nearest(x, z).distance, 5, 60));
  }
  const falls = near(Math.hypot(x - WATERFALL.x, z - WATERFALL.z), 12, 110);
  river = Math.max(river, falls * 0.8);

  // The lake's shore is a soft lapping; the fjord's and the Lofoten bay's, a heavier far-off swell.
  const lake = 0.5 * near(lakeDistance(x, z), 1.05, 1.9);
  let coast = 0;
  if (inFjord(x, z, 200)) {
    const { s, distance } = FJORD.path.nearest(x, z);
    coast = near(Math.max(0, distance - FJORD.widthAt(s, x, z)), 0, 190);
  }
  coast = Math.max(coast, lofotenness(x, z) * 0.5);

  // The same patchy noise that grows the woods, so the wind comes where the trees are.
  const winter = winterness(x, z);
  const desert = desertness(x, z);
  const woods = smoothstep(fractalNoise(x / 150 + 3.3, z / 150 + 8.1, 2, 5), 0.42, 0.64);
  const high = Math.max(smoothstep(terrainHeight(x, z), 85, 120), rockiness(x, z) * 0.9);

  return { woods, river, falls, sea: Math.max(lake, coast), coast, high, winter, desert };
}

/**
 * How present each loop is, 0 to 1, and how often each call sounds (per minute), for a `place` (as
 * from `samplePlace`), the time of day (`day`: 1 in daylight, 0 at night) and how hard it rains.
 *  - Songbirds in the valley by day, sparsely, never in winter, the desert or the rain.
 *  - Wind in the pines where the woods are, a cooler wind up high, a faint cold one in the snow,
 *    a dry one in the desert.
 *  - Water under the places with water, louder the nearer it is; waves at the shores.
 *  - Crickets in the warm night; an owl, very rarely.
 */
export function natureLevels(place, { day = 1, rain = 0 } = {}) {
  const night = 1 - smoothstep(day, 0.1, 0.5);
  const light = smoothstep(day, 0.35, 0.7);
  // Birds stop at the first drops.
  const fair = 1 - smoothstep(rain, 0.02, 0.2);
  const mild = (1 - place.winter) * (1 - place.desert);
  const open = (1 - 0.6 * place.sea) * (1 - 0.7 * place.high);

  const beds = {
    pines: place.woods * mild,
    high: place.high * (1 - place.winter),
    cold: place.winter,
    dry: place.desert,
    river: place.river * (1 - 0.5 * place.winter),
    falls: place.falls,
    waves: place.sea,
    crickets: night * mild * (1 - rain) * (1 - place.sea) * (1 - 0.7 * place.river),
  };
  const calls = {
    songbird: 3 * light * mild * fair * open,
    woodpecker: 0.7 * place.woods * light * mild * fair,
    crow: 0.5 * (0.3 + place.woods) * light * mild * fair,
    gull: 1.2 * place.coast * light * (1 - rain),
    owl: 0.25 * (0.4 + 0.6 * place.woods) * night * mild * (1 - place.sea) * fair,
  };
  return { beds, calls };
}

/**
 * Which call, if any, sounds in the `dt` seconds just gone. Each kind sounds at its rate per
 * minute, never within its own pause of the last of its kind or `ANY_PAUSE` of any call. `last`
 * holds the times (in seconds) each last sounded, and is updated.
 */
export function rollCall(calls, last, now, dt, random = Math.random) {
  if (now - (last.any ?? -Infinity) < ANY_PAUSE) return null;
  for (const kind of Object.keys(calls)) {
    if (now - (last[kind] ?? -Infinity) < CALL_PAUSE[kind]) continue;
    if (random() < 1 - Math.exp((-calls[kind] * dt) / 60)) {
      last[kind] = last.any = now;
      return kind;
    }
  }
  return null;
}

/** Picks one of `files`, never the one it picked last (`last[kind]`). */
export function pickFile(kind, last, random = Math.random) {
  const files = CALLS[kind].filter(file => file !== last[`file:${kind}`]);
  const file = files[Math.floor(random() * files.length)] ?? CALLS[kind][0];
  last[`file:${kind}`] = file;
  return file;
}

/**
 * The stretch of a decoded loop that holds sound, in seconds: `{ start, end }`. MP3 and AAC
 * encoders pad their output with a little silence, and a browser that doesn't strip it would drop
 * out at every seam of a looping source. Samples well below the clip's own level at either end
 * are skipped, if there are enough of them to be padding; a loop with none keeps all of its length.
 */
export function loopWindow(buffer) {
  const data = buffer.getChannelData(0);
  const n = buffer.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i] * data[i];
  const quiet = Math.sqrt(sum / Math.max(1, n)) * 0.05;
  let first = 0;
  while (first < n && Math.abs(data[first]) < quiet) first++;
  let last = n;
  while (last > first && Math.abs(data[last - 1]) < quiet) last--;
  // Under a few milliseconds is only a quiet moment in the sound: encoder padding is longer.
  if (first < 256) first = 0;
  if (n - last < 256) last = n;
  return { start: first / buffer.sampleRate, end: last / buffer.sampleRate };
}

const sample = (context, url) =>
  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(url);
      return response.arrayBuffer();
    })
    // The callback form, which older Safari needs.
    .then(data => new Promise((resolve, reject) => context.decodeAudioData(data, resolve, reject)));

/**
 * Plays the nature sounds into `destination`. `start()` once the game begins, then `update()` every
 * frame with where the car is. A recording is only fetched once it is wanted, and one that won't
 * load is left out.
 */
export function createNature(context, destination, { random = Math.random } = {}) {
  const output = context.createGain();
  output.gain.value = 1;
  output.connect(destination);

  const buffers = new Map();
  const loading = new Set();
  const beds = new Map();
  const last = {};
  let started = false;
  let place = null;
  let sampledAt = -Infinity;
  let levels = null;
  let lastCall = 0;

  const seconds = () => context.currentTime;

  function want(name) {
    if (!started || buffers.has(name) || loading.has(name)) return;
    loading.add(name);
    sample(context, `sounds/${name}.mp3`)
      .then(buffer => buffers.set(name, buffer))
      .catch(() => {})
      .finally(() => loading.delete(name));
  }

  /** A loop begins at a random point, so it is never the same on the way back to a place. */
  function startBed(name) {
    const source = context.createBufferSource();
    source.buffer = buffers.get(name);
    source.loop = true;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(output);
    // Inside the sound: a browser may leave the encoder's silence at the ends of the buffer.
    const { start, end } = loopWindow(source.buffer);
    if (start > 0 || end < source.buffer.duration) {
      source.loopStart = start;
      source.loopEnd = end;
    }
    source.start(0, start + random() * (end - start));
    const bed = { gain };
    beds.set(name, bed);
    return bed;
  }

  /** A call from a random side and distance: panned to its side, softer and duller the further it is. */
  function play(kind) {
    const name = pickFile(kind, last, random);
    const buffer = buffers.get(name);
    if (!buffer) {
      want(name);
      return;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = (kind === 'crow' ? 0.8 : 0.92) + random() * (kind === 'crow' ? 0.2 : 0.16);
    const distance = 40 + random() * 180;
    const angle = random() * Math.PI * 2;
    const muffle = context.createBiquadFilter();
    muffle.type = 'lowpass';
    // Duller when it is far off, and when it is behind the car.
    muffle.frequency.value = (9000 / (1 + distance / 50)) * (0.7 + 0.3 * (0.5 + 0.5 * Math.cos(angle)));
    const gain = context.createGain();
    gain.gain.value = CALL_LEVEL[kind] / (1 + distance / 40);
    let tail = source.connect(muffle).connect(gain);
    if (context.createStereoPanner) {
      const pan = context.createStereoPanner();
      pan.pan.value = Math.sin(angle) * 0.85;
      tail = tail.connect(pan);
    }
    tail.connect(output);
    source.onended = () => tail.disconnect();
    source.start();
  }

  return {
    /** From the click that starts the game: the loading begins. */
    start() {
      started = true;
    },

    /**
     * Every frame. `x` and `z` are where the car is, `day` is 1 in daylight and 0 at night, `rain`
     * is 0 to 1, and `on` is false when the game is muted, paused or out of view.
     */
    update({ x, z, day, rain, on }) {
      if (!started) return;
      const now = seconds();
      // The place is worked out a few times a second, not every frame.
      if (!levels || now - sampledAt > 0.25) {
        sampledAt = now;
        place = samplePlace(x, z);
        levels = natureLevels(place, { day, rain });
        // Wind in the trees swells and eases on its own.
        const gust = 0.7 + 0.3 * Math.sin(now * 0.17) * Math.sin(now * 0.071 + 0.9);
        for (const name of BEDS) {
          const level = levels.beds[name] * (name === 'pines' ? gust : 1);
          if (level > 0.01) want(name);
          const bed = beds.get(name) ?? (buffers.has(name) ? startBed(name) : null);
          // A few seconds to fade in or out.
          bed?.gain.gain.setTargetAtTime(on ? level * BED_LEVEL[name] : 0, now, 2.2);
        }
        for (const kind of Object.keys(levels.calls)) {
          if (levels.calls[kind] > 0.01) for (const file of CALLS[kind]) want(file);
        }
      }
      if (on && levels) {
        const kind = rollCall(levels.calls, last, now, clamp(now - lastCall, 0, 0.5), random);
        if (kind) play(kind);
      }
      lastCall = now;
    },
  };
}
