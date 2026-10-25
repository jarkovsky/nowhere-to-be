// The car ferry at the head of the fjord. Pure logic, independent of rendering so it can be
// unit tested.
//
// The ferry has a ramp at each end and goes either way. It ties up end on at the quay, lowers
// the ramp at that end onto the quay's own ramp, and once the cars it brought have driven off,
// it waits. A car driven aboard that stops there is taken out for a short trip: the ramp goes
// up, the ferry sails out, turns round and comes back in the other end first, so the car faces
// the land and can drive straight off once the ramp at that end is down. While it is aboard the
// car goes where the ferry takes it and the controls do nothing, and one that stays aboard is
// taken round again. With nobody aboard or waiting at the quay, the ferry sets off along the
// fjord a while later, and comes back from the far end with more cars.
import { angleDelta, clamp } from './math.js';

/**
 * The hull, in its own frame (front to -Z): how far its ends and its sides are from its middle,
 * how far either side of the middle the car deck reaches between the casings along its sides,
 * and how high the deck is above the water.
 */
export const HULL = { halfLength: 15, halfBeam: 5, lanes: 3.4, deck: 0.9 };
/** How far a ramp reaches out from the end of the hull when it is down. */
export const RAMP = 2.6;
/** How far a ramp turns up from the deck when it is up, in radians. */
export const RAMP_UP = 1.3;
/** How long a ramp takes to go up or down, in seconds. */
const RAMP_TIME = 3;
/** How long the ferry waits at the quay with nobody aboard, and out of sight at the far end. */
const WAIT = 45;
const AWAY = 20;
/** How long a car stands still aboard before the ferry sets off with it; and one it has brought back, before it goes round again. */
const SETTLE = 1.5;
const AGAIN = 12;
/** Within this of the quay, a car keeps the ferry waiting and calls it back from the far end. */
const NEAR = 45;
/** How fast the ferry goes on its short trip and along the fjord, and how quickly it speeds up and slows down. */
const SPIN_SPEED = 5.5;
const VOYAGE_SPEED = 8;
const ACCEL = 0.6;
/** How far from its middle any part of the ferry reaches, ramps and all. */
const REACH = Math.hypot(HULL.halfLength + RAMP, HULL.halfBeam);

const headingOf = (dx, dz) => Math.atan2(-dx, -dz);
const approach = (value, target, step) => value + clamp(target - value, -step, step);
/** Which of the two ramps is at an end: the front one (-Z) or the back one. */
const rampAt = end => (end < 0 ? 0 : 1);

/**
 * `dock` is where the ferry ties up, { x, z, heading }, facing out over the water. `quay` is the
 * quay's ramp, { x, z, rotation, from, to, width, high }: in its own frame, turned by `rotation`
 * like a localFrame with +Z out over the water, it runs out from `from` to `to`, `width` wide, its
 * end `high` up, where the ferry's ramp rests on it. `spin` is the route of the short trip, out
 * from the dock and back to it, and `voyage` the route out along the fjord, each { length, at(s) }
 * giving { x, z, dx, dz }. `level` is the height of the water.
 */
