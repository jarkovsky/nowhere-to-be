import { terrainHeight } from '../terrain.js';
import { localFrame } from '../build.js';

/**
 * Places parts in a frame turned by `rotation` about (x, z), with local +Z its front, at
 * height `y`: the ground there unless given.
 */
export function framer({ x, z, rotation }, y = terrainHeight(x, z)) {
  const local = localFrame(x, z, rotation);
  return {
    local,
    rotation,
    at: (lx, ly, lz, extra = {}) => ({ ...local(lx, lz), y: y + ly, ry: rotation, ...extra }),
    ground: (lx, lz) => {
      const p = local(lx, lz);
      return terrainHeight(p.x, p.z);
    },
  };
}
