// The geometry checks run over everything: every landmark built where it stands in the world,
// and every model on its own. Used by the tests (against a recorded baseline) and by
// `npm run geometry` to record a new one.
import * as THREE from 'three';
import { createObstacleIndex } from '../core/collision.js';
import { drivingHeight } from '../world/terrain.js';
import { inspect } from './inspect.js';
import { LANDMARKS, standing } from './landmarks.js';
import { MODELS } from './models.js';

/** How many faults of each kind, as { kind: count }. */
function tally(issues) {
  const counts = {};
  for (const issue of issues) counts[issue.kind] = (counts[issue.kind] ?? 0) + 1;
  return counts;
}

/** The faults found in each landmark and model, by id: { id: { kind: count } }. */
export function checkEverything() {
  const results = {};
  for (const [name, build] of Object.entries(LANDMARKS)) {
    const group = new THREE.Group();
    const obstacles = [];
    build(group, obstacles);
    const issues = inspect(group, {
      ground: standing,
      drivable: drivingHeight,
      obstacles: createObstacleIndex(obstacles),
    });
    results[`landmark.${name}`] = tally(issues);
  }
  for (const model of MODELS) results[`model.${model.id}`] = tally(inspect(model.create()));
  return results;
}
