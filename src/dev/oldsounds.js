// The synthesised sounds that recordings replaced, kept for the sound board (sounds.html) to play
// beside the new ones, and for measuring how loud each was. The game itself carries none of this.

/** Noise and a few helpers on a Web Audio `context`, everything going to `destination`. */
function kit(context, destination) {
  const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  // Brown noise: deep and soft.
  const rumble = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const deep = rumble.getChannelData(0);
  let last = 0;
  for (let i = 0; i < deep.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    deep[i] = last * 3.5;
  }

  function tone(frequency, start, duration, { type = 'sine', end = frequency, volume = 0.11, echo = null } = {}) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(destination);
    if (echo) gain.connect(echo);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  function howl(start, pitch, volume) {
    const oscillator = context.createOscillator();
    const wobble = context.createOscillator();
    const depth = context.createGain();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(300 * pitch, start);
    oscillator.frequency.linearRampToValueAtTime(560 * pitch, start + 0.7);
    oscillator.frequency.linearRampToValueAtTime(500 * pitch, start + 2);
    oscillator.frequency.linearRampToValueAtTime(380 * pitch, start + 2.7);
    wobble.frequency.value = 5;
    depth.gain.value = 6;
    wobble.connect(depth).connect(oscillator.frequency);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.35);
    gain.gain.setValueAtTime(volume, start + 2);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 2.8);
    oscillator.connect(gain).connect(destination);
    for (const node of [oscillator, wobble]) {
      node.start(start);
      node.stop(start + 2.9);
    }
  }

  /** Noise or brown noise, looping, through one filter and a gain; returns the filter and the gain. */
  function filtered(buffer, filterType, frequency, gainValue, extra = []) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    let tail = source.connect(filter);
    for (const node of extra) tail = tail.connect(node);
    tail.connect(gain).connect(destination);
    source.start(0, Math.random());
    return { source, filter, gain: gain.gain };
  }

  return { context, destination, noise, rumble, tone, howl, filtered };
}

/** The animal calls, one each: `play(context, destination, start)`. */
export const OLD_ANIMALS = {
  quack: (k, now) =>
    [0, 0.24, 0.42].forEach(t => k.tone(480, now + t, 0.14, { type: 'sawtooth', end: 260, volume: 0.05 })),
  baa: (k, now) => {
    for (let i = 0; i < 6; i++) k.tone(310 + (i % 2) * 18, now + i * 0.07, 0.09, { type: 'sawtooth', volume: 0.035 });
  },
  moo: (k, now) => {
    k.tone(118, now, 0.35, { type: 'sawtooth', end: 150, volume: 0.06 });
    k.tone(150, now + 0.35, 0.75, { type: 'sawtooth', end: 104, volume: 0.06 });
  },
  neigh: (k, now) => {
    for (let i = 0; i < 8; i++)
      k.tone(860 - i * 60, now + i * 0.07, 0.09, { type: 'sawtooth', end: 800 - i * 60, volume: 0.03 });
  },
  oink: (k, now) => [0, 0.22].forEach(t => k.tone(180, now + t, 0.14, { type: 'sawtooth', end: 120, volume: 0.06 })),
  hoot: (k, now) => {
    k.tone(392, now, 0.35, { end: 330, volume: 0.05 });
    k.tone(392, now + 0.5, 0.6, { end: 311, volume: 0.05 });
  },
  honk: (k, now) => [0, 0.3].forEach(t => k.tone(560, now + t, 0.16, { type: 'square', end: 470, volume: 0.03 })),
  cluck: (k, now) => {
    [0, 0.13, 0.26].forEach(t => k.tone(620, now + t, 0.07, { type: 'triangle', end: 480, volume: 0.05 }));
    k.tone(520, now + 0.42, 0.22, { type: 'triangle', end: 900, volume: 0.05 });
  },
  howl: (k, now) => {
    k.howl(now, 1, 0.045);
    k.howl(now + 0.9, 1.12, 0.03);
  },
};

