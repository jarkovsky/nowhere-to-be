// Works out the parts of the world that are plain data and take the longest: the height field,
// the colour of every point of the ground and where the long grass grows. It is run in Node when
// the game is built or served (see scripts/world.mjs), and a page loads what it gives (see
// compiled.js) rather than working it all out again.
import { packField } from './heightfield.js';
import { shadeGround } from './groundcolor.js';
import { findLongGrass } from './longgrass.js';
import { heightField } from './terrain.js';

/** Everything worked out ahead of time, as data that pack() can store (see pack.js). */
export function compileWorld() {
  return {
    heights: packField(heightField),
    // The normals are worked out from the heights where the ground is drawn (see ground.js).
    ground: { colors: shadeGround() },
    longGrass: findLongGrass(),
  };
}
