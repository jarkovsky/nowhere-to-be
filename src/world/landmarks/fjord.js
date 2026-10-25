// The fjord in the north-west: still, deep water between walls of rock with waterfalls
// down them, and at its head a small village of wooden houses with grass growing on their
// roofs, red boathouses at the water's edge, a stave church up the slope, and the quay where
// the car ferry ties up (the ferry itself is in ../ferry.js). At the top of the road down, a
// sign warns of trolls.
import * as THREE from 'three';
import { lerp } from '../../core/math.js';
import { HULL } from '../../core/ferry.js';
import { FERRY_QUAY, FJORD, FJORD_VILLAGE, TRACKS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, hipRoof, createSmoke, flatMaterial, prism } from '../build.js';
import { gabledHouse } from './house.js';
import { canvasTexture } from './signs.js';
import { framer } from './frame.js';

const WHITE = '#f1ede2';
const TURF = '#6f8a46';
const TAR = '#4a3526';
const SHINGLE = '#3b2b21';
const GLASS = '#3f5559';
const STONE = '#8e8f86';
const CONCRETE = '#a7a59b';
const STEEL = '#5e676b';
const DECK = '#7d817d';
const RAIL = '#d8b23c';
const PILE = '#5d4a39';

/** A window with a white frame, in a wall facing +Z. */
function framedWindow(parts, at, lx, ly, lz, extra) {
  parts.box(1.05, 1.15, 0.1, WHITE, at(lx, ly, lz, extra));
  parts.box(0.8, 0.9, 0.1, GLASS, at(lx, ly, lz + 0.03, extra));
}

let tufted = null;

/** A tuft of long grass: blades leaning out from one root, each with a face on both sides. */
function tuft() {
  if (tufted) return tufted;
  const corners = [];
  for (let k = 0; k < 6; k++) {
    const a = k * 2.4;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    const height = 0.38 + (k % 3) * 0.08;
    const [left, right] = [
      [-dz * 0.05, 0, dx * 0.05],
      [dz * 0.05, 0, -dx * 0.05],
    ];
    const top = [dx * 0.32 * height, height, dz * 0.32 * height];
    corners.push(left, right, top, right, left, top);
  }
  tufted = prism(corners);
  return tufted;
}

/**
 * A stone footing `width` by `depth` round the middle of the frame, from 0.3 m up down to the
 * ground at the lowest corner, where the slope falls away.
 */
function footing(parts, { at, ground }, width, depth) {
  const corners = [-1, 1].flatMap(sx => [-1, 1].map(sz => ground((sx * width) / 2, (sz * depth) / 2)));
  const drop = ground(0, 0) - Math.min(...corners);
  parts.box(width, 0.6 + drop, depth, STONE, at(0, -drop / 2, 0));
}

/** A wooden house with its long side to the water, white trim and a grass roof. */
function house(parts, obstacles, spot) {
  const frame = framer(spot);
  const { at } = frame;
  const [width, depth, eave, ridge] = [7.5, 5.6, 3.3, 5.6];
  footing(parts, frame, width + 0.4, depth + 0.4);
  obstacles.push(
    gabledHouse(parts, frame, {
      width,
      depth,
      base: 0.2,
      eave: eave + 0.2,
      ridge: ridge + 0.05,
      overhang: 0.45,
      ridgeAlong: 'x',
      walls: spot.paint,
      roof: TURF,
    }),
  );
  // Tufts along the ridge, where the grass grows longest.
  for (let k = -3; k <= 3; k++) parts.add(tuft(), '#7f9a52', at(k * 1.05, ridge - 0.02, 0, { ry: k }));
  for (const side of [-1, 1]) {
    for (const end of [-1, 1])
      parts.box(0.18, eave, 0.18, WHITE, at(side * (width / 2), eave / 2 + 0.2, end * (depth / 2)));
  }
  parts.box(1.1, 2.1, 0.12, '#3d5b6b', at(-1.6, 1.25, depth / 2 + 0.02)); // door
  parts.box(1.4, 0.16, 0.16, WHITE, at(-1.6, 2.4, depth / 2 + 0.05));
  for (const lx of [0.6, 2.4]) framedWindow(parts, at, lx, 2, depth / 2 + 0.03);
  parts.box(0.7, 1.6, 0.7, STONE, at(2, ridge + 0.2, -0.8)); // chimney
  return at(2, ridge + 1.2, -0.8);
}

