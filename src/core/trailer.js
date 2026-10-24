// The lorry's trailer. A trailer's front rests on the hitch above the lorry's back
// wheels, and its own wheels follow the hitch the way a real trailer's do, cutting in
// a little on bends. Reversing is made forgiving: the trailer always swings back into
// line rather than folding up, which a small driver would have no way to undo.
import { penetration } from './collision.js';
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

/**
 * The trailer's sides as circles: how far back from the hitch each is, clear of the lorry's own
 * back, and how big. They reach from just behind the lorry to the trailer's back.
 */
const SIDES = { along: [2.6, 4.25, 5.9, 7.55], radius: 1.25 };

/**
 * Swings the trailer away from whatever its sides would go into, no further than it can swing
 * from the lorry facing `heading`. It never holds the lorry back: running into a wall end on, it
 * goes into it a little rather than stopping the lorry. `obstacles` is an obstacle index, and
 * `level` how high the lorry's wheels are.
 */
export function swingClear(trailer, heading, obstacles, level) {
  for (let pass = 0; pass < 3; pass++) {
    const sin = Math.sin(trailer.heading);
    const cos = Math.cos(trailer.heading);
    let turn = 0;
    for (const along of SIDES.along) {
      const x = trailer.x + sin * along;
      const z = trailer.z + cos * along;
      for (const obstacle of obstacles.near(x, z, SIDES.radius + 2, level)) {
        const hit = penetration(x, z, SIDES.radius, obstacle);
        if (!hit) continue;
        // Turning the trailer by an angle moves this circle that far times `along`, sideways.
        const want = (hit.depth * (hit.nx * cos - hit.nz * sin)) / along;
        if (Math.abs(want) > Math.abs(turn)) turn = want;
      }
    }
    if (Math.abs(turn) < 1e-4) break;
    trailer.heading += turn;
    const swing = angleDelta(heading, trailer.heading);
    if (Math.abs(swing) > MAX_SWING) trailer.heading = heading + Math.sign(swing) * MAX_SWING;
  }
  return trailer;
}

/** How far the trailer is swung out from straight behind the lorry, in radians. */
export const swingOf = (trailer, heading) => angleDelta(heading, trailer.heading);

/**
 * Hangs a lorry's trailer from its hitch, lets it follow on behind and rests its wheels on the
 * ground `sample` gives. `car` is the lorry's model, `trailer` where its trailer is, and `hitch`
 * and `point` vectors to work in. Given `obstacles` (an index) it swings clear of them, for the
 * lorry's wheels at `level`.
 */
export function hangTrailer({ car, trailer, hitch, point, obstacles, level }, heading, speed, sample) {
  const { root, axles, spec } = car.trailer;
  const { radius } = spec.wheel;
  car.root.localToWorld(hitch.set(...spec.hitch));
  const moved = Math.hypot(hitch.x - trailer.x, hitch.z - trailer.z);
  stepTrailer(trailer, hitch, heading, spec.axle);
  if (obstacles) swingClear(trailer, heading, obstacles, level);
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
