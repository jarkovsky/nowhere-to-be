// Wooden paddock fences the car can knock down. Driven into at more than a walk, the stretch
// it hits tips over flat, away from the car, posts and all, with the stretch either side, and
// the car goes on through, a little slower. The animals keep to their paddock all the same. A
// stretch that has been knocked down stands up again a while later, once the car is well away.
// Every post, rail and gate bar is one copy of a box in a single instanced mesh, so a fence
// costs one draw call however long it is, and tipping a piece over only moves its copy.
import * as THREE from 'three';
import { penetration } from '../core/collision.js';
import { DEFAULT_BODY } from '../core/driving.js';
import { vertexColorMaterial } from './build.js';

/** Faster than this (m/s), the car knocks a fence over instead of stopping at it. */
export const KNOCK = 2;
/** How much of its speed the car keeps as it goes through. */
const KEEP = 0.8;
/** How long a piece takes to tip over, and how long it lies before it may stand up again. */
const FALL = 0.5;
export const LIE = 90;
/** It only stands up again with the car at least this far away, so nobody sees it happen. */
const AWAY = 45;
/** The rails' heights, the size of a rail and of a post, and how far a post is sunk into the ground. */
const RAILS = [0.55, 1.05];
const RAIL = { width: 0.09, height: 0.12 };
const POST = { width: 0.16, height: 1.4, sunk: 0.15 };
const COLORS = { post: '#8d7a5c', rail: '#9c8a6a', gate: '#c9bb9b' };

const up = new THREE.Vector3(0, 1, 0);
const along = new THREE.Vector3();
const across = new THREE.Vector3();
const lift = new THREE.Vector3();
const turn = new THREE.Matrix4();
const shift = new THREE.Matrix4();
const back = new THREE.Matrix4();
const matrix = new THREE.Matrix4();

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
 * they are up; `obstacles` holds a capsule for each stretch between two posts, which is switched
 * off (`off`) while it lies flat. Each frame `knock` (before the car is driven) knocks down
 * whatever the car is about to run into fast enough, and `update` tips falling pieces over and
 * stands knocked-down ones up again.
 */
