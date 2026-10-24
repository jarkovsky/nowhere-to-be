import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SWING, createTrailerState, stepTrailer, swingOf } from '../src/core/trailer.js';

const LENGTH = 6.85;

/** Drives a hitch along at `speed` m/s while turning at `turn` rad/s, for `seconds`. */
function drive(trailer, start, { speed, turn, seconds }) {
  const lorry = { ...start };
  let widest = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    lorry.heading += (turn * Math.abs(speed)) / 60;
    lorry.x -= (Math.sin(lorry.heading) * speed) / 60;
    lorry.z -= (Math.cos(lorry.heading) * speed) / 60;
    stepTrailer(trailer, lorry, lorry.heading, LENGTH);
    widest = Math.max(widest, Math.abs(swingOf(trailer, lorry.heading)));
  }
  return { lorry, widest };
}

test('the trailer starts straight behind the lorry and stays there on a straight road', () => {
  const trailer = createTrailerState();
  const { lorry } = drive(trailer, { x: 0, z: 0, heading: 0.4 }, { speed: 7, turn: 0, seconds: 5 });
  assert.ok(Math.abs(swingOf(trailer, lorry.heading)) < 1e-9);
});

test('on a bend it swings out a little, and comes back into line once the road straightens', () => {
  const trailer = createTrailerState();
  let { lorry, widest } = drive(trailer, { x: 0, z: 0, heading: 0 }, { speed: 7, turn: 0.08, seconds: 6 });
  assert.ok(widest > 0.2 && widest < MAX_SWING, `swung out by ${widest.toFixed(2)}`);
  ({ lorry } = drive(trailer, lorry, { speed: 7, turn: 0, seconds: 8 }));
  assert.ok(Math.abs(swingOf(trailer, lorry.heading)) < 0.02);
});

test('turning on the spot it never folds up against the lorry', () => {
  const trailer = createTrailerState();
  const { widest } = drive(trailer, { x: 0, z: 0, heading: 0 }, { speed: 3, turn: 0.4, seconds: 30 });
  assert.ok(widest <= MAX_SWING + 1e-9);
});

test('reversing straight back, it comes into line rather than jack-knifing', () => {
  const trailer = createTrailerState();
  let { lorry } = drive(trailer, { x: 0, z: 0, heading: 0 }, { speed: 6, turn: 0.15, seconds: 3 });
  const before = Math.abs(swingOf(trailer, lorry.heading));
  ({ lorry } = drive(trailer, lorry, { speed: -3, turn: 0, seconds: 6 }));
  assert.ok(Math.abs(swingOf(trailer, lorry.heading)) < before / 4);
});

test('a jump (a new vehicle or a teleport) puts it straight behind again', () => {
  const trailer = createTrailerState();
  const { lorry } = drive(trailer, { x: 0, z: 0, heading: 0 }, { speed: 6, turn: 0.2, seconds: 3 });
  stepTrailer(trailer, { x: lorry.x + 40, z: lorry.z }, lorry.heading, LENGTH);
  assert.equal(swingOf(trailer, lorry.heading), 0);
});

test('a trailer whose side would go into a wall swings clear of it, as far as it can swing, and never holds the lorry back', async () => {
  const { createObstacleIndex } = await import('../src/core/collision.js');
  const { swingClear } = await import('../src/core/trailer.js');
  // The lorry facing -Z at the origin, its trailer straight out behind along +Z, and a wall along
  // the trailer's left (-X) side, 0.9 m from its middle where the trailer is 1.25 m wide each side.
  const wall = createObstacleIndex([{ x: -1.4, z: 6, halfX: 0.5, halfZ: 5, rotation: 0, radius: 0 }]);
  const trailer = { x: 0, z: 0, heading: 0, ready: true };
  swingClear(trailer, 0, wall);
  assert.ok(trailer.heading > 0.05, `swung ${trailer.heading.toFixed(2)}, towards the wall or not at all`);
  for (const along of [2.6, 4.25, 5.9, 7.55]) {
    const x = Math.sin(trailer.heading) * along;
    assert.ok(x - 1.25 > -0.9 - 0.05, `its side ${along} m back is still in the wall`);
  }
  // Pressed hard into it, it goes no further than it can swing.
  const tight = createObstacleIndex([{ x: -0.2, z: 6, halfX: 0.5, halfZ: 5, rotation: 0, radius: 0 }]);
  const pressed = { x: 0, z: 0, heading: 0, ready: true };
  swingClear(pressed, 0, tight);
  assert.ok(swingOf(pressed, 0) > 0.3 && swingOf(pressed, 0) <= MAX_SWING + 1e-9, `swung ${swingOf(pressed, 0)}`);
  // Its hitch stays where the lorry has it.
  assert.equal(pressed.x, 0);
  assert.equal(pressed.z, 0);
});
