// Řopíky: the small concrete pillboxes built along the Czechoslovak border in
// 1938. A short line of them sits on the northern ridge, facing the fence.
// Each has a thick front wall, firing slits in its flanks and a door at the back.
import { BUNKERS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';

const CONCRETE = '#a7a596';
const SLOT = '#2f3430';

export function buildBunkers(scene, obstacles) {
  const parts = new PartsBuilder();
  for (const [i, bunker] of BUNKERS.entries()) {
    const y = terrainHeight(bunker.x, bunker.z);
    // The front (local -Z) faces north, out towards the fence; each one is turned a little differently.
    const ry = (i - 1) * 0.25;
    const sin = Math.sin(ry);
    const cos = Math.cos(ry);
    const at = (lx, ly, lz) => ({
      x: bunker.x + lx * cos + lz * sin,
      y: y + ly,
      z: bunker.z - lx * sin + lz * cos,
      ry,
    });

    parts.box(4.4, 2.3, 4.2, CONCRETE, at(0, 0.95, 0));
    parts.box(4.8, 0.42, 4.6, '#b0ae9f', at(0, 2.25, 0)); // roof slab
    parts.box(4.6, 0.6, 0.6, CONCRETE, at(0, 0.1, -2.3)); // thickened front wall
    for (const side of [-1, 1]) {
      parts.box(0.06, 0.22, 0.9, SLOT, at(side * 2.21, 1.45, -1.1)); // firing slits in the flanks
      parts.box(0.5, 0.16, 0.5, '#98968a', at(side * 2.35, 1.72, -1.1)); // hood over the slit
    }
    parts.box(1, 1.6, 0.06, SLOT, at(0.9, 0.85, 2.11)); // door at the back
    // Faded camouflage paint.
    parts.box(1.6, 0.9, 0.04, '#8c9070', at(-1.1, 1.2, -2.13));
    parts.box(1.1, 0.7, 0.04, '#9a8f74', at(1.3, 0.8, -2.13));
    parts.box(0.04, 0.8, 1.6, '#8c9070', at(2.22, 0.9, 0.9));
    parts.box(0.04, 0.6, 1.2, '#9a8f74', at(-2.22, 1, 1.1));
    obstacles.push({ x: bunker.x, z: bunker.z, radius: 3.1 });
  }
  scene.add(parts.mesh());
}
