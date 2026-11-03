// A record of what the motion sensors, the steering and the screen's zoom did, for tracking down
// what goes wrong while someone else plays. It is kept in the browser between visits and never
// sent anywhere. Open the game with #debug on the end of its address to see it: a small panel
// with the live readings, and the last things that happened, newest first.

const KEY = 'nowhere-to-be-log';
/** How many things it remembers. */
const MOST = 80;
/** How often it writes down the tilt readings while tilt steers, in seconds. */
const SAMPLE = 30;

const round = (value, places = 1) => (Number.isFinite(value) ? Number(value.toFixed(places)) : null);
const clock = t => new Date(t).toTimeString().slice(0, 8);

/** A short description of an element, to tell what a finger was on. */
function describe(element) {
  if (typeof element?.getAttribute !== 'function') return '?';
  const label = element.getAttribute('aria-label') ?? element.closest('[aria-label]')?.getAttribute('aria-label');
  return [element.tagName.toLowerCase() + (element.id ? `#${element.id}` : ''), label].filter(Boolean).join(' ');
}

export function createDiagnostics({ tilt, host = window, storage = host.localStorage }) {
  let entries = [];
  try {
    entries = JSON.parse(storage?.getItem(KEY) ?? '[]');
  } catch {
    entries = [];
  }
  let lastStatus = null;
  let since = SAMPLE;
  let zoomed = false;
  let touched = { count: 0, target: '?' };
  let panel = null;
  let shown = 0;

  function note(what, detail = {}) {
    entries.unshift({ t: Date.now(), what, ...detail });
    entries.length = Math.min(entries.length, MOST);
    try {
      storage?.setItem(KEY, JSON.stringify(entries));
    } catch {
      // Saving is unavailable here (a private window, say): the record lasts for this visit.
    }
  }

  const viewport = host.visualViewport;
  const scale = () => viewport?.scale ?? 1;
  // What the fingers were last on, so a zoom can be traced to where it was pinched.
  host.addEventListener(
    'touchstart',
    event => (touched = { count: event.touches.length, target: describe(event.target) }),
    { capture: true, passive: true },
  );
  viewport?.addEventListener('resize', () => {
    const now = scale();
    if (!zoomed && now > 1.02) note('zoomed in', { scale: round(now, 2), fingers: touched.count, on: touched.target });
    if (zoomed && now <= 1.02) note('zoomed back out', { scale: round(now, 2) });
    zoomed = now > 1.02;
  });
  host.addEventListener('gesturestart', event => note('pinch', { on: describe(event.target) }), { capture: true });
  host.document?.addEventListener('visibilitychange', () => note(host.document.hidden ? 'page hidden' : 'page shown'));
  host.screen?.orientation?.addEventListener('change', () =>
    note('screen turned', { angle: host.screen.orientation.angle }),
  );
  host.document?.addEventListener('fullscreenchange', () =>
    note(host.document.fullscreenElement ? 'full screen' : 'left full screen'),
  );

  if (/(^|[#&])debug\b/.test(host.location?.hash ?? '')) {
    panel = host.document.createElement('pre');
    panel.className = 'diagnostics';
    host.document.body.append(panel);
  }

  return {
    note,
    /**
     * Called every frame with what the car is doing: `driving`, the steering it was given
     * (`steering`, from -1 to 1) and whether a steering button or key is held (`held`).
     */
    update(dt, { driving, steering, held }) {
      const state = tilt.getState();
      if (state.status !== lastStatus) {
        note('tilt ' + state.status, { roll: round(state.roll), pitch: round(state.pitch) });
        lastStatus = state.status;
      }
      since += dt;
      if (driving && state.ready && since >= SAMPLE) {
        since = 0;
        note('tilt reading', {
          roll: round(state.roll),
          pitch: round(state.pitch),
          // The way the picture is turned as tilt reads it, and as the browser says it is.
          turn: state.turn,
          says: host.screen?.orientation?.angle,
          tilt: round(state.steering, 2),
          car: round(steering, 2),
          held: held || undefined,
        });
      }
      if (!panel || (shown += dt) < 0.25) return;
      shown = 0;
      const live = [
        `tilt ${state.status}  roll ${round(state.roll)}°  pitch ${round(state.pitch)}°  steer ${round(state.steering, 2)}`,
        `screen turned ${state.turn ?? '?'}°  browser says ${host.screen?.orientation?.angle ?? '?'}°  ${host.innerWidth}×${host.innerHeight}`,
        `car steer ${round(steering, 2)}${held ? '  (button held)' : ''}  zoom ${round(scale(), 2)}`,
      ];
      const past = entries.map(({ t, what, ...detail }) => {
        const rest = Object.entries(detail)
          .filter(([, value]) => value !== null && value !== undefined)
          .map(([key, value]) => `${key} ${value}`)
          .join('  ');
        return `${clock(t)} ${what}${rest ? '  ' + rest : ''}`;
      });
      panel.textContent = [...live, '', ...past].join('\n');
    },
  };
}