/** The horns at `level` 0 to 1 (how near): `(kit, now, level, echo)`. */
export const OLD_HORNS = {
  rail: (k, now, level) => {
    for (const [start, length] of [
      [0, 0.55],
      [0.7, 0.9],
    ]) {
      k.tone(311, now + start, length, { type: 'sawtooth', volume: 0.035 * level });
      k.tone(370, now + start, length, { type: 'sawtooth', volume: 0.03 * level });
    }
  },
  ship: (k, now, level) => {
    k.tone(110, now, 1.2, { type: 'sawtooth', volume: 0.05 * level });
    k.tone(165, now, 1.2, { type: 'sawtooth', volume: 0.025 * level });
  },
  air: (k, now, level, echo) => {
    k.tone(185, now, 0.75, { type: 'sawtooth', volume: 0.05 * level, echo });
    k.tone(233, now, 0.75, { type: 'sawtooth', volume: 0.05 * level, echo });
  },
  beep: (k, now, level, echo) => {
    k.tone(523, now, 0.24, { type: 'triangle', volume: 0.11 * level, echo });
    k.tone(659, now, 0.24, { type: 'triangle', volume: 0.11 * level, echo });
  },
  toot: (k, now, level) => {
    k.tone(330, now, 0.18, { type: 'square', volume: 0.04 * level });
    k.tone(294, now + 0.22, 0.26, { type: 'square', volume: 0.04 * level });
  },
};

/** A burst of filtered noise that dies away, as the splash was. */
function burst(k, start, filterType, frequency, duration, volume) {
  const source = k.context.createBufferSource();
  const filter = k.context.createBiquadFilter();
  const gain = k.context.createGain();
  source.buffer = k.noise;
  filter.type = filterType;
  filter.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(filter).connect(gain).connect(k.destination);
  source.start(start, Math.random());
  source.stop(start + duration + 0.02);
}

/** The knock and the splash, at `level` 0 to 1: `(kit, now, level)`. */
export const OLD_SHOTS = {
  bump: (k, now, level) => k.tone(90, now, 0.18, { end: 45, volume: 0.14 * level }),
  splash: (k, now, level) => burst(k, now, 'lowpass', 500, 0.5, 0.05 * level),
};

/** The wet surfaces, before the recordings: the noise's cutoff and gain at full pace, and how often it bubbled. */
export const OLD_WET = {
  water: { cutoff: 700, gain: 0.035, bubbles: 1 },
  puddle: { cutoff: 900, gain: 0.02, bubbles: 0.5 },
  mud: { cutoff: 420, gain: 0.03, bubbles: 0.8 },
};

/** What the tyres were on in the filtered noise, before the recordings: cutoff and gain at full pace. */
export const OLD_TYRES = {
  snow: { cutoff: 1200, gain: 0.005 },
  leaves: { cutoff: 2400, gain: 0.004 },
  sand: { cutoff: 1400, gain: 0.005 },
  crop: { cutoff: 2600, gain: 0.008 },
};

/** The synthesised loops. Each `start` returns `{ set(value), stop() }`. */
export const OLD_LOOPS = {
  /** `set(rain)`: 0 to 1. */
  rain: k => {
    const { source, gain } = k.filtered(k.noise, 'highpass', 2400, 0);
    return { set: v => (gain.value = v * 0.028), stop: () => source.stop() };
  },
  /** `set(pace)`: 0 to 1, the pace of the tyres. */
  tyres: (k, context, kind) => {
    const profile = OLD_TYRES[kind];
    const trim = context.createBiquadFilter();
    trim.type = 'highpass';
    trim.frequency.value = 120;
    const { source, gain } = k.filtered(k.rumble, 'lowpass', profile.cutoff, 0, [trim]);
    return { set: v => (gain.value = profile.gain * v), stop: () => source.stop() };
  },
  /**
   * `set(pace)`: 0 to 1. The bubbles are laid out ahead for a minute at the pace it starts at, so
   * that a recording made offline has them too.
   */
  wet: (k, context, kind, startPace = 0.75) => {
    const profile = OLD_WET[kind];
    const trim = context.createBiquadFilter();
    trim.type = 'highpass';
    trim.frequency.value = 120;
    const { source, gain } = k.filtered(k.rumble, 'lowpass', profile.cutoff, 0, [trim]);
    const bubbles = context.createGain();
    bubbles.connect(k.destination);
    for (let t = context.currentTime + 0.1; t < context.currentTime + 60; ) {
      const from = 260 + Math.random() * 420;
      const volume = 0.012 + 0.012 * startPace;
      // A tone into the bubbles' gain, so that stopping silences them.
      const oscillator = context.createOscillator();
      const g = context.createGain();
      const length = 0.05 + Math.random() * 0.06;
      oscillator.frequency.setValueAtTime(from, t);
      oscillator.frequency.exponentialRampToValueAtTime(from * (1.8 + Math.random()), t + length);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(volume, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + length);
      oscillator.connect(g).connect(bubbles);
      oscillator.start(t);
      oscillator.stop(t + length + 0.05);
      t += (0.05 + Math.random() * 0.2) / (profile.bubbles * (0.4 + startPace));
    }
    return {
      set: v => (gain.value = profile.gain * v),
      stop: () => {
        source.stop();
        bubbles.disconnect();
      },
    };
  },
  /** `set(gust)`: 0 to 1, how strong the breeze is gusting, at cruise. */
  breeze: k => {
    const { source, gain } = k.filtered(k.noise, 'lowpass', 260, 0);
    return { set: v => (gain.value = oldBreeze(v)), stop: () => source.stop() };
  },
  /** `set(squall)`: 0 to 1, in a full blizzard. */
  blizzard: k => {
    const { source, gain } = k.filtered(k.noise, 'lowpass', 520, 0);
    return { set: v => (gain.value = oldStorm(v)), stop: () => source.stop() };
  },
  /** `set(rpm)`: the engine at half throttle. */
  engine: (k, context) => oldEngine(k, context),
  /** `set(rate)`: the blade rate, 4 to 18. Plays at the loudness of a helicopter close by. */
  rotor: (k, context) => {
    const thump = Float32Array.from([0, 1, 0.8, 0.55, 0.35, 0.2, 0.1]);
    const beat = context.createOscillator();
    beat.setPeriodicWave(context.createPeriodicWave(thump, new Float32Array(thump.length)));
    const chop = context.createGain();
    chop.gain.value = 0;
    const chopDepth = context.createGain();
    chopDepth.gain.value = 0.5;
    beat.connect(chopDepth).connect(chop.gain);
    const trim = context.createBiquadFilter();
    trim.type = 'highpass';
    trim.frequency.value = 70;
    const chopped = context.createBufferSource();
    chopped.buffer = k.rumble;
    chopped.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = context.createGain();
    gain.gain.value = 0.32;
    chopped.connect(chop).connect(filter).connect(trim).connect(gain);
    gain.connect(k.destination);
    beat.start();
    chopped.start();
    return {
      set: v => (beat.frequency.value = v),
      stop: () => {
        beat.stop();
        chopped.stop();
      },
    };
  },
};

