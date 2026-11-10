// The car's body on its springs. The wheels follow the ground; the body rides on them and
// follows more slowly: it rises over a bump a moment after the wheels and settles with a bob or
// two, dips its nose as it brakes and rocks back once stopped, squats as it pulls away and
// leans out in a bend. Rocks under its middle lift it, as its underside rides up onto them.
// No Three.js here, so it can be tested on its own.
import { clamp } from './math.js';

/** How far the body can move from where the ground holds it before it is stopped: down, up, and turned. */
const TRAVEL = { down: 0.12, up: 0.18, pitch: 0.09, roll: 0.1 };
/** The fastest the ground can push the body along, in metres or radians a second, so that a sharp edge jolts rather than flings it. */
const JOLT = { rise: 2.5, turn: 1.5 };
/** Further than this in one step is a car put somewhere else, not one driving. */
const JUMP = 3;
/** Along the tyre, how far either side of where it touches the ground it is tried for rising ground, as a share of its radius. */
const TREAD = 0.6;

/**
 * Where a vehicle's wheels are, for its springs: `front` and `rear`, how far its first and last
 * axles are from its middle, `track`, how far apart its wheels are across, and the radius of its
 * front and back wheels, from its `wheels` ({ x, z, radius } each).
 */
export function springLayout(wheels) {
  const zs = wheels.map(wheel => wheel.z);
  const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length;
  return {
    front: -Math.min(...zs),
    rear: Math.max(...zs),
    track: 2 * Math.max(...wheels.map(wheel => Math.abs(wheel.x))),
    frontRadius: mean(wheels.filter(wheel => wheel.z < 0).map(wheel => wheel.radius ?? 0.5)),
    rearRadius: mean(wheels.filter(wheel => wheel.z >= 0).map(wheel => wheel.radius ?? 0.5)),
  };
}

export function createChassis() {
  return {
    // Where the body is: the height of the car's root, and how far it is pitched (nose up
    // positive) and rolled (right side up positive), and how fast each is changing.
    height: 0,
    pitch: 0,
    roll: 0,
    rising: 0,
    pitching: 0,
    rolling: 0,
    // Where the ground under the wheels would hold it, standing still.
    ground: { height: 0, pitch: 0, roll: 0 },
    // Where it was a step ago, to tell how fast the ground under it moves.
    last: null,
    at: { x: NaN, z: NaN },
  };
}

/** Where the ground holds the body, standing still: written here each step. */
const resting = { height: 0, pitch: 0, roll: 0 };

/**
 * How high a tyre of radius `radius` touching the ground `ahead` metres ahead of the car's middle
 * and `right` to its right rests, its lowest point: the highest the ground comes up to its
 * curve, just under it or a little ahead or behind, so it starts to climb a rock before it is
 * on top of it.
 */
function tyreRest(sample, x, z, sin, cos, ahead, right, radius) {
  let top = -Infinity;
  for (const k of [-TREAD, 0, TREAD]) {
    const d = k * radius;
    const along = ahead + d;
    const h = sample(x - sin * along + cos * right, z - cos * along - sin * right);
    top = Math.max(top, h - radius + Math.sqrt(radius * radius - d * d));
  }
  return top;
}

/**
 * Where the ground under the wheels holds a body at (x, z) facing `heading`: its height (the car
 * root's, a little under the tyres' contact), pitch and roll, and lifted where its underside,
 * `clearance` above the ground, would be in something between the axles.
 */
export function restingPose(x, z, heading, sample, layout, clearance) {
  const { front, rear, track, frontRadius, rearRadius } = layout;
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  const fl = tyreRest(sample, x, z, sin, cos, front, -track / 2, frontRadius);
  const fr = tyreRest(sample, x, z, sin, cos, front, track / 2, frontRadius);
  const bl = tyreRest(sample, x, z, sin, cos, -rear, -track / 2, rearRadius);
  const br = tyreRest(sample, x, z, sin, cos, -rear, track / 2, rearRadius);
  const span = front + rear;
  const slope = (fl + fr - bl - br) / 2 / span;
  const pitch = Math.atan(slope);
  const roll = Math.atan(((fr + br - fl - bl) / (2 * track)) * Math.cos(pitch));
  let height = (fl + fr + bl + br) / 4 - 0.06;
  // The underside, from a little behind the front axle to a little ahead of the back one: lifted
  // clear of any rock under it. Where the ground holds it, its middle is `height` and it slopes with it.
  const middle = (front - rear) / 2;
  for (const t of [0.2, 0.5, 0.8]) {
    const along = front - t * span;
    const under = sample(x - sin * along, z - cos * along);
    const floor = height + 0.06 + clearance + slope * (along - middle);
    if (under > floor) height += under - floor;
  }
  resting.height = height;
  resting.pitch = pitch;
  resting.roll = roll;
  return resting;
}

