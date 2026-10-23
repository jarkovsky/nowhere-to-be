// Scattered scenery (trees, rocks, bushes, flowers, fence posts) as instanced meshes,
// arranged so that the cost of drawing it depends on what is around the camera rather
// than on how big the world is:
// - Within `near` metres of the camera each kind is drawn in full, from one mesh per
//   shape that is refilled whenever the camera has moved a few metres.
// - Beyond that, a `far` shape is drawn instead (or nothing, for small things), from
//   square cells, so cells out of view are skipped and cells past `range` are hidden.
// - Shadows come from separate meshes holding only what stands in the sun's shadow
//   box, and the meshes that are seen cast none.
import * as THREE from 'three';
import { vertexColorMaterial } from './build.js';

/** The shadow-only meshes are on their own layer, which the sun's shadow camera sees and the main camera doesn't. */
export const SHADOW_LAYER = 1;

/** How far the camera (or the car, for shadows) moves before the meshes around it are refilled. */
const STEP = 8;
/** Kinds are refilled one a frame, so no one frame does it all, unless the camera has jumped this far. */
const JUMP = 4 * STEP;
/** Side of the cells used to find items near a point. */
const LOOKUP = 32;

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
  mesh.count = count;
  mesh.visible = count > 0;
  for (const attribute of [mesh.instanceMatrix, mesh.instanceColor]) {
    if (!attribute) continue;
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count * attribute.itemSize);
    attribute.needsUpdate = true;
  }
  // Every item lies within `reach` of where it stands.
  mesh.boundingSphere ??= new THREE.Sphere();
  if (count > 0) box.getBoundingSphere(mesh.boundingSphere).radius += kind.reach;
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
      cell.mesh.visible = cell.mesh.count > 0 && cellDistance(cell, eye.x, eye.z) < kind.range;
  }

  /** Refills a kind around the camera. Its near and far meshes are always filled for the same spot, so they never overlap. */
  function refillAround(kind) {
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
     * shape, or a list of them that `shape` picks from. `far` is the shape drawn beyond
     * `near` metres from the camera (none: nothing is), and nothing is drawn beyond `range`.
     */
    add({ geometry, items, near = 0, far = null, range = Infinity, cell = 175, shadows = true }) {
      if (!items.length) return;
      const shapes = [geometry].flat();
      const count = items.length;
      const perShape = shapes.map((_, shape) => items.filter(item => (item.shape ?? 0) === shape).length);
      const kind = {
        near,
        range,
        matrices: new Float32Array(count * 16),
        colors: items[0].color ? new Float32Array(count * 3) : null,
        shapes: shapes.length > 1 ? Uint8Array.from(items, item => item.shape) : null,
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
      items.forEach((item, i) => {
        item.matrix.toArray(kind.matrices, i * 16);
        item.color?.toArray(kind.colors, i * 3);
        kind.xz[i * 2] = item.matrix.elements[12];
        kind.xz[i * 2 + 1] = item.matrix.elements[14];
        maxScale = Math.max(maxScale, item.matrix.getMaxScaleOnAxis());
      });
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
          const mesh = emptyMesh(shape, vertexColorMaterial, nearCapacity(kind, index), colors);
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
          const mesh = emptyMesh(far, vertexColorMaterial, list.length, colors);
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
