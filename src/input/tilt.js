const radians = Math.PI / 180;
const clamp = value => Math.max(-1, Math.min(1, value));
const difference = (angle, center) => ((angle - center + 540) % 360) - 180;

// Project world-up into the screen plane using the W3C Z-X-Y rotation matrix.
// Unlike gamma alone, this also works with the screen upright like a steering wheel.
// Positive roll means counterclockwise (left), matching the driving model.
export function screenRoll(beta, gamma, screenAngle = 0) {
  if (![beta, gamma, screenAngle].every(Number.isFinite)) return null;
  const b = beta * radians,
    g = gamma * radians,
    a = screenAngle * radians;
  const x = -Math.cos(b) * Math.sin(g),
    y = Math.sin(b);
  if (Math.hypot(x, y) < 0.25) return null; // A screen lying flat has no stable wheel angle.
  return Math.atan2(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)) / radians;
}

export function steeringFromRoll(angle, center) {
  if (![angle, center].every(Number.isFinite)) return 0;
  const delta = difference(angle, center);
  // Three degrees of quiet hands; full lock at a comfortable thirty degrees.
  return Math.sign(delta) * Math.min(1, Math.max(0, Math.abs(delta) - 3) / 27);
}

/**
 * How far the screen leans back from upright, in degrees: 0 held upright, 90 lying flat face
 * up, below 0 tipped forward. It is the angle between the screen and the vertical, so it reads
 * the same whichever way round the screen is turned, portrait or landscape.
 */
export function screenPitch(beta, gamma) {
  if (![beta, gamma].every(Number.isFinite)) return null;
  // How much of world-up points out of the screen: the z of the same vector screenRoll uses.
  return Math.asin(clamp(Math.cos(beta * radians) * Math.cos(gamma * radians))) / radians;
}

/**
 * Leaning the screen back to reverse, in degrees of pitch past the pose tilt was centred in. It
 * starts reversing once leaned back `from` degrees for `hold` seconds, so laying the device down
 * in one go doesn't, and stops as soon as it comes back by `band`. Held far back already, it
 * starts at `limit` instead, short of lying flat, but never less than `least` past the pose. A
 * centre is only taken from a pose short of `level`, not while the device is being picked up.
 */
export const LEAN_BACK = { from: 20, least: 10, limit: 68, band: 8, hold: 0.4, level: 60 };

/** The pitches at which leaning back starts and stops reversing, for a device held upright at `upright`. */
export function leanBackThresholds(upright) {
  const enter = upright + Math.max(LEAN_BACK.least, Math.min(LEAN_BACK.from, LEAN_BACK.limit - upright));
  return { enter, exit: enter - LEAN_BACK.band };
}

const RESTING = Object.freeze({ reversing: false, held: 0 });

/**
 * One step of leaning back to reverse. `state` is { reversing, held }: whether the car is
 * reversing, and for how long the screen has been leaned back far enough. `pitch` is null with
 * no reading or the screen lying flat, and `upright` null until it is known.
 */
export function stepLeanBack(state, pitch, upright, dt) {
  if (pitch === null || upright === null) return RESTING;
  const { enter, exit } = leanBackThresholds(upright);
  if (state.reversing) return pitch < exit ? RESTING : state;
  const held = pitch >= enter ? state.held + dt : 0;
  return { reversing: held >= LEAN_BACK.hold, held };
}

