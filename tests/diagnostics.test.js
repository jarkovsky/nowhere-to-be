import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnostics } from '../src/ui/diagnostics.js';

/** A fake window: events, a visual viewport with a scale, and storage kept in a map. */
function host() {
  const window = new EventTarget();
  const viewport = Object.assign(new EventTarget(), { scale: 1 });
  const saved = new Map();
  return Object.assign(window, {
    visualViewport: viewport,
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    location: { hash: '' },
    zoom(scale) {
      viewport.scale = scale;
      viewport.dispatchEvent(new Event('resize'));
    },
    touch(count) {
      const event = new Event('touchstart');
      event.touches = { length: count };
      window.dispatchEvent(event);
    },
  });
}

const tiltAt = (state = {}) => ({
  getState: () => ({ status: 'ready', ready: true, roll: 1.5, pitch: 40, steering: 0, ...state }),
});
const saved = h => JSON.parse(h.localStorage.getItem('nowhere-to-be-log'));

test('a zoom is written down once on the way in and once on the way out, and kept for the next visit', () => {
  const h = host();
  createDiagnostics({ tilt: tiltAt(), host: h });
  h.touch(2);
  h.zoom(1.4);
  h.zoom(1.6);
  h.zoom(1);
  const log = saved(h);
  assert.deepEqual(
    log.map(entry => entry.what),
    ['zoomed back out', 'zoomed in'],
  );
  assert.equal(log[1].fingers, 2);
  // The next visit carries on from what was saved.
  const next = createDiagnostics({ tilt: tiltAt(), host: h });
  next.note('page shown');
  assert.equal(saved(h).length, 3);
});

test('tilt readings are written down now and then while driving, with the steering the car was given', () => {
  const h = host();
  const diagnostics = createDiagnostics({ tilt: tiltAt({ roll: 6, steering: 0.11 }), host: h });
  for (let t = 0; t < 61; t += 0.5) diagnostics.update(0.5, { driving: true, steering: 0.1, held: false });
  const readings = saved(h).filter(entry => entry.what === 'tilt reading');
  assert.equal(readings.length, 3);
  assert.deepEqual([readings[0].roll, readings[0].tilt, readings[0].car], [6, 0.11, 0.1]);
  assert.equal(saved(h).at(-1).what, 'tilt ready', 'and when tilt changes what it is doing');
});
