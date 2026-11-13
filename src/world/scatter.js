// Scattered scenery (trees, rocks, bushes, flowers, fence posts) as instanced meshes,
// arranged so that the cost of drawing it depends on what is around the camera rather
// than on how big the world is:
// - Within `near` metres of the camera each kind is drawn in full, from one mesh per
//   shape that is refilled whenever the camera has moved a few metres.
// - Beyond that, a `far` shape is drawn instead (or nothing, for small things), from
//   square cells, so cells out of view are skipped and cells past `range`, or too far off
//   to be seen at all, are hidden.
// - Shadows come from separate meshes holding only what stands in the sun's shadow
//   box, and the meshes that are seen cast none.
// - A kind there is a great deal of, and which is only drawn near the camera, can be added
//   as patches instead: the items of each are only worked out when the camera comes near it
//   and are let go of when it has gone, so it costs nothing to have more of them far away.
import * as THREE from 'three';
import { vertexColorMaterial } from './build.js';
import { SIGHT } from './sight.js';

/** The shadow-only meshes are on their own layer, which the sun's shadow camera sees and the main camera doesn't. */
export const SHADOW_LAYER = 1;

/** How far the camera (or the car, for shadows) moves before the meshes around it are refilled. */
const STEP = 8;
/** Kinds are refilled one a frame, so no one frame does it all, unless the camera has jumped this far. */
const JUMP = 4 * STEP;
/** Side of the cells used to find items near a point. */
const LOOKUP = 32;
/** A patch is kept this far past where it is drawn, so one at the edge isn't worked out over and over. */
const KEEP = 4 * STEP;

/** An instanced mesh with room for `capacity` instances, starting empty. */
function emptyMesh(geometry, material, capacity, colors) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
  if (colors) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * 3), 3);
  mesh.count = 0;
  mesh.visible = false;
  return mesh;
}

const box = new THREE.Box3();
const corner = new THREE.Vector3();
const unpacked = new THREE.Matrix4();

/** Copies the listed items into `mesh`, uploads just that part of its buffers and fits its bounds to them. */
function fill(mesh, kind, indices, count) {
  const matrices = mesh.instanceMatrix.array;
  const colors = mesh.instanceColor?.array;
  box.makeEmpty();
  for (let n = 0; n < count; n++) {
    const i = indices[n];
    for (let k = 0; k < 16; k++) matrices[n * 16 + k] = kind.matrices[i * 16 + k];
    if (colors) for (let k = 0; k < 3; k++) colors[n * 3 + k] = kind.colors[i * 3 + k];
    box.expandByPoint(corner.fromArray(kind.matrices, i * 16 + 12));
  }
  show(mesh, count, kind.reach);
}

/**
 * Shows the first `count` items in `mesh`'s buffers: uploads just that part of them and fits its
 * bounds to `box`, which holds where they stand. Every item lies within `reach` of where it stands.
 */
function show(mesh, count, reach) {
  mesh.count = count;
  mesh.visible = count > 0;
  for (const attribute of [mesh.instanceMatrix, mesh.instanceColor]) {
    if (!attribute) continue;
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count * attribute.itemSize);
    attribute.needsUpdate = true;
  }
  mesh.boundingSphere ??= new THREE.Sphere();
  if (count > 0) box.getBoundingSphere(mesh.boundingSphere).radius += reach;
}

/**
 * Patches by where they are, for finding those near a point: `where(index)` gives the middle
 * and radius of each of `count` patches.
 */
function patchLookup(count, where) {
  const spots = Array.from({ length: count }, (_, index) => where(index));
  const widest = spots.reduce((most, spot) => Math.max(most, spot.radius), 0);
  const cells = new Map();
  const key = (cx, cz) => cx * 65536 + cz;
  spots.forEach(({ x, z }, index) => {
    const k = key(Math.floor(x / LOOKUP), Math.floor(z / LOOKUP));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(index);
  });
  /** True if any of patch `index` lies within `radius` of (x, z). */
  const within = (index, x, z, radius) => {
    const spot = spots[index];
    return (spot.x - x) ** 2 + (spot.z - z) ** 2 < (radius + spot.radius) ** 2;
  };
  return {
    within,
    /** The patches any of which lies within `radius` of (x, z). */
    near(x, z, radius) {
      const found = [];
      const reach = radius + widest;
      for (let cz = Math.floor((z - reach) / LOOKUP); cz <= Math.floor((z + reach) / LOOKUP); cz++) {
        for (let cx = Math.floor((x - reach) / LOOKUP); cx <= Math.floor((x + reach) / LOOKUP); cx++) {
          for (const index of cells.get(key(cx, cz)) ?? []) if (within(index, x, z, radius)) found.push(index);
        }
      }
      return found;
    },
  };
}