/** A boathouse at the water's edge: red boards, a dark roof and big doors facing the water. */
function boathouse(parts, obstacles, spot) {
  const frame = framer(spot);
  const { at } = frame;
  const [width, depth, eave, ridge] = [4.6, 7, 2.6, 4.6];
  obstacles.push(
    gabledHouse(parts, frame, {
      width,
      depth,
      eave,
      ridge: ridge + 0.05,
      overhang: 0.35,
      walls: spot.paint,
      roof: '#4d4f4c',
    }),
  );
  parts.box(2.8, 2.2, 0.1, '#7d2a20', at(0, 1.1, depth / 2 + 0.02)); // doors
  parts.box(0.12, 2.3, 0.14, WHITE, at(0, 1.15, depth / 2 + 0.06));
  parts.box(3.1, 0.14, 0.14, WHITE, at(0, 2.3, depth / 2 + 0.06));
  for (const side of [-1, 1]) parts.box(0.18, eave, 0.18, WHITE, at(side * (width / 2), eave / 2, depth / 2));
}

/** A stave church: tarred timber, roofs stacked one above another, a spire and dragons on the gables. */
function staveChurch(parts, obstacles, spot) {
  const frame = framer(spot);
  const { at, local } = frame;
  // A low covered gallery all round, under a skirt roof that rises as steeply as it runs in: from
  // its eaves 0.7 m out from the gallery's walls, it meets them 0.7 m up and goes on up to the
  // walls of the tall nave inside. All on a stone footing.
  footing(parts, frame, 7.8, 9.8);
  parts.box(7.4, 2.9, 9.4, TAR, at(0, 1.45, 0));
  parts.add(hipRoof(8.8, 10.8, 2.2, 5.6, 7.6, 3.8), SHINGLE, at(0, 0, 0));
  gabledHouse(parts, frame, { width: 5.6, depth: 7.6, base: 1, eave: 5.8, ridge: 9.25, walls: TAR, roof: SHINGLE });
  // A tower over the middle with a second, smaller skirt roof, rising a metre for every 0.6 m in:
  // from its eaves 0.5 m out from the tower, it meets the tower's walls and goes on up to the
  // belfry above, under the spire.
  const [eaves, out, steep] = [10.6, 0.5, 1 / 0.6];
  parts.box(2.6, eaves + out * steep - 8.6, 2.6, TAR, at(0, (8.6 + eaves + out * steep) / 2, 0));
  parts.add(hipRoof(3.6, 3.6, eaves, 1.6, 1.6, eaves + (out + 0.5) * steep), SHINGLE, at(0, 0, 0));
  parts.box(1.6, 1.6, 1.6, TAR, at(0, 12.3, 0));
  parts.add(new THREE.ConeGeometry(1.25, 4.2, 4), SHINGLE, at(0, 15.2, 0, { ry: spot.rotation + Math.PI / 4 }));
  // Dragon heads curling up from the ends of the ridge.
  for (const end of [-1, 1]) {
    parts.box(0.22, 0.22, 1.5, TAR, at(0, 9.6, end * 4.4, { rx: end * -0.6 }));
    parts.box(0.26, 0.4, 0.4, TAR, at(0, 10.3, end * 5, { rx: end * -0.2 }));
  }
  parts.box(1.4, 2.2, 0.12, '#6b3a24', at(0, 1.4, 4.72)); // door, under the gallery roof
  obstacles.push({ ...local(0, 0), halfX: 4, halfZ: 5, rotation: spot.rotation, radius: 0 });
}

/**
 * The ferry quay at the end of the road: a concrete abutment, and from it a steel ramp out over
 * the water to where the ferry ties up, hung at its far end from a gantry on two towers, with
 * timber piles either side of the berth to guide the ferry in.
 */
