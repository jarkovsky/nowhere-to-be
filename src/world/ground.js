// The ground: flat-shaded triangles over the height field, two to a grid cell, each with
// its own colour. It is split into square tiles so tiles out of view are skipped, and
// tiles far from the camera are drawn with one triangle for every four or sixteen, so
// what it costs to draw follows how much ground is near the camera rather than how big
// the world is. Neighbouring tiles of different detail don't quite meet, so every tile
// has a narrow skirt hanging down from its edges to hide the gaps.
import * as THREE from 'three';
import { flatMaterial } from './build.js';
import { AXIS, GRID, heights } from './terrain.js';

/** Most cells along a side of a tile. */
const TILE = 64;
/** Simpler versions use every second or fourth grid line, beyond these distances from the camera. */
const LEVELS = [
  { stride: 1, from: 0 },
  { stride: 2, from: 380 },
  { stride: 4, from: 800 },
];
/** Cells are never made larger than this: the mountains beyond the fence are coarse already. */
const MAX_CELL = 15;
/** How far the camera must go past a switching point before a tile switches, so it doesn't flicker. */
const HYSTERESIS = 10;

const CELLS = GRID - 1;
const height = (ix, iz) => heights[iz * GRID + ix];

/**
 * The corners of triangle `t` (0 or 1) of the cell at (ix, iz) that is `stride` grid lines
 * across, as grid indices [x0, z0, x1, z1, x2, z2]. Cells are split along the same diagonal
 * as in terrainHeight(), so the car follows every facet.
 */
function corners(ix, iz, stride, t) {
  const [x1, z1] = [ix + stride, iz + stride];
  return t === 0 ? [ix, iz, ix, z1, x1, iz] : [x1, iz, ix, z1, x1, z1];
}

/** Splits the cells along one axis into tile spans, each within a run of equal-sized cells. */
function tileSpans() {
  const runs = [];
  for (let i = 0; i < CELLS; i++) {
    const size = AXIS[i + 1] - AXIS[i];
    const run = runs.at(-1);
    if (run && Math.abs(run.size - size) < 1e-6) run.end = i + 1;
    else runs.push({ start: i, end: i + 1, size });
  }
  return runs.flatMap(({ start, end, size }) => {
    const pieces = Math.ceil((end - start) / TILE);
    return Array.from({ length: pieces }, (_, k) => ({
      from: start + Math.round(((end - start) * k) / pieces),
      to: start + Math.round(((end - start) * (k + 1)) / pieces),
      size,
    }));
  });
}

/** Colours of every ground triangle (two per cell), from `colorAt(x, z, height, up, out)` at its middle. */
function triangleColors(colorAt) {
  const colors = new Float32Array(CELLS * CELLS * 6);
  const color = new THREE.Color();
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let iz = 0; iz < CELLS; iz++) {
    for (let ix = 0; ix < CELLS; ix++) {
      for (let t = 0; t < 2; t++) {
        const [x0, z0, x1, z1, x2, z2] = corners(ix, iz, 1, t);
        a.set(AXIS[x0], height(x0, z0), AXIS[z0]);
        b.set(AXIS[x1], height(x1, z1), AXIS[z1]);
        c.set(AXIS[x2], height(x2, z2), AXIS[z2]);
        const x = (a.x + b.x + c.x) / 3;
        const y = (a.y + b.y + c.y) / 3;
        const z = (a.z + b.z + c.z) / 3;
        b.sub(a);
        c.sub(a);
        const up = Math.abs(c.cross(b).normalize().y);
        colorAt(x, z, y, up, color).toArray(colors, ((iz * CELLS + ix) * 2 + t) * 3);
      }
    }
  }
  return colors;
}

/**
 * Triangle colours for cells twice as wide: each coarse triangle takes the average of the
 * four fine ones it covers. The first triangle of a cell covers the fine cells before its
 * diagonal and the second those after it, and the two cells on it are split the same way.
 * Halving twice averages the same sixteen triangles as going to four times as wide at once.
 */