/**
 * The most items of one shape that can be within `near` of the camera, wherever it is: the
 * most in any block of lookup cells as wide as the near circle, plus a cell on each side.
 */
function nearCapacity(kind, shape) {
  const { columns, rows, starts, order } = kind.lookup;
  // Running totals over the grid, so any block of cells can be summed at once.
  const total = new Int32Array((columns + 1) * (rows + 1));
  const at = (c, r) => r * (columns + 1) + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const cell = r * columns + c;
      let here = 0;
      for (let k = starts[cell]; k < starts[cell + 1]; k++) if ((kind.shapes?.[order[k]] ?? 0) === shape) here++;
      total[at(c + 1, r + 1)] = here + total[at(c, r + 1)] + total[at(c + 1, r)] - total[at(c, r)];
    }
  }
  const reach = Math.ceil(kind.near / LOOKUP) + 1;
  let most = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const [c0, c1] = [Math.max(0, c - reach), Math.min(columns, c + reach + 1)];
      const [r0, r1] = [Math.max(0, r - reach), Math.min(rows, r + reach + 1)];
      most = Math.max(most, total[at(c1, r1)] - total[at(c0, r1)] - total[at(c1, r0)] + total[at(c0, r0)]);
    }
  }
  return most;
}

/**
 * No more than this many of the spots `xz` (pairs of x and z) lie within `radius` of any one
 * point: the most in any block of lookup cells as wide as the circle, plus a cell on each side.
 */
export function mostWithin(xz, radius) {
  const count = xz.length / 2;
  if (!count) return 0;
  let [minX, minZ, maxX, maxZ] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    minX = Math.min(minX, xz[i * 2]);
    maxX = Math.max(maxX, xz[i * 2]);
    minZ = Math.min(minZ, xz[i * 2 + 1]);
    maxZ = Math.max(maxZ, xz[i * 2 + 1]);
  }
  const columns = Math.floor((maxX - minX) / LOOKUP) + 1;
  const rows = Math.floor((maxZ - minZ) / LOOKUP) + 1;
  const here = new Int32Array(columns * rows);
  for (let i = 0; i < count; i++)
    here[Math.floor((xz[i * 2 + 1] - minZ) / LOOKUP) * columns + Math.floor((xz[i * 2] - minX) / LOOKUP)]++;
  // Running totals over the grid, so any block of cells can be summed at once.
  const total = new Int32Array((columns + 1) * (rows + 1));
  const at = (c, r) => r * (columns + 1) + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++)
      total[at(c + 1, r + 1)] = here[r * columns + c] + total[at(c, r + 1)] + total[at(c + 1, r)] - total[at(c, r)];
  }
  const reach = Math.ceil(radius / LOOKUP) + 1;
  let most = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const [c0, c1] = [Math.max(0, c - reach), Math.min(columns, c + reach + 1)];
      const [r0, r1] = [Math.max(0, r - reach), Math.min(rows, r + reach + 1)];
      most = Math.max(most, total[at(c1, r1)] - total[at(c0, r1)] - total[at(c1, r0)] + total[at(c0, r0)]);
    }
  }
  return most;
}

/** Distance from a point to a square cell, 0 inside it. */
function cellDistance(cell, x, z) {
  return Math.hypot(Math.max(0, cell.x0 - x, x - cell.x1), Math.max(0, cell.z0 - z, z - cell.z1));
}

