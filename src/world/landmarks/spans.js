// The long bridges (see SPANS in layout.js), which follow the road or track they carry: a plank
// causeway on piles out over the lake, a timber trestle bridge with rails on to the far shore,
// and a high stone arch that takes the road over the gorge, with the beck and a track under it.
import * as THREE from 'three';
import { createRandom, lerp } from '../../core/math.js';
import { LAKELAND } from '../layout.js';
import { spanLevel, terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';

const PLANK_COLORS = ['#8b6446', '#7f5a3f', '#946b4a', '#866044'];
const BEAM = '#5f4532';
const RAIL = '#7a5739';
const LOG_KERB = '#6b4f38';
const STONES = ['#a9a594', '#9b9886', '#b3ae9b', '#a09d8f'];
const COPING = '#bab5a2';
const ARCH_STONE = '#c1bba6';
const ROAD = '#b9ab88';

/**
 * A long bridge's own frame: the point `s` metres along its deck and `side` metres to the right
 * of its middle, with the height of the deck there, and which way the deck runs there.
 */
function frameOf(span) {
  const { deck } = span;
  const at = (s, side = 0) => {
    const p = deck.at(s);
    return { x: p.x - p.dz * side, y: spanLevel(span, s), z: p.z + p.dx * side };
  };
  const yaw = s => Math.atan2(deck.at(s).dx, deck.at(s).dz);
  const slope = s => (spanLevel(span, s + 0.1) - spanLevel(span, s - 0.1)) / 0.2;
  return { at, yaw, slope, length: deck.length };
}

/** Under a bridge that things pass under, the least room between the ground and its underside that anything is let into. */
const HEADROOM = 4;

/**
 * What stops the car driving off the sides: a run of short capsules along each, `side` metres out
 * from the middle, following the deck round its bends. With `under`, where there is room below
 * the bridge they only stop what is up on the deck, not what passes below; where the bank comes
 * up to its underside (`underside(s)`, how high that is `s` metres along the deck) they stand
 * from the ground, and the space under the deck there is solid up to just below the road, so
 * nothing climbs the bank into the stonework, on to the road through the side of the bridge or up
 * through the deck.
 */
function walls(obstacles, span, frame, side, radius, underside = s => frame.at(s).y - 0.5) {
  const step = frame.length / Math.ceil(frame.length / 4);
  /** The least room under the bridge along a line of the deck, from `s` on to `more`. */
  const room = (s, more, edge) =>
    Math.min(
      ...[0, 0.5, 1].map(t => {
        const along = lerp(s, more, t);
        const p = frame.at(along, edge);
        return underside(along) - terrainHeight(p.x, p.z);
      }),
    );
  const add = (a, b, open) => {
    const wall = { ax: a.x, az: a.z, bx: b.x, bz: b.z, radius };
    // It reaches a little further down than the deck does for something coming up to it (see
    // spanHeight), so that meets the wall before it could be on the road.
    if (open) wall.base = Math.min(a.y, b.y) - 1.8;
    obstacles.push(wall);
  };
  for (let s = 0; s < frame.length - 0.01; s += step) {
    const more = Math.min(s + step, frame.length);
    const open = span.under && Math.min(...[-side, 0, side].map(edge => room(s, more, edge))) >= HEADROOM;
    for (const edge of [-side, side]) add(frame.at(s, edge), frame.at(more, edge), open);
    if (!span.under || open) continue;
    const [a, b] = [frame.at(s), frame.at(more)];
    obstacles.push({
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      halfX: side,
      halfZ: Math.hypot(b.x - a.x, b.z - a.z) / 2,
      rotation: Math.atan2(b.x - a.x, b.z - a.z),
      radius: 0,
      top: Math.min(a.y, b.y) - 0.9,
    });
  }
  for (const wing of wings(span, frame, side)) add(wing.from, wing.to, false);
}

/**
 * The four wings of a bridge: from each end of each side, `length` metres on and splayed out, so
 * a car coming at the bridge a little to one side is steered on to it rather than brought up
 * against the end of its rail. Each is { from, to, yaw }, on the ground at its far end.
 */
function wings(span, frame, side, length = 3.4, splay = 0.6) {
  const out = [];
  for (const [end, way] of [
    [0, -1],
    [frame.length, 1],
  ]) {
    const { dx, dz } = span.deck.at(end);
    for (const edge of [-side, side]) {
      const from = frame.at(end, edge);
      const [on, aside] = [way * length * Math.cos(splay), Math.sign(edge) * length * Math.sin(splay)];
      const [x, z] = [from.x + dx * on - dz * aside, from.z + dz * on + dx * aside];
      const to = { x, y: Math.max(terrainHeight(x, z), from.y - 0.6), z };
      out.push({ from, to, yaw: Math.atan2(to.x - from.x, to.z - from.z) });
    }
  }
  return out;
}

/** Planks laid across the deck, a little unevenly, every other one a hair higher so their ends don't flicker. */
function planks(parts, span, frame, random, { overhang = 0.3, pitch = 0.56 } = {}) {
  for (let s = 0.25, k = 0; s < frame.length; s += pitch, k++) {
    const p = frame.at(s, (random() - 0.5) * 0.2);
    parts.box(span.width + overhang + random() * 0.25, 0.14, pitch - 0.06, PLANK_COLORS[Math.floor(random() * 4)], {
      x: p.x,
      y: p.y - 0.07 + (k % 2) * 0.005,
      z: p.z,
      ry: frame.yaw(s) + (random() - 0.5) * 0.03,
      rx: -Math.atan(frame.slope(s)),
    });
  }
}

/** Beams under the planks, in short lengths that follow the deck. */
function stringers(parts, frame, sides, thickness = 0.36) {
  for (const side of sides) {
    for (let s = 0; s < frame.length - 0.01; s += 2) {
      const [a, b] = [frame.at(s, side), frame.at(Math.min(s + 2.05, frame.length), side)];
      parts.beam({ ...a, y: a.y - 0.14 - thickness / 2 }, { ...b, y: b.y - 0.14 - thickness / 2 }, thickness, BEAM);
    }
  }
}

/**
 * The causeway: planks on beams, carried a little above the water on pairs of piles driven into
 * the bed of the lake, with a log along each edge to keep the wheels on, and a mooring post
 * standing up from every other pair of piles so the way across shows from far off.
 */
function causeway(span, parts, obstacles, random) {
  const frame = frameOf(span);
  const half = span.width / 2;
  planks(parts, span, frame, random);
  stringers(parts, frame, [-(half - 0.7), 0, half - 0.7]);
  const bents = Math.round(frame.length / 5.5);
  for (let i = 0; i <= bents; i++) {
    const s = (i / bents) * frame.length;
    for (const side of [-1, 1]) {
      const p = frame.at(s, side * (half + 0.12));
      const bed = terrainHeight(p.x, p.z) - 0.8;
      // Every other pair stands up above the deck as mooring posts.
      const top = p.y + (i % 2 ? -0.1 : 0.95);
      parts.box(0.34, top - bed, 0.34, BEAM, { x: p.x, y: (top + bed) / 2, z: p.z, ry: frame.yaw(s) + 0.2 * side });
      if (i % 2 === 0)
        parts.box(0.4, 0.1, 0.4, LOG_KERB, { x: p.x, y: top + 0.05, z: p.z, ry: frame.yaw(s) + 0.2 * side });
    }
    const [left, right] = [frame.at(s, -half - 0.3), frame.at(s, half + 0.3)];
    parts.beam({ ...left, y: left.y - 0.62 }, { ...right, y: right.y - 0.62 }, 0.3, BEAM);
  }
  // The logs along the edges, in lengths that butt up to one another.
  const kerb = 0.3;
  const line = half - kerb / 2 - 0.02;
  for (const side of [-1, 1]) {
    const edge = side * line;
    for (let s = 0; s < frame.length - 0.01; s += 5.5) {
      const [a, b] = [frame.at(s + 0.1, edge), frame.at(Math.min(s + 5.4, frame.length), edge)];
      parts.beam({ ...a, y: a.y + kerb / 2 - 0.02 }, { ...b, y: b.y + kerb / 2 - 0.02 }, kerb, LOG_KERB, kerb);
    }
  }
  // A log splayed out from each end of each, to steer the wheels on.
  for (const { from, to } of wings(span, frame, line)) {
    parts.beam({ ...from, y: from.y + kerb / 2 - 0.02 }, { ...to, y: to.y + kerb / 2 - 0.02 }, kerb, LOG_KERB, kerb);
    parts.box(0.34, 1.1, 0.34, BEAM, { x: to.x, y: to.y + 0.3, z: to.z });
  }
  walls(obstacles, span, frame, line, kerb / 2 + 0.05);
}

/**
 * The trestle bridge: a plank deck that rises in a gentle arch, on bents of two braced posts
 * standing in the lake, with rails of posts, a top rail and a mid rail along both sides.
 */
function trestle(span, parts, obstacles, random) {
  const frame = frameOf(span);
  const half = span.width / 2;
  planks(parts, span, frame, random);
  stringers(parts, frame, [-(half - 0.8), 0, half - 0.8], 0.42);
  const bents = Math.round(frame.length / 7.5);
  for (let i = 0; i <= bents; i++) {
    const s = (i / bents) * frame.length;
    const posts = [-1, 1].map(side => {
      const top = frame.at(s, side * (half - 0.6));
      // The posts lean out a little towards their feet.
      const foot = frame.at(s, side * (half + 0.5));
      const bed = terrainHeight(foot.x, foot.z) - 0.8;
      parts.beam({ ...foot, y: bed }, { ...top, y: top.y - 0.5 }, 0.42, BEAM);
      return { top, foot, bed };
    });
    const [left, right] = [frame.at(s, -half - 0.4), frame.at(s, half + 0.4)];
    parts.beam({ ...left, y: left.y - 0.7 }, { ...right, y: right.y - 0.7 }, 0.4, BEAM);
    // A brace across from the foot of one post to the head of the other, above the water.
    const water = LAKELAND.level + 0.25;
    if (posts[0].top.y - water > 1.6) {
      parts.beam({ ...posts[0].foot, y: water }, { ...posts[1].top, y: posts[1].top.y - 0.9 }, 0.2, BEAM);
      parts.beam({ ...posts[1].foot, y: water }, { ...posts[0].top, y: posts[0].top.y - 0.9 }, 0.2, BEAM);
    }
  }
  const panels = Math.round(frame.length / 2.6);
  for (const side of [-1, 1]) {
    const offset = side * (half + 0.05);
    let previous = null;
    for (let i = 0; i <= panels; i++) {
      const s = (i / panels) * frame.length;
      const p = frame.at(s, offset);
      parts.box(0.24, 1.45, 0.24, RAIL, { x: p.x, y: p.y + 0.55, z: p.z, ry: frame.yaw(s) });
      const [top, mid] = [
        { ...p, y: p.y + 1.15 },
        { ...p, y: p.y + 0.6 },
      ];
      if (previous) {
        parts.beam(previous.top, top, 0.16, RAIL, 0.2);
        parts.beam(previous.mid, mid, 0.12, RAIL, 0.14);
      }
      previous = { top, mid };
    }
  }
  // The rails splay out at each end, to a last post on the bank.
  for (const { from, to, yaw } of wings(span, frame, half + 0.1)) {
    parts.box(0.24, 1.45, 0.24, RAIL, { x: to.x, y: to.y + 0.55, z: to.z, ry: yaw });
    parts.beam({ ...from, y: from.y + 1.15 }, { ...to, y: to.y + 1.15 }, 0.16, RAIL, 0.2);
    parts.beam({ ...from, y: from.y + 0.6 }, { ...to, y: to.y + 0.6 }, 0.12, RAIL, 0.14);
  }
  walls(obstacles, span, frame, half + 0.1, 0.2);
}

/** A cheap pseudo-random number from a place, so the stones of a wall are the same each time. */
const speckle = (x, y, z) => Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1;

/**
 * The stone bridge over the gorge: a wall of masonry from one side of the gorge to the other with
 * one tall arch through it, wide enough for the beck and the track beside it, a ring of paler
 * stones round the arch on each face, the gravel road over the top and a parapet along each side.
 * Its deck runs straight, so it is built square to the line between its two ends.
 */
function arch(span, parts, obstacles) {
  const frame = frameOf(span);
  const { length } = frame;
  const [first, last] = [frame.at(0), frame.at(length)];
  const [dx, dz] = [(last.x - first.x) / length, (last.z - first.z) / length];
  const middle = { x: (first.x + last.x) / 2, z: (first.z + last.z) / 2 };
  const half = length / 2;
  const local = (along, side = 0) => ({ x: middle.x + dx * along - dz * side, z: middle.z + dz * along + dx * side });
  const deck = along => spanLevel(span, along + half);
  const wall = 0.6;
  const depth = span.width + wall * 2;
  const basis = new THREE.Matrix4()
    .makeBasis(new THREE.Vector3(dx, 0, dz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dz, 0, dx))
    .setPosition(middle.x, 0, middle.z);
  const alongBody = (z, geometry) =>
    geometry.applyMatrix4(basis.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, z)));

  // The arch's opening: a half ellipse standing on the floor of the gorge. It springs from inside
  // the rock either side, so all of the floor is clear under it.
  let bed = Infinity;
  for (let along = -half; along <= half; along += 1) bed = Math.min(bed, terrainHeight(local(along).x, local(along).z));
  const floor = bed - 0.6;
  const crown = Math.min(deck(0), deck(-4), deck(4)) - 1.5;
  const opening = half - 5.5;
  const semiEllipse = (width, height, shape) => {
    shape.moveTo(-width, floor);
    for (let k = 1; k <= 32; k++) {
      const angle = Math.PI - (k / 32) * Math.PI;
      shape.lineTo(Math.cos(angle) * width, floor + Math.sin(angle) * height);
    }
    return shape;
  };
  const body = new THREE.Shape();
  body.moveTo(-half, floor - 1);
  body.lineTo(half, floor - 1);
  for (let k = Math.round(length); k >= 0; k--) {
    const along = -half + (k / Math.round(length)) * length;
    body.lineTo(along, deck(along) - 0.12);
  }
  body.holes.push(semiEllipse(opening, crown - floor, new THREE.Path()));
  const stoneFor = (x, y, z) => STONES[Math.floor(speckle(Math.round(x), Math.round(y * 1.6), Math.round(z)) * 4)];
  parts.add(
    alongBody(-depth / 2, new THREE.ExtrudeGeometry(body, { depth, bevelEnabled: false, curveSegments: 1 })),
    stoneFor,
  );
  // The ring of paler stones round the arch, on the face each side, sunk a little into it.
  for (const face of [-1, 1]) {
    const ring = new THREE.Shape();
    ring.moveTo(-opening - 0.8, floor - 0.5);
    for (let k = 0; k <= 32; k++) {
      const angle = Math.PI - (k / 32) * Math.PI;
      ring.lineTo(Math.cos(angle) * (opening + 0.8), floor + Math.sin(angle) * (crown - floor + 0.8));
    }
    ring.lineTo(opening + 0.8, floor - 0.5);
    ring.holes.push(semiEllipse(opening - 0.05, crown - floor - 0.05, new THREE.Path()));
    const z = face > 0 ? depth / 2 - 0.06 : -depth / 2 - 0.12;
    parts.add(
      alongBody(z, new THREE.ExtrudeGeometry(ring, { depth: 0.18, bevelEnabled: false, curveSegments: 1 })),
      ARCH_STONE,
    );
  }
  // The road over the top in short slabs, and a parapet along each side with a coping on it. Each
  // slab runs a little over the next and sinks into the masonry, so no two faces share a plane.
  const step = 1.6;
  for (let along = -half; along < half - 0.01; along += step) {
    const more = Math.min(along + step + 0.08, half);
    const [a, b] = [local(along), local(more)];
    parts.beam({ ...a, y: deck(along) - 0.17 }, { ...b, y: deck(more) - 0.17 }, span.width + 0.1, ROAD, 0.34);
    for (const side of [-1, 1]) {
      const offset = side * (span.width / 2 + wall / 2);
      const [pa, pb] = [local(along, offset), local(more, offset)];
      parts.beam({ ...pa, y: deck(along) + 0.35 }, { ...pb, y: deck(more) + 0.35 }, wall - 0.06, STONES[1], 1.2);
      parts.beam({ ...pa, y: deck(along) + 1 }, { ...pb, y: deck(more) + 1 }, wall + 0.12, COPING, 0.14);
    }
  }
  // A pier at each end of each parapet, down into the bank.
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const p = local(end * (half - 0.35), side * (span.width / 2 + wall / 2));
      const top = deck(end * half) + 1.4;
      const bottom = Math.min(top - 2.6, terrainHeight(p.x, p.z) - 0.3);
      parts.box(wall + 0.1, top - bottom, 0.8, COPING, {
        x: p.x,
        y: (top + bottom) / 2,
        z: p.z,
        ry: Math.atan2(dx, dz),
      });
    }
  }
  // The parapets splay out at each end, down to the verge.
  // The coping runs a little past the end of the wall under it, so their ends are not one face.
  for (const { from, to } of wings(span, frame, span.width / 2 + wall / 2)) {
    parts.beam({ ...from, y: from.y + 0.35 }, { ...to, y: to.y + 0.35 }, wall - 0.06, STONES[1], 1.2);
    const reach = Math.hypot(to.x - from.x, to.z - from.z);
    const [ux, uz] = [((to.x - from.x) / reach) * 0.07, ((to.z - from.z) / reach) * 0.07];
    parts.beam(
      { x: from.x - ux, y: from.y + 1, z: from.z - uz },
      { x: to.x + ux, y: to.y + 1, z: to.z + uz },
      wall + 0.12,
      COPING,
      0.14,
    );
  }
  // Outside the opening the bridge is stone down to the bank, and under it the arch comes down to meet the bank.
  const soffit = s => {
    const across = Math.abs(s - half) / opening;
    return across < 1 ? floor + Math.sqrt(1 - across * across) * (crown - floor) : -Infinity;
  };
  walls(obstacles, span, frame, span.width / 2 + wall / 2, wall / 2, soffit);
}

