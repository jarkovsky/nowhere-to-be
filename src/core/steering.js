// How far the vehicles that drive themselves turn their wheels, worked out from the way they
// move, as a bicycle would: a vehicle turning at `yawRate` and going at `speed` has its
// steered wheels at atan(wheelbase × yawRate / speed). The player's car turns the same way
// (see driving.js). Vehicles steered by their back wheels, like the combine, give a negative
// wheelbase, so their wheels turn the other way.
import { angleDelta, clamp, damp } from './math.js';

/** As far as the wheels turn either way, as far as the player's car turns them. */
const LOCK = 0.58;
/** Slower than this, the way a vehicle turns says little about its wheels: they stay as they are. */
const CREEP = 0.3;
/** More than this in one step is a vehicle put somewhere else, not one going round a bend. */
const JUMP = 0.5;

/** `wheelbase` is from the fixed axle to the steered one, negative when the back wheels steer. */
export function createSteering(wheelbase, lock = LOCK) {
  return { wheelbase, lock, angle: 0, heading: null };
}

/**
 * Turns the wheels for a vehicle that has come round to `heading` in `dt` seconds at `speed`
 * (negative in reverse), easing them so they don't twitch, and returns their angle. After
 * `heading` is set to null, as for a vehicle that has been out of sight, it starts afresh.
 */
export function steer(steering, heading, speed, dt) {
  const last = steering.heading;
  steering.heading = heading;
  if (last === null || !(dt > 0) || Math.abs(speed) < CREEP) return steering.angle;
  const turned = angleDelta(last, heading);
  if (Math.abs(turned) > JUMP) return steering.angle;
  const { wheelbase, lock } = steering;
  const angle = clamp(Math.atan((wheelbase * turned) / dt / speed), -lock, lock);
  steering.angle = damp(steering.angle, angle, 8, dt);
  return steering.angle;
}
