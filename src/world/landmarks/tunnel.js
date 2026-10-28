// Echo Mountain: a rocky ridge the trail passes through. The mountain is swept
// along the trail's own curve, and its outer skirt is buried below the ground
// everywhere, so it always sits flush with the meadow.
import * as THREE from 'three';
import { createRandom, smoothstep } from '../../core/math.js';
import { ROAD, TUNNEL } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, flatMaterial, triangleGeometry } from '../build.js';
import { rockMaterial, softenRock } from '../rocks.js';

const RINGS = 20;
const ARCH_STEPS = 12;
const WALL_BOTTOM = -1.5;
const SPRING = 0.9; // height where the vertical walls turn into the arch

/** Half-width of the mountain's base, widest in the middle of the tunnel. */
const halfWidthAt = t => 21 + 16 * Math.sin(t * Math.PI);

function ringFrame(i) {
  const s = TUNNEL.s - TUNNEL.length / 2 + (i / RINGS) * TUNNEL.length;
  const p = ROAD.at(s);
  return { s, x: p.x, z: p.z, dx: p.dx, dz: p.dz, y: terrainHeight(p.x, p.z) };
}

/** Bore cross-section: up the right wall, over the arch, down the left wall. */
function boreProfile() {
  const r = TUNNEL.radius;
  const points = [
    [r, WALL_BOTTOM],
    [r, SPRING],
  ];
  for (let k = 1; k < ARCH_STEPS; k++) {
    const angle = (k / ARCH_STEPS) * Math.PI;
    points.push([Math.cos(angle) * r, SPRING + Math.sin(angle) * r]);
  }
  points.push([-r, SPRING], [-r, WALL_BOTTOM]);
  return points;
}

