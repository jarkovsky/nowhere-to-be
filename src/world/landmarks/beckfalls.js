// The falls at the head of the lakeland's gorge: the beck comes over a buttress of grey rock built
// out from the head wall, in steps and ledges, and lands on the floor of the hollow just where
// the beck begins. A thin sheet of water runs from its foot to the start of the beck. The rock
// and the boulders at its foot are solid, so the car stops at the water.
//
// The walls of the hollow are too steep to drive back up, and beside and above the fall they come
// down on to the back of the rock, not to the floor of the gorge: a car that got on to them there,
// over the rim or up from the floor, would be left standing against the rock with no way on and
// none back. So the rock is one line from rim to rim: a rib of boulders runs up each wall from
// the rock's shoulder, and from the top of each rib a wooden rail runs along the rim and out to
// the land's fence. What comes up against the ribs from below is on a slope that takes it back
// down to the floor, and the rail keeps what is above on the level ground.
import * as THREE from 'three';
import { createRandom, lerp, smoothstep } from '../../core/math.js';
import { LAKELAND, RIVERS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { triangleGeometry } from '../build.js';
import { createFences } from '../fences.js';
import { boulderGeometry, rockMaterial, softenRock } from '../rocks.js';

/** Metres upstream of the beck's start that the foot of the fall stands. */
const FOOT = 5.5;
/** How high the rock stands above the floor of the hollow at its centre, and the water's width. */
const LIP = 10.9;
const FALL_WIDTH = 3;
/** Across the rock, every 1.5 m, and the heights of its blocks: [distance from the centre, height]. */
const COLUMNS = Array.from({ length: 27 }, (_, i) => (i - 13) * 1.5);
const BLOCKS = [
  [4.4, LIP],
  [8, 8.2],
  [11, 5.8],
  [14, 3.6],
  [17, 1.8],
  [Infinity, 0.6],
];
/** Rows from the foot towards the head wall, metres behind the foot. */
const ROWS = [
  -1, 0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3, 3.3, 3.6, 4.2, 5, 6, 7.5, 9, 10.5, 12, 13.5, 15, 16.5, 18,
  19.5, 21, 22.5, 24, 25.5, 27, 28.5,
];
/** The profile of the face the water runs down: [metres behind the foot, height]. */
const FACE = [
  [0, 0],
  [0.9, 4.4],
  [1.5, 4.8],
  [2.4, 10.4],
  [3, 10.8],
  [3.6, LIP],
];
/** The top of the rock rises a little towards the head wall, as the slope does. */
const RISE = 0.06;

/**
 * The rib of boulders up each wall of the hollow from the rock's shoulder to the rim, as [metres
 * upstream of the beck's start, metres to the right of it, size]: each overlaps the next, the
 * lowest the rock and the highest the first post of the rail.
 */
const RIBS = [
  [13, 20.6, 2.3],
  [12.2, 22.9, 2],
  [13.5, 25, 2.5],
  [12.8, 27.4, 2.2],
  [13, -20.6, 2.3],
  [12.2, -22.9, 2],
  [13.6, -25.1, 2.5],
  [12.6, -27.5, 2.1],
  [13.4, -29.8, 2.4],
  [12.4, -32.2, 2],
  [13.3, -34.4, 2.4],
  [12.6, -36.7, 2.2],
];
/**
 * The rail along the rim of each wall, as [metres upstream, metres to the right]: from the top of
 * the rib, back from the edge of the wall. From its last point each runs straight out to the
 * land's fence.
 */
const RAILS = [
  [
    [13, 28],
    [27, 28],
    [34, 24],
  ],
  [
    [12.5, -38],
    [20, -38.5],
  ],
];
/** The furthest apart two posts of the rail stand. */
const POSTS = 3.2;

const GREY = new THREE.Color('#8c909c');
const DARK = new THREE.Color('#6f7380');
const MOSS = new THREE.Color('#948850');

/** How far the foot of the rock stands upstream at `across` metres from the centre: it curves back round the hollow. */
const footAt = across => FOOT + 0.03 * Math.max(0, Math.abs(across) - 3) ** 2;

/** The face's height at `behind` metres behind the foot. */
function faceHeight(behind) {
  for (let i = 1; i < FACE.length; i++) {
    if (behind <= FACE[i][0]) {
      const [[u0, h0], [u1, h1]] = [FACE[i - 1], FACE[i]];
      return lerp(h0, h1, (behind - u0) / (u1 - u0));
    }
  }
  return LIP;
}

/** `behind` at which the face reaches `height`, for hanging the water on it. */
function faceDepth(height) {
  for (let i = 1; i < FACE.length; i++) {
    if (height <= FACE[i][1]) {
      const [[u0, h0], [u1, h1]] = [FACE[i - 1], FACE[i]];
      return lerp(u0, u1, (height - h0) / (h1 - h0));
    }
  }
  return FACE.at(-1)[0];
}

export function buildBeckFalls(group, obstacles) {
  const random = createRandom(2027);
  const start = RIVERS.at(-1).path.at(0);
  const up = { x: -start.dx, z: -start.dz };
  const right = { x: -up.z, z: up.x };
  /** The world position `along` metres upstream of the beck's start and `across` to the right of it. */
  const at = (along, across) => ({
    x: start.x + up.x * along + right.x * across,
    z: start.z + up.z * along + right.z * across,
  });
  const ground = (along, across) => {
    const p = at(along, across);
    return terrainHeight(p.x, p.z);
  };
  // The floor of the hollow, beside the beck.
  const floor = ground(10, 6);

  // The rock: a grid of points across it and back from its foot, each at the height of its block
  // or, where that is under the ground, under the ground.
  const columns = COLUMNS.map(across => {
    const middle = Math.abs(across) < 2.3;
    const block = BLOCKS.find(([reach]) => Math.abs(across) < reach)[1];
    return {
      across,
      middle,
      mix: smoothstep(Math.abs(across), 2.2, 4),
      height: middle ? LIP : Math.max(0, block + (random() - 0.5) * 0.8),
      period: 2.5 + random() * 0.8,
      phase: random() * 0.5,
    };
  });
  const heightOf = (column, behind) => {
    if (behind <= 0) return -1;
    const steps = (behind * 2.9) / column.period + column.phase;
    const k = Math.floor(steps);
    const terraced = Math.min(column.height, (k + smoothstep(steps - k, 0.7, 1) - column.phase) * column.period);
    const face = Math.min(faceHeight(behind), column.height);
    const top = column.middle ? face : lerp(face, terraced, column.mix);
    return top + RISE * Math.max(0, behind - 3.6);
  };
  const grid = columns.map(column =>
    ROWS.map(behind => {
      const along = footAt(column.across) + behind;
      const p = at(along, column.across);
      // The top is broken up a little, but not where the water runs.
      const broken = column.middle ? 0 : (random() - 0.5) * 0.9 * smoothstep(behind, 3.6, 5);
      const [y, under] = [floor + heightOf(column, behind) + broken, terrainHeight(p.x, p.z)];
      return { x: p.x, z: p.z, y: y > under + 0.03 ? y : Math.min(y, under - 0.4), hidden: y <= under + 0.03 };
    }),
  );

  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  const triangle = (a, b, c) => {
    const [ab, ac] = [new THREE.Vector3(), new THREE.Vector3()];
    ab.set(b.x - a.x, b.y - a.y, b.z - a.z);
    ac.set(c.x - a.x, c.y - a.y, c.z - a.z);
    const up = ab.cross(ac).normalize().y;
    const height = (a.y + b.y + c.y) / 3 - floor;
    color.copy(GREY).lerp(DARK, smoothstep(0.5 - up, 0, 0.9) * 0.55);
    // Moss on the ledges low down, where the spray would reach.
    color.lerp(MOSS, smoothstep(up, 0.7, 0.95) * (1 - smoothstep(height, 1, 7)) * 0.6);
    color.multiplyScalar(0.88 + random() * 0.2);
    for (const p of [a, b, c]) positions.push(p.x, p.y, p.z);
    for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
  };
  for (let i = 0; i < columns.length - 1; i++) {
    for (let j = 0; j < ROWS.length - 1; j++) {
      const [a, b, c, d] = [grid[i][j], grid[i + 1][j], grid[i][j + 1], grid[i + 1][j + 1]];
      if (a.hidden && b.hidden && c.hidden && d.hidden) continue;
      triangle(a, b, c);
      triangle(c, b, d);
    }
  }

  // Boulders at the foot, either side of the water; they overlap the rock's obstacles.
  const upright = new THREE.Vector3(0, 1, 0);
  /** A boulder; `lying` on a slope it is turned to lie on it, set `sunk` metres into it. */
  const boulder = (along, across, size, seed, { lying = false, sunk = 0.25 } = {}) => {
    const geometry = boulderGeometry(seed, { detail: 1, moss: 0.2 }).toNonIndexed();
    const p = at(along, across);
    const y = terrainHeight(p.x, p.z);
    const slope = new THREE.Vector3(
      terrainHeight(p.x - 1, p.z) - terrainHeight(p.x + 1, p.z),
      2,
      terrainHeight(p.x, p.z - 1) - terrainHeight(p.x, p.z + 1),
    ).normalize();
    const turned = new THREE.Quaternion().setFromAxisAngle(upright, random() * 6.28);
    if (lying) turned.premultiply(new THREE.Quaternion().setFromUnitVectors(upright, slope));
    const into = lying ? slope : upright;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x - into.x * sunk, y - into.y * sunk, p.z - into.z * sunk),
      turned,
      new THREE.Vector3(size, size * 0.9, size),
    );
    geometry.applyMatrix4(matrix);
    positions.push(...geometry.attributes.position.array);
    colors.push(...geometry.attributes.color.array);
    obstacles.push({ x: p.x, z: p.z, radius: size * 0.95 });
  };
  boulder(5.2, -6.2, 1.9, 3);
  boulder(5.6, 6.6, 1.6, 8);
  boulder(7.6, -9.2, 2.3, 12);
  boulder(8.2, 9.4, 2.1, 5);
  // And the ribs up the walls either side, each rock lying on the slope and set well into it.
  RIBS.forEach(([along, across, size], i) => boulder(along, across, size, 21 + i, { lying: true, sunk: 0.55 }));

  // The rock is solid over all of its footprint: circles along its foot, the outer ones reaching
  // the gorge walls, and behind them as far back as it stands clear of the slope it is built out
  // from, so nothing coming down that slope ends up inside it.
  for (let across = -16; across <= 16; across += 4) {
    const column = columns[Math.round(across / 1.5) + 13];
    for (let behind = 2.6; behind < ROWS.at(-1); behind += 4) {
      const p = at(footAt(across) + behind, across);
      if (behind > 2.6 && floor + heightOf(column, behind) < terrainHeight(p.x, p.z) + 0.5) break;
      obstacles.push({ x: p.x, z: p.z, radius: 3.4 });
    }
  }

  // The rails along the rim. The last stretch of each is square to the land's fence, and ends at it.
  const fences = createFences();
  for (const rail of RAILS) {
    const corners = rail.map(([along, across]) => at(along, across));
    const last = corners.at(-1);
    const out = Math.hypot(last.x - LAKELAND.x, last.z - LAKELAND.z);
    const reach = (LAKELAND.radius + 1.8) / out;
    corners.push({ x: LAKELAND.x + (last.x - LAKELAND.x) * reach, z: LAKELAND.z + (last.z - LAKELAND.z) * reach });
    const posts = [];
    corners.slice(1).forEach((to, i) => {
      const from = corners[i];
      const count = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / POSTS);
      for (let k = i ? 1 : 0; k <= count; k++) {
        const [x, z] = [lerp(from.x, to.x, k / count), lerp(from.z, to.z, k / count)];
        posts.push({ x, y: terrainHeight(x, z), z });
      }
    });
    fences.add(posts);
  }
  group.add(fences.mesh());
  obstacles.push(...fences.obstacles);

  const rock = new THREE.Mesh(softenRock(triangleGeometry(positions, colors)), rockMaterial);
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.name = 'rock';
  group.add(rock);

  // The water: a ribbon down the face from the top, with a thinner one in front of it, a sheet
  // across the top back to where the slope meets it, and a sheet along the floor to the beck.
  const lipTop = floor + LIP;
  const body = [];
  for (const h of [LIP + 0.25, LIP - 0.4, 8.5, 6, 4.8, 3, 1.4, 0.15]) {
    const bulge = 0.3 + 0.3 * (1 - Math.min(h, LIP) / LIP) ** 2;
    body.push({ along: FOOT + faceDepth(Math.min(h, LIP)) - bulge, y: floor + h + 0.12 });
  }
  body[0].along = FOOT + 3.9;
  const verts = [];
  const tints = [];
  const FALL = new THREE.Color('#cdeeed');
  const SHEET = new THREE.Color('#8fc4c6');
  const strip = (width, push) => {
    for (let k = 0; k < body.length - 1; k++) {
      const [p0, p1] = [body[k], body[k + 1]];
      const corner = (point, side) => {
        const q = at(point.along - push, (side * width) / 2);
        return [q.x, point.y, q.z];
      };
      verts.push(
        ...corner(p0, -1),
        ...corner(p1, -1),
        ...corner(p0, 1),
        ...corner(p0, 1),
        ...corner(p1, -1),
        ...corner(p1, 1),
      );
    }
  };
  strip(FALL_WIDTH, 0);
  strip(FALL_WIDTH * 0.6, 0.18);
  while (tints.length < verts.length) tints.push(FALL.r, FALL.g, FALL.b);
  const sheet = (width, along0, along1, height, steps) => {
    for (let k = 0; k < steps; k++) {
      const [s0, s1] = [lerp(along0, along1, k / steps), lerp(along0, along1, (k + 1) / steps)];
      const [a, b, c, d] = [at(s0, -width / 2), at(s0, width / 2), at(s1, -width / 2), at(s1, width / 2)];
      const [y0, y1] = [height(s0), height(s1)];
      verts.push(a.x, y0, a.z, c.x, y1, c.z, b.x, y0, b.z, b.x, y0, b.z, c.x, y1, c.z, d.x, y1, d.z);
    }
  };
  // Along the top, from the lip back to where the ground rises above the rock.
  let back = FOOT + 3.6;
  while (back < FOOT + 28 && ground(back, 0) < lipTop + RISE * (back - FOOT - 3.6) - 0.2) back += 1;
  const topHeight = along => lipTop + RISE * (along - FOOT - 3.6) + 0.1;
  sheet(FALL_WIDTH * 0.85, FOOT + 3.9, back, topHeight, Math.ceil(back - FOOT - 3.9));
  // Along the floor, from the foot of the fall to the beck.
  sheet(
    FALL_WIDTH * 1.1,
    FOOT - 0.7,
    -0.5,
    along => Math.max(...[-1.7, -0.8, 0, 0.8, 1.7].map(across => ground(along, across))) + 0.1,
    12,
  );

  while (tints.length < verts.length) tints.push(SHEET.r, SHEET.g, SHEET.b);
  const water = new THREE.BufferGeometry();
  water.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  water.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
  water.computeVertexNormals();
  const waterMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: '#4f8f97',
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(water, waterMaterial));

  // Streaks sliding down the fall, slowly and evenly.
  const streaks = Array.from({ length: 10 }, (_, i) => ({
    offset: (i + random() * 0.5) / 10,
    lateral: (random() - 0.5) * (FALL_WIDTH - 0.6),
    speed: 0.32 + random() * 0.08,
  }));
  const streakMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 1.4, 0.12),
    new THREE.MeshBasicMaterial({ color: '#f4fbf8', transparent: true, opacity: 0.8 }),
    streaks.length,
  );
  const middleOfFall = at(FOOT + 2, 0);
  streakMesh.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(middleOfFall.x, floor + LIP / 2, middleOfFall.z),
    Math.hypot(FALL_WIDTH / 2, LIP / 2 + 1.5, 3) + 0.5,
  );
  group.add(streakMesh);
  const dummy = new THREE.Object3D();
  const pointOnFall = t => {
    const f = t * (body.length - 1);
    const k = Math.min(Math.floor(f), body.length - 2);
    const u = f - k;
    return [lerp(body[k].along, body[k + 1].along, u), lerp(body[k].y, body[k + 1].y, u)];
  };

  return {
    update(time) {
      streaks.forEach(({ offset, lateral, speed }, i) => {
        const t = (offset + time * speed) % 1;
        const [along, y] = pointOnFall(t);
        const p = at(along - 0.2, lateral);
        dummy.position.set(p.x, y, p.z);
        dummy.scale.set(1, 0.5 + t, 1);
        dummy.updateMatrix();
        streakMesh.setMatrixAt(i, dummy.matrix);
      });
      streakMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
