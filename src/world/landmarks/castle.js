// The castle ruin on the knoll in the middle of the lakeland's island: a broken ring wall round the
// level top, open where the track comes in and in two wide gaps besides, and one tall round tower
// still standing on the far side, its top broken unevenly. All of it is laid in courses of dressed
// stone, each block a shade of its own; the walls follow the ground and every piece of wall and the
// tower are solid. The yard inside the ring is left open, with a few flat fallen stones in it.
import * as THREE from 'three';
import { createRandom } from '../../core/math.js';
import { LAKELAND, TRACKS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, prism } from '../build.js';

// The same weathered greys as the stone bridge, with a little moss low on the north faces.
const STONES = ['#a9a594', '#9b9886', '#b3ae9b', '#a09d8f'];
const COPING = '#bab5a2';
const LINTEL = '#c1bba6';
const MOSS = ['#7c8a5d', '#6f7f55'];
const DARK = '#2a2926';

/** How far from the middle the wall runs, and how thick it is. */
const RING = 12.3;
const THICK = 1;
/** The tower: twelve flat sides, its outer face this far from its middle, the wall this thick. */
const SIDES = 12;
const OUTER = 2.2;
const INNER = 1.2;
const COURSE = 0.55;
/** How wide a block of the wall is at the shortest and the longest, and how wide the columns its top is cut in. */
const BLOCK = [0.9, 1.7];
const COLUMN = 0.9;

const middle = { x: LAKELAND.castle.x, z: LAKELAND.castle.z };
const rad = degrees => (degrees * Math.PI) / 180;
/** The point `radius` metres from the middle at `angle` radians: 0 is south, a quarter turn is east. */
const polar = (angle, radius) => ({
  x: middle.x + Math.sin(angle) * radius,
  z: middle.z + Math.cos(angle) * radius,
});

/** The angle at which the track comes in over the ring, where it passes nearest the ring's line. */
function gatewayAngle() {
  const path = TRACKS.find(track => track.id === 'castle').path;
  let best = { angle: 0, distance: Infinity };
  for (let degrees = 0; degrees < 360; degrees += 0.5) {
    const at = polar(rad(degrees), RING);
    const { distance } = path.nearest(at.x, at.z);
    if (distance < best.distance) best = { angle: rad(degrees), distance };
  }
  return best.angle;
}

/** Where the tower's middle stands. */
export function towerSite() {
  return polar(gatewayAngle() + rad(TOWER_AT), RING - 0.1);
}

/**
 * The lengths of wall, as degrees round the ring from the middle of the gateway (the angle the
 * track comes in at): from, to, the heights it stands at from one end to the other (the
 * fractions of its length they are at, and the height in metres), a run of battlements
 * (from, to as fractions) and a window (the fraction of the way along and its width).
 */
const WALLS = [
  // The east pier of the gateway, standing tallest at the gate.
  {
    from: -70,
    to: -36,
    heights: [
      [0, 1.1],
      [0.5, 2],
      [0.85, 3.2],
      [1, 3.4],
    ],
    window: { at: 0.5, width: 1 },
  },
  // The west pier, with battlements.
  {
    from: 36,
    to: 68,
    heights: [
      [0, 2.7],
      [0.5, 2],
      [1, 0.9],
    ],
    merlons: [0, 0.55],
  },
  // From the tower, going round to the west side, with a window.
  {
    from: 128,
    to: 172.2,
    heights: [
      [0, 1],
      [0.5, 2.2],
      [1, 3.4],
    ],
    window: { at: 0.68, width: 0.9 },
  },
  // From the tower the other way, falling away.
  {
    from: 187.8,
    to: 224,
    heights: [
      [0, 3.4],
      [0.5, 2.3],
      [1, 1],
    ],
  },
];
/** Where the tower stands, in degrees round from the gateway, and the way its tallest remaining side faces. */
const TOWER_AT = 180;
const TOWER_PEAK = 150;
/** How tall the sides of the tower stand: the lowest it is broken down to, and how much taller its tallest side is. */
const TOWER_LOW = 7.7;
const TOWER_RISE = 2.1;

const minOf = list => Math.min(...list);

