// The mountain tunnel: a mountain of bare rock standing on the ground, with three bores through
// it that meet at a roundabout in a hall hollowed out of its middle (see VALLAVIK in layout.js).
// The rock outside is one skin over the whole mountain, coloured as the ground would be at its
// height and steepness, so it reads as one of the hills; it is cut straight across at each portal,
// and its foot is buried below the ground everywhere else. Inside, the bores are lined with pale
// concrete under a row of warm lamps, the light turns blue towards the hall, and the hall is bare
// rock washed blue from the floor to the top of its dome, with a low band of gold light round
// the foot of its wall and a pillar of rock left standing in the middle of the roundabout.
// Nothing in there is lit by the sun or the sky, so the light is painted onto the walls: they
// look the same by day and by night.
import * as THREE from 'three';
import { createRandom, fractalNoise, lerp, smoothstep, valueNoise } from '../../core/math.js';
import { VALLAVIK, inVallavikTunnel } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';
import { groundMaterial } from '../detail.js';
import { colorAsGround } from '../groundcolor.js';

const { x: CX, z: CZ, hall, bore, arms, level, face } = VALLAVIK;

const ARCH_STEPS = 12;
/** How far below the floor the walls go, so no gap shows where the floor dips. */
const WALL_BOTTOM = -1.5;
/** The top of a bore above its floor. */
const CROWN = bore.spring + bore.radius;
/** How high the rock stands over the middle of a portal. */
const HEADWALL = CROWN + 4.6;
/** Rows of the mountain's skin from its foot to its top, and how far apart its columns are round it (radians). */
const ROWS = 20;
const COLUMN = 0.052;
/** How far the tunnel's own floor lies above the ground under it, and the lines painted on it: no more than the road's outside. */
const FLOOR = 0.05;
const LINES = 0.09;
/** How far apart the lamps hang along a bore, in metres. */
const LAMPS = 8;

/** A bore's cross-section as [metres to the right, metres up]: up the right wall, over the arch, down the left wall. */
const BORE = (() => {
  const r = bore.radius;
  const points = [
    [r, WALL_BOTTOM],
    [r, bore.spring],
  ];
  for (let k = 1; k < ARCH_STEPS; k++) {
    const angle = (k / ARCH_STEPS) * Math.PI;
    points.push([Math.cos(angle) * r, bore.spring + Math.sin(angle) * r]);
  }
  points.push([-r, bore.spring], [-r, WALL_BOTTOM]);
  return points;
})();

/** The point `d` metres out from the middle of the hall along an arm and `u` to the right of it, as [x, z]. */
const along = (arm, d, u = 0) => [CX + arm.dx * d - arm.dz * u, CZ + arm.dz * d + arm.dx * u];
/** The floor's height there. */
const floorAt = (arm, d) => terrainHeight(...along(arm, d));

/**
 * Triangles gathered corner by corner, each corner with a colour of its own. Every triangle is
 * turned to face `towards` a point, or away from it.
 */
class Faces {
  constructor() {
    this.positions = [];
    this.colors = [];
  }

