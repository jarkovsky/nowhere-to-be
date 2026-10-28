import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScenery } from '../src/world/scenery.js';
import { CAMP_TRAIL, FARM, LAKE, PAVED, GRAVEL, RAILWAY, ROAD, TRACKS, inCrop } from '../src/world/layout.js';
import { localFrame } from '../src/world/build.js';

const { grass } = buildScenery(new THREE.Scene());

test('no grass grows on the trails, roads, tracks or railway, nor in the lake', () => {
  const along = (path, every = 7) => path.samples.filter((_, i) => i % every === 0);
  for (const path of [ROAD, CAMP_TRAIL, RAILWAY, ...PAVED, ...GRAVEL]) {
    for (const { x, z } of along(path)) {
      if (Math.hypot(x, z) > 1000) continue;
      assert.equal(grass.amountAt(x, z), 0, `grass on the road at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
  }
  for (const track of TRACKS.filter(track => track.ruts)) {
    for (let s = 0; s < track.path.length; s += 9) {
      for (const side of [-0.85, 0.85]) {
        const { x, z } = track.path.offset(s, side);
        // At most a stubble too short to see (see the grass's height in grass.js).
        assert.ok(
          grass.amountAt(x, z) < 0.12,
          `grass in a rut of the ${track.id} track at ${x.toFixed(1)}, ${z.toFixed(1)}`,
        );
      }
    }
  }
  assert.equal(grass.amountAt(LAKE.x, LAKE.z), 0);
});

test('none grows in the wheat, and the meadows are mostly grass', () => {
  const field = localFrame(FARM.x, FARM.z, FARM.rotation);
  const { x0, x1, z0, z1 } = FARM.wheat;
  for (let u = x0 + 1; u < x1; u += 3) {
    for (let v = z0 + 1; v < z1; v += 3) {
      const { x, z } = field(u, v);
      if (inCrop(x, z)) assert.equal(grass.amountAt(x, z), 0, `grass in the wheat at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
  }
  // Off to the side of the trail, all the way round it.
  let grassy = 0;
  let tried = 0;
  for (let s = 0; s < ROAD.length; s += 25) {
    const { x, z } = ROAD.offset(s, 30);
    tried++;
    if (grass.amountAt(x, z) > 0.5) grassy++;
  }
  assert.ok(grassy > tried * 0.6, `only ${grassy} of ${tried} spots beside the trail are grassy`);
});
