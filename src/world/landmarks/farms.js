// The farms out in the outlands, all built from one kit: a house and a barn behind the yard,
// hay bales, a fenced paddock for the animals and, at some, a pigsty.
import * as THREE from 'three';
import { FARMS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, createSmoke } from '../build.js';
import { gabledHouse } from './house.js';
import { framer } from './frame.js';
import { mudGeometry, wet } from '../mudhole.js';

const WHITE = '#eee7d3';
const GLASS = '#4f6466';
const STONE = '#9a978a';
const WOOD = '#8d7a5c';

/**
 * A village house: whitewashed or painted walls, a steep tiled roof with its ridge along the
 * front, a door and windows facing +Z and a chimney. `(lx, lz)` is where it stands in the frame.
 * Returns the top of its chimney.
 */
export function cottage(parts, obstacles, frame, lx, lz, { walls, roof }) {
  const { at } = frame;
  const [width, depth, eave, ridge] = [9, 6.5, 3, 6.6];
  parts.box(width + 0.4, 0.5, depth + 0.4, STONE, at(lx, 0.05, lz));
  obstacles.push(
    gabledHouse(parts, frame, {
      x: lx,
      z: lz,
      width,
      depth,
      base: 0.1,
      eave: eave + 0.1,
      ridge: ridge + 0.05,
      overhang: 0.5,
      ridgeAlong: 'x',
      walls,
      roof,
    }),
  );
  parts.box(1.1, 2.1, 0.12, '#5b4636', at(lx - 2.2, 1.15, lz + depth / 2 + 0.02)); // door
  for (const wx of [-0.2, 1.7, 3.4]) {
    parts.box(1, 1.1, 0.12, GLASS, at(lx + wx, 1.75, lz + depth / 2 + 0.02));
    parts.box(1.2, 0.12, 0.18, WHITE, at(lx + wx, 1.15, lz + depth / 2 + 0.06));
  }
  for (const end of [-1, 1]) parts.box(0.12, 0.8, 0.7, GLASS, at(lx + end * (width / 2 + 0.02), 4.2, lz));
  parts.box(0.7, 1.8, 0.7, '#8e8b7f', at(lx + 2.4, ridge, lz - 0.8)); // chimney
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
  obstacles.push(
    gabledHouse(parts, frame, {
      ...barn,
      width: 8,
      depth: 9,
      eave: 4.4,
      ridge: 7.7,
      walls: '#8a6a4a',
      roof: '#5f5b54',
    }),
  );
  parts.box(3.6, 3.4, 0.12, '#6e533a', at(barn.x, 1.7, barn.z + 4.53));
  parts.box(1.2, 1, 0.12, '#d9c071', at(barn.x, 5.4, barn.z + 4.53)); // hay in the loft

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
  obstacles.push({ x: trough.x, z: trough.z, halfX: 1.2, halfZ: 0.5, rotation: trough.ry, radius: 0 });

  if (farm.sty) {
    // A low fence round a muddy pen, with a little shelter at the back.
    ringFence(parts, obstacles, farm.sty, { posts: 14 });
    const mud = new THREE.Mesh(
      mudGeometry({
        ...farm.sty,
        radius: farm.sty.radius - 0.7,
        seed: 61,
        lift: 0.05,
        // Trodden earth, wet in the middle where the pigs lie.
        colors: { mud: '#7a6044', dark: '#4f3b29', churned: '#8c7550' },
      }),
      wet,
    );
    mud.receiveShadow = true;
    scene.add(mud);
    // The shelter stands on the slope with its back wall down to the lowest corner.
    const shelter = framer({ x: farm.sty.x, z: farm.sty.z, rotation: farm.rotation });
    const corners = [-1.6, 1.6].flatMap(lx => [-4.2, -2.2].map(lz => shelter.ground(lx, lz)));
    const [low, high] = [Math.min(...corners), Math.max(...corners)];
    const floor = shelter.ground(0, 0);
    parts.box(3.2, 1.4 + high - low, 2, '#8a6a4a', shelter.at(0, (high + low) / 2 + 0.7 - floor, -3.2));
    parts.box(3.6, 0.12, 2.6, '#5f5b54', shelter.at(0, high + 1.5 - floor, -3.1, { rx: 0.18 }));
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
