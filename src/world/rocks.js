// Boulders: blocks of stone with rounded edges and a few flat faces where they have split,
// smooth-shaded, cool grey with grass and moss on their tops. Each is a sphere pushed out
// towards a box, cut flat here and there and lumped a little, so the light runs smoothly over
// it and catches its edges, and it reads as stone from far off.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom, smoothstep, valueNoise } from '../core/math.js';
import { flatMaterial } from './build.js';

const STONE = ['#8d91a0', '#878b99', '#9598a4', '#898c97'];
/** What grows on the tops: grass gone gold, and moss. */
const MOSS = [new THREE.Color('#a08c4e'), new THREE.Color('#87864c')];

/** Rocks are shaded smoothly, unlike most things, so their rounded edges show. */
export const rockMaterial = flatMaterial('#ffffff', { vertexColors: true, flatShading: false });

/**
 * A boulder roughly 2 m across, flat underneath, with vertex colours and smooth normals.
 * `detail` 2 is for big boulders near the camera, 1 for small stones and 0 for far off.
 * `moss` is how much grows on its top, from 0 to 1.
 */
export function boulderGeometry(seed, { detail = 1, moss = 0.35 } = {}) {
  const random = createRandom(seed * 7919 + 13);
  let geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const stretch = [0.85 + random() * 0.35, 0.62 + random() * 0.25, 0.85 + random() * 0.35];
  const blocky = 0.45 + random() * 0.3;
  // Faces where it has split, flat across: mostly on the sides and the top.
  const cuts = Array.from({ length: 3 }, () => {
    const a = random() * Math.PI * 2;
    const up = random() * 0.9;
    const normal = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    return { normal, depth: 0.62 + random() * 0.22 };
  });
  const offset = random() * 50;
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).normalize();
    // Out towards a box round the sphere, keeping the corners round.
    const most = Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
    p.lerp(p.clone().divideScalar(most).multiplyScalar(0.82), blocky);
    // Lumps, smooth across the surface rather than a spike at each corner.
    const lump = 0.9 + 0.2 * valueNoise(p.x * 1.6 + offset, p.z * 1.6 + p.y * 1.1, 97);
    p.multiplyScalar(lump);
    for (const { normal, depth } of cuts) {
      const beyond = p.dot(normal) - depth;
      if (beyond > 0) p.addScaledVector(normal, -beyond * 0.9);
    }
    position.setXYZ(i, p.x * stretch[0], Math.max(p.y * stretch[1], -0.32), p.z * stretch[2]);
  }
  geometry.computeVertexNormals();

  // Grass and moss on the tops, darker undersides, and the stone a little patchy.
  const normal = geometry.attributes.normal;
  const base = new THREE.Color(STONE[seed % STONE.length]);
  const growth = MOSS[seed % MOSS.length];
  const color = new THREE.Color();
  const colors = new Float32Array(normal.count * 3);
  const mossy = moss > 0 ? 0.35 + moss : 0;
  for (let i = 0; i < normal.count; i++) {
    const up = normal.getY(i);
    const patch = valueNoise(position.getX(i) * 2.3 + offset, position.getZ(i) * 2.3 - position.getY(i), 31);
    color.copy(base).multiplyScalar(0.9 + patch * 0.16);
    color.lerp(growth, smoothstep(up, 0.5, 0.82) * mossy * smoothstep(patch, 0.25, 0.55));
    if (up < 0) color.multiplyScalar(1 + up * 0.25);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Softens rock built face by face (the tunnel's mountain, the waterfall's cliffs, the arch):
 * each corner takes the normal and colour of all the faces round it that meet at less than
 * `crease` degrees, so the light and the colour run smoothly over the rock while its sharp
 * ridges stay sharp. For non-indexed geometry with a colour on each corner. Draw it with
 * rockMaterial.
 */
export function softenRock(geometry, crease = 50) {
  const position = geometry.attributes.position;
  const color = geometry.attributes.color;
  const count = position.count;
  const faces = new Float32Array(count);
  const normals = new Float32Array(count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1).sub(a);
    c.fromBufferAttribute(position, i + 2).sub(a);
    // Weighted by the face's size: twice its area is the cross product's length.
    b.cross(c);
    for (let k = 0; k < 3; k++) b.toArray(normals, (i + k) * 3);
    faces[i] = faces[i + 1] = faces[i + 2] = b.length();
  }
  const corners = new Map();
  const key = i =>
    `${Math.round(position.getX(i) * 1000)},${Math.round(position.getY(i) * 1000)},${Math.round(position.getZ(i) * 1000)}`;
  for (let i = 0; i < count; i++) {
    const k = key(i);
    if (!corners.has(k)) corners.set(k, []);
    corners.get(k).push(i);
  }
  const limit = Math.cos((crease * Math.PI) / 180);
  const smooth = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const own = new THREE.Vector3();
  const other = new THREE.Vector3();
  const sum = new THREE.Vector3();
  for (const shared of corners.values()) {
    for (const i of shared) {
      own.fromArray(normals, i * 3).normalize();
      sum.set(0, 0, 0);
      let [r, g, bl, n] = [0, 0, 0, 0];
      for (const j of shared) {
        other.fromArray(normals, j * 3);
        if (faces[j] > 0 && other.clone().normalize().dot(own) < limit) continue;
        sum.add(other);
        r += color.getX(j);
        g += color.getY(j);
        bl += color.getZ(j);
        n++;
      }
      (sum.lengthSq() > 0 ? sum.normalize() : own).toArray(smooth, i * 3);
      colors.set(n ? [r / n, g / n, bl / n] : [color.getX(i), color.getY(i), color.getZ(i)], i * 3);
    }
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(smooth, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
