// Checks for the faults that are easy to build into a low-poly model and hard to spot by
// driving round: parts left floating in the air, held up by nothing their surfaces touch,
// gaps under a corner on sloping ground, surfaces with only one face that can be seen through
// from behind, faces of different colours lying in the same plane that flicker against each
// other, floors standing higher than the ground the car drives on, which it would sink into,
// gaps between the top of a wall and the roof over it, and walls the car can drive into
// before the obstacles stop it. The object viewer shows what they find, `npm run check` lists
// it, and the tests keep new ones out of the world.
//
// Everything works on the meshes as built: the parts merged into one mesh are found again
// as the separate pieces of geometry they were made from (pieces that share no corners).
// Only what shows is checked: nothing in a hidden group.
import * as THREE from 'three';
import { penetration } from '../core/collision.js';

/** How close two parts must come to count as touching, in metres. */
const TOUCH = 0.03;
/**
 * How close a part must come to another to count as held up by it. A little more than
 * touching: wheels stand clear of their arches and a roof rack just clear of the roof, and
 * gaps that small can hardly be seen.
 */
const ATTACHED = 0.1;

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
/** An edge's key is the pair of its corners' ids, `a * EDGE_STRIDE + b`: more corners than any mesh has. */
const EDGE_STRIDE = 0x200000;

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
  // Only what shows: a hidden group (a folded-away tent, say) hides everything in it.
  root.traverseVisible(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
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

  // Corners in the world, each welded to an id shared by corners in the same place, and
  // which triangles meet along each edge (an edge is the pair of its corners' ids).
  const world = new Float32Array(triangles * 9);
  const colors = new Float32Array(triangles * 3);
  const ids = new Int32Array(triangles * 3);
  const points = [];
  const welded = new Map();
  const edgeKey = (t, c) => {
    const a = ids[t * 3 + c];
    const b = ids[t * 3 + ((c + 1) % 3)];
    return a < b ? a * EDGE_STRIDE + b : b * EDGE_STRIDE + a;
  };
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
      const o = t * 9 + c * 3;
      world[o] = corner.x;
      world[o + 1] = corner.y;
      world[o + 2] = corner.z;
      const key = keyOf(corner.x, corner.y, corner.z);
      let id = welded.get(key);
      if (id === undefined) {
        id = points.length;
        welded.set(key, id);
        points.push(key);
      }
      ids[t * 3 + c] = id;
      if (color) tint.r += color.getX(v) / 3;
      if (color) tint.g += color.getY(v) / 3;
      if (color) tint.b += color.getZ(v) / 3;
    }
    if (!color) tint.setRGB(1, 1, 1);
    colors[t * 3] = tint.r * base.r;
    colors[t * 3 + 1] = tint.g * base.g;
    colors[t * 3 + 2] = tint.b * base.b;
    // Triangles sharing an edge belong to the same piece; parts that only touch at a corner don't.
    for (let c = 0; c < 3; c++) {
      const edge = edgeKey(t, c);
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
    // A surface made to be seen from both sides (bothSides, hipRoof) has every triangle twice,
    // once facing each way. Each pair counts once, so its edges still show where it is open.
    const seen = new Map();
    let twins = 0;
    list.forEach((t, n) => {
      positions.set(world.subarray(t * 9, t * 9 + 9), n * 9);
      shades.set(colors.subarray(t * 3, t * 3 + 3), n * 3);
      for (let c = 0; c < 3; c++) box.expandByPoint(corner.fromArray(world, t * 9 + c * 3));
      const [p, q, r] = [ids[t * 3], ids[t * 3 + 1], ids[t * 3 + 2]];
      const key = [p, q, r].sort((u, v) => u - v).join(',');
      // Which way round the corners go: an even or an odd shuffle of them in order.
      const winding = (Number(p > q) + Number(p > r) + Number(q > r)) % 2;
      if (seen.has(key)) {
        if (seen.get(key) !== winding) twins++;
        return;
      }
      seen.set(key, winding);
      for (let c = 0; c < 3; c++) {
        const edge = edgeKey(t, c);
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    });
    // The edges used by only one triangle, as the two ends of each.
    const openEdges = [];
    for (const [edge, uses] of edges) {
      if (uses === 1) {
        const a = Math.floor(edge / EDGE_STRIDE);
        const b = edge - a * EDGE_STRIDE;
        openEdges.push([points[a], points[b]].map(key => key.split(',').map(n => Number(n) / 1e4)));
      }
    }
    pieces.push({
      mesh,
      positions,
      colors: shades,
      box,
      open: openEdges.length,
      openEdges,
      both: both || twins * 2 >= list.length * 0.9,
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

/** Each triangle's bounding box, six numbers a triangle (lowest x, y, z, then highest), worked out once. */
function triangleBoxes(part) {
  if (part.triangleBoxes) return part.triangleBoxes;
  const { positions } = part;
  const boxes = new Float32Array((positions.length / 9) * 6);
  for (let t = 0; t < positions.length / 9; t++) {
    for (let k = 0; k < 3; k++) {
      const [p, q, r] = [positions[t * 9 + k], positions[t * 9 + 3 + k], positions[t * 9 + 6 + k]];
      boxes[t * 6 + k] = Math.min(p, q, r);
      boxes[t * 6 + 3 + k] = Math.max(p, q, r);
    }
  }
  return (part.triangleBoxes = boxes);
}

/** The triangles of `part` whose boxes reach into the box `region`. */
function trianglesIn(part, region) {
  const boxes = triangleBoxes(part);
  const { min, max } = region;
  const found = [];
  for (let t = 0; t < boxes.length / 6; t++) {
    const o = t * 6;
    if (boxes[o] > max.x || boxes[o + 1] > max.y || boxes[o + 2] > max.z) continue;
    if (boxes[o + 3] < min.x || boxes[o + 4] < min.y || boxes[o + 5] < min.z) continue;
    found.push(t);
  }
  return found;
}

const plane = new THREE.Vector3();
/**
 * Where `ray` passes through `triangle`, or null. A ray running along the triangle's plane never
 * passes through it: Ray.intersectTriangle divides by how steeply it meets the plane, and for one
 * lying in it, that gives a point anywhere.
 */
function crossing(ray, triangle, target) {
  if (Math.abs(ray.direction.dot(triangle.getNormal(plane))) < 1e-6) return null;
  return ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, target);
}

const triA = new THREE.Triangle();
const triB = new THREE.Triangle();
/** Sets `triangle` to the one whose nine numbers start at `offset` in `positions`. */
function triangleAt(triangle, positions, offset) {
  triangle.a.fromArray(positions, offset);
  triangle.b.fromArray(positions, offset + 3);
  triangle.c.fromArray(positions, offset + 6);
  return triangle;
}
const closest = new THREE.Vector3();
const ray = new THREE.Ray();
const hit = new THREE.Vector3();
const d1 = new THREE.Vector3();
const d2 = new THREE.Vector3();
const gap = new THREE.Vector3();

/** The shortest distance between the segments p1-q1 and p2-q2. */
function segmentGap(p1, q1, p2, q2) {
  d1.subVectors(q1, p1);
  d2.subVectors(q2, p2);
  gap.subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(gap);
  let s = 0;
  let t = 0;
  if (a < 1e-12 && e < 1e-12) return p1.distanceTo(p2);
  if (a < 1e-12) {
    t = clamp01(f / e);
  } else {
    const c = d1.dot(gap);
    if (e < 1e-12) {
      s = clamp01(-c / a);
    } else {
      const b = d1.dot(d2);
      const denominator = a * e - b * b;
      s = denominator > 1e-12 ? clamp01((b * f - c * e) / denominator) : 0;
      t = (b * s + f) / e;
      if (t < 0) [t, s] = [0, clamp01(-c / a)];
      else if (t > 1) [t, s] = [1, clamp01((b - c) / a)];
    }
  }
  return gap.copy(p1).addScaledVector(d1, s).sub(closest.copy(p2).addScaledVector(d2, t)).length();
}
const clamp01 = v => Math.max(0, Math.min(1, v));

/** True if two triangles come within `within` of each other, or cross. */
function trianglesMeet(p, q, within = TOUCH) {
  for (const v of [p.a, p.b, p.c]) if (q.closestPointToPoint(v, closest).distanceTo(v) < within) return true;
  for (const v of [q.a, q.b, q.c]) if (p.closestPointToPoint(v, closest).distanceTo(v) < within) return true;
  for (const [s, other] of [
    [p, q],
    [q, p],
  ]) {
    for (const [u, w] of [
      [s.a, s.b],
      [s.b, s.c],
      [s.c, s.a],
    ]) {
      // An edge passing through the other triangle.
      ray.origin.copy(u);
      ray.direction.subVectors(w, u);
      const length = ray.direction.length();
      if (length < 1e-9) continue;
      ray.direction.divideScalar(length);
      if (crossing(ray, other, hit) && hit.distanceTo(u) <= length) return true;
      if (s !== p) continue;
      for (const [x, y] of [
        [other.a, other.b],
        [other.b, other.c],
        [other.c, other.a],
      ]) {
        if (segmentGap(u, w, x, y) < within) return true;
      }
    }
  }
  return false;
}

/** The distance between two triangles: 0 if they cross. */
function triangleDistance(p, q) {
  let best = Infinity;
  for (const v of [p.a, p.b, p.c]) best = Math.min(best, q.closestPointToPoint(v, closest).distanceTo(v));
  for (const v of [q.a, q.b, q.c]) best = Math.min(best, p.closestPointToPoint(v, closest).distanceTo(v));
  for (const [u, w] of [
    [p.a, p.b],
    [p.b, p.c],
    [p.c, p.a],
  ]) {
    for (const [x, y] of [
      [q.a, q.b],
      [q.b, q.c],
      [q.c, q.a],
    ]) {
      best = Math.min(best, segmentGap(u, w, x, y));
    }
  }
  return trianglesMeet(p, q) ? 0 : best;
}

/** How far apart the surfaces of two parts are, looking no further than `reach`. */
function distanceBetween(a, b, reach) {
  const region = a.box.clone().expandByScalar(reach).intersect(b.box.clone().expandByScalar(reach));
  if (region.isEmpty()) return Infinity;
  const near = trianglesIn(b, region);
  let best = Infinity;
  for (const i of trianglesIn(a, region)) {
    triangleAt(triA, a.positions, i * 9);
    for (const j of near) best = Math.min(best, triangleDistance(triA, triangleAt(triB, b.positions, j * 9)));
  }
  return best;
}

/** True if a point is inside a closed part: a ray from it crosses the part's surface an odd number of times. */
function enclosed(point, part) {
  const { positions } = part;
  ray.origin.copy(point);
  ray.direction.set(0.57, 0.61, 0.55).normalize();
  let crossings = 0;
  for (let t = 0; t < positions.length / 9; t++) {
    triangleAt(triA, positions, t * 9);
    if (crossing(ray, triA, hit)) crossings++;
  }
  return crossings % 2 === 1;
}

/** True if the surfaces of two parts come within ATTACHED of each other, or one is shut away inside the other. */
function touching(a, b) {
  const region = a.box.clone().expandByScalar(ATTACHED).intersect(b.box.clone().expandByScalar(ATTACHED));
  if (region.isEmpty()) return false;
  const near = trianglesIn(b, region);
  if (near.length) {
    for (const i of trianglesIn(a, region)) {
      triangleAt(triA, a.positions, i * 9);
      for (const j of near) {
        triangleAt(triB, b.positions, j * 9);
        if (trianglesMeet(triA, triB, ATTACHED)) return true;
      }
    }
  }
  for (const [inner, outer] of [
    [a, b],
    [b, a],
  ]) {
    if (outer.open === 0 && outer.box.containsBox(inner.box) && enclosed(corner.fromArray(inner.positions, 0), outer))
      return true;
  }
  return false;
}

/**
 * Parts not touching the ground or anything that does: touching means their surfaces come
 * within TOUCH of each other, not just their boxes. With `anchored`, the biggest group of
 * touching parts counts as held up too (a vehicle's body, standing on its wheels).
 */
function floating(parts, ground, anchored) {
  const n = parts.length;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = i => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const grounded = parts.map(part => part.box.min.y <= groundUnder(part.box, ground).high + TOUCH);
  // Which groups are held up, by the root of each.
  const held = Uint8Array.from(grounded, Number);
  // Sweep along X: only parts whose spans overlap there can touch.
  const order = [...parts.keys()].sort((a, b) => parts[a].box.min.x - parts[b].box.min.x);
  for (let i = 0; i < n; i++) {
    const a = parts[order[i]].box;
    for (let j = i + 1; j < n; j++) {
      const b = parts[order[j]].box;
      if (b.min.x > a.max.x + ATTACHED) break;
      if (b.min.y > a.max.y + ATTACHED || a.min.y > b.max.y + ATTACHED) continue;
      if (b.min.z > a.max.z + ATTACHED || a.min.z > b.max.z + ATTACHED) continue;
      const [ra, rb] = [find(order[i]), find(order[j])];
      // Already together, or both already held up: whether they touch can't change anything.
      if (ra === rb || (!anchored && held[ra] && held[rb])) continue;
      if (!touching(parts[order[i]], parts[order[j]])) continue;
      parent[ra] = rb;
      held[rb] = held[rb] || held[ra];
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
    if (grounded[i]) group.held = true;
  });
  const list = [...groups.values()];
  if (anchored) list.reduce((a, b) => (b.size > a.size ? b : a)).held = true;
  return list
    .filter(group => !group.held)
    .map(group => {
      // How far it is from the nearest other part, within a metre, to see how big the gap is.
      let nearest = Infinity;
      for (const part of group.parts) {
        for (const other of parts) {
          if (!group.parts.includes(other)) nearest = Math.min(nearest, distanceBetween(part, other, 1));
        }
      }
      const away = Number.isFinite(nearest) ? `, ${nearest.toFixed(2)} m from the nearest other part` : '';
      return {
        kind: 'floating',
        message: `${group.parts.length} part(s) touch nothing that stands on the ground${away} (${describe(group.box)})`,
        box: group.box,
        parts: group.parts,
        gap: nearest,
      };
    });
}

/**
 * The nearest surface straight above (x, y, z) among `parts`: how far up it is, the part it
 * belongs to, and which way it faces there (-1 down, 1 up, 0 both: a sheet seen from both sides).
 */
function above(parts, x, y, z, reach) {
  let best = { distance: Infinity, part: null, facing: 0 };
  for (const part of parts) {
    const { box } = part;
    if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z || box.max.y <= y || box.min.y > y + reach)
      continue;
    const boxes = triangleBoxes(part);
    const { positions } = part;
    for (let t = 0; t < positions.length / 9; t++) {
      const o = t * 6;
      if (x < boxes[o] || x > boxes[o + 3] || z < boxes[o + 2] || z > boxes[o + 5] || boxes[o + 4] <= y) continue;
      // Where the upright line through (x, z) meets the triangle, by its corners' weights there.
      const p = t * 9;
      const [ax, ay, az] = [positions[p], positions[p + 1], positions[p + 2]];
      const [bx, by, bz] = [positions[p + 3], positions[p + 4], positions[p + 5]];
      const [cx, cy, cz] = [positions[p + 6], positions[p + 7], positions[p + 8]];
      const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (Math.abs(area) < 1e-9) continue;
      const u = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / area;
      const v = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / area;
      const w = 1 - u - v;
      if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
      const distance = u * ay + v * by + w * cy - y;
      if (distance <= 1e-4 || distance > reach) continue;
      // The triangle faces up if its corners go anticlockwise seen from above.
      const facing = area < 0 ? 1 : -1;
      if (distance < best.distance - 1e-4) best = { distance, part, facing };
      else if (Math.abs(distance - best.distance) <= 1e-4 && facing !== best.facing) best.facing = 0;
    }
  }
  return best;
}

/** True if anything among `parts` lies along the segment from `from`, `length` long in the unit direction `direction`. */
function blocked(parts, from, direction, length) {
  ray.origin.copy(from);
  ray.direction.copy(direction);
  const reach = new THREE.Box3().setFromPoints([from, closest.copy(from).addScaledVector(direction, length)]);
  for (const part of parts) {
    if (!part.box.intersectsBox(reach)) continue;
    for (const t of trianglesIn(part, reach)) {
      triangleAt(triA, part.positions, t * 9);
      if (crossing(ray, triA, hit) && hit.distanceTo(from) <= length) return true;
    }
  }
  return false;
}

/**
 * Gaps between the top of a wall and the roof hanging over it: the roof reaches out past the
 * wall, but its underside stays clear of the wall's top edge, which leaves a dark slot all along
 * under the eaves. Looks up from points along the top edges of every part tall and wide enough
 * to be a wall, and leaves out gaps filled by something standing in the wall's plane (a gable).
 */
function roofGaps(parts) {
  const issues = new Map();
  for (const wall of parts) {
    const { box } = wall;
    const size = box.getSize(corner);
    // Walls are plain blocks: rock, dunes and trees are built of many more triangles.
    if (wall.both || wall.triangles > 150 || size.y < 1.2 || Math.min(size.x, size.z) < 1) continue;
    // The edges round its flat tops: those of upward-facing triangles used by just one of them.
    const { positions } = wall;
    const edges = new Map();
    const tops = new Map();
    const areas = new Map();
    for (let t = 0; t < positions.length / 9; t++) {
      triangleAt(triA, positions, t * 9);
      if (triA.getNormal(normal).y < 0.9) continue;
      const level = Math.round(triA.a.y * 100);
      if (!tops.has(level)) tops.set(level, []);
      areas.set(level, (areas.get(level) ?? 0) + triA.getArea());
      for (const [p, q] of [
        [triA.a, triA.b],
        [triA.b, triA.c],
        [triA.c, triA.a],
      ]) {
        tops.get(level).push(p.clone());
        const key = [keyOf(p.x, p.y, p.z), keyOf(q.x, q.y, q.z)].sort().join('|');
        if (edges.has(key)) edges.get(key).uses++;
        else edges.set(key, { p: p.clone(), q: q.clone(), uses: 1, level });
      }
    }
    // The middle of each flat top, to tell which way is out from it.
    const middles = new Map();
    for (const [level, points] of tops) {
      middles.set(level, points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length));
    }
    // A wall is under a roof, or under the storey above it: something over the middle of its top.
    // (Not a vehicle parked half under the eaves.)
    const covered = new Map();
    for (const [level, middle] of middles) {
      covered.set(level, Boolean(above(parts, middle.x, middle.y + 0.001, middle.z, 30).part));
    }
    for (const { p, q, uses, level } of edges.values()) {
      // The top of a wall, not of a board (a door, a shutter) standing on its face.
      if (uses !== 1 || areas.get(level) < 0.8 || !covered.get(level)) continue;
      const length = p.distanceTo(q);
      const steps = Math.max(2, Math.ceil(length / 0.5));
      // Out from the wall, square to this edge.
      const out = new THREE.Vector3(q.z - p.z, 0, p.x - q.x).normalize();
      if (out.dot(a3.lerpVectors(p, q, 0.5).sub(middles.get(level))) < 0) out.negate();
      for (let k = 1; k < steps; k++) {
        const point = a3.lerpVectors(p, q, k / steps).addScaledVector(out, 0.005);
        const roof = above(parts, point.x, point.y, point.z, 1.5);
        // Nothing over it, sealed against it, or inside a solid roof's slab (its first surface faces up).
        if (!roof.part || roof.distance <= 0.08 || roof.facing === 1) continue;
        // Or filled by something solid in between, a collar, say.
        const gap = closest.copy(point).setY(point.y + roof.distance / 2);
        if (parts.some(part => !part.open && part.box.containsPoint(gap) && enclosed(gap, part))) continue;
        // Only a roof that hangs out past the wall: eaves, not something standing on top further in.
        const eave = above([roof.part], point.x + out.x * 0.3, point.y, point.z + out.z * 0.3, 2);
        if (!eave.part) continue;
        // And only a gap left open: not one filled by a gable standing in the wall's plane, or by
        // the wall going on up behind something standing on its face.
        const middle = b3
          .copy(point)
          .addScaledVector(out, 0.045)
          .setY(point.y + roof.distance / 2);
        if (blocked(parts, middle, c3.copy(out).negate(), 0.6)) continue;
        const key = `${parts.indexOf(wall)}|${parts.indexOf(roof.part)}`;
        const worst = issues.get(key);
        if (!worst || roof.distance > worst.gap) {
          issues.set(key, { gap: roof.distance, at: point.clone(), wall, roof: roof.part });
        }
      }
    }
  }
  return [...issues.values()].map(({ gap, at, wall, roof }) => ({
    kind: 'roof-gap',
    message: `a gap of ${gap.toFixed(2)} m between the top of a wall and the roof over it (${at.x.toFixed(1)}, ${at.y.toFixed(1)}, ${at.z.toFixed(1)})`,
    box: new THREE.Box3(
      new THREE.Vector3(at.x - 0.3, at.y, at.z - 0.3),
      new THREE.Vector3(at.x + 0.3, at.y + gap, at.z + 0.3),
    ),
    parts: [wall, roof],
    gap,
  }));
}

/** The corners of the smallest convex outline round some [x, z] points, in order. */
function outlineOf(points) {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const turn = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const half = list => {
    const chain = [];
    for (const p of list) {
      while (chain.length >= 2 && turn(chain.at(-2), chain.at(-1), p) <= 1e-9) chain.pop();
      chain.push(p);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/**
 * Walls the car can drive into before it bumps into anything: the obstacles stop the car's
 * body further in than the wall stands, often at a corner a round obstacle doesn't reach.
 * Walks round the foot of every solid part tall and wide enough to be a wall and measures how
 * far each point of it stands outside every obstacle there.
 */
function driveIns(parts, ground, obstacles) {
  // Further than this, and the car's body visibly goes into the wall (its circles reach a little
  // past its sides).
  const slack = 0.45;
  const issues = [];
  for (const part of parts) {
    const { box } = part;
    const size = box.getSize(corner);
    if (part.both || size.y < 1.5 || Math.min(size.x, size.z) < 1.5) continue;
    const { low, high } = groundUnder(box, ground);
    if (box.min.y > high + 0.6 || box.max.y < low + 1.5) continue;
    // Solid walls, open at most high up (a gable): not a bank or a heap of earth lying on the ground.
    if (part.openEdges.some(([p, q]) => Math.min(p[1], q[1]) < high + 1.5)) continue;
    const foot = [];
    const { positions } = part;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 1] < box.min.y + 0.05) foot.push([positions[i], positions[i + 2]]);
    }
    const outline = outlineOf(foot);
    // Standing on a real footprint, not on the end of a beam leaning up into the air.
    const area = outline.reduce((sum, p, i) => {
      const q = outline[(i + 1) % outline.length];
      return sum + (p[0] * q[1] - q[0] * p[1]) / 2;
    }, 0);
    if (Math.abs(area) < 2) continue;
    let worst = null;
    outline.forEach((p, i) => {
      const q = outline[(i + 1) % outline.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.5));
      for (let k = 0; k < steps; k++) {
        const x = p[0] + ((q[0] - p[0]) * k) / steps;
        const z = p[1] + ((q[1] - p[1]) * k) / steps;
        // How far outside every obstacle the point is, looking up to `reach` away.
        const reach = 3;
        let outside = reach;
        for (const obstacle of obstacles.near(x, z, reach)) {
          const hit = penetration(x, z, reach, obstacle);
          if (hit) outside = Math.min(outside, reach - hit.depth);
        }
        if (outside > slack && (!worst || outside > worst.outside)) worst = { outside, x, z };
      }
    });
    if (worst) {
      const into = worst.outside >= 3 ? 'right' : `${worst.outside.toFixed(2)} m`;
      issues.push({
        kind: 'drive-in',
        message: `the car can drive ${into} into this wall before it bumps into anything (${worst.x.toFixed(1)}, ${worst.z.toFixed(1)})`,
        box,
        parts: [part],
        gap: worst.outside,
      });
    }
  }
  return issues;
}

