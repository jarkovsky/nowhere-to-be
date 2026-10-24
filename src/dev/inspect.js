// Checks for the faults that are easy to build into a low-poly model and hard to spot by
// driving round: parts left floating in the air, gaps under a corner on sloping ground,
// surfaces with only one face that can be seen through from behind, faces of different
// colours lying in the same plane that flicker against each other, and floors standing
// higher than the ground the car drives on, which it would sink into. The object viewer
// shows what they find, and the tests keep the world free of them.
//
// Everything works on the meshes as built: the parts merged into one mesh are found again
// as the separate pieces of geometry they were made from (pieces that share no corners).
import * as THREE from 'three';

/** How close two parts must come to count as touching, in metres. */
const TOUCH = 0.03;

const corner = new THREE.Vector3();
const normal = new THREE.Vector3();
const edgeA = new THREE.Vector3();
const edgeB = new THREE.Vector3();
const a3 = new THREE.Vector3();
const b3 = new THREE.Vector3();
const c3 = new THREE.Vector3();
const tint = new THREE.Color();

/** A key for a point, so corners in the same place are found as one. */
const keyOf = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;

/**
 * The separate pieces of geometry in every mesh under `root`, in the world: each with its
 * triangles (`positions`, nine numbers a triangle), their colours, its bounding box, how many of
 * its edges are open (used by only one triangle) and whether its material shows both faces.
 */
export function partsOf(root, { instances = 64 } = {}) {
  root.updateWorldMatrix(true, true);
  const parts = [];
  const matrix = new THREE.Matrix4();
  const instanceMatrix = new THREE.Matrix4();
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.attributes.position) return;
    // See-through effects (spray, foam, a wake) aren't solid things.
    if (mesh.material?.transparent) return;
    const copies = mesh.isInstancedMesh ? Math.min(mesh.count, instances) : 1;
    for (let k = 0; k < copies; k++) {
      matrix.copy(mesh.matrixWorld);
      if (mesh.isInstancedMesh) matrix.multiply((mesh.getMatrixAt(k, instanceMatrix), instanceMatrix));
      parts.push(...piecesOf(mesh, matrix));
    }
  });
  return parts;
}

