// Řopíky: the small concrete pillboxes built along the Czechoslovak border in
// 1938. A short line of them sits on the northern ridge, facing the fence.
// Each is a squat block with rounded edges. Two rounded "ears" stick out from
// its front corners to hide the firing slits in its flanks, an earth bank is
// heaped against the front wall, and the way in is round the back.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { valueNoise } from '../../core/math.js';
import { BUNKERS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame } from '../build.js';

const WIDTH = 5;
const DEPTH = 4.6;
const HEIGHT = 2.7;
const DARK = '#2b2f2c';

/** Weathered concrete with faded patches of 1938 camouflage. */
const CONCRETE = '#b4b1a3';
const PATCHES = ['#bcae84', '#9ea683', '#a39279'];
function camouflage(x, y, z) {
  const n = valueNoise(x * 0.32 + z * 0.2 + 7, y * 0.5 - z * 0.3 + x * 0.15, 5);
  return n < 0.5 ? CONCRETE : PATCHES[Math.min(2, Math.floor((n - 0.5) * 6))];
}

/** A stepped firing slit: squares set into one another, darker towards the middle. */
function embrasure(parts, at, side) {
  for (const [size, color, out] of [
    [1, '#8f8c80', 0],
    [0.74, '#6c6a62', 0.012],
    [0.5, '#4a4b45', 0.024],
    [0.28, DARK, 0.036],
  ]) {
    parts.box(0.06, size, size, color, at(side * (WIDTH / 2 + 0.01 + out), 1.4, -0.35));
  }
}

export function buildBunkers(scene, obstacles) {
  const parts = new PartsBuilder();
  for (const [i, bunker] of BUNKERS.entries()) {
    const y = terrainHeight(bunker.x, bunker.z);
    // The front (local -Z) faces north, out towards the fence; each one is turned a little differently.
    const ry = (i - 1) * 0.25;
    const local = localFrame(bunker.x, bunker.z, ry);
    const at = (lx, ly, lz, extra = {}) => ({ ...local(lx, lz), y: y + ly, ry, ...extra });

    // The block is sunk a little so its rounded foot never floats on a slope.
    parts.add(new RoundedBoxGeometry(WIDTH, HEIGHT + 0.5, DEPTH, 2, 0.45), camouflage, at(0, HEIGHT / 2 - 0.25, 0));
    for (const side of [-1, 1]) {
      parts.add(
        new RoundedBoxGeometry(1.5, HEIGHT + 0.4, 1.7, 2, 0.6),
        camouflage,
        at(side * (WIDTH / 2 + 0.35), HEIGHT / 2 - 0.25, -DEPTH / 2 + 0.85),
      );
      embrasure(parts, at, side);
    }
    // The way in at the back, with a small slit beside it to cover the door.
    parts.box(1, 1.8, 0.06, DARK, at(-1, 0.9, DEPTH / 2 + 0.01));
    parts.box(1.3, 0.16, 0.12, '#9a978b', at(-1, 1.88, DEPTH / 2 + 0.02));
    parts.box(0.36, 0.2, 0.06, DARK, at(0.7, 1.35, DEPTH / 2 + 0.01));
    // A periscope stub on the roof.
    parts.add(new THREE.CylinderGeometry(0.12, 0.14, 0.3, 6), '#5d5f58', at(0.9, HEIGHT + 0.15, 0.6));
    // The earth bank against the front wall, grassed over.
    parts.add(
      new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      '#98a677',
      at(0, -0.2, -DEPTH / 2, { sx: WIDTH / 2 + 1.6, sy: HEIGHT - 0.6, sz: 2.6 }),
    );

    const a = local(-WIDTH / 2 + 2.3, 0);
    const b = local(WIDTH / 2 - 2.3, 0);
    obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: DEPTH / 2 + 0.1 });
    for (const side of [-1, 1])
      obstacles.push({ ...local(side * (WIDTH / 2 + 0.35), -DEPTH / 2 + 0.85), radius: 0.85 });
    obstacles.push({ ...local(0, -DEPTH / 2 - 1.2), radius: 2.4 });
  }
  scene.add(parts.mesh());
}
