// The bridges (see BRIDGES in layout.js): a timber one carrying the trail over the creek gully
// and others over the rivers in the outlands, in three styles. A timber bridge is a plank deck on
// log trestles with rails; a stone one is an old arch with parapets; a log one is a narrow, low
// crossing of planks laid side by side, with a log along each edge.
import * as THREE from 'three';
import { createRandom } from '../../core/math.js';
import { BRIDGES } from '../layout.js';
import { terrainHeight, deckHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';
import { snowOver } from '../snow.js';

const PLANK_COLORS = ['#8b6446', '#7f5a3f', '#946b4a', '#866044'];
const BEAM = '#5f4532';
const RAIL = '#7a5739';
const STONE = '#a19f8e';
const STONES = ['#a9a594', '#9b9886', '#b3ae9b', '#a09d8f'];
const COPING = '#bab5a2';
const ARCH_STONE = '#c1bba6';
const ROAD = '#b9ab88';
const LOG_KERB = '#6b4f38';

/** A bridge's own frame: a world position `along` it and `side` metres to its right, and which way it points. */
function frameOf(bridge) {
  const local = (along, side = 0) => ({
    x: bridge.x + bridge.dx * along - bridge.dz * side,
    z: bridge.z + bridge.dz * along + bridge.dx * side,
  });
  const deck = along => deckHeight(along, bridge);
  const slope = along => (deck(along + 0.1) - deck(along - 0.1)) / 0.2;
  return { local, deck, slope, yaw: Math.atan2(bridge.dx, bridge.dz), half: bridge.length / 2 };
}

/** Rails stop the car driving off the sides: one capsule along each, `side` metres out from the middle. */
function walls(obstacles, { local, half }, sides, radius) {
  for (const side of sides) {
    const a = local(-half, side);
    const b = local(half, side);
    obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius });
  }
}

/**
 * A plank deck on stringers, held up by trestles, with stone abutments at the ends and rails of
 * posts, a top rail and a mid rail along both sides.
 */
function timberBridge(bridge, parts, obstacles, random) {
  const frame = frameOf(bridge);
  const { local, deck, slope, yaw, half } = frame;
  const halfWidth = bridge.width / 2;

  // Deck planks, laid across the direction of travel with a little irregularity. Planks skewed
  // towards each other cross at their ends, so every other one stands a little higher, or
  // their faces would flicker there.
  for (let along = -half + 0.25, k = 0; along < half; along += 0.56, k++) {
    const p = local(along, (random() - 0.5) * 0.25);
    parts.box(bridge.width + 0.3 + random() * 0.3, 0.14, 0.5, PLANK_COLORS[Math.floor(random() * 4)], {
      x: p.x,
      y: deck(along) - 0.07 + (k % 2) * 0.005,
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
        { ...a, y: deck(along) - 0.36 },
        { ...b, y: deck(Math.min(along + 2, half)) - 0.36 },
        0.42,
        BEAM,
        0.45,
      );
    }
  }

  // Trestles: a pair of posts braced to the deck either side, with a cap across their tops. The
  // creek's stands in the middle of the gully; the others stand on the banks.
  for (const bent of bridge.bents ?? [-(half - 4.5), half - 4.5]) {
    const bed = terrainHeight(local(bent).x, local(bent).z);
    for (const side of [-outer, outer]) {
      const p = local(bent, side);
      const top = deck(bent) - 0.55;
      parts.box(0.5, top - bed + 1, 0.5, BEAM, { x: p.x, y: (top + bed - 1) / 2, z: p.z, ry: yaw });
      for (const along of [bent - 3.2, bent + 3.2]) {
        const foot = local(along, side);
        parts.beam({ ...p, y: bed + 0.4 }, { ...foot, y: deck(along) - 0.6 }, 0.22, BEAM);
      }
    }
    const capLeft = local(bent, -outer - 0.5);
    const capRight = local(bent, outer + 0.5);
    parts.beam({ ...capLeft, y: deck(bent) - 0.65 }, { ...capRight, y: deck(bent) - 0.65 }, 0.4, BEAM);
  }

  // Stone abutments where the bridge meets each bank.
  for (const end of [-1, 1]) {
    const along = end * (half - 1);
    const p = local(along);
    // The creek's stops short of the planks, which reach out over it from the stringers; the
    // others carry the planks right on their tops.
    const top = deck(along) - (bridge === BRIDGES[0] ? 0.5 : 0.16);
    const ground = Math.min(terrainHeight(p.x, p.z), top - 1);
    parts.box(bridge.width + 1.6, top - ground + 2, 2.4, STONE, { x: p.x, y: (top + ground - 2) / 2, z: p.z, ry: yaw });
  }

  // Railings: posts with a top rail and a mid rail on both sides.
  const postSpacing = bridge.length / 8;
  for (const side of [-1, 1]) {
    const offset = side * (halfWidth + 0.05);
    let previous = null;
    for (let i = 0; i <= 8; i++) {
      const along = -half + i * postSpacing;
      const p = local(along, offset);
      const height = deck(along);
      parts.box(0.26, 1.45, 0.26, RAIL, { x: p.x, y: height + 0.55, z: p.z, ry: yaw });
      const top = { ...p, y: height + 1.15 };
      const mid = { ...p, y: height + 0.6 };
      if (previous) {
        parts.beam(previous.top, top, 0.16, RAIL, 0.2);
        parts.beam(previous.mid, mid, 0.12, RAIL, 0.14);
      }
      previous = { top, mid };
    }
  }
  walls(obstacles, frame, [-(halfWidth + 0.1), halfWidth + 0.1], 0.2);
}

