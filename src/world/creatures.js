// The parts animals are built from: rounded lumps for bodies, heads and muscles, round limbs
// that taper, and cones for ears, horns and beaks, all shaded smoothly, so the animals look
// soft and rounded rather than built from blocks. Like the animals, they face +X. Each takes a
// PartsBuilder and returns it, so they chain.
import * as THREE from 'three';
import { flatMaterial } from './build.js';

/** Animals are shaded smoothly, so the light runs round their rounded shapes. */
export const furMaterial = flatMaterial('#ffffff', { vertexColors: true, flatShading: false });

const BALL = new THREE.IcosahedronGeometry(1, 1);
/** For small things, eyes and noses, a plainer ball is enough. */
const BEAD = new THREE.IcosahedronGeometry(1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const way = new THREE.Vector3();
const middle = new THREE.Vector3();
const turn = new THREE.Quaternion();
const squash = new THREE.Vector3();
const matrix = new THREE.Matrix4();

const sizes = size => (typeof size === 'number' ? [size, size, size] : size);

/**
 * A rounded lump at `at` ([x, y, z]), `size` its radius or its three radii [x, y, z], tipped
 * nose up by `tilt`, turned by `yaw` and rolled by `roll` (radians). `color` may be a colour or
 * `color(x, y, z)` for patterns (see PartsBuilder.add).
 */
export function lump(p, color, at, size, { tilt = 0, yaw = 0, roll = 0 } = {}) {
  const [x, y, z] = at;
  const [sx, sy, sz] = sizes(size);
  return p.add(sx < 0.08 ? BEAD : BALL, color, { x, y, z, sx, sy, sz, rz: tilt, ry: yaw, rx: roll });
}

/** The matrix that stands a shape built up its Y from 0 to `length` along the way from `a` to `b`. */
function along(a, b, flat = 1) {
  way.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const length = way.length();
  turn.setFromUnitVectors(UP, way.divideScalar(length));
  middle.set(a[0], a[1], a[2]);
  return { length, matrix: matrix.compose(middle, turn, squash.set(1, 1, flat)) };
}

/** A round limb from `a` to `b` ([x, y, z] each), `ra` thick at a, tapering to `rb` at b. */
export function tube(p, color, a, b, ra, rb = ra, sides = 7) {
  const { length, matrix: placed } = along(a, b);
  const geometry = new THREE.CylinderGeometry(rb, ra, length, sides, 1).translate(0, length / 2, 0);
  return p.add(geometry, color, placed);
}

/**
 * A cone from its base at `a` to its point at `b`, `radius` round its base and squashed to
 * `flat` of that one way across, for ears, horns, beaks and tufts.
 */
export function cone(p, color, a, b, radius, flat = 1, sides = 6) {
  const { length, matrix: placed } = along(a, b, flat);
  return p.add(new THREE.ConeGeometry(radius, length, sides, 1).translate(0, length / 2, 0), color, placed);
}

/** A pair of anything, built by `make(side)` for side -1 and 1 (the animal's right and left, along Z). */
export function pair(p, make) {
  make(-1);
  make(1);
  return p;
}

/** Two dark eyes at (x, y) on either side of the head, `apart` from the middle. */
export function eyes(p, x, y, apart, size = 0.045, color = '#1f211f') {
  return pair(p, side => lump(p, color, [x, y, side * apart], [size * 0.8, size, size]));
}

/**
 * A leg hanging from its hip (the origin, or `at`) to the ground `length` below: a muscle at
 * its top, which carries on up inside the body, round down to the knee and thinner below it,
 * ending in a hoof or a paw of `foot` colour, `hoof` of the way up the leg. `knee` moves the
 * knee forward (or back, if negative) of the line down.
 */
export function leg(
  p,
  color,
  { length, top, bottom = top * 0.55, foot = color, hoof = 0.1, knee = 0, at = [0, 0, 0] },
) {
  const [x, y, z] = at;
  const point = (dx, dy) => [x + dx, y + dy, z];
  const ankle = -length + length * hoof;
  const bend = point(knee * length, -length * 0.5);
  lump(p, color, point(0, top), [top * 1.3, top * 2.2, top * 1.2]);
  tube(p, color, point(0, 0), bend, top, bottom * 1.1);
  lump(p, color, bend, bottom * 1.08);
  tube(p, color, bend, point(0, ankle), bottom * 1.1, bottom);
  return tube(p, foot, point(0, ankle), point(0, -length), bottom * 1.05, bottom * 1.25);
}

const WOOL = ['#eee4c9', '#e4d8b8'];
/** The lumps of wool round a sheep's body, as [x, y, z, radius] for a fleece of size 1. */
const TUFTS = [
  [0.55, 0.15, 0.22, 0.4],
  [0.5, 0.1, -0.25, 0.38],
  [-0.05, 0.3, 0.24, 0.4],
  [-0.1, 0.3, -0.2, 0.4],
  [-0.62, 0.12, 0.18, 0.4],
  [-0.6, 0.08, -0.24, 0.38],
  [0.05, -0.12, 0.36, 0.38],
  [0.05, -0.12, -0.36, 0.38],
];

/** A sheep's fleece, soft lumps of wool round (0, y, 0), about 2 m long for `size` 1. */
export function fleece(p, y, size) {
  lump(p, WOOL[0], [0, y, 0], [size, 0.6 * size, 0.6 * size]);
  TUFTS.forEach(([x, dy, z, r], k) => lump(p, WOOL[k % 2], [x * size, y + dy * size, z * size], r * size));
  return p;
}

/** A sheep's dark face from the top of its neck at the origin, with a cap of wool and ears out to the sides. */
export function sheepFace(p, size, face = '#394439') {
  lump(p, face, [0.14 * size, 0, 0], [0.26 * size, 0.21 * size, 0.19 * size], { tilt: -0.2 });
  tube(p, face, [0.22 * size, -0.02 * size, 0], [0.5 * size, -0.12 * size, 0], 0.15 * size, 0.1 * size);
  lump(p, WOOL[0], [0.02 * size, 0.16 * size, 0], [0.2 * size, 0.15 * size, 0.18 * size]);
  eyes(p, 0.26 * size, 0.08 * size, 0.15 * size, 0.035 * size, '#d9cfb3');
  return pair(p, side =>
    cone(
      p,
      face,
      [0.08 * size, 0.06 * size, side * 0.14 * size],
      [0.02 * size, 0.02 * size, side * 0.42 * size],
      0.08 * size,
      0.45,
    ),
  );
}
