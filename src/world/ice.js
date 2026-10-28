// Ice on the rivers in the winter: white-blue sheets along both banks with a ragged inner edge,
// and a few flat floes drifting slowly down the middle, or lying still in the pools. Both are
// scaled by how wintry it is (see winterness in layout.js), so they fade in with the snow, and
// both keep clear of the fords and the bridges (the river's `engineered`), so the water there is
// water to drive through. Nothing here is solid: the car drives over the sheets as over the water.
import * as THREE from 'three';
import { createRandom, smoothstep, valueNoise } from '../core/math.js';
import { RIVERS, winterness } from './layout.js';
import { riverLevel } from './terrain.js';

const SHEET = new THREE.Color('#e4effc');
const RIM = new THREE.Color('#b9d0ee');
const ICE = new THREE.MeshLambertMaterial({
  color: '#ffffff',
  vertexColors: true,
  emissive: '#7f9fd0',
  emissiveIntensity: 0.25,
  side: THREE.DoubleSide,
});

/** How much of the river's width ice may take at `s`: none under a crossing, and more well away from one. */
const clearOf = (river, s) => 1 - smoothstep(river.engineered(s), 0.05, 0.6);

/** The sheets of ice along the banks of a river, as a ribbon on each side, or null where there is no winter. */
function sheets(river) {
  const positions = [];
  const colors = [];
  const indices = [];
  const tone = new THREE.Color();
  for (const side of [-1, 1]) {
    let previous = -1;
    for (const { x, z, dx, dz, s } of river.path.samples) {
      const reach = winterness(x, z) * clearOf(river, s);
      if (reach < 0.03) {
        previous = -1;
        continue;
      }
      const half = river.halfWidth(s);
      // Under the bank, out of sight, to a ragged edge in the stream: wider in some places than in others.
      const wide = 0.2 + 0.4 * valueNoise(s / 14, side * 3.7, 211);
      const ragged = 0.18 * (valueNoise(s / 1.7, side * 5.3, 223) - 0.5) * half;
      const inner = half * (1.05 - wide * reach) + ragged * reach;
      const outer = half * 1.1 + 1;
      const y = riverLevel(river, s) + 0.07;
      const row = positions.length / 3;
      for (const [across, shade] of [
        [outer, 0],
        [(outer + inner) / 2, 0.15],
        [inner, 1],
      ]) {
        positions.push(x - dz * across * side, y, z + dx * across * side);
        colors.push(
          ...tone
            .copy(SHEET)
            .lerp(RIM, shade * 0.8)
            .toArray(),
        );
      }
      if (previous >= 0) {
        for (const k of [0, 1]) {
          const [a, b, c, d] = [previous + k, previous + k + 1, row + k, row + k + 1];
          indices.push(a, c, b, b, c, d);
        }
      }
      previous = row;
    }
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  // Flat, facing up whichever way each side's strip was wound.
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      positions.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  return geometry;
}

/** Ice on the rivers that run through the winter. Returns `update(dt, eye)`, which moves the floes. */
export function buildIce(scene) {
  const random = createRandom(9137);
  const floes = [];
  for (const river of RIVERS) {
    const geometry = sheets(river);
    if (geometry) {
      const mesh = new THREE.Mesh(geometry, ICE);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    const { length, spacing } = river.path;
    for (let tries = 0, made = 0; made < length / 75 && tries < length; tries++) {
      const s = random() * length;
      const near = river.path.at(s);
      if (winterness(near.x, near.z) < 0.6 || clearOf(river, s) < 0.9) continue;
      floes.push({
        river,
        s,
        spacing,
        length,
        side: (random() * 2 - 1) * 0.35,
        size: 0.8 + random() * 1.3,
        squash: 0.7 + random() * 0.5,
        turn: random() * 6.3,
        spin: (random() - 0.5) * 0.1,
        x: near.x,
        z: near.z,
      });
      made++;
    }
  }
  if (!floes.length) return { update() {} };
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.9, 0.14, 7), ICE, floes.length);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(floes.length * 3).fill(1), 3);
  mesh.frustumCulled = false;
  mesh.count = floes.length;
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  floes.forEach((floe, i) => mesh.setColorAt(i, SHEET));
  /** Moves a floe on by `dt` seconds and puts it in its place. */
  const move = (floe, i, dt) => {
    const { river } = floe;
    const flow = river.flow(floe.s);
    // They drift on slowly where the water runs and lie still where it is slow.
    floe.s = (floe.s + dt * 0.35 * smoothstep(flow, 0.7, 1.3) * flow) % floe.length;
    floe.turn += dt * floe.spin;
    const p = river.path.offset(floe.s, floe.side * river.halfWidth(floe.s));
    floe.x = p.x;
    floe.z = p.z;
    // Gone before it reaches a ford or a bridge, and as the winter ends.
    const size = floe.size * winterness(p.x, p.z) * smoothstep(clearOf(river, floe.s), 0.8, 1);
    dummy.position.set(p.x, riverLevel(river, floe.s) + 0.04, p.z);
    dummy.rotation.set(0, floe.turn, 0);
    dummy.scale.set(size, 1, size * floe.squash);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  floes.forEach((floe, i) => move(floe, i, 0));
  return {
    update(dt, eye) {
      floes.forEach((floe, i) => {
        if ((floe.x - eye.x) ** 2 + (floe.z - eye.z) ** 2 < 250 * 250) move(floe, i, dt);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
