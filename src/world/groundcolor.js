// The colour of the ground at every grid point, and which way it faces there, worked out from the
// height field and the layout alone, so it can be done in a worker (see groundwork.js) and drawn
// on the page (see ground.js).
import * as THREE from 'three';
import { createRandom, fractalNoise, smoothstep, valueNoise } from '../core/math.js';
import {
  LAKE,
  CREEK,
  BROOK,
  OXBOW,
  FJORD,
  VALLEY_RADIUS,
  SURFACES,
  WORN_GROUND,
  inFjord,
  nearRiver,
  rockiness,
  ruggedness,
  gullyDepth,
  lakeDistance,
  desertness,
  winterness,
} from './layout.js';
import { AXIS, GRID, heights, highSnow, waterLevel } from './terrain.js';
import { desertGround } from './sand.js';
import { coastRock, winterGround } from './snow.js';

/** The ground's colours have random numbers of their own, for the specks of variation in them. */
const GROUND_SEED = 5339;

// Autumn: golden meadows with olive-green and russet patches, browner high up, and cool grey rock.
const GROUND = {
  meadow: new THREE.Color('#b08e48'),
  lush: new THREE.Color('#7b8946'),
  dry: new THREE.Color('#c49850'),
  russet: new THREE.Color('#a4673a'),
  high: new THREE.Color('#978359'),
  rock: new THREE.Color('#8f9097'),
  alpine: new THREE.Color('#a4a1a0'),
  shore: new THREE.Color('#d8c996'),
  bank: new THREE.Color('#a6a387'),
  snow: new THREE.Color('#eef1ea'),
  leaves: new THREE.Color('#c4873f'),
  mud: new THREE.Color('#7a6446'),
  stone: new THREE.Color('#b3a891'),
  gravel: new THREE.Color('#c3b9a0'),
};
const rockTone = new THREE.Color();
/** Ground worn bare or covered over (see WORN_GROUND), with its colours made. */
const WORN = WORN_GROUND.map(patch => ({ ...patch, color: new THREE.Color(patch.color) }));

/**
 * Colour of the ground at a grid point, into `out`. `up` is the Y of its normal: 1 on flat
 * ground. Returns how grassy it is there, from 0 to 1, for the grass (see grass.js). Draws its
 * random numbers from `random`.
 */
