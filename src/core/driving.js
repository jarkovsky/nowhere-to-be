// Off-road handling, independent of rendering so it can be unit tested. Each vehicle has an
// engine and gears, brakes and tyres of its own (see handling.js). The engine, the hills, the
// ground and the air speed it up or hold it back; its weight shifts between the axles as it
// speeds up and slows down; and its tyres grip sideways only as hard as the ground lets them,
// so it slides on loose ground, runs wide in a bend taken too fast, can swing its tail out, and
// goes on turning for a moment after the wheels straighten.
import { angleDelta, clamp, damp, lerp, smoothstep } from './math.js';
import { mayTouch, penetration } from './collision.js';
import { DEFAULT_HANDLING } from './handling.js';

export const CAR = {
  wheelbase: DEFAULT_HANDLING.wheelbase,
  topSpeed: DEFAULT_HANDLING.top,
  reverseSpeed: DEFAULT_HANDLING.reverse,
  /** The speed cruise control holds unless the input names another (`cruiseSpeed`), and the slowest it offers. */
  cruiseSpeed: 6,
  /** Two circles along the body approximate its footprint for collisions. */
  bodyOffset: 0.95,
  bodyRadius: 1.15,
};

/** The steps of the cruise speed in the menu, slowest first: today's, then one and a half times and twice that. */
export const CRUISE_SPEEDS = [CAR.cruiseSpeed, 9, 12];
export const CRUISE_SPEED_NAMES = ['slow', 'medium', 'fast'];

/**
 * How each surface changes the car's top speed, its grip and how much it holds it back as it
 * rolls (`rolling`, a share of its weight). Leaves and snow lie on the trail itself, so they only
 * make the car slide; rough ground, rock, mud and water slow it. Loose sand slows it a little
 * more than grass and lets it slide a little. The deep snow of the winter, drifted over
 * everything, grips like sand rather than like the icy snow high on the summit: it is all there
 * is to drive on there, and a small child steering by tilt has to be able to keep to the road.
 * Standing wheat or long meadow grass holds it back a little more than grass, but not below
 * cruising speed, and nor does shallow water, as at a ford.
 */
const SURFACE_HANDLING = {
  road: { speed: 1, grip: 1, rolling: 0.015 },
  track: { speed: 0.92, grip: 0.92, rolling: 0.03 },
  grass: { speed: 0.82, grip: 0.85, rolling: 0.05 },
  sand: { speed: 0.78, grip: 0.75, rolling: 0.1 },
  rock: { speed: 0.42, grip: 0.9, rolling: 0.06 },
  leaves: { speed: 1, grip: 0.6, rolling: 0.02 },
  snow: { speed: 1, grip: 0.38, rolling: 0.025 },
  drift: { speed: 0.92, grip: 0.75, rolling: 0.06 },
  mud: { speed: 0.7, grip: 0.7, rolling: 0.12 },
  water: { speed: 0.5, grip: 0.7, rolling: 0.06 },
  crop: { speed: 0.72, grip: 0.82, rolling: 0.06 },
};

/**
 * Water deeper than `from` metres holds the car back further: by `to` it can only crawl along
 * at `slowest` of the pace it could keep in shallow water, and it slows to that pace quickly.
 * It always keeps going, though, so a car never sticks in the middle of a ford.
 */
export const WADING = { from: 0.25, to: 0.55, slowest: 0.4 };

/**
 * A boulder under a wheel lifting it more than `from` metres slows the car, and by `to` it creeps
 * over at its own crawling pace, slowing to it quickly, and only picks up speed again `clear`
 * seconds after its wheels are off it.
 */
export const ROCKS = { from: 0.08, to: 0.25, clear: 0.8 };

const GRAVITY = 9.81;
/** The steepest a slope across the car pulls it sideways, rise over run. */
const SIDEHILL = 0.45;
/** How quickly the driver closes on the speed they want, each second, as a share of the difference. */
const EAGER = 3;
/** Cruise control slows the car this much, as a share of its speed, with the wheel turned as far as it goes. */
const CORNERING = 0.4;
/** Cruise control never speeds the car up or slows it harder than this, in m/s². */
const GENTLE = 3;
/**
 * Held flat out downhill, the car runs this much faster than its top speed before the brakes come
 * on to hold it, in m/s.
 */
