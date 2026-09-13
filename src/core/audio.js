// Everything you hear is synthesised with Web Audio: no sound files.
export const HORNS = ['beep', 'bicycle', 'quack', 'twinkle'];

export function createAudio() {
  let context;
  let master;
  let echoSend;
  let engine;
  let engineGain;
  let windGain;
  let rainGain;
  let noise;
  let enabled = true;

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

    engine = context.createOscillator();
    engine.type = 'triangle';
    engine.frequency.value = 45;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engine.connect(engineFilter).connect(engineGain).connect(master);
    engine.start();
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

    horn(kind = 'beep', inTunnel = false) {
      if (!playable()) return false;
      const now = context.currentTime;
      echoSend.gain.setValueAtTime(inTunnel ? 0.6 : 0, now);
      const echo = 1;
      if (kind === 'bicycle') {
        tone(1300, now, 0.4, { echo });
        tone(1700, now + 0.12, 0.4, { echo });
      } else if (kind === 'quack') {
        tone(420, now, 0.17, { type: 'sawtooth', end: 230, volume: 0.07, echo });
        tone(370, now + 0.2, 0.2, { type: 'sawtooth', end: 190, volume: 0.07, echo });
      } else if (kind === 'twinkle') {
        [660, 830, 990, 1320].forEach((f, i) => tone(f, now + i * 0.1, 0.25, { echo }));
      } else {
        tone(523, now, 0.24, { type: 'triangle', echo });
        tone(659, now, 0.24, { type: 'triangle', echo });
      }
      return true;
    },

    /** The other travellers' reply: a lower, two-note toot. */
    otherHorn() {
      if (!playable()) return;
      const now = context.currentTime;
      tone(330, now, 0.18, { type: 'square', volume: 0.04 });
      tone(294, now + 0.22, 0.26, { type: 'square', volume: 0.04 });
    },

    animal(kind) {
      if (!playable()) return;
      const now = context.currentTime + 0.25;
      if (kind === 'quack') {
        [0, 0.24, 0.42].forEach(t => tone(480, now + t, 0.14, { type: 'sawtooth', end: 260, volume: 0.05 }));
      } else if (kind === 'baa') {
        for (let i = 0; i < 6; i++) tone(310 + (i % 2) * 18, now + i * 0.07, 0.09, { type: 'sawtooth', volume: 0.035 });
      }
    },

    chime() {
      if (!playable()) return;
      const now = context.currentTime;
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, now + i * 0.07, 0.5, { volume: 0.06 }));
    },

    sticker() {
      if (!playable()) return;
      const now = context.currentTime;
      tone(659, now, 0.35, { volume: 0.05 });
      tone(988, now + 0.12, 0.5, { volume: 0.05 });
    },

    bump(strength) {
      if (!playable()) return;
      tone(90, context.currentTime, 0.18, { end: 45, volume: Math.min(0.14, strength * 0.025) });
    },

    surface(kind) {
      if (!playable()) return;
      const sounds = {
        leaves: ['bandpass', 2200, 0.07],
        snow: ['bandpass', 700, 0.045],
        water: ['bandpass', 900, 0.06],
        puddle: ['bandpass', 900, 0.05],
      };
      const [type, frequency, volume] = sounds[kind] ?? ['bandpass', 450, 0.04];
      burst(type, frequency, 0.17, volume);
    },

    /** Called every frame. */
    update({ speed, running, rain }) {
      if (!context) return;
      const now = context.currentTime;
      const audible = enabled && running;
      master.gain.setTargetAtTime(audible ? 0.6 : 0, now, 0.15);
      engine.frequency.setTargetAtTime(40 + Math.abs(speed) * 5, now, 0.1);
      engineGain.gain.setTargetAtTime(0.035 + Math.abs(speed) * 0.003, now, 0.15);
      windGain.gain.setTargetAtTime(0.012 + Math.abs(speed) * 0.0015, now, 0.3);
      rainGain.gain.setTargetAtTime(rain * 0.05, now, 0.5);
    },
  };
}
