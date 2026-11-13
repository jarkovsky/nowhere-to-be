// The recorded sounds that stand in for synthesised ones: the engine, animal calls, rain, the
// tyres rolling and splashing, bumps, horns, rotors and the wind. The files (public/sounds, CC0,
// see the README) load the first time they are wanted, and until one has loaded the caller plays
// its synthesised sound instead.
import { loopWindow } from './nature.js';

/** The calls of each animal: files that can play for it. A call never plays the file it played last. */
export const ANIMAL_FILES = {
  quack: ['quack1', 'quack2', 'quack3'],
  baa: ['baa1', 'baa2', 'baa3'],
  moo: ['moo1', 'moo2', 'moo3'],
  neigh: ['neigh1', 'neigh2', 'neigh3'],
  oink: ['oink1', 'oink2', 'oink3'],
  // The owl of the nature sounds hoots here too.
  hoot: ['hoot1', 'hoot2', 'owl'],
  honk: ['honk1', 'honk2', 'honk3'],
  cluck: ['cluck1', 'cluck2', 'cluck3'],
  howl: ['howl1', 'howl3'],
};

/** How loud each animal's calls are, before the master volume: soft, as if from across the field. */
const ANIMAL_LEVEL = {
  quack: 0.053,
  baa: 0.039,
  moo: 0.043,
  neigh: 0.03,
  oink: 0.09,
  hoot: 0.049,
  honk: 0.065,
  cluck: 0.055,
  howl: 0.11,
};

/** The horns: the railbus's, the ferry's, the lorry's air horn and the car's own beep. */
export const HORN_FILES = { rail: 'horn-rail', ship: 'horn-ship', air: 'horn-air', beep: 'horn-beep' };
const HORN_LEVEL = { rail: 0.066, ship: 0.078, air: 0.074, beep: 0.064 };

/** The other travellers' toot, one of these at a time, never the same one twice running. */
export const TOOT_FILES = ['horn-toot1', 'horn-toot2'];
const TOOT_LEVEL = 0.037;

/** A knock through the car as it hits something or lands. */
export const BUMP_FILES = ['bump1', 'bump2'];
const BUMP_LEVEL = 0.22;

/** A wheel running into water, a puddle or mud. */
export const SPLASH_FILE = 'splash';
const SPLASH_LEVEL = 0.0225;

/** The breeze that comes and goes everywhere, and the wind of a blizzard. */
export const WIND_FILES = { breeze: 'breeze', blizzard: 'blizzard' };
/** Each recording's gain for a gain of 1 in the noise it replaced, which set its level before. */
const WIND_LEVEL = { breeze: 1.6, blizzard: 2 };
export const windVolume = (name, noiseGain) => noiseGain * WIND_LEVEL[name];

/**
 * The engine: one diesel recorded standing still, ticking over and held at two steady speeds, each
 * with the revs it was recorded at (from the spacing of its harmonics). The files are cut to one
 * loudness; `level` brings back some of the rise from ticking over to revving.
 */
export const ENGINE_FILES = [
  { file: 'engine-idle', rpm: 890, level: 0.55 },
  { file: 'engine-low', rpm: 2010, level: 0.8 },
  { file: 'engine-high', rpm: 2940, level: 1 },
];
/** The recordings' gain for a gain of 1 in the synthesised engine, which set the engine's loudness before. */
const ENGINE_LEVEL = 2.8;
/**
 * How loud the engine is, before the master volume, at `rpm` revs and `throttle` 0 to 1: a little
 * under the music, and a little quieter for a slow diesel (`diesel` 0 to 1).
 */
export const engineLoudness = (rpm, throttle, diesel = 0) =>
  (0.045 + throttle * 0.032 + (rpm / 4000) * 0.027) * (1 - diesel * 0.22);
/** The recorded engine's volume for the `loudness` the synthesised one would have had. */
export const engineVolume = loudness => loudness * ENGINE_LEVEL;

/**
 * How loud (0 to 1) and how fast each recording of `ENGINE_FILES` plays at `rpm` revs, for an
 * engine `pitch` times as high as the recorded one (0.7 for the lorries, 1.3 for the racing car).
 * The two recorded either side of the revs share the sound, each sped up or slowed to them; their
 * `share`s keep the loudness steady from one to the next, and `gain` is the share at its `level`.
 */