function piecesOf(mesh, matrix) {
  const { geometry, material } = mesh;
  const position = geometry.attributes.position;
  const color = geometry.attributes.color;
  const index = geometry.index;
  const start = geometry.drawRange.start;
  const count = Math.min(index ? index.count : position.count, geometry.drawRange.count) - start;
  const triangles = Math.floor(count / 3);
  if (triangles <= 0) return [];
  const vertexAt = i => (index ? index.getX(start + i) : start + i);
  const base = material?.color ?? new THREE.Color('#ffffff');
  const both = material?.side === THREE.DoubleSide;

  // Corners in the world, and which triangles meet along each edge.
  const world = new Float32Array(triangles * 9);
  const colors = new Float32Array(triangles * 3);
  const keys = new Array(triangles * 3);
  const parent = Int32Array.from({ length: triangles }, (_, t) => t);
  const find = t => {
    while (parent[t] !== t) t = parent[t] = parent[parent[t]];
    return t;
  };
  const owner = new Map();
  for (let t = 0; t < triangles; t++) {
    tint.setRGB(0, 0, 0);
    for (let c = 0; c < 3; c++) {
      const v = vertexAt(t * 3 + c);
      corner.fromBufferAttribute(position, v).applyMatrix4(matrix);
      world.set([corner.x, corner.y, corner.z], t * 9 + c * 3);
      keys[t * 3 + c] = keyOf(corner.x, corner.y, corner.z);
      if (color) tint.r += color.getX(v) / 3;
      if (color) tint.g += color.getY(v) / 3;
      if (color) tint.b += color.getZ(v) / 3;
    }
    if (!color) tint.setRGB(1, 1, 1);
    colors.set([tint.r * base.r, tint.g * base.g, tint.b * base.b], t * 3);
    // Triangles sharing an edge belong to the same piece; parts that only touch at a corner don't.
    for (let c = 0; c < 3; c++) {
      const [a, b] = [keys[t * 3 + c], keys[t * 3 + ((c + 1) % 3)]];
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      const other = owner.get(edge);
      if (other === undefined) owner.set(edge, t);
      else parent[find(t)] = find(other);
    }
  }

  const groups = new Map();
  for (let t = 0; t < triangles; t++) {
    const root = find(t);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(t);
  }
  const pieces = [];
  for (const list of groups.values()) {
    const positions = new Float32Array(list.length * 9);
    const shades = new Float32Array(list.length * 3);
    const box = new THREE.Box3();
    const edges = new Map();
    list.forEach((t, n) => {
      positions.set(world.subarray(t * 9, t * 9 + 9), n * 9);
      shades.set(colors.subarray(t * 3, t * 3 + 3), n * 3);
      for (let c = 0; c < 3; c++) {
        box.expandByPoint(corner.fromArray(world, t * 9 + c * 3));
        const [a, b] = [keys[t * 3 + c], keys[t * 3 + ((c + 1) % 3)]];
        const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    });
    // The edges used by only one triangle, as the two ends of each.
    const openEdges = [];
    for (const [edge, uses] of edges) {
      if (uses === 1) openEdges.push(edge.split('|').map(key => key.split(',').map(n => Number(n) / 1e4)));
    }
    pieces.push({
      mesh,
      positions,
      colors: shades,
      box,
      open: openEdges.length,
      openEdges,
      both,
      triangles: list.length,
    });
  }
  return pieces;
}

/** The lowest the ground gets under a box, and the highest, sampled at its corners and middle. */
function groundUnder(box, ground) {
  const xs = [box.min.x, (box.min.x + box.max.x) / 2, box.max.x];
  const zs = [box.min.z, (box.min.z + box.max.z) / 2, box.max.z];
  let low = Infinity;
  let high = -Infinity;
  for (const x of xs) {
    for (const z of zs) {
      const h = ground(x, z);
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
  }
  return { low, high };
}

const describe = box =>
  `${box.min.x.toFixed(1)},${box.min.y.toFixed(1)},${box.min.z.toFixed(1)} to ${box.max.x.toFixed(1)},${box.max.y.toFixed(1)},${box.max.z.toFixed(1)}`;

/**
 * Parts not touching the ground or anything that does. With `anchored`, the biggest group of
 * touching parts counts as held up too (a vehicle's body on its wheels, say).
 */
function floating(parts, ground, anchored) {
  const n = parts.length;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = i => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  // Sweep along X: only parts whose spans overlap there can touch.
  const order = [...parts.keys()].sort((a, b) => parts[a].box.min.x - parts[b].box.min.x);
  for (let i = 0; i < n; i++) {
    const a = parts[order[i]].box;
    for (let j = i + 1; j < n; j++) {
      const b = parts[order[j]].box;
      if (b.min.x > a.max.x + TOUCH) break;
      if (b.min.y > a.max.y + TOUCH || a.min.y > b.max.y + TOUCH) continue;
      if (b.min.z > a.max.z + TOUCH || a.min.z > b.max.z + TOUCH) continue;
      parent[find(order[i])] = find(order[j]);
    }
  }
  const groups = new Map();
  parts.forEach((part, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, { parts: [], held: false, size: 0, box: new THREE.Box3() });
    const group = groups.get(root);
    group.parts.push(part);
    group.size += part.triangles;
    group.box.union(part.box);
    if (ground && part.box.min.y <= groundUnder(part.box, ground).high + TOUCH) group.held = true;
  });
  const list = [...groups.values()];
  if (anchored || !ground) list.reduce((a, b) => (b.size > a.size ? b : a)).held = true;
  return list
    .filter(group => !group.held)
    .map(group => ({
      kind: 'floating',
      message: `${group.parts.length} part(s) touch nothing that stands on the ground (${describe(group.box)})`,
      box: group.box,
      parts: group.parts,
    }));
}

/** The corners of a part's downward faces: where it would meet the ground. */
function footprint(part) {
  const { positions } = part;
  const corners = [];
  for (let t = 0; t < positions.length / 9; t++) {
    a3.fromArray(positions, t * 9);
    b3.fromArray(positions, t * 9 + 3);
    c3.fromArray(positions, t * 9 + 6);
    normal.crossVectors(edgeA.subVectors(b3, a3), edgeB.subVectors(c3, a3));
    if (normal.lengthSq() < 1e-8 || normal.normalize().y > -0.7) continue;
    corners.push(a3.clone(), b3.clone(), c3.clone());
  }
  // Only the underside at the bottom, not the eaves of a roof built in the same piece.
  return corners.filter(p => p.y < part.box.min.y + 1);
}

/** Parts standing on the ground with a gap under one end, where the ground falls away. */
function gapsUnder(parts, ground) {
  const issues = [];
  for (const part of parts) {
    const { box } = part;
    const [wide, deep] = [box.max.x - box.min.x, box.max.z - box.min.z];
    // Too small to see a gap under, or big enough to be ground in its own right.
    if ((wide < 0.4 && deep < 0.4) || wide > 25 || deep > 25) continue;
    let rest;
    let gap;
    const corners = footprint(part);
    if (corners.length) {
      // How high each corner of its underside is above the ground there.
      const heights = corners.map(p => p.y - ground(p.x, p.z));
      [rest, gap] = [Math.min(...heights), Math.max(...heights)];
    } else {
      const { low, high } = groundUnder(box, ground);
      if (box.min.y < low - 0.05) continue;
      [rest, gap] = [box.min.y - high, box.min.y - low];
    }
    // Only parts that rest on the ground somewhere, not ones raised up on something else.
    if (rest > TOUCH) continue;
    if (gap > 0.12) {
      issues.push({
        kind: 'gap-under',
        message: `a gap of ${gap.toFixed(2)} m under a corner (${describe(box)})`,
        box,
        parts: [part],
      });
    }
  }
  return issues;
}

/** Surfaces with open edges and only one face: from behind they can't be seen at all. */
function oneSided(parts, ground) {
  // Open along the bottom where it stands in the ground is fine: nobody sees in from there.
  const showing = ([x, y, z]) => y > ground(x, z) + 0.15;
  return parts
    .filter(part => !part.both && part.openEdges.some(([a, b]) => showing(a) || showing(b)))
    .map(part => ({
      kind: 'one-sided',
      message: `an open surface with only one face, see-through from behind (${describe(part.box)})`,
      box: part.box,
      parts: [part],
    }));
}

/** True if two triangles in the same plane, flattened onto it (as [x, y] pairs), overlap by more than a sliver. */
function overlap(p, q) {
  for (const tri of [p, q]) {
    for (let i = 0; i < 3; i++) {
      const [x0, y0] = tri[i];
      const [x1, y1] = tri[(i + 1) % 3];
      // An axis at right angles to this edge, and how far each triangle reaches along it.
      const [ax, ay] = [y0 - y1, x1 - x0];
      const length = Math.hypot(ax, ay) || 1;
      const span = t => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const [x, y] of t) {
          const d = (x * ax + y * ay) / length;
          lo = Math.min(lo, d);
          hi = Math.max(hi, d);
        }
        return [lo, hi];
      };
      const [plo, phi] = span(p);
      const [qlo, qhi] = span(q);
      if (Math.min(phi, qhi) - Math.max(plo, qlo) < 0.01) return false;
    }
  }
  return true;
}