export function buildTunnel(scene, obstacles) {
  const random = createRandom(31);
  const bore = boreProfile();
  const frames = Array.from({ length: RINGS + 1 }, (_, i) => ringFrame(i));
  const toWorld = (frame, lateral, height) => [
    frame.x - frame.dz * lateral,
    frame.y + height,
    frame.z + frame.dx * lateral,
  ];

  // The outer surface shares the bore's point count so the portal faces are simple quads.
  const jitter = Array.from({ length: (RINGS + 1) * bore.length }, () => random() - 0.5);
  const outer = frames.map((frame, i) => {
    const t = i / RINGS;
    const halfWidth = halfWidthAt(t);
    const height = 14 + 16 * Math.sin(t * Math.PI) ** 0.7;
    return bore.map((_, k) => {
      const angle = (k / (bore.length - 1)) * Math.PI;
      const lateral = Math.cos(angle) * halfWidth;
      const n = jitter[i * bore.length + k];
      if (k === 0 || k === bore.length - 1) {
        // Bury the foot of the mountain below the ground at that exact spot.
        const [x, , z] = toWorld(frame, lateral, 0);
        return [x, terrainHeight(x, z) - 2.5, z];
      }
      // A dome: gentle slopes at the foot, steepening towards the summit.
      const rise = Math.sin(angle) ** 1.5 * height + n * 3 * Math.sin(angle);
      // Above the portal, the rock leans back like a hillside rather than a wall.
      const lean = Math.max(0, rise - 10.5) * 0.6 * Math.max(0, 1 - Math.min(i, RINGS - i) / 6);
      const along = i < RINGS / 2 ? lean : -lean;
      const [x, y, z] = toWorld(frame, lateral + n * 2.5, rise);
      return [x + frame.dx * along, y, z + frame.dz * along];
    });
  });
  const inner = frames.map(frame => bore.map(([lateral, height]) => toWorld(frame, lateral, height)));

  const positions = [];
  const colors = [];
  const rock = new THREE.Color('#8b8f9d');
  const moss = new THREE.Color('#988a52');
  const snow = new THREE.Color('#e7e9de');
  const color = new THREE.Color();
  const shade = (triangle, base) => {
    const top = Math.max(triangle[0][1], triangle[1][1], triangle[2][1]) - base;
    if (top > 22) color.copy(snow);
    else color.copy(rock).lerp(moss, 1 - smoothstep(top, 2, 9));
    color.multiplyScalar(0.9 + random() * 0.16);
    for (const vertex of triangle) {
      positions.push(...vertex);
      colors.push(color.r, color.g, color.b);
    }
  };
  const quad = (a, b, c, d, base) => {
    shade([a, b, c], base);
    shade([c, b, d], base);
  };
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < bore.length - 1; k++) {
      quad(outer[i][k], outer[i + 1][k], outer[i][k + 1], outer[i + 1][k + 1], frames[i].y);
    }
  }
  // Portal faces: rock between the bore and the outside, at both ends.
  for (const [i, flip] of [
    [0, true],
    [RINGS, false],
  ]) {
    for (let k = 0; k < bore.length - 1; k++) {
      const [a, b, c, d] = [outer[i][k], outer[i][k + 1], inner[i][k], inner[i][k + 1]];
      if (flip) quad(a, b, c, d, frames[i].y);
      else quad(b, a, d, c, frames[i].y);
    }
  }
  const mountain = new THREE.Mesh(softenRock(triangleGeometry(positions, colors), 28), rockMaterial);
  mountain.castShadow = true;
  mountain.receiveShadow = true;
  scene.add(mountain);

  // The bore lining, darker and facing inwards.
  const lining = [];
  for (let i = 0; i < RINGS; i++) {
    for (let k = 0; k < bore.length - 1; k++) {
      const [a, b, c, d] = [inner[i][k], inner[i + 1][k], inner[i][k + 1], inner[i + 1][k + 1]];
      lining.push(...a, ...c, ...b, ...c, ...d, ...b);
    }
  }
  const liningGeometry = new THREE.BufferGeometry();
  liningGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lining, 3));
  liningGeometry.computeVertexNormals();
  const liningMesh = new THREE.Mesh(liningGeometry, flatMaterial('#5d665f'));
  liningMesh.receiveShadow = true;
  scene.add(liningMesh);

  // Stone voussoirs framing each portal.
  const stones = new PartsBuilder();
  for (const [i, outward] of [
    [0, -1],
    [RINGS, 1],
  ]) {
    const frame = frames[i];
    const yaw = Math.atan2(frame.dx, frame.dz);
    const push = outward * 0.35;
    for (let k = 0; k <= ARCH_STEPS; k++) {
      const angle = (k / ARCH_STEPS) * Math.PI;
      const lateral = Math.cos(angle) * (TUNNEL.radius + 0.45);
      const height = SPRING + Math.sin(angle) * (TUNNEL.radius + 0.45);
      const [x, y, z] = toWorld(frame, lateral, height);
      stones.box(1.15, 0.95, 0.9, k % 2 ? '#b3ae9c' : '#a7a290', {
        x: x + frame.dx * push,
        y,
        z: z + frame.dz * push,
        ry: yaw,
        rz: Math.PI / 2 - angle,
      });
    }
    for (const side of [-1, 1]) {
      const [x, y, z] = toWorld(frame, side * (TUNNEL.radius + 0.45), SPRING / 2 - 0.4);
      stones.box(1.2, SPRING + 1.4, 1, '#a39e8c', { x: x + frame.dx * push, y, z: z + frame.dz * push, ry: yaw });
    }
  }
  // Small warm lamps along the walls.
  const lamps = new PartsBuilder();
  for (let i = 2; i < RINGS; i += 3) {
    for (const side of [-1, 1]) {
      const [x, y, z] = toWorld(frames[i], side * (TUNNEL.radius - 0.15), SPRING + 1.6);
      lamps.box(0.3, 0.45, 0.3, '#ffd99a', { x, y, z });
    }
  }
  scene.add(stones.mesh());
  const lampMesh = lamps.mesh({ castShadow: false });
  lampMesh.material = new THREE.MeshBasicMaterial({ color: '#ffd99a' });
  scene.add(lampMesh);

  // Walls inside the bore, the mountain's foot, and the faces beside each portal.
  const wall = TUNNEL.radius + 0.25;
  const footprint = i => 0.96 * halfWidthAt(i / RINGS);
  for (let i = 0; i < RINGS; i++) {
    for (const side of [-1, 1]) {
      const a = toWorld(frames[i], side * wall, 0);
      const b = toWorld(frames[i + 1], side * wall, 0);
      obstacles.push({ ax: a[0], az: a[2], bx: b[0], bz: b[2], radius: 0.25 });
      const oa = toWorld(frames[i], side * footprint(i), 0);
      const ob = toWorld(frames[i + 1], side * footprint(i + 1), 0);
      obstacles.push({ ax: oa[0], az: oa[2], bx: ob[0], bz: ob[2], radius: 1 });
    }
  }
  for (const i of [0, RINGS]) {
    for (const side of [-1, 1]) {
      const a = toWorld(frames[i], side * wall, 0);
      const b = toWorld(frames[i], side * footprint(i), 0);
      obstacles.push({ ax: a[0], az: a[2], bx: b[0], bz: b[2], radius: 0.6 });
    }
  }

  const entrance = frames[0];
  return {
    occluders: [mountain, liningMesh],
    portal: { ...toWorld(entrance, 0, SPRING + TUNNEL.radius + 2.2), yaw: Math.atan2(entrance.dx, entrance.dz) },
  };
}

/** True when a point is inside the bore (used by the camera and the horn echo). */
export function insideTunnel(x, z) {
  const near = ROAD.nearest(x, z);
  return ROAD.apart(near.s, TUNNEL.s) < TUNNEL.length / 2 && near.distance < TUNNEL.radius;
}
