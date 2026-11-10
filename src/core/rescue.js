// A traveller stranded in a ditch beside a side track, and the car that pulls it out.
// Pure logic, independent of rendering so it can be unit tested.
//
// The traveller stands in the ditch with its tail towards the track. When the player's car
// comes past close to its tow eye, at the back, a rope hooks on by itself, whatever the car is
// doing. As the car drives on the rope tightens and the car slows to a crawl, as if pulling a
// load, and the traveller is dragged tail first up out of the ditch behind it. Once it is out
// the rope drops, it flashes its lights twice and toots, and drives off along the track to the
// nearest road. If the car backs or turns away the rope goes slack and nothing happens; after a
// while, or if the car goes far off, the rope comes off and the traveller settles back into the
// ditch to wait for next time.
import { angleDelta, clamp, damp, smoothstep } from './math.js';

/** How close the car's end of the rope comes to the tow eye for the rope to hook on, and the fastest the car can be going (a bit over the fastest cruise). */
export const HOOK_REACH = 7.5;
export const HOOK_SPEED = 12.5;
/** How long the rope is at least, and how far the car goes from the traveller before it can hook on again. */
export const ROPE = 7.5;
const REARM = 14;
/** How far from the middle of the track the traveller's middle is once it is out of the ditch. */
export const OUT = 3.6;
/** How long the rope can hang slack, be on altogether, or stretch from the car to the traveller's middle, before it comes off. */
const SLACK_TIME = 10;
const HOOKED_TIME = 60;
/** The most a car is held to a crawl for, in seconds of pulling, before the rope slips off. */
const PULLING_TIME = 14;
const FAR = 30;
/** The pause after it is out, in seconds: the rope drops, it flashes its lights twice and toots. */
const THANKS = 2;
const TOOT = 0.7;
/** How fast it drives off, and how fast it gathers speed and brakes. */
const LEAVE = 5;
const GATHER = 1.2;
const BRAKE = 4;
/** How far away it is let go from the world once it is leaving. */
const GONE = 220;
/** How far it goes out of the way of a vehicle coming the other way. */
const DODGE = 3.6;
/** How long the rope takes to fall, and lies on the ground before it is gone. */
const FALL = 0.6;
const LIE = 1.2;

const facing = heading => ({ x: -Math.sin(heading), z: -Math.cos(heading) });
const headingOf = (dx, dz) => Math.atan2(-dx, -dz);

/**
 * `spot` is where the traveller stands, { x, z, heading }, and `length` how long it is.
 * `lateral(x, z)` says how far a point is from the middle of the track, and `route()` gives
 * the way it drives off: a path with `length`, `at(d)` ({ x, z, dx, dz }) and `nearest(x, z)`.
 */
export function createRescue({ spot, length, lateral, route }) {
  return {
    spot,
    half: length / 2,
    lateral,
    makeRoute: route,
    /** 'stuck', 'hooked', 'out' (the thanks), 'leaving' or 'gone'. */
    phase: 'stuck',
    x: spot.x,
    z: spot.z,
    heading: spot.heading,
    /** How fast it moves the way it faces, negative while it is pulled out tail first. */
    speed: 0,
    armed: true,
    time: 0,
    held: 0,
    taut: 0,
    /** How fast the car was going as the rope came tight. */
    entry: 0,
    /** How long it has been pulled in all, however often the rope went slack. */
    pulled: 0,
    idle: 0,
    /** The speed the car is held to while the rope is tight, or null. */
    cap: null,
    /** Counts the time since it was pulled out. */
    wait: 0,
    /** The hazard lights: 1 while they flash, otherwise they blink slowly. */
    flashing: false,
    /** The rope, for drawing: `fall` goes 0 to 1 as it drops, and `lying` counts how long it has lain. */
    rope: {
      shown: false,
      attached: false,
      length: ROPE,
      hook: { x: 0, z: 0 },
      end: { x: 0, z: 0 },
      fall: 0,
      lying: 0,
    },
    route: null,
    d: 0,
    off: { x: 0, z: 0 },
    dodge: 0,
    /** What happened this step, for sounds: 'hook', 'out', 'toot'. */
    events: [],
  };
}

/** Where the rope goes on the traveller: the back of it. */
export function towEye(r) {
  const f = facing(r.heading);
  return { x: r.x - f.x * r.half, z: r.z - f.z * r.half };
}

/** How deep in the ditch it is, from 1 (all the way) to 0 (up on the track). */
export const ditchDepth = r => (r.phase === 'leaving' ? 0 : smoothstep(r.lateral(r.x, r.z), OUT, 6.6));

