// The recorded sounds that stand in for synthesised ones: animal calls, rain, the tyres rolling,
// horns and rotors. The files (public/sounds, CC0, see the README) load the first time they are
// wanted, and until one has loaded the caller plays its synthesised sound instead.
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

/** The horns: the railbus's, the ferry's and the lorry's air horn. */
export const HORN_FILES = { rail: 'horn-rail', ship: 'horn-ship', air: 'horn-air' };
const HORN_LEVEL = { rail: 0.066, ship: 0.078, air: 0.074 };

/** The rotor loops: the helicopters' and the plane's. */
export const ROTOR_FILES = { helicopter: 'rotor-heli', plane: 'rotor-plane' };
const ROTOR_LEVEL = { helicopter: 0.2, plane: 0.21 };

export const RAIN_FILE = 'rain';
const RAIN_LEVEL = 0.22;

/** The tyres rolling, by what they roll on. */
export const TYRE_FILES = {
  gravel: 'tyres-gravel',
  grass: 'tyres-grass',
  tarmac: 'tyres-tarmac',
  snow: 'tyres-snow',
  sand: 'tyres-sand',
  leaves: 'tyres-leaves',
  crop: 'tyres-crop',
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
};

/**
 * Every kind of ground the surfaces send to `sound.surface` (see `effectAt` in surfaces.js), and
 * which rolling loop it has, if any. Water, puddles and mud keep their synthesised sounds.
 */
export const SURFACE_TYRES = {
  grass: 'by-ground',
  water: null,
  puddle: null,
  mud: null,
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
    ...Object.values(ROTOR_FILES),
    RAIN_FILE,
    ...Object.values(TYRE_FILES),
  ]),
];

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

  /** A loop that begins once its file has loaded and then plays for good, at the gain it is given. */
  function loop(name) {
    let source = null;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(output);
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

  return {
    loop,

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

    /** A horn, `level` 0 to 1 for how near it is; the air horn also goes into the tunnel's echo. */
    horn(kind, level = 1, echo = null, start = context.currentTime) {
      return shot(HORN_FILES[kind], { level: HORN_LEVEL[kind] * level, start, echo: kind === 'air' ? echo : null });
    },
  };
}
