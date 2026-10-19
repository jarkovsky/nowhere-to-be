// Masarykova chata: the mountain hut on the shoulder of Šerlich, built in
// 1924-25 to a design by Bohuslav Fuchs. It rises in tiers like a stack of
// boxes: a mint-green ground floor, two salmon-pink floors above it, a green
// skirt roof between each tier and a tall green hipped roof with red brick
// chimneys on top. A stone pillar on the terrace carries a bust of Masaryk.
// The track up to it is waymarked with red-white-red stripes.
import * as THREE from 'three';
import { CHATA, TRACKS } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame, hipRoof, createSmoke } from '../build.js';

const MINT = '#b8e2cd';
const SALMON = '#d6a190';
const ROOF = '#4f8466';
const SURROUND = '#a5574a';
const BRICK = '#b04a3a';
const STONE = '#8f8b80';
const FRAME = '#f1ede2';
const LIT = '#e8cf8a';

/** The three storeys, each set back from the one below. `wall` is where the wall shows above the skirt roof below it. */
const TIERS = [
  { length: 18, depth: 12, base: 0.3, wall: 0.3, height: 3.4, color: MINT },
  { length: 16.2, depth: 10.2, base: 4.6, wall: 5.2, height: 3, color: SALMON },
  { length: 14.6, depth: 8.6, base: 8.5, wall: 9.1, height: 3, color: SALMON },
];
const middle = tier => (tier.wall + tier.base + tier.height) / 2;

/** Red-white-red waymarks, Czech style, on posts beside a track. */
function addWaymarks(parts, path) {
  for (let s = 8; s < path.length - 4; s += 24) {
    const p = path.offset(s, (Math.round(s / 24) % 2 ? 1 : -1) * 3);
    const y = terrainHeight(p.x, p.z);
    parts.box(0.22, 1.5, 0.22, '#7d6a4f', { x: p.x, y: y + 0.55, z: p.z });
    const marks = [
      [1.06, FRAME],
      [0.98, '#c8302a'],
      [0.9, FRAME],
    ];
    for (const [h, color] of marks) parts.box(0.24, 0.08, 0.24, color, { x: p.x, y: y + h, z: p.z });
  }
}

/** The flag: white over red, with a blue triangle at the hoist. Thin boxes, so it shows from both sides. */
function czechFlag(parts, x, y, z, rotation) {
  const local = localFrame(x, z, rotation);
  const width = 1.8;
  const height = 1.2;
  for (const [lx, color] of [
    [width / 2, FRAME],
    [width / 2, '#c8302a'],
  ]) {
    const p = local(lx, 0);
    const top = color === FRAME;
    parts.box(width, height / 2, 0.03, color, {
      x: p.x,
      y: y + (top ? height / 4 : -height / 4),
      z: p.z,
      ry: rotation,
    });
  }
  const wedge = new THREE.BufferGeometry();
  const t = 0.02;
  // A triangular prism: hoist edge to the middle of the flag, on both faces.
  const tri = [
    [0, height / 2, t],
    [0, -height / 2, t],
    [width / 2, 0, t],
    [0, -height / 2, -t],
    [0, height / 2, -t],
    [width / 2, 0, -t],
  ];
  wedge.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
  wedge.computeVertexNormals();
  const hoist = local(0, 0);
  parts.add(wedge, '#2b5a9c', { x: hoist.x, y, z: hoist.z, ry: rotation });
}

