// The crash site: a small vintage high-wing plane that came down in the meadow long ago and slid
// on its belly, nose low, with a bent propeller and one wing torn off and lying a little way
// back. Its paint has faded, and the grass and wildflowers have grown up round it. Behind it
// runs a long scar of torn earth, with a few panels and a wheel scattered along it.
import * as THREE from 'three';
import { createRandom, valueNoise } from '../../core/math.js';
import { CRASH } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, vertexColorMaterial } from '../build.js';
import { framer } from './frame.js';

const CREAM = '#e3d6b4';
const RED = '#a9483b';
const GLASS = '#44535a';
const METAL = '#8d8f88';
const DARK = '#2c2b29';
const EARTH = ['#6d4f34', '#85633f', '#5f452d'];

/** How far each wing reaches from the side of the fuselage. */
const SPAN = 5.2;
const CHORD = 1.45;
/** The tail sticks up this far above the ground, in the plane's own frame. */
const BELLY = 0.12;
/** The plane is built life size, then made a fifth bigger, so it can be made out from far along the track. */
const SIZE = 1.2;

/**
 * A wing, flat, from its root at x = 0 out to `length`, a little thicker towards the root and
 * with a faded red tip. `side` is 1 or -1: which way it points.
 */
function wing(parts, at, side, { length = SPAN, tip = true } = {}) {
  const [thick, tipLength] = [0.14, 0.55];
  const body = length - (tip ? tipLength : 0);
  parts.box(body, thick, CHORD, CREAM, at(side * (body / 2), 0, 0));
  if (tip) parts.box(tipLength, thick - 0.02, CHORD - 0.04, RED, at(side * (body + tipLength / 2), 0, 0));
}

