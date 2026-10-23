// Getting stuck in the mud hole by the farm, and the farm's tractor pulling the car out.
// Pure logic, independent of rendering so it can be unit tested.
//
// A car that drives into the soft middle of the hole slows, sinks a little and soon stops,
// its wheels spinning while it tries to go on. It can still creep back out the way it came.
// Once it has sat there for a few seconds, the tractor sets off from where it is parked, comes
// round to stop in front of the car (in front the way the car was going) and a rope goes on
// between them. The tractor pulls the car on through and out onto firm ground, lets the rope
// drop, toots and drives home. If the car gets out by itself first, the tractor turns back.
// After a tow the hole doesn't hold the car again until it has been well away or the tractor
// is home, so one tow can't lead straight into another.
import { clamp, damp, segmentDistance, smoothstep } from './math.js';

/** How long the car sits stuck before the tractor sets off, in seconds. */
export const WAIT = 3;
/** The rope's length. The tractor stops close enough for it to sag a little at first. */
export const ROPE = 5.5;
const SLACK = 0.8;
/** How fast the rope is pulled in once it is off. */
const REEL = 2.5;
/** From the middle of the tractor back to its hitch. */
export const HITCH = 3.05;
/** The tractor's turning circle, its radius in metres. */
const TURN = 4.5;
/** How fast the tractor drives out to the car, home again (only a little slower than the car on cruise), and pulling. */
const DRIVE = 5;
const HOMEWARD = 6.2;
const PULL = 1.8;
/** How far the car sinks in the middle of the hole, and how much further while its wheels dig in. */
const DEPTH = 0.24;
const DIG = 0.1;
/** How fast the car can creep back out the way it came. */
const CRAWL = 1.4;
/** How fast the wheels turn while they spin in the mud, as metres a second at the tyre. */
const SPIN = 7;
/** How close the middle of the tractor comes to the car's outline. */
const CLEARANCE = 3.4;
/** How far past the edge of the mud the car is let go. */
const FIRM = 1.5;
/** How far apart the points along a route are checked for clear ground. */
const STEP = 0.5;

const TAU = Math.PI * 2;
/** Turned a quarter to the right of a direction. */
const normal = (dx, dz) => ({ x: -dz, z: dx });
const facing = heading => ({ x: -Math.sin(heading), z: -Math.cos(heading) });
const headingOf = (dx, dz) => Math.atan2(-dx, -dz);
const approach = (value, target, step) => value + clamp(target - value, -step, step);

// --- Routes -------------------------------------------------------------------------------
// A route is a list of pieces: arcs of the tractor's turning circle and straight runs.

/** The arc round `c` from point `a` to point `b`, turning to the right (`side` 1) or the left (-1). */
function arcRound(c, a, b, side, radius) {
  const start = Math.atan2(a.z - c.z, a.x - c.x);
  const end = Math.atan2(b.z - c.z, b.x - c.x);
  const turn = (((side * (end - start)) % TAU) + TAU) % TAU;
  return { c, radius, start, side, length: (turn > TAU - 1e-6 ? 0 : turn) * radius };
}

/** Where a piece of route is `t` metres along it, and which way it runs there. */
function along(piece, t) {
  if (!piece.c) return { x: piece.x + piece.dx * t, z: piece.z + piece.dz * t, dx: piece.dx, dz: piece.dz };
  const { c, radius, start, side } = piece;
  const a = start + (side * t) / radius;
  return {
    x: c.x + Math.cos(a) * radius,
    z: c.z + Math.sin(a) * radius,
    dx: -side * Math.sin(a),
    dz: side * Math.cos(a),
  };
}

/**
 * The ways from one pose ({ x, z, dx, dz }) to another that turn as tightly as the tractor
 * can, run straight and turn again: to the right or the left at each end.
 */
