// The fjord in the north-west: still, deep water between walls of rock with waterfalls
// down them, and at its head a small village of wooden houses with grass growing on their
// roofs, red boathouses at the water's edge, a stave church up the slope, and a pier where
// a little ferry ties up between its trips out along the fjord. At the top of the road
// down, a sign warns of trolls.
import * as THREE from 'three';
import { smoothstep } from '../../core/math.js';
import { FJORD, FJORD_VILLAGE, TRACKS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, gableRoof, gableEnds, hipRoof, createSmoke, flatMaterial, prism } from '../build.js';
import { canvasTexture } from './signs.js';
import { framer } from './frame.js';

const WHITE = '#f1ede2';
const TURF = '#6f8a46';
const TAR = '#4a3526';
const SHINGLE = '#3b2b21';
const GLASS = '#3f5559';
const STONE = '#8e8f86';

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

/** A wooden house with its long side to the water, white trim and a grass roof. */
function house(parts, obstacles, spot) {
  const { at, local, ground } = framer(spot);
  const turned = { ry: spot.rotation + Math.PI / 2 };
  const [width, depth, eave, ridge] = [7.5, 5.6, 3.3, 5.6];
  // The stone footing goes down to the ground at the lowest corner, where the slope falls away.
  const corners = [-1, 1].flatMap(sx => [-1, 1].map(sz => ground((sx * (width + 0.4)) / 2, (sz * (depth + 0.4)) / 2)));
  const drop = ground(0, 0) - Math.min(...corners);
  parts.box(width + 0.4, 0.6 + drop, depth + 0.4, STONE, at(0, -drop / 2, 0));
  parts.box(width, eave, depth, spot.paint, at(0, eave / 2 + 0.2, 0));
  parts.add(gableEnds(depth, width, eave + 0.2, ridge), spot.paint, at(0, 0, 0, turned));
  parts.add(gableRoof(depth, width, eave + 0.15, ridge + 0.05, 0.45), TURF, at(0, 0, 0, turned));
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
  obstacles.push({ ...local(0, 0), radius: width / 2 });
  return at(2, ridge + 1.2, -0.8);
}

/** A boathouse at the water's edge: red boards, a dark roof and big doors facing the water. */
function boathouse(parts, obstacles, spot) {
  const { at, local } = framer(spot);
  const [width, depth, eave, ridge] = [4.6, 7, 2.6, 4.6];
  parts.box(width, eave, depth, spot.paint, at(0, eave / 2, 0));
  parts.add(gableEnds(width, depth, eave, ridge), spot.paint, at(0, 0, 0));
  parts.add(gableRoof(width, depth, eave - 0.05, ridge + 0.05, 0.35), '#4d4f4c', at(0, 0, 0));
  parts.box(2.8, 2.2, 0.1, '#7d2a20', at(0, 1.1, depth / 2 + 0.02)); // doors
  parts.box(0.12, 2.3, 0.14, WHITE, at(0, 1.15, depth / 2 + 0.06));
  parts.box(3.1, 0.14, 0.14, WHITE, at(0, 2.3, depth / 2 + 0.06));
  for (const side of [-1, 1]) parts.box(0.18, eave, 0.18, WHITE, at(side * (width / 2), eave / 2, depth / 2));
  obstacles.push({ ...local(0, 0), radius: width / 2 + 0.6 });
}

/** A stave church: tarred timber, roofs stacked one above another, a spire and dragons on the gables. */
function staveChurch(parts, obstacles, spot) {
  const { at, local } = framer(spot);
  // A low covered gallery all round, then the tall nave above it.
  parts.box(7.4, 2.2, 9.4, TAR, at(0, 1.1, 0));
  parts.add(hipRoof(8.8, 10.8, 2.2, 6.4, 8.4, 3.4), SHINGLE, at(0, 0, 0));
  parts.box(5.6, 4.8, 7.6, TAR, at(0, 3.4, 0));
  parts.add(gableEnds(5.6, 7.6, 5.8, 9.2), TAR, at(0, 0, 0));
  parts.add(gableRoof(5.6, 7.6, 5.75, 9.25, 0.4), SHINGLE, at(0, 0, 0));
  // A second, smaller roof stacked on the first, and a tower with a spire on top.
  parts.box(2.6, 2, 2.6, TAR, at(0, 9.6, 0));
  parts.add(hipRoof(3.6, 3.6, 10.6, 2.4, 2.4, 11.6), SHINGLE, at(0, 0, 0));
  parts.box(1.6, 1.6, 1.6, TAR, at(0, 12.3, 0));
  parts.add(new THREE.ConeGeometry(1.25, 4.2, 4), SHINGLE, at(0, 15.2, 0, { ry: spot.rotation + Math.PI / 4 }));
  // Dragon heads curling up from the ends of the ridge.
  for (const end of [-1, 1]) {
    parts.box(0.22, 0.22, 1.5, TAR, at(0, 9.6, end * 4.4, { rx: end * -0.6 }));
    parts.box(0.26, 0.4, 0.4, TAR, at(0, 10.3, end * 5, { rx: end * -0.2 }));
  }
  parts.box(1.4, 2.2, 0.12, '#6b3a24', at(0, 1.1, 4.72)); // door, under the gallery roof
  obstacles.push({ ...local(0, 0), radius: 5 });
}