/** The noise's gain for the breeze at a `gust` of 0 to 1, at cruise; and for a full blizzard's wind at a `squall` of 0 to 1. */
export const oldBreeze = gust => 0.003 + gust * 0.007 + 6 * 0.0003;
export const oldStorm = squall => 0.008 + squall * 0.014;

/** The engine at half throttle, its revs set by `set(rpm)`. */
export function oldEngine(k, context, rpm = 3150, throttle = 0.5) {
  const enginePitch = 1;
  const firing = (rpm / 30) * enginePitch;
  const pulses = context.createOscillator();
  const thump = Float32Array.from([0, 1, 0.8, 0.55, 0.35, 0.2, 0.1]);
  pulses.setPeriodicWave(context.createPeriodicWave(thump, new Float32Array(thump.length)));
  pulses.frequency.value = firing;
  const combustion = context.createGain();
  combustion.gain.value = 0.45;
  const pulseDepth = context.createGain();
  pulseDepth.gain.value = 0.16;
  pulses.connect(pulseDepth).connect(combustion.gain);
  const exhaust = context.createBiquadFilter();
  exhaust.type = 'lowpass';
  exhaust.Q.value = 0.5;
  exhaust.frequency.value = 220 + rpm * 0.09 + throttle * 200;
  const muffler = context.createBiquadFilter();
  muffler.type = 'lowpass';
  muffler.frequency.value = 1000;
  muffler.Q.value = 0.3;
  const trim = context.createBiquadFilter();
  trim.type = 'highpass';
  trim.frequency.value = 75;
  const source = context.createBufferSource();
  source.buffer = k.rumble;
  source.loop = true;
  source.connect(combustion).connect(exhaust).connect(muffler).connect(trim);
  const body = context.createOscillator();
  body.type = 'triangle';
  body.frequency.value = firing;
  const bodyGain = context.createGain();
  bodyGain.gain.value = 0.22;
  body.connect(bodyGain).connect(muffler);
  const volume = context.createGain();
  trim.connect(volume).connect(k.destination);
  pulses.start();
  body.start();
  source.start();
  return {
    set(revs) {
      pulses.frequency.value = body.frequency.value = revs / 30;
      exhaust.frequency.value = 220 + revs * 0.09 + throttle * 200;
      // The loudness audio.js gives the engine.
      volume.gain.value = 0.045 + throttle * 0.032 + (revs / 4000) * 0.027;
    },
    stop: () => {
      pulses.stop();
      body.stop();
      source.stop();
    },
  };
}

export { kit };
