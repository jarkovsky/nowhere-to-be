import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFollower,
  createRoute,
  layCrumbs,
  leaderAlong,
  moveRoute,
  poseAt,
  startRoute,
  stepFollower,
} from '../src/core/follow.js';

const OPTIONS = { length: 4.5, gap: 6, least: 2.5, top: 14, catchUp: 16 };
const DT = 1 / 60;

/**
 * A leader driving north (towards -z) from the origin with a friend `behind` metres behind
 * it, middle to middle. `speedAt(t)` is the leader's speed: it speeds up and slows down
 * gently, and brakes as hard as the player's car can. `path(d)` bends the way it goes.
 * Returns what happened at every step.
 */
function drive({ seconds, speedAt, behind = 12, path = () => 0 }) {
  const route = createRoute();
  startRoute(route, [
    [path(-behind), behind],
    [0, 0],
  ]);
  const friend = createFollower();
  const leader = { d: 0, speed: 0 };
  const pose = { x: 0, z: 0, heading: 0 };
  const steps = [];
  for (let t = 0; t < seconds; t += DT) {
    const want = speedAt(t);
    leader.speed += Math.max(-13 * DT, Math.min(5.5 * DT, want - leader.speed));
    leader.d += leader.speed * DT;
    const x = path(leader.d);
    const z = -leader.d;
    layCrumbs(route, x, z, leader.speed);
    poseAt(route, friend.s, 2.4, pose);
    // The clear distance in a straight line, as the game measures it.
    const straight = Math.hypot(x - pose.x, z - pose.z) - OPTIONS.length;
    const clear = stepFollower(
      friend,
      route,
      { along: leaderAlong(route, x, z), speed: leader.speed, straight },
      DT,
      OPTIONS,
    );
    poseAt(route, friend.s, 2.4, pose);
    steps.push({ t, clear, speed: friend.speed, leaderSpeed: leader.speed, x: pose.x, z: pose.z, s: friend.s });
  }
  return steps;
}

const after = (steps, time) => steps.filter(step => step.t >= time);
const least = steps => Math.min(...steps.map(step => step.clear));

test('a friend keeps its distance behind a leader driving along', () => {
  const steps = drive({ seconds: 20, speedAt: () => 7 });
  for (const step of after(steps, 10)) {
    assert.ok(Math.abs(step.clear - OPTIONS.gap) < 1, `${step.clear.toFixed(2)} m clear`);
    assert.ok(Math.abs(step.speed - 7) < 0.3);
  }
});

test('it waits when the leader stops, and never comes closer than the least gap', () => {
  const steps = drive({ seconds: 20, speedAt: t => (t < 8 ? 7 : 0) });
  assert.ok(least(steps) >= OPTIONS.least, `came within ${least(steps).toFixed(2)} m`);
  const end = after(steps, 16);
  assert.ok(
    end.every(step => Math.abs(step.speed) < 0.05),
    'it has stopped',
  );
  const { clear } = end.at(-1);
  assert.ok(clear > OPTIONS.least && clear < OPTIONS.gap + 1, `waiting ${clear.toFixed(2)} m behind`);
});

test('it stops short when the leader brakes hard from top speed', () => {
  const steps = drive({ seconds: 16, speedAt: t => (t < 9 ? 14 : 0) });
  assert.ok(least(steps) >= OPTIONS.least, `came within ${least(steps).toFixed(2)} m`);
});

test('left behind, it catches up faster than the leader drives', () => {
  const steps = drive({ seconds: 20, behind: 70, speedAt: () => 7 });
  assert.ok(Math.max(...steps.map(step => step.speed)) > 10, 'it hurries');
  const caught = steps.find(step => step.clear < OPTIONS.gap + 1);
  assert.ok(caught && caught.t < 14, `caught up after ${caught?.t.toFixed(1)} s`);
  assert.ok(least(steps) >= OPTIONS.least);
});

test('it backs off when the leader backs up towards it', () => {
  const steps = drive({ seconds: 14, speedAt: t => (t < 5 ? 6 : t < 7 ? 0 : t < 10 ? -5 : 0) });
  assert.ok(least(steps) >= OPTIONS.least, `came within ${least(steps).toFixed(2)} m`);
  const before = steps.find(step => step.t >= 7).s;
  assert.ok(steps.at(-1).s < before - 6, 'it moved back along the route');
});

test('on a winding trail it drives where the leader drove', () => {
  const path = d => Math.sin(d / 9) * 7;
  const steps = drive({ seconds: 25, path, speedAt: () => 8 });
  for (const step of after(steps, 3)) {
    // The leader's path at this friend's z: x = path(-z), since the leader drives towards -z.
    assert.ok(
      Math.abs(step.x - path(-step.z)) < 0.4,
      `off the path by ${Math.abs(step.x - path(-step.z)).toFixed(2)} m`,
    );
  }
  assert.ok(least(steps) >= OPTIONS.least);
});

test('a route moved along with a ferry keeps the way along its deck and forgets the way there', () => {
  // Breadcrumbs every 5 m from z = -15 to 30, the oldest forgotten, so the route starts part
  // way round its ring, at z = 5.
  const route = createRoute(6);
  startRoute(
    route,
    Array.from({ length: 10 }, (_, i) => [0, -15 + i * 5]),
  );
  const s = leaderAlong(route, 0, 30);
  // The deck is from z = 10 on, and it has moved 100 m east.
  moveRoute(
    route,
    (x, z) => z >= 10,
    p => (p.x += 100),
  );
  const pose = { x: 0, z: 0 };
  poseAt(route, s - 10, 0, pose);
  assert.deepEqual(pose, { x: 100, z: 20 });
  assert.equal(leaderAlong(route, 100, 30), s, 'the way along it is as long as it was');
  poseAt(route, s - 40, 0, pose);
  assert.deepEqual(pose, { x: 100, z: 10 }, 'it starts where the deck does');
});