function turnRunTurn(from, to) {
  const ways = [];
  for (const first of [1, -1]) {
    for (const last of [1, -1]) {
      const n0 = normal(from.dx, from.dz);
      const n1 = normal(to.dx, to.dz);
      const c0 = { x: from.x + first * TURN * n0.x, z: from.z + first * TURN * n0.z };
      const c1 = { x: to.x + last * TURN * n1.x, z: to.z + last * TURN * n1.z };
      const gap = Math.hypot(c1.x - c0.x, c1.z - c0.z);
      if (first !== last && gap < 2 * TURN) continue;
      if (gap < 1e-6) {
        ways.push([arcRound(c0, from, to, first, TURN)]);
        continue;
      }
      // Turning the same way at both ends, the straight runs parallel to the line between
      // the circles; turning opposite ways, it crosses between them.
      const ux = (c1.x - c0.x) / gap;
      const uz = (c1.z - c0.z) / gap;
      const run = first === last ? gap : Math.sqrt(gap ** 2 - 4 * TURN ** 2);
      const cross = first === last ? 0 : (2 * first * TURN) / gap;
      const dx = (run / gap) * ux - cross * uz;
      const dz = (run / gap) * uz + cross * ux;
      const n = normal(dx, dz);
      const t0 = { x: c0.x - first * TURN * n.x, z: c0.z - first * TURN * n.z };
      const t1 = { x: c1.x - last * TURN * n.x, z: c1.z - last * TURN * n.z };
      ways.push([
        arcRound(c0, from, t0, first, TURN),
        { ...t0, dx, dz, length: run },
        arcRound(c1, t1, to, last, TURN),
      ]);
    }
  }
  return ways;
}

function route(pieces) {
  const length = pieces.reduce((sum, piece) => sum + piece.length, 0);
  return {
    length,
    /** The pose `s` metres along the route. */
    at(s) {
      let left = clamp(s, 0, length);
      for (const piece of pieces) {
        if (left <= piece.length) return along(piece, left);
        left -= piece.length;
      }
      return along(pieces.at(-1), pieces.at(-1).length);
    },
  };
}

/**
 * The tractor's way from one pose ({ x, z, dx, dz }) to another: the shortest that keeps to
 * ground where `clear(x, z)` is true, going straight there or by way of one of the poses in
 * `via`. If none keeps to it, the one that strays from it least.
 */
export function planRoute(from, to, clear, via = []) {
  const routes = turnRunTurn(from, to).map(route);
  for (const pose of via) {
    const onwards = turnRunTurn(pose, to);
    for (const first of turnRunTurn(from, pose)) for (const then of onwards) routes.push(route([...first, ...then]));
  }
  routes.sort((a, b) => a.length - b.length);
  let best = routes[0];
  let fewest = Infinity;
  for (const candidate of routes) {
    let strays = 0;
    for (let s = 0; s <= candidate.length && strays < fewest; s += STEP) {
      const p = candidate.at(s);
      if (!clear(p.x, p.z)) strays++;
    }
    if (strays < fewest) {
      best = candidate;
      fewest = strays;
      if (strays === 0) break;
    }
  }
  return best;
}

// --- The car ------------------------------------------------------------------------------

/**
 * The car's outline as lines to keep clear of: from its front to its back, and its trailer.
 * `body` is { front, rear, back, trailer }: how far its front and its own back are from its
 * middle, how far back the rope goes on when pulling it backwards (the end of its trailer, if
 * it has one), and the trailer as { x, z, heading, length } from the hitch.
 */
function outline(car, body) {
  const f = facing(car.heading);
  const lines = [
    [car.x + f.x * body.front, car.z + f.z * body.front, car.x - f.x * body.rear, car.z - f.z * body.rear],
  ];
  const { trailer } = body;
  if (trailer) {
    const back = facing(trailer.heading);
    lines.push([trailer.x, trailer.z, trailer.x - back.x * trailer.length, trailer.z - back.z * trailer.length]);
  }
  return lines;
}

const clearOf = (lines, x, z, distance) =>
  lines.every(([ax, az, bx, bz]) => segmentDistance(x, z, ax, az, bx, bz).distance > distance);

/** Where the rope goes on the car: its front, or its back when it is pulled out backwards. */
function towPoint(tow, car, body) {
  const f = facing(car.heading);
  const end = tow.dir > 0 ? body.front : -body.back;
  return { x: car.x + f.x * end, z: car.z + f.z * end };
}

// --- The tow ------------------------------------------------------------------------------

/**
 * `hole` is { x, z, radius, bog }: the mud, and the soft middle that holds a car. `home` is
 * where the tractor is parked, { x, z, heading }. `clear(x, z)` says where it may drive.
 */