const RUN_ON = 1.5;
/** Added to the speed when working out how far the tyres slide sideways, so that standing still isn't dividing by nothing. */
const CREEP = 0.3;
/** The engine's revs: ticking over, and the most it runs at. */
export const IDLE = 850;
export const REDLINE = 4000;
/** The revs it changes up at, going gently and flat out, and the revs it changes down at. */
const CHANGE_UP = [2300, 3600];
const CHANGE_DOWN = [1200, 2000];
/** While it changes up, the engine drives the car this hard. */
const CHANGING = 0.5;
/**
 * Crawling up a hill too steep for it, below `speed` m/s, a vehicle can always pull as hard as the
 * hill and the ground hold it back and `spare` m/s² more, up to `most`, steeper than any track.
 */
const CRAWLER = { speed: 1.2, spare: 0.5, most: 0.8 * GRAVITY };
/** Once it has changed up, it holds the gear this long, in seconds, so it doesn't change up and down by turns on a hill. */
const HOLD = 1.5;

/**
 * The car's footprint for bumping into things: circles of `radius` at `offsets`, how far each is
 * ahead of the car's middle, the farthest of them `reach` from it. The default is that of the
 * offroader the game starts with.
 */
export const DEFAULT_BODY = {
  radius: CAR.bodyRadius,
  offsets: [CAR.bodyOffset, -CAR.bodyOffset],
  reach: CAR.bodyOffset,
};

/**
 * No car is narrower than this to bump into, or wider than the car the gaps and gateways in the
 * valley were made for, whatever sticks out of its sides.
 */
const HALF_WIDTH = { least: 0.9, most: CAR.bodyRadius };

/**
 * The footprint of a vehicle reaching `front` metres ahead of its middle and `back` behind it,
 * `half` its width: a row of circles as wide as it is, from its nose to its tail, close enough
 * together that its sides are nearly straight between them.
 */
export function bodyOf({ front, back, half }) {
  const radius = clamp(half, HALF_WIDTH.least, HALF_WIDTH.most);
  const first = Math.max(front - radius, 0);
  const last = -Math.max(back - radius, 0);
  const count = Math.max(2, Math.ceil((first - last) / radius) + 1);
  const offsets = Array.from({ length: count }, (_, i) => first + ((last - first) * i) / (count - 1));
  return { radius, offsets, reach: Math.max(first, -last) };
}

/** How many times at most the car is pushed out of what it touches in a step. */
const PASSES = 4;

/** How far a push can move the car in one step before every moving collider is tried, in metres. */
const SHOVE = 2;
// The moving colliders near enough to the car to be bumped into this step.
const nearbyDynamic = [];

/** Front-wheel angle: plenty of lock when slow, gentle at speed. */
export function steerAngle(steering, speed, handling = DEFAULT_HANDLING) {
  const lock = handling.lock;
  return steering * lerp(lock, lock * 0.38, clamp(Math.abs(speed) / CAR.topSpeed, 0, 1));
}

/**
 * Back-wheel angle, for a vehicle whose back wheels steer too: the other way to the front ones
 * when slow, so it turns tighter, and straight at speed.
 */
export function rearSteerAngle(front, speed, handling = DEFAULT_HANDLING) {
  return -handling.rearSteer * front * (1 - smoothstep(Math.abs(speed), 4, 10));
}

export function createCarState(spawn) {
  return {
    x: spawn.x,
    z: spawn.z,
    heading: spawn.heading,
    vx: 0,
    vz: 0,
    speed: 0,
    steering: 0,
    distance: 0,
    impact: 0,
    // How high the ground under it is, where that matters (on and under the rock arch).
    y: -Infinity,
    ...still(),
  };
}

/** A car standing still: not turning, in first gear, the engine ticking over. */
function still() {
  return { yawRate: 0, ahead: 0, aside: 0, gear: 0, rpm: IDLE, throttle: 0, changing: 0, held: 0, rocky: 0 };
}

export function placeCar(state, place) {
  Object.assign(state, {
    x: place.x,
    z: place.z,
    heading: place.heading,
    vx: 0,
    vz: 0,
    speed: 0,
    steering: 0,
    y: -Infinity,
    ...still(),
  });
}

/** The ground under the wheels, worked out afresh each step. */
const under = { along: 0, across: 0, lift: 0 };

/** How far ahead of the leading wheels a boulder is felt, so the car slows as it reaches one, in metres. */
const FEEL = 0.6;

