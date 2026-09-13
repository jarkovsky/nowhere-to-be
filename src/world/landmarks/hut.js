// Masarykova chata: a timber mountain hut on the shoulder of Šerlich, the way
// huts look in the Orlické hory. Stone ground floor, dark boarded upper floor,
// a steep roof, white window frames, smoke from the stove and a Czech flag.
// The track up to it is waymarked with red-white-red stripes.
import * as THREE from 'three';
import { CHATA, TRACKS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame, gableRoof, gableEnds, createSmoke } from '../build.js';

const STONE = '#9d998c';
const TIMBER = '#6b4a33';
const FRAME = '#f1ede2';
const LIT = '#e8cf8a';

/** Red-white-red waymarks, Czech style, on posts beside a track. */
function addWaymarks(parts, path) {
  for (let s = 8; s < path.length - 4; s += 24) {
    const p = path.offset(s, (Math.round(s / 24) % 2 ? 1 : -1) * 3);
    const y = terrainHeight(p.x, p.z);
    parts.box(0.22, 1.5, 0.22, '#7d6a4f', { x: p.x, y: y + 0.55, z: p.z });
    const marks = [
      [1.06, FRAME],
      [0.98, '#c8302a'],
      [0.9, FRAME],
    ];
    for (const [h, color] of marks) parts.box(0.24, 0.08, 0.24, color, { x: p.x, y: y + h, z: p.z });
  }
}

/** The flag: white over red, with a blue triangle at the hoist. Thin boxes, so it shows from both sides. */
function czechFlag(parts, x, y, z, rotation) {
  const local = localFrame(x, z, rotation);
  const width = 1.8;
  const height = 1.2;
  for (const [lx, color] of [
    [width / 2, FRAME],
    [width / 2, '#c8302a'],
  ]) {
    const p = local(lx, 0);
    const top = color === FRAME;
    parts.box(width, height / 2, 0.03, color, {
      x: p.x,
      y: y + (top ? height / 4 : -height / 4),
      z: p.z,
      ry: rotation,
    });
  }
  const wedge = new THREE.BufferGeometry();
  const t = 0.02;
  // A triangular prism: hoist edge to the middle of the flag, on both faces.
  const tri = [
    [0, height / 2, t],
    [0, -height / 2, t],
    [width / 2, 0, t],
    [0, -height / 2, -t],
    [0, height / 2, -t],
    [width / 2, 0, -t],
  ];
  wedge.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
  wedge.computeVertexNormals();
  const hoist = local(0, 0);
  parts.add(wedge, '#2b5a9c', { x: hoist.x, y, z: hoist.z, ry: rotation });
}

