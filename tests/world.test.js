import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROAD,
  CREEK,
  CAMP_TRAIL,
  BRIDGE,
  TUNNEL,
  CAMP,
  CABIN,
  LOOKOUT,
  SPAWN,
  GNOMES,
  PLACES,
  PADS,
  VALLEY_RADIUS,
  surfaceAt,
  SURFACES,
} from '../src/world/layout.js';
import {
  terrainHeight,
  drivingHeight,
  bridgeHeight,
  deckHeight,
  creekLevel,
  waterDepth,
  waterLevel,
  isDriveable,
  POOL,
} from '../src/world/terrain.js';

test('the whole trail loop and the camp spur are driveable', () => {
  for (const p of [...ROAD.samples, ...CAMP_TRAIL.samples])
    assert.ok(isDriveable(p.x, p.z), `blocked at ${p.x}, ${p.z}`);
  assert.ok(isDriveable(SPAWN.x, SPAWN.z));
  assert.ok(isDriveable(CAMP.x, CAMP.z));
});

test('the trail is level from side to side', () => {
  for (const p of ROAD.samples) {
    const left = terrainHeight(p.x + p.dz * 3, p.z - p.dx * 3);
    const right = terrainHeight(p.x - p.dz * 3, p.z + p.dx * 3);
    // The bridge gap is carved out under the deck.
    if (bridgeHeight(p.x, p.z) !== null) continue;
    assert.ok(Math.abs(left - right) < 0.6, `tilted by ${Math.abs(left - right)} at s=${p.s}`);
  }
});

test('the creek runs downhill from the waterfall pool into the lake', () => {
  let previous = Infinity;
  for (let s = 0; s <= CREEK.length; s += 2) {
    const level = creekLevel(s);
    assert.ok(level <= previous + 1e-9, `creek flows uphill at s=${s}`);
    previous = level;
  }
  assert.ok(POOL.level > creekLevel(CREEK.length) + 8, 'a real drop from the falls to the lake');
});

test('the bridge crosses actual water, and its deck meets the trail at both ends', () => {
  const water = waterLevel(BRIDGE.x, BRIDGE.z);
  assert.ok(Number.isFinite(water), 'there is water under the bridge');
  assert.ok(deckHeight(0) > water + 2, 'deck clears the water');
  for (const end of [-1, 1]) {
    const along = end * (BRIDGE.length / 2);
    const x = BRIDGE.x + BRIDGE.dx * along;
    const z = BRIDGE.z + BRIDGE.dz * along;
    assert.ok(Math.abs(deckHeight(along) - 0.12 - terrainHeight(x, z)) < 0.05, 'no step at the bridge ends');
  }
  assert.ok(drivingHeight(BRIDGE.x, BRIDGE.z) > terrainHeight(BRIDGE.x, BRIDGE.z) + 2);
});

test('the creek is shallow enough to ford, but the lake is not', () => {
  const ford = CREEK.at(20);
  assert.ok(waterDepth(ford.x, ford.z) > 0.2 && isDriveable(ford.x, ford.z));
  assert.equal(isDriveable(93, -54), false);
});

test('buildings and the camp stand on flat ground', () => {
  for (const pad of PADS) {
    const heights = [0, 1, 2, 3, 4, 5].map(i => {
      const a = (i / 6) * Math.PI * 2;
      return terrainHeight(pad.x + Math.cos(a) * pad.radius * 0.7, pad.z + Math.sin(a) * pad.radius * 0.7);
    });
    assert.ok(Math.max(...heights) - Math.min(...heights) < 0.5, `pad at ${pad.x}, ${pad.z} is not flat`);
  }
  for (const place of [CAMP, CABIN, LOOKOUT]) {
    assert.ok(PADS.some(pad => Math.hypot(pad.x - place.x, pad.z - place.z) < pad.radius));
  }
});

test('the tunnel floor is level across the whole bore', () => {
  for (let along = -TUNNEL.length / 2; along <= TUNNEL.length / 2; along += 2) {
    const p = ROAD.at(TUNNEL.s + along);
    const centre = terrainHeight(p.x, p.z);
    for (const side of [-TUNNEL.radius, TUNNEL.radius]) {
      const wall = terrainHeight(p.x - p.dz * side, p.z + p.dx * side);
      assert.ok(wall < centre + 0.4, 'no ground pokes into the tunnel');
    }
  }
});

test('every gnome and place can be reached by car', () => {
  for (const spot of [...GNOMES, ...PLACES]) {
    assert.ok(Math.hypot(spot.x, spot.z) < VALLEY_RADIUS, `${spot.x}, ${spot.z} is outside the fence`);
  }
  for (const gnome of GNOMES) {
    const reachable = [0, 1, 2, 3, 4, 5, 6, 7].some(i => {
      const a = (i / 8) * Math.PI * 2;
      return isDriveable(gnome.x + Math.cos(a) * 2.5, gnome.z + Math.sin(a) * 2.5);
    });
    assert.ok(reachable, `gnome at ${gnome.x}, ${gnome.z} is unreachable`);
  }
});

test('special surfaces are found where they were placed', () => {
  for (const patch of SURFACES) assert.equal(surfaceAt(patch.x, patch.z), patch.id);
  assert.equal(surfaceAt(SPAWN.x, SPAWN.z), 'grass');
});

test('heights stay finite across the valley', () => {
  for (let x = -VALLEY_RADIUS; x <= VALLEY_RADIUS; x += 9) {
    for (let z = -VALLEY_RADIUS; z <= VALLEY_RADIUS; z += 9) assert.ok(Number.isFinite(drivingHeight(x, z)));
  }
});