/**
 * How the ground under the car's wheels slopes, along it and across it (rise over run, up ahead
 * and up to the right positive), and how far a boulder lifts the highest of them, or is about to
 * lift the leading ones. The boulders are left out of the slope: a rock the car can climb slows it
 * to a crawl rather than being a hill to drive up. Without the heights of the ground, it slopes as
 * `world.slope` says and there are no boulders.
 */
function groundUnder(state, car, world) {
  if (!world.height) {
    under.along = world.slope(state.x, state.z, state.heading);
    under.across = 0;
    under.lift = 0;
    return under;
  }
  const sin = Math.sin(state.heading);
  const cos = Math.cos(state.heading);
  const side = car.track / 2;
  let lift = 0;
  const rock = (ahead, right) =>
    world.boulderLift?.(state.x - sin * ahead + cos * right, state.z - cos * ahead - sin * right) ?? 0;
  const at = (ahead, right) => {
    const x = state.x - sin * ahead + cos * right;
    const z = state.z - cos * ahead - sin * right;
    const rise = world.boulderLift?.(x, z) ?? 0;
    lift = Math.max(lift, rise);
    return world.height(x, z) - rise;
  };
  const fl = at(car.front, -side);
  const fr = at(car.front, side);
  const bl = at(-car.rear, -side);
  const br = at(-car.rear, side);
  const lead = state.speed < -0.1 ? -car.rear - FEEL : car.front + FEEL;
  lift = Math.max(lift, rock(lead, -side), rock(lead, side));
  // A rock between the wheels taller than its underside is high scrapes along under it, and it creeps.
  const middle = (car.front - car.rear) / 2;
  for (const along of [lead, car.front, middle, -car.rear]) {
    const scrape = rock(along, 0) - car.clearance;
    if (scrape > 0) lift = Math.max(lift, ROCKS.to + scrape);
  }
  under.along = (fl + fr - bl - br) / (2 * car.wheelbase);
  under.across = (fr + br - fl - bl) / (2 * car.track);
  under.lift = lift;
  return under;
}

/**
 * Moves through the gears for going at `forward` m/s with the throttle at `throttle`: up once the
 * revs are high and down once they are low, sooner when going gently, and never while a change
 * is under way. Labouring up a hill, flat out and not gaining speed, it holds its gear until the
 * engine can rev no higher. Below the top of first gear the clutch slips, and the engine idles,
 * or runs a little faster on the throttle.
 */
function changeGear(state, car, forward, throttle, dt) {
  const { gears } = car;
  const speed = Math.abs(forward);
  let gear = Math.min(state.gear, gears.length - 1);
  state.changing = Math.max(0, state.changing - dt);
  state.held = Math.max(0, state.held - dt);
  const revs = g => (speed / gears[g]) * REDLINE;
  if (forward < -0.1) gear = 0;
  else if (state.changing === 0) {
    const labouring = throttle > 0.9 && state.ahead < 0.5 && revs(gear) < REDLINE * 0.97;
    if (gear < gears.length - 1 && revs(gear) > lerp(CHANGE_UP[0], CHANGE_UP[1], throttle) && !labouring) {
      gear++;
      state.changing = car.shift;
      state.held = HOLD;
    } else if (gear > 0 && revs(gear) < lerp(CHANGE_DOWN[0], CHANGE_DOWN[1], throttle)) {
      // Just changed up, it keeps the gear for a moment unless the engine is all but stalling.
      if (state.held === 0 || revs(gear) < IDLE * 1.2) gear--;
    }
  }
  state.gear = gear;
  const slipping = IDLE + throttle * 900 * (1 - smoothstep(speed, 0, gears[0] * 0.6));
  state.rpm = Math.max(slipping, Math.min(revs(gear), REDLINE * 1.05));
}

/**
 * Sideways force from a tyre, per unit of the car's weight, at the stiffness `stiffness` (per
 * radian it slides) and the slip `slip` (radians), as the stiffness that gives it at that slip:
 * firm for a little slip, easing off to no more than `most` however far it slides.
 */
function softened(stiffness, slip, most) {
  const amount = Math.abs(slip);
  if (amount < 1e-6 || most <= 0) return most <= 0 ? 0 : stiffness;
  return (most * Math.tanh((stiffness * amount) / most)) / amount;
}