export function createTow({ hole, home, clear = () => true }) {
  return {
    hole,
    home,
    clear,
    /** 'free', 'bogging' (slowing in the mud), 'stuck', or 'towed' (on the rope; the controls do nothing). */
    phase: 'free',
    /** The way the car was going when it got stuck: 1 forwards, -1 backwards. */
    dir: 1,
    speed: 0,
    braking: 0,
    stuck: 0,
    armed: true,
    /** How much faster than the car its wheels are turning, as metres a second at the tyre. */
    slip: 0,
    dig: 0,
    /** How far the car has sunk into the mud. */
    sink: 0,
    last: null,
    tractor: {
      x: home.x,
      z: home.z,
      heading: home.heading,
      speed: 0,
      top: DRIVE,
      mode: 'home',
      route: null,
      s: 0,
      time: 0,
    },
    /** The rope, for drawing: `end` is on the car while `attached`, and `thrown` goes 0 to 1 as it is thrown. */
    rope: { shown: false, attached: false, thrown: 0, length: ROPE, hitch: { x: 0, z: 0 }, end: { x: 0, z: 0 } },
    /** What happened this step, for sounds: 'toot'. */
    events: [],
  };
}

/** True while the rope is on: the car goes where it is pulled and the controls do nothing. */
export const isTowed = tow => tow.phase === 'towed';

/** Where the tractor is while it is out to help, for the camera to keep in view. */
export const helping = tow => (['out', 'hitch', 'pull', 'unhitch'].includes(tow.tractor.mode) ? tow.tractor : null);

/** The tractor's hitch, behind its middle. */
function hitchOf(tractor) {
  const f = facing(tractor.heading);
  return { x: tractor.x - f.x * HITCH, z: tractor.z - f.z * HITCH };
}

function pose(tractor) {
  const f = facing(tractor.heading);
  return { x: tractor.x, z: tractor.z, dx: f.x, dz: f.z };
}

/** Plans the tractor's way round to stand in front of the stuck car, with the rope's length between them. */
function setOff(tow, car, body) {
  const { tractor, hole } = tow;
  const f = facing(car.heading);
  const d = { x: f.x * tow.dir, z: f.z * tow.dir };
  const reach = (tow.dir > 0 ? body.front : body.back) + ROPE * SLACK + HITCH;
  const goal = { x: car.x + d.x * reach, z: car.z + d.z * reach, dx: d.x, dz: d.z };
  // Beside the car, going its way, so the tractor can come up alongside it from behind.
  const n = normal(d.x, d.z);
  const via = [];
  for (const side of [1, -1]) {
    for (const out of [8, 12]) via.push({ x: car.x + n.x * side * out, z: car.z + n.z * side * out, dx: d.x, dz: d.z });
  }
  const lines = outline(car, body);
  const clear = (x, z) =>
    tow.clear(x, z) && clearOf(lines, x, z, CLEARANCE) && Math.hypot(x - hole.x, z - hole.z) > hole.radius + 0.5;
  Object.assign(tractor, { route: planRoute(pose(tractor), goal, clear, via), s: 0, mode: 'out', top: DRIVE });
  tow.events.push('toot');
}

/** Plans the tractor's way home, round the hole and clear of the car. */
function headHome(tow, car, body) {
  const { tractor, hole, home } = tow;
  const f = facing(home.heading);
  const goal = { x: home.x, z: home.z, dx: f.x, dz: f.z };
  const via = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const r = hole.radius + 7;
    for (const side of [1, -1]) {
      via.push({
        x: hole.x + Math.cos(a) * r,
        z: hole.z + Math.sin(a) * r,
        dx: -side * Math.sin(a),
        dz: side * Math.cos(a),
      });
    }
  }
  const lines = outline(car, body);
  const clear = (x, z) =>
    tow.clear(x, z) && clearOf(lines, x, z, CLEARANCE - 0.4) && Math.hypot(x - hole.x, z - hole.z) > hole.radius + 0.5;
  Object.assign(tractor, {
    route: planRoute(pose(tractor), goal, clear, via),
    s: 0,
    mode: 'back',
    top: HOMEWARD,
    time: 0,
  });
}

/** Drives the tractor on along its route, slowing to stop at the end. Returns true once there. */
function follow(tractor, dt, car) {
  const { route } = tractor;
  const left = route.length - tractor.s;
  // On the way home it waits for the car rather than drive into it.
  const f = facing(tractor.heading);
  const waiting = car && Math.hypot(car.x - tractor.x - f.x * 4, car.z - tractor.z - f.z * 4) < 3.6;
  const target = waiting ? 0 : Math.min(tractor.top, 0.4 + Math.sqrt(3 * left));
  tractor.speed = approach(tractor.speed, target, (target < tractor.speed ? 5 : 2) * dt);
  tractor.s = Math.min(route.length, tractor.s + tractor.speed * dt);
  const p = route.at(tractor.s);
  Object.assign(tractor, { x: p.x, z: p.z, heading: headingOf(p.dx, p.dz) });
  return tractor.s >= route.length;
}