/** True if a triangle of `part` sits just inside a closed part other than the two compared. */
function hidden(parts, part, face) {
  const at = part.positions.subarray(face.t * 9, face.t * 9 + 9);
  // A little way out from the middle of the face, where it would be seen from.
  const x = (at[0] + at[3] + at[6]) / 3 + face.n.x * 0.02;
  const y = (at[1] + at[4] + at[7]) / 3 + face.n.y * 0.02;
  const z = (at[2] + at[5] + at[8]) / 3 + face.n.z * 0.02;
  return parts.some(
    other =>
      other !== part &&
      other.open === 0 &&
      x > other.box.min.x + 0.005 &&
      x < other.box.max.x - 0.005 &&
      y > other.box.min.y + 0.005 &&
      y < other.box.max.y - 0.005 &&
      z > other.box.min.z + 0.005 &&
      z < other.box.max.z - 0.005,
  );
}

/** Faces of different colours from different parts lying in the same plane, facing the same way: they flicker. */
function flicker(parts, ground) {
  const planes = new Map();
  parts.forEach((part, p) => {
    const { positions } = part;
    for (let t = 0; t < positions.length / 9; t++) {
      a3.fromArray(positions, t * 9);
      b3.fromArray(positions, t * 9 + 3);
      c3.fromArray(positions, t * 9 + 6);
      normal.crossVectors(edgeA.subVectors(b3, a3), edgeB.subVectors(c3, a3));
      const area = normal.length() / 2;
      if (area < 1e-3) continue;
      normal.normalize();
      // Undersides low down (in the ground, or under a vehicle) are never seen from the camera up above.
      if (
        normal.y < -0.9 &&
        (a3.y + b3.y + c3.y) / 3 < ground((a3.x + b3.x + c3.x) / 3, (a3.z + b3.z + c3.z) / 3) + 1.2
      )
        continue;
      const d = normal.dot(a3);
      const key = `${Math.round(normal.x * 200)},${Math.round(normal.y * 200)},${Math.round(normal.z * 200)},${Math.round(d * 100)}`;
      if (!planes.has(key)) planes.set(key, []);
      planes.get(key).push({ p, t, n: normal.clone() });
    }
  });
  const found = new Map();
  for (const list of planes.values()) {
    if (list.length < 2 || new Set(list.map(f => f.p)).size < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [f, g] = [list[i], list[j]];
        if (f.p === g.p) continue;
        const pair = f.p < g.p ? `${f.p}|${g.p}` : `${g.p}|${f.p}`;
        if (found.has(pair)) continue;
        const [pa, pb] = [parts[f.p], parts[g.p]];
        const shade = (part, t) => part.colors.subarray(t * 3, t * 3 + 3);
        const [ca, cb] = [shade(pa, f.t), shade(pb, g.t)];
        if (Math.abs(ca[0] - cb[0]) + Math.abs(ca[1] - cb[1]) + Math.abs(ca[2] - cb[2]) < 0.03) continue;
        // Flatten both onto the plane, dropping the axis it faces most along.
        const axis =
          Math.abs(f.n.x) > Math.abs(f.n.y)
            ? Math.abs(f.n.x) > Math.abs(f.n.z)
              ? 0
              : 2
            : Math.abs(f.n.y) > Math.abs(f.n.z)
              ? 1
              : 2;
        const flat = (part, t) =>
          [0, 1, 2].map(c => {
            const v = part.positions.subarray(t * 9 + c * 3, t * 9 + c * 3 + 3);
            return axis === 0 ? [v[1], v[2]] : axis === 1 ? [v[0], v[2]] : [v[0], v[1]];
          });
        if (!overlap(flat(pa, f.t), flat(pb, g.t))) continue;
        // Faces shut away inside another solid part can't be seen at all.
        if (hidden(parts, pa, f) || hidden(parts, pb, g)) continue;
        const box = pa.box.clone().union(pb.box);
        found.set(pair, {
          kind: 'flicker',
          message: `two parts of different colours share a face, which flickers (${describe(box)})`,
          box,
          parts: [pa, pb],
        });
      }
    }
  }
  return [...found.values()];
}

