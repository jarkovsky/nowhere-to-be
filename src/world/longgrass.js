// Long grass in patches across the meadows and along the edges of the woods, taller in the middle
// of a patch than at its edges. It sways, bends ahead of the car and lies down where the car has
// driven through it (see trample.js). It has random numbers of its own, so it doesn't move anything
// else. Where each clump grows is worked out as plain data, in a worker on a page (see
// groundwork.js), and the clumps are drawn from that.
import * as THREE from 'three';
import { createRandom, fractalNoise, smoothstep } from '../core/math.js';
import {
  ROAD,
  ROAD_HALF_WIDTH,
  CREEK,
  BROOK,
  OXBOW,
  CAMP_TRAIL,
  onDriveway,
  RAILWAY,
  FIELDS,
  VALLEY_RADIUS,
  GRAVEL_HALF_WIDTH,
  inFjord,
  onAirfield,
  onPaved,
  onGravel,
  nearRiver,
  lakeDistance,
  winterness,
} from './layout.js';
import { terrainHeight, placementHeight, highSnow } from './terrain.js';
import { CLEARINGS, PLACED_TRACKS, grows, inMud, steepness } from './placing.js';
import { desertTakes } from './sand.js';
import { WINTER_TINTS } from './snow.js';
import { PartsBuilder, tintable } from './build.js';
import { foliageMaterial } from './detail.js';
import { growsTall } from './trample.js';

/** Long grass grows this close to the camera, rising out of the ground as it comes into range. */
export const LONG_GRASS_RANGE = 150;

/** True where long grass can grow: off every trail, road and track, and out of the water, the mud and the snow. */
export function isLongGrassGround(x, z) {
  if (Math.hypot(x, z) > VALLEY_RADIUS - 3) return false;
  if (ROAD.isNear(x, z, ROAD_HALF_WIDTH + 0.8) || CAMP_TRAIL.isNear(x, z, 2.8) || RAILWAY.isNear(x, z, 4.5))
    return false;
  if (onPaved(x, z, ROAD_HALF_WIDTH + 0.8) || onAirfield(x, z, 2)) return false;
  if (onGravel(x, z, GRAVEL_HALF_WIDTH + 0.8)) return false;
  if (PLACED_TRACKS.some(track => track.path.isNear(x, z, track.ruts ? 1.6 : 1.3))) return false;
  if (onDriveway(x, z, 0.8)) return false;
  if (CLEARINGS.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r * 0.7) ** 2) || inMud(x, z)) return false;
  if (Math.hypot(x - FIELDS.x, z - FIELDS.z) < FIELDS.radius + 4) return false;
  if (lakeDistance(x, z) < 2.4 || CREEK.isNear(x, z, 6)) return false;
  if (BROOK.isNear(x, z, 3.2) || nearRiver(x, z, 7) || inFjord(x, z, 3) || OXBOW.path.isNear(x, z, 11)) return false;
  const h = placementHeight(x, z);
  return h < 92 && highSnow(x, z, h) < 0.2 && steepness(x, z) < 0.5;
}

/**
 * Where the long grass grows: each clump's matrix (16 numbers) and colour (3), as the scatter keeps
 * them (see scatter.js), and the spots where it stands tall enough to be laid over, as (x, z) pairs.
 */
