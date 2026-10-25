// Everything you hear is synthesised with Web Audio: no sound files.

/**
 * Engine speed for a road speed in m/s: a four-speed gearbox that shifts up
 * at the end of each band, so the revs climb and drop like a real car's.
 */
export function engineRpm(speed, throttle) {
  const v = Math.abs(speed);
  const shifts = [0, 3.6, 7.2, 10.6, 16];
  if (v < 0.4) return 850 + throttle * 700; // idling, or blipping the throttle while stopped
  const gear = Math.max(0, shifts.findIndex(top => v < top) - 1);
  const t = Math.min(1, (v - shifts[gear]) / (shifts[gear + 1] - shifts[gear]));
  return (gear === 0 ? 1000 : 1500) + t * 2300 + throttle * 250;
}

/**
 * The soft sound under the tyres on each surface: muffled noise, plus bubbles
 * in water and an occasional crunch on leaves and snow.
 */
const SURFACE_BEDS = {
  water: { cutoff: 700, gain: 0.035, bubbles: 1 },
  puddle: { cutoff: 900, gain: 0.02, bubbles: 0.5 },
  mud: { cutoff: 420, gain: 0.03, bubbles: 0.8 },
  snow: { cutoff: 1600, gain: 0.01, bubbles: 0 },
  leaves: { cutoff: 2400, gain: 0.008, bubbles: 0 },
  sand: { cutoff: 1900, gain: 0.012, bubbles: 0 },
};

