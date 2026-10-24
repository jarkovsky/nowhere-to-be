// A small farm inside the trail loop: a farmhouse, a red barn, a silo, hay
// bales, a paddock for the cows and a field of wheat.
import * as THREE from 'three';
import { FARM } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, createSmoke } from '../build.js';
import { gabledHouse } from './house.js';
import { wheatField } from './fields.js';
import { framer } from './frame.js';

const WHITE = '#eee7d3';

export function buildFarm(scene, obstacles) {
  const parts = new PartsBuilder();
  const y = terrainHeight(FARM.x, FARM.z);
  const { at, local, ground, rotation } = framer(FARM, y);

  // Farmhouse.
  const house = { x: -8, z: -6 };
  const frame = { at, local, rotation };
  const walls = [];
  walls.push(
    gabledHouse(parts, frame, {
      ...house,
      width: 7,
      depth: 6,
      base: -0.1,
      eave: 3.3,
      ridge: 5.7,
      overhang: 0.45,
      ridgeAlong: 'x',
      walls: '#e8dcbc',
      roof: '#a5503c',
    }),
  );
  parts.box(7.4, 0.5, 6.4, '#9a978a', at(house.x, 0.05, house.z));
  parts.box(1.1, 2, 0.12, '#5b6f62', at(house.x - 1.6, 1.15, house.z + 3.03)); // door
  for (const lx of [0.4, 2.3]) {
    parts.box(1, 1, 0.12, '#e8cf8a', at(house.x + lx, 1.9, house.z + 3.03)); // windows
    parts.box(1.25, 0.14, 0.16, WHITE, at(house.x + lx, 1.36, house.z + 3.06));
  }
  parts.box(2.6, 0.18, 1.6, '#bca57d', at(house.x - 1.6, 0.25, house.z + 3.9)); // porch
  parts.box(0.8, 2.2, 0.8, '#8e8b7f', at(house.x + 2, 5.4, house.z - 1.2)); // chimney

  // Barn: red boards, white trim and a steep roof.
  const barn = { x: 8, z: -3 };
  walls.push(
    gabledHouse(parts, frame, {
      ...barn,
      width: 9,
      depth: 12,
      eave: 4.6,
      ridge: 8.3,
      walls: '#b0503a',
      roof: '#6f6b63',
    }),
  );
  for (const end of [-1, 1]) {
    const lz = barn.z + end * 6.03;
    parts.box(4, 3.6, 0.12, '#9b4533', at(barn.x, 1.8, lz)); // doors
    parts.beam({ ...local(barn.x - 2, lz), y: y + 0.1 }, { ...local(barn.x + 2, lz), y: y + 3.5 }, 0.2, WHITE, 0.2);
    parts.beam({ ...local(barn.x + 2, lz), y: y + 0.1 }, { ...local(barn.x - 2, lz), y: y + 3.5 }, 0.2, WHITE, 0.2);
    parts.box(4.3, 0.22, 0.2, WHITE, at(barn.x, 3.65, lz + end * 0.02));
    parts.box(1.3, 1.1, 0.12, '#e8cf8a', at(barn.x, 6, lz)); // hayloft
  }

  // Silo.
  const silo = { x: 15.5, z: -10 };
  parts.add(new THREE.CylinderGeometry(2, 2, 9, 12), '#cfc8b6', at(silo.x, 4.5, silo.z));
  parts.add(new THREE.SphereGeometry(2.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#86938d', at(silo.x, 9, silo.z));
  for (const ly of [2.5, 5, 7.5]) {
    parts.add(new THREE.CylinderGeometry(2.04, 2.04, 0.14, 12), '#a9a291', at(silo.x, ly, silo.z));
  }

  // Round hay bales.
  const bales = [
    [16, 3, 0.2],
    [17.4, 5.6, 1.4],
    [14.6, 6.2, 0.6],
  ];
  for (const [lx, lz, turn] of bales) {
    parts.add(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 10), '#d9c071', {
      ...local(lx, lz),
      y: ground(lx, lz) + 0.72,
      rz: Math.PI / 2,
      ry: rotation + turn,
    });
  }

  // Paddock fence, with a gate on the house side, shut.
  const { x0, x1, z0, z1 } = FARM.paddock;
  const corners = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  for (let side = 0; side < 4; side++) {
    const [ax, az] = corners[side];
    const [bx, bz] = corners[(side + 1) % 4];
    const length = Math.hypot(bx - ax, bz - az);
    const posts = Math.round(length / 2.6);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const lx = ax + (bx - ax) * t;
      const lz = az + (bz - az) * t;
      parts.box(0.16, 1.4, 0.16, '#8d7a5c', { ...local(lx, lz), y: ground(lx, lz) + 0.55, ry: rotation });
      if (i === posts) continue;
      const gate = side === 0 && i === 2;
      const nx = ax + (bx - ax) * ((i + 1) / posts);
      const nz = az + (bz - az) * ((i + 1) / posts);
      // The gate: three bars between two stiles just inside the posts, and a brace across them.
      if (gate) {
        const end = (t, h) => ({ ...local(lx + (nx - lx) * t, lz + (nz - lz) * t), y: ground(lx, lz) + h });
        for (const h of [0.35, 0.7, 1.05]) parts.beam(end(0.06, h), end(0.94, h), 0.08, '#c9bb9b', 0.1);
        for (const t of [0.06, 0.94]) parts.beam(end(t, 0.3), end(t, 1.1), 0.1, '#c9bb9b', 0.1);
        parts.beam(end(0.06, 0.35), end(0.94, 1.05), 0.08, '#c9bb9b', 0.1);
        continue;
      }
      for (const h of [0.55, 1.05]) {
        parts.beam(
          { ...local(lx, lz), y: ground(lx, lz) + h },
          { ...local(nx, nz), y: ground(nx, nz) + h },
          0.09,
          '#9c8a6a',
          0.12,
        );
      }
    }
    const a = local(ax, az);
    const b = local(bx, bz);
    obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 0.25 });
  }
  // A water trough for the cows, set into the ground where it stands (the paddock is off the level yard).
  const trough = { ...local(x0 + 3, z1 - 2), ry: rotation };
  const troughY = ground(x0 + 3, z1 - 2);
  parts.box(2.2, 0.7, 0.8, '#7d8a86', { ...trough, y: troughY + 0.2 });
  parts.box(2, 0.1, 0.6, '#8fbcbf', { ...trough, y: troughY + 0.52 });

  // A field of wheat beyond the barn.
  const wheat = wheatField(FARM.wheat, local);
  scene.add(wheat.mesh);

  scene.add(parts.mesh());
  // The walls, and the porch in front of the door, which a car would sink into.
  const porch = { ...local(house.x - 1.6, house.z + 3.9), halfX: 1.4, halfZ: 0.9, rotation, radius: 0 };
  obstacles.push(...walls, porch);
  for (const [spot, radius] of [
    [silo, 2.2],
    [{ x: 16, z: 4.6 }, 2],
    [{ x: x0 + 3, z: z1 - 2 }, 1.2],
  ]) {
    obstacles.push({ ...local(spot.x, spot.z), radius });
  }

  // Wood smoke from the farmhouse chimney.
  const smoke = createSmoke(scene, at(house.x + 2, 6.6, house.z - 1.2), { rise: 8, size: 0.5 });
  return {
    update(time) {
      smoke.update(time);
      wheat.show();
    },
  };
}
