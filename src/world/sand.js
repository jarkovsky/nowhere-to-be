// The desert's ground and what grows in it: sand in place of the grass, warmer and paler in
// patches and red sandstone where it is steep, with green grass round the oasis; and cacti, dry
// bushes, tufts of dry grass and sandstone rocks in place of the trees, flowers and long grass,
// which thin out across its edge as the cacti thin in.
import * as THREE from 'three';
import { createRandom, smoothstep, valueNoise } from '../core/math.js';
import { DESERT, TRACKS, VALLEY_RADIUS, desertness, nearRiver, onGravel } from './layout.js';
import { terrainHeight } from './terrain.js';
import { PartsBuilder, tintable } from './build.js';
import { foliageMaterial } from './detail.js';
import { boulderGeometry } from './rocks.js';

const PARCHED = new THREE.Color('#c8b56c');
const SAND = new THREE.Color('#dfbc80');
const SAND_PALE = new THREE.Color('#ead09c');
const SAND_WARM = new THREE.Color('#d39c5c');
const SANDSTONE = new THREE.Color('#c27d52');
const OASIS_GRASS = new THREE.Color('#86a85a');
const tone = new THREE.Color();

/**
 * Colours the ground at a point by how far the desert has taken over (see groundColor in
 * scenery.js): the grass dries out towards the sand, which is paler in some patches and warmer in
 * others, red sandstone where it is steep, and green again round the oasis. `up` is 1 on level ground.
 */
export function desertGround(x, z, up, out) {
  const sand = desertness(x, z);
  if (sand <= 0) return;
  out.lerp(PARCHED, smoothstep(sand, 0, 0.5) * 0.75);
  tone
    .copy(SAND)
    .lerp(SAND_PALE, smoothstep(valueNoise(x / 19 + 3, z / 19, 71), 0.45, 0.8) * 0.8)
    .lerp(SAND_WARM, smoothstep(valueNoise(x / 41, z / 41 + 5, 73), 0.5, 0.85) * 0.7)
    .lerp(SANDSTONE, smoothstep(up, 0.9, 0.72));
  out.lerp(tone, smoothstep(sand, 0.25, 0.75));
  const { x: ox, z: oz, radius } = DESERT.oasis;
  const d = Math.hypot(x - ox, z - oz);
  if (d < radius + 12) out.lerp(OASIS_GRASS, 1 - smoothstep(d, radius + 2, radius + 11));
}

const desertTrack = TRACKS.find(track => track.id === 'desert').path;

/** True round the desert's buildings, buttes, track, oasis and camels, where nothing else may stand. */
function claimed(x, z, margin) {
  const near = (place, r) => Math.hypot(x - place.x, z - place.z) < r + margin;
  return (
    desertTrack.isNear(x, z, 3 + margin) ||
    near(DESERT.station, 20) ||
    near(DESERT.oasis, DESERT.oasis.radius + 3) ||
    near(DESERT.windpump, 4) ||
    DESERT.houses.some(house => near(house, 6)) ||
    DESERT.buttes.some(
      butte => Math.hypot((x - butte.x) / butte.rx, (z - butte.z) / butte.rz) < 1.4 + margin / butte.radius,
    )
  );
}

/**
 * True where the desert takes the place of whatever the rest of the scenery would put there: on
 * the sand, thinning out in patches across its edge, and wherever the desert's own things stand.
 * It stops at the fence.
 */
export function desertTakes(x, z) {
  // Asked of every tree, rock and tuft of grass, so the quickest answer comes first.
  const sand = desertness(x, z);
  if (sand <= 0 || Math.hypot(x, z) > VALLEY_RADIUS) return false;
  return sand > 0.05 + 0.9 * valueNoise(x / 7, z / 7, 53) || claimed(x, z, 6);
}

/**
 * Saguaros are painted pale, and each one's own tint gives it its colour. The plants with fruit,
 * flowers or twigs on them are painted their own green and tinted only lightly, as each one's
 * tint lands on the whole of it, fruit, flowers and twigs and all.
 */