export function createFences() {
  /** Every post, rail and gate bar: where it stands, and how it tips over (about `pivot`, along `axis`). */
  const pieces = [];
  /** Each stretch between two posts: its pieces, its obstacle and the posts at its ends. */
  const spans = [];
  const fences = [];
  let mesh = null;
  let time = 0;

  const piece = (rest, color, pivot, axis, rise) => {
    const index = pieces.length;
    pieces.push({ rest, color, pivot, axis, rise, fell: -1, side: 1, tilt: 0 });
    return index;
  };

  /**
   * Puts up a fence through `points` ({ x, y, z } on the ground each, a post at every one), round
   * to the first again if `closed`. `gates` lists the stretches (by the post they start at) that
   * are a gate instead of two rails: three bars between two stiles, and a brace.
   */
  function add(points, { closed = false, gates = [] } = {}) {
    const count = points.length;
    const fence = { spans: [], posts: [], closed, middle: { x: 0, z: 0 }, reach: 0 };
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
      // A post lies on top of the rails it fell with.
      fence.posts.push(piece(rest, COLORS.post, new THREE.Vector3(p.x, p.y, p.z), axis, 0.22));
    }
    for (let k = 0; k < (closed ? count : count - 1); k++) {
      const p = points[k];
      const q = points[(k + 1) % count];
      const pivot = new THREE.Vector3(p.x, p.y, p.z);
      const axis = new THREE.Vector3(q.x - p.x, q.y - p.y, q.z - p.z).normalize();
      const at = (t, h) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t + h, z: p.z + (q.z - p.z) * t });
      const bars = gates.includes(k)
        ? [
            ...[0.35, 0.7, 1.05].map(h => [at(0.06, h), at(0.94, h), 0.08, 0.1]),
            ...[0.06, 0.94].map(t => [at(t, 0.3), at(t, 1.1), 0.1, 0.1]),
            [at(0.06, 0.35), at(0.94, 1.05), 0.08, 0.1],
          ]
        : RAILS.map(h => [at(0, h), at(1, h), RAIL.width, RAIL.height]);
      const color = gates.includes(k) ? COLORS.gate : COLORS.rail;
      const span = {
        pieces: bars.map(([from, to, width, height]) =>
          piece(beamMatrix(from, to, width, height), color, pivot, axis, 0.07),
        ),
        obstacle: { ax: p.x, az: p.z, bx: q.x, bz: q.z, radius: 0.25 },
        posts: [fence.posts[k], fence.posts[(k + 1) % count]],
        normal: { x: -(q.z - p.z), z: q.x - p.x },
        middle: { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 },
      };
      const length = Math.hypot(span.normal.x, span.normal.z);
      span.normal.x /= length;
      span.normal.z /= length;
      fence.spans.push(span);
      spans.push(span);
    }
    for (const p of points) {
      fence.middle.x += p.x / count;
      fence.middle.z += p.z / count;
    }
    for (const p of points) fence.reach = Math.max(fence.reach, Math.hypot(p.x - fence.middle.x, p.z - fence.middle.z));
    fences.push(fence);
  }

  /** Where a piece is, tipped over by its tilt (0 standing, 1 flat on the ground) to its side. */
  function place(index) {
    const { rest, pivot, axis, rise, tilt, side } = pieces[index];
    if (tilt === 0) return mesh.setMatrixAt(index, rest);
    turn.makeRotationAxis(axis, side * tilt * (Math.PI / 2));
    shift.makeTranslation(pivot.x, pivot.y + rise * tilt, pivot.z);
    back.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
    mesh.setMatrixAt(index, matrix.multiplyMatrices(shift, turn).multiply(back).multiply(rest));
  }

  /** Knocks down the stretch `k` of `fence` and the stretch either side, falling to `side` of it. */
  function knockDown(fence, k, side) {
    const count = fence.spans.length;
    for (const d of [-1, 0, 1]) {
      const j = fence.closed ? (k + d + count) % count : k + d;
      const span = fence.spans[j];
      if (!span) continue;
      span.obstacle.off = true;
      // The stretch hit goes first, the ones beside it a moment later.
      const delay = Math.abs(d) * 0.08;
      for (const index of span.pieces) fall(index, side, delay);
      if (d === 0) for (const index of span.posts) fall(index, side, 0.05);
    }
  }

  function fall(index, side, delay) {
    const p = pieces[index];
    if (p.fell >= 0) return;
    p.fell = time + delay;
    p.side = side;
  }

  return {
    add,
    /** The obstacles the fences put in the car's way, one for each stretch between two posts. */
    get obstacles() {
      return spans.map(span => span.obstacle);
    },
    /** All the fences as one mesh, once they are all up. */
    mesh() {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      geometry.deleteAttribute('uv');
      mesh = new THREE.InstancedMesh(geometry, vertexColorMaterial, pieces.length);
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
    /**
     * Before the car is driven for `dt` seconds: knocks down whatever stretch it is about to run
     * into, if it is going fast enough, and slows it a little. True if it knocked one down.
     */
    knock(state, dt) {
      const speed = Math.hypot(state.vx, state.vz);
      if (speed < KNOCK) return false;
      const { radius, offsets, reach } = state.body ?? DEFAULT_BODY;
      const x = state.x + state.vx * dt;
      const z = state.z + state.vz * dt;
      const sin = Math.sin(state.heading);
      const cos = Math.cos(state.heading);
      let knocked = false;
      for (const fence of fences) {
        if (Math.hypot(x - fence.middle.x, z - fence.middle.z) > fence.reach + reach + radius + 1) continue;
        fence.spans.forEach((span, k) => {
          if (span.obstacle.off) return;
          for (const offset of offsets) {
            if (!penetration(x - sin * offset, z - cos * offset, radius + 0.05, span.obstacle)) continue;
            knockDown(fence, k, Math.sign(state.vx * span.normal.x + state.vz * span.normal.z) || 1);
            knocked = true;
            return;
          }
        });
      }
      if (knocked) {
        state.vx *= KEEP;
        state.vz *= KEEP;
        state.speed *= KEEP;
      }
      return knocked;
    },
    /** Tips falling pieces over, and stands up those that have lain long enough with `player` well away. */
    update(dt, player) {
      time += dt;
      if (!mesh) return;
      let moved = false;
      pieces.forEach((p, i) => {
        if (p.fell < 0) return;
        if (p.tilt < 1) {
          const t = Math.max(0, time - p.fell) / FALL;
          p.tilt = Math.min(1, t * t);
          place(i);
          moved = true;
        } else if (time - p.fell > LIE && Math.hypot(player.x - p.pivot.x, player.z - p.pivot.z) > AWAY) {
          p.fell = -1;
          p.tilt = 0;
          place(i);
          moved = true;
        }
      });
      // A stretch stops the car again once its rails are back up.
      for (const span of spans)
        if (span.obstacle.off && span.pieces.every(i => pieces[i].fell < 0)) span.obstacle.off = false;
      if (moved) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