/**
 * Where a block in a course that starts at `yb` begins, over ground that is as low as `ground`
 * under it: on the course below, unless it is near the ground, when it goes down into it.
 */
const footing = (yb, ground) => (yb - ground < 0.75 ? Math.min(yb, ground - 0.35) : yb);

/** Linear interpolation through [fraction, value] pairs. */
function through(points, t) {
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i][0]) {
      const [t0, v0] = points[i - 1];
      const [t1, v1] = points[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

/** The shade of a block of stone: a random grey, sometimes mossy low on a face that looks north. */
function shade(random, { mossy = 0 } = {}) {
  if (mossy > 0 && random() < mossy) return MOSS[Math.floor(random() * MOSS.length)];
  return STONES[Math.floor(random() * STONES.length)];
}

/**
 * One length of wall, as a run of straight pieces round the ring, laid in courses of blocks
 * of different lengths with the joints between courses staggered. The top is cut in columns
 * that stand at the heights asked for, stepped, and the lowest blocks go down into the ground.
 */
function wall(parts, obstacles, random, gate, def) {
  const arc = rad(def.to - def.from);
  const pieces = Math.max(1, Math.ceil((arc * RING) / 4));
  const points = Array.from({ length: pieces + 1 }, (_, k) => polar(gate + rad(def.from) + (arc * k) / pieces, RING));
  const total = points.slice(1).reduce((sum, p, k) => sum + Math.hypot(p.x - points[k].x, p.z - points[k].z), 0);

  // Where each piece starts along the whole length, and its columns' tops.
  const laid = [];
  let along = 0;
  for (let k = 0; k < pieces; k++) {
    const [p, q] = [points[k], points[k + 1]];
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    const [dx, dz] = [(q.x - p.x) / length, (q.z - p.z) / length];
    const piece = {
      p,
      dx,
      dz,
      length,
      start: along,
      yaw: Math.atan2(dx, dz),
      outward: { x: (p.x + q.x) / 2 - middle.x, z: (p.z + q.z) / 2 - middle.z },
      // The joint with the next or last piece is overlapped a little, so no wedge of gap shows on a bend.
      before: k > 0 ? 0.25 : 0,
      after: k < pieces - 1 ? 0.25 : 0,
    };
    const columns = Math.max(1, Math.round(length / COLUMN));
    piece.columns = Array.from({ length: columns }, (_, c) => {
      const u = ((c + 0.5) / columns) * length;
      const t = (along + u) / total;
      let height = through(def.heights, t);
      height = Math.round((height + (random() - 0.5) * 0.5) / 0.3) * 0.3;
      if (def.merlons && t >= def.merlons[0] && t <= def.merlons[1] && c % 2) height = Math.max(0.9, height - 0.7);
      const at = { x: p.x + dx * u, z: p.z + dz * u };
      return { u, top: terrainHeight(at.x, at.z) + Math.max(0.8, Math.min(3.5, height)) };
    });
    laid.push(piece);
    along += length;
  }
  const at = (piece, u, v = 0) => ({
    x: piece.p.x + piece.dx * u + piece.dz * v,
    z: piece.p.z + piece.dz * u - piece.dx * v,
  });
  const ground = (piece, u, v = 0) => {
    const point = at(piece, u, v);
    return terrainHeight(point.x, point.z);
  };

  // Courses of one height all along the length, up from below the lowest ground.
  const low = minOf(
    laid.flatMap(piece => [0, 0.5, 1].flatMap(f => [-0.5, 0, 0.5].map(v => ground(piece, f * piece.length, v)))),
  );
  const high = Math.max(...laid.flatMap(piece => piece.columns.map(column => column.top)));
  const courses = [];
  for (let y = low - 0.5; y < high; ) {
    const height = COURSE * (0.85 + random() * 0.3);
    courses.push([y, y + height]);
    y += height;
  }

  // The window: where, and which courses it is open through, with a long stone over it.
  let window = null;
  if (def.window) {
    const target = def.window.at * total;
    const piece = laid.find(p => target >= p.start && target <= p.start + p.length) ?? laid[0];
    const u = Math.min(piece.length - 1, Math.max(1, target - piece.start));
    const sill = ground(piece, u) + 1;
    const first = courses.findIndex(([y]) => y >= sill);
    window = { piece, from: u - def.window.width / 2, to: u + def.window.width / 2, first, last: first + 1 };
  }

  for (const piece of laid) {
    const north = -piece.outward.z / Math.hypot(piece.outward.x, piece.outward.z);
    const { length, before, after } = piece;
    const [start, end] = [-before, length + after];
    courses.forEach(([yb, ye], course) => {
      // Where the blocks of this course join: at random, with the window's edges and the columns of the battlements kept.
      const joints = [start];
      for (let u = start; u < end; ) {
        u = u + BLOCK[0] + random() * (BLOCK[1] - BLOCK[0]);
        joints.push(end - u < 0.6 ? end : Math.min(u, end));
        if (end - u < 0.6) break;
      }
      const forced = [];
      if (def.merlons) piece.columns.forEach((_, c) => forced.push((c / piece.columns.length) * length));
      const here = window?.piece === piece;
      if (here && course >= window.first && course <= window.last) forced.push(window.from, window.to);
      if (here && course === window.last + 1) forced.push(window.from - 0.3, window.to + 0.3);
      const cut = joints.filter(
        (u, i) => i === 0 || i === joints.length - 1 || forced.every(f => Math.abs(f - u) > 0.4),
      );
      for (const f of forced) if (f > start + 0.3 && f < end - 0.3) cut.push(f);
      cut.sort((a, b) => a - b);

      for (let i = 1; i < cut.length; i++) {
        const [u0, u1] = [cut[i - 1], cut[i]];
        if (u1 - u0 < 0.3) continue;
        const middleOf = (u0 + u1) / 2;
        const lintel =
          here && course === window.last + 1 && u0 >= window.from - 0.31 && u1 <= window.to + 0.31 && u1 - u0 > 1;
        if (here && course >= window.first && course <= window.last && middleOf > window.from && middleOf < window.to)
          continue;
        // The columns this block stands over, split where their tops differ and the top course is broken.
        const spans = [];
        const covered = piece.columns
          .map((column, c) => ({
            ...column,
            from: (c / piece.columns.length) * length,
            to: ((c + 1) / piece.columns.length) * length,
          }))
          .filter(column => column.to > u0 + 0.01 && column.from < u1 - 0.01);
        const list = covered.length
          ? covered
          : [
              piece.columns[
                Math.min(piece.columns.length - 1, Math.max(0, Math.floor(middleOf / (length / piece.columns.length))))
              ],
            ];
        const tops = list.map(column => column.top);
        if (list.length > 1 && minOf(tops) < ye && Math.max(...tops) - minOf(tops) > 0.01) {
          for (const column of list) {
            const [a, b] = [Math.max(u0, column.from ?? u0), Math.min(u1, column.to ?? u1)];
            if (b - a > 0.25) spans.push({ a, b, top: column.top });
          }
        } else spans.push({ a: u0, b: u1, top: minOf(tops) });

        for (const { a, b, top } of spans) {
          const lowest = minOf([a, (a + b) / 2, b].flatMap(u => [-0.5, 0, 0.5].map(v => ground(piece, u, v))));
          const [bottom, roof] = [footing(yb, lowest), Math.min(ye, top)];
          if (ye < lowest - 0.1 || roof - bottom < 0.2) continue;
          const mossy = north > 0.35 && yb < lowest + 0.7 ? 0.3 * north : 0;
          const colour = lintel ? LINTEL : roof >= top - 0.01 && random() < 0.3 ? COPING : shade(random, { mossy });
          // Each course is a little thinner than the one below, so the wall narrows as it rises and no two faces share a plane.
          const centre = at(piece, (a + b) / 2);
          parts.box(b - a, roof - bottom, Math.max(0.7, THICK + 0.15 - 0.03 * course), colour, {
            x: centre.x,
            y: (bottom + roof) / 2,
            z: centre.z,
            ry: piece.yaw + Math.PI / 2,
          });
        }
      }
    });
    if (window?.piece === piece) {
      // The window looks into a dark recess, not through to the other side.
      const [yb] = courses[window.first];
      const [, ye] = courses[window.last];
      const centre = at(piece, (window.from + window.to) / 2);
      parts.box(window.to - window.from - 0.02, ye - yb, THICK * 0.5, DARK, {
        x: centre.x,
        y: (yb + ye) / 2,
        z: centre.z,
        ry: piece.yaw + Math.PI / 2,
      });
    }
    // What stops the car: the footprint of this piece, joints included.
    const centre = at(piece, (end + start) / 2);
    obstacles.push({
      x: centre.x,
      z: centre.z,
      halfX: THICK / 2 + 0.05,
      halfZ: (end - start) / 2,
      rotation: piece.yaw,
      radius: 0,
    });
  }
}

/** Where the tower's top stands, by the direction a side faces. */
function towerTop(base, facing, noise, gate) {
  const toward = Math.max(0, Math.cos(facing - (gate + rad(TOWER_PEAK))));
  return base + TOWER_LOW + TOWER_RISE * toward ** 1.2 + noise;
}

/**
 * A block with four corners in plan (x, z) and the same from `bottom` to `top`: a stone cut to
 * lie in a ring, so that those either side of it fit against it with nothing between.
 */
function cell(parts, plan, bottom, top, colour) {
  const corners = plan.flatMap(([x, z]) => [
    [x, bottom, z],
    [x, top, z],
  ]);
  const at = (i, up) => corners[(i % 4) * 2 + up];
  const middle = [0, 1, 2].map(k => corners.reduce((sum, c) => sum + c[k], 0) / corners.length);
  const points = [];
  const quad = (a, b, c, d) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const out = [0, 1, 2].reduce((sum, k) => sum + n[k] * ((a[k] + c[k]) / 2 - middle[k]), 0);
    points.push(...(out >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]));
  };
  quad(at(0, 0), at(1, 0), at(2, 0), at(3, 0));
  quad(at(0, 1), at(1, 1), at(2, 1), at(3, 1));
  for (let i = 0; i < 4; i++) quad(at(i, 0), at(i + 1, 0), at(i + 1, 1), at(i, 1));
  parts.add(prism(points), colour);
}