/** A cheap pseudo-random number from a place, so the stones of a wall are the same each time. */
const scatter = (x, y, z) => Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1;

/**
 * An old stone arch: a solid body of masonry with the river running through an arch in it, a
 * ring of paler stones round the arch on each face, a gravel road over the top and a parapet
 * along each side.
 */
function stoneBridge(bridge, parts, obstacles) {
  const frame = frameOf(bridge);
  const { local, deck, yaw, half } = frame;
  const halfWidth = bridge.width / 2;
  const wall = 0.55;
  const depth = bridge.width + wall * 2;
  const basis = new THREE.Matrix4()
    .makeBasis(
      new THREE.Vector3(bridge.dx, 0, bridge.dz),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-bridge.dz, 0, bridge.dx),
    )
    .setPosition(bridge.x, 0, bridge.z);
  const alongBody = (z, geometry) =>
    geometry.applyMatrix4(basis.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, z)));

  // The arch's opening, a half ellipse standing on the river bed, under the middle of the deck.
  const reach = bridge.length / 2;
  let bed = Infinity;
  for (let along = -reach; along <= reach; along += 1)
    bed = Math.min(bed, terrainHeight(local(along).x, local(along).z));
  const floor = bed - 0.5;
  const crown = deck(0) - 0.9;
  const opening = Math.min(bridge.length / 2 - 4, 5.6);
  const semiEllipse = (width, height, shape) => {
    shape.moveTo(-width, floor);
    for (let k = 1; k <= 24; k++) {
      const angle = Math.PI - (k / 24) * Math.PI;
      shape.lineTo(Math.cos(angle) * width, floor + Math.sin(angle) * height);
    }
    return shape;
  };

  // The masonry, up to a little under the road, with the arch cut through it.
  const ground = Math.min(terrainHeight(local(-half).x, local(-half).z), terrainHeight(local(half).x, local(half).z));
  const body = new THREE.Shape();
  body.moveTo(-half, Math.min(ground - 1.5, floor - 1));
  body.lineTo(half, Math.min(ground - 1.5, floor - 1));
  const samples = Math.round(bridge.length);
  for (let k = samples; k >= 0; k--) {
    const along = -half + (k / samples) * bridge.length;
    body.lineTo(along, deck(along) - 0.12);
  }
  body.holes.push(semiEllipse(opening, crown - floor, new THREE.Path()));
  const stoneFor = (x, y, z) =>
    STONES[Math.floor(scatter(Math.round(x * 2), Math.round(y * 2), Math.round(z * 2)) * 4)];
  parts.add(
    alongBody(-depth / 2, new THREE.ExtrudeGeometry(body, { depth, bevelEnabled: false, curveSegments: 1 })),
    stoneFor,
  );

  // The ring of paler stones round the arch, on the face each side.
  for (const face of [-1, 1]) {
    const ring = new THREE.Shape();
    ring.moveTo(-opening - 0.5, floor - 0.5);
    for (let k = 0; k <= 24; k++) {
      const angle = Math.PI - (k / 24) * Math.PI;
      ring.lineTo(Math.cos(angle) * (opening + 0.5), floor + Math.sin(angle) * (crown - floor + 0.5));
    }
    ring.lineTo(opening + 0.5, floor - 0.5);
    ring.holes.push(semiEllipse(opening - 0.04, crown - floor - 0.04, new THREE.Path()));
    // Sunk a little into the face, so the two don't share a plane.
    const z = face > 0 ? depth / 2 - 0.04 : -depth / 2 - 0.1;
    parts.add(
      alongBody(z, new THREE.ExtrudeGeometry(ring, { depth: 0.14, bevelEnabled: false, curveSegments: 1 })),
      ARCH_STONE,
    );
  }

  // The road over the top, in short slabs that follow the arch, and a parapet along each side
  // with a coping stone on it and a pier at each end.
  // The slabs sink well into the masonry and the parapets reach a little over the edge of the
  // road, and each runs a little over the next, so no two faces share a plane.
  const step = 1.4;
  for (let along = -half; along < half - 0.01; along += step) {
    const next = Math.min(along + step, half);
    const more = Math.min(next + 0.08, half);
    const [a, b] = [local(along), local(more)];
    parts.beam({ ...a, y: deck(along) - 0.17 }, { ...b, y: deck(more) - 0.17 }, bridge.width + 0.1, ROAD, 0.34);
    for (const side of [-1, 1]) {
      const offset = side * (halfWidth + wall / 2);
      const [pa, pb] = [local(along, offset), local(more, offset)];
      parts.beam({ ...pa, y: deck(along) + 0.3 }, { ...pb, y: deck(more) + 0.3 }, wall - 0.06, STONES[1], 1.1);
      parts.beam({ ...pa, y: deck(along) + 0.9 }, { ...pb, y: deck(more) + 0.9 }, wall + 0.1, COPING, 0.12);
    }
  }
  // A pier at each end of each parapet, down into the bank.
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const p = local(end * (half - 0.3), side * (halfWidth + wall / 2));
      const bottom = Math.min(deck(end * half) - 1.2, terrainHeight(p.x, p.z) - 0.3);
      const top = deck(end * half) + 1.25;
      parts.box(wall - 0.04, top - bottom, 0.7, COPING, { x: p.x, y: (top + bottom) / 2, z: p.z, ry: yaw });
    }
  }
  walls(obstacles, frame, [-(halfWidth + wall / 2), halfWidth + wall / 2], wall / 2);
}

