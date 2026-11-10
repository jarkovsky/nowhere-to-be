// The sound board: every sound that a recording replaced, with the old synthesised version beside
// the new one, for judging by ear. Open sounds.html while developing (npm run dev). The old
// versions live in oldsounds.js; the new ones are played by the same code the game uses.
import './sounds.css';
import { createLibrary } from '../core/nature.js';
import {
  ANIMAL_FILES,
  HORN_FILES,
  RAIN_FILE,
  RECORDED_FILES,
  ROTOR_FILES,
  TYRE_FILES,
  createRecordings,
  rainVolume,
  rotorGain,
  rotorRate,
  tyreGain,
  tyreRate,
} from '../core/recorded.js';
import { OLD_ANIMALS, OLD_HORNS, OLD_LOOPS, OLD_TYRES, kit, oldEngine } from './oldsounds.js';

/** A looping recording whose gain and speed follow `value` through the game's own formulas. */
function recordedLoop(rec, file, follow) {
  const loop = rec.loop(file);
  return {
    set(value) {
      if (!loop.ready()) return;
      const { gain, rate } = follow(value);
      loop.gain.value = gain;
      if (rate !== undefined) loop.rate.value = rate;
    },
    stop: () => (loop.gain.value = 0),
  };
}

/**
 * Every row. A `shot` has `old(kit, now)` and `new(rec, now)`; a `loop` has `old(kit, context)` and
 * `new(rec)`, each giving `{ set(value), stop() }`, and a `slider` for the value (`measure` is the
 * value the loudness is measured at).
 */
export function rows() {
  const list = [];
  for (const kind of Object.keys(ANIMAL_FILES)) {
    list.push({
      group: 'Animal calls',
      id: kind,
      label: kind,
      type: 'shot',
      old: (k, now) => OLD_ANIMALS[kind](k, now),
      new: (rec, now) => rec.animal(kind, now),
    });
  }
  list.push({
    group: 'Rain',
    id: 'rain',
    label: 'rain',
    type: 'loop',
    slider: { label: 'rain', min: 0, max: 1, value: 1, measure: 1 },
    old: k => OLD_LOOPS.rain(k),
    new: rec => recordedLoop(rec, RAIN_FILE, v => ({ gain: rainVolume(v) })),
  });
  for (const kind of Object.keys(TYRE_FILES)) {
    list.push({
      group: 'Tyres rolling',
      id: `tyres-${kind}`,
      label: kind,
      type: 'loop',
      slider: { label: 'pace (8 m/s is 1; cruise is 0.75)', min: 0, max: 1, value: 0.75, measure: 0.75 },
      old: OLD_TYRES[kind] ? (k, context) => OLD_LOOPS.tyres(k, context, kind) : null,
      new: rec => recordedLoop(rec, TYRE_FILES[kind], v => ({ gain: tyreGain(kind, v), rate: tyreRate(v) })),
    });
  }
  for (const [kind, label] of [
    ['rail', 'railbus horn'],
    ['ship', 'ferry horn'],
    ['air', "lorry's air horn"],
  ]) {
    list.push({
      group: 'Horns',
      id: `horn-${kind}`,
      label,
      type: 'shot',
      old: (k, now) => OLD_HORNS[kind](k, now, 1),
      new: (rec, now) => rec.horn(kind, 1, null, now),
    });
  }
  for (const plane of [false, true]) {
    const [low, high] = plane ? [18, 44] : [4, 18];
    list.push({
      group: 'Rotors',
      id: plane ? 'rotor-plane' : 'rotor-heli',
      label: plane ? 'plane engine' : 'helicopter',
      type: 'loop',
      slider: { label: 'blade rate', min: low, max: high, value: high, measure: high },
      // The old sound was one for both; it beat at the rate it was given.
      old: (k, context) => OLD_LOOPS.rotor(k, context),
      new: rec =>
        recordedLoop(rec, ROTOR_FILES[plane ? 'plane' : 'helicopter'], v => ({
          gain: rotorGain(plane, 1),
          rate: rotorRate(plane, v),
        })),
    });
  }
  list.push({
    group: 'For comparison',
    id: 'engine',
    label: 'engine at cruise',
    type: 'loop',
    slider: null,
    old: (k, context) => {
      const engine = oldEngine(k, context);
      return { set() {}, stop: engine.stop };
    },
    new: null,
  });
  return list;
}

/** Decodes every recording up front, so that a button never plays nothing. */
export async function loadAll(context, library) {
  for (const name of RECORDED_FILES) library.want(name);
  while (RECORDED_FILES.some(name => !library.get(name))) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function build() {
  let context = null;
  let master = null;
  let rec = null;
  let k = null;
  const library = { current: null };

  function start() {
    if (context) return;
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    master.gain.value = Number(document.getElementById('volume').value);
    master.connect(context.destination);
    library.current = createLibrary(context);
    rec = createRecordings(context, master, library.current);
    k = kit(context, master);
    for (const name of RECORDED_FILES) library.current.want(name);
  }

  document.getElementById('volume').addEventListener('input', event => {
    if (master) master.gain.value = Number(event.target.value);
  });

  const container = document.getElementById('rows');
  let group = null;
  for (const row of rows()) {
    if (row.group !== group) {
      group = row.group;
      const heading = document.createElement('h2');
      heading.textContent = group;
      container.append(heading);
    }
    const element = document.createElement('div');
    element.className = 'row';
    const name = document.createElement('span');
    name.textContent = row.label;
    element.append(name);
    const slider = row.slider ? document.createElement('input') : null;
    const live = { old: null, new: null };

    for (const version of ['old', 'new']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = version === 'old' ? 'Old' : 'New';
      if (!row[version]) button.disabled = true;
      button.addEventListener('click', () => {
        start();
        if (row.type === 'shot') {
          const now = context.currentTime + 0.05;
          if (version === 'old') row.old(k, now);
          else if (!row.new(rec, now)) button.textContent = 'New (loading, press again)';
          else button.textContent = 'New';
          return;
        }
        if (live[version]) {
          live[version].stop();
          live[version] = null;
          button.setAttribute('aria-pressed', 'false');
          return;
        }
        live[version] = version === 'old' ? row.old(k, context) : row.new(rec, context);
        live[version].set(slider ? Number(slider.value) : 0);
        button.setAttribute('aria-pressed', 'true');
      });
      element.append(button);
    }

    if (slider) {
      const label = document.createElement('label');
      label.className = 'slider';
      slider.type = 'range';
      slider.min = row.slider.min;
      slider.max = row.slider.max;
      slider.step = (row.slider.max - row.slider.min) / 100;
      slider.value = row.slider.value;
      slider.addEventListener('input', () => {
        for (const version of ['old', 'new']) live[version]?.set(Number(slider.value));
      });
      label.append(row.slider.label, slider);
      element.append(label);
    }
    container.append(element);
  }
}

// The loudness measurements (.probe/out/sounds2) use the rows and a library of their own.
if (document.getElementById('rows')) build();