function groundColor(x, z, h, up, out, random) {
  let grass = Math.hypot(x, z) < VALLEY_RADIUS - 3 ? 1 : 0;
  out
    .copy(GROUND.meadow)
    .lerp(GROUND.dry, Math.min(1, 0.3 + 0.25 * Math.sin(x * 0.009 + z * 0.017) + Math.max(0, h - 15) * 0.006));
  // Patches of greener grass and of grass gone russet, so the meadows aren't one flat colour.
  out.lerp(GROUND.lush, smoothstep(fractalNoise(x / 70 + 4.1, z / 70 + 1.7, 2, 31), 0.5, 0.72) * 0.8);
  out.lerp(GROUND.russet, smoothstep(fractalNoise(x / 52 + 9.2, z / 52 + 3.4, 2, 47), 0.56, 0.76) * 0.6);
  if (h > 45) out.lerp(GROUND.high, Math.min(1, (h - 45) / 80));
  // Bare rock and scree where the ground is steep.
  const steep = smoothstep(up, 0.86, 0.7);
  out.lerp(GROUND.rock, steep * 0.85);
  grass *= 1 - steep;
  // High up, the grass gives way to stony ground and then snow, which doesn't settle on cliffs.
  out.lerp(GROUND.alpine, smoothstep(h, 86, 108) * 0.75);
  grass *= 1 - smoothstep(h, 84, 100);
  if (h > 90) out.lerp(GROUND.snow, highSnow(x, z, h) * smoothstep(up, 0.6, 0.78));
  // Along the water: sand, gravel and stones, then nothing under the water itself.
  const shore = amount => {
    out.lerp(GROUND.bank, amount);
    grass *= 1 - Math.min(1, amount * 1.3);
  };
  if (lakeDistance(x, z) < 2.2) {
    const sand = 1 - smoothstep(h, LAKE.level + 0.35, LAKE.level + 0.9);
    out.lerp(GROUND.shore, sand);
    grass *= 1 - sand;
  }
  if (h < FJORD.level + 1.5 && inFjord(x, z, 6)) shore(1 - smoothstep(h, FJORD.level + 0.4, FJORD.level + 1.5));
  if (CREEK.isNear(x, z, 9)) shore(1 - smoothstep(CREEK.nearest(x, z).distance, 5, 9));
  if (BROOK.isNear(x, z, 6)) shore(1 - smoothstep(BROOK.nearest(x, z).distance, 2.5, 6));
  const river = nearRiver(x, z, 14);
  if (river) {
    const halfWidth = river.river.halfWidth(river.s);
    shore(1 - smoothstep(river.distance, halfWidth + 1, halfWidth + 7));
    // Gravel bars and the shallows are pale stones, with the odd darker one.
    const near = 1 - smoothstep(h - waterLevel(x, z), 0.08, 0.5);
    if (near > 0) out.lerp(GROUND.gravel, near * (0.7 + 0.3 * valueNoise(x / 1.7, z / 1.7, 83)));
  }
  // Gravel on the oxbow's shore and over its bed, where it shows through the shallows.
  if (OXBOW.path.isNear(x, z, 16)) {
    const { s, distance } = OXBOW.path.nearest(x, z);
    shore(1 - smoothstep(distance - OXBOW.halfWidth(s), 0.5, 2.5));
  }
  if (grass > 0 && waterLevel(x, z) > h - 0.3) grass = 0;
  // Bare rock, paler in places and darker in others.
  const rocky = rockiness(x, z);
  if (rocky > 0) out.lerp(rockTone.copy(GROUND.stone).lerp(GROUND.rock, valueNoise(x / 9, z / 9, 61)), rocky * 0.9);
  grass *= 1 - Math.min(1, rocky * 1.6);
  // The rugged country is stonier and its grass thinner, and the dry gully is gravel.
  const rugged = ruggedness(x, z);
  if (rugged > 0) {
    out.lerp(rockTone.copy(GROUND.stone).lerp(GROUND.rock, valueNoise(x / 9, z / 9, 61)), rugged * 0.3);
    grass *= 1 - rugged * 0.45;
  }
  const gully = gullyDepth(x, z);
  if (gully > 0) {
    out.lerp(GROUND.bank, smoothstep(gully, 0.3, 2) * 0.9);
    grass *= 1 - smoothstep(gully, 0.1, 0.9);
  }
  for (const patch of SURFACES) {
    // Mud's ragged edge comes from noise rather than the shared random numbers, so that
    // adding a patch of it doesn't move every tree placed after the ground.
    const ragged = patch.id === 'mud' ? (valueNoise(x / 2.5, z / 2.5, 9) - 0.5) * 0.5 : (random() - 0.5) * 0.12;
    const ux = (x - patch.x) / patch.rx;
    const uz = (z - patch.z) / patch.rz;
    const d = Math.sqrt(ux * ux + uz * uz) + ragged;
    if (d < 1 && patch.id === 'leaves') out.lerp(GROUND.leaves, 0.75);
    if (d < 1.2 && patch.id === 'mud') out.lerp(GROUND.mud, 0.85 * (1 - smoothstep(d, 0.8, 1.2)));
    // The mud's colour reaches out past its edge, so the grass starts a little further out.
    if (patch.id === 'mud') grass *= smoothstep(d, 1.15, 1.45);
    else if (d < 1) grass *= 0.4;
  }
  // Earth trodden bare in the logging camp's glade, and rubble round the mine. Their ragged edges come from
  // noise, not the shared random numbers, so that they don't move anything placed after the ground.
  for (const patch of WORN) {
    const reach = Math.hypot(x - patch.x, z - patch.z) + (valueNoise(x / 3, z / 3, 17) - 0.5) * 4;
    const worn = 1 - smoothstep(reach, patch.r, patch.r + patch.soft);
    if (worn > 0) {
      out.lerp(patch.color, worn * 0.85);
      grass *= 1 - worn;
    }
  }
  desertGround(x, z, up, out);
  if (grass > 0) grass *= 1 - smoothstep(desertness(x, z), 0.05, 0.45);
  const winter = winterness(x, z);
  if (winter > 0) {
    grass = winterGround(x, z, up, winter, out, grass);
    coastRock(x, z, up, out);
  }
  out.multiplyScalar(0.96 + random() * 0.08);
  return grass;
}

const CELLS = GRID - 1;
const height = (ix, iz) => heights[iz * GRID + ix];

/**
 * The normal and colour of every grid point, as bytes: the normal from the slope between its
 * neighbours, and the colour from `colorAt(x, z, height, up, out)`, where `up` is 1 on level ground.
 * What `colorAt` returns, how grassy the ground is from 0 to 1, goes in the colour's alpha.
 */
export function gridShading(colorAt) {
  const normals = new Int8Array(GRID * GRID * 3);
  const colors = new Uint8Array(GRID * GRID * 4);
  const normal = new THREE.Vector3();
  const color = new THREE.Color();
  for (let iz = 0; iz < GRID; iz++) {
    const [z0, z1] = [Math.max(0, iz - 1), Math.min(CELLS, iz + 1)];
    for (let ix = 0; ix < GRID; ix++) {
      const [x0, x1] = [Math.max(0, ix - 1), Math.min(CELLS, ix + 1)];
      const dx = (height(x1, iz) - height(x0, iz)) / (AXIS[x1] - AXIS[x0]);
      const dz = (height(ix, z1) - height(ix, z0)) / (AXIS[z1] - AXIS[z0]);
      normal.set(-dx, 1, -dz).normalize();
      const i = iz * GRID + ix;
      normals[i * 3] = Math.round(normal.x * 127);
      normals[i * 3 + 1] = Math.round(normal.y * 127);
      normals[i * 3 + 2] = Math.round(normal.z * 127);
      const grass = colorAt(AXIS[ix], AXIS[iz], height(ix, iz), normal.y, color);
      colors[i * 4] = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
      colors[i * 4 + 1] = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
      colors[i * 4 + 2] = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
      colors[i * 4 + 3] = Math.round(THREE.MathUtils.clamp(grass, 0, 1) * 255);
    }
  }
  return { normals, colors };
}

/** The ground's normals and colours, as gridShading() gives them, coloured by groundColor(). */
export function shadeGround(random = createRandom(GROUND_SEED)) {
  return gridShading((x, z, h, up, out) => groundColor(x, z, h, up, out, random));
}
