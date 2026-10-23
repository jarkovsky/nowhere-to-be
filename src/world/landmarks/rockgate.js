// A natural arch of rock over the outer road, below the rocky hill: wide and high enough
// for the rescue helicopter to fly through. It is a half ring of rock, lumpy and banded,
// with its feet sunk into the ground on either side of the road.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fractalNoise } from '../../core/math.js';
import { ROCK_GATE } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { vertexColorMaterial } from '../build.js';

const BANDS = ['#b9ad95', '#a99d86', '#c2b69c', '#9f947f'];

export function buildRockGate(scene, obstacles) {
  const { x, z, dx, dz, span, height } = ROCK_GATE;
  const thickness = 4.5;
  const radius = span / 2 + thickness;
  // A half ring standing on end in its own XY plane, then stretched up to the arch's height.
  let geometry = new THREE.TorusGeometry(radius, thickness, 8, 20, Math.PI);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const rise = height / (radius - thickness);
  for (let i = 0; i < position.count; i++) {
    const px = position.getX(i);
    const py = position.getY(i);
    const pz = position.getZ(i);
    // Knobs and hollows all over, and a little more bulk low down.
    const lump = (fractalNoise(px / 5 + 3.1, py / 5 + pz / 7, 2, 47) - 0.5) * 3.2;
    const scale = 1 + lump / thickness + Math.max(0, 1 - py / 10) * 0.25;
    const along = Math.hypot(px, py);
    const cx = (px / along) * radius;
    const cy = (py / along) * radius;
    position.setXYZ(i, cx + (px - cx) * scale, (cy + (py - cy) * scale) * rise - 3, pz * scale);
  }
  geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();

  // Bands of paler and darker stone, as in sandstone, darker underneath.
  const normal = geometry.attributes.normal;
  const corner = geometry.attributes.position;
  const colors = new Float32Array(corner.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < corner.count; i += 3) {
    const y = (corner.getY(i) + corner.getY(i + 1) + corner.getY(i + 2)) / 3;
    color.set(BANDS[Math.floor(y / 1.6 + 40) % BANDS.length]);
    if (normal.getY(i) < -0.3) color.multiplyScalar(0.8);
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const gate = new THREE.Mesh(geometry, vertexColorMaterial);
  gate.castShadow = gate.receiveShadow = true;
  // Across the road: the arch's own X runs along the road's sideways direction.
  const feet = [-1, 1].map(side => ({ x: x - dz * side * radius, z: z + dx * side * radius }));
  const ground = Math.min(...feet.map(foot => terrainHeight(foot.x, foot.z)), terrainHeight(x, z));
  gate.position.set(x, ground, z);
  gate.rotation.y = Math.atan2(-dx, -dz);
  scene.add(gate);
  for (const foot of feet) obstacles.push({ ...foot, radius: thickness + 0.8 });
  return { occluders: [gate] };
}
