// A lookout tower on the highest summit, after the one on Velká Deštná: five-sided,
// with timber slats over a steel frame and an open deck on top.
import * as THREE from 'three';
import { SUMMIT } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';

const STEEL = '#4d5652';
const TIMBER = '#a87d54';
const HEIGHT = 15;

/** The tower narrows a little as it rises. */
const radiusAt = y => 2.9 - y * 0.055;

export function buildSummit(scene, obstacles) {
  const parts = new PartsBuilder();
  const ground = terrainHeight(SUMMIT.x, SUMMIT.z);
  const at = (y, extra = {}) => ({ x: SUMMIT.x, y: ground + y, z: SUMMIT.z, ...extra });

  parts.add(new THREE.CylinderGeometry(3.4, 3.7, 0.8, 5), '#a7a59c', at(0)); // footing

  // Bands of slats with open storeys between them, where the frame and the stairs show.
  for (const [from, to] of [
    [0.4, 3.6],
    [4.8, 8.2],
    [9.4, 12.4],
  ]) {
    for (let y = from; y < to; y += 0.42) {
      parts.add(new THREE.CylinderGeometry(radiusAt(y + 0.3), radiusAt(y), 0.3, 5, 1, true), TIMBER, at(y + 0.15));
    }
  }
  for (const y of [4.4, 8.9, 12.9])
    parts.add(new THREE.CylinderGeometry(radiusAt(y), radiusAt(y), 0.22, 5), STEEL, at(y));
  // The corner posts, leaning in with the walls.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const corner = (y, r) => ({ x: SUMMIT.x + Math.sin(a) * r, y: ground + y, z: SUMMIT.z + Math.cos(a) * r });
    parts.beam(corner(0.3, radiusAt(0) + 0.06), corner(HEIGHT, radiusAt(HEIGHT) + 0.06), 0.16, STEEL);
  }
  // A flight of stairs glimpsed through each open storey.
  for (const y of [3.6, 8.2])
    parts.beam(at(y + 0.2, { x: SUMMIT.x - 1.4 }), at(y + 1.2, { x: SUMMIT.x + 1.4 }), 0.9, '#6c726d', 0.12);
  // The open deck: a floor and a railing.
  parts.add(new THREE.CylinderGeometry(radiusAt(HEIGHT) + 0.3, radiusAt(HEIGHT) + 0.3, 0.25, 5), STEEL, at(13.6));
  parts.add(
    new THREE.CylinderGeometry(radiusAt(HEIGHT) + 0.3, radiusAt(HEIGHT) + 0.3, 1.1, 5, 1, true),
    '#c3c7c1',
    at(14.3),
  );
  scene.add(parts.mesh());
  obstacles.push({ x: SUMMIT.x, z: SUMMIT.z, radius: 3.6 });
}