  /** Adds triangle a, b, c (each [x, y, z]), coloured by `paint(corner, normal, out)`. */
  triangle(a, b, c, paint, { towards = null, away = null } = {}) {
    const [ux, uy, uz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const [vx, vy, vz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...normal) || 1;
    normal = normal.map(n => n / length);
    const from = towards ?? away;
    if (from) {
      const facing =
        normal[0] * (from[0] - a[0]) + normal[1] * (from[1] - a[1]) + normal[2] * (from[2] - a[2]) > 0 ? 1 : -1;
      if (facing !== (towards ? 1 : -1)) {
        [b, c] = [c, b];
        normal = normal.map(n => -n);
      }
    }
    for (const corner of [a, b, c]) {
      this.positions.push(...corner);
      paint(corner, normal, tint);
      this.colors.push(tint.r, tint.g, tint.b);
    }
  }

  quad(a, b, c, d, paint, facing) {
    this.triangle(a, b, c, paint, facing);
    this.triangle(c, b, d, paint, facing);
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
const tint = new THREE.Color();

// --- The light painted on the walls -----------------------------------------------------------

const CONCRETE = new THREE.Color('#d2d4cd');
const TARMAC = new THREE.Color('#8b8d88');
const PAINT = new THREE.Color('#f4f2e8');
const STONE = new THREE.Color('#c9c7bb');
const LAMP_LIGHT = new THREE.Color('#fff0d4');
const SHADE = new THREE.Color('#454b57');
/** What the daylight makes of the concrete and of the asphalt, just inside a portal. */
const DAYLIGHT = { wall: new THREE.Color('#c9d2cf'), floor: new THREE.Color('#84847c') };
const BLUE = { deep: new THREE.Color('#1433a6'), mid: new THREE.Color('#2f6df0'), high: new THREE.Color('#7fd0ff') };
const PALE_BLUE = new THREE.Color('#cfe1ff');
const WHITE = new THREE.Color('#ffffff');
const GOLD = new THREE.Color('#ffbf55');
const TURQUOISE = new THREE.Color('#7df2e4');
const scratch = new THREE.Color();
const lit = new THREE.Color();

/** How much of the coloured light on the floor is washed out to white. */
const FLOOR_PALE = 0.34;

/** How far along an arm, from the middle of the hall, each of its lamps hangs. */
const lampsOf = arm => {
  const places = [];
  for (let d = arm.portal - 5; d > hall.radius + 3; d -= LAMPS) places.push(d);
  return places;
};

/** How blue the light is `d` metres out from the middle of the hall: all blue at the hall, none a third of the way out along a bore. */
const blueness = d => 1 - smoothstep(d, hall.radius + 3, hall.radius + 26);

/** How much of the lamps' light falls `d` metres out along an arm: 1 right under one. */
const lampGlow = (arm, d) => {
  let glow = 0;
  for (const lamp of arm.lamps) glow += Math.exp(-(((d - lamp) / 2.4) ** 2));
  return glow;
};

/** The hall's light on rock `y` metres above its floor: gold low down, deep blue above it, paler up in the dome. */
function hallLight(y, out) {
  out
    .copy(BLUE.deep)
    .lerp(BLUE.mid, smoothstep(y, 1.5, 7.5))
    .lerp(BLUE.high, smoothstep(y, 8, hall.height) * 0.85);
  return out.lerp(GOLD, (1 - smoothstep(y, 0.2, 3.4)) * 0.92);
}

/** The colour of a bore's lining `d` metres out from the middle of the hall and `h` above the floor. */
function boreLight(arm, d, h, out) {
  const glow = lampGlow(arm, d);
  const up = smoothstep(h, -0.5, CROWN);
  // The lamps' pools of warm light on the concrete, strongest up by the lamps, over a dim shade.
  out.copy(SHADE).lerp(scratch.copy(CONCRETE).multiply(LAMP_LIGHT), Math.min(1, 0.36 + glow * (0.22 + 0.42 * up)));
  const blue = blueness(d);
  if (blue > 0) out.lerp(hallLight(h * 1.25, scratch).multiplyScalar(0.74 + 0.26 * glow), blue);
  // Daylight reaches a little way in at the portal.
  return out.lerp(DAYLIGHT.wall, smoothstep(d, arm.portal - 9, arm.portal) * 0.55);
}

/**
 * The light on the hall's floor `r` metres from its middle, at `angle` round it: blue, with
 * turquoise round the island and the gold of the lamps along the foot of the wall, though not
 * across the mouths of the bores, where there are none.
 */
function hallFloorLight(r, angle, out) {
  out.copy(BLUE.mid).lerp(BLUE.high, 0.25);
  out.lerp(TURQUOISE, (1 - smoothstep(r, hall.island, hall.island + 5.5)) * 0.75);
  let wall = 1;
  for (const arm of arms) {
    const off = Math.abs(Math.atan2(Math.sin(angle - arm.angle), Math.cos(angle - arm.angle)));
    wall = Math.min(wall, smoothstep(off, 0.2, 0.42));
  }
  out.lerp(GOLD, smoothstep(r, hall.radius - 6.5, hall.radius - 0.4) * 0.85 * wall);
  // Paler than the rock: the road has to stay a road, with its lines plain on it.
  return out.lerp(WHITE, FLOOR_PALE);
}

/**
 * What the floor looks like in the tunnel's light: `surface` (asphalt, paint or stone) `d` metres
 * out from the middle of the hall along `arm` and `u` to the side of its middle; in the hall,
 * `arm` is null and `u` the angle round it.
 */
function floorLight(surface, arm, d, u, out) {
  if (!arm)
    return out
      .copy(surface)
      .multiply(hallFloorLight(d, u, lit))
      .multiplyScalar(1.12);
  const pool = lampGlow(arm, d) * (1 - 0.5 * (u / bore.radius) ** 2);
  out.copy(surface).multiply(scratch.copy(SHADE).lerp(LAMP_LIGHT, Math.min(1, 0.4 + 0.6 * pool)));
  const blue = blueness(d);
  if (blue > 0) {
    // Towards the hall the floor takes its light, gold along the walls as the lining is there.
    lit
      .copy(BLUE.mid)
      .lerp(BLUE.high, 0.25)
      .lerp(GOLD, smoothstep(Math.abs(u), bore.radius - 3.2, bore.radius) * 0.8)
      .lerp(WHITE, FLOOR_PALE);
    out.lerp(scratch.copy(surface).multiply(lit).multiplyScalar(1.12), blue);
  }
  const day = smoothstep(d, arm.portal - 9, arm.portal);
  return out.lerp(surface === TARMAC ? DAYLIGHT.floor : scratch.copy(surface).multiplyScalar(0.92), day * 0.8);
}

/** A little lighter or darker from one face to the next, and by which way the face looks, so the rock has facets. */
const facet = (normal, corner, amount) => {
  const face = Math.sin(normal[0] * 12.9898 + normal[1] * 78.233 + normal[2] * 37.719) * 43758.5453;
  return (
    1 -
    amount * 0.5 +
    amount * 0.45 * normal[1] +
    (face - Math.floor(face) - 0.5) * amount * 0.5 +
    (valueNoise(corner[0] * 0.5 + corner[1], corner[2] * 0.5, 77) - 0.5) * amount * 0.3
  );
};

// --- The angles the walls are built at ---------------------------------------------------------

/**
 * The angles round the middle of the hall, in order, that a wall is built at: where each arm
 * comes through it (`radius` metres out), one for every point of the cross-section `across` (as
 * metres to the right of the arm), so the wall and what comes through it share their corners;
 * and in between, no more than `step` radians apart. Each is { angle, arm, k }, with the arm and
 * the point's number where it is one of an arm's.
 */
function anglesRound(radius, across, step, flat) {
  const windows = arms
    .map(arm => {
      const offsets = across.map(u => (flat ? Math.atan(u / radius(arm)) : Math.asin(u / radius(arm))));
      return { arm, from: arm.angle + Math.min(...offsets), to: arm.angle + Math.max(...offsets), offsets };
    })
    .sort((a, b) => a.from - b.from);
  const columns = [];
  windows.forEach((window, i) => {
    // The cross-section's points run from the right of the arm to its left: from the greatest angle down.
    const own = window.offsets.map((offset, k) => ({ angle: window.arm.angle + offset, arm: window.arm, k }));
    columns.push(...own.sort((a, b) => a.angle - b.angle || b.k - a.k));
    const next = windows[(i + 1) % windows.length];
    const gap = next.from + (i + 1 === windows.length ? Math.PI * 2 : 0) - window.to;
    const pieces = Math.ceil(gap / step);
    for (let n = 1; n < pieces; n++) columns.push({ angle: window.to + (gap * n) / pieces, arm: null, k: -1 });
  });
  return columns;
}

// --- The mountain -----------------------------------------------------------------------------

/** How high the rock stands over the road at a portal, `u` metres to the side of its middle. */
const headwall = u => HEADWALL * Math.max(0, 1 - (u / face) ** 2) ** 0.62;

/** The top of the mountain is a ridge, not a point: it runs `half` metres either way from the summit along `angle`, through `points` points each way. */
const RIDGE = { angle: -0.95, half: 30, x: CX + 14, z: CZ - 10, points: 14 };

/**
 * How much of its height the mountain has gained `t` of the way in from its foot to its top: it
 * leaves the ground gently, as a grassy foot, steepens into rock, and eases off again to its ridge.
 */
const climb = (() => {
  const STEPS = 240;
  const slope = t => lerp(0.24, 1, smoothstep(t, 0.03, 0.26)) * lerp(1, 0.34, smoothstep(t, 0.66, 1));
  const gained = [0];
  for (let i = 1; i <= STEPS; i++) gained.push(gained[i - 1] + slope((i - 0.5) / STEPS));
  return t => {
    const u = Math.min(Math.max(t, 0), 1) * STEPS;
    const i = Math.min(Math.floor(u), STEPS - 1);
    return lerp(gained[i], gained[i + 1], u - i) / gained[STEPS];
  };
})();

/** Noise with sharp crests: 1 along them, falling away either side. */
const crests = (x, z, seed) => 1 - Math.abs(2 * fractalNoise(x, z, 2, seed) - 1);

/**
 * The mountain's skin: rows from its foot to its top, at the angles of `columns`. Returns the
 * corners of every row, the rock over each portal among them, and the triangles' corner numbers.
 */
function mountainSkin(columns) {
  const points = [];
  /** The ground along the foot, column by column. */
  const feet = columns.map(({ angle }) => {
    const r = VALLAVIK.edge(angle);
    return terrainHeight(CX + Math.cos(angle) * r, CZ + Math.sin(angle) * r);
  });
  const [ax, az] = [Math.cos(RIDGE.angle), Math.sin(RIDGE.angle)];
  columns.forEach(({ angle, arm, k }, i) => {
    const edge = VALLAVIK.edge(angle);
    // Over a portal the rock stands up from the ground at the foot; elsewhere the foot is just under it.
    let lift = -0.6;
    if (arm) {
      const u = Math.tan(angle - arm.angle) * arm.portal;
      const road = floorAt(arm, arm.portal);
      lift = k === 0 || k === BORE.length - 1 ? -1.2 : Math.max(road, feet[i]) + headwall(u) - feet[i];
    }
    // Ribs of rock run down from the ridge, with gullies between them.
    const rib = 0.86 + 0.26 * crests(Math.cos(angle) * 1.3 + 7.3, Math.sin(angle) * 1.3 + 2.1, 211);
    // How far along the ridge this side of the mountain comes up to it.
    const reaches = Math.cos(angle - RIDGE.angle);
    for (let j = 0; j <= ROWS; j++) {
      const t = (j / ROWS) ** 1.15;
      // The two sides of the mountain meet along the ridge at the same points, a set number of
      // them, so the top row of each side is one of those: no crack is left along the top.
      const onRidge = j === ROWS ? Math.round(reaches * RIDGE.points) / RIDGE.points : reaches;
      // How high the ridge is there.
      const crest = 1 - 0.2 * onRidge * onRidge + 0.16 * (valueNoise(onRidge * 2.6 + 5, 1.5, 229) - 0.5);
      // The upper slopes are drawn in towards the ridge, which lies a little north-east of the hall.
      const gather = smoothstep(t, 0.3, 1);
      const out = edge * (1 - t);
      const x = lerp(CX, RIDGE.x, gather) + Math.cos(angle) * out + ax * RIDGE.half * onRidge * gather;
      const z = lerp(CZ, RIDGE.z, gather) + Math.sin(angle) * out + az * RIDGE.half * onRidge * gather;
      const base = lerp(feet[i], level, smoothstep(t, 0, 0.5));
      const rise = VALLAVIK.height * climb(t) * lerp(rib, crest, t * t);
      // Knobs and hollows all over, none at the foot, where it has to meet the ground and the portals.
      const rough = smoothstep(t, 0.05, 0.34) * (1 - 0.75 * smoothstep(t, 0.82, 1));
      const lumps =
        (fractalNoise(x / 52 + 3.7, z / 52 + 9.1, 3, 223) - 0.5) * 26 + (crests(x / 17, z / 17, 227) - 0.5) * 7;
      // The rock over a portal is part of the slope behind it, further up.
      const over = Math.max(lift, 0) * (1 - smoothstep(t, 0.1, 0.6));
      // And it never dips under the ground it stands on, where that climbs faster than it does.
      const y = Math.max(base + over + rise + lumps * rough, terrainHeight(x, z) + 1.6 * smoothstep(t, 0, 0.06));
      points.push([x, j ? y : feet[i] + lift, z]);
    }
  });
  const at = (i, j) => (i % columns.length) * (ROWS + 1) + j;
  const index = [];
  for (let i = 0; i < columns.length; i++) {
    for (let j = 0; j < ROWS; j++)
      index.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
  }
  return { points, index, at };
}

/** The mountain's skin as a mesh, its corners shared so the light runs smoothly over it, coloured as the ground would be. */
function mountainMesh({ points, index }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  // Wound so that every face looks out of the mountain.
  const inside = [CX, level + 8, CZ];
  const wound = [];
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [points[index[i]], points[index[i + 1]], points[index[i + 2]]];
    const normal = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    // Along the ridge, neighbouring columns end at the same point: there is no triangle between them.
    if (Math.hypot(...normal) < 1e-6) continue;
    const out = normal[0] * (a[0] - inside[0]) + normal[1] * (a[1] - inside[1]) + normal[2] * (a[2] - inside[2]) > 0;
    wound.push(index[i], out ? index[i + 1] : index[i + 2], out ? index[i + 2] : index[i + 1]);
  }
  geometry.setIndex(wound);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(points.length * 3);
  const random = createRandom(4513);
  const color = new THREE.Color();
  points.forEach(([x, y, z], i) => {
    colorAsGround(x, z, y, normals.getY(i), color, random);
    color.toArray(colors, i * 3);
  });
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, groundMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// --- The bores and the hall -------------------------------------------------------------------

/** The rings of a bore's lining, from the hall's wall out to the portal: each a list of corners, one for every point of BORE. */
function boreRings(arm) {
  // The first lies on the hall's wall, which is round, so its sides are a little nearer the middle than its top.
  const rings = [BORE.map(([u, h]) => [...along(arm, Math.sqrt(hall.radius ** 2 - u * u), u), level + h])];
  const from = hall.radius + 2.5;
  const steps = Math.ceil((arm.portal - from) / 3.5);
  for (let i = 0; i <= steps; i++) {
    const d = lerp(from, arm.portal, i / steps);
    const y = floorAt(arm, d);
    rings.push(BORE.map(([u, h]) => [...along(arm, d, u), y + h]));
  }
  return rings.map(ring => ring.map(([x, z, y]) => [x, y, z]));
}

/** How far out from the middle of the hall, and how high above an arm's floor, a corner of its lining is. */
const inArm = (arm, [x, y, z]) => {
  const d = (x - CX) * arm.dx + (z - CZ) * arm.dz;
  return [d, y - floorAt(arm, d)];
};

/** The linings of the three bores, the rock of the hall and the pillar in its middle: everything the painted light falls on. */
function buildInside() {
  const faces = new Faces();
  for (const arm of arms) {
    const rings = boreRings(arm);
    const paint = (corner, _normal, out) => boreLight(arm, ...inArm(arm, corner), out);
    for (let i = 0; i < rings.length - 1; i++) {
      // Faced towards the middle of the bore, a little above the floor.
      const [mx, mz] = along(arm, (inArm(arm, rings[i][6])[0] + inArm(arm, rings[i + 1][6])[0]) / 2);
      const axis = [mx, rings[i][6][1] - 4, mz];
      for (let k = 0; k < BORE.length - 1; k++)
        faces.quad(rings[i][k], rings[i + 1][k], rings[i][k + 1], rings[i + 1][k + 1], paint, { towards: axis });
    }
  }

  // The hall: a round wall of rough rock under a dome, open where each bore comes through.
  const columns = anglesRound(
    () => hall.radius,
    BORE.map(([u]) => u),
    0.1,
    false,
  );
  const WALL_ROWS = 4;
  const DOME_ROWS = 6;
  const rough = (angle, y, amount) =>
    (fractalNoise(Math.cos(angle) * 5 + y * 0.21, Math.sin(angle) * 5 - y * 0.17, 2, 233) - 0.5) * amount;
  const profile = columns.map(({ angle, arm, k }) => {
    // Over a bore the wall starts at the bore's arch; elsewhere below the floor.
    const bottom = arm ? BORE[k][1] : WALL_BOTTOM;
    const rows = [];
    for (let j = 0; j <= WALL_ROWS; j++) {
      const y = lerp(bottom, hall.wall, j / WALL_ROWS);
      // The rock is rough, but true along the edge of a bore, where the lining meets it.
      const r =
        hall.radius + (arm ? (j / WALL_ROWS) * rough(angle, y, 1.4) : rough(angle, y, 1.6) * smoothstep(y, -0.5, 1.5));
      rows.push([CX + Math.cos(angle) * r, level + y, CZ + Math.sin(angle) * r]);
    }
    for (let j = 1; j < DOME_ROWS; j++) {
      const turn = (j / DOME_ROWS) * (Math.PI / 2);
      const r = (hall.radius + rough(angle, hall.wall + j, 1.8)) * Math.cos(turn);
      const y = hall.wall + (hall.height - hall.wall) * Math.sin(turn) + rough(angle + 2, j * 3.1, 1.2);
      rows.push([CX + Math.cos(angle) * r, level + y, CZ + Math.sin(angle) * r]);
    }
    return rows;
  });
  const middle = [CX, level + 4, CZ];
  const top = [CX, level + hall.height, CZ];
  const rock = (corner, normal, out) => hallLight(corner[1] - level, out).multiplyScalar(facet(normal, corner, 0.5));
  for (let i = 0; i < columns.length; i++) {
    const [a, b] = [profile[i], profile[(i + 1) % columns.length]];
    // Between two points of the same bore there is no wall below the arch: the rows start at it already.
    for (let j = 0; j < a.length - 1; j++) faces.quad(a[j], b[j], a[j + 1], b[j + 1], rock, { towards: middle });
    faces.triangle(a.at(-1), b.at(-1), top, rock, { towards: middle });
  }

  // The pillar: rock left standing in the middle of the roundabout, lit turquoise from its foot.
  const PILLAR = { sides: 14, rows: 9 };
  const pillarAt = (i, j) => {
    const angle = ((i % PILLAR.sides) / PILLAR.sides) * Math.PI * 2;
    const v = j / PILLAR.rows;
    const y = lerp(-0.4, hall.height + 1.5, v);
    // Wide at the foot, narrow at the waist and spreading out again into the dome.
    const r = 2.5 + 2.4 * (1 - v) ** 2.2 + 4.2 * v ** 5 + rough(angle + 1, y * 1.7, 1.5);
    return [CX + Math.cos(angle) * r, level + y, CZ + Math.sin(angle) * r];
  };
  const pillarLight = (corner, normal, out) => {
    const y = corner[1] - level;
    out
      .copy(BLUE.deep)
      .multiplyScalar(0.8)
      .lerp(BLUE.mid, smoothstep(y, 6, hall.height) * 0.7);
    return out.lerp(TURQUOISE, (1 - smoothstep(y, 0.3, 6)) * 0.85).multiplyScalar(facet(normal, corner, 0.6));
  };
  const pillarTop = [CX, level + hall.height + 1.5, CZ];
  for (let i = 0; i < PILLAR.sides; i++) {
    for (let j = 0; j < PILLAR.rows; j++)
      faces.quad(pillarAt(i, j), pillarAt(i + 1, j), pillarAt(i, j + 1), pillarAt(i + 1, j + 1), pillarLight, {
        away: middle,
      });
    // Closed over, up in the rock above the dome.
    faces.triangle(pillarAt(i, PILLAR.rows), pillarAt(i + 1, PILLAR.rows), pillarTop, pillarLight, { away: middle });
  }

  // The floor, in the same painted light: asphalt across each bore from its portal to the hall,
  // with a broken line down the middle and a line along each edge of the road, and across the
  // hall from the island to the wall.
  const up = { towards: [CX, level + 1000, CZ] };
  for (const arm of arms) {
    const steps = Math.ceil((arm.portal - hall.radius + 2) / 2.5);
    const at = i => lerp(hall.radius - 2, arm.portal, i / steps);
    /** A strip of floor between two distances out and two distances across, `lift` above the ground. */
    const strip = (d0, d1, u0, u1, lift, surface) => {
      const corner = (d, u) => {
        const [x, z] = along(arm, d, u);
        return [x, terrainHeight(x, z) + lift, z];
      };
      const paint = ([x, , z], _normal, out) =>
        floorLight(surface, arm, (x - CX) * arm.dx + (z - CZ) * arm.dz, -(x - CX) * arm.dz + (z - CZ) * arm.dx, out);
      faces.quad(corner(d0, u0), corner(d1, u0), corner(d0, u1), corner(d1, u1), paint, up);
    };
    const across = 8;
    const half = bore.radius - 0.02;
    for (let i = 0; i < steps; i++) {
      for (let k = 0; k < across; k++)
        strip(at(i), at(i + 1), lerp(-half, half, k / across), lerp(-half, half, (k + 1) / across), FLOOR, TARMAC);
      for (const side of [-1, 1]) strip(at(i), at(i + 1), side * 4.1 - 0.09, side * 4.1 + 0.09, LINES, PAINT);
    }
    // The line down the middle: dashes, from the portal to where the hall opens out.
    for (let d = arm.portal - 1; d > hall.radius + 6; d -= 9) {
      for (let n = 0; n < 2; n++) strip(d - 2.25 * (n + 1), d - 2.25 * n, -0.1, 0.1, LINES, PAINT);
    }
    // And where the bore meets the hall, a row of blocks across the way in, as at any roundabout.
    // They lie across the lane that comes in: the right-hand one, which is the left looking out from the hall.
    for (let u = -3.6; u <= -0.4; u += 0.8)
      strip(hall.radius + 1.2, hall.radius + 1.75, u - 0.25, u + 0.25, LINES, PAINT);
  }
  /** A ring of the hall's floor between two distances from its middle, `y` above it. */
  const ring = (r0, r1, y0, y1, surface, sides = 72) => {
    const corner = (r, y, i) => {
      const angle = ((i % sides) / sides) * Math.PI * 2;
      return [CX + Math.cos(angle) * r, level + y, CZ + Math.sin(angle) * r];
    };
    const paint = ([x, , z], _normal, out) =>
      floorLight(surface, null, Math.hypot(x - CX, z - CZ), Math.atan2(z - CZ, x - CX), out);
    const facing = y0 === y1 ? up : { away: [CX, level, CZ] };
    for (let i = 0; i < sides; i++)
      faces.quad(corner(r0, y0, i), corner(r0, y0, i + 1), corner(r1, y1, i), corner(r1, y1, i + 1), paint, facing);
  };
  const radii = [hall.island - 0.1, hall.island + 3, hall.island + 7, 19, 22.5, 25, hall.radius + 0.5];
  for (let i = 0; i < radii.length - 1; i++) ring(radii[i], radii[i + 1], FLOOR, FLOOR, TARMAC);
  ring(hall.island + 0.6, hall.island + 0.85, LINES, LINES, PAINT);
  // The island: a kerb of pale stone, and its top, round the foot of the pillar and on under it.
  ring(hall.island + 0.1, hall.island, FLOOR, 0.45, STONE, 40);
  ring(hall.island, 3.6, 0.45, 0.45, STONE, 40);
  const islandTop = (i, r = 3.6) => {
    const angle = ((i % 40) / 40) * Math.PI * 2;
    return [CX + Math.cos(angle) * r, level + 0.45, CZ + Math.sin(angle) * r];
  };
  const stone = (_corner, _normal, out) => floorLight(STONE, null, 3.6, 0, out);
  for (let i = 0; i < 40; i++) faces.triangle(islandTop(i), islandTop(i + 1), [CX, level + 0.45, CZ], stone, up);

  const mesh = new THREE.Mesh(
    faces.geometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, name: 'tunnel light' }),
  );
  // It keeps the sun off the floor and off the car: the faces of the lining that look away from the sun are the ones that shade.
  mesh.castShadow = true;
  return mesh;
}

// --- The portals ------------------------------------------------------------------------------

/** The rock face round each portal: from the mouth of the bore out to the edge of the mountain's skin. */
function buildPortalFaces(skin, columns) {
  const geometry = [];
  const random = createRandom(4517);
  const color = new THREE.Color();
  for (const arm of arms) {
    const faces = new Faces();
    const road = floorAt(arm, arm.portal);
    const mouth = BORE.map(([u, h]) => {
      const [x, z] = along(arm, arm.portal, u);
      return [x, road + h, z];
    });
    // The skin's corners along the cut, numbered as the bore's are.
    const rim = [];
    columns.forEach((column, i) => {
      if (column.arm === arm) rim[column.k] = skin.points[skin.at(i, 0)];
    });
    const outside = along(arm, arm.portal + 30);
    // A cut face of rock: the colour the ground has where it is steep.
    const paint = ([x, y, z], _normal, out) => out.copy(colorAsGround(x, z, y, 0.2, color, random));
    for (let k = 0; k < BORE.length - 1; k++)
      faces.quad(rim[k], rim[k + 1], mouth[k], mouth[k + 1], paint, { towards: [outside[0], road + 4, outside[1]] });
    geometry.push(faces.geometry());
  }
  return geometry.map(g => {
    const mesh = new THREE.Mesh(g, groundMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  });
}

/** A concrete ring round the mouth of each bore, standing a little proud of the rock, and the lamps along the bores. */
function buildFittings() {
  const concrete = new PartsBuilder();
  const lamps = new PartsBuilder();
  const blue = new PartsBuilder();
  for (const arm of arms) {
    const yaw = Math.atan2(arm.dx, arm.dz);
    const road = floorAt(arm, arm.portal);
    const d = arm.portal + 0.5;
    for (let k = 0; k <= ARCH_STEPS; k++) {
      const angle = (k / ARCH_STEPS) * Math.PI;
      const r = bore.radius + 0.5;
      const [x, z] = along(arm, d, Math.cos(angle) * r);
      concrete.box(1.75, 1.05, 1.9, '#c3c2b8', {
        x,
        y: road + bore.spring + Math.sin(angle) * r,
        z,
        ry: yaw,
        rz: Math.PI / 2 - angle,
      });
    }
    for (const side of [-1, 1]) {
      const [x, z] = along(arm, d, side * (bore.radius + 0.5));
      concrete.box(1.05, bore.spring + 1.6, 1.9, '#c3c2b8', { x, y: road + bore.spring / 2 - 0.5, z, ry: yaw });
    }
    // A lamp at the crown every few metres: warm along the bore, blue towards the hall.
    for (const lamp of arm.lamps) {
      const [x, z] = along(arm, lamp);
      const part = blueness(lamp) > 0.5 ? blue : lamps;
      part.box(0.5, 0.16, 1.5, '#ffffff', { x, y: floorAt(arm, lamp) + CROWN - 0.16, z, ry: yaw });
    }
  }
  // Round the foot of the hall's wall, small lamps that throw the gold light up it.
  const columns = anglesRound(
    () => hall.radius,
    BORE.map(([u]) => u),
    0.14,
    false,
  );
  for (const { angle, arm } of columns) {
    if (arm) continue;
    // Tucked in against the rock, where no wheel comes.
    const r = hall.radius - 0.28;
    lamps.box(0.7, 0.22, 0.4, '#ffffff', {
      x: CX + Math.cos(angle) * r,
      y: level + 0.2,
      z: CZ + Math.sin(angle) * r,
      ry: -angle,
    });
  }
  const glow = (parts, color) => {
    const mesh = parts.mesh({ castShadow: false, receiveShadow: false });
    mesh.material = new THREE.MeshBasicMaterial({ color });
    return mesh;
  };
  return [concrete.mesh(), glow(lamps, '#ffe7b8'), glow(blue, '#9fd8ff')];
}

const indoors = { cover: 0, color: new THREE.Color() };

/**
 * The light on whatever is driving through the tunnel at (x, z): `cover` is how far out of the
 * daylight it is, from 0 outside and at the portals to 1 well inside, and `color` the colour of
 * the lamps there, warm along the bores and blue in the hall.
 */
export function tunnelLight(x, z) {
  const where = inVallavikTunnel(x, z);
  indoors.cover = where ? smoothstep(where.depth, 0, 14) : 0;
  if (where) {
    const blue = blueness(Math.hypot(x - CX, z - CZ));
    // Paler than the walls are painted: a car has to keep its own colour under it.
    indoors.color.copy(LAMP_LIGHT).lerp(PALE_BLUE, blue);
  }
  return indoors;
}

export function buildVallavik(scene, obstacles) {
  for (const arm of arms) arm.lamps ??= lampsOf(arm);
  const columns = anglesRound(
    arm => arm.portal,
    BORE.map((_, k) => face * Math.cos((k / (BORE.length - 1)) * Math.PI)),
    COLUMN,
    true,
  );
  const skin = mountainSkin(columns);
  const mountain = mountainMesh(skin);
  const inside = buildInside();
  scene.add(mountain, inside, ...buildPortalFaces(skin, columns), ...buildFittings());

  // What stops the car: the walls of the bores and the hall, the island, the rock beside each
  // portal, and the foot of the mountain all the way round.
  const wall = bore.radius + 0.25;
  const segment = (a, b, radius) => obstacles.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], radius });
  for (const arm of arms) {
    for (const side of [-1, 1]) {
      segment(
        along(arm, Math.sqrt((hall.radius + 0.25) ** 2 - wall ** 2), side * wall),
        along(arm, arm.portal, side * wall),
        0.25,
      );
      segment(along(arm, arm.portal, side * wall), along(arm, arm.portal, side * face), 0.6);
    }
  }
  // The hall's wall runs from the side of one bore round to the side of the next.
  const rim = hall.radius + 0.25;
  const opening = Math.asin(wall / rim);
  const onRim = angle => [CX + Math.cos(angle) * rim, CZ + Math.sin(angle) * rim];
  const inOrder = [...arms].sort((a, b) => a.angle - b.angle);
  inOrder.forEach((arm, i) => {
    const next = inOrder[(i + 1) % inOrder.length];
    const from = arm.angle + opening;
    const to = next.angle - opening + (i + 1 === inOrder.length ? Math.PI * 2 : 0);
    const pieces = Math.ceil((to - from) / 0.09);
    for (let n = 0; n < pieces; n++)
      segment(onRim(lerp(from, to, n / pieces)), onRim(lerp(from, to, (n + 1) / pieces)), 0.25);
  });
  obstacles.push({ x: CX, z: CZ, radius: hall.island });
  // The foot of the mountain, a little in from where the rock goes into the ground.
  for (let i = 0; i < columns.length; i++) {
    const [a, b] = [columns[i], columns[(i + 1) % columns.length]];
    if (a.arm && b.arm) continue;
    const at = ({ angle }) => {
      const r = VALLAVIK.edge(angle) - 2.2;
      return [CX + Math.cos(angle) * r, CZ + Math.sin(angle) * r];
    };
    segment(at(a), at(b), 1);
  }

  return { occluders: [mountain, inside] };
}
