// The lorry's trailer. A trailer's front rests on the hitch above the lorry's back
// wheels, and its own wheels follow the hitch the way a real trailer's do, cutting in
// a little on bends. Reversing is made forgiving: the trailer always swings back into
// line rather than folding up, which a small driver would have no way to undo.
import { angleDelta, clamp } from './math.js';

/** How far the trailer can swing out to either side before it would touch the lorry's wheels. */
export const MAX_SWING = 1.05;

export function createTrailerState() {
  return { x: 0, z: 0, heading: 0, ready: false };
}

/**
 * Moves the trailer on after the hitch has moved to (x, z) with the lorry facing
 * `heading`. `length` is from the hitch back to the trailer's middle axle. A big jump
 * (a new vehicle, or a teleport) puts it straight behind the lorry.
 */
export function stepTrailer(trailer, hitch, heading, length) {
  const moved = Math.hypot(hitch.x - trailer.x, hitch.z - trailer.z);
  if (!trailer.ready || moved > 5) {
    trailer.heading = heading;
    trailer.ready = true;
  } else {
    trailer.heading += clamp(moved / length, 0, 1) * Math.sin(angleDelta(trailer.heading, heading));
    const swing = angleDelta(heading, trailer.heading);
    if (Math.abs(swing) > MAX_SWING) trailer.heading = heading + Math.sign(swing) * MAX_SWING;
  }
  trailer.x = hitch.x;
  trailer.z = hitch.z;
  return trailer;
}

/** How far the trailer is swung out from straight behind the lorry, in radians. */
export const swingOf = (trailer, heading) => angleDelta(heading, trailer.heading);