export function placeLongGrass() {
  const grassRandom = createRandom(6011);
  const dummy = new THREE.Object3D();
  const matrices = [];
  const colors = [];
  const tall = [];
  /** A clump at (x, z), `height` from 0 to 1 of the tallest, tinted round the patch's own `hue`. */
  const clump = (x, z, height, hue) => {
    if (!isLongGrassGround(x, z)) return;
    if (!desertTakes(x, z)) tall.push(x, z);
    dummy.position.set(x, terrainHeight(x, z) - 0.05, z);
    dummy.rotation.set(0, grassRandom() * 6.3, 0);
    const width = 1 + grassRandom() * 0.5;
    dummy.scale.set(width, height * (0.8 + grassRandom() * 0.4), width);
    dummy.updateMatrix();
    // Most clumps have gone over to seed, golden, among a few still olive green.
    const golden = grassRandom() < 0.6 + hue;
    const color = new THREE.Color().setHSL(
      golden ? 0.09 + grassRandom() * 0.03 : 0.17 - hue * 0.05 + grassRandom() * 0.03,
      golden ? 0.55 : 0.36 + grassRandom() * 0.1,
      golden ? 0.44 + grassRandom() * 0.08 : 0.3 + grassRandom() * 0.08,
    );
    // In the winter the clumps are frosted pale blue.
    const winter = winterness(x, z);
    if (winter > 0) {
      const [h, s, l, dh, ds, dl] = WINTER_TINTS.grass;
      const spread = (hue - 0.2) * 5;
      color.lerp(new THREE.Color().setHSL(h + spread * dh, s + spread * ds, l + spread * dl), winter);
    }
    // None grows in the crops or the desert. It is left out once its numbers are drawn, so leaving
    // it out moves nothing placed after it.
    if (!grows(x, z)) return;
    matrices.push(...dummy.matrix.elements);
    colors.push(color.r, color.g, color.b);
  };
  // Patches of it, a few metres to ten across, in some meadows and along the edges of the woods:
  // a try for every 35 square metres inside the fence, and no more than a patch for every 1580.
  let patches = 0;
  const area = Math.PI * VALLEY_RADIUS ** 2;
  for (let attempt = 0; attempt < area / 35 && patches < area / 1580; attempt++) {
    const a = grassRandom() * Math.PI * 2;
    const r = Math.sqrt(grassRandom()) * (VALLEY_RADIUS - 8);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const meadow = smoothstep(fractalNoise(cx / 90 + 1.3, cz / 90 + 7.7, 2, 91), 0.45, 0.68);
    // The same noise as the woods: there is more of it where the woods begin.
    const woods = fractalNoise(cx / 150 + 3.3, cz / 150 + 8.1, 2, 5);
    const edge = 1 - smoothstep(Math.abs(woods - 0.42), 0, 0.08);
    // Most of it within sight of the trails and tracks, though not along them.
    const seen =
      ROAD.isNear(cx, cz, 60) ||
      CAMP_TRAIL.isNear(cx, cz, 40) ||
      onPaved(cx, cz, 50) ||
      onGravel(cx, cz, 50) ||
      PLACED_TRACKS.some(track => track.path.isNear(cx, cz, 40));
    const chance = Math.max(meadow, edge * 0.8) * (seen ? 1 : 0.2);
    if (grassRandom() > chance || !isLongGrassGround(cx, cz)) continue;
    patches++;
    const hue = grassRandom() * 0.4;
    const radius = 3 + grassRandom() * 8;
    const stretch = 0.55 + grassRandom() * 0.7;
    const turn = grassRandom() * Math.PI;
    const ragged = grassRandom() * 6.3;
    const count = Math.round(radius * radius * stretch * Math.PI * 0.55);
    for (let k = 0; k < count; k++) {
      // Thicker and taller towards the middle, with a ragged edge.
      const t = Math.sqrt(grassRandom());
      const b = grassRandom() * Math.PI * 2;
      const reach = t * radius * (0.75 + 0.25 * Math.sin(b * 3 + ragged));
      const u = Math.cos(b) * reach;
      const v = Math.sin(b) * reach * stretch;
      clump(
        cx + u * Math.cos(turn) - v * Math.sin(turn),
        cz + u * Math.sin(turn) + v * Math.cos(turn),
        1 - 0.5 * t * t,
        hue,
      );
    }
  }
  return { matrices: Float32Array.from(matrices), colors: Float32Array.from(colors), tall: Float64Array.from(tall) };
}

/**
 * Adds the long grass placed by placeLongGrass() to `scatter`, and says where it stands tall
 * enough for a car to lay it over (see trample.js).
 */
export function addLongGrass(scatter, { matrices, colors, tall }) {
  for (let i = 0; i < tall.length; i += 2) growsTall(tall[i], tall[i + 1], 1);
  // Seven flat blades leaning out from the middle, each with a face on both sides.
  const blades = new PartsBuilder();
  for (let k = 0; k < 7; k++) {
    const height = 0.7 + ((k * 0.37) % 1) * 0.5;
    for (const face of [1, -1]) {
      const blade = new THREE.BufferGeometry();
      blade.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-0.065 * face, 0, 0, 0.065 * face, 0, 0, 0, height, 0], 3),
      );
      blade.computeVertexNormals();
      const spot = 0.06 + (k % 3) * 0.1;
      blades.add(blade, '#ffffff', {
        x: Math.cos(k * 2.4) * spot,
        z: Math.sin(k * 2.4) * spot,
        ry: Math.PI / 2 - k * 2.4,
        rx: 0.18 + (k % 2) * 0.17,
      });
    }
  }
  scatter.add({
    geometry: tintable(blades.geometry()),
    near: LONG_GRASS_RANGE,
    shadows: false,
    material: foliageMaterial('grass', LONG_GRASS_RANGE),
    matrices,
    colors,
  });
}