/**
 * The tower: a ring of twelve stones to a course, each course turned half a stone from the one
 * under it, hollow inside. It stands to different heights round its top. A dark doorway looks
 * into the yard, and a few narrow dark slits look out every way.
 */
function tower(parts, obstacles, random, gate) {
  const here = towerSite();
  const base = terrainHeight(here.x, here.z);
  const step = (Math.PI * 2) / SIDES;
  const half = Math.tan(step / 2);
  const around = [...Array(SIDES).keys()];
  const lowest = minOf([
    base,
    ...around.flatMap(s =>
      [0.5, 1].map(f =>
        terrainHeight(here.x + Math.sin(s * step) * OUTER * f, here.z + Math.cos(s * step) * OUTER * f),
      ),
    ),
  ]);
  // The doorway is the lowest courses on the side looking at the yard.
  const doorCourses = 4;
  const noise = around.map(() => (random() - 0.5) * 0.5);
  const top = facing => {
    const turns = ((((facing - gate) / step) % SIDES) + SIDES) % SIDES;
    return towerTop(base, facing, noise[Math.round(turns) % SIDES], gate);
  };
  /** The point at fraction `u` of the way across a side that faces `facing`, `radius` from the middle (on its radial lines). */
  const point = (facing, u, radius) => [
    here.x + Math.sin(facing) * radius + Math.cos(facing) * u * radius * half,
    here.z + Math.cos(facing) * radius - Math.sin(facing) * u * radius * half,
  ];
  const outerOf = course => OUTER + 0.08 - 0.01 * course;

  const bands = [];
  for (let y = lowest - 0.5; y < base + TOWER_LOW + TOWER_RISE + 0.5; y += COURSE) bands.push([y, y + COURSE]);
  bands.forEach(([yb, ye], course) => {
    // Under the lintel, all the courses stand square to the doorway; above it they are staggered.
    const turn = course < doorCourses ? 0 : (course % 2) * (step / 2);
    const outer = outerOf(course);
    for (const s of around) {
      const facing = gate + turn + s * step;
      const ground = minOf([-1, 0, 1].map(u => terrainHeight(...point(facing, u, outer))));
      const roof = Math.min(ye, top(facing));
      const bottom = footing(yb, ground);
      if (ye < ground - 0.1 || roof - bottom < 0.2) continue;
      const mossy = yb < ground + 1 ? Math.max(0, -Math.cos(facing)) * 0.35 : 0;
      const capped = roof >= top(facing) - 0.01 && random() < 0.3;
      const colour = capped ? COPING : shade(random, { mossy });
      const block = (from, to, inner, outward, stone) =>
        cell(
          parts,
          [
            point(facing, from, inner),
            point(facing, to, inner),
            point(facing, to, outward),
            point(facing, from, outward),
          ],
          bottom,
          roof,
          stone,
        );
      if (course < doorCourses && s === 0) {
        // Two jambs, and a dark recess between them.
        const jamb = 0.475 / (outer * half);
        block(-1, -jamb, INNER, outer, colour);
        block(jamb, 1, INNER, outer, shade(random));
        cell(
          parts,
          [
            point(facing, -jamb, outer - 0.65),
            point(facing, jamb, outer - 0.65),
            point(facing, jamb, outer - 0.2),
            point(facing, -jamb, outer - 0.2),
          ],
          bottom,
          roof,
          DARK,
        );
      } else block(-1, 1, INNER, outer, colour);
    }
  });

  // Slits: dark, standing a hand's breadth out of the face of the course they are in.
  for (const [course, side, turned] of [
    [6, 0, 0],
    [6, 6, 0],
    [9, 3, 1],
    [9, 8, 1],
    [11, 4, 0],
  ]) {
    const [yb] = bands[course];
    const facing = gate + (turned ? step / 2 : 0) + side * step;
    if (top(facing) < yb + COURSE + 0.4) continue;
    const [x, z] = [
      here.x + Math.sin(facing) * (outerOf(course) + 0.04),
      here.z + Math.cos(facing) * (outerOf(course) + 0.04),
    ];
    parts.box(0.22, 0.9, 0.14, DARK, { x, y: yb + COURSE / 2 + 0.05, z, ry: facing });
  }

  obstacles.push({ x: here.x, z: here.z, radius: OUTER + 0.2 });
  return { here, base, height: TOWER_LOW + TOWER_RISE };
}