export function createAudio() {
  let context;
  let master;
  let echoSend;
  let engine;
  let windGain;
  let rainGain;
  let bed;
  let rotor;
  let siren;
  let noise;
  let enabled = true;
  let enginePitch = 1;
  let surface = 'grass';
  let surfacePace = 0;
  let nextCrackle = 0;
  let nextBubble = 0;
  // Where each parameter was last sent gliding to, and with what time constant.
  const gliding = new Map();

  /**
   * Glides a parameter towards `value` from `start`, as setTargetAtTime does, unless it is already
   * gliding there with the same time constant: starting that glide again would sound the same.
   */
  function glide(param, value, start, timeConstant) {
    let last = gliding.get(param);
    if (!last) gliding.set(param, (last = { value: NaN, timeConstant: NaN }));
    if (last.value === value && last.timeConstant === timeConstant) return;
    last.value = value;
    last.timeConstant = timeConstant;
    param.setTargetAtTime(value, start, timeConstant);
  }

  function noiseSource(filterType, frequency, gainValue) {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(filter).connect(gain).connect(master);
    source.start();
    return gain;
  }

  function initialise() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio is not available');
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    // A feedback delay gives the horn its echo inside the tunnel.
    const delay = context.createDelay(1);
    delay.delayTime.value = 0.23;
    const feedback = context.createGain();
    feedback.gain.value = 0.42;
    echoSend = context.createGain();
    echoSend.gain.value = 0;
    echoSend.connect(delay).connect(feedback).connect(delay);
    delay.connect(master);

    noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // Brown noise: deep and soft, the raw material for the engine and the water.
    const rumble = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const deep = rumble.getChannelData(0);
    let last = 0;
    for (let i = 0; i < deep.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      deep[i] = last * 3.5;
    }
    const loop = buffer => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.start(0, Math.random() * 2);
      return source;
    };

    // The engine. Combustion is a train of noisy thumps, so deep noise is
    // pulsed at the firing frequency and muffled by the exhaust, with a soft
    // low tone underneath for body. Nothing in it is a bright, steady pitch.
    const pulses = context.createOscillator();
    const thump = Float32Array.from([0, 1, 0.8, 0.55, 0.35, 0.2, 0.1]);
    pulses.setPeriodicWave(context.createPeriodicWave(thump, new Float32Array(thump.length)));
    const combustion = context.createGain();
    combustion.gain.value = 0.45;
    const pulseDepth = context.createGain();
    pulseDepth.gain.value = 0.16;
    pulses.connect(pulseDepth).connect(combustion.gain);
    const exhaust = context.createBiquadFilter();
    exhaust.type = 'lowpass';
    exhaust.Q.value = 0.5;
    const muffler = context.createBiquadFilter();
    muffler.type = 'lowpass';
    muffler.frequency.value = 1000;
    muffler.Q.value = 0.3;
    // Laptop and phone speakers can't play the deepest rumble; cutting it keeps the growl audible without a boom.
    const trim = context.createBiquadFilter();
    trim.type = 'highpass';
    trim.frequency.value = 75;
    loop(rumble).connect(combustion).connect(exhaust).connect(muffler).connect(trim);
    const body = context.createOscillator();
    body.type = 'triangle';
    const bodyGain = context.createGain();
    bodyGain.gain.value = 0.22;
    body.connect(bodyGain).connect(muffler);
    const volume = context.createGain();
    volume.gain.value = 0;
    trim.connect(volume).connect(master);
    pulses.start();
    body.start();
    engine = { pulses, body, exhaust, volume };

    // The tyres in water, snow and leaves: muffled noise whose level and tone follow the surface.
    const bedFilter = context.createBiquadFilter();
    bedFilter.type = 'lowpass';
    bedFilter.Q.value = 0.4;
    const bedTrim = context.createBiquadFilter();
    bedTrim.type = 'highpass';
    bedTrim.frequency.value = 120;
    const bedGain = context.createGain();
    bedGain.gain.value = 0;
    loop(rumble).connect(bedFilter).connect(bedTrim).connect(bedGain).connect(master);
    bed = { filter: bedFilter, gain: bedGain };

    // The helicopter: deep noise chopped into thumps at the blade rate.
    const beat = context.createOscillator();
    beat.setPeriodicWave(context.createPeriodicWave(thump, new Float32Array(thump.length)));
    const chop = context.createGain();
    chop.gain.value = 0;
    const chopDepth = context.createGain();
    chopDepth.gain.value = 0.5;
    beat.connect(chopDepth).connect(chop.gain);
    const rotorFilter = context.createBiquadFilter();
    rotorFilter.type = 'lowpass';
    rotorFilter.frequency.value = 420;
    const rotorTrim = context.createBiquadFilter();
    rotorTrim.type = 'highpass';
    rotorTrim.frequency.value = 70;
    const rotorGain = context.createGain();
    rotorGain.gain.value = 0;
    loop(rumble).connect(chop).connect(rotorFilter).connect(rotorTrim).connect(rotorGain).connect(master);
    beat.start();
    rotor = { beat, gain: rotorGain };

    // The siren: two notes in turn, soft and a little muffled.
    const sirenTone = context.createOscillator();
    sirenTone.type = 'triangle';
    sirenTone.frequency.value = 510;
    const sirenStep = context.createOscillator();
    sirenStep.type = 'square';
    sirenStep.frequency.value = 0.8;
    const sirenSwing = context.createGain();
    sirenSwing.gain.value = 75;
    sirenStep.connect(sirenSwing).connect(sirenTone.frequency);
    const sirenFilter = context.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 1800;
    const sirenGain = context.createGain();
    sirenGain.gain.value = 0;
    sirenTone.connect(sirenFilter).connect(sirenGain).connect(master);
    sirenTone.start();
    sirenStep.start();
    siren = { gain: sirenGain };

    windGain = noiseSource('lowpass', 260, 0.012);
    rainGain = noiseSource('highpass', 2400, 0);
  }

  async function ready() {
    if (!context) initialise();
    if (context.state !== 'running') await context.resume();
  }

  /** A short enveloped tone. `end` slides the pitch. */
  function tone(frequency, start, duration, { type = 'sine', end = frequency, volume = 0.11, echo = 0 } = {}) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(master);
    if (echo) gain.connect(echoSend);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
    oscillator.onended = () => gain.disconnect();
  }

  function burst(filterType, frequency, duration, volume) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noise;
    filter.type = filterType;
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(0, Math.random());
    source.stop(context.currentTime + duration + 0.02);
    source.onended = () => gain.disconnect();
  }

  /** A single bubble: a quiet sine that rises quickly in pitch, the way water does. */
  function bubble(volume) {
    const start = context.currentTime;
    const from = 260 + Math.random() * 420;
    tone(from, start, 0.05 + Math.random() * 0.06, { end: from * (1.8 + Math.random()), volume });
  }

  /** A long rising and falling wolf howl, with a slight waver. */
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
    oscillator.connect(gain).connect(master);
    for (const node of [oscillator, wobble]) {
      node.start(start);
      node.stop(start + 2.9);
    }
    oscillator.onended = () => gain.disconnect();
  }

  const playable = () => enabled && context && context.state === 'running';

  return {
    /** Call from a user gesture (the Play button) so the browser allows audio. */
    async start() {
      try {
        await ready();
      } catch {
        enabled = false;
      }
    },
    isEnabled: () => enabled,
    /** Mute or unmute. Audio itself only starts after start() is called from a click. */
    setEnabled(value) {
      enabled = value;
      if (value && context) ready().catch(() => {});
    },

    /** A friendly two-note beep, or the lorry's deep air horn, echoing in the tunnel. */
    horn(inTunnel = false, kind = 'beep') {
      if (!playable()) return false;
      const now = context.currentTime;
      echoSend.gain.setValueAtTime(inTunnel ? 0.6 : 0, now);
      if (kind === 'air') {
        tone(185, now, 0.75, { type: 'sawtooth', volume: 0.05, echo: 1 });
        tone(233, now, 0.75, { type: 'sawtooth', volume: 0.05, echo: 1 });
        return true;
      }
      tone(523, now, 0.24, { type: 'triangle', echo: 1 });
      tone(659, now, 0.24, { type: 'triangle', echo: 1 });
      return true;
    },

    /** Lower for the lorry's big engine, higher for the racing cars'. 1 is the little off-roader. */
    setEngine(pitch = 1) {
      enginePitch = pitch;
    },

    /** The other travellers' reply: a lower, two-note toot. */
    otherHorn() {
      if (!playable()) return;
      const now = context.currentTime;
      tone(330, now, 0.18, { type: 'square', volume: 0.04 });
      tone(294, now + 0.22, 0.26, { type: 'square', volume: 0.04 });
    },

    /** The railbus's two-note horn, quieter the further away it is. */
    trainHorn(distance) {
      const level = Math.max(0, 1 - distance / 260);
      if (!playable() || level <= 0) return;
      const now = context.currentTime;
      for (const [start, length] of [
        [0, 0.55],
        [0.7, 0.9],
      ]) {
        tone(311, now + start, length, { type: 'sawtooth', volume: 0.035 * level });
        tone(370, now + start, length, { type: 'sawtooth', volume: 0.03 * level });
      }
    },

    /** The ferry's deep horn: `blasts` long low notes, quieter the further away it is. */
    shipHorn(distance, blasts = 1) {
      const level = Math.max(0, 1 - distance / 400);
      if (!playable() || level <= 0) return;
      const now = context.currentTime;
      for (let k = 0; k < blasts; k++) {
        tone(110, now + k * 1.6, 1.2, { type: 'sawtooth', volume: 0.05 * level });
        tone(165, now + k * 1.6, 1.2, { type: 'sawtooth', volume: 0.025 * level });
      }
    },

    /** The helicopter's rotor: `level` 0 to 1 for how loud, `rate` for how fast the blades beat. */
    rotor(level, rate) {
      if (!context) return;
      const now = context.currentTime;
      glide(rotor.beat.frequency, rate, now, 0.3);
      glide(rotor.gain.gain, level * 0.5, now, 0.2);
    },

    /** An emergency vehicle's siren: `level` 0 to 1 for how near it is. */
    siren(level) {
      if (!context) return;
      glide(siren.gain.gain, level ** 1.5 * 0.045, context.currentTime, 0.3);
    },

    /** One strike of the level crossing's bell. */
    crossingBell(distance) {
      const level = Math.max(0, 1 - distance / 140);
      if (!playable() || level <= 0) return;
      const now = context.currentTime;
      tone(1180, now, 0.3, { type: 'triangle', volume: 0.05 * level });
      tone(2360, now, 0.12, { volume: 0.015 * level });
    },

    animal(kind) {
      if (!playable()) return;
      const now = context.currentTime + 0.25;
      if (kind === 'quack') {
        [0, 0.24, 0.42].forEach(t => tone(480, now + t, 0.14, { type: 'sawtooth', end: 260, volume: 0.05 }));
      } else if (kind === 'baa') {
        for (let i = 0; i < 6; i++) tone(310 + (i % 2) * 18, now + i * 0.07, 0.09, { type: 'sawtooth', volume: 0.035 });
      } else if (kind === 'moo') {
        tone(118, now, 0.35, { type: 'sawtooth', end: 150, volume: 0.06 });
        tone(150, now + 0.35, 0.75, { type: 'sawtooth', end: 104, volume: 0.06 });
      } else if (kind === 'neigh') {
        // A whinny: a high call that shakes as it falls away.
        for (let i = 0; i < 8; i++)
          tone(860 - i * 60, now + i * 0.07, 0.09, { type: 'sawtooth', end: 800 - i * 60, volume: 0.03 });
      } else if (kind === 'oink') {
        [0, 0.22].forEach(t => tone(180, now + t, 0.14, { type: 'sawtooth', end: 120, volume: 0.06 }));
      } else if (kind === 'hoot') {
        tone(392, now, 0.35, { end: 330, volume: 0.05 });
        tone(392, now + 0.5, 0.6, { end: 311, volume: 0.05 });
      } else if (kind === 'honk') {
        [0, 0.3].forEach(t => tone(560, now + t, 0.16, { type: 'square', end: 470, volume: 0.03 }));
      } else if (kind === 'cluck') {
        [0, 0.13, 0.26].forEach(t => tone(620, now + t, 0.07, { type: 'triangle', end: 480, volume: 0.05 }));
        tone(520, now + 0.42, 0.22, { type: 'triangle', end: 900, volume: 0.05 });
      } else if (kind === 'howl') {
        // Two wolves, the second joining in a little later and a little higher.
        howl(now, 1, 0.045);
        howl(now + 0.9, 1.12, 0.03);
      }
    },

    chime() {
      if (!playable()) return;
      const now = context.currentTime;
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, now + i * 0.07, 0.5, { volume: 0.06 }));
    },

    /** A wooden fence going over: two soft hollow knocks and a rattle. */
    knock() {
      if (!playable()) return;
      const now = context.currentTime;
      tone(210, now, 0.12, { end: 150, volume: 0.07 });
      tone(170, now + 0.09, 0.14, { end: 120, volume: 0.05 });
      burst('bandpass', 900, 0.25, 0.04);
    },

    bump(strength) {
      if (!playable()) return;
      tone(90, context.currentTime, 0.18, { end: 45, volume: Math.min(0.14, strength * 0.025) });
    },

    /** What the tyres are on and how fast they're turning, every frame while driving. */
    surface(kind, speed) {
      const entering = kind !== surface;
      surface = kind;
      surfacePace = Math.min(1, speed / 8);
      if (!playable() || speed < 0.6) return;
      const now = context.currentTime;
      const profile = SURFACE_BEDS[kind];
      if (entering && (kind === 'water' || kind === 'puddle' || kind === 'mud') && speed > 2.5)
        burst('lowpass', 500, 0.5, 0.05 * surfacePace);
      if (profile?.bubbles && now > nextBubble) {
        bubble(0.012 + 0.012 * surfacePace);
        nextBubble = now + (0.05 + Math.random() * 0.2) / (profile.bubbles * (0.4 + surfacePace));
      }
      if ((kind === 'leaves' || kind === 'snow') && now > nextCrackle) {
        if (kind === 'leaves') burst('highpass', 3200, 0.04, 0.02 * surfacePace);
        else burst('lowpass', 1100, 0.07, 0.02 * surfacePace);
        nextCrackle = now + (0.14 + Math.random() * 0.25) / (0.4 + surfacePace);
      }
    },

    /**
     * Called every frame. `throttle` is 0 to 1; `engineOn` is false when the car
     * is parked (paused, or the night at camp), which lets the engine fall silent.
     */
    update({ speed, throttle = 0, engineOn = true, active, rain }) {
      if (!context) return;
      const now = context.currentTime;
      glide(master.gain, enabled && active ? 0.6 : 0, now, 0.15);

      const rpm = engineRpm(speed, throttle);
      const firing = (rpm / 30) * enginePitch; // four cylinders, two firings per turn
      glide(engine.pulses.frequency, firing, now, 0.08);
      glide(engine.body.frequency, firing, now, 0.08);
      glide(engine.exhaust.frequency, (220 + rpm * 0.09 + throttle * 200) * enginePitch, now, 0.1);
      const loudness = 0.05 + throttle * 0.035 + (rpm / 4000) * 0.03;
      glide(engine.volume.gain, engineOn ? loudness : 0, now, engineOn ? 0.15 : 0.4);

      const profile = SURFACE_BEDS[surface];
      const pace = engineOn ? surfacePace : 0;
      glide(bed.gain.gain, profile ? profile.gain * pace : 0, now, 0.2);
      if (profile) glide(bed.filter.frequency, profile.cutoff, now, 0.1);
      glide(windGain.gain, 0.012 + Math.abs(speed) * 0.0015, now, 0.3);
      glide(rainGain.gain, rain * 0.05, now, 0.5);
    },
  };
}