const PALE = '#eef0e6';

/**
 * A saguaro, about four metres tall: a ribbed trunk with a rounded top and `arms` arms, each
 * bending up from a short elbow at its own height and turn.
 */
export function saguaroGeometry(arms) {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.3, 0.34, 3.6, 10), PALE, { y: 1.8 });
  parts.add(new THREE.SphereGeometry(0.3, 10, 6), PALE, { y: 3.6 });
  const layouts = [
    [[1.7, 0.3, 1.1]],
    [
      [1.5, 0.2, 1.2],
      [2.2, Math.PI + 0.3, 0.9],
    ],
    [
      [1.4, 0.5, 1.1],
      [2, Math.PI - 0.2, 1],
      [2.5, 4.4, 0.7],
    ],
  ];
  for (const [y, turn, rise] of layouts[arms - 1]) {
    const [dx, dz] = [Math.cos(turn), -Math.sin(turn)];
    const out = 0.78;
    parts.add(new THREE.CylinderGeometry(0.2, 0.22, out - 0.15, 8), PALE, {
      x: dx * (out / 2 + 0.07),
      y,
      z: dz * (out / 2 + 0.07),
      ry: turn,
      rz: Math.PI / 2,
    });
    parts.add(new THREE.SphereGeometry(0.21, 8, 6), PALE, { x: dx * out, y, z: dz * out });
    parts.add(new THREE.CylinderGeometry(0.19, 0.21, rise, 8), PALE, {
      x: dx * out,
      y: y + rise / 2,
      z: dz * out,
    });
    parts.add(new THREE.SphereGeometry(0.19, 8, 6), PALE, {
      x: dx * out,
      y: y + rise,
      z: dz * out,
    });
  }
  return tintable(parts.geometry());
}

/** A saguaro for seeing from afar: a few sides to its trunk and arms, and no rounded ends. */
function farSaguaroGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(0.26, 0.34, 3.8, 5), PALE, { y: 1.9 });
  for (const [turn, y, rise] of [
    [0.2, 1.5, 1.2],
    [Math.PI + 0.3, 2.2, 0.9],
  ]) {
    const [dx, dz] = [Math.cos(turn), -Math.sin(turn)];
    parts.add(new THREE.BoxGeometry(0.75, 0.32, 0.32), PALE, { x: dx * 0.4, y, z: dz * 0.4, ry: turn });
    parts.add(new THREE.BoxGeometry(0.34, rise + 0.3, 0.34), PALE, {
      x: dx * 0.78,
      y: y + rise / 2,
      z: dz * 0.78,
      ry: turn,
    });
  }
  return tintable(parts.geometry());
}

const FRUIT = '#c8456b';
const PEAR = '#a2bb7f';

/** A prickly pear: flat oval pads growing out of each other, with red fruit on the rims of the top ones. */
export function pricklyPearGeometry() {
  const parts = new PartsBuilder();
  const pad = (x, y, z, ry, rz, size = 1) => {
    parts.add(new THREE.SphereGeometry(0.4, 8, 6), PEAR, { x, y, z, ry, rz, sx: size, sy: 1.3 * size, sz: 0.3 * size });
    // A fruit at `turn` round its rim from the top, half sunk into it.
    return turn => {
      const at = new THREE.Vector3(Math.sin(turn) * 0.4 * size, Math.cos(turn) * 0.52 * size, 0)
        .applyEuler(new THREE.Euler(0, ry, rz, 'YXZ'))
        .add(new THREE.Vector3(x, y, z));
      parts.add(new THREE.IcosahedronGeometry(0.075, 0), FRUIT, { x: at.x, y: at.y, z: at.z, sy: 1.3 });
    };
  };
  pad(0, 0.42, 0, 0, 0.1, 1.1);
  pad(0.42, 0.4, 0.15, 0.9, -0.5);
  pad(-0.3, 0.38, -0.25, 2.2, 0.4, 0.9);
  pad(0.18, 1.1, 0.02, 0.2, 0.35)(-0.5);
  pad(-0.28, 1.0, 0.05, 0.4, -0.4, 0.85)(0.3);
  pad(0.62, 0.98, 0.25, 1, -0.6, 0.8)(0.6);
  const top = pad(0.32, 1.66, 0, 0.1, 0.5, 0.75);
  top(-0.4);
  top(0.5);
  return tintable(parts.geometry(), [FRUIT]);
}