function coarserColors(colors, cells) {
  const half = cells / 2;
  const coarse = new Float32Array(half * half * 6);
  const add = (into, ix, iz, t) => {
    for (let k = 0; k < 3; k++) coarse[into + k] += colors[((iz * cells + ix) * 2 + t) * 3 + k] / 4;
  };
  for (let iz = 0; iz < half; iz++) {
    for (let ix = 0; ix < half; ix++) {
      const [fx, fz] = [ix * 2, iz * 2];
      const first = (iz * half + ix) * 6;
      const second = first + 3;
      add(first, fx, fz, 0);
      add(first, fx, fz, 1);
      add(first, fx + 1, fz, 0);
      add(first, fx, fz + 1, 0);
      add(second, fx + 1, fz, 1);
      add(second, fx, fz + 1, 1);
      add(second, fx + 1, fz + 1, 0);
      add(second, fx + 1, fz + 1, 1);
    }
  }
  return coarse;
}

/**
 * How far a coarser version of an edge strays from the full one: how deep a skirt must hang
 * to close the gap between neighbours drawn at different levels. `at(i)` is the height at
 * grid line `i` along the edge.
 */
function skirtDepth(from, to, at) {
  let depth = 0;
  for (const { stride } of LEVELS.slice(1)) {
    if ((to - from) % stride) continue;
    for (let i = from; i < to; i += stride) {
      for (let k = 1; k < stride; k++) {
        const straight = at(i) + ((at(i + stride) - at(i)) * k) / stride;
        depth = Math.max(depth, Math.abs(at(i + k) - straight));
      }
    }
  }
  return depth + 0.3;
}

/** One version of a tile, with its cells `stride` grid lines across, and its skirts. */
function tileGeometry(xs, zs, stride, colors, depths) {
  const cells = CELLS / stride;
  const columns = (xs.to - xs.from) / stride;
  const rows = (zs.to - zs.from) / stride;
  const triangles = (columns * rows + 2 * (columns + rows)) * 2;
  const positions = new Float32Array(triangles * 9);
  // Colours as bytes take a quarter of the memory of floats.
  const shades = new Uint8Array(triangles * 12);
  const rgb = [0, 0, 0];
  let v = 0;
  const vertex = (x, y, z) => {
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    for (let k = 0; k < 3; k++) shades[v * 4 + k] = Math.round(Math.min(1, Math.max(0, rgb[k])) * 255);
    shades[v * 4 + 3] = 255;
    v++;
  };
  const paint = (ix, iz, t) => {
    const at = (((iz / stride) * cells + ix / stride) * 2 + t) * 3;
    for (let k = 0; k < 3; k++) rgb[k] = colors[at + k];
  };

  for (let iz = zs.from; iz < zs.to; iz += stride) {
    for (let ix = xs.from; ix < xs.to; ix += stride) {
      for (let t = 0; t < 2; t++) {
        paint(ix, iz, t);
        const c = corners(ix, iz, stride, t);
        for (let k = 0; k < 6; k += 2) vertex(AXIS[c[k]], height(c[k], c[k + 1]), AXIS[c[k + 1]]);
      }
    }
  }

  // Each skirt hangs from an edge segment between two grid points, faces out of the tile,
  // and is coloured like the triangle above it.
  const skirt = ([ax, az], [bx, bz], depth, inward) => {
    const [pa, pb] = [height(ax, az), height(bx, bz)];
    const quad = [
      [AXIS[ax], pa, AXIS[az]],
      [AXIS[bx], pb, AXIS[bz]],
      [AXIS[bx], pb - depth, AXIS[bz]],
      [AXIS[ax], pa - depth, AXIS[az]],
    ];
    // Wound so the front faces away from the tile.
    const [ux, uz] = [quad[1][0] - quad[0][0], quad[1][2] - quad[0][2]];
    const order = ux * inward[1] - uz * inward[0] > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) vertex(...quad[k]);
  };
  for (let i = 0; i < columns; i++) {
    const ix = xs.from + i * stride;
    paint(ix, zs.from, 0);
    skirt([ix, zs.from], [ix + stride, zs.from], depths.north, [0, 1]);
    paint(ix, zs.to - stride, 1);
    skirt([ix, zs.to], [ix + stride, zs.to], depths.south, [0, -1]);
  }
  for (let i = 0; i < rows; i++) {
    const iz = zs.from + i * stride;
    paint(xs.from, iz, 0);
    skirt([xs.from, iz], [xs.from, iz + stride], depths.west, [1, 0]);
    paint(xs.to - stride, iz, 1);
    skirt([xs.to, iz], [xs.to, iz + stride], depths.east, [-1, 0]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(shades, 4, true));
  geometry.computeBoundingSphere();
  // The arrays are large and aren't needed again once they are on the graphics card.
  for (const attribute of Object.values(geometry.attributes)) {
    attribute.onUpload(function () {
      this.array = null;
    });
  }
  return geometry;
}

