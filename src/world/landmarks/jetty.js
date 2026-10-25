// A jetty and a boathouse on the south shore of the lake. One rowing boat is
// tied up at the end of the jetty; another is out fishing.
import * as THREE from 'three';
import { JETTY, LAKE } from '../layout.js';
import { JETTY_DECK, terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame } from '../build.js';
import { gabledHouse } from './house.js';

const PLANK = '#a8875f';
const POST = '#6f5843';

function rowingBoat(withFisher) {
  const parts = new PartsBuilder();
  parts.box(1.3, 0.45, 3.4, '#c86338', { y: 0.2 });
  parts.box(0.92, 0.45, 0.92, '#c86338', { y: 0.2, z: -1.7, ry: Math.PI / 4 }); // pointed bow
  parts.box(1.1, 0.1, 3.2, '#a8875f', { y: 0.36 });
  parts.box(1.2, 0.08, 0.35, '#8a6a49', { y: 0.5, z: 0.2 });
  parts.box(1.42, 0.1, 3.5, '#eee4c8', { y: 0.45 });
  for (const side of [-1, 1])
    parts.box(2.4, 0.06, 0.08, '#8a6a49', { x: side * 0.95, y: 0.55, z: 0.2, ry: side * 0.35 });
  if (withFisher) {
    parts.box(0.6, 0.7, 0.45, '#5f8a7c', { y: 0.95, z: 0.6 });
    parts.add(new THREE.IcosahedronGeometry(0.24, 1), '#f0c9a6', { y: 1.5, z: 0.6 });
    parts.add(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 8), '#dfbb57', { y: 1.68, z: 0.6 });
    parts.add(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 8), '#dfbb57', { y: 1.8, z: 0.6 });
    parts.beam({ x: 0.3, y: 1.1, z: 0.4 }, { x: 1.6, y: 2.6, z: -1.4 }, 0.04, '#5d4a39');
  }
  return parts.mesh();
}

export function buildJetty(scene, obstacles) {
  const parts = new PartsBuilder();
  const local = localFrame(JETTY.x, JETTY.z, JETTY.heading);
  const deck = JETTY_DECK;
  const half = JETTY.width / 2;

  // Planks across the full width, starting under the beach so the deck meets the
  // sand without a step, then joists and posts wherever it's above the ground.
  for (let along = -6; along <= JETTY.length; along += 0.5) {
    const p = local(0, -along);
    const shade = Math.round(along * 2) % 3 === 0 ? '#9f7e57' : PLANK;
    parts.box(JETTY.width, 0.1, 0.44, shade, { x: p.x, y: deck - 0.05, z: p.z, ry: JETTY.heading });
  }
  for (const side of [-half + 0.3, 0, half - 0.3]) {
    const a = local(side, 1);
    const b = local(side, -JETTY.length);
    parts.beam({ ...a, y: deck - 0.22 }, { ...b, y: deck - 0.22 }, 0.18, POST, 0.22);
    for (let along = 0; along <= JETTY.length; along += 4) {
      const p = local(side, -along);
      const bottom = terrainHeight(p.x, p.z) - 0.4;
      const top = deck - 0.3;
      if (top > bottom) parts.box(0.24, top - bottom, 0.24, POST, { x: p.x, y: (top + bottom) / 2, z: p.z });
    }
  }
  // Railings along both sides and across the end; the shore end stays open.
  for (const side of [-half + 0.08, half - 0.08]) {
    for (let along = 2; along <= JETTY.length; along += 2.75) {
      const p = local(side, -along);
      parts.box(0.14, 1, 0.14, POST, { x: p.x, y: deck + 0.45, z: p.z });
    }
    const a = local(side, -2);
    const b = local(side, -JETTY.length);
    parts.beam({ ...a, y: deck + 0.92 }, { ...b, y: deck + 0.92 }, 0.12, POST, 0.1);
    parts.beam({ ...a, y: deck + 0.5 }, { ...b, y: deck + 0.5 }, 0.08, POST, 0.08);
    obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 0.2 });
  }
  const endLeft = local(-half + 0.08, -JETTY.length);
  const endRight = local(half - 0.08, -JETTY.length);
  parts.beam({ ...endLeft, y: deck + 0.92 }, { ...endRight, y: deck + 0.92 }, 0.12, POST, 0.1);
  obstacles.push({ ax: endLeft.x, az: endLeft.z, bx: endRight.x, bz: endRight.z, radius: 0.2 });

  // The boathouse, half over the water on stilts.
  const house = local(-10, -1);
  const floor = Math.max(deck, terrainHeight(house.x, house.z) + 0.2);
  const at = (lx, ly, lz, extra = {}) => ({ ...local(-10 + lx, -1 + lz), y: floor + ly, ry: JETTY.heading, ...extra });
  parts.box(5, 0.25, 6.5, PLANK, at(0, 0, 0));
  const walls = gabledHouse(
    parts,
    { at, local: (lx, lz) => local(-10 + lx, -1 + lz), rotation: JETTY.heading },
    { width: 4.6, depth: 6, base: 0.1, eave: 2.7, ridge: 4.5, walls: '#93714f', roof: '#5d6b62' },
  );
  parts.box(3, 2.1, 0.1, '#6a5340', at(0, 1.2, -3.02)); // doors to the water
  parts.box(1, 2, 0.1, '#5b6f62', at(0, 1.1, 3.02)); // door to the shore
  parts.box(0.9, 0.8, 0.1, '#e8cf8a', at(-1.5, 1.8, 3.02));
  for (const [lx, lz] of [
    [-2.37, -3.12],
    [2.37, -3.12],
    [-2.37, 0],
    [2.37, 0],
  ]) {
    const p = local(-10 + lx, -1 + lz);
    const bottom = terrainHeight(p.x, p.z) - 0.4;
    if (bottom < floor) parts.box(0.25, floor - bottom, 0.25, POST, { x: p.x, y: (floor + bottom) / 2, z: p.z });
  }
  // Oars and a life ring on the wall.
  parts.add(new THREE.TorusGeometry(0.42, 0.11, 6, 12), '#e9e3d3', { ...at(1.4, 1.6, 3.08) });
  scene.add(parts.mesh());
  obstacles.push(walls);

  // A boat tied up at the end of the jetty, and one out on the lake.
  const moored = rowingBoat(false);
  const mooring = local(JETTY.width / 2 + 1.1, -JETTY.length + 3);
  moored.position.set(mooring.x, LAKE.level - 0.1, mooring.z);
  moored.rotation.y = JETTY.heading;
  const fishing = rowingBoat(true);
  scene.add(moored, fishing);

  return {
    update(time) {
      moored.position.y = LAKE.level - 0.1 + Math.sin(time * 1.4) * 0.04;
      moored.rotation.z = Math.sin(time * 1.1) * 0.03;
      // A slow drift in a wide loop on the lake.
      const a = time * 0.025;
      fishing.position.set(
        LAKE.x + Math.cos(a) * 26,
        LAKE.level - 0.1 + Math.sin(time * 1.3) * 0.05,
        LAKE.z + Math.sin(a) * 15,
      );
      fishing.rotation.y = Math.atan2(Math.sin(a) * 26, -Math.cos(a) * 15);
      fishing.rotation.z = Math.sin(time * 0.9) * 0.04;
    },
  };
}
