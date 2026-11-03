// The ground's share of the world that is plain data: its colours and normals (see groundcolor.js)
// and where the long grass grows (see longgrass.js). On a page it comes from the worker (see
// prebuild.js); anywhere else, or if the worker fails, it is worked out here.
import { shadeGround } from './groundcolor.js';
import { placeLongGrass } from './longgrass.js';
import { prebuilt } from './prebuild.js';

/** Works out the ground's share here and now. */
export function buildGroundwork() {
  return { shading: shadeGround(), longGrass: placeLongGrass() };
}

/** The ground's share, from the worker where there is one. */
export async function groundwork() {
  const parts = prebuilt();
  if (parts) {
    try {
      return await parts.ground;
    } catch (error) {
      console.warn('The ground is coloured on the page instead:', error);
    }
  }
  return buildGroundwork();
}