function quay(parts, obstacles) {
  const { at, local } = framer(FERRY_QUAY, 0);
  const { from, to, width, low, high } = FERRY_QUAY;
  const point = (lx, y, lz) => ({ ...local(lx, lz), y });
  const bed = FJORD.level - 3;
  const top = FJORD.level + 7.5;
  // The ramp's land end rests on the abutment.
  parts.box(width + 1.6, low - 0.12 - bed, 3, CONCRETE, at(0, (low - 0.12 + bed) / 2, from - 1));
  parts.beam(point(0, low - 0.06, from), point(0, high - 0.06, to), width, DECK, 0.12);
  for (const side of [-1, 1]) {
    // A girder along each side of the ramp, with a rail along it.
    const x = side * (width / 2 + 0.15);
    parts.beam(point(x, low - 0.05, from), point(x, high - 0.05, to), 0.3, STEEL, 0.7);
    for (let k = 0; k <= 4; k++) {
      parts.box(0.08, 0.95, 0.08, RAIL, at(x, lerp(low, high, k / 4) + 0.75, lerp(from, to, k / 4)));
    }
    parts.beam(point(x, low + 1.2, from), point(x, high + 1.2, to), 0.1, RAIL);
    const [a, b] = [local(x, from - 0.4), local(x, to)];
    obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 0.25 });
    // The towers of the gantry, standing in the water, and the ropes from it down to the girders
    // at the end of the ramp, which hold it up.
    const tower = side * (width / 2 + 1.2);
    parts.box(0.9, top - bed, 0.9, STEEL, at(tower, (top + bed) / 2, to - 0.4));
    obstacles.push({ ...local(tower, to - 0.4), radius: 0.7 });
    const girder = high + 0.25;
    parts.box(0.06, top - girder + 0.1, 0.06, '#2f3430', at(x, (top + girder) / 2, to - 0.4));
    // Piles along the berth, with a timber along their tops, a little out from the ferry's side.
    const pile = side * (HULL.halfBeam + 0.65);
    for (let lz = to + 1.5; lz <= to + 10; lz += 2.8)
      parts.box(0.42, top - 5 - bed, 0.42, PILE, at(pile, (top - 5 + bed) / 2, lz));
    parts.box(0.3, 0.4, 9.2, PILE, at(pile - side * 0.36, top - 5.6, to + 5.7));
  }
  parts.box(width + 3.3, 0.8, 1.1, STEEL, at(0, top + 0.4, to - 0.4));
  // The end of the ramp rests on a beam between the towers.
  parts.box(width + 2.4, 0.4, 0.8, STEEL, at(0, high - 0.32, to - 0.3));
  parts.box(1.6, 1.2, 1.4, '#e3dfd2', at(width / 2 - 0.4, top + 1.4, to - 0.4)); // the winch house
}

/** A blue sign with a white ferry on it, where the road comes down to the quay. */
function ferrySign(scene, parts) {
  const { path } = TRACKS.find(track => track.id === 'fjord');
  const p = path.offset(path.length - 22, 3.2);
  const y = terrainHeight(p.x, p.z);
  parts.box(0.12, 2.5, 0.12, '#8a8d88', { x: p.x, y: y + 1.25, z: p.z });
  const texture = canvasTexture(256, 256, ctx => {
    ctx.fillStyle = '#f5f1e6';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#2b5fa8';
    ctx.fillRect(10, 10, 236, 236);
    ctx.fillStyle = '#f5f1e6';
    // The hull, the cabin and the funnel, over two waves.
    ctx.beginPath();
    ctx.moveTo(40, 132);
    ctx.lineTo(216, 132);
    ctx.lineTo(194, 168);
    ctx.lineTo(62, 168);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(84, 100, 72, 32);
    ctx.fillRect(166, 92, 16, 40);
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#f5f1e6';
    for (const wy of [192, 216]) {
      ctx.beginPath();
      ctx.moveTo(40, wy);
      for (let k = 0; k < 4; k++) ctx.quadraticCurveTo(62 + k * 44, wy + (k % 2 ? 10 : -10), 84 + k * 44, wy);
      ctx.stroke();
    }
  });
  // Facing the way down, with a board behind it.
  const yaw = Math.atan2(p.dx, p.dz) + Math.PI;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  sign.position.set(p.x + Math.sin(yaw) * 0.13, y + 2.15, p.z + Math.cos(yaw) * 0.13);
  sign.rotation.y = yaw;
  scene.add(sign);
  parts.box(1.14, 1.14, 0.05, '#8a8d88', {
    x: p.x + Math.sin(yaw) * 0.085,
    y: y + 2.15,
    z: p.z + Math.cos(yaw) * 0.085,
    ry: yaw,
  });
}

