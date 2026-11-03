// The car ferry on the fjord. Pure logic, independent of rendering so it can be unit tested.
//
// The ferry sails between two quays: one at the head of the fjord, at the end of the road down
// to it, and one on the Lofoten coast at its far end. It has a ramp at each end, so a car drives
// on at one end and straight off at the other; one that stays aboard to go back again would face
// the wrong way, so then the ferry turns round in the middle of the fjord. Tied up, it lowers the ramp at
// the quay onto the quay's own ramp, and once the cars it brought have driven off, it waits.
// A car driven aboard that stops there is taken across, once any friends coming along with it
// are aboard too: the ramp goes up, the ferry sails down the fjord and lowers its other ramp at
// the far quay. While it is aboard the car goes where the ferry takes it and the controls do
// nothing, and one that stays aboard is taken back again. With nobody about, the ferry waits on
// the car's side of the water, and now and then sails across and back again, empty one way and
// with cars from the far side the other.
import { angleDelta, clamp, smoothstep } from './math.js';

/**
 * The hull, in its own frame (front to -Z): how far its ends and its sides are from its middle,
 * how far either side of the middle the car deck reaches between the casings along its sides,
 * and how high the deck is above the water.
 */
export const HULL = { halfLength: 22, halfBeam: 6.6, lanes: 5, deck: 0.9 };
/** The middles of the three lanes across the car deck. */
export const LANES = [(-HULL.lanes * 2) / 3, 0, (HULL.lanes * 2) / 3];
/** How far a ramp reaches out from the end of the hull when it is down. */
export const RAMP = 2.6;
/** How far a ramp turns up from the deck when it is up, in radians. */
export const RAMP_UP = 1.3;
/** How long a ramp takes to go up or down, in seconds. */
const RAMP_TIME = 3;
/**
 * How long the ferry waits at the head of the fjord with nobody about before it sails across
 * empty, and at the far quay before it comes back with cars, while the car is in the valley.
 */
const WAIT = 45;
const AWAY = 20;
/** How long it waits before sailing across to fetch a car waiting on the other side. */
const CALLED = 3;
/** How long a car stands still aboard before the ferry sets off with it; and one it has brought across, before it takes it back. */
const SETTLE = 1.5;
const AGAIN = 12;
/** The longest it waits, once the car stands aboard, for the friends coming along to come aboard too. */
const PATIENCE = 45;
/** Within this of a quay, a car keeps the ferry waiting there, or calls it across. */
const NEAR = 45;
/** How fast the ferry sails, and how quickly it speeds up and slows down. */
const SPEED = 9;
const ACCEL = 0.6;
/** How far from its middle any part of the ferry reaches, ramps and all. */
const REACH = Math.hypot(HULL.halfLength + RAMP, HULL.halfBeam);

const headingOf = (dx, dz) => Math.atan2(-dx, -dz);
const approach = (value, target, step) => value + clamp(target - value, -step, step);
/** Which of the two ramps is at an end: the front one (-Z) or the back one. */
const rampAt = end => (end < 0 ? 0 : 1);

/**
 * `docks` are the two places the ferry ties up, each { dock, quay }: `dock` where its middle lies,
 * { x, z, heading }, facing out over the water, and `quay` the quay's ramp, { x, z, rotation,
 * from, to, width, high }: in its own frame, turned by `rotation` like a localFrame with +Z out
 * over the water, it runs out from `from` to `to`, `width` wide, its end `high` up, where the
 * ferry's ramp rests on it. `route` is the way between them, { length, at(s) } giving
 * { x, z, dx, dz }, from the first dock at 0 to the second at its end. `level` is the height
 * of the water.
 */