/** Holds the car back in the mud: it slows to a stop going in, and can only creep back out. */
function holdInMud(tow, car, input, dt) {
  const f = facing(car.heading);
  const way = { x: f.x * tow.dir, z: f.z * tow.dir };
  // How far the driving moved the car on in this step. Sideways, the mud holds it.
  let on = (car.x - tow.last.x) * way.x + (car.z - tow.last.z) * way.z;
  if (tow.phase === 'bogging') {
    on = Math.min(on, tow.speed * dt);
    tow.speed = Math.max(0, tow.speed - tow.braking * dt);
    if (tow.speed === 0) Object.assign(tow, { phase: 'stuck', stuck: 0 });
  } else {
    on = clamp(on, -CRAWL * dt, 0);
    tow.stuck += dt;
  }
  car.x = tow.last.x + way.x * on;
  car.z = tow.last.z + way.z * on;
  car.vx = (way.x * on) / dt;
  car.vz = (way.z * on) / dt;
  car.speed = (tow.dir * on) / dt;
  // The wheels go on turning when the car can't, and dig in.
  const pushing = !input.brake && (tow.dir > 0 ? input.forward || (input.cruise && !input.backward) : input.backward);
  const wheels = pushing ? tow.dir * SPIN : car.speed * 2;
  tow.slip = damp(tow.slip, wheels - car.speed, 6, dt);
  if (pushing && tow.phase === 'stuck') tow.dig = Math.min(DIG, tow.dig + dt * 0.04);
}

/** The tractor pulls; the rope drags the car's end along behind it and the car follows its end. */
function pull(tow, car, body, dt) {
  const { tractor, hole } = tow;
  tractor.time += dt;
  tractor.speed = Math.min(PULL, tractor.speed + dt * 1.2);
  const f = facing(tractor.heading);
  tractor.x += f.x * tractor.speed * dt;
  tractor.z += f.z * tractor.speed * dt;
  const hitch = hitchOf(tractor);
  const end = towPoint(tow, car, body);
  const reach = tow.dir > 0 ? body.front : body.back;
  const gap = Math.hypot(hitch.x - end.x, hitch.z - end.z);
  const oldX = car.x;
  const oldZ = car.z;
  if (gap > ROPE) {
    // Taken up gently if the car crept back a little while the tractor was on its way.
    const k = Math.min(gap - ROPE, PULL * 1.5 * dt) / gap;
    const ex = end.x + (hitch.x - end.x) * k;
    const ez = end.z + (hitch.z - end.z) * k;
    const ux = ex - car.x;
    const uz = ez - car.z;
    const length = Math.hypot(ux, uz) || 1;
    car.x = ex - (ux / length) * reach;
    car.z = ez - (uz / length) * reach;
    car.heading = tow.dir > 0 ? headingOf(ux, uz) : headingOf(-ux, -uz);
  }
  car.vx = (car.x - oldX) / dt;
  car.vz = (car.z - oldZ) / dt;
  const forward = facing(car.heading);
  car.speed = car.vx * forward.x + car.vz * forward.z;
  car.steering = damp(car.steering ?? 0, 0, 3, dt);
  const out = Math.hypot(car.x - hole.x, car.z - hole.z) > hole.radius + FIRM;
  if (out || tractor.time > 20) {
    // On firm ground: the tractor stops and the rope comes off.
    Object.assign(car, { vx: 0, vz: 0, speed: 0 });
    Object.assign(tractor, { mode: 'unhitch', time: 0, speed: 0 });
    Object.assign(tow.rope, { attached: false, length: ROPE });
  }
}

/** True once the tractor is out of the way the car is facing, so it can drive off without running into it. */
function outOfTheWay(tractor, car) {
  const f = facing(car.heading);
  const ahead = (tractor.x - car.x) * f.x + (tractor.z - car.z) * f.z;
  const across = Math.abs((tractor.x - car.x) * f.z - (tractor.z - car.z) * f.x);
  return ahead < 0 || ahead > 16 || across > 3.6;
}

/** The car is free to drive away. The hole won't hold it again for a while. */
function letGo(tow) {
  Object.assign(tow, { phase: 'free', armed: false, slip: 0 });
  if (tow.rope.attached) Object.assign(tow.rope, { attached: false, length: ROPE });
}

/**
 * Moves the tow on by `dt` seconds, after the car has been driven for the step (or not, while
 * it is towed): holds the car in the mud, drives the tractor and pulls the car along. `car` is
 * the driving state, which it changes; `input` the controls; `body` the car's size (see outline).
 */
