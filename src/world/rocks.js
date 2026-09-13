// Low-poly boulders. The vertices are welded before they are nudged, so the
// faces stay joined; they are split again afterwards for flat shading.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom } from '../core/math.js';

const STONE = ['#a6a998', '#9a9d8d', '#b2b09f', '#a19f91'];
const MOSS = new THREE.Color('#8e9b69');

/** A lumpy boulder roughly 2 m across, flat underneath, with vertex colours. */
export function boulderGeometry(seed, { detail = 1, moss = 0.35 } = {}) {
  const random = createRandom(seed * 7919 + 13);
  let geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const stretch = [0.85 + random() * 0.35, 0.62 + random() * 0.25, 0.85 + random() * 0.35];
  for (let i = 0; i < position.count; i++) {
    const lump = 0.84 + random() * 0.28;
    position.setXYZ(
      i,
      position.getX(i) * stretch[0] * lump,
      Math.max(position.getY(i) * stretch[1] * lump, -0.32),
      position.getZ(i) * stretch[2] * lump,
    );
  }
  geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();

  // Lighter, sometimes mossy tops; darker undersides.
  const normal = geometry.attributes.normal;
  const base = new THREE.Color(STONE[seed % STONE.length]);
  const color = new THREE.Color();
  const colors = new Float32Array(normal.count * 3);
  for (let face = 0; face < normal.count; face += 3) {
    const up = normal.getY(face);
    color.copy(base).multiplyScalar(0.9 + random() * 0.14 + Math.max(0, up) * 0.06);
    if (up > 0.6 && random() < moss) color.lerp(MOSS, 0.55);
    if (up < -0.2) color.multiplyScalar(0.82);
    for (let k = 0; k < 3; k++) color.toArray(colors, (face + k) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
