// A building with a gable roof, put together from one set of numbers so that its walls, gables
// and roof meet, and with an obstacle that covers its walls: a house, a barn, a chapel.
import { gableEnds, gableRoof } from '../build.js';

/**
 * Walls `width` across and `depth` deep (local X and Z) standing from `base` up to `eave`, the
 * gables and the attic over them up to `ridge`, and a roof slab resting on both that runs on past
 * them by `overhang`, all at heights in the frame and with the middle at (x, z). The ridge runs
 * front to back, along Z, unless `ridgeAlong` is 'x'. Returns a box obstacle round the walls,
 * `margin` out from them.
 */
export function gabledHouse(
  parts,
  { at, local, rotation },
  {
    x = 0,
    z = 0,
    width,
    depth,
    base = 0,
    eave,
    ridge,
    overhang = 0.4,
    walls,
    gables = walls,
    roof,
    ridgeAlong = 'z',
    margin = 0.3,
  },
) {
  parts.box(width, eave - base, depth, walls, at(x, (base + eave) / 2, z));
  // The roof and the gables are built with their ridge along Z, and turned to run along X.
  const along = ridgeAlong === 'x';
  const [across, length] = along ? [depth, width] : [width, depth];
  const turn = at(x, 0, z, { ry: rotation + (along ? Math.PI / 2 : 0) });
  parts.add(gableEnds(across, length, eave, ridge), gables, turn);
  parts.add(gableRoof(across, length, eave, ridge, overhang), roof, turn);
  return { ...local(x, z), halfX: width / 2 + margin, halfZ: depth / 2 + margin, rotation, radius: 0 };
}