/**
 * Moves the body on its springs on by `dt` seconds, for the car `state` ({ x, z, heading, and
 * how fast it is speeding up, `ahead`, and thrown sideways, `aside`, in m/s²}) on the surface
 * `sample(x, z)`, sprung as `handling` says (see handling.js), its wheels laid out as `layout`
 * (see springLayout). Put somewhere new, it starts at rest there.
 */
export function stepChassis(chassis, state, handling, layout, dt, sample) {
  if (!(dt > 0)) return chassis;
  const ground = restingPose(state.x, state.z, state.heading, sample, layout, handling.clearance);
  const jumped = !chassis.last || Math.hypot(state.x - chassis.at.x, state.z - chassis.at.z) > JUMP;
  chassis.at.x = state.x;
  chassis.at.z = state.z;
  if (jumped) {
    settle(chassis, ground);
    return chassis;
  }
  const { last } = chassis;
  const rise = clamp((ground.height - last.height) / dt, -JOLT.rise, JOLT.rise);
  const pitchTurn = clamp((ground.pitch - last.pitch) / dt, -JOLT.turn, JOLT.turn);
  const rollTurn = clamp((ground.roll - last.roll) / dt, -JOLT.turn, JOLT.turn);
  Object.assign(last, ground);
  Object.assign(chassis.ground, ground);

  const w = 2 * Math.PI * handling.springs;
  const stiff = w * w;
  const damp = 2 * handling.damping * w;
  // Speeding up, the nose rises; braking, it dips; and in a bend the body leans out.
  const squat = clamp(handling.squat * (state.ahead ?? 0), -TRAVEL.pitch, TRAVEL.pitch);
  const lean = clamp(-handling.lean * (state.aside ?? 0), -TRAVEL.roll, TRAVEL.roll);
  // Each way the body moves, its spring pulls it towards where the ground and the load hold it
  // and its damper slows it relative to the ground: semi-implicit, so a step that is long for a
  // stiff spring doesn't make it ring.
  const spring = (x, v, rest, groundRate) => {
    const v1 = (v + dt * (-stiff * (x - rest) + damp * groundRate)) / (1 + dt * damp + dt * dt * stiff);
    return [x + v1 * dt, v1];
  };
  [chassis.height, chassis.rising] = spring(chassis.height, chassis.rising, ground.height, rise);
  [chassis.pitch, chassis.pitching] = spring(chassis.pitch, chassis.pitching, ground.pitch + squat, pitchTurn);
  [chassis.roll, chassis.rolling] = spring(chassis.roll, chassis.rolling, ground.roll + lean, rollTurn);

  // Pressed as far as the springs go, the body is stopped there and goes on with the ground.
  const stop = (value, rate, rest, down, up, groundRate) => {
    if (value < rest - down) return [rest - down, Math.max(rate, groundRate)];
    if (value > rest + up) return [rest + up, Math.min(rate, groundRate)];
    return [value, rate];
  };
  [chassis.height, chassis.rising] = stop(chassis.height, chassis.rising, ground.height, TRAVEL.down, TRAVEL.up, rise);
  [chassis.pitch, chassis.pitching] = stop(
    chassis.pitch,
    chassis.pitching,
    ground.pitch,
    TRAVEL.pitch,
    TRAVEL.pitch,
    pitchTurn,
  );
  [chassis.roll, chassis.rolling] = stop(
    chassis.roll,
    chassis.rolling,
    ground.roll,
    TRAVEL.roll,
    TRAVEL.roll,
    rollTurn,
  );
  return chassis;
}

/** Puts the body at rest where the ground holds it. */
export function settle(chassis, ground) {
  Object.assign(chassis, { height: ground.height, pitch: ground.pitch, roll: ground.roll });
  Object.assign(chassis, { rising: 0, pitching: 0, rolling: 0 });
  chassis.last = { ...ground };
  Object.assign(chassis.ground, ground);
  return chassis;
}

/** Forgets where the car was, so the next step starts it at rest wherever it is then. */
export function unsettle(chassis) {
  chassis.last = null;
  return chassis;
}
