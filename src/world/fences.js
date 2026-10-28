// Wooden paddock fences, which stop the car like any wall. Every post, rail and gate bar is one
// copy of a box in a single instanced mesh, so a fence costs one draw call however long it is.
import * as THREE from 'three';
import { vertexColorMaterial } from './build.js';

/** The rails' heights, the size of a rail and of a post, and how far a post is sunk into the ground. */
const RAILS = [0.55, 1.05];
const RAIL = { width: 0.09, height: 0.12 };
const POST = { width: 0.16, height: 1.4, sunk: 0.15 };
const COLORS = { post: '#8d7a5c', rail: '#9c8a6a', gate: '#c9bb9b' };

const up = new THREE.Vector3(0, 1, 0);
const along = new THREE.Vector3();
const across = new THREE.Vector3();
const lift = new THREE.Vector3();

/** A box from `from` to `to` ({ x, y, z } each), `width` across and `height` high, as a matrix for a unit box. */
function beamMatrix(from, to, width, height) {
  along.set(to.x - from.x, to.y - from.y, to.z - from.z);
  const length = along.length();
  along.divideScalar(length);
  across.crossVectors(up, along).normalize();
  lift.crossVectors(along, across);
  return new THREE.Matrix4()
    .makeBasis(across.clone().multiplyScalar(width), lift.clone().multiplyScalar(height), along.multiplyScalar(length))
    .setPosition((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
}

/**
 * The fences of one place. `add` puts up a fence; `mesh` builds them all into one mesh once
 * they are up; `obstacles` holds a capsule for each stretch between two posts.
 */
export function createFences() {
  /** Every post, rail and gate bar: where it stands and its colour. */
  const pieces = [];
  const obstacles = [];

  /**
   * Puts up a fence through `points` ({ x, y, z } on the ground each, a post at every one), round
   * to the first again if `closed`. `gates` lists the stretches (by the post they start at) that
   * are a gate instead of two rails: three bars between two stiles, and a brace.
   */
  function add(points, { closed = false, gates = [] } = {}) {
    const count = points.length;
    const tangent = k => {
      const a = points[closed ? (k - 1 + count) % count : Math.max(0, k - 1)];
      const b = points[closed ? (k + 1) % count : Math.min(count - 1, k + 1)];
      return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    };
    for (let k = 0; k < count; k++) {
      const p = points[k];
      const axis = tangent(k);
      const rest = new THREE.Matrix4()
        .makeBasis(
          new THREE.Vector3().crossVectors(up, axis).multiplyScalar(POST.width),
          new THREE.Vector3(0, POST.height, 0),
          axis.clone().multiplyScalar(POST.width),
        )
        .setPosition(p.x, p.y + POST.height / 2 - POST.sunk, p.z);
      pieces.push({ rest, color: COLORS.post });
    }
    for (let k = 0; k < (closed ? count : count - 1); k++) {
      const p = points[k];
      const q = points[(k + 1) % count];
      const at = (t, h) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t + h, z: p.z + (q.z - p.z) * t });
      const bars = gates.includes(k)
        ? [
            ...[0.35, 0.7, 1.05].map(h => [at(0.06, h), at(0.94, h), 0.08, 0.1]),
            ...[0.06, 0.94].map(t => [at(t, 0.3), at(t, 1.1), 0.1, 0.1]),
            [at(0.06, 0.35), at(0.94, 1.05), 0.08, 0.1],
          ]
        : RAILS.map(h => [at(0, h), at(1, h), RAIL.width, RAIL.height]);
      const color = gates.includes(k) ? COLORS.gate : COLORS.rail;
      for (const [from, to, width, height] of bars) pieces.push({ rest: beamMatrix(from, to, width, height), color });
      obstacles.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, radius: 0.25 });
    }
  }

  return {
    add,
    /** The obstacles the fences put in the car's way, one for each stretch between two posts. */
    obstacles,
    /** All the fences as one mesh, once they are all up. */
    mesh() {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      geometry.deleteAttribute('uv');
      const mesh = new THREE.InstancedMesh(geometry, vertexColorMaterial, pieces.length);
      mesh.name = 'fences';
      const color = new THREE.Color();
      const white = new Float32Array(geometry.attributes.position.count * 3).fill(1);
      geometry.setAttribute('color', new THREE.BufferAttribute(white, 3));
      pieces.forEach((p, i) => {
        mesh.setMatrixAt(i, p.rest);
        mesh.setColorAt(i, color.set(p.color));
      });
      mesh.castShadow = mesh.receiveShadow = true;
      // The checks look at every piece, not only the first few copies.
      mesh.userData.whole = true;
      mesh.computeBoundingSphere();
      return mesh;
    },
  };
}
