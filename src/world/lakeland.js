// The lakeland's own ground cover, and what it clears away of the valley's (see LAKELAND in
// layout.js for the lie of the land, and heightfield.js for its ground).
import { LAKELAND } from './layout.js';
import { lakelandHold } from './heightfield.js';
import { AXIS, heightField } from './terrain.js';

/** The corner nearest the middle of the valley of the square the lakeland changed the land in. */
const FROM = { x: AXIS[heightField.lakeland.ix0], z: AXIS[heightField.lakeland.iz0] };

/**
 * True where the lakeland takes the place of whatever the valley's scenery would put there: on
 * its own ground and in the mountains round it, and along its road where that runs through the
 * valley. The valley's trees, rocks and grass are still tried there, from the same run of random
 * numbers as ever, and then left out (see grows in placing.js).
 */
export function lakelandTakes(x, z) {
  if (x < FROM.x || z < FROM.z) return false;
  return lakelandHold(x, z) > 0.5 || LAKELAND.road.isNear(x, z, 12);
}