export function engineMix(rpm, pitch = 1) {
  const revs = rpm * pitch;
  const mix = ENGINE_FILES.map(layer => ({ share: 0, gain: 0, rate: Math.min(2, Math.max(0.5, revs / layer.rpm)) }));
  const above = ENGINE_FILES.findIndex(layer => layer.rpm > revs);
  if (above === 0) mix[0].share = 1;
  else if (above === -1) mix[mix.length - 1].share = 1;
  else {
    const low = ENGINE_FILES[above - 1].rpm;
    const t = Math.log(revs / low) / Math.log(ENGINE_FILES[above].rpm / low);
    mix[above - 1].share = Math.cos((t * Math.PI) / 2);
    mix[above].share = Math.sin((t * Math.PI) / 2);
  }
  mix.forEach((layer, i) => (layer.gain = layer.share * ENGINE_FILES[i].level));
  return mix;
}

/**
 * How far the recorded engine is muffled, as a low-pass cutoff in Hz: brighter with the revs and
 * brighter still on the throttle, and darker for a slow diesel (`diesel` 0 to 1).
 */
export const engineCutoff = (rpm, throttle, diesel = 0) => (1500 + rpm * 0.35 + throttle * 1200) * (1 - diesel * 0.35);

/** The rotor loops: the helicopters' and the plane's. */
export const ROTOR_FILES = { helicopter: 'rotor-heli', plane: 'rotor-plane' };
const ROTOR_LEVEL = { helicopter: 0.2, plane: 0.21 };

export const RAIN_FILE = 'rain';
const RAIN_LEVEL = 0.22;

/** The tyres rolling, by what they roll on. A puddle is the water's wash, lighter. */
export const TYRE_FILES = {
  gravel: 'tyres-gravel',
  grass: 'tyres-grass',
  tarmac: 'tyres-tarmac',
  snow: 'tyres-snow',
  sand: 'tyres-sand',
  leaves: 'tyres-leaves',
  crop: 'tyres-crop',
  water: 'wade',
  puddle: 'wade',
  mud: 'mud',
};
/** How loud each is at full pace, before the master volume. */
const TYRE_LEVEL = {
  gravel: 0.075,
  grass: 0.037,
  tarmac: 0.027,
  snow: 0.018,
  sand: 0.0102,
  leaves: 0.0102,
  crop: 0.03,
  water: 0.1,
  puddle: 0.06,
  mud: 0.1,
};

/**
 * Every kind of ground the surfaces send to `sound.surface` (see `effectAt` in surfaces.js), and
 * which rolling loop it has.
 */
export const SURFACE_TYRES = {
  grass: 'by-ground',
  water: 'water',
  puddle: 'puddle',
  mud: 'mud',
  snow: 'snow',
  leaves: 'leaves',
  sand: 'sand',
  crop: 'crop',
};

/**
 * Which rolling loop sounds under the tyres: the surface kind says (see `SURFACE_TYRES`), and on
 * plain ground `ground` says whether it is a paved road ('tarmac'), a gravel road or a dirt track
 * ('gravel'), or the open grass.
 */
export function tyreBed(kind, ground = 'grass') {
  const bed = SURFACE_TYRES[kind];
  if (bed === 'by-ground') return ground === 'tarmac' || ground === 'gravel' ? ground : 'grass';
  return bed ?? null;
}

/** How loud and how fast the loop `name` of `TYRE_FILES` plays at a `pace` of 0 to 1 (a speed of 8 m/s is 1). */
export const tyreGain = (name, pace) => TYRE_LEVEL[name] * pace;
export const tyreRate = pace => 0.85 + 0.4 * pace;

/** How loud the rain is for a `rain` of 0 to 1. */
export const rainVolume = rain => rain * RAIN_LEVEL;

/**
 * How loud and how fast the rotor loop plays. `level` is 0 to 1, `rate` how fast the blades beat:
 * 4 to 18 for the helicopters, 18 to 44 for the plane.
 */
export const rotorGain = (plane, level) => level * ROTOR_LEVEL[plane ? 'plane' : 'helicopter'];
export const rotorRate = (plane, rate) => (plane ? 0.85 + (rate - 18) * 0.0135 : 0.6 + (rate - 4) * 0.04);

/** Every file the module plays, without the extension. */
export const RECORDED_FILES = [
  ...new Set([
    ...Object.values(ANIMAL_FILES).flat(),
    ...Object.values(HORN_FILES),
    ...TOOT_FILES,
    ...Object.values(ROTOR_FILES),
    RAIN_FILE,
    ...Object.values(TYRE_FILES),
    ...ENGINE_FILES.map(layer => layer.file),
    ...BUMP_FILES,
    SPLASH_FILE,
    ...Object.values(WIND_FILES),
  ]),
];

/** The short sounds that play the moment something happens, fetched as the game starts so the first is never late. */
export const PROMPT_FILES = [HORN_FILES.beep, HORN_FILES.air, ...TOOT_FILES, ...BUMP_FILES, SPLASH_FILE];