/**
 * The shallows across the narrows: a line of poles either side of the bar under the water,
 * banded red and white, so the way through shows. They stand just off the bar, in the water.
 */
export function buildShallows(group, obstacles) {
  const { from, to, half } = LAKELAND.shallows;
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const [dx, dz] = [(to.x - from.x) / length, (to.z - from.z) / length];
  const parts = new PartsBuilder();
  const count = Math.round(length / 7);
  for (let i = 0; i <= count; i++) {
    for (const side of [-1, 1]) {
      const along = (i / count) * length;
      const [x, z] = [from.x + dx * along - dz * side * (half + 0.9), from.z + dz * along + dx * side * (half + 0.9)];
      const bed = terrainHeight(x, z);
      // None on dry land at either end, where the track comes down to the water.
      if (bed > LAKELAND.level - 0.05) continue;
      const top = LAKELAND.level + 1.5;
      parts.box(0.2, top - bed + 0.6, 0.2, '#efe9da', { x, y: (top + bed - 0.6) / 2, z, ry: i });
      for (const band of [0.5, 1.1]) parts.box(0.22, 0.28, 0.22, '#b8402f', { x, y: LAKELAND.level + band, z, ry: i });
      obstacles.push({ x, z, radius: 0.16 });
    }
  }
  group.add(parts.mesh());
}

const BUILDERS = { pier: causeway, trestle, arch };

/** Builds one of the long bridges into `group`, and adds what keeps the car on it to `obstacles`. */
export function buildSpan(span, group, obstacles) {
  const parts = new PartsBuilder();
  BUILDERS[span.style](span, parts, obstacles, createRandom(311 + span.id.length * 17));
  group.add(parts.mesh());
}