export function createFerry({ docks, route, level }) {
  // It starts at the far quay, its front to it.
  const heading = docks[1].dock.heading + Math.PI;
  return {
    docks,
    route,
    level,
    /** 'docked', 'raising' (the ramp at the quay), 'sailing' or 'lowering'. */
    phase: 'docked',
    /** The dock it is at, or has just left, and the one it is sailing to. */
    at: 1,
    to: 1,
    /** The dock and the quay it is at, or has just left. */
    dock: docks[1].dock,
    quay: docks[1].quay,
    time: AWAY - 2,
    clock: 0,
    x: docks[1].dock.x,
    z: docks[1].dock.z,
    heading,
    y: level,
    roll: 0,
    pitch: 0,
    /** How far it leans out going round a bend. */
    lean: 0,
    /** How far along its route it is, and how fast it is going along it. */
    s: route.length,
    speed: 0,
    /**
     * How far round it is turned from facing along its route (0, or a half turn), at the start of
     * the crossing and by the end of it, and where along the route the crossing started.
     */
    turn: { from: 0, to: 0, start: route.length },
    /** How far up each ramp is, from 0 down to 1 up: the one at the front (-Z), and the one at the back. */
    ramps: [0, 1],
    shown: true,
    /** The car while the ferry has it: where the ferry put it, to tell if it has been moved somewhere else since. */
    carrying: null,
    /** How long the car has stood still aboard, and whether the ferry has just brought it across. */
    settled: 0,
    again: false,
    /** Where the ferry was before this step, for moving whatever is on its deck along with it. */
    last: { x: docks[1].dock.x, z: docks[1].dock.z, heading },
    /**
     * What happened this step, for sounds and the cars aboard: 'toot', 'loading' (setting off
     * from the far side with cars for the head of the fjord) or 'arrived' (at the head of the fjord).
     */
    events: [],
  };
}

