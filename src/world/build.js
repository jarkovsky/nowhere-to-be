// Helpers for assembling low-poly props. Static props are merged into a single
// vertex-coloured mesh, which keeps the draw-call count low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const materials = new Map();

/** Shared flat-shaded material. Lambert is much cheaper than PBR and suits the style. */
export function flatMaterial(color = '#ffffff', options = {}) {
  const key = `${color}|${JSON.stringify(options)}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...options }));
  }
  return materials.get(key);
}

export const vertexColorMaterial = flatMaterial('#ffffff', { vertexColors: true });

// The renderer builds a different shader for plain meshes, instanced meshes and instanced
// meshes with colours of their own. When meshes of different kinds share a material, it has
// to look the shader up again every time it switches between them, which costs more than
// the drawing itself. So each kind gets its own copy of a shared material, and its own
// material for drawing the sun's shadows.
const depthMaterials = {
  instanced: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }),
  tinted: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }),
};
const meshKind = mesh => (!mesh.isInstancedMesh ? 'plain' : mesh.instanceColor ? 'tinted' : 'instanced');

/**
 * Gives the instanced meshes under `root` materials of their own kind (see above). Call it
 * once everything is built. Copies don't follow changes made to the original later, so a
 * material that changes while the game runs mustn't be shared by meshes of different kinds.
 */
export function separateMeshKinds(root) {
  const kinds = new Map();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (!kinds.has(mesh.material)) kinds.set(mesh.material, new Set());
    kinds.get(mesh.material).add(meshKind(mesh));
  });
  const copies = new Map();
  root.traverse(mesh => {
    if (!mesh.isInstancedMesh) return;
    const kind = meshKind(mesh);
    mesh.customDepthMaterial = depthMaterials[kind];
    if (kinds.get(mesh.material).size < 2) return;
    const key = `${mesh.material.uuid}|${kind}`;
    if (!copies.has(key)) {
      const copy = mesh.material.clone();
      // Not copied by clone(), and the defines tell the copies' shaders apart.
      copy.onBeforeCompile = mesh.material.onBeforeCompile;
      copies.set(key, copy);
    }
    mesh.material = copies.get(key);
  });
}

/**
 * Marks everything under `root` as fixed in place, so the renderer doesn't work out again
 * where it is every frame. Only for things that never move: moving one afterwards has no effect.
 */
/**
 * Merges the meshes among `group`'s children that are drawn with `material` into one mesh for
 * each square `size` metres across, each triangle going to the square its middle lies in. A view
 * over much of the world then draws a few meshes rather than every one, and squares out of view
 * are still skipped. Only indexed meshes left where they were built, with the same attributes
 * as the first, are merged.
 */
export function mergeByArea(group, material, size) {
  const meshes = group.children.filter(o => {
    if (!o.isMesh || o.isInstancedMesh || o.material !== material || !o.geometry.index) return false;
    o.updateMatrix();
    return o.matrix.equals(IDENTITY);
  });
  const names = Object.keys(meshes[0]?.geometry.attributes ?? {})
    .sort()
    .join();
  const merging = meshes.filter(mesh => Object.keys(mesh.geometry.attributes).sort().join() === names);
  if (merging.length < 2) return;
  const cells = new Map();
  for (const mesh of merging) {
    const { index, attributes } = mesh.geometry;
    const { position } = attributes;
    const moved = new Map();
    for (let t = 0; t < index.count; t += 3) {
      const corners = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      const x = corners.reduce((sum, i) => sum + position.getX(i), 0) / 3;
      const z = corners.reduce((sum, i) => sum + position.getZ(i), 0) / 3;
      const key = `${Math.floor(x / size)},${Math.floor(z / size)}`;
      if (!cells.has(key)) cells.set(key, { values: {}, indices: [], count: 0 });
      const cell = cells.get(key);
      // Each corner is copied into a cell once, however many of its triangles go there.
      if (!moved.has(key)) moved.set(key, new Map());
      const placed = moved.get(key);
      for (const i of corners) {
        if (!placed.has(i)) {
          placed.set(i, cell.count++);
          for (const [name, attribute] of Object.entries(attributes)) {
            const values = (cell.values[name] ??= []);
            for (let k = 0; k < attribute.itemSize; k++) values.push(attribute.getComponent(i, k));
          }
        }
        cell.indices.push(placed.get(i));
      }
    }
    group.remove(mesh);
    mesh.geometry.dispose();
  }
  const { castShadow, receiveShadow, renderOrder } = merging[0];
  for (const { values, indices } of cells.values()) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(merging[0].geometry.attributes)) {
      const Type = attribute.array.constructor;
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(new Type(values[name]), attribute.itemSize, attribute.normalized),
      );
    }
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    Object.assign(mesh, { castShadow, receiveShadow, renderOrder });
    group.add(mesh);
  }
}

const IDENTITY = new THREE.Matrix4();

export function freeze(root) {
  root.traverse(object => {
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
}

const matrix = new THREE.Matrix4();
const rotation = new THREE.Quaternion();
const euler = new THREE.Euler();
const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const tint = new THREE.Color();

/** Collects coloured geometry pieces and merges them into one mesh. */
export class PartsBuilder {
  /** With `bevel`, its boxes have their edges and corners cut off that far, or a third of their thinnest side. */
  constructor({ bevel = 0 } = {}) {
    this.parts = [];
    this.bevel = bevel;
  }

  /**
   * Adds a copy of `geometry`, transformed and painted with a single colour, or
   * with `color(x, y, z)` called for the middle of each triangle (for patterns).
   * Transform: { x, y, z, rx, ry, rz, sx, sy, sz } (all optional), or a Matrix4.
   */
  add(geometry, color, transform = {}) {
    const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(part.attributes)) {
      if (name !== 'position' && name !== 'normal') part.deleteAttribute(name);
    }
    if (transform.isMatrix4) {
      part.applyMatrix4(transform);
    } else {
      const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = transform;
      rotation.setFromEuler(euler.set(rx, ry, rz, 'YXZ'));
      part.applyMatrix4(matrix.compose(position.set(x, y, z), rotation, scale.set(sx, sy, sz)));
    }
    const corners = part.attributes.position;
    const count = corners.count;
    const colors = new Float32Array(count * 3);
    if (typeof color !== 'function') tint.set(color);
    for (let i = 0; i < count; i += 3) {
      if (typeof color === 'function') {
        const mid = k =>
          (corners.getComponent(i, k) + corners.getComponent(i + 1, k) + corners.getComponent(i + 2, k)) / 3;
        tint.set(color(mid(0), mid(1), mid(2)));
      }
      for (let k = 0; k < 3; k++) colors.set([tint.r, tint.g, tint.b], (i + k) * 3);
    }
    part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(part);
    return this;
  }

  box(width, height, depth, color, transform) {
    const cut = Math.min(this.bevel, Math.min(width, height, depth) / 3);
    const geometry = cut > 0.004 ? bevelledBox(width, height, depth, cut) : new THREE.BoxGeometry(width, height, depth);
    return this.add(geometry, color, transform);
  }

  /** A box stretched between two points, e.g. a beam or a rail. */
  beam(from, to, thickness, color, height = thickness) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    return this.box(thickness, height, length, color, {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      z: (from.z + to.z) / 2,
      ry: yaw,
      rx: pitch,
    });
  }

  get isEmpty() {
    return this.parts.length === 0;
  }

  geometry() {
    const merged = mergeGeometries(this.parts);
    merged.computeBoundingSphere();
    return merged;
  }

  mesh({ material = vertexColorMaterial, castShadow = true, receiveShadow = true } = {}) {
    const mesh = new THREE.Mesh(this.geometry(), material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

/**
 * Marks which vertices of `geometry` take the tint of each instance (see foliageMaterial):
 * all of them, except those painted one of the `untinted` colours, such as the trunks.
 */
export function tintable(geometry, untinted = []) {
  const colors = geometry.attributes.color;
  const kept = untinted.map(color => new THREE.Color(color));
  const tinted = new Float32Array(colors.count);
  for (let i = 0; i < colors.count; i++) {
    const [r, g, b] = [colors.getX(i), colors.getY(i), colors.getZ(i)];
    const plain = kept.some(c => Math.abs(c.r - r) + Math.abs(c.g - g) + Math.abs(c.b - b) < 1e-4);
    tinted[i] = plain ? 0 : 1;
  }
  geometry.setAttribute('tinted', new THREE.BufferAttribute(tinted, 1));
  return geometry;
}

/** Builds a non-indexed, vertex-coloured mesh from raw triangles. */
export function triangleGeometry(positions, colors) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const bevelled = new Map();

/**
 * A box `width` by `height` by `depth` with its edges and corners cut off `cut` in: a flat
 * strip along each edge and a small triangle at each corner, which catch the light the way the
 * pressed edges of a car's panels do. Shared between boxes of the same size.
 */
export function bevelledBox(width, height, depth, cut) {
  const key = [width, height, depth, cut].join();
  if (bevelled.has(key)) return bevelled.get(key);
  const half = [width / 2, height / 2, depth / 2];
  // Each corner has three points, one on each face that meets there: on the face across
  // `axis`, pulled in along the other two.
  const point = (signs, axis) => signs.map((sign, k) => sign * (k === axis ? half[k] : half[k] - cut));
  const positions = [];
  const triangle = (a, b, c) => {
    // Wound to face away from the middle, whichever order the points come in.
    const ab = a.map((v, k) => b[k] - v);
    const ac = a.map((v, k) => c[k] - v);
    const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const out = normal[0] * (a[0] + b[0] + c[0]) + normal[1] * (a[1] + b[1] + c[1]) + normal[2] * (a[2] + b[2] + c[2]);
    positions.push(...a, ...(out >= 0 ? [...b, ...c] : [...c, ...b]));
  };
  const quad = (a, b, c, d) => {
    triangle(a, b, c);
    triangle(a, c, d);
  };
  const round = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  const signsOf = (axis, sign, [u, v]) => {
    const signs = [0, 0, 0];
    signs[axis] = sign;
    signs[(axis + 1) % 3] = u;
    signs[(axis + 2) % 3] = v;
    return signs;
  };
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      // The face itself.
      quad(...round.map(uv => point(signsOf(axis, sign, uv), axis)));
      // The strip along each of its edges towards the next axis round, which with every
      // axis and sign covers all twelve edges once.
      const next = (axis + 1) % 3;
      for (const other of [-1, 1]) {
        const ends = [-1, 1].map(w => signsOf(axis, sign, [other, w]));
        quad(point(ends[0], axis), point(ends[1], axis), point(ends[1], next), point(ends[0], next));
      }
    }
  }
  for (const x of [-1, 1])
    for (const y of [-1, 1]) for (const z of [-1, 1]) triangle(...[0, 1, 2].map(axis => point([x, y, z], axis)));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  bevelled.set(key, geometry);
  return geometry;
}

/** Converts a point in a prop's local frame (rotated by `rotation` about Y) to world coordinates. */
export function localFrame(x, z, rotation) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return (lx, lz) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
}

/** How far the edges of the blocks animals are built from are bevelled, so they look softer. */
export const ANIMAL_BEVEL = 0.1;

/** A leg or a head of an animal on its own pivot at (x, y, z) on `parent`, built as its own small mesh, for animating. */
export function limb(parent, x, y, z, build) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(build(new PartsBuilder({ bevel: ANIMAL_BEVEL })).mesh({ receiveShadow: false }));
  parent.add(pivot);
  return pivot;
}

/**
 * A copy of `geometry` with every triangle also facing the other way, so a thin open surface
 * (a band of slats, a railing) can be seen from behind as well as in front.
 */
export function bothSides(geometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const corners = flat.attributes.position.array;
  const points = [];
  for (let i = 0; i < corners.length; i += 9) {
    const [a, b, c] = [0, 3, 6].map(k => [corners[i + k], corners[i + k + 1], corners[i + k + 2]]);
    points.push(a, b, c, a, c, b);
  }
  return prism(points);
}

/** Geometry from a flat list of triangle corners. */
export function prism(points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A gable roof over a `width` x `depth` box whose walls reach `eave`: two slopes rising to
 * `ridge`, as a closed slab `thickness` thick. Its underside meets the tops of the walls, so
 * there is no gap between them, and the slopes carry on down past the walls by `overhang`.
 */
export function gableRoof(width, depth, eave, ridge, overhang = 0.35, thickness = 0.15) {
  const half = width / 2;
  const w = half + overhang;
  const d = depth / 2 + overhang;
  const tip = eave - ((ridge - eave) / half) * overhang;
  const triangles = [];
  /** A four-sided face, wound so that it faces `outward`. */
  const face = (corners, outward) => {
    const [a, b, c] = corners.map(p => new THREE.Vector3(...p));
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const ordered = normal.dot(new THREE.Vector3(...outward)) >= 0 ? corners : [...corners].reverse();
    triangles.push(ordered[0], ordered[1], ordered[2], ordered[0], ordered[2], ordered[3]);
  };
  for (const side of [-1, 1]) {
    const x = side * w;
    // The top of the slope, its underside and the board along the eave.
    face(
      [
        [x, tip + thickness, d],
        [x, tip + thickness, -d],
        [0, ridge + thickness, -d],
        [0, ridge + thickness, d],
      ],
      [side, 1, 0],
    );
    face(
      [
        [x, tip, d],
        [x, tip, -d],
        [0, ridge, -d],
        [0, ridge, d],
      ],
      [-side, -1, 0],
    );
    face(
      [
        [x, tip, d],
        [x, tip, -d],
        [x, tip + thickness, -d],
        [x, tip + thickness, d],
      ],
      [side, 0, 0],
    );
    // The ends of the slab over the gables.
    for (const end of [-1, 1]) {
      const z = end * d;
      face(
        [
          [x, tip, z],
          [x, tip + thickness, z],
          [0, ridge + thickness, z],
          [0, ridge, z],
        ],
        [0, 0, end],
      );
    }
  }
  return prism(triangles);
}

/**
 * Four sloping sides from a `w0` x `d0` rectangle at height `y0` up to a smaller
 * `w1` x `d1` one at `y1`: a hipped roof when the top shrinks to a ridge, or a
 * skirt roof round a building when it doesn't. Open at the top and bottom, and
 * painted on both faces so the eaves still show from underneath.
 */
export function hipRoof(w0, d0, y0, w1, d1, y1) {
  const ring = (w, d, y) => [
    [-w / 2, y, d / 2],
    [w / 2, y, d / 2],
    [w / 2, y, -d / 2],
    [-w / 2, y, -d / 2],
  ];
  const bottom = ring(w0, d0, y0);
  const top = ring(w1, d1, y1);
  const triangles = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    triangles.push([bottom[i], bottom[j], top[j]]);
    // Where the top has shrunk to a point, the second triangle would be empty.
    if (top[i].some((v, k) => v !== top[j][k])) triangles.push([bottom[i], top[j], top[i]]);
  }
  const both = triangles.flatMap(([a, b, c]) => [a, b, c, a, c, b]);
  return prism(both);
}

/**
 * The gables at the front (+Z) and back (-Z) of a box `width` x `depth` whose walls reach
 * `eave`, rising to `ridge`, and the closed attic between them: a triangular prism whose
 * sloping sides lie under a gableRoof built with the same numbers, so the two meet exactly.
 */
export function gableEnds(width, depth, eave, ridge) {
  const w = width / 2;
  const d = depth / 2;
  const [left, right, top] = [
    [-w, eave],
    [w, eave],
    [0, ridge],
  ];
  const at = ([x, y], z) => [x, y, z];
  const quad = (a, b, c, e) => [a, b, c, a, c, e];
  return prism([
    // The gables, facing out.
    at(left, d),
    at(right, d),
    at(top, d),
    at(right, -d),
    at(left, -d),
    at(top, -d),
    // The two slopes and the floor, closing it.
    ...quad(at(right, d), at(right, -d), at(top, -d), at(top, d)),
    ...quad(at(left, -d), at(left, d), at(top, d), at(top, -d)),
    ...quad(at(left, d), at(left, -d), at(right, -d), at(right, d)),
  ]);
}

/**
 * Wood smoke rising from a chimney at `origin`, drifting with the wind. One
 * instanced mesh; puffs swell as they rise and shrink away at the top.
 */
export function createSmoke(scene, origin, { count = 6, rate = 0.11, rise = 8, size = 0.55 } = {}) {
  const material = new THREE.MeshLambertMaterial({
    color: '#e7e8e1',
    transparent: true,
    opacity: 0.4,
    flatShading: true,
    depthWrite: false,
  });
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(size, 0), material, count);
  // Everywhere the puffs go, so the smoke isn't drawn while the chimney is out of view.
  const drift = new THREE.Vector3(1.4, rise / 2, -0.7);
  puffs.boundingSphere = new THREE.Sphere(drift.clone().add(origin), drift.length() + size * 3);
  scene.add(puffs);
  const dummy = new THREE.Object3D();
  return {
    update(time) {
      for (let i = 0; i < count; i++) {
        const t = (time * rate + i / count) % 1;
        dummy.position.set(origin.x + t * 2.8, origin.y + t * rise, origin.z - t * 1.4);
        dummy.scale.setScalar((0.5 + t * 2.2) * Math.min(1, (1 - t) * 3.5));
        dummy.updateMatrix();
        puffs.setMatrixAt(i, dummy.matrix);
      }
      puffs.instanceMatrix.needsUpdate = true;
    },
  };
}