export function buildHut(scene, obstacles) {
  const parts = new PartsBuilder();
  const { x, z, rotation } = CHATA;
  const y = terrainHeight(x, z);
  const local = localFrame(x, z, rotation);
  const at = (lx, ly, lz, extra = {}) => ({ ...local(lx, lz), y: y + ly, ry: rotation, ...extra });
  const [ground, first, top] = TIERS;

  parts.box(ground.length + 0.6, 0.8, ground.depth + 0.6, STONE, at(0, 0, 0)); // plinth
  for (const tier of TIERS) {
    parts.box(tier.length, tier.height, tier.depth, tier.color, at(0, tier.base + tier.height / 2, 0));
  }
  // A green skirt roof round the top of each of the lower two storeys.
  for (const [below, above] of [
    [ground, first],
    [first, top],
  ]) {
    const eave = below.base + below.height - 0.1;
    parts.add(
      hipRoof(below.length + 2, below.depth + 2, eave, above.length, above.depth, above.wall),
      ROOF,
      at(0, 0, 0),
    );
  }
  // The main roof flares out at the eaves and rises steeply to a short ridge.
  const eave = top.base + top.height - 0.1;
  parts.add(
    hipRoof(top.length + 2.2, top.depth + 2.2, eave, top.length - 0.6, top.depth - 0.6, eave + 1),
    ROOF,
    at(0, 0, 0),
  );
  parts.add(hipRoof(top.length - 0.6, top.depth - 0.6, eave + 1, 6.4, 0.4, eave + 6.2), ROOF, at(0, 0, 0));
  parts.box(6.6, 0.22, 0.5, '#44735a', at(0, eave + 6.25, 0)); // ridge

  // Windows: tall white ones on the ground floor, small ones with red-brown surrounds above.
  const window = (lx, ly, lz, { w = 0.9, h = 0.9, surround = SURROUND, end = false } = {}) => {
    const turn = end ? { ry: rotation + Math.PI / 2 } : {};
    if (surround) parts.box(w + 0.5, h + 0.5, 0.1, surround, at(lx, ly, lz, turn));
    parts.box(w + 0.16, h + 0.16, 0.13, FRAME, at(lx, ly, lz, turn));
    parts.box(w, h, 0.16, LIT, at(lx, ly, lz, turn));
    parts.box(0.07, h, 0.19, FRAME, at(lx, ly, lz, turn)); // glazing bars
    parts.box(w, 0.07, 0.19, FRAME, at(lx, ly + h * 0.15, lz, turn));
  };
  for (const side of [1, -1]) {
    const front = side * (ground.depth / 2 + 0.03);
    for (const lx of [-7, -4.6, -2.2, 0.2, 2.6]) window(lx, 2.2, front, { w: 1.2, h: 1.4, surround: null });
    for (const lx of [-6, -3.6, -1.2, 1.2, 3.6, 6]) window(lx, middle(first), side * (first.depth / 2 + 0.03));
    // The middle of the top floor carries the name board instead of a window.
    for (const lx of [-5.2, -2.8, 2.8, 5.2]) window(lx, middle(top), side * (top.depth / 2 + 0.03));
    for (const lz of [-3, 0, 3]) window(side * (first.length / 2 + 0.03), middle(first), lz, { end: true });
    for (const lz of [-1.6, 1.6]) window(side * (top.length / 2 + 0.03), middle(top), lz, { end: true });
  }
  for (const lz of [-3.5, 0, 3.5])
    window(ground.length / 2 + 0.03, 2.2, lz, { w: 1.2, h: 1.4, surround: null, end: true });

  // The front door, under a little green canopy.
  const door = ground.depth / 2;
  parts.box(1.4, 2.3, 0.14, '#3f5f50', at(5.6, 1.45, door + 0.05));
  parts.box(2.4, 0.14, 1.3, ROOF, at(5.6, 2.95, door + 0.6, { rx: 0.2 }));
  parts.box(3.2, 0.24, 2.2, '#a39f92', at(5.6, 0.32, door + 1.1)); // step

  // A lower wing at the west end.
  const wing = { x: -ground.length / 2 - 3, length: 6, depth: 8 };
  parts.box(wing.length + 0.4, 0.8, wing.depth + 0.4, STONE, at(wing.x, 0, -0.5));
  parts.box(wing.length, 3.1, wing.depth, MINT, at(wing.x, 1.85, -0.5));
  parts.add(
    hipRoof(wing.length + 1.6, wing.depth + 1.6, 3.3, 0, wing.depth - wing.length, 5.3),
    ROOF,
    at(wing.x, 0, -0.5),
  );
  for (const lz of [-2.6, 1.6])
    window(wing.x - wing.length / 2 - 0.03, 2, lz, { w: 1.1, h: 1.2, surround: null, end: true });
  window(wing.x, 2, wing.depth / 2 - 0.47, { w: 1.1, h: 1.2, surround: null });

  // Red brick chimneys through the main roof.
  const chimneys = [
    [-3, -1.6, 2],
    [3.6, 1.2, 2.3],
  ];
  for (const [lx, lz, above] of chimneys) {
    parts.box(0.9, 4, 0.9, BRICK, at(lx, eave + 4.2 + above - 2, lz));
    parts.box(1.1, 0.2, 1.1, '#8c3a2e', at(lx, eave + 4.2 + above, lz));
  }

  // The stone pillar with Masaryk's bust, on the terrace in front.
  const bust = { lx: -5.5, lz: door + 3 };
  parts.box(1.1, 2.4, 1.1, STONE, at(bust.lx, 1.2, bust.lz));
  parts.box(0.8, 0.35, 0.45, '#5b6457', at(bust.lx, 2.6, bust.lz));
  parts.add(new THREE.IcosahedronGeometry(0.27, 1), '#5b6457', at(bust.lx, 3.02, bust.lz));

  // Benches and tables out front.
  for (const lx of [-1, 4.6]) {
    // Out here the ground starts to slope away from the level pad, so each set stands on its own spot.
    const spot = local(lx, door + 5.1);
    const rise = terrainHeight(spot.x, spot.z) - y - 0.05;
    parts.box(2.4, 0.12, 0.5, '#8a6446', at(lx, rise + 0.62, door + 4.2));
    parts.box(2.4, 0.1, 1, '#8a6446', at(lx, rise + 1.02, door + 5.1));
    parts.box(2.4, 0.12, 0.5, '#8a6446', at(lx, rise + 0.62, door + 6));
    for (const side of [-1, 1]) parts.box(0.12, 1.2, 0.8, '#5f4532', at(lx + side, rise + 0.4, door + 5.1));
  }

  // Flagpole beside the hut.
  const pole = local(wing.x - 1, door + 3);
  const poleY = terrainHeight(pole.x, pole.z);
  parts.add(new THREE.CylinderGeometry(0.07, 0.09, 8, 6), '#d9d6cc', { x: pole.x, y: poleY + 4, z: pole.z });
  czechFlag(parts, pole.x, poleY + 7.3, pole.z, rotation + 0.4);

  addWaymarks(parts, TRACKS.find(track => track.id === 'chata').path);
  scene.add(parts.mesh());

  for (const lz of [-3, 3]) {
    const a = local(-ground.length / 2 + 3.3, lz);
    const b = local(ground.length / 2 - 3.3, lz);
    obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 3.4 });
  }
  const wa = local(wing.x, -3.4);
  const wb = local(wing.x, 2.4);
  obstacles.push({ ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z, radius: wing.length / 2 + 0.3 });
  obstacles.push({ ...local(bust.lx, bust.lz), radius: 0.8 }, { ...pole, radius: 0.3 });
  for (const lx of [-1, 4.6]) obstacles.push({ ...local(lx, door + 5.1), radius: 1.3 });

  const [lx, lz, above] = chimneys[1];
  const smoke = createSmoke(scene, at(lx, eave + 4.6 + above, lz), { count: 7, rate: 0.1, rise: 9, size: 0.6 });
  return {
    /** Where the name board goes: in the middle of the top floor, facing out. */
    nameBoard: { ...at(0, middle(top), top.depth / 2 + 0.1), yaw: rotation },
    update: smoke.update,
  };
}
