import './dom.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createObstacleIndex, penetration } from '../src/core/collision.js';
import { createRide, stepRide } from '../src/core/ride.js';
import { createPath, headingOf } from '../src/world/path.js';
import { ROAD, TUNNEL, VALLAVIK, insideVallavik, inVallavikTunnel, onPaved } from '../src/world/layout.js';
import { createDrivingWorld, surfaceUnder } from '../src/world/drivable.js';
import { terrainHeight } from '../src/world/terrain.js';
import { tunnelTakes } from '../src/world/placing.js';
import { buildVallavik, tunnelLight } from '../src/world/landmarks/vallavik.js';
import { insideTunnel } from '../src/world/landmarks/index.js';
import { steerTowards } from './helpers.js';

const STEP = 1 / 60;
const { x: CX, z: CZ, hall, bore, arms, level } = VALLAVIK;
const group = new THREE.Group();
const obstacles = [];
const { occluders } = buildVallavik(group, obstacles);
const index = createObstacleIndex(obstacles);

/** The point `d` metres out from the middle of the hall along an arm and `u` to the side of it. */
const along = (arm, d, u = 0) => [CX + arm.dx * d - arm.dz * u, CZ + arm.dz * d + arm.dx * u];
/** True if a circle of `radius` at (x, z) touches anything solid of the tunnel's. */
const blocked = (x, z, radius) => obstacles.some(obstacle => penetration(x, z, radius, obstacle));

test('three roads leave the roads round the mountain and meet in the hall', () => {
  assert.equal(arms.length, 3);
  for (const arm of arms) {
    const start = arm.path.at(0);
    assert.ok(arm.road.nearest(start.x, start.z).distance < 0.5, `the ${arm.id} road starts on the road it leaves`);
    const end = arm.path.at(arm.path.length);
    assert.ok(Math.hypot(end.x - CX, end.z - CZ) < hall.radius, `the ${arm.id} road ends in the hall`);
    assert.ok(arm.portalS > 20, `the ${arm.id} road has room to straighten up before its portal`);
  }
  // No two of them come into the hall side by side.
  for (const a of arms) {
    for (const b of arms) {
      if (a === b) continue;
      const apart = Math.abs(Math.atan2(Math.sin(a.angle - b.angle), Math.cos(a.angle - b.angle)));
      assert.ok(apart > 1.2, `${a.id} and ${b.id} are ${apart.toFixed(2)} rad apart`);
    }
  }
});

test('the floor is level across every bore and the hall, and never steep along the way in', () => {
  for (const arm of arms) {
    for (let d = hall.radius; d <= arm.portal; d += 2) {
      const middle = terrainHeight(...along(arm, d));
      for (const u of [-bore.radius, -bore.radius / 2, bore.radius / 2, bore.radius]) {
        const side = terrainHeight(...along(arm, d, u));
        assert.ok(Math.abs(side - middle) < 0.15, `${arm.id} ${d} m out: ${(side - middle).toFixed(2)} m across`);
      }
    }
    for (let s = 6; s < arm.path.length - 6; s += 2) {
      const [a, b] = [arm.path.at(s - 2), arm.path.at(s + 2)];
      const grade = Math.abs(terrainHeight(b.x, b.z) - terrainHeight(a.x, a.z)) / 4;
      assert.ok(grade < 0.1, `the ${arm.id} road is ${(grade * 100).toFixed(1)}% steep ${s} m along`);
    }
  }
  for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
    for (let r = 0; r <= hall.radius; r += 3) {
      const y = terrainHeight(CX + Math.cos(angle) * r, CZ + Math.sin(angle) * r);
      assert.ok(Math.abs(y - level) < 0.1, `the hall's floor is ${(y - level).toFixed(2)} m off level`);
    }
  }
});

test('nothing solid stands on the roads in, nor in the lane round the island', () => {
  for (const arm of arms) {
    for (let s = 0; s <= arm.path.length; s += 1) {
      for (const offset of [-3.2, 0, 3.2]) {
        const p = arm.path.offset(s, offset);
        assert.ok(!blocked(p.x, p.z, 1.2), `the ${arm.id} road is blocked ${s} m along, ${offset} m off its middle`);
      }
    }
  }
  for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
    for (let r = hall.island + 1.3; r <= hall.radius - 1.3; r += 1) {
      assert.ok(!blocked(CX + Math.cos(angle) * r, CZ + Math.sin(angle) * r, 1.2), `the lane is blocked ${r} m out`);
    }
  }
});