/** Every tile, with its versions from the most detailed down. */
function buildTiles(colorAt, material) {
  // Triangle colours at each level of detail.
  const colors = { 1: triangleColors(colorAt) };
  colors[2] = coarserColors(colors[1], CELLS);
  colors[4] = coarserColors(colors[2], CELLS / 2);
  const spans = tileSpans();
  const tiles = [];
  for (const zs of spans) {
    for (const xs of spans) {
      const depths = {
        north: skirtDepth(xs.from, xs.to, i => height(i, zs.from)),
        south: skirtDepth(xs.from, xs.to, i => height(i, zs.to)),
        west: skirtDepth(zs.from, zs.to, i => height(xs.from, i)),
        east: skirtDepth(zs.from, zs.to, i => height(xs.to, i)),
      };
      const cell = Math.max(xs.size, zs.size);
      const fits = stride => [xs.from, xs.to, zs.from, zs.to].every(i => i % stride === 0) && cell * stride <= MAX_CELL;
      const levels = LEVELS.filter(({ stride }) => stride === 1 || fits(stride)).map(level => ({
        from: level.from,
        geometry: tileGeometry(xs, zs, level.stride, colors[level.stride], depths),
      }));
      const mesh = new THREE.Mesh(levels[0].geometry, material);
      mesh.receiveShadow = true;
      tiles.push({ mesh, levels, level: 0, x0: AXIS[xs.from], x1: AXIS[xs.to], z0: AXIS[zs.from], z1: AXIS[zs.to] });
    }
  }
  return tiles;
}

/** Builds the ground. `colorAt(x, z, height, up, out)` colours a triangle; `up` is 1 on level ground. */
export function createGround(colorAt) {
  const group = new THREE.Group();
  group.name = 'ground';
  // Built in a function of its own, so the colours of every triangle can be let go afterwards.
  const tiles = buildTiles(colorAt, flatMaterial('#ffffff', { vertexColors: true, name: 'ground' }));
  for (const tile of tiles) group.add(tile.mesh);

  return {
    group,
    /** Picks each tile's level of detail for a camera at `eye`. */
    update(eye) {
      for (const tile of tiles) {
        const distance = Math.hypot(
          Math.max(0, tile.x0 - eye.x, eye.x - tile.x1),
          Math.max(0, tile.z0 - eye.z, eye.z - tile.z1),
        );
        let level = 0;
        for (let i = 1; i < tile.levels.length; i++) {
          if (distance > tile.levels[i].from + (i > tile.level ? HYSTERESIS : -HYSTERESIS)) level = i;
        }
        if (level === tile.level) continue;
        tile.level = level;
        tile.mesh.geometry = tile.levels[level].geometry;
      }
    },
  };
}