export function stepTow(tow, car, input, dt, body) {
  tow.events.length = 0;
  if (dt <= 0) return tow;
  const { hole, tractor, rope } = tow;
  // A jump (back to the start, or a night at camp) ends whatever was happening.
  if (tow.last && Math.hypot(car.x - tow.last.x, car.z - tow.last.z) > 4) {
    if (tow.phase === 'towed' && tractor.mode !== 'back') headHome(tow, car, body);
    letGo(tow);
    tow.dig = 0;
  }
  tow.last ??= { x: car.x, z: car.z };
  const distance = Math.hypot(car.x - hole.x, car.z - hole.z);

  if (tow.phase === 'free') {
    if (!tow.armed && (distance > hole.radius + 8 || tractor.mode === 'home')) tow.armed = true;
    if (tow.armed && distance < hole.bog && Math.abs(car.speed) > 0.5) {
      // It slows steadily to a stop a little past the middle, or sooner if it came in off to one side.
      const f = facing(car.heading);
      const dir = Math.sign(car.speed);
      const ahead = ((hole.x - car.x) * f.x + (hole.z - car.z) * f.z) * dir;
      const speed = Math.abs(car.speed);
      Object.assign(tow, { phase: 'bogging', dir, speed, braking: speed ** 2 / (2 * clamp(ahead + 0.6, 0.8, 4)) });
    }
  }
  if (tow.phase === 'bogging' || tow.phase === 'stuck') {
    holdInMud(tow, car, input, dt);
    // Out by itself, the way it came.
    if (Math.hypot(car.x - hole.x, car.z - hole.z) > hole.bog + 0.3) Object.assign(tow, { phase: 'free', slip: 0 });
  } else if (tow.phase !== 'towed') {
    tow.slip = damp(tow.slip, 0, 6, dt);
  }

  switch (tractor.mode) {
    case 'home':
    case 'back':
      if (tractor.mode === 'back') tractor.time += dt;
      // The car waits until the tractor has driven out of its way, or for a couple of seconds at most.
      if (tow.phase === 'towed' && (outOfTheWay(tractor, car) || tractor.time > 2)) letGo(tow);
      if (tow.phase === 'stuck' && tow.stuck >= WAIT) setOff(tow, car, body);
      else if (tractor.mode === 'back' && follow(tractor, dt, tow.phase === 'towed' ? null : car)) {
        Object.assign(tractor, { ...tow.home, mode: 'home', speed: 0, route: null });
      }
      break;
    case 'out':
      if (tow.phase === 'free') headHome(tow, car, body);
      else if (follow(tractor, dt, null)) {
        Object.assign(tractor, { mode: 'hitch', time: 0, speed: 0 });
        Object.assign(tow, { phase: 'towed', slip: 0 });
        Object.assign(rope, { shown: true, attached: true, thrown: 0 });
      }
      break;
    case 'hitch':
      tractor.time += dt;
      rope.thrown = Math.min(1, tractor.time / 0.6);
      if (tractor.time > 1) Object.assign(tractor, { mode: 'pull', time: 0 });
      break;
    case 'pull':
      pull(tow, car, body, dt);
      break;
    case 'unhitch':
      tractor.time += dt;
      if (tractor.time - dt < 0.3 && tractor.time >= 0.3) tow.events.push('toot');
      if (tractor.time > 0.8) headHome(tow, car, body);
      break;
  }

  // The rope runs from the hitch to the car. Once it is off, it is pulled in along the ground.
  rope.hitch = hitchOf(tractor);
  if (rope.attached) rope.end = towPoint(tow, car, body);
  else if (rope.shown) {
    rope.length = Math.max(0, rope.length - REEL * dt);
    const gap = Math.hypot(rope.end.x - rope.hitch.x, rope.end.z - rope.hitch.z);
    if (gap > rope.length) {
      const k = (gap - rope.length) / gap;
      rope.end = { x: rope.end.x + (rope.hitch.x - rope.end.x) * k, z: rope.end.z + (rope.hitch.z - rope.end.z) * k };
    }
    if (rope.length < 0.4) rope.shown = false;
  }

  if (tow.phase === 'towed' || tow.phase === 'free') tow.dig = Math.max(0, tow.dig - dt * 0.05);
  const centre = Math.hypot(car.x - hole.x, car.z - hole.z);
  tow.sink = DEPTH * (1 - smoothstep(centre, hole.bog * 0.4, hole.radius)) + tow.dig;
  tow.last = { x: car.x, z: car.z };
  return tow;
}