export function createTiltSteering(host = window, onChange = () => {}) {
  let enabled = false,
    pending = false,
    ready = false,
    status = 'off';
  let roll = null,
    center = null,
    target = 0,
    steering = 0,
    angle = null;
  // Leaning back to reverse: the latest pitch, the pitch it was centred at, and whether it's on.
  let pitch = null,
    upright = null,
    leanBack = false,
    lean = RESTING;
  let timeout,
    generation = 0,
    listening = false;
  const orientation = host.screen?.orientation;
  const screenAngle = () =>
    Number.isFinite(orientation?.angle) ? orientation.angle : Number.isFinite(host.orientation) ? host.orientation : 0;
  const getState = () => ({ enabled, pending, ready, status, steering, reversing: lean.reversing });
  /** A centre for leaning back is only taken from a pose well short of lying flat. */
  const uprightFrom = value => (value !== null && value < LEAN_BACK.level ? value : null);
  function report(next) {
    if (status !== next) {
      status = next;
      onChange(getState());
    }
  }
  function clearTimeout() {
    host.clearTimeout(timeout);
    timeout = undefined;
  }
  function received(event) {
    if (!enabled) return;
    const currentAngle = screenAngle();
    if (currentAngle !== angle) {
      angle = currentAngle;
      center = upright = null;
      steering = 0;
    }
    if (![event.beta, event.gamma].every(Number.isFinite)) {
      roll = pitch = null;
      ready = false;
      target = steering = 0;
      report('waiting');
      return;
    }
    roll = screenRoll(event.beta, event.gamma, currentAngle);
    pitch = screenPitch(event.beta, event.gamma);
    clearTimeout();
    if (roll === null) {
      ready = false;
      target = steering = 0;
      report('upright');
      return;
    }
    if (center === null) center = roll;
    upright ??= uprightFrom(pitch);
    ready = true;
    target = steeringFromRoll(roll, center);
    report('ready');
  }
  function rotationChanged() {
    if (!enabled) return;
    roll = center = pitch = upright = null;
    target = steering = 0;
    ready = false;
    report('centering');
  }
  function detach() {
    clearTimeout();
    if (!listening) return;
    host.removeEventListener('deviceorientation', received);
    host.removeEventListener('orientationchange', rotationChanged);
    orientation?.removeEventListener('change', rotationChanged);
    listening = false;
  }
  function disable(next = 'off') {
    generation++;
    detach();
    enabled = pending = ready = false;
    roll = center = angle = pitch = upright = null;
    target = steering = 0;
    lean = RESTING;
    report(next);
  }
  return {
    getState,
    // Called directly by the click handler, before any other asynchronous work.
    async enable() {
      if (enabled || pending) return;
      if (!host.isSecureContext) {
        disable('insecure');
        return;
      }
      const api = host.DeviceOrientationEvent;
      if (!api) {
        disable('unsupported');
        return;
      }
      const attempt = ++generation;
      pending = true;
      report('permission');
      try {
        const permission = typeof api.requestPermission === 'function' ? await api.requestPermission() : 'granted';
        if (generation !== attempt) return;
        if (permission !== 'granted') {
          disable('denied');
          return;
        }
        pending = false;
        enabled = true;
        ready = false;
        center = roll = pitch = upright = null;
        angle = screenAngle();
        report('waiting');
        host.addEventListener('deviceorientation', received);
        host.addEventListener('orientationchange', rotationChanged);
        orientation?.addEventListener('change', rotationChanged);
        listening = true;
        timeout = host.setTimeout(() => disable('unavailable'), 6000);
      } catch {
        if (generation === attempt) disable('unavailable');
      }
    },
    disable,
    center() {
      if (!enabled) return false;
      target = steering = 0;
      if (roll === null) {
        center = upright = null;
        ready = false;
        report('centering');
        return false;
      }
      center = roll;
      upright = uprightFrom(pitch);
      ready = true;
      report('ready');
      return true;
    },
    // Require a fresh reading after returning from a hidden/backgrounded page.
    suspend() {
      if (enabled) rotationChanged();
    },
    /** Leaning the screen back reverses the car while `on`; off, tilt steers just as before. */
    setLeanBack(on) {
      leanBack = on;
      if (!on) lean = RESTING;
    },
    update(dt, active) {
      const live = active && enabled && ready;
      lean = live && leanBack ? stepLeanBack(lean, pitch, upright, dt) : RESTING;
      if (!live) {
        steering = 0;
        return;
      }
      steering += (target - steering) * (1 - Math.exp(-12 * Math.max(0, Math.min(dt, 0.05))));
      if (Math.abs(steering) < 0.001) steering = 0;
      steering = clamp(steering);
    },
  };
}