/** The water: a strip down the fjord, wider than the water itself so the walls hide its edges, and a disc at the head. */
function water(scene) {
  const positions = [];
  let previous = null;
  for (const { x, z, dx, dz, s } of FJORD.path.samples) {
    const half = FJORD.halfWidth(s) + 12;
    const left = [x + dz * half, FJORD.level, z - dx * half];
    const right = [x - dz * half, FJORD.level, z + dx * half];
    if (previous) positions.push(...previous[0], ...previous[1], ...left, ...previous[1], ...right, ...left);
    previous = [left, right];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const material = flatMaterial('#4f8a91', { emissive: '#163f45', emissiveIntensity: 0.3 });
  const strip = new THREE.Mesh(geometry, material);
  const head = FJORD_VILLAGE.head;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(FJORD.halfWidth(0) + 8, 28).rotateX(-Math.PI / 2), material);
  disc.position.set(head.x, FJORD.level, head.z);
  for (const mesh of [strip, disc]) {
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

/**
 * Waterfalls down the walls, each from the lip of the cliff to the water: `side` is which
 * wall, `s` how far along the fjord and `width` how broad the fall is. Flecks of spray slide
 * down them.
 */
const FALLS = [
  { s: 110, side: 1, width: 3.2 },
  // Seven thin falls side by side.
  ...Array.from({ length: 7 }, (_, k) => ({ s: 150 + k * 6, side: -1, width: 0.9 })),
];

function waterfalls(scene) {
  const falls = FALLS.map(({ s, side, width }) => {
    const halfWidth = FJORD.halfWidth(s);
    const base = FJORD.path.offset(s, side * (halfWidth + 0.8));
    // Out from the water until the wall stops climbing: that is the lip.
    let d = halfWidth + 1;
    let top = FJORD.path.offset(s, side * d);
    for (; d < halfWidth + 60; d += 1) {
      const next = FJORD.path.offset(s, side * (d + 1));
      if (terrainHeight(next.x, next.z) - terrainHeight(top.x, top.z) < 0.6) break;
      top = next;
    }
    const from = new THREE.Vector3(top.x, terrainHeight(top.x, top.z) + 0.3, top.z);
    const to = new THREE.Vector3(base.x, FJORD.level, base.z);
    return { from, to, width };
  });
  const sheets = new PartsBuilder();
  const up = new THREE.Vector3(0, 1, 0);
  for (const { from, to, width } of falls) {
    const drop = new THREE.Vector3().subVectors(to, from);
    const across = drop.clone().cross(up).normalize();
    // A little out from the rock, so the sheet isn't lost in it.
    const out = drop.clone().setY(0).normalize().multiplyScalar(-0.35);
    const corner = (end, side) =>
      end
        .clone()
        .addScaledVector(across, (side * width) / 2)
        .add(out);
    const [a, b, c, d] = [corner(from, 1), corner(from, -1), corner(to, 1), corner(to, -1)];
    // Both faces, so it shows from either side.
    sheets.add(prism([a, b, c, b, d, c, a, c, b, b, c, d].map(v => v.toArray())), '#eef6f2');
  }
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: '#9fc4c0',
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.8,
  });
  scene.add(new THREE.Mesh(sheets.geometry(), material));

  // Spray sliding down each fall, and a ring of foam where it meets the water.
  const PER_FALL = 5;
  const spray = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 0.5),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }),
    falls.length * PER_FALL,
  );
  // Everywhere the spray goes, so it isn't drawn while the falls are out of view.
  spray.boundingSphere = new THREE.Sphere().setFromPoints(falls.flatMap(({ from, to }) => [from, to]));
  spray.boundingSphere.radius += 3;
  scene.add(spray);
  const foam = new PartsBuilder();
  for (const { to, width } of falls)
    foam.add(new THREE.RingGeometry(width * 0.4, width * 0.9 + 0.6, 12).rotateX(-Math.PI / 2), '#e8f3ef', {
      x: to.x,
      y: FJORD.level + 0.05,
      z: to.z,
    });
  scene.add(foam.mesh({ castShadow: false }));
  const dummy = new THREE.Object3D();
  const point = new THREE.Vector3();
  return time => {
    falls.forEach(({ from, to, width }, f) => {
      for (let k = 0; k < PER_FALL; k++) {
        const t = (time * 0.45 + k / PER_FALL + f * 0.37) % 1;
        point.lerpVectors(from, to, t * t);
        dummy.position.copy(point);
        dummy.lookAt(point.x + (to.x - from.x), point.y, point.z + (to.z - from.z));
        dummy.scale.set(width * 0.8, 1, 1);
        dummy.updateMatrix();
        spray.setMatrixAt(f * PER_FALL + k, dummy.matrix);
      }
    });
    spray.instanceMatrix.needsUpdate = true;
  };
}

