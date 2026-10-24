import test from 'node:test';
import assert from 'node:assert/strict';
import './dom.js';
import * as THREE from 'three';
import {
  DESERT,
  HERDS,
  PADS,
  OUTER_ROAD,
  TRACKS,
  VALLEY_RADIUS,
  desertness,
  onForecourt,
  surfaceAt,
} from '../src/world/layout.js';
import { isDriveable, placementHeight, terrainHeight, waterDepth } from '../src/world/terrain.js';
import { buildDesert } from '../src/world/landmarks/desert.js';
import { createCarState } from '../src/core/driving.js';
import { stepDirt } from '../src/core/dirt.js';
import { drive, flatWorld } from './helpers.js';

const obstacles = [];
buildDesert(new THREE.Group(), obstacles);
const blocked = (x, z, margin) =>
  obstacles.some(o => o.x !== undefined && Math.hypot(x - o.x, z - o.z) < o.radius + margin);
const { path: track } = TRACKS.find(t => t.id === 'desert');

test('the desert is sand underfoot, out from among the grass, and stays inside the fence', () => {
  const sandy = [DESERT.herd, { x: DESERT.x + 40, z: DESERT.z + 40 }];
  for (const { x, z } of sandy) assert.equal(surfaceAt(x, z), 'sand', `at ${x.toFixed(0)}, ${z.toFixed(0)}`);
  assert.equal(desertness(0, 0), 0);
  assert.equal(surfaceAt(DESERT.x, DESERT.z - DESERT.edge - 40), 'grass');
  const things = [...DESERT.buttes, DESERT.oasis, DESERT.station, ...DESERT.houses, DESERT.windpump, DESERT.herd];
  for (const { x, z, radius = 10 } of things) assert.ok(Math.hypot(x, z) + radius < VALLEY_RADIUS - 10);
});

test('sand slows the car more than grass and leaves it dustier than grass but not caked', () => {
  const grass = drive(
    createCarState({ x: 0, z: 0, heading: 0 }),
    { forward: true },
    5,
    flatWorld({ surface: 'grass' }),
  );
  const sand = drive(createCarState({ x: 0, z: 0, heading: 0 }), { forward: true }, 5, flatWorld({ surface: 'sand' }));
  assert.ok(sand.speed < grass.speed);
  assert.ok(sand.speed > grass.speed * 0.7, 'but it never gets stuck');
  let dirt = 0;
  for (let t = 0; t < 300; t += 0.05) dirt = stepDirt(dirt, { surface: 'sand', speed: 7 }, 0.05);
  assert.ok(dirt > 0.4 && dirt < 0.9);
});

test('the track runs from the outer road through the canyon to the oasis, gently and clear of everything', () => {
  const start = track.at(0);
  assert.ok(OUTER_ROAD.isNear(start.x, start.z, 2), 'it leaves the outer road');
  const end = track.at(track.length);
  assert.ok(
    Math.hypot(end.x - DESERT.oasis.x, end.z - DESERT.oasis.z) < DESERT.oasis.radius + 8,
    'and ends at the oasis',
  );
  const [west, east] = DESERT.buttes;
  const between = track.nearest((west.x + east.x) / 2, (west.z + east.z) / 2);
  assert.ok(between.distance < 6, 'between the two buttes of the canyon');
  for (let s = 8; s <= track.length; s += 2) {
    const p = track.at(s);
    const back = track.at(s - 8);
    assert.ok(isDriveable(p.x, p.z), `blocked at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
    assert.ok(Math.abs(terrainHeight(p.x, p.z) - terrainHeight(back.x, back.z)) / 8 < 0.2);
    assert.ok(!blocked(p.x, p.z, 2.4), `something stands in the way at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
  }
});

test('the dunes make the land no more than a little steeper than it was, so they can be driven over', () => {
  const slope = (height, x, z) =>
    Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2;
  // Not where the ground is levelled round the buildings or dug out for the pool.
  const banks = [
    ...PADS.map(pad => ({ ...pad, radius: pad.radius + pad.falloff + 2 })),
    { ...DESERT.oasis, radius: DESERT.oasis.radius + 14 },
  ];
  let most = 0;
  for (let dz = -110; dz <= 110; dz += 3) {
    for (let dx = -110; dx <= 110; dx += 3) {
      const [x, z] = [DESERT.x + dx, DESERT.z + dz];
      if (surfaceAt(x, z) !== 'sand' || blocked(x, z, 6)) continue;
      if (banks.some(bank => Math.hypot(x - bank.x, z - bank.z) < bank.radius)) continue;
      most = Math.max(most, slope(terrainHeight, x, z) - slope(placementHeight, x, z));
    }
  }
  assert.ok(most < 0.22, `${most.toFixed(2)} steeper`);
});

test('the oasis is a pool of water deep enough to splash in, round which the palms stand on dry ground', () => {
  const { x, z, radius } = DESERT.oasis;
  assert.ok(waterDepth(x, z) > 0.5);
  assert.ok(!isDriveable(x, z), 'too deep to drive across');
  for (let a = 0; a < Math.PI * 2; a += 0.5)
    assert.equal(waterDepth(x + Math.cos(a) * (radius + 4), z + Math.sin(a) * (radius + 4)), 0);
});

test('the petrol station forecourt is level, paved and joined to the road, with the camper van parked on it', () => {
  const { x, z, rotation, forecourt } = DESERT.station;
  const world = (lx, lz) => ({
    x: x + lx * Math.cos(rotation) + lz * Math.sin(rotation),
    z: z - lx * Math.sin(rotation) + lz * Math.cos(rotation),
  });
  const heights = [];
  for (let lx = forecourt.x0 + 1; lx < forecourt.x1; lx += 3) {
    for (let lz = forecourt.z0 + 1; lz < forecourt.z1 - 2; lz += 3) {
      const p = world(lx, lz);
      assert.ok(onForecourt(p.x, p.z));
      assert.notEqual(surfaceAt(p.x, p.z), 'sand');
      heights.push(terrainHeight(p.x, p.z));
    }
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) < 0.8, 'level');
  for (const lx of [-8, 0, 8]) {
    const edge = world(lx, forecourt.z1 - 0.2);
    assert.ok(OUTER_ROAD.isNear(edge.x, edge.z, 3.5), 'it reaches the road');
  }
  // The van takes up its place beside the pumps, and the way in from the road is clear.
  const van = obstacles.filter(o => onForecourt(o.x, o.z) && o.radius === 1.2);
  assert.ok(van.length >= 2);
  const gate = world(10, forecourt.z1 - 1);
  assert.ok(!blocked(gate.x, gate.z, 1.5));
});

test('the camels wander on open sand, away from the buttes and the water', () => {
  const herd = HERDS.find(h => h.kind === 'camel');
  assert.ok(herd);
  assert.equal(surfaceAt(herd.x, herd.z), 'sand');
  for (let a = 0; a < Math.PI * 2; a += 0.4) {
    for (const r of [herd.radius / 2, herd.radius]) {
      const [x, z] = [herd.x + Math.cos(a) * r, herd.z + Math.sin(a) * r];
      assert.equal(waterDepth(x, z), 0);
      assert.ok(!DESERT.buttes.some(b => Math.hypot((x - b.x) / b.rx, (z - b.z) / b.rz) < 1.3), 'clear of the buttes');
    }
  }
});
