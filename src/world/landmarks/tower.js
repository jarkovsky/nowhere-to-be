// A timber fire lookout tower on top of the southern knoll, with a flag on the roof.
import * as THREE from 'three';
import { TOWER } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, flatMaterial } from '../build.js';

const TIMBER = '#8d6a48';
const HEIGHT = 12;

export function buildTower(scene, obstacles) {
  const parts = new PartsBuilder();
  const { x, z } = TOWER;
  const y = terrainHeight(x, z);
  const leg = (sx, sz, h) => {
    const spread = 2.6 - (h / HEIGHT) * 1.1;
    return { x: x + sx * spread, y: y + h, z: z + sz * spread };
  };

  // Four splayed legs with cross braces between them at each level.
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [sx, sz] of corners) {
    parts.beam(leg(sx, sz, -0.6), leg(sx, sz, HEIGHT), 0.32, TIMBER);
    parts.box(0.9, 0.5, 0.9, '#9a978a', { ...leg(sx, sz, 0), y: y + 0.1 }); // footings
  }
  for (const [h0, h1] of [
    [0.4, 4],
    [4, 8],
    [8, HEIGHT],
  ]) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      parts.beam(leg(ax, az, h0), leg(bx, bz, h1), 0.14, '#7a5b3d');
      parts.beam(leg(bx, bz, h0), leg(ax, az, h1), 0.14, '#7a5b3d');
      parts.beam(leg(ax, az, h1), leg(bx, bz, h1), 0.2, TIMBER);
    }
  }
  // A zig-zag stair up the middle.
  for (let flight = 0; flight < 4; flight++) {
    const h0 = flight * 3;
    const side = flight % 2 ? 1 : -1;
    parts.beam(
      { x: x - 0.9 * side, y: y + h0 + 0.2, z: z - 0.6 },
      { x: x + 0.9 * side, y: y + h0 + 3, z: z - 0.6 },
      0.7,
      '#a7835c',
      0.12,
    );
    parts.box(1.2, 0.12, 1, '#a7835c', { x: x + 0.9 * side, y: y + h0 + 3, z: z - 0.6 });
  }

  // The cab: a platform, low walls, windows all round and a hipped roof.
  const cab = y + HEIGHT;
  parts.box(4.6, 0.3, 4.6, '#a7835c', { x, y: cab + 0.1, z });
  parts.box(3.6, 1.1, 3.6, '#b9874f', { x, y: cab + 0.8, z });
  parts.box(3.5, 1.1, 3.5, '#596f6c', { x, y: cab + 1.9, z });
  for (const [sx, sz] of corners)
    parts.box(0.18, 1.2, 0.18, '#e6dcc2', { x: x + sx * 1.75, y: cab + 1.9, z: z + sz * 1.75 });
  parts.box(3.9, 0.16, 3.9, '#e6dcc2', { x, y: cab + 2.5, z });
  parts.add(new THREE.ConeGeometry(3.3, 1.7, 4), '#5d6b62', { x, y: cab + 3.4, z, ry: Math.PI / 4 });
  // Railing around the platform.
  for (const [sx, sz] of corners) parts.box(0.12, 1, 0.12, TIMBER, { x: x + sx * 2.2, y: cab + 0.7, z: z + sz * 2.2 });
  for (const [dx, dz, w, d] of [
    [0, -2.2, 4.5, 0.1],
    [0, 2.2, 4.5, 0.1],
    [-2.2, 0, 0.1, 4.5],
    [2.2, 0, 0.1, 4.5],
  ]) {
    parts.box(w, 0.1, d, TIMBER, { x: x + dx, y: cab + 1.15, z: z + dz });
  }
  parts.box(0.08, 2, 0.08, '#737e73', { x, y: cab + 5, z });
  scene.add(parts.mesh());

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.7).translate(0.6, 0, 0),
    flatMaterial('#c8432f', { side: THREE.DoubleSide }),
  );
  flag.position.set(x, cab + 5.6, z);
  scene.add(flag);

  for (const [sx, sz] of corners) obstacles.push({ x: x + sx * 2.6, z: z + sz * 2.6, radius: 0.6 });
  obstacles.push({ x, z, radius: 1.4 });

  return {
    update(time) {
      flag.rotation.y = 0.6 + Math.sin(time * 1.3) * 0.25;
      flag.scale.x = 1 + Math.sin(time * 6) * 0.06;
    },
  };
}
