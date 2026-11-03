// Builds the parts of the world that are plain data, for the page (see prebuild.js). The height
// field goes first, as soon as it is built, since everything else on the page waits for it; the
// ground's colours and the long grass follow, while the page builds the rest of the world.
import { packField } from './heightfield.js';
import { heightField } from './terrain.js';
import { buildGroundwork } from './groundwork.js';

try {
  // The heights are copied rather than handed over: the ground's colours still need them here.
  postMessage({ part: 'heights', value: packField(heightField) });
  const ground = buildGroundwork();
  const { shading, longGrass } = ground;
  const arrays = [shading.normals, shading.colors, longGrass.matrices, longGrass.colors, longGrass.tall];
  postMessage(
    { part: 'ground', value: ground },
    arrays.map(array => array.buffer),
  );
} catch (error) {
  postMessage({ error: String(error?.stack ?? error) });
}