/**
 * Advances the car by `dt` seconds.
 * input: { forward, backward, left, right, brake, cruise, steer (analog -1..1) }, and optionally
 *        cruiseSpeed (m/s, for cruise to hold; CAR.cruiseSpeed when left out)
 * world: { obstacles (index), dynamic (circles), surface(x, z), slope(x, z, heading), isDriveable(x, z),
 *          waterDepth(x, z) (optional), height(x, z) (optional: the surface the tyres rest on, used
 *          for the slope under the wheels in place of `slope`), boulderLift(x, z) (optional: how
 *          far boulders lift the surface there) }
 * The car drives as its `handling` says (see handling.js), the off-roader if it has none.
 */
export function stepDriving(state, input, dt, world) {
  // No time, no movement: and it would divide by zero below.
  if (!(dt > 0)) return state;
  dt = Math.min(dt, 0.05);
  // A state made by hand, not by createCarState, starts standing still.
  if (state.gear === undefined) Object.assign(state, still());
  const car = state.handling ?? DEFAULT_HANDLING;
  const ground = SURFACE_HANDLING[world.surface(state.x, state.z)] ?? SURFACE_HANDLING.grass;
  const sin = Math.sin(state.heading);
  const cos = Math.cos(state.heading);
  // Forward is -Z when heading is 0; right is perpendicular to it.
  let forward = -state.vx * sin - state.vz * cos;
  let lateral = state.vx * cos - state.vz * sin;
  const startedAt = forward;

  // --- The ground under it ----------------------------------------------------------
  const { along, across, lift } = groundUnder(state, car, world);
  const uphill = along / Math.hypot(1, along);
  // Positive where the ground falls away to the right, so the car's weight pulls it that way: on
  // a bank no steeper than SIDEHILL, it drifts down it and has to be steered back up, but it never
  // slides off the edge of a track cut into a hillside.
  const banked = clamp(across, -SIDEHILL, SIDEHILL);
  const downRight = -banked / Math.hypot(1, banked);
  // How much of its weight presses the tyres into the ground.
  const pressing = 1 / (Math.hypot(1, along) * Math.hypot(1, across));
  const grip = ground.grip * car.grip;
  const wading = smoothstep(world.waterDepth?.(state.x, state.z) ?? 0, WADING.from, WADING.to);
  const deep = lerp(1, WADING.slowest, wading);
  const top = car.top * ground.speed * deep;
  const reverse = car.reverse * deep;
  // Over a rock it creeps, and goes on creeping until it is clear of it.
  state.rocky = Math.max(smoothstep(lift, ROCKS.from, ROCKS.to), state.rocky - dt / ROCKS.clear);
  const crawling = state.rocky;
  const crawl = lerp(Math.max(top, Math.abs(forward)), car.crawl, crawling);

  // --- What the driver wants ---------------------------------------------------------
  let target = null;
  let cruising = false;
  let braking = false;
  if (input.brake) braking = true;
  else if (input.forward || (input.cruise && !input.backward)) {
    if (forward < -0.3) braking = true;
    else {
      cruising = !input.forward;
      // On cruise it eases off round a tight bend, as a driver would.
      const bend = cruising ? 1 - CORNERING * smoothstep(Math.abs(state.steering), 0.4, 1) : 1;
      target = Math.min(input.forward ? top : Math.min(input.cruiseSpeed ?? CAR.cruiseSpeed, top) * bend, crawl);
    }
  } else if (input.backward) {
    if (forward > 0.3) braking = true;
    else target = -Math.min(reverse, crawl);
  }
  const pedals = input.forward || input.backward || input.cruise;

  // --- The engine, the brakes and what holds the car back -----------------------------
  const moving = Math.sign(forward);
  // Along the car: the hill and, below, the engine, which holds it back with the throttle shut;
  // and against its motion, the ground, the air, deep water and rocks, and the brakes.
  const hill = -GRAVITY * uphill;
  const rolling = GRAVITY * pressing * ground.rolling;
  const air = car.drag * forward * forward;
  const holdBack = (limit, rate) => rate * Math.max(0, Math.abs(forward) - limit);
  const water = holdBack(forward >= 0 ? top : reverse, 6 * wading);
  const rocks = holdBack(crawl, 3 * crawling);
  const resisting = rolling * clamp(Math.abs(forward) / 0.5, 0, 1) + air + water + rocks;
  // The weight on each axle, for each unit of the car's, shifted back as it speeds up or climbs
  // and forward as it slows or goes downhill.
  const shifted = ((state.ahead + GRAVITY * uphill) * car.height) / car.wheelbase;
  const balance = car.balance ?? car.rear / car.wheelbase;
  const onFront = Math.max(0.15 * GRAVITY, GRAVITY * pressing * balance - shifted);
  const onBack = Math.max(0.15 * GRAVITY, GRAVITY * pressing * (1 - balance) + shifted);
  // As hard as the engine can drive it: in a low gear by its pull, faster by its power, and no
  // harder than the driven wheels grip. Driving all four, it can use the grip of all four.
  const driven = car.drive >= 1 ? onFront : car.drive <= 0 ? onBack : onFront + onBack;
  const traction = car.traction * grip * driven;
  // At a crawl, though, every vehicle can creep up any hill in the valley, however heavy or
  // low-slung it is: a small child must never be left stuck at the foot of one.
  const creep = Math.min(CRAWLER.most, Math.max(0, rolling - hill * Math.sign(target ?? 1)) + CRAWLER.spare);
  const crawler = creep * (1 - smoothstep(Math.abs(forward), CRAWLER.speed, CRAWLER.speed + 1));
  const pull =
    Math.max(Math.min(car.pull, car.power / Math.max(Math.abs(forward), 0.5), traction), crawler) *
    (state.changing > 0 ? CHANGING : 1);
  const brakes = Math.min(car.brakes, grip * GRAVITY * pressing);
  const engineBrake =
    car.engineBrake * (state.rpm / REDLINE) * smoothstep(Math.abs(forward), 0.3, 2) * (forward < 0 ? 0.5 : 1);

  // The engine pushes the way it is driven, from holding the car back with the throttle shut to
  // its full pull with it open.
  let throttle = 0;
  let brake = braking ? 1 : 0;
  let engine = -moving * engineBrake;
  if (target !== null) {
    let want = EAGER * (target - forward);
    if (cruising) want = clamp(want, -GENTLE, GENTLE);
    // The engine's part: what is wanted, less what the hill and the drag do anyway.
    const need = want - hill + moving * resisting;
    const way = Math.sign(target) || 1;
    const shut = moving === way ? engineBrake : 0;
    throttle = clamp((need * way + shut) / (pull + shut), 0, 1);
    engine = way * (throttle * (pull + shut) - shut);
    // With the throttle shut, on the brakes too if the engine alone doesn't hold it back enough:
    // always on cruise, and with the pedal held only once well over its top speed.
    const short = -(need * way + shut);
    const over = Math.abs(forward) > Math.abs(target) + RUN_ON;
    if (throttle === 0 && short > 0 && moving === way && (cruising || over)) brake = Math.min(1, short / brakes);
  }
  const driving = Math.max(0, engine * (Math.sign(target ?? 0) || 1));
  const stopping = resisting + brake * brakes;

  // --- Steering and the tyres --------------------------------------------------------
  // Arrow keys and touch override tilt while held.
  const analog = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0;
  const steerTarget = input.left || input.right ? Number(Boolean(input.left)) - Number(Boolean(input.right)) : analog;
  state.steering = damp(state.steering, steerTarget, input.left || input.right ? 7 : 12, dt);
  const wheels = steerAngle(state.steering, forward, car);
  const rearWheels = rearSteerAngle(wheels, forward, car);
  const a = car.front;
  const b = car.rear;
  const turning = a * b * car.gyration;
  // Each axle's tyres grip sideways with what is left once driving and braking have used their
  // share. The brakes are shared between the axles as the weight is, so neither locks first.
  const braked = (brake * brakes) / (onFront + onBack);
  // Driving takes no more than most of it: crawling up a steep hill, they still hold the car up a bank.
  const sideways = (load, used) => grip * load * Math.sqrt(1 - Math.min(used / (grip * load), 0.75) ** 2);
  // The front tyres give out a little before the back ones, so pushed too hard the car runs wide.
  const frontGrip = car.understeer * sideways(onFront, Math.abs(driving) * car.drive + braked * onFront);
  const backGrip = sideways(onBack, Math.abs(driving) * (1 - car.drive) + braked * onBack);
  const frontStiffness = car.cornering * car.understeer * onFront;
  const backStiffness = car.cornering * onBack;
  // The sideways speed and the rate of turn at the end of the step are worked out together from
  // the forces they lead to there, which stays steady however slowly the car goes. A tyre that
  // slides further than it can grip gives no more, so that is tried again a couple of times.
  const pace = Math.abs(forward) + CREEP;
  let front = frontStiffness;
  let back = backStiffness;
  let side = lateral;
  let yaw = state.yawRate;
  for (let pass = 0; pass < 3; pass++) {
    const kf = front / pace;
    const kb = back / pace;
    const m11 = 1 + dt * (kf + kb);
    const m12 = -dt * (kf * a - kb * b + forward);
    const m21 = (-dt * (a * kf - b * kb)) / turning;
    const m22 = 1 + (dt * (a * a * kf + b * b * kb)) / turning;
    const r1 = lateral - dt * forward * (kf * wheels + kb * rearWheels) + dt * GRAVITY * downRight;
    const r2 = state.yawRate + (dt * forward * (a * kf * wheels - b * kb * rearWheels)) / turning;
    const det = m11 * m22 - m12 * m21;
    side = (r1 * m22 - m12 * r2) / det;
    yaw = (m11 * r2 - m21 * r1) / det;
    front = softened(frontStiffness, (side - a * yaw + forward * wheels) / pace, frontGrip);
    back = softened(backStiffness, (side + b * yaw + forward * rearWheels) / pace, backGrip);
  }
  // The front tyres, turned, also drag the car back a little as they push it round.
  const frontPush = (-front * (side - a * yaw + forward * wheels)) / pace;
  // Stability control: the car is turned no faster or slower than the wheels ask for, as far as
  // its grip lets it, give or take a little, and kept from sliding sideways more than a little,
  // so it can swing its tail out but never spins.
  const settle = 1 - Math.exp(-20 * car.stability * dt);
  const fastest = (grip * GRAVITY * pressing) / Math.max(Math.abs(forward), 2);
  const asked = clamp((forward * (Math.tan(wheels) - Math.tan(rearWheels))) / car.wheelbase, -fastest, fastest);
  const astray = Math.abs(yaw - asked) - (0.05 + car.slide * 0.4 + 0.1 * Math.abs(asked));
  if (astray > 0) yaw -= Math.sign(yaw - asked) * astray * settle;
  const sliding = Math.abs(side) - (car.slide * Math.abs(forward) + 0.5);
  if (sliding > 0) side -= Math.sign(side) * sliding * settle;
  lateral = side;
  state.yawRate = yaw;

  // --- Speeding up and slowing down ---------------------------------------------------
  let next = forward + (engine + hill + frontPush * Math.sin(wheels) - lateral * yaw) * dt;
  // What holds the car back slows it to a stop, never back the other way.
  next = Math.sign(next) * Math.max(0, Math.abs(next) - stopping * dt);
  // A hill too steep to drive up holds it where it is rather than letting it roll back.
  const pulling = Math.sign(target ?? 0);
  if (pulling && throttle > 0 && Math.sign(next) === -pulling && Math.abs(forward) < 0.3) next = 0;
  // Parked, with the pedals up, it stays where it is, on a hill too.
  if ((!pedals || braking) && Math.abs(next) < 0.15 && Math.abs(forward) < 0.3) {
    next = 0;
    if (!pedals || Math.abs(lateral) < 0.3) {
      lateral = 0;
      state.yawRate = 0;
    }
  }
  forward = next;
  changeGear(state, car, forward, throttle, dt);
  state.throttle = throttle;
  state.heading += state.yawRate * dt;
  // How fast it speeds up along itself and is thrown sideways, smoothed a little, for the springs.
  state.ahead = damp(state.ahead, (forward - startedAt) / dt, 20, dt);
  state.aside = damp(state.aside, forward * state.yawRate, 20, dt);
  const nsin = Math.sin(state.heading);
  const ncos = Math.cos(state.heading);
  state.vx = -nsin * forward + ncos * lateral;
  state.vz = -ncos * forward - nsin * lateral;

  // --- Movement and collisions -----------------------------------------------------
  const oldX = state.x;
  const oldZ = state.z;
  let x = state.x + state.vx * dt;
  let z = state.z + state.vz * dt;
  state.impact = 0;

  // Of the moving colliders, only those within reach of the car's circles can be bumped into,
  // unless pushes move the car further than SHOVE, when they are all tried.
  const fromX = x;
  const fromZ = z;
  const { radius, offsets, reach: farthest } = state.body ?? DEFAULT_BODY;
  const dynamic = world.dynamic ?? [];
  nearbyDynamic.length = 0;
  for (const obstacle of dynamic) {
    if (mayTouch(obstacle, x, z, farthest + radius + SHOVE)) nearbyDynamic.push(obstacle);
  }
  let cx = 0;
  let cz = 0;
  let offset = 0;
  let turningAlong = true;
  let pushed = false;
  /**
   * Pushes the circle at (cx, cz), `offset` ahead of the car's middle, out of the obstacle, taking
   * away the speed it hit it with. Hit off its middle, the car is turned a little, and while
   * `turningAlong`, it is turned along what it only glanced off. A rock it can climb is driven over.
   */
  const resolve = obstacle => {
    if (obstacle.climb !== undefined && obstacle.climb <= car.climb) return;
    const hit = penetration(cx, cz, radius, obstacle);
    if (!hit) return;
    pushed = true;
    // The circle goes with the car, so the next obstacle is tried where it is now.
    x += hit.nx * hit.depth;
    z += hit.nz * hit.depth;
    cx += hit.nx * hit.depth;
    cz += hit.nz * hit.depth;
    const into = state.vx * hit.nx + state.vz * hit.nz;
    if (into < 0) {
      state.impact = Math.max(state.impact, -into);
      const speed = Math.hypot(state.vx, state.vz);
      const glancing = speed > 0.5 && -into / speed < 0.7;
      // Cancel the velocity into the obstacle. Glancing contact slides
      // along it and turns the car parallel; head-on contact stops it.
      state.vx -= hit.nx * into * 1.1;
      state.vz -= hit.nz * into * 1.1;
      const tangent = Math.hypot(state.vx, state.vz);
      const keep = tangent > 1e-6 ? Math.max(0, tangent + (glancing ? 0.05 : 0.6) * into) / tangent : 0;
      state.vx *= keep;
      state.vz *= keep;
      // A knock to one end pushes that end aside: the push across the car, times how far along it lands.
      const across = -into * (hit.nx * Math.cos(state.heading) - hit.nz * Math.sin(state.heading));
      state.yawRate = clamp(state.yawRate - (0.5 * offset * across) / turning, -1, 1);
      if (glancing && turningAlong) {
        const along = Math.atan2(-state.vx * Math.sign(forward || 1), -state.vz * Math.sign(forward || 1));
        state.heading += angleDelta(state.heading, along) * 0.2;
      }
    }
  };
  // The first pass may turn the car along what it glanced off; the next ones only push it out, from
  // where its circles are once turned, so it never ends a step turned into a wall. Caught between
  // two things, pushing one end out can push the other back in, so it goes on until nothing
  // pushes, a few passes at most.
  for (let pass = 0; pass < PASSES && (pass === 0 || pushed); pass++) {
    turningAlong = pass === 0;
    pushed = false;
    for (const along of offsets) {
      offset = along;
      cx = x - Math.sin(state.heading) * along;
      cz = z - Math.cos(state.heading) * along;
      const moving = Math.hypot(x - fromX, z - fromZ) > SHOVE ? dynamic : nearbyDynamic;
      for (const obstacle of world.obstacles.near(cx, cz, radius + 2, state.y)) resolve(obstacle);
      for (const obstacle of moving) resolve(obstacle);
    }
  }

  // Deep water and the valley fence stop the car's leading end; it slides
  // along them instead of sticking.
  const lead = (forward >= 0 ? offsets[0] : -offsets[offsets.length - 1]) + radius - 0.4;
  const reach = Math.sign(forward || 1) * lead;
  const clear = (px, pz) => world.isDriveable(px - nsin * reach, pz - ncos * reach);
  if (!clear(x, z)) {
    if (clear(x, oldZ)) {
      z = oldZ;
      state.vz *= -0.1;
    } else if (clear(oldX, z)) {
      x = oldX;
      state.vx *= -0.1;
    } else {
      x = oldX;
      z = oldZ;
      state.vx *= -0.1;
      state.vz *= -0.1;
    }
    state.impact = Math.max(state.impact, 1);
  }

  state.x = x;
  state.z = z;
  // Plus nothing, so a car at a standstill has a speed of 0, not -0.
  state.speed = -state.vx * nsin - state.vz * ncos + 0;
  state.distance += Math.hypot(x - oldX, z - oldZ);
  return state;
}
