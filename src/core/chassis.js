// The car's body on its springs. The wheels follow the ground; the body rides on them and
// follows more slowly: it rises over a bump a moment after the wheels and settles with a bob or
// two, dips its nose as it brakes and rocks back once stopped, squats as it pulls away and
// leans out in a bend. Rocks under its middle lift it, as its underside rides up onto them.
//
// Each wheel's spring can only push the body up, never pull it down, so the body is never brought
// down faster than it falls. Where the ground drops away from under the wheels, over a crest
// taken fast or off the edge of a deck or a cliff, they hang as low as they go and the car is in
// the air: it falls as fast as anything falls, lands on its springs and settles. A car with its
// front wheels over an edge tips forward about the back ones before it goes.
// No Three.js here, so it can be tested on its own.
import { clamp, smoothstep } from './math.js';

export const GRAVITY = 9.81;
/** As far as speeding up, braking and a bend pitch and roll the body, in radians. */
const TRAVEL = { pitch: 0.09, roll: 0.1 };
/**
 * The fastest the ground under a wheel can rise or fall for the springs, in metres a second, over
 * how fast the slope the car is on takes it up or down anyway: a sharp edge jolts the body rather
 * than flinging it, and a steep hill taken fast is still followed all the way.
 */
const JOLT = 2.5;
/** Further than this in one step is a car put somewhere else, not one driving. */
const JUMP = 3;
/** Along the tyre, how far either side of where it touches the ground it is tried for rising ground, as a share of its radius. */
const TREAD = 0.6;
/** The car's root is this far under where its tyres touch the ground. */
const ROOT = 0.06;
/** Where along the body, from the front axle to the back one, its underside is tried for something under it. */
const UNDERSIDE = [0.2, 0.5, 0.8];
/** Where each wheel is, front left, front right, back left and back right: ahead (1) or behind, and to the right (1) or the left. */
const ENDS = [1, 1, -1, -1];
const SIDES = [-1, 1, -1, 1];
/**
 * A wheel hanging more than `from` of the way down holds the ground less and less, and at the
 * bottom of its travel not at all.
 */
const HANGING = { from: 0.5 };
/**
 * In the air the car turns its nose the way it is going, down as it falls, and levels its roll:
 * `rate` is how quickly, in times a second, and `steepest` how far down or up its nose goes, rise
 * over run. It always comes down on its wheels.
 */
const FLIGHT = { rate: 0.6, steepest: 0.6, slow: 3 };
/** The steepest the body is ever tipped, rise over run: near enough standing on end. */
const STEEPEST = 6;
/** Off the ground for less than this, in seconds, is a wheel skipping over a bump, not a landing. */
const HOP = 0.12;

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
    // The same pitch and roll as slopes, rise over run along the car and across it, which is
    // what the springs work in, and how fast they change.
    along: 0,
    across: 0,
    tipping: 0,
    tilting: 0,
    // Where the ground under the wheels would hold it, standing still.
    ground: { height: 0, pitch: 0, roll: 0 },
    // How firmly its front and back wheels are on the ground, from 0 (hanging in the air) to 1,
    // and whether its underside rests on something.
    front: 1,
    back: 1,
    beached: false,
    // How long all its wheels have been off the ground, in seconds, and how fast it came down
    // when they last met it again, in m/s.
    air: 0,
    landed: 0,
    // Where the ground held each wheel a step ago, to tell how fast it moves under them.
    last: null,
    at: { x: NaN, z: NaN },
  };
}

/** Where the ground holds the body, standing still: written here each step. */
const resting = { height: 0, pitch: 0, roll: 0 };
/** How high the ground holds the car's root at each wheel, and under its middle along its length. */
const rests = [0, 0, 0, 0];
const under = [0, 0, 0];

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
  rests[0] = fl - ROOT;
  rests[1] = fr - ROOT;
  rests[2] = bl - ROOT;
  rests[3] = br - ROOT;
  const span = front + rear;
  const slope = (fl + fr - bl - br) / 2 / span;
  const pitch = Math.atan(slope);
  const roll = Math.atan(((fr + br - fl - bl) / (2 * track)) * Math.cos(pitch));
  let height = (fl + fr + bl + br) / 4 - ROOT;
  // The underside, from a little behind the front axle to a little ahead of the back one: lifted
  // clear of any rock under it. Where the ground holds it, its middle is `height` and it slopes with it.
  const middle = (front - rear) / 2;
  UNDERSIDE.forEach((t, i) => {
    const along = front - t * span;
    under[i] = sample(x - sin * along, z - cos * along);
    const floor = height + ROOT + clearance + slope * (along - middle);
    if (under[i] > floor) height += under[i] - floor;
  });
  resting.height = height;
  resting.pitch = pitch;
  resting.roll = roll;
  return resting;
}