/** True while the traveller is in the ditch or being pulled out of it, for the map. */
export const waiting = r => r.phase === 'stuck' || r.phase === 'hooked';

/** The speed a car is held to while it pulls, m/s: a weaker one pulls more slowly. */
export const pullSpeed = handling => clamp(1 + (handling?.pull ?? 6) * 0.12, 1.4, 2.4);

/** Moves the traveller to a pose, working out how fast it moved the way it faces. */
function moveTo(r, x, z, heading, dt) {
  const f = facing(r.heading);
  r.speed = ((x - r.x) * f.x + (z - r.z) * f.z) / dt;
  Object.assign(r, { x, z, heading });
}

/** Drops the rope; it lies where it fell. */
function drop(r) {
  Object.assign(r.rope, { attached: false, fall: 0, lying: 0 });
}

function unhook(r) {
  drop(r);
  Object.assign(r, { phase: 'stuck', armed: false, cap: null });
}

/** The traveller settles back into the ditch where it was, if it has been drawn out of it. */
function settle(r, dt) {
  const { spot } = r;
  if (Math.hypot(spot.x - r.x, spot.z - r.z) < 0.01 && Math.abs(angleDelta(r.heading, spot.heading)) < 0.01) {
    r.speed = 0;
    return;
  }
  moveTo(
    r,
    damp(r.x, spot.x, 1.5, dt),
    damp(r.z, spot.z, 1.5, dt),
    r.heading + angleDelta(r.heading, spot.heading) * (1 - Math.exp(-1.5 * dt)),
    dt,
  );
}

/** The rope pulls the traveller's tow eye towards the car's hook, and the rest of it follows tail first. */
function pull(r, car, hook, dt, handling) {
  r.held += dt;
  const eye = towEye(r);
  const gap = Math.hypot(hook.x - eye.x, hook.z - eye.z);
  const { rope } = r;
  // A car that is suddenly far off (it has been put somewhere else) leaves the rope behind.
  if (gap > rope.length + 3 || Math.hypot(car.x - r.x, car.z - r.z) > FAR) {
    unhook(r);
    return;
  }
  if (gap > rope.length) {
    const k = (gap - rope.length) / gap;
    const x = eye.x + (hook.x - eye.x) * k;
    const z = eye.z + (hook.z - eye.z) * k;
    // The middle follows its eye at the same distance, so it comes round to lie behind it.
    const length = Math.hypot(r.x - x, r.z - z) || 1;
    moveTo(r, x + ((r.x - x) / length) * r.half, z + ((r.z - z) / length) * r.half, headingOf(r.x - x, r.z - z), dt);
    const crawl = pullSpeed(handling);
    if (r.taut === 0) r.entry = Math.max(Math.abs(car.speed), crawl);
    r.taut += dt;
    r.pulled += dt;
    r.idle = 0;
    // The car slows from what it was doing to the crawl it pulls at, within a second or so.
    r.cap = crawl + (r.entry - crawl) * Math.exp(-r.taut * 4);
  } else {
    r.speed = 0;
    r.taut = 0;
    r.idle += dt;
  }
  rope.hook = { x: hook.x, z: hook.z };
  rope.end = towEye(r);
  if (r.lateral(r.x, r.z) < OUT) {
    // Out on the track: the rope drops, and it has something to say about it.
    drop(r);
    Object.assign(r, { phase: 'out', wait: 0, cap: null, speed: 0 });
    r.events.push('out');
  } else if (r.idle > SLACK_TIME || r.held > HOOKED_TIME || r.pulled > PULLING_TIME) {
    unhook(r);
  }
}

/** The speed it keeps behind whatever is ahead of it on the way it is going. */
function yieldSpeed(r, ahead) {
  const f = facing(r.heading);
  let speed = LEAVE;
  for (const other of ahead) {
    const dx = other.x - r.x;
    const dz = other.z - r.z;
    const along = dx * f.x + dz * f.z;
    const aside = Math.abs(dx * f.z - dz * f.x);
    if (along > 0 && along < 26 && aside < 3.2) speed = Math.min(speed, Math.max(0, (along - r.half - 5) * 0.6));
  }
  return speed;
}

/**
 * How far to one side of its route it keeps, to pass the vehicles coming the other way along it
 * (the friends following the car) on the grass: positive to the right of the way it is going.
 */
function dodgeFor(r, others) {
  const f = facing(r.heading);
  for (const other of others) {
    const dx = other.x - r.x;
    const dz = other.z - r.z;
    const along = dx * f.x + dz * f.z;
    const aside = dx * -f.z + dz * f.x;
    if (along > -3 && along < 16 && Math.abs(aside) < 3.4) return aside > 0 ? -DODGE : DODGE;
  }
  return 0;
}