/**
 * A narrow, low crossing for one car: planks laid across two log stringers, a log along each
 * edge, and short piles under the ends and the middle. No rails, so the logs along the edges
 * are what keeps the car on, stopping it a little before the edge of the planks.
 */
function logBridge(bridge, parts, obstacles, random) {
  const frame = frameOf(bridge);
  const { local, deck, slope, yaw, half } = frame;
  const halfWidth = bridge.width / 2;
  const kerb = 0.3;

  for (let along = -half + 0.2, k = 0; along < half; along += 0.46, k++) {
    const p = local(along, (random() - 0.5) * 0.06);
    parts.box(bridge.width + 0.1, 0.12, 0.42, PLANK_COLORS[Math.floor(random() * 4)], {
      x: p.x,
      y: deck(along) - 0.06 + (k % 2) * 0.004,
      z: p.z,
      ry: yaw + (random() - 0.5) * 0.02,
      rx: -Math.atan(slope(along)),
    });
  }
  // Two logs under the planks, and one along each edge on top of their ends.
  for (const side of [-0.95, 0.95]) {
    parts.beam(
      { ...local(-half - 0.4, side), y: deck(-half) - 0.3 },
      { ...local(half + 0.4, side), y: deck(half) - 0.3 },
      0.3,
      BEAM,
      0.3,
    );
  }
  for (const side of [-1, 1]) {
    const edge = side * (halfWidth + kerb / 2 - 0.05);
    parts.beam(
      { ...local(-half, edge), y: deck(-half) + 0.06 },
      { ...local(half, edge), y: deck(half) + 0.06 },
      kerb,
      LOG_KERB,
      kerb,
    );
  }
  // Piles under the ends and the middle, down into the bed.
  for (const along of [-half + 0.8, 0, half - 0.8]) {
    for (const side of [-0.95, 0.95]) {
      const p = local(along, side);
      const bed = terrainHeight(p.x, p.z) - 0.6;
      const top = deck(along) - 0.45;
      parts.box(0.26, top - bed, 0.26, BEAM, { x: p.x, y: (top + bed) / 2, z: p.z, ry: yaw });
    }
  }
  // The logs stop the car a little in from the edge of the planks, so its wheels stay on them.
  walls(obstacles, frame, [-(halfWidth + kerb / 2 + 0.1), halfWidth + kerb / 2 + 0.1], 0.1);
}

const BUILDERS = { timber: timberBridge, stone: stoneBridge, log: logBridge };

export function buildBridge(scene, obstacles) {
  BRIDGES.forEach((bridge, i) => {
    const parts = new PartsBuilder();
    // The creek's own bridge keeps the numbers it always had.
    BUILDERS[bridge.style](bridge, parts, obstacles, createRandom(i === 0 ? 7 : 7 + i * 13));
    snowOver(parts);
    scene.add(parts.mesh());
  });
}
