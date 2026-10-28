import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROAD,
  CREEK,
  CAMP_TRAIL,
  TRACKS,
  WATERFALL,
  BRIDGE,
  TUNNEL,
  CAMP,
  CABIN,
  SPAWN,
  PLACES,
  PADS,
  VALLEY_RADIUS,
  UPLANDS_RADIUS,
  SUMMIT,
  FIELDS,
  RING_ROAD,
  LINKS,
  AIRFIELD,
  onAirfield,
  surfaceAt,
  SURFACES,
  BROOK,
  FORD,
  TRACK_ROCKS,
  ROADWORKS,
  ROAD_HALF_WIDTH,
  onPaved,
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
  snowCover,
  POOL,
  brookLevel,
  rockHeight,
} from '../src/world/terrain.js';

test('the whole trail loop, the camp spur and the side tracks are driveable', () => {
  for (const p of [ROAD, CAMP_TRAIL, ...TRACKS.map(t => t.path)].flatMap(path => path.samples))
    assert.ok(isDriveable(p.x, p.z), `blocked at ${p.x}, ${p.z}`);
  assert.ok(isDriveable(SPAWN.x, SPAWN.z));
  assert.ok(isDriveable(CAMP.x, CAMP.z));
});

test('the upland ring and the roads up to it are driveable, level across and climb steadily', () => {
  for (const path of [RING_ROAD, ...LINKS.map(link => link.path)]) {
    // Away from where they join other roads.
    for (let s = 20; s <= path.length - (path.closed ? 0 : 20); s += 2) {
      const p = path.at(s);
      const back = path.at(s - 10);
      assert.ok(isDriveable(p.x, p.z), `blocked at ${p.x}, ${p.z}`);
      const left = terrainHeight(p.x + p.dz * 3, p.z - p.dx * 3);
      const right = terrainHeight(p.x - p.dz * 3, p.z + p.dx * 3);
      assert.ok(Math.abs(left - right) < 0.6, `tilted by ${Math.abs(left - right).toFixed(2)} at ${p.x}, ${p.z}`);
      const grade = Math.abs(terrainHeight(p.x, p.z) - terrainHeight(back.x, back.z)) / 10;
      assert.ok(grade < (path === RING_ROAD ? 0.12 : 0.24), `${(grade * 100).toFixed(0)}% at ${p.x}, ${p.z}`);
    }
  }
});

test('the new road leaves the upland road on the level and runs on gently to the roadworks', () => {
  const { path, asphalt } = ROADWORKS;
  const join = path.at(0);
  const ring = terrainHeight(join.x, join.z);
  // No step where it leaves the ring, and it is paved as far as the asphalt goes.
  for (const s of [ROAD_HALF_WIDTH, ROAD_HALF_WIDTH + 5]) {
    const p = path.at(s);
    assert.ok(Math.abs(terrainHeight(p.x, p.z) - ring) < 0.1, `a step ${s} m in from the ring`);
  }
  assert.ok(onPaved(path.at(asphalt - 2).x, path.at(asphalt - 2).z));
  assert.ok(!onPaved(path.at(asphalt + 8).x, path.at(asphalt + 8).z));
  for (let s = 0; s <= path.length; s += 2) {
    const p = path.at(s);
    assert.ok(isDriveable(p.x, p.z), `blocked at ${p.x}, ${p.z}`);
    const left = terrainHeight(p.x + p.dz * 3, p.z - p.dx * 3);
    const right = terrainHeight(p.x - p.dz * 3, p.z + p.dx * 3);
    assert.ok(Math.abs(left - right) < 0.6, `tilted by ${Math.abs(left - right).toFixed(2)} at s=${s}`);
    if (s < 10) continue;
    const back = path.at(s - 10);
    const grade = Math.abs(terrainHeight(p.x, p.z) - terrainHeight(back.x, back.z)) / 10;
    assert.ok(grade < 0.1, `${(grade * 100).toFixed(0)}% at s=${s}`);
  }
  // Nor are there cliffs round the junction or the site.
  for (const { x: cx, z: cz } of path.samples.filter((_, i) => i % 10 === 0)) {
    for (let x = cx - 30; x <= cx + 30; x += 3) {
      for (let z = cz - 30; z <= cz + 30; z += 3) {
        const h = terrainHeight(x, z);
        const slope = Math.hypot(terrainHeight(x + 1, z) - h, terrainHeight(x, z + 1) - h);
        assert.ok(slope < 0.6, `slope ${slope.toFixed(2)} at ${x.toFixed(0)}, ${z.toFixed(0)}`);
      }
    }
  }
});

