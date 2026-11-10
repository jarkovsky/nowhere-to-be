import { createObstacleIndex } from '../src/core/collision.js';
import { stepDriving } from '../src/core/driving.js';
import { angleDelta, clamp, smoothstep } from '../src/core/math.js';

/** A flat, open world for testing the driving model in isolation. */
export function flatWorld({ obstacles = [], surface = 'road', slope = 0, isDriveable = () => true } = {}) {
  return {
    obstacles: createObstacleIndex(obstacles),
    dynamic: [],
    surface: () => surface,
    slope: () => slope,
    isDriveable,
  };
}

/** Runs the driving model for `seconds` at 60 steps per second. */
export function drive(state, input, seconds, world = flatWorld()) {
  for (let t = 0; t < seconds; t += 1 / 60) stepDriving(state, input, 1 / 60, world);
  return state;
}

/**
 * How a driver steers towards the heading `desired`: by the way the car is going rather than the
 * way it points, once it is moving, as a person watching the road does, and holding the wheel
 * over a little more the longer it stays off line, so a car sliding a little down a side slope is
 * steered back up it. `memory` ({}) carries that on from one step to the next.
 */
export function steerTowards(car, desired, memory = {}, dt = 1 / 60) {
  const going = Math.atan2(-car.vx, -car.vz) + (car.speed < 0 ? Math.PI : 0);
  const crab = angleDelta(car.heading, going) * smoothstep(Math.abs(car.speed), 1, 3);
  const off = angleDelta(car.heading + crab, desired);
  const plain = off * 2.5;
  // Already turning the wheel as far as it goes, there is nothing to hold it over for.
  const full = Math.abs(plain) >= 1;
  memory.held = full ? 0 : clamp((memory.held ?? 0) * Math.exp(-dt / 2) + off * dt, -0.2, 0.2);
  return clamp(plain + memory.held * 2, -1, 1);
}