/** A red-bordered warning sign with a troll on it, as at the top of the famous mountain roads. */
function trollSign(scene, parts) {
  const { path } = TRACKS.find(track => track.id === 'fjord');
  const p = path.offset(14, 3.4);
  const y = terrainHeight(p.x, p.z);
  const yaw = Math.atan2(p.dx, p.dz) + Math.PI;
  parts.box(0.12, 2.6, 0.12, '#8a8d88', { x: p.x, y: y + 1.3, z: p.z });
  const texture = canvasTexture(256, 232, ctx => {
    ctx.clearRect(0, 0, 256, 232);
    ctx.beginPath();
    ctx.moveTo(128, 8);
    ctx.lineTo(250, 224);
    ctx.lineTo(6, 224);
    ctx.closePath();
    ctx.fillStyle = '#c8302a';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(128, 46);
    ctx.lineTo(214, 200);
    ctx.lineTo(42, 200);
    ctx.closePath();
    ctx.fillStyle = '#f5f1e6';
    ctx.fill();
    // The troll: a round body, a big head with a long nose, short legs and a tail.
    ctx.fillStyle = '#1f1f1d';
    ctx.beginPath();
    ctx.ellipse(126, 158, 30, 26, 0, 0, Math.PI * 2);
    ctx.ellipse(118, 112, 20, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(140, 118, 16, 7, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(104, 176, 12, 20);
    ctx.fillRect(134, 176, 12, 20);
    ctx.beginPath();
    ctx.moveTo(98, 160);
    ctx.quadraticCurveTo(70, 170, 80, 190);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1f1f1d';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(110, 92);
    ctx.lineTo(104, 80);
    ctx.moveTo(124, 91);
    ctx.lineTo(130, 79);
    ctx.stroke();
  });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.36),
    new THREE.MeshLambertMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
  );
  sign.position.set(p.x, y + 2.3, p.z);
  sign.rotation.y = yaw;
  scene.add(sign);
}

export function buildFjord(scene, obstacles) {
  water(scene);
  const parts = new PartsBuilder();
  const chimneys = FJORD_VILLAGE.houses.map(spot => house(parts, obstacles, spot));
  for (const spot of FJORD_VILLAGE.boathouses) boathouse(parts, obstacles, spot);
  staveChurch(parts, obstacles, FJORD_VILLAGE.church);
  quay(parts, obstacles);
  trollSign(scene, parts);
  ferrySign(scene, parts);
  scene.add(parts.mesh());
  const smoke = createSmoke(scene, chimneys[1], { rise: 7, size: 0.45 });
  const spray = waterfalls(scene);
  let time = 0;
  return {
    update(dt) {
      time += dt;
      smoke.update(time);
      spray(time);
    },
  };
}
