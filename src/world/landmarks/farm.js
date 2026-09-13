// A small farm inside the trail loop: a farmhouse, a red barn, a silo, hay
// bales, a paddock for the cows and a field of wheat.
import * as THREE from 'three';
import { FARM } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame, gableRoof, gableEnds, createSmoke, vertexColorMaterial } from '../build.js';

const WHITE = '#eee7d3';

export function buildFarm(scene, obstacles) {
  const parts = new PartsBuilder();
  const { rotation } = FARM;
  const local = localFrame(FARM.x, FARM.z, rotation);
  const y = terrainHeight(FARM.x, FARM.z);
  const at = (lx, ly, lz, extra = {}) => ({ ...local(lx, lz), y: y + ly, ry: rotation, ...extra });
  const ground = (lx, lz) => {
    const p = local(lx, lz);
    return terrainHeight(p.x, p.z);
  };

  // Farmhouse.
  const house = { x: -8, z: -6 };
  parts.box(7, 3.4, 6, '#e8dcbc', at(house.x, 1.6, house.z));
  parts.box(7.4, 0.5, 6.4, '#9a978a', at(house.x, 0.05, house.z));
  // The ridge runs along the house, so the roof is built across its depth and turned.
  parts.add(gableEnds(6, 7, 3.3, 5.6), '#e8dcbc', at(house.x, 0, house.z, { ry: rotation + Math.PI / 2 }));
  parts.add(gableRoof(6, 7, 3.25, 5.7, 0.45), '#a5503c', at(house.x, 0, house.z, { ry: rotation + Math.PI / 2 }));
  parts.box(1.1, 2, 0.12, '#5b6f62', at(house.x - 1.6, 1.15, house.z + 3.03)); // door
  for (const lx of [0.4, 2.3]) {
    parts.box(1, 1, 0.12, '#e8cf8a', at(house.x + lx, 1.9, house.z + 3.03)); // windows
    parts.box(1.25, 0.14, 0.16, WHITE, at(house.x + lx, 1.36, house.z + 3.06));
  }
  parts.box(2.6, 0.18, 1.6, '#bca57d', at(house.x - 1.6, 0.25, house.z + 3.9)); // porch
  parts.box(0.8, 2.2, 0.8, '#8e8b7f', at(house.x + 2, 5.4, house.z - 1.2)); // chimney

  // Barn: red boards, white trim and a steep roof.
  const barn = { x: 8, z: -3 };
  parts.box(9, 4.6, 12, '#b0503a', at(barn.x, 2.3, barn.z));
  parts.add(gableEnds(9, 12, 4.6, 8.2), '#b0503a', at(barn.x, 0, barn.z));
  parts.add(gableRoof(9, 12, 4.55, 8.3, 0.4), '#6f6b63', at(barn.x, 0, barn.z));
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

  // Paddock fence, with a gap for the gate on the house side.
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
      if (gate) continue;
      const nx = ax + (bx - ax) * ((i + 1) / posts);
      const nz = az + (bz - az) * ((i + 1) / posts);
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

  // A wheat field beyond the barn: strips of soil with rows of wheat clumps on them.
  const clumps = [];
  for (let row = 0; row < 16; row++) {
    const lx = 6 + row * 1.3;
    for (let lz = 9; lz < 27; lz += 3) {
      const a = local(lx, lz);
      const b = local(lx, lz + 3);
      parts.beam(
        { ...a, y: terrainHeight(a.x, a.z) + 0.04 },
        { ...b, y: terrainHeight(b.x, b.z) + 0.04 },
        1.2,
        '#a48b63',
        0.06,
      );
    }
    for (let lz = 9.4; lz < 27; lz += 0.75) clumps.push(local(lx + Math.sin(lz * 7.3 + row) * 0.12, lz));
  }
  const stalks = new PartsBuilder();
  for (let k = 0; k < 3; k++) {
    stalks.add(new THREE.ConeGeometry(0.09, 0.95, 3, 1, true), '#dcc27a', {
      x: Math.cos(k * 2.1) * 0.12,
      y: 0.45,
      z: Math.sin(k * 2.1) * 0.12,
      rz: (k - 1) * 0.15,
    });
  }
  const wheat = new THREE.InstancedMesh(stalks.geometry(), vertexColorMaterial, clumps.length);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  clumps.forEach((p, i) => {
    dummy.position.set(p.x, terrainHeight(p.x, p.z), p.z);
    dummy.rotation.set(0, i * 1.7, 0);
    dummy.scale.setScalar(0.9 + ((i * 37) % 10) / 30);
    dummy.updateMatrix();
    wheat.setMatrixAt(i, dummy.matrix);
    wheat.setColorAt(i, tint.setScalar(0.92 + ((i * 53) % 10) / 60));
  });
  wheat.receiveShadow = true;
  scene.add(wheat);

  scene.add(parts.mesh());
  for (const [spot, radius] of [
    [house, 4.4],
    [{ x: barn.x, z: barn.z - 3 }, 4.8],
    [{ x: barn.x, z: barn.z + 3 }, 4.8],
    [silo, 2.2],
    [{ x: 16, z: 4.6 }, 2],
    [{ x: x0 + 3, z: z1 - 2 }, 1.2],
  ]) {
    obstacles.push({ ...local(spot.x, spot.z), radius });
  }

  // Wood smoke from the farmhouse chimney.
  return createSmoke(scene, at(house.x + 2, 6.6, house.z - 1.2), { rise: 8, size: 0.5 });
}
