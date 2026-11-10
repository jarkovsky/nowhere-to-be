// The view from a lookout. When the car has stood still for a few seconds on one of the
// lookouts, the camera slowly rises and swings out to look along the view from there, and
// drifts back behind the car as soon as the car is asked to move. Nothing is counted or shown:
// the view is the whole reward. This works out when that is, and what the chase camera is then
// asked to frame (its `watch`, see camera.js).

/** How slowly the car must be going, in metres a second, to count as standing still. */
export const STILL_SPEED = 0.3;
/** How long it must stand still on a lookout before the view begins, in seconds. */
export const STILL_TIME = 3;
/** How far the steering must be held over (with tilt) to count as steering. */
const STEER_DEADBAND = 0.25;
/** Seconds the view takes to turn once through its small swing to either side, and how far that swings, in radians. */
const DRIFT_PERIOD = 70;
const DRIFT_SWING = 0.07;

/** The lookout whose spot (x, z) is in, or null. */
export function lookoutAt(lookouts, x, z) {
  return lookouts.find(spot => Math.hypot(x - spot.x, z - spot.z) <= spot.radius) ?? null;
}

/** True when the driver is asking the car to move: pedal or cruise (unless braking), or steering. */
export function asksToMove(input) {
  const steering = input.left || input.right || Math.abs(input.steer ?? 0) > STEER_DEADBAND;
  return Boolean(steering || (!input.brake && (input.forward || input.backward || input.cruise)));
}

/**
 * @param lookouts  The spots: { x, z, radius, bearing, zoom?, pitch?, toward? }, where `bearing`
 *                  is the way to look, as atan2(dx, dz) of a point in that direction.
 */
export function createViews(lookouts) {
  let stood = 0; // seconds standing still on a lookout
  let spot = null;
  let showing = false;
  let braked = false; // the brake was held when the view began
  let dismissed = false; // the player took hold of the camera; wait for the car to move again
  let clock = 0;

  function end() {
    stood = 0;
    spot = null;
    showing = false;
    braked = false;
    clock = 0;
  }

  return {
    /**
     * Called every frame with the car (x, z, speed), the driving input and the seconds gone by.
     * `held` is true while something else has the car or the camera (the mud hole, the ferry, the
     * tow); `touched` while the player is zooming or dragging the camera. Returns the framing
     * for the chase camera, or null when there is no view.
     */
    watch(car, input, dt, { held = false, touched = false } = {}) {
      const moving = asksToMove(input) || Math.abs(car.speed) >= STILL_SPEED;
      if (moving) dismissed = false;
      if (held || moving || (showing && braked && !input.brake)) return (end(), null);
      if (touched && showing) dismissed = true;
      if (dismissed) return (end(), null);
      const here = lookoutAt(lookouts, car.x, car.z);
      if (!here) return (end(), null);
      if (here !== spot) {
        stood = 0;
        spot = here;
      }
      stood += dt;
      if (!showing) {
        if (stood < STILL_TIME) return null;
        showing = true;
        braked = Boolean(input.brake);
      }
      clock += dt;
      // Holds the view, drifting a few degrees either way, never going round.
      const bearing = here.bearing + Math.sin((clock / DRIFT_PERIOD) * Math.PI * 2) * DRIFT_SWING;
      return {
        x: car.x + Math.sin(bearing) * 120,
        z: car.z + Math.cos(bearing) * 120,
        zoom: here.zoom ?? 3,
        pitch: here.pitch ?? 0.05,
        toward: here.toward ?? 0.65,
        turn: Math.PI,
        ease: 0.5,
      };
    },
    /** True while the view is showing. */
    isShowing: () => showing,
  };
}
