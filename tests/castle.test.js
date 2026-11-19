import './dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { penetration } from '../src/core/collision.js';
import { LAKELAND, TRACKS } from '../src/world/layout.js';
import { terrainHeight } from '../src/world/terrain.js';
import { buildCastle, towerSite } from '../src/world/landmarks/castle.js';

const middle = LAKELAND.castle;
const track = TRACKS.find(t => t.id === 'castle').path;
const group = new THREE.Group();
const obstacles = [];
buildCastle(group, obstacles);

/** How far (x, z) is from the nearest edge of anything of the castle's, to the centimetre; 0 inside. */
function clearance(x, z) {
  const near = reach => obstacles.some(obstacle => penetration(x, z, reach, obstacle));
  if (near(0.001)) return 0;
  let [low, high] = [0, 40];
  while (high - low > 0.01) {
    const mid = (low + high) / 2;
    if (near(mid)) high = mid;
    else low = mid;
  }
  return low;
}

test('the castle stands in its own group and has things solid in it', () => {
  assert.ok(obstacles.length >= 6);
  assert.ok(group.children.length === 1, 'one mesh, one draw call');
});

test('nothing solid within 3 m of the track up to the middle, all the way', () => {
  for (let s = 0; s <= track.length; s += 0.5) {
    const p = track.at(s);
    assert.ok(clearance(p.x, p.z) >= 3, `${clearance(p.x, p.z).toFixed(1)} m clear at ${s} m along the track`);
  }
});

test('the yard is empty and everything solid lies near the ring', () => {
  for (const obstacle of obstacles) {
    const x = obstacle.x;
    const z = obstacle.z;
    assert.ok(Math.hypot(x - middle.x, z - middle.z) <= 15, 'an obstacle more than 15 m from the middle');
  }
  for (let r = 0; r <= 9; r += 0.5) {
    for (let a = 0; a < 360; a += 5) {
      const x = middle.x + Math.sin((a * Math.PI) / 180) * r;
      const z = middle.z + Math.cos((a * Math.PI) / 180) * r;
      assert.ok(clearance(x, z) > 0, `something solid ${r} m from the middle`);
    }
  }
});

test('the ring is open for 40% of the way round, in arcs each at least 6 m long', () => {
  const radius = 12;
  const open = [];
  for (let a = 0; a < 360; a++) {
    const x = middle.x + Math.sin((a * Math.PI) / 180) * radius;
    const z = middle.z + Math.cos((a * Math.PI) / 180) * radius;
    open.push(clearance(x, z) > 1);
  }
  // Start the walk at a place that is not open, so no arc is cut in two.
  const first = open.indexOf(false);
  const arcs = [];
  let run = 0;
  for (let i = 1; i <= 360; i++) {
    if (open[(first + i) % 360]) run++;
    else if (run) {
      arcs.push(run);
      run = 0;
    }
  }
  const metres = degrees => (degrees * Math.PI * 2 * radius) / 360;
  assert.ok(arcs.length >= 3, `${arcs.length} open arcs`);
  for (const arc of arcs) assert.ok(metres(arc) >= 6, `an open arc only ${metres(arc).toFixed(1)} m long`);
  const total = arcs.reduce((sum, arc) => sum + arc, 0);
  assert.ok(total / 360 >= 0.4, `open only ${((total / 360) * 100).toFixed(0)}% of the way round`);
});

test('the tower stands at least 7 m above the ground under it', () => {
  const site = towerSite();
  const ground = terrainHeight(site.x, site.z);
  let top = -Infinity;
  const mesh = group.children[0];
  const position = mesh.geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
    if (Math.hypot(x - site.x, z - site.z) < 2.3) top = Math.max(top, y);
  }
  assert.ok(top - ground >= 7, `the tower only ${(top - ground).toFixed(1)} m tall`);
  assert.ok(top - ground <= 10.5);
});