/** A few flat stones fallen in the yard and by the gate, too low to drive into. */
function slabs(parts, random, gate) {
  const path = TRACKS.find(track => track.id === 'castle').path;
  for (let i = 0; i < 9; i++) {
    const angle = gate + rad(i * 40 + random() * 25);
    const spot = polar(angle, 3 + random() * 5.5);
    if (path.nearest(spot.x, spot.z).distance < 2) continue;
    const [w, d] = [0.5 + random() * 0.7, 0.4 + random() * 0.5];
    // Sunk into the ground, with only its top showing, a hand's breadth at most.
    const low = minOf(
      [-1, 1].flatMap(a => [-1, 1].map(b => terrainHeight(spot.x + (a * w) / 2, spot.z + (b * w) / 2))),
    );
    parts.box(w, 0.24, d, shade(random), {
      x: spot.x,
      y: low + 0.04 - 0.12,
      z: spot.z,
      ry: random() * Math.PI,
    });
  }
}

export function buildCastle(group, obstacles) {
  const parts = new PartsBuilder();
  const random = createRandom(8123);
  const gate = gatewayAngle();
  for (const def of WALLS) wall(parts, obstacles, random, gate, def);
  const standing = tower(parts, obstacles, random, gate);
  slabs(parts, random, gate);
  group.add(parts.mesh());

  // The camera pulls in rather than end up inside the tower.
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(OUTER + 0.2, OUTER + 0.2, standing.height + 2, SIDES));
  shell.position.set(standing.here.x, standing.base + (standing.height + 2) / 2 - 0.5, standing.here.z);
  shell.updateMatrixWorld();
  return { occluders: [shell], gateway: gate };
}