export function createScatter(parent) {
  const kinds = [];
  // Kinds waiting to be refilled around the camera, and in the sun's shadow box.
  const waiting = [];
  const shading = [];
  const eye = { x: Infinity, z: Infinity };
  const light = { x: Infinity, z: Infinity, direction: new THREE.Vector3() };
  const basis = new THREE.Matrix4();
  const axisX = new THREE.Vector3();
  const axisY = new THREE.Vector3();
  const axisZ = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  /** Calls `visit(index)` for items of `kind` whose cells lie within `radius` of (x, z). */
  function forEachNear(kind, x, z, radius, visit) {
    const { lookup } = kind;
    const c0 = Math.max(0, Math.floor((x - radius - lookup.x) / LOOKUP));
    const c1 = Math.min(lookup.columns - 1, Math.floor((x + radius - lookup.x) / LOOKUP));
    const r0 = Math.max(0, Math.floor((z - radius - lookup.z) / LOOKUP));
    const r1 = Math.min(lookup.rows - 1, Math.floor((z + radius - lookup.z) / LOOKUP));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = r * lookup.columns + c;
        for (let k = lookup.starts[cell]; k < lookup.starts[cell + 1]; k++) visit(lookup.order[k]);
      }
    }
  }

  function refillNear(kind) {
    const near2 = kind.near * kind.near;
    const counts = kind.nearMeshes.map(() => 0);
    forEachNear(kind, eye.x, eye.z, kind.near, i => {
      const dx = kind.xz[i * 2] - eye.x;
      const dz = kind.xz[i * 2 + 1] - eye.z;
      if (dx * dx + dz * dz > near2) return;
      const shape = kind.shapes ? kind.shapes[i] : 0;
      kind.scratch[shape][counts[shape]++] = i;
    });
    kind.nearMeshes.forEach((mesh, shape) => fill(mesh, kind, kind.scratch[shape], counts[shape]));
  }

  /** Refills the far cells that the near circle has moved across since `from`: they hold whatever it doesn't. */
  function refillFar(kind, from) {
    const near2 = kind.near * kind.near;
    for (const cell of kind.cells) {
      const touched = cellDistance(cell, eye.x, eye.z) < kind.near || cellDistance(cell, from.x, from.z) < kind.near;
      if (cell.filled && !touched) continue;
      let count = 0;
      for (const i of cell.items) {
        const dx = kind.xz[i * 2] - eye.x;
        const dz = kind.xz[i * 2 + 1] - eye.z;
        if (kind.near === 0 || dx * dx + dz * dz > near2) kind.list[count++] = i;
      }
      fill(cell.mesh, kind, kind.list, count);
      cell.filled = true;
    }
    for (const cell of kind.cells)
      cell.mesh.visible = cell.mesh.count > 0 && cellDistance(cell, eye.x, eye.z) < Math.min(kind.range, SIGHT);
  }

  /**
   * Refills a kind that comes in patches with the items within `near` of the camera, working out
   * the patches that have come into reach and letting go of those left well behind.
   */
  function refillPatches(kind) {
    const { mesh, near, patches, grown } = kind;
    const near2 = near * near;
    const matrices = mesh.instanceMatrix.array;
    const colors = mesh.instanceColor.array;
    const room = mesh.instanceMatrix.count;
    let count = 0;
    box.makeEmpty();
    for (const patch of patches.near(eye.x, eye.z, near)) {
      if (!grown.has(patch)) grown.set(patch, kind.grow(patch));
      const items = grown.get(patch);
      for (let i = 0; i < items.matrices.length / 16 && count < room; i++) {
        const dx = items.matrices[i * 16 + 12] - eye.x;
        const dz = items.matrices[i * 16 + 14] - eye.z;
        if (dx * dx + dz * dz > near2) continue;
        for (let k = 0; k < 16; k++) matrices[count * 16 + k] = items.matrices[i * 16 + k];
        for (let k = 0; k < 3; k++) colors[count * 3 + k] = items.colors[i * 3 + k];
        box.expandByPoint(corner.fromArray(items.matrices, i * 16 + 12));
        count++;
      }
    }
    for (const patch of grown.keys()) if (!patches.within(patch, eye.x, eye.z, near + KEEP)) grown.delete(patch);
    show(mesh, count, kind.reach);
  }

  /** Refills a kind around the camera. Its near and far meshes are always filled for the same spot, so they never overlap. */
  function refillAround(kind) {
    if (kind.patches) refillPatches(kind);
    if (kind.nearMeshes.length) refillNear(kind);
    if (kind.cells.length) refillFar(kind, kind.filledAt);
    kind.filledAt = { ...eye };
  }

  /** Runs `refill` for the first `count` kinds waiting in `queue`. */
  function work(queue, count, refill) {
    for (const kind of queue.splice(0, count)) refill(kind);
  }

  /** Fills the shadow meshes with whatever stands inside the sun's shadow box, give or take a step. */
  function refillShadows(kind, sun) {
    const { left, right, top, bottom } = sun.shadow.camera;
    const margin = STEP * 1.5 + kind.reach;
    // Far enough along the ground to cover the box however low the sun is.
    const radius = Math.min(600, (Math.max(right, top) + margin + 60) / Math.max(axisZ.y, 0.3));
    const tx = sun.target.position.x;
    const ty = sun.target.position.y;
    const tz = sun.target.position.z;
    const counts = kind.shadowMeshes.map(() => 0);
    forEachNear(kind, tx, tz, radius, i => {
      const dx = kind.matrices[i * 16 + 12] - tx;
      const dy = kind.matrices[i * 16 + 13] - ty;
      const dz = kind.matrices[i * 16 + 14] - tz;
      const lx = dx * axisX.x + dy * axisX.y + dz * axisX.z;
      const ly = dx * axisY.x + dy * axisY.y + dz * axisY.z;
      if (lx < left - margin || lx > right + margin || ly < bottom - margin || ly > top + margin) return;
      const shape = kind.shapes ? kind.shapes[i] : 0;
      kind.scratch[shape][counts[shape]++] = i;
    });
    kind.shadowMeshes.forEach((mesh, shape) => fill(mesh, kind, kind.scratch[shape], counts[shape]));
  }

  return {
    /**
     * Adds a kind of scenery. `items` are { matrix, color?, shape? }; `geometry` is one
     * shape, or a list of them that `shape` picks from. Items of one shape can come packed
     * instead, as `matrices`, 16 numbers to an item, and `colors`, 3 to an item (if any).
     * `far` is the shape drawn beyond `near` metres from the camera (none: nothing is), and
     * nothing is drawn beyond `range`. `material` is for the near and far meshes.
     */
    add({
      geometry,
      items,
      matrices = null,
      colors: packedColors = null,
      near = 0,
      far = null,
      range = SIGHT,
      cell = 175,
      shadows = true,
      material,
    }) {
      material ??= vertexColorMaterial;
      const count = items ? items.length : matrices.length / 16;
      if (!count) return;
      const shapes = [geometry].flat();
      const perShape = items
        ? shapes.map((_, shape) => items.filter(item => (item.shape ?? 0) === shape).length)
        : [count];
      const kind = {
        near,
        range,
        matrices: matrices ?? new Float32Array(count * 16),
        colors: items ? (items[0].color ? new Float32Array(count * 3) : null) : packedColors,
        shapes: items && shapes.length > 1 ? Uint8Array.from(items, item => item.shape) : null,
        xz: new Float32Array(count * 2),
        // Room to list the items of each shape, and of all shapes together, while refilling.
        scratch: perShape.map(n => new Int32Array(n)),
        list: new Int32Array(count),
        nearMeshes: [],
        cells: [],
        shadowMeshes: [],
        reach: 0,
        filledAt: { x: Infinity, z: Infinity },
      };
      let maxScale = 0;
      items?.forEach((item, i) => {
        item.matrix.toArray(kind.matrices, i * 16);
        item.color?.toArray(kind.colors, i * 3);
        kind.xz[i * 2] = item.matrix.elements[12];
        kind.xz[i * 2 + 1] = item.matrix.elements[14];
        maxScale = Math.max(maxScale, item.matrix.getMaxScaleOnAxis());
      });
      for (let i = 0; !items && i < count; i++) {
        unpacked.fromArray(matrices, i * 16);
        kind.xz[i * 2] = matrices[i * 16 + 12];
        kind.xz[i * 2 + 1] = matrices[i * 16 + 14];
        maxScale = Math.max(maxScale, unpacked.getMaxScaleOnAxis());
      }
      for (const shape of shapes) {
        if (!shape.boundingSphere) shape.computeBoundingSphere();
        const { center, radius } = shape.boundingSphere;
        kind.reach = Math.max(kind.reach, (center.length() + radius) * maxScale);
      }

      // Items bucketed by position, for finding those near a point quickly.
      let [minX, minZ, maxX, maxZ] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < count; i++) {
        minX = Math.min(minX, kind.xz[i * 2]);
        maxX = Math.max(maxX, kind.xz[i * 2]);
        minZ = Math.min(minZ, kind.xz[i * 2 + 1]);
        maxZ = Math.max(maxZ, kind.xz[i * 2 + 1]);
      }
      const columns = Math.floor((maxX - minX) / LOOKUP) + 1;
      const rows = Math.floor((maxZ - minZ) / LOOKUP) + 1;
      const cellOf = i =>
        Math.floor((kind.xz[i * 2 + 1] - minZ) / LOOKUP) * columns + Math.floor((kind.xz[i * 2] - minX) / LOOKUP);
      // The items of cell k are order[starts[k]] up to order[starts[k + 1]].
      const starts = new Int32Array(columns * rows + 1);
      for (let i = 0; i < count; i++) starts[cellOf(i) + 1]++;
      for (let k = 0; k < columns * rows; k++) starts[k + 1] += starts[k];
      const order = new Int32Array(count);
      const next = starts.slice(0, -1);
      for (let i = 0; i < count; i++) order[next[cellOf(i)]++] = i;
      kind.lookup = { x: minX, z: minZ, columns, rows, starts, order };

      const colors = Boolean(kind.colors);
      if (near > 0) {
        kind.nearMeshes = shapes.map((shape, index) => {
          const mesh = emptyMesh(shape, material, nearCapacity(kind, index), colors);
          mesh.receiveShadow = true;
          parent.add(mesh);
          return mesh;
        });
      }
      if (far) {
        const cells = new Map();
        for (let i = 0; i < count; i++) {
          const key = `${Math.floor(kind.xz[i * 2] / cell)},${Math.floor(kind.xz[i * 2 + 1] / cell)}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(i);
        }
        for (const [key, list] of cells) {
          const [cx, cz] = key.split(',').map(Number);
          const mesh = emptyMesh(far, material, list.length, colors);
          mesh.receiveShadow = true;
          parent.add(mesh);
          const bounds = { x0: cx * cell, x1: (cx + 1) * cell, z0: cz * cell, z1: (cz + 1) * cell };
          kind.cells.push({ ...bounds, items: Int32Array.from(list), mesh, filled: false });
        }
      }
      if (shadows) {
        kind.shadowMeshes = shapes.map((shape, index) => {
          const mesh = emptyMesh(shape, vertexColorMaterial, perShape[index], colors);
          mesh.castShadow = true;
          mesh.layers.set(SHADOW_LAYER);
          parent.add(mesh);
          return mesh;
        });
      }
      kinds.push(kind);
    },

    /**
     * Adds a kind that comes in patches, drawn within `near` of the camera and casting no shadows.
     * There are `count` patches; `where(index)` gives the middle and radius of one, and `grow(index)`
     * its items, packed as `matrices` and `colors`, which is only called when the camera comes near
     * it. No more than `most` items lie within `near` of any one point, and none is scaled up by
     * more than `scale`.
     */
    addPatches({ geometry, material, near, count, most, scale, where, grow }) {
      if (!count) return;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const { center, radius } = geometry.boundingSphere;
      const mesh = emptyMesh(geometry, material, most, true);
      mesh.receiveShadow = true;
      parent.add(mesh);
      kinds.push({
        near,
        range: Infinity,
        patches: patchLookup(count, where),
        grow,
        grown: new Map(),
        mesh,
        reach: (center.length() + radius) * scale,
        nearMeshes: [],
        cells: [],
        shadowMeshes: [],
        filledAt: { x: Infinity, z: Infinity },
      });
    },

    /** `camera` is where the view is from; `sun` is the light whose shadow box is filled. */
    update(camera, sun) {
      const moved = Math.hypot(camera.x - eye.x, camera.z - eye.z);
      if (moved > STEP) {
        Object.assign(eye, { x: camera.x, z: camera.z });
        // Kinds drawn the same from everywhere only need filling once.
        const changes = kind => kind.near > 0 || kind.range < Infinity || kind.filledAt.x === Infinity;
        for (const kind of kinds) if (changes(kind) && !waiting.includes(kind)) waiting.push(kind);
      }
      work(waiting, moved > JUMP ? Infinity : 1, refillAround);
      if (!sun) return;
      basis.lookAt(sun.position, sun.target.position, up);
      basis.extractBasis(axisX, axisY, axisZ);
      const shifted = Math.hypot(sun.target.position.x - light.x, sun.target.position.z - light.z);
      if (shifted > STEP || axisZ.dot(light.direction) < 0.9999) {
        Object.assign(light, { x: sun.target.position.x, z: sun.target.position.z });
        light.direction.copy(axisZ);
        for (const kind of kinds) if (kind.shadowMeshes.length && !shading.includes(kind)) shading.push(kind);
      }
      work(shading, shifted > JUMP ? Infinity : 1, kind => refillShadows(kind, sun));
    },
  };
}