test('the walls, the island and the foot of the mountain are solid all the way round', () => {
  assert.ok(blocked(CX, CZ, 0.5), 'the island');
  // Out from the middle of the hall in every direction but along a bore, the wall is in the way.
  for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
    const open = arms.some(arm => {
      const off = Math.abs(Math.atan2(Math.sin(angle - arm.angle), Math.cos(angle - arm.angle)));
      return off < Math.asin((bore.radius + 0.6) / hall.radius);
    });
    const [x, z] = [CX + Math.cos(angle) * (hall.radius + 0.3), CZ + Math.sin(angle) * (hall.radius + 0.3)];
    if (!open) assert.ok(blocked(x, z, 0.3), `the hall's wall is open at ${angle.toFixed(2)} rad`);
  }
  // Along each bore, both walls; and beside each portal, the rock.
  for (const arm of arms) {
    for (let d = hall.radius + 2; d <= arm.portal; d += 0.5) {
      for (const side of [-1, 1]) {
        assert.ok(blocked(...along(arm, d, side * (bore.radius + 0.4)), 0.3), `a wall of the ${arm.id} bore is open`);
      }
    }
    for (let u = bore.radius + 0.5; u <= VALLAVIK.face - 0.5; u += 0.5) {
      for (const side of [-1, 1]) {
        assert.ok(blocked(...along(arm, arm.portal, side * u), 0.5), `the rock beside the ${arm.id} portal is open`);
      }
    }
  }
  // And round the outside, anywhere but at a portal, the mountain's foot stops a car before the rock does.
  for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
    const atPortal = arms.some(arm => {
      const off = Math.abs(Math.atan2(Math.sin(angle - arm.angle), Math.cos(angle - arm.angle)));
      return off < Math.atan(VALLAVIK.face / arm.portal) + 0.01;
    });
    if (atPortal) continue;
    const r = VALLAVIK.edge(angle) - 2.2;
    assert.ok(
      blocked(CX + Math.cos(angle) * r, CZ + Math.sin(angle) * r, 1),
      `the foot is open at ${angle.toFixed(2)}`,
    );
  }
});

test('the rock of the mountain covers the bores and the hall, and stands clear of the ground', () => {
  const [mountain] = occluders;
  const material = mountain.material;
  mountain.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ray = new THREE.Raycaster();
  const top = (x, z) => {
    ray.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
    return ray.intersectObject(mountain)[0]?.point.y ?? null;
  };
  for (const arm of arms) {
    for (let d = 0.5; d < arm.portal - 0.5; d += 2) {
      for (const u of [-bore.radius, 0, bore.radius]) {
        const [x, z] = along(arm, d, u);
        const roof = terrainHeight(x, z) + (d < hall.radius + 1 ? hall.height + 2.5 : bore.spring + bore.radius);
        const rock = top(x, z);
        assert.ok(
          rock !== null && rock > roof + 2,
          `only ${(rock - roof).toFixed(1)} m of rock over the ${arm.id} bore`,
        );
      }
    }
  }
  for (let x = CX - 120; x <= CX + 120; x += 6) {
    for (let z = CZ - 120; z <= CZ + 120; z += 6) {
      if (insideVallavik(x + 0.3, z + 0.2) < 8) continue;
      const rock = top(x + 0.3, z + 0.2);
      assert.ok(
        rock !== null && rock > terrainHeight(x + 0.3, z + 0.2) + 0.5,
        `the ground shows through at ${x}, ${z}`,
      );
    }
  }
  mountain.material = material;
});

test('inside the tunnel is told from outside it, and the road in there is a road from wall to wall', () => {
  assert.ok(inVallavikTunnel(CX + hall.island + 4, CZ));
  assert.equal(inVallavikTunnel(CX, CZ - VALLAVIK.reach - 30), null);
  for (const arm of arms) {
    const inBore = along(arm, (hall.radius + arm.portal) / 2, bore.radius - 0.5);
    assert.ok(inVallavikTunnel(...inBore), `in the ${arm.id} bore`);
    assert.equal(surfaceUnder(...inBore), 'road');
    assert.equal(inVallavikTunnel(...along(arm, arm.portal + 3)), null, `outside the ${arm.id} portal`);
    // In the rock beside the bore, there is no tunnel.
    assert.equal(inVallavikTunnel(...along(arm, (hall.radius + arm.portal) / 2, bore.radius + 3)), null);
    assert.ok(onPaved(...along(arm, arm.portal + 10)), `the ${arm.id} road is paved outside too`);
  }
  assert.equal(surfaceUnder(CX + 20, CZ + 8), 'road');
});

test('the horn echoes in the hall and in each bore, as in the tunnel on the trail, and not outside', () => {
  assert.equal(insideTunnel(CX + hall.island + 4, CZ), true);
  for (const arm of arms) {
    assert.equal(insideTunnel(...along(arm, (hall.radius + arm.portal) / 2)), true, `in the ${arm.id} bore`);
    assert.equal(insideTunnel(...along(arm, arm.portal + 6)), false, `outside the ${arm.id} portal`);
  }
  const trail = ROAD.at(TUNNEL.s);
  assert.equal(insideTunnel(trail.x, trail.z), true);
});

test('the lamps light a car inside: not at all outside, wholly well inside, blue in the hall and warm in the bores', () => {
  const outside = along(arms[0], arms[0].portal + 5);
  assert.equal(tunnelLight(...outside).cover, 0);
  const justIn = along(arms[0], arms[0].portal - 2);
  const cover = tunnelLight(...justIn).cover;
  assert.ok(cover > 0 && cover < 0.3, `the light changes gradually at a portal, not ${cover}`);
  const inHall = tunnelLight(CX + 15, CZ);
  assert.equal(inHall.cover, 1);
  assert.ok(inHall.color.b > inHall.color.r, 'blue in the hall');
  const inBore = tunnelLight(...along(arms[0], arms[0].portal - 25));
  assert.equal(inBore.cover, 1);
  assert.ok(inBore.color.r > inBore.color.b, 'warm in the bores');
});