test('the airfield is flat, inside the fence and clear of the upland road', () => {
  const level = terrainHeight(AIRFIELD.x, (AIRFIELD.z0 + AIRFIELD.z1) / 2);
  for (let z = AIRFIELD.z0; z <= AIRFIELD.z1; z += 4) {
    for (const x of [AIRFIELD.x - AIRFIELD.width / 2, AIRFIELD.x, AIRFIELD.x + AIRFIELD.width / 2]) {
      assert.ok(Math.abs(terrainHeight(x, z) - level) < 0.05, `bump on the runway at ${x}, ${z}`);
      assert.ok(Math.hypot(x, z) < VALLEY_RADIUS - 20);
    }
  }
  for (const p of RING_ROAD.samples)
    assert.ok(!onAirfield(p.x, p.z, 10), `the ring crosses the airfield at ${p.x}, ${p.z}`);
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

test('there are no cliffs on the valley floor', () => {
  // The rocky hills by the northern fence, the creek gully and the waterfall pool are allowed to be steep.
  for (let x = -340; x <= 340; x += 3) {
    for (let z = -170; z <= 340; z += 3) {
      if (Math.hypot(x, z) > VALLEY_RADIUS) continue;
      if (Math.hypot(x - WATERFALL.x, z - WATERFALL.z) < 24 || CREEK.nearest(x, z).distance < 12) continue;
      const h = terrainHeight(x, z);
      const slope = Math.hypot(terrainHeight(x + 1, z) - h, terrainHeight(x, z + 1) - h);
      assert.ok(slope < 1.05, `slope ${slope.toFixed(2)} at ${x}, ${z}`);
    }
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

test('the waterfall lands in its pool', () => {
  // The falling water meets the pool about 9 m east of its centre.
  assert.ok(waterDepth(WATERFALL.x + 9, WATERFALL.z) > 0.3);
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

test('the trail fords the brook: in shallow water for a few metres, and dry either side', () => {
  assert.ok(waterDepth(FORD.x, FORD.z) > 0.2 && waterDepth(FORD.x, FORD.z) < 0.45);
  assert.ok(isDriveable(FORD.x, FORD.z));
  for (const d of [-9, 9]) {
    const p = ROAD.at(FORD.s + d);
    assert.equal(waterDepth(p.x, p.z), 0, `the trail is dry ${d} m from the ford`);
  }
  let previous = Infinity;
  for (let s = 0; s <= BROOK.length; s += 2) {
    assert.ok(brookLevel(s) <= previous + 1e-9, `the brook flows uphill at s=${s}`);
    previous = brookLevel(s);
  }
});

test('the rocks on the spring track lift the tyres over them', () => {
  for (const rock of TRACK_ROCKS) {
    assert.ok(Math.abs(drivingHeight(rock.x, rock.z) - terrainHeight(rock.x, rock.z) - rock.h) < 1e-6);
    assert.equal(rockHeight(rock.x + rock.r + 0.1, rock.z), 0);
  }
});

test('buildings and the camp stand on flat ground', () => {
  for (const pad of PADS) {
    const heights = [0, 1, 2, 3, 4, 5].map(i => {
      const a = (i / 6) * Math.PI * 2;
      return terrainHeight(pad.x + Math.cos(a) * pad.radius * 0.7, pad.z + Math.sin(a) * pad.radius * 0.7);
    });
    assert.ok(Math.max(...heights) - Math.min(...heights) < 0.5, `pad at ${pad.x}, ${pad.z} is not flat`);
  }
  for (const place of [CAMP, CABIN]) {
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

test('every place on the map is inside the fence', () => {
  for (const spot of PLACES) {
    assert.ok(Math.hypot(spot.x, spot.z) < VALLEY_RADIUS, `${spot.x}, ${spot.z} is outside the fence`);
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

test('snow lies on the summit and the high peaks, but never in the valley', () => {
  assert.equal(snowCover(SUMMIT.x, SUMMIT.z), 1);
  for (let x = -UPLANDS_RADIUS; x <= UPLANDS_RADIUS; x += 6) {
    for (let z = -UPLANDS_RADIUS; z <= UPLANDS_RADIUS; z += 6) {
      if (Math.hypot(x, z) < UPLANDS_RADIUS - 40) assert.equal(snowCover(x, z), 0, `snow at ${x}, ${z}`);
    }
  }
});

test('the farmland is gentle enough for fields', () => {
  for (let a = 0; a < Math.PI * 2; a += 0.3) {
    for (const r of [0, 30, 60, 85]) {
      const x = FIELDS.x + Math.cos(a) * r;
      const z = FIELDS.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);
      const slope = Math.hypot(terrainHeight(x + 2, z) - h, terrainHeight(x, z + 2) - h) / 2;
      assert.ok(slope < 0.12, `slope ${slope.toFixed(2)} at ${x.toFixed(0)}, ${z.toFixed(0)}`);
    }
  }
});

test('the road runs under the arch while the fin carries the car over it and down the far side', async () => {
  const { ROCK_FIN, ROCK_GATE } = await import('../src/world/layout.js');
  const { GATE_TOP, drivingHeight, finHeight, terrainHeight } = await import('../src/world/terrain.js');
  const { x, z } = ROCK_GATE;
  // On the road the car stays on the ground; already up on the arch it stays up there.
  assert.ok(Math.abs(drivingHeight(x, z, terrainHeight(x, z)) - terrainHeight(x, z)) < 0.5);
  assert.ok(Math.abs(drivingHeight(x, z, GATE_TOP) - GATE_TOP) < 0.2);
  // The causeway starts level with the track up the hill, and never climbs too steeply to drive.
  const { path } = ROCK_FIN;
  const start = path.samples[0];
  assert.ok(Math.abs(finHeight(start.x, start.z) - terrainHeight(start.x, start.z)) < 0.3);
  let previous = finHeight(start.x, start.z);
  for (let s = 1; s < path.length; s += 1) {
    const p = path.at(s);
    const h = finHeight(p.x, p.z);
    assert.ok(Math.abs(h - previous) < 0.25, `steep at ${s}`);
    previous = h;
  }
  // Over the arch it comes down the far side to the ground, at the edge of the gravel road.
  const { CONNECTORS, GRAVEL_HALF_WIDTH } = await import('../src/world/layout.js');
  const end = path.samples.at(-1);
  assert.ok(Math.abs(finHeight(end.x, end.z) - terrainHeight(end.x, end.z)) < 0.3);
  const road = CONNECTORS.find(connector => connector.id === 'north').path;
  assert.ok(road.nearest(end.x, end.z).distance < GRAVEL_HALF_WIDTH + 1);
});