const BLOSSOM = '#f0c23e';
const BARREL = '#a1b382';

/** A barrel cactus: a squat, ribbed ball with a ring of yellow flowers round its top. */
export function barrelCactusGeometry() {
  const parts = new PartsBuilder();
  parts.add(new THREE.SphereGeometry(0.38, 12, 7), BARREL, { y: 0.3, sy: 1.2 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    parts.add(new THREE.IcosahedronGeometry(0.07, 0), BLOSSOM, {
      x: Math.cos(a) * 0.14,
      y: 0.74,
      z: Math.sin(a) * 0.14,
    });
  }
  return tintable(parts.geometry(), [BLOSSOM]);
}

const TWIG = '#7c6650';
const SAGE = '#a9b185';

/** A low desert shrub: small clumps of grey-green leaves at the ends of a tangle of bare twigs. */
export function dryBushGeometry() {
  const parts = new PartsBuilder();
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4;
    const out = k === 0 ? 0 : 0.35 + (k % 3) * 0.13;
    const tip = { x: Math.cos(a) * out, y: 0.5 + ((k * 0.37) % 1) * 0.25 - out * 0.35, z: Math.sin(a) * out };
    parts.beam({ x: tip.x * 0.2, y: -0.05, z: tip.z * 0.2 }, tip, 0.05, TWIG);
    parts.add(new THREE.IcosahedronGeometry(0.24 + (k % 2) * 0.07, 0), SAGE, { ...tip, sy: 0.75, ry: a });
  }
  return tintable(parts.geometry(), [TWIG]);
}

/** A tuft of dry grass: seven stiff blades from one root, splayed out, with a face on both sides. */
export function dryTuftGeometry() {
  const parts = new PartsBuilder();
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    const height = 0.4 + ((k * 0.37) % 1) * 0.3;
    const lean = 0.35 + (k % 3) * 0.12;
    const left = [-dz * 0.025, 0, dx * 0.025];
    const right = [dz * 0.025, 0, -dx * 0.025];
    const top = [dx * lean * height, height, dz * lean * height];
    const blade = new THREE.BufferGeometry();
    blade.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([...left, ...right, ...top, ...right, ...left, ...top], 3),
    );
    blade.computeVertexNormals();
    parts.add(blade, '#ffffff');
  }
  return tintable(parts.geometry());
}

/** Tints as [hue, saturation, lightness] and how far each may vary. */
const TINTS = {
  saguaro: [0.27, 0.32, 0.36, 0.03, 0.06, 0.04],
  pear: [0.2, 0.3, 0.88, 0.05, 0.15, 0.08],
  barrel: [0.2, 0.3, 0.88, 0.05, 0.15, 0.08],
  bush: [0.17, 0.3, 0.88, 0.05, 0.15, 0.08],
  tuft: [0.11, 0.52, 0.72, 0.02, 0.08, 0.05],
  rock: [0.06, 0.55, 0.74, 0.015, 0.08, 0.05],
};

/**
 * Scatters the desert's plants and rocks over the sand, where the desert has taken the place of
 * the trees and grass, and out of the way of its roads and buildings. They have numbers of their
 * own, so they move nothing else. Returns the obstacles they make.
 */
