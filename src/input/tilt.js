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
  let timeout,
    generation = 0,
    listening = false;
  const orientation = host.screen?.orientation;
  const screenAngle = () =>
    Number.isFinite(orientation?.angle) ? orientation.angle : Number.isFinite(host.orientation) ? host.orientation : 0;
  const getState = () => ({ enabled, pending, ready, status, steering });
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
      center = null;
      steering = 0;
    }
    if (![event.beta, event.gamma].every(Number.isFinite)) {
      roll = null;
      ready = false;
      target = steering = 0;
      report('waiting');
      return;
    }
    roll = screenRoll(event.beta, event.gamma, currentAngle);
    clearTimeout();
    if (roll === null) {
      ready = false;
      target = steering = 0;
      report('upright');
      return;
    }
    if (center === null) center = roll;
    ready = true;
    target = steeringFromRoll(roll, center);
    report('ready');
  }
  function rotationChanged() {
    if (!enabled) return;
    roll = center = null;
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
    roll = center = angle = null;
    target = steering = 0;
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
        center = roll = null;
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
        center = null;
        ready = false;
        report('centering');
        return false;
      }
      center = roll;
      ready = true;
      report('ready');
      return true;
    },
    // Require a fresh reading after returning from a hidden/backgrounded page.
    suspend() {
      if (enabled) rotationChanged();
    },
    update(dt, active) {
      if (!active || !enabled || !ready) {
        steering = 0;
        return;
      }
      steering += (target - steering) * (1 - Math.exp(-12 * Math.max(0, Math.min(dt, 0.05))));
      if (Math.abs(steering) < 0.001) steering = 0;
      steering = clamp(steering);
    },
    dispose() {
      disable();
    },
  };
}
