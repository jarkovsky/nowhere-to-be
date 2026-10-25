// A timber bridge carrying the trail over the creek gully.
import { createRandom } from '../../core/math.js';
import { BRIDGE } from '../layout.js';
import { terrainHeight, deckHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';

const PLANK_COLORS = ['#8b6446', '#7f5a3f', '#946b4a', '#866044'];
const BEAM = '#5f4532';
const RAIL = '#7a5739';
const STONE = '#a19f8e';

/** World position `along` the bridge and `side` metres to its right. */
function local(along, side = 0) {
  return {
    x: BRIDGE.x + BRIDGE.dx * along - BRIDGE.dz * side,
    z: BRIDGE.z + BRIDGE.dz * along + BRIDGE.dx * side,
  };
}

export function buildBridge(scene, obstacles) {
  const random = createRandom(7);
  const parts = new PartsBuilder();
  const yaw = Math.atan2(BRIDGE.dx, BRIDGE.dz);
  const half = BRIDGE.length / 2;
  const halfWidth = BRIDGE.width / 2;
  const slope = along => (deckHeight(along + 0.1) - deckHeight(along - 0.1)) / 0.2;

  // Deck planks, laid across the direction of travel with a little irregularity. Planks skewed
  // towards each other cross at their ends, so every other one stands a little higher, or
  // their faces would flicker there.
  for (let along = -half + 0.25, k = 0; along < half; along += 0.56, k++) {
    const p = local(along, (random() - 0.5) * 0.25);
    parts.box(BRIDGE.width + 0.3 + random() * 0.3, 0.14, 0.5, PLANK_COLORS[Math.floor(random() * 4)], {
      x: p.x,
      y: deckHeight(along) - 0.07 + (k % 2) * 0.005,
      z: p.z,
      ry: yaw + (random() - 0.5) * 0.03,
      rx: -Math.atan(slope(along)),
    });
  }

  // Stringers under the planks, following the gentle arch.
  const outer = halfWidth - 1;
  for (const side of [-outer, 0, outer]) {
    for (let along = -half; along < half; along += 2) {
      const a = local(along, side);
      const b = local(Math.min(along + 2, half), side);
      parts.beam(
        { ...a, y: deckHeight(along) - 0.36 },
        { ...b, y: deckHeight(Math.min(along + 2, half)) - 0.36 },
        0.42,
        BEAM,
        0.45,
      );
    }
  }

  // A trestle in the middle of the gully.
  const bed = terrainHeight(BRIDGE.x, BRIDGE.z);
  for (const side of [-outer, outer]) {
    const p = local(0, side);
    const top = deckHeight(0) - 0.55;
    parts.box(0.5, top - bed + 1, 0.5, BEAM, { x: p.x, y: (top + bed - 1) / 2, z: p.z, ry: yaw });
    for (const along of [-3.2, 3.2]) {
      const foot = local(along, side);
      parts.beam({ ...p, y: bed + 0.4 }, { ...foot, y: deckHeight(along) - 0.6 }, 0.22, BEAM);
    }
  }
  const capLeft = local(0, -outer - 0.5);
  const capRight = local(0, outer + 0.5);
  parts.beam({ ...capLeft, y: deckHeight(0) - 0.65 }, { ...capRight, y: deckHeight(0) - 0.65 }, 0.4, BEAM);

  // Stone abutments where the bridge meets each bank.
  for (const end of [-1, 1]) {
    const along = end * (half - 1);
    const p = local(along);
    const top = deckHeight(along) - 0.5;
    const ground = Math.min(terrainHeight(p.x, p.z), top - 1);
    parts.box(BRIDGE.width + 1.6, top - ground + 2, 2.4, STONE, { x: p.x, y: (top + ground - 2) / 2, z: p.z, ry: yaw });
  }

  // Railings: posts with a top rail and a mid rail on both sides.
  const postSpacing = BRIDGE.length / 8;
  for (const side of [-1, 1]) {
    const offset = side * (halfWidth + 0.05);
    let previous = null;
    for (let i = 0; i <= 8; i++) {
      const along = -half + i * postSpacing;
      const p = local(along, offset);
      const deck = deckHeight(along);
      parts.box(0.26, 1.45, 0.26, RAIL, { x: p.x, y: deck + 0.55, z: p.z, ry: yaw });
      const top = { ...p, y: deck + 1.15 };
      const mid = { ...p, y: deck + 0.6 };
      if (previous) {
        parts.beam(previous.top, top, 0.16, RAIL, 0.2);
        parts.beam(previous.mid, mid, 0.12, RAIL, 0.14);
      }
      previous = { top, mid };
    }
    // The railings stop the car driving off the side.
    const a = local(-half, side * (halfWidth + 0.1));
    const b = local(half, side * (halfWidth + 0.1));
    obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 0.2 });
  }

  scene.add(parts.mesh());
}
