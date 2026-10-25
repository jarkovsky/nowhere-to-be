// The geometry checks run over everything: every landmark built where it stands in the world,
// and every model on its own. Used by the tests (against a recorded baseline), by
// `npm run geometry` to record a new one and by `npm run check` to look at a few things.
import * as THREE from 'three';
import { createObstacleIndex } from '../core/collision.js';
import { drivingHeight } from '../world/terrain.js';
import { inspect } from './inspect.js';
import { LANDMARKS, standing } from './landmarks.js';
import { MODELS } from './models.js';

export { findingKey } from './inspect.js';

/** The faults in a landmark, built where it stands in the world. */
export function checkLandmark(name) {
  const group = new THREE.Group();
  const obstacles = [];
  LANDMARKS[name](group, obstacles);
  return inspect(group, {
    ground: standing,
    // The highest the car can be driving there, up on the rock fin too.
    drivable: (x, z) => drivingHeight(x, z, Infinity),
    obstacles: createObstacleIndex(obstacles),
  });
}

/** The faults in a model, standing on its own. */
export const checkModel = model => inspect(model.create());

/** The faults found in each landmark and model, by id: { id: [issue, ...] }. */
export function checkEverything() {
  const results = {};
  for (const name of Object.keys(LANDMARKS)) results[`landmark.${name}`] = checkLandmark(name);
  for (const model of MODELS) results[`model.${model.id}`] = checkModel(model);
  return results;
}
