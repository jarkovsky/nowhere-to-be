// A jetty and a boathouse on the south shore of the lake. One rowing boat is
// tied up at the end of the jetty; another is out fishing.
import * as THREE from 'three';
import { JETTY, LAKE } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame, gableRoof, gableEnds } from '../build.js';

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
  const deck = LAKE.level + 0.75;

  // Deck planks on posts, running out from the shore.
  const shore = terrainHeight(JETTY.x, JETTY.z);
  for (let along = -1; along <= JETTY.length; along += 0.5) {
    const p = local(0, -along);
    parts.box(2.4, 0.1, 0.42, PLANK, { x: p.x, y: Math.max(deck, shore + 0.1), z: p.z, ry: JETTY.heading });
  }
  for (let along = 0; along <= JETTY.length; along += 4) {
    for (const side of [-1.1, 1.1]) {
      const p = local(side, -along);
      const bottom = terrainHeight(p.x, p.z) - 0.4;
      const top = deck + (along === JETTY.length ? 0.9 : 0.05);
      parts.box(0.22, top - bottom, 0.22, POST, { x: p.x, y: (top + bottom) / 2, z: p.z });
    }
  }
  const end = local(0, -JETTY.length - 0.3);
  parts.box(2.6, 0.12, 0.2, POST, { x: end.x, y: deck + 0.85, z: end.z, ry: JETTY.heading });
  const a = local(0, 0);
  obstacles.push({ ax: a.x, az: a.z, bx: end.x, bz: end.z, radius: 1.3 });

  // The boathouse, half over the water on stilts.
  const house = local(-10, -1);
  const floor = Math.max(deck, terrainHeight(house.x, house.z) + 0.2);
  const at = (lx, ly, lz) => ({ ...local(-10 + lx, -1 + lz), y: floor + ly, ry: JETTY.heading });
  parts.box(5, 0.25, 6.5, PLANK, at(0, 0, 0));
  parts.box(4.6, 2.6, 6, '#93714f', at(0, 1.4, 0));
  parts.add(gableEnds(4.6, 6, 2.7, 4.4), '#93714f', at(0, 0, 0));
  parts.add(gableRoof(4.6, 6, 2.65, 4.5, 0.4), '#5d6b62', at(0, 0, 0));
  parts.box(3, 2.1, 0.1, '#6a5340', at(0, 1.2, -3.02)); // doors to the water
  parts.box(1, 2, 0.1, '#5b6f62', at(0, 1.1, 3.02)); // door to the shore
  parts.box(0.9, 0.8, 0.1, '#e8cf8a', at(-1.5, 1.8, 3.02));
  for (const [lx, lz] of [
    [-2.3, -3],
    [2.3, -3],
    [-2.3, 0],
    [2.3, 0],
  ]) {
    const p = local(-10 + lx, -1 + lz);
    const bottom = terrainHeight(p.x, p.z) - 0.4;
    if (bottom < floor) parts.box(0.25, floor - bottom, 0.25, POST, { x: p.x, y: (floor + bottom) / 2, z: p.z });
  }
  // Oars and a life ring on the wall.
  parts.add(new THREE.TorusGeometry(0.42, 0.11, 6, 12), '#e9e3d3', { ...at(1.4, 1.6, 3.08) });
  scene.add(parts.mesh());
  obstacles.push({ ...house, radius: 3.6 });

  // A boat tied up at the end of the jetty, and one out on the lake.
  const moored = rowingBoat(false);
  const mooring = local(2.2, -JETTY.length + 2);
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