/** The plane, built in its own frame: belly on the ground at y = 0, nose towards +Z, left wing to +X. */
function planeParts(parts) {
  const at = (x, y, z, extra = {}) => ({ x, y, z, ...extra });
  // Cabin, with the cowling in front of it and the tail boom behind, each a little narrower.
  parts.box(1.2, 1.35, 2.6, CREAM, at(0, BELLY + 0.675, 0.1));
  parts.box(1.1, 1.0, 1.5, CREAM, at(0, BELLY + 0.5, 2.15));
  parts.box(0.96, 1.05, 1.7, CREAM, at(0, BELLY + 0.62, -2.05));
  parts.box(0.7, 0.8, 1.5, CREAM, at(0, BELLY + 0.7, -3.5));
  parts.box(0.46, 0.55, 1.1, CREAM, at(0, BELLY + 0.78, -4.6));
  // A faded red stripe all the way along, a little proud of the paint, and dark windows.
  for (const side of [-1, 1]) {
    parts.box(0.03, 0.14, 2.6, RED, at(side * 0.6, BELLY + 0.62, 0.1));
    parts.box(0.03, 0.14, 1.5, RED, at(side * 0.55, BELLY + 0.5, 2.15));
    parts.box(0.03, 0.12, 1.7, RED, at(side * 0.49, BELLY + 0.6, -2.05));
    parts.box(0.03, 0.12, 1.5, RED, at(side * 0.355, BELLY + 0.68, -3.5));
    parts.box(0.03, 0.55, 1.35, GLASS, at(side * 0.6, BELLY + 1.0, 0.45));
    parts.box(0.03, 0.5, 0.7, GLASS, at(side * 0.6, BELLY + 1.0, -0.85));
  }
  // The windscreen, raked back.
  parts.box(1.02, 0.5, 0.05, GLASS, at(0, BELLY + 1.38, 1.4, { rx: -0.5 }));
  // The nose: a dark intake in the cowling, a red cap and the spinner, set back a little where it struck.
  parts.box(0.8, 0.5, 0.04, DARK, at(0, BELLY + 0.4, 2.92));
  parts.box(1.14, 0.18, 1.56, RED, at(0, BELLY + 0.9, 2.15));
  parts.add(new THREE.ConeGeometry(0.3, 0.5, 8), METAL, at(0, BELLY + 0.55, 3.2, { rx: Math.PI / 2 }));
  // The propeller: one blade standing up, bent over at its tip; the other broken off short.
  parts.box(0.14, 1.0, 0.05, DARK, at(0, BELLY + 1.05, 3.35));
  parts.box(0.14, 0.45, 0.05, DARK, at(0, BELLY + 1.7, 3.3, { rx: -0.7 }));
  parts.box(0.14, 0.3, 0.05, DARK, at(0, BELLY + 0.3, 3.35));
  // The middle of the wing over the cabin, and the wing that is left, on a strut.
  parts.box(1.2, 0.14, CHORD, CREAM, at(0, BELLY + 1.42, 0.1));
  wing(parts, (x, y, z, extra) => at(x + 0.6, BELLY + 1.42 + y, z + 0.1, extra), 1);
  parts.beam({ x: 0.6, y: BELLY + 0.3, z: 0.1 }, { x: 2.6, y: BELLY + 1.36, z: 0.1 }, 0.07, METAL);
  // Where the other came off: a stump of wing, torn across, with ribs showing.
  parts.box(0.55, 0.14, CHORD, CREAM, at(-0.88, BELLY + 1.42, 0.1));
  for (const z of [-0.5, 0, 0.5]) {
    parts.box(0.34, 0.06, 0.05, METAL, at(-1.35, BELLY + 1.45, 0.1 + z + 0.04 * Math.sign(z), { rz: 0.2 * z }));
  }
  // The tail: a fin that is still straight, with a red rudder, and the tailplane, one side bent down.
  parts.box(0.1, 1.5, 1.1, CREAM, at(0, BELLY + 1.5, -4.35, { rx: 0.0 }));
  parts.box(0.12, 1.25, 0.5, RED, at(0, BELLY + 1.62, -5.15));
  parts.box(1.5, 0.12, 0.8, CREAM, at(0.85, BELLY + 0.95, -4.65));
  parts.box(1.5, 0.12, 0.8, CREAM, at(-0.95, BELLY + 0.9, -4.65, { rz: 0.3 }));
  // The undercarriage: a wheel still on its bent leg on the left, folded back under the wing.
  parts.box(0.09, 0.9, 0.14, METAL, at(0.9, BELLY + 0.1, 0.55, { rz: -0.9 }));
  parts.add(
    new THREE.CylinderGeometry(0.33, 0.33, 0.2, 10),
    DARK,
    at(1.45, BELLY + 0.1, 0.6, { rz: Math.PI / 2 - 0.15 }),
  );
  parts.add(
    new THREE.CylinderGeometry(0.15, 0.15, 0.24, 8),
    METAL,
    at(1.45, BELLY + 0.1, 0.6, { rz: Math.PI / 2 - 0.15 }),
  );
}

/** Parts of the plane laid in the world: settled on the slope, nose low. */
function settle(parts, from, { x, z, rotation }, ground = terrainHeight) {
  const [nose, tail] = [3 * SIZE, -4.5 * SIZE].map(lz => {
    const p = framer({ x, z, rotation }, 0).local(0, lz);
    return ground(p.x, p.z);
  });
  // The ground falls away to the nose; the plane lies along it, a little more nose-down.
  const pitch = Math.atan2(tail - nose, 7.5 * SIZE) + 0.05;
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, ground(x, z) - BELLY * SIZE - 0.04, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, rotation, 0, 'YXZ')),
    new THREE.Vector3(SIZE, SIZE, SIZE),
  );
  for (const part of parts.parts.slice(from)) part.applyMatrix4(matrix);
}

/** The wreck on its own at the origin, nose low and facing -Z like the other models, for the viewer. */
export function wreckedPlane() {
  const parts = new PartsBuilder({ bevel: 0.04 });
  planeParts(parts);
  settle(parts, 0, { x: 0, z: 0, rotation: Math.PI }, () => 0);
  return new THREE.Mesh(parts.geometry(), vertexColorMaterial);
}

