// Helpers for assembling low-poly props. Static props are merged into a single
// vertex-coloured mesh, which keeps the draw-call count low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const materials = new Map();

/** Shared flat-shaded material. Lambert is much cheaper than PBR and suits the style. */
export function flatMaterial(color = '#ffffff', options = {}) {
  const key = `${color}|${JSON.stringify(options)}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...options }));
  }
  return materials.get(key);
}

export const vertexColorMaterial = flatMaterial('#ffffff', { vertexColors: true });

const matrix = new THREE.Matrix4();
const rotation = new THREE.Quaternion();
const euler = new THREE.Euler();
const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const tint = new THREE.Color();

/** Collects coloured geometry pieces and merges them into one mesh. */
export class PartsBuilder {
  constructor() {
    this.parts = [];
  }

  /**
   * Adds a copy of `geometry`, transformed and painted with a single colour.
   * Transform: { x, y, z, rx, ry, rz, sx, sy, sz } (all optional), or a Matrix4.
   */
  add(geometry, color, transform = {}) {
    const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(part.attributes)) {
      if (name !== 'position' && name !== 'normal') part.deleteAttribute(name);
    }
    if (transform.isMatrix4) {
      part.applyMatrix4(transform);
    } else {
      const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = transform;
      rotation.setFromEuler(euler.set(rx, ry, rz, 'YXZ'));
      part.applyMatrix4(matrix.compose(position.set(x, y, z), rotation, scale.set(sx, sy, sz)));
    }
    tint.set(color);
    const count = part.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([tint.r, tint.g, tint.b], i * 3);
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(part);
    return this;
  }

  box(width, height, depth, color, transform) {
    return this.add(new THREE.BoxGeometry(width, height, depth), color, transform);
  }

  /** A box stretched between two points, e.g. a beam or a rail. */
  beam(from, to, thickness, color, height = thickness) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    return this.box(thickness, height, length, color, {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      z: (from.z + to.z) / 2,
      ry: yaw,
      rx: pitch,
    });
  }

  get isEmpty() {
    return this.parts.length === 0;
  }

  geometry() {
    const merged = mergeGeometries(this.parts);
    merged.computeBoundingSphere();
    return merged;
  }

  mesh({ material = vertexColorMaterial, castShadow = true, receiveShadow = true } = {}) {
    const mesh = new THREE.Mesh(this.geometry(), material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

/** Builds a non-indexed, vertex-coloured mesh from raw triangles. */
export function triangleGeometry(positions, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
