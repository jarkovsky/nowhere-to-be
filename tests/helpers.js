import { createObstacleIndex } from '../src/core/collision.js';
import { stepDriving } from '../src/core/driving.js';

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