/** The body's speeds a step on, worked out here. */
const next = [0, 0, 0];

/**
 * Solves the three equations `m` (3 by 3, the same either side of its diagonal) times the
 * unknowns equals `b`, into `out`.
 */
function solve(m, b, out) {
  const [a, d, e, , f, g, , , h] = m;
  // The cofactors of a symmetric matrix [[a, d, e], [d, f, g], [e, g, h]].
  const ca = f * h - g * g;
  const cd = e * g - d * h;
  const ce = d * g - e * f;
  const det = a * ca + d * cd + e * ce;
  out[0] = (ca * b[0] + cd * b[1] + ce * b[2]) / det;
  out[1] = (cd * b[0] + (a * h - e * e) * b[1] + (d * e - a * g) * b[2]) / det;
  out[2] = (ce * b[0] + (d * e - a * g) * b[1] + (a * f - d * d) * b[2]) / det;
  return out;
}

const matrix = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const drive = [0, 0, 0];
const rates = [0, 0, 0, 0];
const squeezed = [0, 0, 0, 0];
const pushing = [false, false, false, false];
const stopped = [false, false, false, false];

/**
 * Moves the body on its springs on by `dt` seconds, for the car `state` ({ x, z, heading, its
 * speed over the ground `vx` and `vz`, and how fast it is speeding up, `ahead`, and thrown
 * sideways, `aside`, in m/s²}) on the surface `sample(x, z)`, sprung as `handling` says (see
 * handling.js), its wheels laid out as `layout` (see springLayout). Put somewhere new, it starts
 * at rest there.
 *
 * It tells the car what it finds, for the driving to go by (see driving.js): `frontContact` and
 * `backContact`, how firmly each pair of wheels is on the ground, from 0 to 1; `beached`, whether
 * its underside rests on something; `air`, how long it has been off the ground; and, while it is,
 * `vy`, how fast it is rising, and `y`, how high its wheels are.
 */
