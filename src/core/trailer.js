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

/**
 * Hangs a lorry's trailer from its hitch, lets it follow on behind and rests its wheels on the
 * ground `sample` gives. `car` is the lorry's model, `trailer` where its trailer is, and `hitch`
 * and `point` vectors to work in.
 */
export function hangTrailer({ car, trailer, hitch, point }, heading, speed, sample) {
  const { root, axles, spec } = car.trailer;
  const { radius } = spec.wheel;
  car.root.localToWorld(hitch.set(...spec.hitch));
  const moved = Math.hypot(hitch.x - trailer.x, hitch.z - trailer.z);
  stepTrailer(trailer, hitch, heading, spec.axle);
  const sin = Math.sin(trailer.heading);
  const cos = Math.cos(trailer.heading);
  const ground = (lx, lz) => sample(hitch.x + cos * lx + sin * lz, hitch.z - sin * lx + cos * lz);
  const left = ground(-spec.track / 2, spec.axle);
  const right = ground(spec.track / 2, spec.axle);
  // Tip it until the middle axle's wheels are on the ground, and lean it with the ground beneath them.
  const drop = (left + right) / 2 + radius + 0.01 - hitch.y - spec.rest;
  root.position.copy(hitch);
  root.rotation.set(
    Math.asin(clamp(-drop / spec.axle, -0.5, 0.5)),
    trailer.heading,
    Math.atan((right - left) / spec.track),
    'YXZ',
  );
  root.updateMatrixWorld();
  // Then each axle rides up or down a little to meet the ground under it.
  const roll = moved < 5 ? moved * Math.sign(speed) : 0;
  for (const axle of axles) {
    const under = (ground(-spec.track / 2, axle.z) + ground(spec.track / 2, axle.z)) / 2 + radius + 0.01;
    const height = root.localToWorld(point.set(0, spec.rest, axle.z)).y;
    axle.pivot.position.y = spec.rest + clamp(under - height, -0.24, 0.13);
    axle.spin.rotation.x -= roll / radius;
  }
}
