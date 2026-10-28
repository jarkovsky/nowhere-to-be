// The ground: triangles over the height field, two to a grid cell. Each grid point has its
// own colour and a normal worked out from the slope around it, so the light and the colours
// change smoothly across the hills, and a detail texture drawn over it in the shader gives it
// grain up close (see detail.js). It is split into square tiles so tiles out of view are
// skipped, and tiles far from the camera are drawn with one triangle for every four or
// sixteen, so what it costs to draw follows how much ground is near the camera rather than
// how big the world is. Neighbouring tiles of different detail don't quite meet, so every
// tile has a narrow skirt hanging down from its edges to hide the gaps.
import * as THREE from 'three';
import { groundMaterial } from './detail.js';
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

/**
 * The normal and colour of every grid point, as bytes: the normal from the slope between its
 * neighbours, and the colour from `colorAt(x, z, height, up, out)`, where `up` is 1 on level ground.
 * What `colorAt` returns, how grassy the ground is from 0 to 1, goes in the colour's alpha.
 */
function gridShading(colorAt) {
  const normals = new Int8Array(GRID * GRID * 3);
  const colors = new Uint8Array(GRID * GRID * 4);
  const normal = new THREE.Vector3();
  const color = new THREE.Color();
  for (let iz = 0; iz < GRID; iz++) {
    const [z0, z1] = [Math.max(0, iz - 1), Math.min(CELLS, iz + 1)];
    for (let ix = 0; ix < GRID; ix++) {
      const [x0, x1] = [Math.max(0, ix - 1), Math.min(CELLS, ix + 1)];
      const dx = (height(x1, iz) - height(x0, iz)) / (AXIS[x1] - AXIS[x0]);
      const dz = (height(ix, z1) - height(ix, z0)) / (AXIS[z1] - AXIS[z0]);
      normal.set(-dx, 1, -dz).normalize();
      const i = iz * GRID + ix;
      normals[i * 3] = Math.round(normal.x * 127);
      normals[i * 3 + 1] = Math.round(normal.y * 127);
      normals[i * 3 + 2] = Math.round(normal.z * 127);
      const grass = colorAt(AXIS[ix], AXIS[iz], height(ix, iz), normal.y, color);
      colors[i * 4] = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
      colors[i * 4 + 1] = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
      colors[i * 4 + 2] = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
      colors[i * 4 + 3] = Math.round(THREE.MathUtils.clamp(grass, 0, 1) * 255);
    }
  }
  return { normals, colors };
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

/** Lets go of an attribute's array once it is on the graphics card. Out here, it holds on to nothing else. */
function release() {
  this.array = null;
}

/** One version of a tile, with its cells `stride` grid lines across, and its skirts. */
function tileGeometry(xs, zs, stride, shading, depths) {
  const columns = (xs.to - xs.from) / stride;
  const rows = (zs.to - zs.from) / stride;
  const vertices = (columns + 1) * (rows + 1) + 2 * (columns + 1) + 2 * (rows + 1);
  const positions = new Float32Array(vertices * 3);
  const normals = new Int8Array(vertices * 3);
  // Colours as bytes take a quarter of the memory of floats.
  const colors = new Uint8Array(vertices * 4);
  const indices = new (vertices > 65535 ? Uint32Array : Uint16Array)(columns * rows * 6 + 2 * (columns + rows) * 6);
  let n = 0;
  let v = 0;
  /** Adds a vertex at grid point (ix, iz), lowered by `drop`, shaded like the point. */
  const vertex = (ix, iz, drop = 0) => {
    const i = iz * GRID + ix;
    positions[v * 3] = AXIS[ix];
    positions[v * 3 + 1] = height(ix, iz) - drop;
    positions[v * 3 + 2] = AXIS[iz];
    for (let k = 0; k < 3; k++) normals[v * 3 + k] = shading.normals[i * 3 + k];
    for (let k = 0; k < 4; k++) colors[v * 4 + k] = shading.colors[i * 4 + k];
    return v++;
  };

  for (let iz = zs.from; iz <= zs.to; iz += stride) {
    for (let ix = xs.from; ix <= xs.to; ix += stride) vertex(ix, iz);
  }
  const at = (ix, iz) => ((iz - zs.from) / stride) * (columns + 1) + (ix - xs.from) / stride;
  for (let iz = zs.from; iz < zs.to; iz += stride) {
    for (let ix = xs.from; ix < xs.to; ix += stride) {
      for (let t = 0; t < 2; t++) {
        const c = corners(ix, iz, stride, t);
        indices[n++] = at(c[0], c[1]);
        indices[n++] = at(c[2], c[3]);
        indices[n++] = at(c[4], c[5]);
      }
    }
  }

  // Each skirt hangs from one side of the tile and faces out of it.
  const skirt = (points, depth, inward) => {
    const bottoms = points.map(([ix, iz]) => vertex(ix, iz, depth));
    for (let k = 0; k + 1 < points.length; k++) {
      const [a, b] = [at(...points[k]), at(...points[k + 1])];
      const [ux, uz] = [AXIS[points[k + 1][0]] - AXIS[points[k][0]], AXIS[points[k + 1][1]] - AXIS[points[k][1]]];
      const quad = [a, b, bottoms[k + 1], bottoms[k]];
      const order = ux * inward[1] - uz * inward[0] > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of order) indices[n++] = quad[k];
    }
  };
  const along = (count, point) => Array.from({ length: count + 1 }, (_, k) => point(k * stride));
  skirt(
    along(columns, d => [xs.from + d, zs.from]),
    depths.north,
    [0, 1],
  );
  skirt(
    along(columns, d => [xs.from + d, zs.to]),
    depths.south,
    [0, -1],
  );
  skirt(
    along(rows, d => [xs.from, zs.from + d]),
    depths.west,
    [1, 0],
  );
  skirt(
    along(rows, d => [xs.to, zs.from + d]),
    depths.east,
    [-1, 0],
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4, true));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  // The arrays are large and aren't needed again once they are on the graphics card.
  for (const attribute of [...Object.values(geometry.attributes), geometry.index]) attribute.onUpload(release);
  return geometry;
}

/** Every tile, with its versions from the most detailed down. */
function buildTiles(shading, material) {
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
        geometry: tileGeometry(xs, zs, level.stride, shading, depths),
      }));
      const mesh = new THREE.Mesh(levels[0].geometry, material);
      mesh.receiveShadow = true;
      tiles.push({ mesh, levels, level: 0, x0: AXIS[xs.from], x1: AXIS[xs.to], z0: AXIS[zs.from], z1: AXIS[zs.to] });
    }
  }
  return tiles;
}

/**
 * Builds the ground. `colorAt(x, z, height, up, out)` colours a grid point, where `up` is 1 on
 * level ground, and returns how grassy it is.
 */
export function createGround(colorAt) {
  const group = new THREE.Group();
  group.name = 'ground';
  const shading = gridShading(colorAt);
  const tiles = buildTiles(shading, groundMaterial());
  for (const tile of tiles) group.add(tile.mesh);
  // The colours are kept, for the grass to take on (see grass.js).
  const { colors } = shading;
  const texture = new THREE.DataTexture(colors, GRID, GRID, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return {
    group,
    /** The colour of every grid point, with how grassy it is in the alpha, as a texture and as bytes. */
    colors,
    texture,
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