/** The corners of the flat underneath of a part: where it would meet the ground. */
function footprint(part) {
  const { positions } = part;
  const corners = [];
  for (let t = 0; t < positions.length / 9; t++) {
    a3.fromArray(positions, t * 9);
    b3.fromArray(positions, t * 9 + 3);
    c3.fromArray(positions, t * 9 + 6);
    normal.crossVectors(edgeA.subVectors(b3, a3), edgeB.subVectors(c3, a3));
    if (normal.lengthSq() < 1e-8 || normal.normalize().y > -0.95) continue;
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
    // Surfaces lying on the ground (a road, mud) have no underside, and follow it anyway.
    const corners = footprint(part);
    if (!corners.length) continue;
    // How high each corner of its underside is above the ground there.
    const heights = corners.map(p => p.y - ground(p.x, p.z));
    const [rest, gap] = [Math.min(...heights), Math.max(...heights)];
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
  return penetration(x, z, 0.6, obstacle) !== null;
}

const findingMiddle = new THREE.Vector3();

/**
 * A fault's name in the baseline (tests/geometry-baseline.json): its kind and the middle of what
 * it marks, to a tenth of a metre. The world is built the same way every time, so the same
 * fault always has the same name.
 */
export function findingKey(issue) {
  const middle = issue.box.getCenter(findingMiddle);
  const at = [middle.x, middle.y, middle.z].map(v => (Math.round(v * 10) / 10).toFixed(1)).join(', ');
  return `${issue.kind} at ${at}`;
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
  // Buildings: a vehicle's or a tree's parts aren't walls and roofs.
  if (!skip.includes('roof-gap') && ground) issues.push(...roofGaps(parts));
  if (!skip.includes('drive-in') && ground && obstacles) issues.push(...driveIns(parts, ground, obstacles));
  return issues;
}
