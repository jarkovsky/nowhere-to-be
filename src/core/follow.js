// Friends tagging along drive where their leader drove. The leader leaves breadcrumbs
// behind it, and each friend drives along them a little way behind: at the leader's
// speed, faster when it has fallen behind, and stopping when the leader stops. When the
// leader backs up, the breadcrumbs it backs over are picked up again and the friend backs
// off along the ones behind it, so it never ends up in the way. A friend's route starts
// where the friend was when it set off, so the first stretch leads it to the leader's path.
// No Three.js here, so it can be tested on its own.
import { clamp, damp } from './math.js';

/** Metres between breadcrumbs. */
export const SPACING = 0.8;
/** A leader that moves further than this in one step has jumped (a reset, a teleport). */
export const JUMP = 8;
/** How much of the route behind a friend is kept, to back off along. */
const HISTORY = 60;
/** How far back along the route a leader backing up can pick up breadcrumbs. */
const RETRACT = 30;

/** A route of breadcrumbs: positions and the distance along the route to each, in a ring. */
export function createRoute(capacity = 1024) {
  return {
    x: new Float64Array(capacity),
    z: new Float64Array(capacity),
    s: new Float64Array(capacity),
    first: 0,
    count: 0,
    capacity,
  };
}

const slot = (route, i) => (route.first + i) % route.capacity;

/** Adds a breadcrumb at the end of the route. A full route forgets its oldest one. */
export function addCrumb(route, x, z) {
  if (route.count === route.capacity) {
    route.first = (route.first + 1) % route.capacity;
    route.count--;
  }
  const last = route.count ? slot(route, route.count - 1) : -1;
  const k = slot(route, route.count);
  route.x[k] = x;
  route.z[k] = z;
  route.s[k] = last < 0 ? 0 : route.s[last] + Math.hypot(x - route.x[last], z - route.z[last]);
  route.count++;
}

/** Empties the route and starts it with `points`, [[x, z], ...]. */
export function startRoute(route, points) {
  route.first = 0;
  route.count = 0;
  for (const [x, z] of points) addCrumb(route, x, z);
}

export const routeStart = route => route.s[slot(route, 0)];
export const routeEnd = route => route.s[slot(route, route.count - 1)];