export function buildDesertScenery(scatter) {
  const random = createRandom(8803);
  const tint = name => {
    const [h, s, l, dh, ds, dl] = TINTS[name];
    return new THREE.Color().setHSL(
      h + (random() - 0.5) * 2 * dh,
      s + (random() - 0.5) * 2 * ds,
      l + (random() - 0.5) * 2 * dl,
    );
  };
  const placement = new THREE.Object3D();
  const placed = (x, z, scale, sink, tilt = 0) => {
    placement.position.set(x, terrainHeight(x, z) - sink * scale, z);
    placement.rotation.set(tilt, random() * Math.PI * 2, 0);
    placement.scale.setScalar(scale);
    placement.updateMatrix();
    return placement.matrix.clone();
  };
  const obstacles = [];
  const reach = DESERT.edge + 30;
  /**
   * Tries a spot for every `area` square metres round the desert, and calls `add(x, z, sand)` for
   * those the desert has taken, out of the way of everything, more often the deeper in the sand.
   */
  const scatterOver = (area, margin, add) => {
    for (let i = 0; i < (2 * reach) ** 2 / area; i++) {
      const x = DESERT.x + (random() - 0.5) * 2 * reach;
      const z = DESERT.z + (random() - 0.5) * 2 * reach;
      const sand = desertness(x, z);
      if (sand <= 0 || random() > sand || !desertTakes(x, z) || Math.hypot(x, z) > VALLEY_RADIUS - 4) continue;
      if (claimed(x, z, margin) || onGravel(x, z, 5 + margin) || nearRiver(x, z, 12)) continue;
      add(x, z, sand);
    }
  };

  const saguaros = [];
  scatterOver(320, 2, (x, z) => {
    const scale = 0.7 + random() * 0.6;
    saguaros.push({ matrix: placed(x, z, scale, 0.05), color: tint('saguaro'), shape: Math.floor(random() * 3) });
    obstacles.push({ x, z, radius: 0.36 * scale });
  });
  const pears = [];
  scatterOver(420, 1.5, (x, z) => {
    const scale = 0.8 + random() * 0.6;
    pears.push({ matrix: placed(x, z, scale, 0.05), color: tint('pear') });
    obstacles.push({ x, z, radius: 0.55 * scale });
  });
  const barrels = [];
  scatterOver(260, 1, (x, z) => {
    const scale = 0.7 + random() * 0.6;
    barrels.push({ matrix: placed(x, z, scale, 0.05), color: tint('barrel') });
    obstacles.push({ x, z, radius: 0.36 * scale });
  });
  const bushes = [];
  scatterOver(110, 0.5, (x, z) =>
    bushes.push({ matrix: placed(x, z, 0.6 + random() * 0.7, 0.1), color: tint('bush') }),
  );
  const tufts = [];
  scatterOver(22, 0, (x, z) => tufts.push({ matrix: placed(x, z, 0.8 + random() * 0.6, 0), color: tint('tuft') }));
  const shapes = [0, 1, 2, 3].map(seed => boulderGeometry(seed + 21, { moss: 0 }));
  const rocks = [];
  scatterOver(760, 1, (x, z) => {
    const size = 0.4 + random() ** 2 * 1.5;
    rocks.push({
      matrix: placed(x, z, size, 0.18, (random() - 0.5) * 0.3),
      color: tint('rock'),
      shape: Math.floor(random() * 4),
    });
    if (size > 0.9) obstacles.push({ x, z, radius: size * 1.05 });
  });

  const plants = foliageMaterial('trees');
  // Further off than `range`, they are too small to make out.
  scatter.add({
    geometry: [1, 2, 3].map(saguaroGeometry),
    far: farSaguaroGeometry(),
    near: 150,
    range: 520,
    material: plants,
    items: saguaros,
  });
  scatter.add({ geometry: pricklyPearGeometry(), near: 250, shadows: false, material: plants, items: pears });
  scatter.add({ geometry: barrelCactusGeometry(), near: 170, shadows: false, material: plants, items: barrels });
  scatter.add({ geometry: dryBushGeometry(), near: 250, shadows: false, material: plants, items: bushes });
  scatter.add({
    geometry: dryTuftGeometry(),
    near: 170,
    shadows: false,
    material: foliageMaterial('grass', 170),
    items: tufts,
  });
  scatter.add({
    geometry: shapes,
    far: boulderGeometry(25, { detail: 0, moss: 0 }),
    near: 300,
    range: 450,
    items: rocks,
  });
  return obstacles;
}