/** Picks one of `files`, never the one picked last under `key` in `last`. */
export function pickVariant(files, key, last, random = Math.random) {
  const choices = files.filter(file => file !== last[key]);
  const file = choices[Math.floor(random() * choices.length)] ?? files[0];
  last[key] = file;
  return file;
}

/**
 * Plays the recordings into `destination`, from the `library` of nature.js. Every call says
 * whether it played: false means its file hasn't loaded yet (it is being fetched), so the caller
 * should play the synthesised sound this time.
 */
export function createRecordings(context, destination, library, { random = Math.random } = {}) {
  const output = context.createGain();
  output.gain.value = 1;
  output.connect(destination);
  const last = {};

  /** One sound, once, through a gain (and a duller filter for a far-off one). */
  function shot(name, { level, rate = 1, start = context.currentTime, cutoff = 0, echo = null }) {
    const buffer = library.get(name);
    if (!buffer) {
      library.want(name);
      return false;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = level;
    let tail = source;
    if (cutoff) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      tail = tail.connect(filter);
    }
    tail.connect(gain).connect(output);
    if (echo) gain.connect(echo);
    source.onended = () => gain.disconnect();
    source.start(start);
    return true;
  }

  /** A loop that begins once its file has loaded and then plays for good, at the gain it is given, into `into`. */
  function loop(name, into = output) {
    let source = null;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(into);
    return {
      gain: gain.gain,
      get rate() {
        return source?.playbackRate;
      },
      /** True when it is playing; if it isn't loaded yet, fetches it. */
      ready() {
        const buffer = library.get(name);
        if (!buffer) {
          library.want(name);
          return false;
        }
        if (!source) {
          source = context.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          // Inside the sound: a browser may leave the encoder's silence at the ends of the buffer.
          const { start, end } = loopWindow(buffer);
          if (start > 0 || end < buffer.duration) {
            source.loopStart = start;
            source.loopEnd = end;
          }
          source.connect(gain);
          source.start(0, start + random() * (end - start));
        }
        return true;
      },
    };
  }

  /**
   * The engine: the recordings of `ENGINE_FILES` sharing the sound by the revs, muffled through
   * one filter. `update` says whether it is playing: false while a file is still loading.
   */
  function engine() {
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.5;
    const volume = context.createGain();
    volume.gain.value = 0;
    tone.connect(volume).connect(output);
    const layers = ENGINE_FILES.map(layer => loop(layer.file, tone));
    return {
      tone: tone.frequency,
      volume: volume.gain,
      layers,
      /** True once every file has loaded; until then fetches them, all at once. */
      ready: () => layers.map(layer => layer.ready()).every(Boolean),
    };
  }

  return {
    loop,
    engine,

    /** An animal's call from a way off. Two wolves howl, the second a little later and higher. */
    animal(kind, start = context.currentTime) {
      const name = pickVariant(ANIMAL_FILES[kind], kind, last, random);
      const level = ANIMAL_LEVEL[kind];
      const rate = 0.95 + random() * 0.1;
      const cutoff = kind === 'howl' ? 3200 : 4200;
      const played = shot(name, { level, rate, start, cutoff });
      if (played && kind === 'howl') {
        // The other wolf's recording, so the second never echoes the first.
        const second = ANIMAL_FILES.howl.find(file => file !== name) ?? name;
        shot(second, { level: level * 0.65, rate: rate * 1.12, start: start + 0.9, cutoff });
      }
      return played;
    },

    /** A horn, `level` 0 to 1 for how near it is, also played into `echo` if given (the tunnel's). */
    horn(kind, level = 1, echo = null, start = context.currentTime) {
      return shot(HORN_FILES[kind], { level: HORN_LEVEL[kind] * level, start, echo });
    },

    /** Another traveller's toot, from a little way off. */
    toot(start = context.currentTime) {
      const name = pickVariant(TOOT_FILES, 'toot', last, random);
      return shot(name, { level: TOOT_LEVEL, rate: 0.95 + random() * 0.1, start, cutoff: 3500 });
    },

    /** A knock through the car, `level` 0 to 1 for how hard. */
    bump(level, start = context.currentTime) {
      const name = pickVariant(BUMP_FILES, 'bump', last, random);
      return shot(name, { level: BUMP_LEVEL * level, rate: 0.85 + random() * 0.3, start, cutoff: 2500 });
    },

    /** A wheel running into water, `level` 0 to 1 for how fast; into mud it is slower and duller. */
    splash(level, muddy = false, start = context.currentTime) {
      const rate = muddy ? 0.7 + random() * 0.1 : 0.9 + random() * 0.2;
      return shot(SPLASH_FILE, { level: SPLASH_LEVEL * level, rate, start, cutoff: muddy ? 1400 : 6000 });
    },
  };
}