export function stepChassis(chassis, state, handling, layout, dt, sample) {
  if (!(dt > 0)) return chassis;
  const ground = restingPose(state.x, state.z, state.heading, sample, layout, handling.clearance);
  const movedX = state.x - chassis.at.x;
  const movedZ = state.z - chassis.at.z;
  const jumped = !chassis.last || Math.hypot(movedX, movedZ) > JUMP;
  chassis.at.x = state.x;
  chassis.at.z = state.z;
  if (jumped) {
    settle(chassis, ground);
    return report(chassis, state, sample);
  }
  Object.assign(chassis.ground, ground);

  const half = (layout.front + layout.rear) / 2;
  const side = layout.track / 2;
  const w = 2 * Math.PI * handling.springs;
  const stiff = w * w;
  const damp = 2 * handling.damping * w;
  const { up = 0.13, down = 0.24 } = handling.travel ?? {};

  // --- The springs --------------------------------------------------------------------
  // The body moves three ways, up and down, pitching and rolling, and each wheel's spring
  // pushes on all three. Its speeds at the end of the step are worked out together from the
  // forces there (as in driving.js), so a step that is long for a stiff spring doesn't make it
  // ring. With all four wheels on the ground this comes to a spring and a damper for each way
  // it moves, towards where the ground holds it; a wheel hanging in the air pushes on nothing.
  let { height, along, across, rising, tipping, tilting } = chassis;
  const give = (dt * damp + dt * dt * stiff) / 4;
  // How fast the slope under the four wheels takes the car up or down, going as it is.
  const sin = Math.sin(state.heading);
  const cos = Math.cos(state.heading);
  const sloping =
    (((rests[0] + rests[1] - rests[2] - rests[3]) / (4 * half)) * (-movedX * sin - movedZ * cos) +
      ((rests[1] + rests[3] - rests[0] - rests[2]) / (4 * side)) * (movedX * cos - movedZ * sin)) /
    dt;
  let pressed = 0;
  for (let i = 0; i < 4; i++) {
    const u = ENDS[i] * half;
    const v = SIDES[i] * side;
    rates[i] = sloping + clamp((rests[i] - chassis.last[i]) / dt - sloping, -JOLT, JOLT);
    chassis.last[i] = rests[i];
    squeezed[i] = rests[i] - (height + along * u + across * v);
    const closing = rates[i] - (rising + tipping * u + tilting * v);
    // What the spring carries: its share of the car's weight, standing still.
    pushing[i] = squeezed[i] >= -down && stiff * squeezed[i] + damp * closing + GRAVITY > 0;
    if (pushing[i]) pressed++;
  }
  const squat = clamp(handling.squat * (state.ahead ?? 0), -TRAVEL.pitch, TRAVEL.pitch);
  const lean = clamp(-handling.lean * (state.aside ?? 0), -TRAVEL.roll, TRAVEL.roll);
  // A spring that would be pulling by the end of the step has let go during it: it is left out
  // and the step worked out again, at most once for each wheel.
  for (let round = 0; round <= 4; round++) {
    matrix.fill(0);
    matrix[0] = 1;
    matrix[4] = half * half;
    matrix[8] = side * side;
    drive[0] = rising - dt * GRAVITY;
    drive[1] = half * half * tipping;
    drive[2] = side * side * tilting;
    for (let i = 0; i < 4; i++) {
      if (!pushing[i]) continue;
      const u = ENDS[i] * half;
      const v = SIDES[i] * side;
      const push = (dt * (stiff * squeezed[i] + damp * rates[i] + GRAVITY)) / 4;
      matrix[0] += give;
      matrix[1] += give * u;
      matrix[2] += give * v;
      matrix[4] += give * u * u;
      matrix[5] += give * u * v;
      matrix[8] += give * v * v;
      drive[0] += push;
      drive[1] += push * u;
      drive[2] += push * v;
    }
    // Speeding up, the nose rises; braking, it dips; and in a bend the body leans out: as far
    // as its wheels are on the ground to push it.
    const held = pressed / 4;
    drive[1] += dt * half * half * stiff * squat * held;
    drive[2] += dt * side * side * stiff * lean * held;
    if (pressed === 0 && !chassis.beached) {
      // In the air it turns its nose the way it is going and levels out.
      const forward = -(state.vx ?? 0) * Math.sin(state.heading) - (state.vz ?? 0) * Math.cos(state.heading);
      const going = clamp(
        (rising * forward) / (forward * forward + FLIGHT.slow ** 2),
        -FLIGHT.steepest,
        FLIGHT.steepest,
      );
      const turn = 2 * Math.PI * FLIGHT.rate;
      const ease = dt * 2 * turn + dt * dt * turn * turn;
      matrix[4] += half * half * ease;
      matrix[8] += side * side * ease;
      drive[1] += dt * half * half * turn * turn * (going - along);
      drive[2] += dt * side * side * turn * turn * -across;
    }
    matrix[3] = matrix[1];
    matrix[6] = matrix[2];
    matrix[7] = matrix[5];
    solve(matrix, drive, next);
    let letGo = false;
    for (let i = 0; i < 4; i++) {
      if (!pushing[i]) continue;
      const moving = next[0] + next[1] * ENDS[i] * half + next[2] * SIDES[i] * side;
      if (stiff * (squeezed[i] - dt * moving) + damp * (rates[i] - moving) + GRAVITY >= 0) continue;
      pushing[i] = false;
      pressed--;
      letGo = true;
    }
    if (!letGo) break;
  }
  [rising, tipping, tilting] = next;
  // How fast it was coming down before anything stopped it, for the car to land with.
  const falling = rising;
  height += rising * dt;
  along = clamp(along + tipping * dt, -STEEPEST, STEEPEST);
  across = clamp(across + tilting * dt, -STEEPEST, STEEPEST);

  // --- What stops it ------------------------------------------------------------------
  // A wheel pressed as far up into its arch as it goes carries the body up with it, and
  // something under the body taller than its underside is high lifts it. Each is put right by
  // moving the body the least that does it; lifting one corner tips the body about the others.
  stopped.fill(false);
  let beached = false;
  const middle = (layout.front - layout.rear) / 2;
  const span = layout.front + layout.rear;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < 4; i++) {
      const u = ENDS[i] * half;
      const v = SIDES[i] * side;
      const over = rests[i] - (height + along * u + across * v) - up;
      if (over <= 1e-6) continue;
      height += over / 3;
      along += (over / 3) * (ENDS[i] / half);
      across += (over / 3) * (SIDES[i] / side);
      stopped[i] = true;
      moved = true;
    }
    for (let i = 0; i < UNDERSIDE.length; i++) {
      const u = layout.front - UNDERSIDE[i] * span - middle;
      const over = under[i] - (height + ROOT + handling.clearance + along * u);
      if (over <= 1e-6) continue;
      const least = over / (1 + (u * u) / (half * half));
      height += least;
      along += (least * u) / (half * half);
      // It can't be going down into what it rests on.
      const sinking = -(rising + tipping * u);
      if (sinking > 0) {
        const stop = sinking / (1 + (u * u) / (half * half));
        rising += stop;
        tipping += (stop * u) / (half * half);
      }
      beached = true;
      moved = true;
    }
    if (!moved) break;
  }
  // A corner on its stop goes on up or down with the ground under it, no slower.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < 4; i++) {
      if (!stopped[i]) continue;
      const u = ENDS[i] * half;
      const v = SIDES[i] * side;
      const closing = rates[i] - (rising + tipping * u + tilting * v);
      if (closing <= 1e-6) continue;
      rising += closing / 3;
      tipping += (closing / 3) * (ENDS[i] / half);
      tilting += (closing / 3) * (SIDES[i] / side);
      changed = true;
    }
    if (!changed) break;
  }

  // --- How it stands ------------------------------------------------------------------
  // Each wheel holds the ground until it hangs well down, then less and less.
  const hold = i => {
    const hanging = height + along * ENDS[i] * half + across * SIDES[i] * side - rests[i];
    return 1 - smoothstep(hanging, down * HANGING.from, down);
  };
  // A pair of wheels holds it as well as the better of the two: with one in the air over a
  // hollow, the other carries the weight of both.
  const front = Math.max(hold(0), hold(1));
  const back = Math.max(hold(2), hold(3));
  const flying = front === 0 && back === 0 && !beached;
  chassis.landed = !flying && chassis.air > HOP ? Math.max(0, -falling) : 0;
  chassis.air = flying ? chassis.air + dt : 0;
  Object.assign(chassis, { height, along, across, rising, tipping, tilting, front, back, beached });
  chassis.pitch = Math.atan(along);
  chassis.roll = Math.atan(across * Math.cos(chassis.pitch));
  chassis.pitching = tipping / (1 + along * along);
  chassis.rolling = (tilting * Math.cos(chassis.pitch)) / (1 + (across * Math.cos(chassis.pitch)) ** 2);
  return report(chassis, state, sample, falling);
}