export function buildHut(scene, obstacles) {
  const parts = new PartsBuilder();
  const { x, z, rotation } = CHATA;
  const y = terrainHeight(x, z);
  const local = localFrame(x, z, rotation);
  const at = (lx, ly, lz, extra = {}) => ({ ...local(lx, lz), y: y + ly, ry: rotation, ...extra });
  const across = { ry: rotation + Math.PI / 2 }; // roof pieces run along the hut's length (local X)
  const length = 14;
  const depth = 9;

  // Stone ground floor on a plinth, boarded upper floor, steep roof along the hut.
  parts.box(length + 0.6, 0.6, depth + 0.6, '#8a877c', at(0, 0, 0));
  parts.box(length, 3, depth, STONE, at(0, 1.6, 0));
  parts.box(length + 0.2, 2.8, depth + 0.2, TIMBER, at(0, 4.5, 0));
  for (let ly = 3.3; ly < 5.9; ly += 0.5) parts.box(length + 0.24, 0.05, depth + 0.24, '#5c3f2b', at(0, ly, 0));
  parts.add(gableEnds(depth + 0.2, length + 0.2, 5.9, 11.2), TIMBER, at(0, 0, 0, across));
  parts.add(gableRoof(depth + 0.2, length + 0.2, 5.85, 11.3, 0.7), '#4f4844', at(0, 0, 0, across));

  // Windows with white frames: small ones below, a row above, two in each gable.
  const window = (lx, ly, lz, onGable, w = 1, h = 1.1) => {
    const turn = onGable ? { ry: rotation + Math.PI / 2 } : {};
    parts.box(w + 0.3, h + 0.3, 0.1, FRAME, at(lx, ly, lz, turn));
    parts.box(w, h, 0.14, LIT, at(lx, ly, lz, turn));
    parts.box(0.08, h, 0.18, FRAME, at(lx, ly, lz, turn)); // glazing bar
  };
  for (const lz of [depth / 2 + 0.06, -depth / 2 - 0.06]) {
    for (const lx of [-5, -2.6, 2.6, 5]) window(lx, 1.8, lz, false, 0.8, 0.9);
    // The middle of the front carries the name board instead of a window.
    for (const lx of [-5.2, -2.6, 2.6, 5.2]) window(lx, 4.5, lz + Math.sign(lz) * 0.1, false);
  }
  window(0, 4.5, -depth / 2 - 0.16, false);
  for (const lx of [length / 2 + 0.16, -length / 2 - 0.16]) {
    for (const lz of [-1.3, 1.3]) window(lx, 7.2, lz, true, 0.9, 1);
    window(lx, 9.2, 0, true, 0.7, 0.8);
  }

  // A gabled porch over the front door.
  const porch = depth / 2 + 1.4;
  parts.box(1.3, 2.2, 0.14, '#4c3a2a', at(0, 1.4, depth / 2 + 0.07)); // door
  for (const lx of [-1.3, 1.3]) parts.box(0.22, 2.6, 0.22, TIMBER, at(lx, 1.6, porch));
  parts.add(gableRoof(3.2, 2.8, 2.9, 4.1, 0.2), '#4f4844', at(0, 0, depth / 2 + 1.3));
  parts.box(3.4, 0.24, 3, '#a39f92', at(0, 0.32, depth / 2 + 1.3)); // step

  // Chimney, benches and a table out front.
  parts.box(1, 3.2, 1, STONE, at(3.2, 11, -1.4));
  for (const lx of [-5, 4.6]) {
    // Out here the ground starts to slope away from the level pad, so each set stands on its own spot.
    const spot = local(lx, depth / 2 + 4.1);
    const rise = terrainHeight(spot.x, spot.z) - y - 0.05;
    parts.box(2.4, 0.12, 0.5, '#8a6446', at(lx, rise + 0.62, depth / 2 + 3.2));
    parts.box(2.4, 0.1, 1, '#8a6446', at(lx, rise + 1.02, depth / 2 + 4.1));
    parts.box(2.4, 0.12, 0.5, '#8a6446', at(lx, rise + 0.62, depth / 2 + 5));
    for (const side of [-1, 1]) parts.box(0.12, 1.2, 0.8, '#5f4532', at(lx + side, rise + 0.4, depth / 2 + 4.1));
  }

  // Flagpole beside the hut.
  const pole = local(-length / 2 - 3, depth / 2 + 2);
  const poleY = terrainHeight(pole.x, pole.z);
  parts.add(new THREE.CylinderGeometry(0.07, 0.09, 8, 6), '#d9d6cc', { x: pole.x, y: poleY + 4, z: pole.z });
  czechFlag(parts, pole.x, poleY + 7.3, pole.z, rotation + 0.4);

  addWaymarks(parts, TRACKS.find(track => track.id === 'chata').path);
  scene.add(parts.mesh());

  const a = local(-length / 2 + 2.5, 0);
  const b = local(length / 2 - 2.5, 0);
  obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: depth / 2 + 0.4 });
  obstacles.push({ ...local(0, depth / 2 + 1.4), radius: 1.8 }, { ...pole, radius: 0.3 });
  for (const lx of [-5, 4.6]) obstacles.push({ ...local(lx, depth / 2 + 4.1), radius: 1.3 });

  const smoke = createSmoke(scene, at(3.2, 12.8, -1.4), { count: 7, rate: 0.1, rise: 9, size: 0.6 });
  return {
    /** Where the name board goes: on the upper floor above the porch, facing out. */
    nameBoard: { ...at(0, 4.55, depth / 2 + 0.18), yaw: rotation },
    update: smoke.update,
  };
}
