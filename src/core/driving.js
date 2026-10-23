// Arcade off-road handling, independent of rendering so it can be unit tested.
// The car has a velocity vector rather than just a speed, so it can slide a
// little on loose surfaces, and its tyres pull it back into line.
import { angleDelta, clamp, damp, lerp } from './math.js';
import { penetration } from './collision.js';

export const CAR = {
  wheelbase: 2.44,
  topSpeed: 14,
  reverseSpeed: 5,
  cruiseSpeed: 7,
  acceleration: 5.5,
  braking: 13,
  /** Two circles along the body approximate its footprint for collisions. */
  bodyOffset: 0.95,
  bodyRadius: 1.15,
};

/**
 * How each surface changes top speed and grip. Leaves and snow lie on the
 * trail itself, so they only make the car slide; rough ground, rock, mud and water slow it.
 */
const SURFACE_HANDLING = {
  road: { speed: 1, grip: 1 },
  track: { speed: 0.92, grip: 0.92 },
  grass: { speed: 0.82, grip: 0.85 },
  rock: { speed: 0.42, grip: 0.9 },
  leaves: { speed: 1, grip: 0.6 },
  snow: { speed: 1, grip: 0.38 },
  mud: { speed: 0.7, grip: 0.7 },
  water: { speed: 0.42, grip: 0.7 },
};

/** Front-wheel angle: plenty of lock when slow, gentle at speed. */
export function steerAngle(steering, speed) {
  return steering * lerp(0.58, 0.22, clamp(Math.abs(speed) / CAR.topSpeed, 0, 1));
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
  };
}

export function placeCar(state, place) {
  Object.assign(state, { x: place.x, z: place.z, heading: place.heading, vx: 0, vz: 0, speed: 0, steering: 0 });
}

/**
 * Advances the car by `dt` seconds.
 * input: { forward, backward, left, right, brake, cruise, steer (analog -1..1) }
 * world: { obstacles (index), dynamic (circles), surface(x, z), slope(x, z, heading), isDriveable(x, z) }
 */
export function stepDriving(state, input, dt, world) {
  dt = clamp(dt, 0, 0.05);
  const handling = SURFACE_HANDLING[world.surface(state.x, state.z)] ?? SURFACE_HANDLING.grass;
  const sin = Math.sin(state.heading);
  const cos = Math.cos(state.heading);
  // Forward is -Z when heading is 0; right is perpendicular to it.
  let forward = -state.vx * sin - state.vz * cos;
  let lateral = state.vx * cos - state.vz * sin;

  // --- Throttle and brakes -------------------------------------------------------
  const top = CAR.topSpeed * handling.speed;
  let accel = 0;
  if (input.brake) {
    accel = -Math.sign(forward) * Math.min(CAR.braking, Math.abs(forward) / dt);
  } else if (input.forward || (input.cruise && !input.backward)) {
    const target = input.forward ? top : Math.min(CAR.cruiseSpeed, top);
    accel = forward < -0.3 ? CAR.braking : CAR.acceleration * clamp((target - forward) / 3, -1, 1);
  } else if (input.backward) {
    accel = forward > 0.3 ? -CAR.braking : -CAR.acceleration * clamp((CAR.reverseSpeed + forward) / 2, -1, 1);
  } else {
    // Let go of the pedals and the car rolls gently to a stop.
    accel = -Math.sign(forward) * Math.min(3 + Math.abs(forward) * 0.15, Math.abs(forward) / dt);
  }
  // Hills: slower uphill, faster downhill, but parked cars stay put.
  const slope = world.slope(state.x, state.z, state.heading);
  const pedals = input.forward || input.backward || input.cruise;
  if (pedals || Math.abs(forward) > 0.5) accel -= 9.81 * slope * 0.55;
  forward += accel * dt;
  if (!pedals && Math.abs(forward) < 0.05) forward = 0;

  // --- Steering --------------------------------------------------------------------
  // Arrow keys and touch override tilt while held.
  const analog = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0;
  const steerTarget = input.left || input.right ? Number(Boolean(input.left)) - Number(Boolean(input.right)) : analog;
  state.steering = damp(state.steering, steerTarget, input.left || input.right ? 7 : 12, dt);
  let yawRate = (forward * Math.tan(steerAngle(state.steering, forward))) / CAR.wheelbase;
  // Tyres can only provide so much sideways grip before the car starts to slide.
  const maxYaw = (11 * (0.5 + 0.5 * handling.grip)) / Math.max(Math.abs(forward), 1);
  yawRate = clamp(yawRate, -maxYaw, maxYaw);
  state.heading += yawRate * dt;

  // For an instant the velocity keeps its old direction, which shows up as
  // sideways motion; the tyres then pull it back in line at a rate set by grip.
  lateral += forward * yawRate * dt;
  lateral = damp(lateral, 0, 1 + 11 * handling.grip ** 1.5, dt);
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

  const circles = [-1, 1].map(end => ({ end }));
  for (let pass = 0; pass < 2; pass++) {
    for (const circle of circles) {
      const cx = x - nsin * CAR.bodyOffset * circle.end;
      const cz = z - ncos * CAR.bodyOffset * circle.end;
      const nearby = [...world.obstacles.near(cx, cz, CAR.bodyRadius + 2), ...(world.dynamic ?? [])];
      for (const obstacle of nearby) {
        const hit = penetration(cx, cz, CAR.bodyRadius, obstacle);
        if (!hit) continue;
        x += hit.nx * hit.depth;
        z += hit.nz * hit.depth;
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
          if (glancing) {
            const along = Math.atan2(-state.vx * Math.sign(forward || 1), -state.vz * Math.sign(forward || 1));
            state.heading += angleDelta(state.heading, along) * 0.2;
          }
        }
      }
    }
  }

  // Deep water and the valley fence stop the car's leading end; it slides
  // along them instead of sticking.
  const reach = Math.sign(forward || 1) * 1.7;
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
  state.speed = -state.vx * nsin - state.vz * ncos;
  state.distance += Math.hypot(x - oldX, z - oldZ);
  return state;
}
