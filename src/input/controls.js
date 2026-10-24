// Keyboard, on-screen touch buttons and tilt steering, merged into one input.

const DRIVE_KEYS = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'backward',
  KeyS: 'backward',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'brake',
};

const ACTION_KEYS = {
  Enter: 'start',
  Escape: 'pause',
  KeyP: 'pause',
  KeyH: 'horn',
  KeyR: 'home',
  KeyC: 'garage',
  KeyM: 'sound',
  KeyE: 'cruise',
  KeyF: 'invite',
};

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
];

/**
 * onAction(name) is called for one-off actions (pause, horn, ...).
 * isDriving() says whether driving input should be accepted right now.
 */
export function createControls({ touchRoot, tilt, onAction, isDriving }) {
  /** The driving keys held down, by code: W and the up arrow can both be held for forward. */
  const held = new Set();
  const touches = new Map();
  let konami = 0;
  let cruise = false;

  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const progressing = event.code === KONAMI[konami];
    konami = progressing ? konami + 1 : event.code === KONAMI[0] ? 1 : 0;
    if (konami === KONAMI.length) {
      konami = 0;
      onAction('konami');
      return;
    }
    const action = ACTION_KEYS[event.code];
    if (action && !event.repeat) {
      // Let dialogs handle Escape themselves while they are open.
      if (onAction(action, event) === true) event.preventDefault();
      return;
    }
    if (DRIVE_KEYS[event.code] && isDriving()) {
      event.preventDefault();
      held.add(event.code);
    }
  });
  window.addEventListener('keyup', event => held.delete(event.code));

  for (const button of touchRoot.querySelectorAll('[data-control]')) {
    const control = button.dataset.control;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (!isDriving()) return;
      button.setPointerCapture(event.pointerId);
      touches.set(event.pointerId, control);
      button.classList.add('pressed');
    });
    const release = event => {
      touches.delete(event.pointerId);
      if (![...touches.values()].includes(control)) button.classList.remove('pressed');
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    button.addEventListener('contextmenu', event => event.preventDefault());
  }

  for (const button of touchRoot.querySelectorAll('[data-action]')) {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      onAction(button.dataset.action);
    });
  }

  function clear() {
    held.clear();
    touches.clear();
    for (const button of touchRoot.querySelectorAll('.pressed')) button.classList.remove('pressed');
  }

  return {
    clear,
    get cruise() {
      return cruise;
    },
    set cruise(value) {
      cruise = value;
    },
    /** The current driving input for stepDriving(). */
    read() {
      const pressed = name => [...held].some(code => DRIVE_KEYS[code] === name) || [...touches.values()].includes(name);
      const motion = tilt.getState();
      return {
        forward: pressed('forward'),
        // Leaning the screen back holds the reverse pedal down, when that's switched on.
        backward: pressed('backward') || motion.reversing,
        left: pressed('left'),
        right: pressed('right'),
        // While tilt is finding its centre, hold the car still.
        brake: pressed('brake') || motion.pending || (motion.enabled && !motion.ready),
        steer: motion.steering,
        cruise,
      };
    },
  };
}