/**
 * Level tops a car could drive onto or into, standing higher than the ground the car is set
 * on there: it would sink into them. Spots inside obstacles don't count; nothing gets there.
 */
function sinks(parts, ground, drivable, obstacles) {
  const issues = [];
  for (const part of parts) {
    const { positions } = part;
    let worst = null;
    for (let t = 0; t < positions.length / 9; t++) {
      a3.fromArray(positions, t * 9);
      b3.fromArray(positions, t * 9 + 3);
      c3.fromArray(positions, t * 9 + 6);
      normal.crossVectors(edgeA.subVectors(b3, a3), edgeB.subVectors(c3, a3));
      const area = normal.length() / 2;
      if (area < 0.025 || normal.normalize().y < 0.97) continue;
      // A strip narrower than a hand, like a rail, the tyres just ride over.
      const longest = Math.max(a3.distanceTo(b3), b3.distanceTo(c3), c3.distanceTo(a3));
      if ((area * 2) / longest < 0.2) continue;
      const x = (a3.x + b3.x + c3.x) / 3;
      const y = (a3.y + b3.y + c3.y) / 3;
      const z = (a3.z + b3.z + c3.z) / 3;
      const floor = ground(x, z);
      if (y < floor + 0.1 || y > floor + 0.9) continue;
      if (obstacles && [...obstacles.near(x, z, 1)].some(o => inside(o, x, z))) continue;
      const sink = y - drivable(x, z);
      if (sink > 0.1 && (!worst || sink > worst.sink)) worst = { sink, x, y, z };
    }
    if (worst) {
      issues.push({
        kind: 'sinks',
        message: `a car would sink ${worst.sink.toFixed(2)} m into this floor at ${worst.x.toFixed(1)}, ${worst.z.toFixed(1)}`,
        box: part.box,
        parts: [part],
      });
    }
  }
  return issues;
}

function inside(obstacle, x, z) {
  let [cx, cz] = [obstacle.x, obstacle.z];
  if ('ax' in obstacle) {
    const dx = obstacle.bx - obstacle.ax;
    const dz = obstacle.bz - obstacle.az;
    const t = Math.max(0, Math.min(1, ((x - obstacle.ax) * dx + (z - obstacle.az) * dz) / (dx * dx + dz * dz || 1)));
    [cx, cz] = [obstacle.ax + dx * t, obstacle.az + dz * t];
  }
  return Math.hypot(x - cx, z - cz) < obstacle.radius + 0.6;
}

/**
 * Everything wrong with the meshes under `root`. `ground(x, z)` is the ground's height (leave it
 * out for a model on its own, which stands at y = 0); `drivable(x, z)` the height the car's wheels
 * would be at, with `obstacles` (an obstacle index) for where it can't go; `anchored` lets the
 * biggest group of parts hold itself up; `skip` leaves out kinds of fault.
 */
export function inspect(root, { ground = null, drivable = null, obstacles = null, anchored = false, skip = [] } = {}) {
  const parts = partsOf(root);
  if (!parts.length) return [];
  const level = ground ?? (() => 0);
  const issues = [];
  if (!skip.includes('floating')) issues.push(...floating(parts, level, anchored || !ground));
  if (!skip.includes('gap-under') && ground) issues.push(...gapsUnder(parts, ground));
  if (!skip.includes('one-sided')) issues.push(...oneSided(parts, level));
  if (!skip.includes('flicker')) issues.push(...flicker(parts, level));
  if (!skip.includes('sinks') && ground && drivable) issues.push(...sinks(parts, ground, drivable, obstacles));
  return issues;
}
