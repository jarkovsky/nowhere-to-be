// The winter's ground and the colours of what stands in it: deep snow, white on the crests of
// its drifts and a cool blue-lavender in their hollows, bare grey rock where the ground is too
// steep for it to lie, and tufts of grass frosted pale blue; and the tints of the birches and
// firs, whose crowns are loaded with snow.
import * as THREE from 'three';
import { fractalNoise, smoothstep, valueNoise } from '../core/math.js';

const SNOW = new THREE.Color('#eef5ff');
const HOLLOW = new THREE.Color('#9fb8e0');
const FROST = new THREE.Color('#6f8fd0');
const BARE = new THREE.Color('#8e929c');
const tone = new THREE.Color();

/**
 * Colours the ground at a point by how wintry it is, `winter` from 0 to 1 (see groundColor in
 * scenery.js). `up` is 1 on level ground. Returns what is left of `grass`, which only grows in
 * tufts out of the snow, in patches a few metres across.
 */
export function winterGround(x, z, up, winter, out, grass) {
  // Drifts: broad swells and finer ripples, so the white is blue in the lee of each.
  const drift = fractalNoise(x / 31 + 7.3, z / 23 + 2.9, 3, 151);
  const lee = smoothstep(drift, 0.6, 0.4) * 0.95 + smoothstep(valueNoise(x / 90, z / 70, 157), 0.55, 0.3) * 0.3;
  tone.copy(SNOW).lerp(HOLLOW, lee);
  // Steep ground is swept bare, in patches, rather than all of it at once.
  const swept = smoothstep(up, 0.86, 0.7) * smoothstep(fractalNoise(x / 6, z / 6, 2, 163), 0.2, 0.5);
  const tufts =
    smoothstep(fractalNoise(x / 6.5 + 1.1, z / 6.5 + 4.7, 2, 167), 0.5, 0.68) *
    smoothstep(fractalNoise(x / 45 + 9, z / 45 + 3, 2, 173), 0.3, 0.55);
  tone.lerp(FROST, tufts * 0.85);
  out.lerp(tone, winter * (1 - swept * 0.9));
  if (swept > 0) out.lerp(BARE, winter * swept * 0.75);
  return grass * (1 - winter * (1 - tufts * (1 - swept)));
}

/**
 * Tints for the crowns, as [hue, saturation, lightness] and how far each may vary: the crowns
 * are painted pale, so these come out powdery blue-white. Firs have their boughs loaded with snow.
 */
export const WINTER_TINTS = {
  birch: [0.61, 0.8, 0.82, 0.03, 0.1, 0.05],
  fir: [0.6, 0.65, 0.86, 0.03, 0.08, 0.06],
  grass: [0.62, 0.6, 0.66, 0.025, 0.08, 0.05],
};