test('nothing of the valley grows under the mountain or on its roads, and it grows as ever beyond them', () => {
  assert.ok(tunnelTakes(CX + 40, CZ + 40));
  for (const arm of arms) {
    assert.ok(tunnelTakes(...along(arm, arm.portal + 12, 6)), `beside the ${arm.id} road`);
    // Round the foot, a wide enough band that a tree fallen towards the mountain doesn't reach it.
    const angle = arm.angle + 1;
    const r = VALLAVIK.edge(angle);
    assert.ok(tunnelTakes(CX + Math.cos(angle) * (r + 7), CZ + Math.sin(angle) * (r + 7)));
    assert.ok(!tunnelTakes(CX + Math.cos(angle) * (r + 30), CZ + Math.sin(angle) * (r + 30)));
  }
  assert.ok(!tunnelTakes(0, 0));
});

/** In by `from`, round the island the way the angle runs (or the other way), and out by `to`. */
function wayThrough(from, to, turn) {
  const lane = (hall.island + hall.radius) / 2;
  const points = [];
  for (let d = from.portal + 22; d > hall.radius + 4; d -= 8) points.push(along(from, d));
  let sweep = ((((to.angle - from.angle) * turn) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (sweep < 0.2) sweep += Math.PI * 2;
  const lead = 0.45;
  const steps = Math.ceil((sweep - 2 * lead) / 0.3);
  for (let n = 0; n <= steps; n++) {
    const angle = from.angle + turn * (lead + ((sweep - 2 * lead) * n) / steps);
    points.push([CX + Math.cos(angle) * lane, CZ + Math.sin(angle) * lane]);
  }
  for (let d = hall.radius + 4; d < to.portal + 22; d += 8) points.push(along(to, d));
  return createPath(points);
}

test('a car on cruise drives in by any bore, round the island either way and out by any other, never slowing', () => {
  for (const from of arms) {
    for (const to of arms) {
      for (const turn of [1, -1]) {
        const path = wayThrough(from, to, turn);
        const start = path.at(0);
        const ride = createRide({ x: start.x, z: start.z, heading: headingOf(start.dx, start.dz) });
        const car = ride.state;
        const world = createDrivingWorld(car, { obstacles: index });
        stepRide(ride, {}, STEP, world, { held: true });
        const held = {};
        const label = `${from.id} to ${to.id}, ${turn > 0 ? 'one' : 'the other'} way round`;
        let at = 0;
        let slowest = Infinity;
        let through = false;
        for (let i = 0; i < 60 * 240 && !through; i++) {
          // The way crosses itself round the island, so it is followed on from where it was last.
          let best = Infinity;
          for (let s = at; s < at + 12; s += 0.5) {
            const p = path.at(Math.min(s, path.length));
            const d = Math.hypot(p.x - car.x, p.z - car.z);
            if (d < best) [best, at] = [d, s];
          }
          assert.ok(best < 4, `${label}: ${best.toFixed(1)} m off its way, ${at.toFixed(0)} m along`);
          through = at > path.length - 8;
          const ahead = path.at(Math.min(at + 6, path.length));
          const desired = Math.atan2(-(ahead.x - car.x), -(ahead.z - car.z));
          stepRide(ride, { cruise: true, cruiseSpeed: 6, steer: steerTowards(car, desired, held) }, STEP, world);
          if (i > 240) slowest = Math.min(slowest, car.speed);
        }
        assert.ok(through, `${label}: not through, stopped ${at.toFixed(0)} m along`);
        assert.ok(slowest > 4, `${label}: slowed to ${slowest.toFixed(1)} m/s`);
      }
    }
  }
});

test('driven hard at the walls from the middle of the hall, a car never gets into the rock', () => {
  for (let angle = 0.1; angle < Math.PI * 2; angle += 0.35) {
    const [x, z] = [CX + Math.cos(angle) * 14, CZ + Math.sin(angle) * 14];
    // Facing straight out from the middle: at the wall, or out along a bore.
    const ride = createRide({ x, z, heading: Math.atan2(-Math.cos(angle), -Math.sin(angle)) });
    const car = ride.state;
    const world = createDrivingWorld(car, { obstacles: index });
    stepRide(ride, {}, STEP, world, { held: true });
    for (let i = 0; i < 60 * 10; i++) {
      stepRide(ride, { forward: true, steer: i > 240 ? 0.6 : 0 }, STEP, world);
      // Either in the hall or a bore, or out past the foot of the mountain by way of a portal.
      const clear = inVallavikTunnel(car.x, car.z) !== null || insideVallavik(car.x, car.z) < 0.5;
      assert.ok(
        clear,
        `in the rock at ${car.x.toFixed(1)}, ${car.z.toFixed(1)}, having set off at ${angle.toFixed(2)} rad`,
      );
    }
  }
});
