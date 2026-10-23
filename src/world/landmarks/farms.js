// The farms out in the outlands, all built from one kit: a house and a barn behind the yard,
// hay bales, a fenced paddock for the animals and, at some, a pigsty.
import * as THREE from 'three';
import { FARMS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, gableRoof, gableEnds, createSmoke } from '../build.js';
import { framer } from './frame.js';

const WHITE = '#eee7d3';
const GLASS = '#4f6466';
const STONE = '#9a978a';
const WOOD = '#8d7a5c';

/**
 * A village house: whitewashed or painted walls, a steep tiled roof with its ridge along the
 * front, a door and windows facing +Z and a chimney. `(lx, lz)` is where it stands in the frame.
 * Returns the top of its chimney.
 */
export function cottage(parts, obstacles, { at, local, rotation }, lx, lz, { walls, roof }) {
  const [width, depth, eave, ridge] = [9, 6.5, 3, 6.6];
  // The roof is built with its ridge front to back, so it is turned to run along the front.
  const turned = () => at(lx, 0, lz, { ry: rotation + Math.PI / 2 });
  parts.box(width + 0.4, 0.5, depth + 0.4, STONE, at(lx, 0.05, lz));
  parts.box(width, eave, depth, walls, at(lx, eave / 2 + 0.1, lz));
  parts.add(gableEnds(depth, width, eave + 0.1, ridge), walls, turned());
  parts.add(gableRoof(depth, width, eave + 0.05, ridge + 0.05, 0.5), roof, turned());
  parts.box(1.1, 2.1, 0.12, '#5b4636', at(lx - 2.2, 1.15, lz + depth / 2 + 0.02)); // door
  for (const wx of [-0.2, 1.7, 3.4]) {
    parts.box(1, 1.1, 0.12, GLASS, at(lx + wx, 1.75, lz + depth / 2 + 0.02));
    parts.box(1.2, 0.12, 0.18, WHITE, at(lx + wx, 1.15, lz + depth / 2 + 0.06));
  }
  for (const end of [-1, 1]) parts.box(0.12, 0.8, 0.7, GLASS, at(lx + end * (width / 2 + 0.02), 4.2, lz));
  parts.box(0.7, 1.8, 0.7, '#8e8b7f', at(lx + 2.4, ridge, lz - 0.8)); // chimney
  const a = local(lx - width / 2 + depth / 2, lz);
  const b = local(lx + width / 2 - depth / 2, lz);
  obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: depth / 2 + 0.3 });
  return at(lx + 2.4, ridge + 1, lz - 0.8);
}

/** A ring of fence posts with two rails round a paddock, following the ground. */
export function ringFence(
  parts,
  obstacles,
  { x, z, radius },
  { posts = Math.round((radius * 2 * Math.PI) / 2.6) } = {},
) {
  const point = k => {
    const a = (k / posts) * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const pz = z + Math.sin(a) * radius;
    return { x: px, z: pz, y: terrainHeight(px, pz) };
  };
  for (let k = 0; k < posts; k++) {
    const p = point(k);
    const q = point(k + 1);
    parts.box(0.16, 1.4, 0.16, WOOD, { x: p.x, y: p.y + 0.55, z: p.z });
    for (const h of [0.55, 1.05]) parts.beam({ ...p, y: p.y + h }, { ...q, y: q.y + h }, 0.09, '#9c8a6a', 0.12);
    obstacles.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, radius: 0.25 });
  }
}

function buildOne(scene, obstacles, farm) {
  const parts = new PartsBuilder();
  const frame = framer(farm);
  const { at, local, ground } = frame;
  const chimney = cottage(parts, obstacles, frame, -8, -10, farm);

  // A wooden barn with big doors onto the yard.
  const barn = { x: 9, z: -9 };
  parts.box(8, 4.4, 9, '#8a6a4a', at(barn.x, 2.2, barn.z));
  parts.add(gableEnds(8, 9, 4.4, 7.6), '#8a6a4a', at(barn.x, 0, barn.z));
  parts.add(gableRoof(8, 9, 4.35, 7.7, 0.4), '#5f5b54', at(barn.x, 0, barn.z));
  parts.box(3.6, 3.4, 0.12, '#6e533a', at(barn.x, 1.7, barn.z + 4.53));
  parts.box(1.2, 1, 0.12, '#d9c071', at(barn.x, 5.4, barn.z + 4.53)); // hay in the loft
  obstacles.push({ ...local(barn.x, barn.z), radius: 5.2 });

  // Round bales by the barn.
  for (const [lx, lz, turn] of [
    [15, -5, 0.2],
    [15.6, -2.4, 1.3],
    [14, -0.6, 0.5],
  ]) {
    parts.add(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 10), '#d9c071', {
      ...local(lx, lz),
      y: ground(lx, lz) + 0.72,
      rz: Math.PI / 2,
      ry: farm.rotation + turn,
    });
    obstacles.push({ ...local(lx, lz), radius: 0.9 });
  }

  ringFence(parts, obstacles, farm.paddock);
  // A trough inside the paddock fence on the yard side, along the fence.
  const towardYard = Math.atan2(farm.z - farm.paddock.z, farm.x - farm.paddock.x);
  const trough = {
    x: farm.paddock.x + Math.cos(towardYard) * (farm.paddock.radius - 2.5),
    z: farm.paddock.z + Math.sin(towardYard) * (farm.paddock.radius - 2.5),
    ry: Math.PI / 2 - towardYard,
  };
  const troughY = terrainHeight(trough.x, trough.z);
  parts.box(2.2, 0.7, 0.8, '#7d8a86', { ...trough, y: troughY + 0.2 });
  parts.box(2, 0.1, 0.6, '#8fbcbf', { ...trough, y: troughY + 0.52 });

  if (farm.sty) {
    // A low fence round a muddy pen, with a little shelter at the back.
    ringFence(parts, obstacles, farm.sty, { posts: 14 });
    parts.add(new THREE.CircleGeometry(farm.sty.radius - 0.4, 16), '#6f5a41', {
      x: farm.sty.x,
      y: terrainHeight(farm.sty.x, farm.sty.z) + 0.05,
      z: farm.sty.z,
      rx: -Math.PI / 2,
    });
    const shelter = framer({ x: farm.sty.x, z: farm.sty.z, rotation: farm.rotation });
    parts.box(3.2, 1.4, 2, '#8a6a4a', shelter.at(0, 0.7, -3.2));
    parts.box(3.6, 0.12, 2.6, '#5f5b54', shelter.at(0, 1.5, -3.1, { rx: 0.18 }));
  }

  scene.add(parts.mesh());
  return createSmoke(scene, chimney, { rise: 8, size: 0.5 });
}

export function buildFarms(scene, obstacles) {
  const chimneys = FARMS.map(farm => buildOne(scene, obstacles, farm));
  return {
    update(time) {
      for (const smoke of chimneys) smoke.update(time);
    },
  };
}
