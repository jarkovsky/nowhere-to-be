// The rough trail: the beds of churned earth with deep ruts dug in them, red-and-white waymarks on
// posts beside it, and at the top of the ridge the lookout, a cairn of stones on one side of the
// trail and a wooden bench on the other, facing out over the outlands.
import * as THREE from 'three';
import { createRandom, smoothstep } from '../../core/math.js';
import { ROUGH } from '../layout.js';
import { RUTS, rutProfile, terrainHeight } from '../terrain.js';
import { PartsBuilder, vertexColorMaterial } from '../build.js';
import { framer } from './frame.js';

const WOOD = '#9a7550';
const DARK_WOOD = '#6f5238';
const STONES = ['#8d91a0', '#9a9ca6', '#7f8493', '#a6a69f'];
/** The earth of the ruts, wet and dark, the hump between them, and the verge where it meets the ground. */
const EARTH = {
  rut: new THREE.Color('#5b4733'),
  hump: new THREE.Color('#8a6c47'),
  verge: new THREE.Color('#a58a55'),
};

/**
 * A strip of bed over the ground along a stretch of the trail, a metre and a half to a row and
 * about a third of a metre across, at the height the tyres ride at there (see rutHeight).
 * Painted dark in the ruts and lighter on the hump and the verge.
 */
function bedGeometry({ from, to }) {
  const [rows, columns] = [Math.ceil((to - from + 8) / 1.5), Math.round((2 * RUTS.edge) / 0.3)];
  const positions = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  for (let i = 0; i <= rows; i++) {
    const s = from - 4 + ((to - from + 8) * i) / rows;
    const weight = smoothstep(s, from, from + 6) * (1 - smoothstep(s, to - 6, to));
    for (let j = 0; j <= columns; j++) {
      const side = -RUTS.edge + (2 * RUTS.edge * j) / columns;
      const p = ROUGH.path.offset(s, side);
      const lift = weight * rutProfile(side);
      positions.push(p.x, terrainHeight(p.x, p.z) + lift + 0.02, p.z);
      const across = Math.abs(side);
      const inRut = 1 - smoothstep(Math.abs(across - RUTS.wheels), 0.1, RUTS.width);
      color
        .copy(EARTH.hump)
        .lerp(EARTH.rut, inRut)
        .lerp(EARTH.verge, smoothstep(across, RUTS.flat, RUTS.edge));
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      const a = i * (columns + 1) + j;
      // Wound so the faces look up whichever way the path runs.
      indices.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Posts with a red band between two white ones, as on the hiking trails at home, along the trail. */
function buildWaymarks(parts, obstacles) {
  const { path, winding } = ROUGH;
  for (let s = 30; s < path.length - 12; s += 30) {
    if (winding.zones.some(z => s > z.from - 10 && s < z.to + 10)) continue;
    const p = path.offset(s, (Math.round(s / 30) % 2 ? 1 : -1) * 4.4);
    const y = terrainHeight(p.x, p.z);
    parts.box(0.22, 1.5, 0.22, '#7d6a4f', { x: p.x, y: y + 0.55, z: p.z });
    for (const [h, color] of [
      [1.06, '#f1ece0'],
      [0.98, '#c8302a'],
      [0.9, '#f1ece0'],
    ]) {
      parts.box(0.24, 0.08, 0.24, color, { x: p.x, y: y + h, z: p.z });
    }
    obstacles.push({ x: p.x, z: p.z, radius: 0.25 });
  }
}

/** A cairn: stones piled in rings, each ring smaller and set over the gaps in the one below. */
function buildCairn(parts, obstacles) {
  const { x, z } = ROUGH.lookout.cairn;
  const random = createRandom(7741);
  const stone = new THREE.IcosahedronGeometry(1, 1);
  // The ring of stones at the foot stands on the ground under each, which isn't quite level;
  // the rings above them are built up from the highest of those.
  let y = Math.max(...[0, 1, 2, 3, 4, 5].map(k => terrainHeight(x + Math.cos(k) * 1.2, z + Math.sin(k) * 1.2)));
  [
    [6, 0.78, 0.5],
    [5, 0.5, 0.4],
    [3, 0.26, 0.34],
    [1, 0, 0.3],
  ].forEach(([count, ring, size], layer) => {
    for (let k = 0; k < count; k++) {
      const a = ((k + layer * 0.5) / count) * Math.PI * 2 + random() * 0.3;
      const s = size * (0.85 + random() * 0.3);
      const [sx, sz] = [x + Math.cos(a) * ring, z + Math.sin(a) * ring];
      parts.add(stone, STONES[Math.floor(random() * STONES.length)], {
        x: sx,
        y: (layer ? y : terrainHeight(sx, sz)) + s * 0.5,
        z: sz,
        sx: s * 1.15,
        sy: s * 0.72,
        sz: s,
        ry: random() * 6.3,
      });
    }
    y += size * 0.9;
  });
  obstacles.push({ x, z, radius: 1.15 });
}

/** A bench of boards on stout legs, with a back, facing the way `rotation` says. */
function buildBench(parts, obstacles) {
  const frame = framer(ROUGH.lookout.bench);
  const { at } = frame;
  const width = 2.1;
  const base = frame.ground(0, 0);
  // The legs go down to the ground under each, which falls away at the edge of the top.
  for (const lx of [-0.85, 0.85]) {
    const foot = Math.min(frame.ground(lx, -0.25), frame.ground(lx, 0.25)) - base - 0.1;
    parts.box(0.12, 0.46 - foot, 0.5, DARK_WOOD, at(lx, (0.46 + foot) / 2, 0));
    const back = frame.ground(lx, -0.24) - base - 0.1;
    parts.box(0.1, 1.06 - back, 0.1, DARK_WOOD, at(lx, (1.06 + back) / 2, -0.24));
  }
  for (const lz of [-0.15, 0.05, 0.25]) parts.box(width, 0.05, 0.17, WOOD, at(0, 0.48, lz));
  for (const ly of [0.7, 0.92]) parts.box(width, 0.15, 0.04, WOOD, at(0, ly, -0.3));
  obstacles.push({ ...frame.local(0, 0), halfX: width / 2 + 0.1, halfZ: 0.4, rotation: frame.rotation, radius: 0 });
}

export function buildLookout(scene, obstacles) {
  for (const stretch of ROUGH.ruts) {
    const bed = new THREE.Mesh(bedGeometry(stretch), vertexColorMaterial);
    bed.receiveShadow = true;
    scene.add(bed);
  }
  const parts = new PartsBuilder();
  buildWaymarks(parts, obstacles);
  buildCairn(parts, obstacles);
  buildBench(parts, obstacles);
  scene.add(parts.mesh());
}