export function createFerry({ dock, quay, spin, voyage, level }) {
  return {
    dock,
    quay,
    spin,
    voyage,
    level,
    /** 'docked', 'raising' (the ramp at the quay), 'sailing', 'lowering', or 'away' (out of sight at the far end). */
    phase: 'away',
    /** The trip it is on or has just made: 'spin', 'out' or 'in'. */
    trip: 'in',
    time: AWAY - 2,
    clock: 0,
    x: dock.x,
    z: dock.z,
    heading: dock.heading,
    y: level,
    roll: 0,
    pitch: 0,
    /** How far it leans out going round a bend. */
    lean: 0,
    /** How far along its route it is, and how fast it is going along it. */
    s: voyage.length,
    speed: 0,
    /** What is added to the route's heading on this trip: nothing, or a half turn to go the other end first. */
    turn: 0,
    /** How far up each ramp is, from 0 down to 1 up: the one at the front (-Z), and the one at the back. */
    ramps: [1, 1],
    shown: false,
    /** The car while the ferry has it: where the ferry put it, to tell if it has been moved somewhere else since. */
    carrying: null,
    /** How long the car has stood still aboard, and whether the ferry has just brought it back. */
    settled: 0,
    again: false,
    /** Where the ferry was before this step, for moving whatever is on its deck along with it. */
    last: { x: dock.x, z: dock.z, heading: dock.heading },
    /** What happened this step, for sounds and the cars aboard: 'toot', 'loading' (on its way back with more cars) or 'arrived'. */
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

/** Raises the ramp at the quay and sets off on `trip` once it is up. */
function setOff(ferry, trip) {
  Object.assign(ferry, { phase: 'raising', trip, time: 0, settled: 0 });
  ferry.events.push('toot');
}

/** Sets out along the trip's route, from wherever on it the ferry is, the other end first if it is facing the other way. */
function sail(ferry) {
  const route = ferry.trip === 'spin' ? ferry.spin : ferry.voyage;
  if (ferry.trip !== 'in') ferry.s = 0;
  const p = route.at(ferry.s);
  ferry.turn = Math.abs(angleDelta(headingOf(p.dx, p.dz), ferry.heading)) > Math.PI / 2 ? Math.PI : 0;
  Object.assign(ferry, { phase: 'sailing', time: 0, speed: 0 });
}

/** Moves the ferry on along its route, speeding up gently and slowing to a stop at the end. True once there. */
function steam(ferry, dt) {
  const route = ferry.trip === 'spin' ? ferry.spin : ferry.voyage;
  const goal = ferry.trip === 'in' ? 0 : route.length;
  const left = goal - ferry.s;
  const top = ferry.trip === 'spin' ? SPIN_SPEED : VOYAGE_SPEED;
  const wanted = Math.sign(left) * Math.min(top, Math.sqrt(2 * ACCEL * Math.abs(left)));
  ferry.speed = approach(ferry.speed, wanted, ACCEL * dt);
  ferry.s += ferry.speed * dt;
  const there = Math.abs(left) < 0.05 || Math.sign(goal - ferry.s) !== Math.sign(left);
  if (there) ferry.s = goal;
  const p = route.at(ferry.s);
  const heading = headingOf(p.dx, p.dz) + ferry.turn;
  // It leans out a little as it turns.
  const yawRate = dt > 0 ? angleDelta(ferry.heading, heading) / dt : 0;
  ferry.lean = clamp(yawRate * Math.abs(ferry.speed) * 0.012, -0.03, 0.03);
  Object.assign(ferry, { x: p.x, z: p.z, heading });
  return there;
}

/**
 * Moves the ferry on by `dt` seconds. `car` is the player's driving state, which it changes while
 * it carries the car, or null when nobody is driving; `corners` are the corners of the car's
 * outline (its trailer's too); `others` are the outlines of other vehicles that come aboard with
 * it, each { points, margin }, and `busy` says the cars the ferry brought are still getting off.
 */
export function stepFerry(ferry, dt, { car = null, corners = [], others = [], busy = false } = {}) {
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
  const near = car !== null && Math.hypot(car.x - ferry.quay.x, car.z - ferry.quay.z) < NEAR;
  // The others come along if they are all of them aboard, and are left behind if they are not on
  // it at all; it waits for any partly on it.
  const othersOn = others.some(({ points, margin }) => anyOn(ferry, points, margin));
  const othersHalfOn = others.some(
    ({ points, margin }) => anyOn(ferry, points, margin, false) && !allAboard(ferry, points, margin),
  );
  const end = quayEnd(ferry);
  const ramp = rampAt(end);

  switch (ferry.phase) {
    case 'docked': {
      ferry.settled = aboard && Math.abs(car.speed) < 0.3 ? ferry.settled + dt : 0;
      if (!aboard) ferry.again = false;
      if (!busy && !othersHalfOn && ferry.settled >= (ferry.again ? AGAIN : SETTLE)) {
        ferry.carrying = { x: car.x, z: car.z };
        setOff(ferry, 'spin');
      } else if (!busy && !boarding && !othersOn && !near && ferry.time > WAIT) {
        setOff(ferry, 'out');
      }
      break;
    }
    case 'raising':
      // Somebody came aboard after all: down it comes again.
      if (!ferry.carrying && (boarding || othersOn)) {
        Object.assign(ferry, { phase: 'lowering', time: 0 });
        break;
      }
      ferry.ramps[ramp] = Math.min(1, ferry.ramps[ramp] + dt / RAMP_TIME);
      if (ferry.ramps[ramp] >= 1) sail(ferry);
      break;
    case 'sailing':
      // Leaving along the fjord as a car comes down to the quay, it turns back for it.
      if (ferry.trip === 'out' && near && ferry.s > 0) ferry.trip = 'in';
      if (steam(ferry, dt)) {
        if (ferry.trip === 'out') Object.assign(ferry, { phase: 'away', time: 0, shown: false });
        else {
          Object.assign(ferry, { phase: 'lowering', time: 0 });
          ferry.events.push('toot');
        }
      }
      break;
    case 'lowering':
      ferry.ramps[ramp] = Math.max(0, ferry.ramps[ramp] - dt / RAMP_TIME);
      if (ferry.ramps[ramp] <= 0) {
        Object.assign(ferry, { phase: 'docked', time: 0, settled: 0 });
        // Brought back, the car is free to drive off; staying aboard, it goes round again.
        if (ferry.carrying) Object.assign(ferry, { carrying: null, again: true });
        if (ferry.trip === 'in') ferry.events.push('arrived');
      }
      break;
    case 'away':
      if (ferry.time > AWAY || (near && ferry.time > 3)) {
        Object.assign(ferry, { trip: 'in', s: ferry.voyage.length, shown: true });
        sail(ferry);
        ferry.events.push('loading');
      }
      break;
  }

  // Tied up, it lies along the quay's line, whichever end is at the quay.
  if (ferry.phase !== 'sailing') {
    ferry.x = ferry.dock.x;
    ferry.z = ferry.dock.z;
    ferry.heading = quayEnd(ferry) > 0 ? ferry.dock.heading : ferry.dock.heading + Math.PI;
    ferry.lean = 0;
  }
  // It rides the water: rising and falling a little, rocking from side to side and end to end.
  const t = ferry.clock;
  ferry.y = ferry.level + Math.sin(t * 0.8) * 0.04;
  ferry.roll = Math.sin(t * 0.6) * 0.008 + ferry.lean;
  ferry.pitch = Math.sin(t * 0.45 + 1) * 0.004;
  if (ferry.phase === 'sailing' && ferry.trip !== 'spin') {
    // Out of sight past the end of the fjord.
    ferry.shown = ferry.s < ferry.voyage.length * 0.97;
  }

  if (ferry.carrying) {
    carry(ferry, car);
    Object.assign(car, { vx: 0, vz: 0, speed: 0, steering: car.steering * 0.9 });
    Object.assign(ferry.carrying, { x: car.x, z: car.z });
  }
  return ferry;
}