/** The torn-off wing, lying on the ground. */
function looseWing(parts, obstacles) {
  const { x, z, rotation } = CRASH.wing;
  const y = terrainHeight(x, z);
  const frame = framer({ x, z, rotation }, y);
  // Its root end faces the plane, torn across; it lies on its side edge on a tussock, tilted.
  const start = parts.parts.length;
  wing(parts, (lx, ly, lz, extra) => ({ x: lx - SPAN / 2, y: ly + 0.16, z: lz, ...extra }), 1);
  const turn = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, rotation, 0, 'YXZ')),
    new THREE.Vector3(SIZE, SIZE, SIZE),
  );
  for (const part of parts.parts.slice(start)) part.applyMatrix4(turn);
  obstacles.push({
    ...frame.local(0, 0),
    halfX: (SPAN / 2 + 0.2) * SIZE,
    halfZ: (CHORD / 2 + 0.2) * SIZE,
    rotation,
    radius: 0,
  });
}

/** A strip of torn earth along the scar, narrowest where the plane first touched down, with a berm of earth along each side. */
function scar(parts) {
  const random = createRandom(4513);
  const path = CRASH.scar;
  const step = 1.6;
  const halfWidth = s => 1.55 - 0.85 * (s / path.length) + 0.12 * Math.sin(s * 0.9);
  const rows = [];
  for (let s = 0; s <= path.length; s += step) {
    const left = path.offset(s, -halfWidth(s));
    const right = path.offset(s, halfWidth(s));
    rows.push([left, right].map(p => [p.x, terrainHeight(p.x, p.z) + 0.03, p.z]));
  }
  const positions = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const [[l0, r0], [l1, r1]] = [rows[i], rows[i + 1]];
    for (const tri of [
      [l0, r0, l1],
      [r0, r1, l1],
    ]) {
      // Wound so that the strip faces up, whichever side is which.
      const [a, b, c] = tri;
      const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      for (const corner of up > 0 ? tri : [a, c, b]) positions.push(...corner);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  // Patches of lighter and darker earth, a couple of metres across.
  parts.add(geometry, (x, y, z) => EARTH[Math.floor(valueNoise(x / 2.2, z / 2.2, 5) * EARTH.length * 0.999)]);
  // Banks of turned earth either side, and clods in the furrow.
  const clod = new THREE.IcosahedronGeometry(1, 0);
  for (let s = 1; s < path.length; s += 2.2 + random() * 1.4) {
    const side = random() < 0.5 ? -1 : 1;
    const p = path.offset(s, side * (halfWidth(s) + 0.1 + random() * 0.3));
    const size = 0.35 + random() * 0.4 * (1 - 0.5 * (s / path.length));
    parts.add(clod, EARTH[Math.floor(random() * 3)], {
      x: p.x,
      y: terrainHeight(p.x, p.z) - 0.12,
      z: p.z,
      sx: size * 1.4,
      sy: 0.05 + size * 0.07,
      sz: size,
      ry: random() * 3,
    });
  }
  for (let k = 0; k < 14; k++) {
    const p = path.offset(random() * path.length, (random() - 0.5) * 1.8);
    const size = 0.1 + random() * 0.15;
    parts.add(clod, EARTH[2], {
      x: p.x,
      y: terrainHeight(p.x, p.z),
      z: p.z,
      sx: size,
      sy: size * 0.5,
      sz: size,
      ry: k,
    });
  }
}

/** Panels of the plane's skin lying about, and a wheel that came off. */
function debris(parts, obstacles) {
  const random = createRandom(4517);
  CRASH.panels.forEach(({ x, z, rotation }, i) => {
    const y = terrainHeight(x, z);
    const [w, d] = [0.6 + random() * 0.4, 0.5 + random() * 0.3];
    // Lying almost flat, a little tipped.
    const lean = 0.05;
    parts.box(w, 0.04, d, i % 3 === 0 ? RED : CREAM, {
      x,
      y: y + 0.02 + (w / 2) * Math.sin(lean),
      z,
      ry: rotation,
      rz: lean,
    });
  });
  const { x, z } = CRASH.wheel;
  const y = terrainHeight(x, z);
  parts.add(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 10), DARK, { x, y: y + 0.1, z, rz: 0.12 });
  parts.add(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 8), METAL, { x, y: y + 0.1, z, rz: 0.12 });
  parts.box(0.09, 0.8, 0.14, METAL, { x: x + 0.45, y: y + 0.1, z, ry: 0.5, rz: Math.PI / 2 - 0.05 });
  obstacles.push({ x, z, radius: 0.5 });
}