/** Drives it on along its route, slowing for the car and going round the others. */
function leave(r, car, dt, others) {
  if (!r.route) {
    r.route = r.makeRoute();
    r.d = r.route.nearest(r.x, r.z).s;
    const p = r.route.at(r.d);
    r.off = { x: r.x - p.x, z: r.z - p.z };
  }
  const target = yieldSpeed(r, [car]);
  r.speed += clamp(target - r.speed, -BRAKE * dt, GATHER * dt);
  r.d += r.speed * dt;
  const p = r.route.at(r.d);
  const decay = Math.exp(-1.2 * dt);
  r.off.x *= decay;
  r.off.z *= decay;
  r.dodge = damp(r.dodge, dodgeFor(r, others), 2.5, dt);
  const heading = headingOf(p.dx, p.dz);
  const turned = r.heading + angleDelta(r.heading, heading) * (1 - Math.exp(-2.5 * dt));
  Object.assign(r, {
    x: p.x + r.off.x - p.dz * r.dodge,
    z: p.z + r.off.z + p.dx * r.dodge,
    heading: turned,
  });
  if (r.d >= r.route.length - 0.5 || Math.hypot(car.x - r.x, car.z - r.z) > GONE) {
    Object.assign(r, { phase: 'gone', speed: 0 });
  }
}

/**
 * Moves the rescue on by `dt` seconds, after the car has been driven for the step. `car` is the
 * driving state ({ x, z, speed }) and `hook` where the rope goes on it. While `r.cap` is a
 * number the car is held to that speed. `others` are the friends following the car, which it goes round on its way.
 * `busy` keeps the rope off, while the car is being towed by something else.
 */
export function stepRescue(r, car, hook, dt, { handling, others = [], busy = false } = {}) {
  r.events.length = 0;
  r.cap = null;
  if (dt <= 0) return r;
  r.time += dt;
  const { rope } = r;
  switch (r.phase) {
    case 'stuck': {
      settle(r, dt);
      const eye = towEye(r);
      // The rope hooks on once its end on the car is close to the traveller's tow eye.
      const near = Math.hypot(hook.x - eye.x, hook.z - eye.z);
      if (!r.armed) {
        if (near > REARM) r.armed = true;
      } else if (!busy && near < HOOK_REACH && Math.abs(car.speed) <= HOOK_SPEED) {
        Object.assign(r, { phase: 'hooked', held: 0, taut: 0, idle: 0, pulled: 0 });
        Object.assign(rope, {
          shown: true,
          attached: true,
          fall: 0,
          lying: 0,
          hook: { x: hook.x, z: hook.z },
          end: eye,
          length: Math.max(ROPE, Math.hypot(hook.x - eye.x, hook.z - eye.z) + 0.4),
        });
        r.events.push('hook');
      }
      break;
    }
    case 'hooked':
      pull(r, car, hook, dt, handling);
      break;
    case 'out':
      r.wait += dt;
      r.speed = 0;
      r.flashing = r.wait < THANKS;
      if (r.wait - dt < TOOT && r.wait >= TOOT) r.events.push('toot');
      if (r.wait >= THANKS) Object.assign(r, { phase: 'leaving', flashing: false });
      break;
    case 'leaving':
      leave(r, car, dt, others);
      break;
    default:
  }
  // A rope that has come off falls to the ground and lies there until it is gone.
  if (!rope.attached && rope.shown) {
    rope.fall = Math.min(1, rope.fall + dt / FALL);
    if (rope.fall >= 1) rope.lying += dt;
    if (rope.lying > LIE) rope.shown = false;
  }
  return r;
}

/**
 * The spot for the next traveller to be stranded at: not the last one, and further than `far`
 * from the player and out of their sight, which is any spot behind them, or one over `distant`
 * metres away. `random` gives numbers from 0 to 1. Returns null if there is none.
 */
export function pickSpot(spots, player, { last = -1, random = Math.random, far = 150, distant = 380 } = {}) {
  const f = facing(player.heading);
  const choices = spots.filter(spot => {
    if (spot.index === last) return false;
    const dx = spot.x - player.x;
    const dz = spot.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance < far) return false;
    // Not within about 60 degrees of straight ahead.
    return distance > distant || (dx * f.x + dz * f.z) / distance < 0.5;
  });
  return choices.length ? choices[Math.floor(random() * choices.length)] : null;
}