/**
 * Tells the car how it stands, for the driving to go by: how firmly its wheels are on the
 * ground, and, in the air, how fast it is rising or falling and how high its wheels are.
 */
function report(chassis, state, sample, falling = 0) {
  state.frontContact = chassis.front;
  state.backContact = chassis.back;
  state.beached = chassis.beached;
  state.air = chassis.air;
  if (chassis.air > 0 || chassis.landed > 0) state.vy = falling;
  // How high it is: on the ground, or over it. The driving surface asks, where there is one
  // level above another (see drivingHeight).
  state.y = Math.max(sample(state.x, state.z), chassis.air > 0 ? chassis.height + ROOT : -Infinity);
  return chassis;
}

/** Puts the body at rest where the ground holds it. */
export function settle(chassis, ground) {
  Object.assign(chassis, { height: ground.height, pitch: ground.pitch, roll: ground.roll });
  Object.assign(chassis, { rising: 0, pitching: 0, rolling: 0, tipping: 0, tilting: 0 });
  chassis.along = Math.tan(ground.pitch);
  chassis.across = Math.tan(ground.roll) / Math.cos(ground.pitch);
  Object.assign(chassis, { front: 1, back: 1, beached: false, air: 0, landed: 0 });
  chassis.last = [...rests];
  Object.assign(chassis.ground, ground);
  return chassis;
}

/** Forgets where the car was, so the next step starts it at rest wherever it is then. */
export function unsettle(chassis) {
  chassis.last = null;
  return chassis;
}

/**
 * How high the camera should take the car to be: the ground under it, so it doesn't bob with the
 * springs, or the car itself once it is up in the air over it.
 */
export function carriedHeight(chassis, handling) {
  return Math.max(chassis.ground.height, chassis.height - (handling.travel?.down ?? 0.24));
}