/** Tall grass and wildflowers grown up round the plane and along its scar. */
function wildlife(parts) {
  const random = createRandom(4519);
  const tuft = new THREE.ConeGeometry(0.07, 1, 3);
  const bloom = new THREE.IcosahedronGeometry(0.08, 0);
  const flowers = ['#e1b73b', '#efe7d2', '#8b60a9', '#d9782c', '#d9d36a'];
  const grass = ['#c9a64a', '#a8914a', '#8c8f48', '#d2b55b'];
  const { x: cx, z: cz, rotation } = CRASH;
  const { local } = framer({ x: cx, z: cz, rotation });
  /** True where the plane, its wing or its scar lie, which the grass leaves bare. */
  const bare = (x, z) =>
    CRASH.scar.isNear(x, z, 1.7) ||
    Math.hypot(x - CRASH.wing.x, z - CRASH.wing.z) < 3.4 ||
    Math.hypot(x - cx, z - cz) < 1.5;
  const spot = () => {
    for (;;) {
      // Thickest round the plane, thinning out along the scar.
      const a = random() * Math.PI * 2;
      const r = 1.3 + Math.sqrt(random()) * 13;
      const p =
        random() < 0.3
          ? CRASH.scar.offset(random() * CRASH.scar.length, (random() - 0.5) * 7)
          : { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
      if (!bare(p.x, p.z)) return p;
    }
  };
  for (let k = 0; k < 90; k++) {
    // Along the plane's flanks the tufts grow right up against it, in a row under each wing.
    const p =
      k < 24 ? local((k % 2 ? 1 : -1) * (1.1 + random() * 0.8), (-3.4 + (k / 24) * 7 + random()) * SIZE) : spot();
    if (bare(p.x, p.z) && k >= 24) continue;
    const y = terrainHeight(p.x, p.z);
    const height = 0.7 + random() * 0.7;
    for (let blade = 0; blade < 3; blade++) {
      parts.add(tuft, grass[Math.floor(random() * grass.length)], {
        x: p.x + (random() - 0.5) * 0.3,
        y: y + height / 2 - 0.15,
        z: p.z + (random() - 0.5) * 0.3,
        sy: height * (0.8 + random() * 0.4),
        rx: (random() - 0.5) * 0.25,
        rz: (random() - 0.5) * 0.25,
      });
    }
  }
  for (let k = 0; k < 75; k++) {
    const p = spot();
    const y = terrainHeight(p.x, p.z);
    const height = 0.35 + random() * 0.4;
    parts.box(0.03, height, 0.03, '#6f8a45', { x: p.x, y: y + height / 2 - 0.02, z: p.z });
    parts.add(bloom, flowers[Math.floor(random() * flowers.length)], { x: p.x, y: y + height, z: p.z, sy: 0.7 });
  }
}

export function buildCrash(scene, obstacles) {
  const parts = new PartsBuilder();
  // The plane: built in its own frame, then settled onto the slope.
  const plane = new PartsBuilder({ bevel: 0.04 });
  planeParts(plane);
  settle(plane, 0, CRASH);
  parts.parts.push(...plane.parts);
  looseWing(parts, obstacles);
  scar(parts);
  debris(parts, obstacles);
  wildlife(parts);
  // The fuselage from the tail to the nose, the wing and the tailplane.
  const { local } = framer(CRASH);
  const [tail, nose] = [local(0, -4.9 * SIZE), local(0, 3.1 * SIZE)];
  obstacles.push({ ax: tail.x, az: tail.z, bx: nose.x, bz: nose.z, radius: 0.75 * SIZE });
  obstacles.push({
    ...local(3.3 * SIZE, 0.1 * SIZE),
    halfX: (SPAN / 2 + 0.2) * SIZE,
    halfZ: (CHORD / 2 + 0.1) * SIZE,
    rotation: CRASH.rotation,
    radius: 0,
  });
  obstacles.push({
    ...local(0, -4.65 * SIZE),
    halfX: 1.8 * SIZE,
    halfZ: 0.5 * SIZE,
    rotation: CRASH.rotation,
    radius: 0,
  });
  scene.add(parts.mesh());
}
