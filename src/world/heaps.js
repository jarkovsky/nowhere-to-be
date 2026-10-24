// Heaps of gravel, sand, earth and dung, drawn to the same shape the tyres ride over (see
// heapHeight), so the car climbs over them instead of bumping into them.
import * as THREE from 'three';
import { createRandom } from '../core/math.js';
import { HEAPS } from './layout.js';
import { heapSurface, terrainHeight } from './terrain.js';
import { triangleGeometry, vertexColorMaterial } from './build.js';

const RINGS = 7;
const SIDES = 16;

/** One heap as faceted triangles: rings from its top down to a foot tucked just under the ground. */
function heapTriangles(heap, positions, colors) {
  const random = createRandom(Math.round(heap.x * 13 + heap.z * 7));
  const base = new THREE.Color(heap.color);
  const tint = new THREE.Color();
  const ring = j => {
    const t = Math.min(1, j / RINGS);
    return Array.from({ length: SIDES }, (_, k) => {
      const a = (k / SIDES) * Math.PI * 2 + (j % 2) * (Math.PI / SIDES);
      // The foot reaches a little past the edge and under the ground, so no gap shows round it.
      const r = heap.radius * (j > RINGS ? 1.04 : t);
      const x = heap.x + Math.cos(a) * r;
      const z = heap.z + Math.sin(a) * r;
      const y = terrainHeight(x, z) + (j > RINGS ? -0.08 : heapSurface(heap, x, z));
      return [x, y, z];
    });
  };
  const top = [heap.x, terrainHeight(heap.x, heap.z) + heapSurface(heap, heap.x, heap.z), heap.z];
  const rings = Array.from({ length: RINGS + 1 }, (_, j) => ring(j + 1));
  const paint = (corners, shade) => {
    tint.copy(base).multiplyScalar(shade * (0.93 + random() * 0.12));
    for (const corner of corners) {
      positions.push(...corner);
      colors.push(tint.r, tint.g, tint.b);
    }
  };
  for (let k = 0; k < SIDES; k++) paint([top, rings[0][(k + 1) % SIDES], rings[0][k]], 1.06);
  for (let j = 0; j < RINGS; j++) {
    const [inner, outer] = [rings[j], rings[j + 1]];
    // Darker towards the foot, where it is damp and trodden.
    const shade = 1.04 - (j / RINGS) * 0.16;
    for (let k = 0; k < SIDES; k++) {
      const [a, b] = [k, (k + 1) % SIDES];
      if (j % 2 === 0) {
        paint([inner[a], inner[b], outer[b]], shade);
        paint([inner[a], outer[b], outer[a]], shade);
      } else {
        paint([inner[a], inner[b], outer[a]], shade);
        paint([inner[b], outer[b], outer[a]], shade);
      }
    }
  }
}

export function buildHeaps(scene, heaps = HEAPS) {
  const positions = [];
  const colors = [];
  for (const heap of heaps) heapTriangles(heap, positions, colors);
  const mesh = new THREE.Mesh(triangleGeometry(positions, colors), vertexColorMaterial);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = 'heaps';
  scene.add(mesh);
  return mesh;
}