/** A point in the ferry's own frame, from the world. */
export function toLocal(pose, x, z) {
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  const dx = x - pose.x;
  const dz = z - pose.z;
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

/** A point in the world, from the ferry's own frame. */
export function toWorld(pose, lx, lz) {
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  return { x: pose.x + lx * cos + lz * sin, z: pose.z - lx * sin + lz * cos };
}

/** Which end of the hull is at the quay: 1 for the back, -1 for the front. */
export const quayEnd = ferry => (Math.cos(ferry.heading - ferry.dock.heading) > 0 ? 1 : -1);

/**
 * Which end of the hull is, or will be, at the quay at the head of the fjord (the first dock): 1
 * for the back, -1 for the front, from which way round it lies along its route.
 */
export function headEnd(ferry) {
  const p = ferry.route.at(ferry.s);
  return Math.cos(ferry.heading - headingOf(p.dx, p.dz)) > 0 ? 1 : -1;
}

/** True while the ferry has the car: it goes where it is taken and the controls do nothing. */
export const isCarrying = ferry => ferry.carrying !== null;

/** Whether a point is on the car deck of the ferry at `pose`, `margin` in from its ends and the casings. */
export function onCarDeck(pose, x, z, margin = 0) {
  const p = toLocal(pose, x, z);
  return Math.abs(p.x) <= HULL.lanes - margin && Math.abs(p.z) <= HULL.halfLength - margin;
}

/** Whether every point ({ x, z }) is on the car deck, `margin` in from its ends and the casings. */
export function allAboard(ferry, points, margin = 0) {
  return ferry.shown && points.every(({ x, z }) => onCarDeck(ferry, x, z, margin));
}

/** Whether a point is on the quay's ramp, `margin` round it. */
function onQuay(quay, x, z, margin) {
  const cos = Math.cos(quay.rotation);
  const sin = Math.sin(quay.rotation);
  const dx = x - quay.x;
  const dz = z - quay.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= quay.width / 2 + margin && lz >= quay.from - margin && lz <= quay.to + margin;
}

/**
 * Whether any of the points is on the ferry or a ramp of it that is down, within `margin`, or
 * (unless `quay` is false) on the quay's ramp.
 */
export function anyOn(ferry, points, margin = 0, quay = true) {
  return points.some(({ x, z }) => {
    if (quay && onQuay(ferry.quay, x, z, margin)) return true;
    if (!ferry.shown) return false;
    const p = toLocal(ferry, x, z);
    const out = Math.abs(p.z) - HULL.halfLength;
    if (Math.abs(p.x) > HULL.halfBeam + margin || out > RAMP + margin) return false;
    return out <= margin || ferry.ramps[rampAt(p.z)] < 1;
  });
}

/**
 * How high the ferry's deck is at (x, z), on the hull or on a ramp that is down, or null off it.
 * A ramp that is down slopes from the deck to where it rests on the quay's ramp.
 */
export function deckHeight(ferry, x, z) {
  if (!ferry.shown) return null;
  const dx = x - ferry.x;
  const dz = z - ferry.z;
  if (dx * dx + dz * dz > REACH * REACH) return null;
  const { x: lx, z: lz } = toLocal(ferry, x, z);
  if (Math.abs(lx) > HULL.halfBeam) return null;
  const out = Math.abs(lz) - HULL.halfLength;
  const end = clamp(lz, -HULL.halfLength, HULL.halfLength);
  const deck = ferry.y + HULL.deck + lx * Math.sin(ferry.roll) - end * Math.sin(ferry.pitch);
  if (out <= 0) return deck;
  if (out > RAMP || Math.abs(lx) > HULL.lanes || ferry.ramps[rampAt(lz)] > 0.02) return null;
  return deck + (ferry.quay.high - deck) * (out / RAMP);
}

/**
 * The walls of the ferry that the car bumps into, as boxes: the casings along its sides, and
 * each ramp while it is up enough to close its end.
 */
export function walls(ferry) {
  if (!ferry.shown) return [];
  const box = (lx, lz, halfX, halfZ) => ({
    ...toWorld(ferry, lx, lz),
    halfX,
    halfZ,
    rotation: ferry.heading,
    radius: 0,
  });
  const side = (HULL.halfBeam + HULL.lanes) / 2;
  const half = (HULL.halfBeam - HULL.lanes) / 2;
  const list = [box(-side, 0, half, HULL.halfLength), box(side, 0, half, HULL.halfLength)];
  for (const end of [-1, 1]) {
    if (ferry.ramps[rampAt(end)] > 0.3) list.push(box(0, end * (HULL.halfLength - 0.15), HULL.lanes, 0.15));
  }
  return list;
}

/**
 * Moves `thing` ({ x, z }, and its `heading` if it has one) the way the ferry moved this step,
 * as something standing on its deck.
 */
export function carry(ferry, thing) {
  const p = toLocal(ferry.last, thing.x, thing.z);
  const q = toWorld(ferry, p.x, p.z);
  thing.x = q.x;
  thing.z = q.z;
  if (thing.heading !== undefined) thing.heading += angleDelta(ferry.last.heading, ferry.heading);
  return thing;
}

/** Raises the ramp at the quay and sets off for the dock `to` once it is up. */
function setOff(ferry, to) {
  Object.assign(ferry, { phase: 'raising', to, time: 0, settled: 0 });
  ferry.events.push('toot');
}

/** Moves the ferry on along its route towards the dock it is sailing to, speeding up gently and slowing to a stop there. True once there. */
function steam(ferry, dt) {
  const { route } = ferry;
  const goal = ferry.to === 1 ? route.length : 0;
  const left = goal - ferry.s;
  const wanted = Math.sign(left) * Math.min(SPEED, Math.sqrt(2 * ACCEL * Math.abs(left)));
  ferry.speed = approach(ferry.speed, wanted, ACCEL * dt);
  ferry.s = clamp(ferry.s + ferry.speed * dt, 0, route.length);
  const there = Math.abs(goal - ferry.s) < 0.05 || Math.sign(goal - ferry.s) !== Math.sign(left);
  if (there) ferry.s = goal;
  const p = route.at(ferry.s);
  // It turns round, if it is to, slowly, out in the middle of the fjord.
  const { turn } = ferry;
  const done = Math.abs(ferry.s - turn.start) / Math.max(1, Math.abs(goal - turn.start));
  const heading = headingOf(p.dx, p.dz) + turn.from + (turn.to - turn.from) * smoothstep(done, 0.3, 0.62);
  // It leans out a little as it turns.
  const yawRate = dt > 0 ? angleDelta(ferry.heading, heading) / dt : 0;
  ferry.lean = clamp(yawRate * Math.abs(ferry.speed) * 0.012, -0.03, 0.03);
  Object.assign(ferry, { x: p.x, z: p.z, heading });
  return there;
}

/** Ties up at the dock it was sailing to. */
function arrive(ferry) {
  const { dock, quay } = ferry.docks[ferry.to];
  Object.assign(ferry, { phase: 'lowering', time: 0, at: ferry.to, dock, quay, speed: 0 });
  ferry.events.push('toot');
}

/**
 * Moves the ferry on by `dt` seconds. `car` is the player's driving state, which it changes while
 * it carries the car, or null when nobody is driving; `corners` are the corners of the car's
 * outline (its trailer's too); `others` are the outlines of other vehicles that come aboard with
 * it, each { points, margin }, `ready` says they are all aboard, or have no room or are nowhere
 * near, and `busy` says the cars the ferry brought are still getting off.
 */
export function stepFerry(ferry, dt, { car = null, corners = [], others = [], ready = true, busy = false } = {}) {
  ferry.events.length = 0;
  if (dt <= 0) return ferry;
  ferry.clock += dt;
  ferry.time += dt;
  Object.assign(ferry.last, { x: ferry.x, z: ferry.z, heading: ferry.heading });
  // A car put somewhere else (back to the start, say) has left the ferry.
  if (ferry.carrying && (!car || Math.hypot(car.x - ferry.carrying.x, car.z - ferry.carrying.z) > 4)) {
    ferry.carrying = null;
  }
  const aboard = car !== null && allAboard(ferry, corners);
  const boarding = car !== null && anyOn(ferry, corners);
  const from = (k, x, z) => Math.hypot(x - ferry.docks[k].quay.x, z - ferry.docks[k].quay.z);
  const near = k => car !== null && from(k, car.x, car.z) < NEAR;
  // The side of the water the car is on: the quay nearer to it.
  const side = car === null ? 0 : from(0, car.x, car.z) <= from(1, car.x, car.z) ? 0 : 1;
  // The others come along if they are all of them aboard, and are left behind if they are not on
  // it at all; it waits for any partly on it.
  const othersOn = others.some(({ points, margin }) => anyOn(ferry, points, margin));
  const othersHalfOn = others.some(
    ({ points, margin }) => anyOn(ferry, points, margin, false) && !allAboard(ferry, points, margin),
  );
  const end = quayEnd(ferry);
  const ramp = rampAt(end);
  const here = ferry.at;
  const there = 1 - here;

  switch (ferry.phase) {
    case 'docked': {
      ferry.settled = aboard && Math.abs(car.speed) < 0.3 ? ferry.settled + dt : 0;
      if (!aboard) ferry.again = false;
      const waited = ferry.settled >= (ferry.again ? AGAIN : SETTLE);
      // The friends coming along are aboard too, or it has waited long enough for them.
      const all = ready || ferry.settled >= SETTLE + PATIENCE;
      if (!busy && !othersHalfOn && waited && all) {
        ferry.carrying = { x: car.x, z: car.z };
        setOff(ferry, there);
      } else if (!busy && !boarding && !othersOn && !near(here)) {
        // Nobody here: across to the car if it is on the other side, or now and then anyway
        // from the head of the fjord while the car is in the valley.
        const wait = side === there ? (near(there) || here === 0 ? CALLED : AWAY) : here === 0 ? WAIT : Infinity;
        if (ferry.time > wait) {
          setOff(ferry, there);
          if (here === 1 && !near(1)) ferry.events.push('loading');
        }
      }
      break;
    }
    case 'raising':
      // Somebody came aboard after all: down it comes again.
      if (!ferry.carrying && (boarding || othersOn)) {
        Object.assign(ferry, { phase: 'lowering', time: 0, to: here });
        break;
      }
      ferry.ramps[ramp] = Math.min(1, ferry.ramps[ramp] + dt / RAMP_TIME);
      if (ferry.ramps[ramp] >= 1) {
        Object.assign(ferry, { phase: 'sailing', time: 0, speed: 0 });
        // A car aboard facing away from the way it is going would face the wrong way at the other
        // side, so the ferry turns round on the way.
        const p = ferry.route.at(ferry.s);
        const along = headingOf(p.dx, p.dz);
        const from = Math.cos(ferry.heading - along) > 0 ? 0 : Math.PI;
        const going = along + (ferry.to === 1 ? 0 : Math.PI);
        const wrong = ferry.carrying !== null && car !== null && Math.cos(car.heading - going) < 0;
        ferry.turn = { from, to: from + (wrong ? Math.PI : 0), start: ferry.s };
      }
      break;
    case 'sailing':
      // Sailing off empty as the car comes down to the quay it left, it turns back for it.
      if (!ferry.carrying && ferry.to !== side && near(side)) ferry.to = side;
      if (steam(ferry, dt)) arrive(ferry);
      break;
    case 'lowering':
      ferry.ramps[ramp] = Math.max(0, ferry.ramps[ramp] - dt / RAMP_TIME);
      if (ferry.ramps[ramp] <= 0) {
        Object.assign(ferry, { phase: 'docked', time: 0, settled: 0 });
        // Brought across, the car is free to drive off; staying aboard, it is taken back again.
        if (ferry.carrying) Object.assign(ferry, { carrying: null, again: true });
        if (here === 0) ferry.events.push('arrived');
      }
      break;
  }

  // Tied up, it lies along the quay's line, whichever end is at the quay.
  if (ferry.phase !== 'sailing') {
    ferry.x = ferry.dock.x;
    ferry.z = ferry.dock.z;
    ferry.heading = quayEnd(ferry) > 0 ? ferry.dock.heading : ferry.dock.heading + Math.PI;
    ferry.s = ferry.at === 1 ? ferry.route.length : 0;
    ferry.lean = 0;
  }
  // It rides the water: rising and falling a little, rocking from side to side and end to end.
  const t = ferry.clock;
  ferry.y = ferry.level + Math.sin(t * 0.8) * 0.04;
  ferry.roll = Math.sin(t * 0.6) * 0.008 + ferry.lean;
  ferry.pitch = Math.sin(t * 0.45 + 1) * 0.004;

  if (ferry.carrying) {
    carry(ferry, car);
    Object.assign(car, { vx: 0, vz: 0, speed: 0, steering: car.steering * 0.9 });
    Object.assign(ferry.carrying, { x: car.x, z: car.z });
  }
  return ferry;
}

// --- Finding room on the deck ----------------------------------------------------------------

/** The gaps a vehicle parking on the deck keeps: to the one in front, either side, from the closed end and from the open one. */
const PARK = { ahead: 1.2, side: 0.35, bow: 0.8, stern: 0.4 };

/**
 * Where a point is on the deck of the ferry at `pose`, seen from its `end` at the quay (1 the
 * back, -1 the front): how far across it from the middle, and how far in from that end, below 0
 * out on the ramp and the quay.
 */
export function deckPoint(pose, end, x, z) {
  const p = toLocal(pose, x, z);
  return { across: p.x, depth: HULL.halfLength - end * p.z };
}

/** The point in the world `across` and `depth` in on the deck of the ferry at `pose`, from its `end` at the quay. */
export function fromDeck(pose, end, across, depth) {
  return toWorld(pose, across, end * (HULL.halfLength - depth));
}

/** Which way something faces that drives in along the deck from its `end` at the quay. */
export const inward = (pose, end) => pose.heading + (end > 0 ? 0 : Math.PI);

/** The span on the deck that the points ({ x, z }) of something take up: { across, half, near, far }. */
export function deckSpan(pose, end, points, margin = 0) {
  let [a0, a1, d0, d1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const { x, z } of points) {
    const { across, depth } = deckPoint(pose, end, x, z);
    [a0, a1, d0, d1] = [Math.min(a0, across), Math.max(a1, across), Math.min(d0, depth), Math.max(d1, depth)];
  }
  return { across: (a0 + a1) / 2, half: (a1 - a0) / 2 + margin, near: d0 - margin, far: d1 + margin };
}

/**
 * Where on the deck a vehicle coming aboard over the end at the quay should park, `half` wide
 * either side of its middle and `length` long from its nose to its tail (its trailer's): in the
 * lane with the most clear deck in front of it, as far in as that goes, so the long lanes are
 * kept for whoever comes after. `taken` are the spans already on the deck or kept for someone,
 * each { across, half, near, far }. `lanes` are where across the deck it may go, and `tail` how
 * far in its tail is already. Returns { across, nose }, how far in its nose goes, or null with no
 * room for it.
 */
export function berthFor(taken, { half, length }, lanes = LANES, tail = -Infinity) {
  let best = null;
  for (const across of lanes) {
    if (Math.abs(across) + half > HULL.lanes - 0.1) continue;
    let nose = 2 * HULL.halfLength - PARK.bow;
    for (const span of taken) {
      // What is behind it already, nearer the quay than its tail, isn't in its way.
      if (span.far < tail + 0.5) continue;
      if (Math.abs(span.across - across) < span.half + half + PARK.side) nose = Math.min(nose, span.near - PARK.ahead);
    }
    if (nose - length < PARK.stern) continue;
    if (!best || nose > best.nose) best = { across, nose };
  }
  return best;
}