/** The index of the last breadcrumb at or before distance `s`. */
function indexAt(route, s) {
  let lo = 0;
  let hi = route.count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (route.s[slot(route, mid)] <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Writes the point at distance `s` along the route into `out` ({ x, z }), and returns it. */
export function pointAt(route, s, out) {
  const i = indexAt(route, s);
  const a = slot(route, i);
  if (i === route.count - 1) {
    out.x = route.x[a];
    out.z = route.z[a];
    return out;
  }
  const b = slot(route, i + 1);
  const length = route.s[b] - route.s[a];
  const t = length > 1e-9 ? clamp((s - route.s[a]) / length, 0, 1) : 0;
  out.x = route.x[a] + (route.x[b] - route.x[a]) * t;
  out.z = route.z[a] + (route.z[b] - route.z[a]) * t;
  return out;
}

const ahead = { x: 0, z: 0 };
const behind = { x: 0, z: 0 };

/**
 * Where a vehicle with its middle at `s` along the route is, and which way it faces: its
 * axles, `wheelbase` apart, both on the route. Writes { x, z, heading } into `out`.
 */
export function poseAt(route, s, wheelbase, out) {
  const lo = routeStart(route);
  const hi = routeEnd(route);
  pointAt(route, clamp(s, lo, hi), out);
  pointAt(route, clamp(s + wheelbase / 2, lo, hi), ahead);
  pointAt(route, clamp(s - wheelbase / 2, lo, hi), behind);
  const dx = ahead.x - behind.x;
  const dz = ahead.z - behind.z;
  if (dx * dx + dz * dz > 1e-8) out.heading = Math.atan2(-dx, -dz);
  return out;
}

/** How far along the route the leader at (x, z) is: just beyond its last breadcrumb. */
export function leaderAlong(route, x, z) {
  const k = slot(route, route.count - 1);
  return route.s[k] + Math.hypot(x - route.x[k], z - route.z[k]);
}

/**
 * Lays breadcrumbs behind a leader at (x, z) moving at `speed` (negative when reversing).
 * Going forward, it drops one every SPACING metres. Backing up along the route, it picks
 * up the ones it backs over, so the route always leads forward to it. Returns false when
 * the leader has jumped too far from the end of the route to follow.
 */
export function layCrumbs(route, x, z, speed) {
  if (route.count === 0) {
    addCrumb(route, x, z);
    return true;
  }
  const k = slot(route, route.count - 1);
  const gap = Math.hypot(x - route.x[k], z - route.z[k]);
  if (gap > JUMP) return false;
  if (speed >= -0.1) {
    if (gap >= SPACING) addCrumb(route, x, z);
    return true;
  }
  // Backing up: find where along the last stretch of the route the leader now is.
  const end = route.s[k];
  let best = Infinity;
  let at = end;
  for (let i = route.count - 2; i >= 0; i--) {
    const a = slot(route, i);
    const b = slot(route, i + 1);
    if (end - route.s[b] > RETRACT) break;
    const dx = route.x[b] - route.x[a];
    const dz = route.z[b] - route.z[a];
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 1e-12 ? clamp(((x - route.x[a]) * dx + (z - route.z[a]) * dz) / lengthSq, 0, 1) : 0;
    const distance = Math.hypot(x - route.x[a] - dx * t, z - route.z[a] - dz * t);
    if (distance < best) {
      best = distance;
      at = route.s[a] + (route.s[b] - route.s[a]) * t;
    }
  }
  // Only when it is backing up along the route rather than off to one side of it.
  if (best < 3 && at < end - 0.05) cutRoute(route, at);
  return true;
}

/** Shortens the route so it ends at distance `s` along it. */
function cutRoute(route, s) {
  const i = indexAt(route, s);
  pointAt(route, s, ahead);
  route.count = i + 1;
  const k = slot(route, i);
  if (s - route.s[k] > 0.01) {
    addCrumb(route, ahead.x, ahead.z);
  }
}

/**
 * Adds the breadcrumbs of `from` between distances `s` and `until` along it to the end of
 * `route`: the way on from there, for a friend taking up someone else's way.
 */
export function joinRoute(route, from, s, until = Infinity) {
  for (let i = indexAt(from, s) + 1; i < from.count; i++) {
    const k = slot(from, i);
    if (from.s[k] > until) break;
    addCrumb(route, from.x[k], from.z[k]);
  }
}

const closest = { s: 0, distance: Infinity };

/** The breadcrumb nearest to (x, z): how far along the route it is, and how far away. */
export function nearestCrumb(route, x, z) {
  closest.distance = Infinity;
  for (let i = 0; i < route.count; i++) {
    const k = slot(route, i);
    const distance = Math.hypot(x - route.x[k], z - route.z[k]);
    if (distance < closest.distance) {
      closest.distance = distance;
      closest.s = route.s[k];
    }
  }
  return closest;
}

/**
 * Moves the breadcrumbs from the first one that `keep(x, z)` on, each with `move` ({ x, z }), and
 * forgets the ones before it: the way along the deck of a ferry that has sailed, and not the way
 * there over the land it has left.
 */
export function moveRoute(route, keep, move) {
  while (route.count > 1 && !keep(route.x[route.first], route.z[route.first])) {
    route.first = (route.first + 1) % route.capacity;
    route.count--;
  }
  const crumb = { x: 0, z: 0 };
  for (let i = 0; i < route.count; i++) {
    const k = slot(route, i);
    crumb.x = route.x[k];
    crumb.z = route.z[k];
    move(crumb);
    route.x[k] = crumb.x;
    route.z[k] = crumb.z;
  }
}

/** Forgets the breadcrumbs more than HISTORY metres behind `s`. */
export function forgetBehind(route, s) {
  while (route.count > 2 && route.s[slot(route, 1)] < s - HISTORY) {
    route.first = (route.first + 1) % route.capacity;
    route.count--;
  }
}

export function createFollower(s = 0) {
  return { s, speed: 0 };
}

/**
 * Moves a friend on along its route by `dt` and returns how far apart it and its leader
 * are. `leader.along` is how far along the route the leader's middle is and `leader.speed`
 * its speed. `leader.straight` is the clear distance to it in a straight line, when it is
 * in front (it may have come back towards the friend some other way), and `leader.blocked`
 * how far ahead along the route something else is in the way. `options.length` is the
 * distance between the two middles when they touch: the leader's back half and the friend's
 * front half. The friend keeps `gap` metres clear when it can and backs off to keep `least`.
 */
export function stepFollower(follower, route, leader, dt, options) {
  const { length, gap, least, top, catchUp = top } = options;
  const { along, speed, straight = Infinity, blocked = Infinity } = leader;
  const clear = Math.min(along - follower.s - length, straight);
  const limit = clear - gap > 15 ? catchUp : top;
  let target = clamp((clear - gap) * 0.9 + speed, -6, limit);
  // Having stopped a little closer than it likes, it stays put rather than backing up,
  // unless the leader is backing up or is too close.
  if (speed > -0.3 && clear > least) target = Math.max(target, 0);
  // Something else in the way along the route: stop a little short of it.
  target = Math.min(target, Math.max(0, (blocked - 1.5) * 1.2));
  if (clear < least) target = Math.min(target, Math.min(0, speed) - (least - clear) * 2);
  follower.speed = damp(follower.speed, target, target < follower.speed ? 5 : 1.4, dt);
  // Never past the end of the route, nor so far along it that the two would touch: a leader
  // backing up faster than the friend can back off pushes it back along the route.
  const lo = routeStart(route);
  const hi = Math.max(lo, Math.min(routeEnd(route), along - length - 0.3));
  const next = clamp(follower.s + follower.speed * dt, lo, hi);
  if (dt > 0) follower.speed = (next - follower.s) / dt;
  follower.s = next;
  forgetBehind(route, follower.s);
  return clear;
}