/** A plank pier on posts from the shore out over the water. */
function pier(parts, spot, length) {
  const { at } = framer(spot, FJORD.level + 1);
  parts.box(3, 0.2, length, '#8b7357', at(0, 0, length / 2 - 2));
  for (let lz = 0; lz <= length - 2; lz += 3) {
    for (const lx of [-1.3, 1.3]) parts.box(0.24, 4, 0.24, '#5d4a39', at(lx, -1.9, lz));
  }
  for (const lx of [-1.45, 1.45]) parts.box(0.1, 0.6, length - 2, '#8b7357', at(lx, 0.4, length / 2 - 1));
  // Where the ferry ties up: alongside the end of the pier.
  return at(4.2, 0, length - 7);
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

/** A little car ferry: a white hull, a wheelhouse to one side and two cars on deck. */
function ferryModel() {
  const parts = new PartsBuilder();
  parts.box(5, 1.2, 15, '#2f3a40', { y: 0.2 });
  parts.box(5.1, 0.9, 15.1, '#f2efe6', { y: 1.15 });
  parts.box(5.12, 0.25, 15.12, '#b8352a', { y: 1.5 });
  parts.box(4.6, 0.12, 14, '#7c7d77', { y: 1.66 }); // car deck
  parts.box(1.3, 2.4, 4, '#f2efe6', { x: 1.75, y: 2.9, z: 1 }); // wheelhouse
  parts.box(1.34, 0.6, 3.6, GLASS, { x: 1.75, y: 3.6, z: 1 });
  parts.box(1.5, 0.2, 4.3, '#b8352a', { x: 1.75, y: 4.2, z: 1 });
  for (const end of [-1, 1]) parts.box(4.4, 0.3, 1.6, '#5e605a', { y: 1.9, z: end * 7.6, rx: end * 0.35 }); // ramps
  for (const [lz, paint] of [
    [-3.5, '#3f6e9c'],
    [2.8, '#c9a13e'],
  ]) {
    parts.box(1.7, 0.75, 3.8, paint, { x: -0.9, y: 2.15, z: lz });
    parts.box(1.5, 0.6, 2, GLASS, { x: -0.9, y: 2.75, z: lz + 0.2 });
  }
  return parts.mesh();
}

/**
 * The ferry ties up at the pier, then sails out along the fjord and back again. `dock` is
 * where it ties up. Its trips out run along the middle of the fjord.
 */
function ferry(scene, dock) {
  const boat = ferryModel();
  scene.add(boat);
  const route = [new THREE.Vector3(dock.x, 0, dock.z)];
  for (let s = 24; s <= 440; s += 8) {
    const p = FJORD.path.at(s);
    route.push(new THREE.Vector3(p.x, 0, p.z));
  }
  const course = new THREE.CatmullRomCurve3(route, false, 'centripetal');
  const length = course.getLength();
  const SPEED = 5;
  const WAIT = 40;
  const trip = length / SPEED;
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  return time => {
    // Tied up, out, waiting far off, and back again.
    const cycle = (time + WAIT * 0.5) % (2 * (WAIT + trip));
    const out = cycle < WAIT + trip;
    const t = out ? cycle - WAIT : cycle - 2 * WAIT - trip;
    const u = smoothstep(Math.max(0, t), 0, trip);
    const along = out ? u : 1 - u;
    course.getPointAt(along, point);
    course.getTangentAt(along, tangent);
    boat.position.set(point.x, FJORD.level - 0.3 + Math.sin(time * 0.8) * 0.05, point.z);
    boat.rotation.set(0, Math.atan2(tangent.x, tangent.z), Math.sin(time * 0.6) * 0.015);
    boat.visible = along < 0.97;
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
  const dock = pier(parts, FJORD_VILLAGE.pier, 20);
  trollSign(scene, parts);
  scene.add(parts.mesh());
  const smoke = createSmoke(scene, chimneys[1], { rise: 7, size: 0.45 });
  const spray = waterfalls(scene);
  const sail = ferry(scene, dock);
  let time = 0;
  return {
    update(dt) {
      time += dt;
      smoke.update(time);
      spray(time);
      sail(time);
    },
  };
}
