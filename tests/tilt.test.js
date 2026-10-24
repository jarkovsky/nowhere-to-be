import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAN_BACK,
  createTiltSteering,
  leanBackThresholds,
  screenPitch,
  screenRoll,
  stepLeanBack,
  steeringFromRoll,
} from '../src/input/tilt.js';

/** A fake window with controllable sensor readings, permission and timers. */
function host(permission) {
  const target = new EventTarget();
  const orientation = new EventTarget();
  orientation.angle = 0;
  let timer;
  let requests = 0;
  Object.assign(target, {
    isSecureContext: true,
    screen: { orientation },
    DeviceOrientationEvent: permission
      ? {
          requestPermission: () => {
            requests++;
            return permission();
          },
        }
      : {},
    setTimeout(callback) {
      timer = callback;
      return 1;
    },
    clearTimeout() {
      timer = null;
    },
    expire() {
      timer?.();
    },
    requests: () => requests,
    reading(beta, gamma) {
      const event = new Event('deviceorientation');
      Object.assign(event, { beta, gamma });
      target.dispatchEvent(event);
    },
  });
  return target;
}

/** Sensor angles for a device held like a wheel, tilted 45° back and turned by `roll`. */
function sampleForRoll(roll, screenAngle = 0) {
  const r = ((roll + screenAngle) * Math.PI) / 180;
  const x = Math.sin(r) * Math.SQRT1_2;
  const y = Math.cos(r) * Math.SQRT1_2;
  return [(Math.asin(y) * 180) / Math.PI, (Math.atan2(-x, Math.SQRT1_2) * 180) / Math.PI];
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('turning the device steers the same way in portrait and both landscape orientations', () => {
  for (const screen of [0, 90, -90, 180, 270]) {
    for (const turn of [-30, 0, 30]) near(screenRoll(...sampleForRoll(turn, screen), screen), turn);
  }
  near(screenRoll(70, -90), 20);
  near(screenRoll(70, 90), -20);
  near(screenRoll(90, 0), 0); // upright portrait, where gamma alone is useless
  assert.equal(screenRoll(0, 0), null); // lying flat
  assert.equal(screenRoll(null, 0), null);
  assert.equal(screenRoll(0, NaN), null);
});

test('steering has a dead zone, a proportional range, saturation and wraparound', () => {
  assert.equal(steeringFromRoll(2, 0), 0);
  near(steeringFromRoll(16.5, 0), 0.5);
  assert.equal(steeringFromRoll(-70, 0), -1);
  assert.equal(steeringFromRoll(70, 0), 1);
  near(steeringFromRoll(-178, 178), 1 / 27);
  assert.equal(steeringFromRoll(null, 0), 0);
});

test('motion permission is only requested on enable, and denial leaves tilt off', async () => {
  const h = host(() => Promise.resolve('denied'));
  const tilt = createTiltSteering(h);
  assert.equal(h.requests(), 0);
  await tilt.enable();
  assert.equal(h.requests(), 1);
  assert.equal(tilt.getState().status, 'denied');
  assert.equal(tilt.getState().enabled, false);
  h.reading(45, 30);
  tilt.update(0.05, true);
  assert.equal(tilt.getState().steering, 0);
});

test('insecure pages, missing sensors and failed permission fail gracefully', async () => {
  for (const [setup, status] of [
    [h => (h.isSecureContext = false), 'insecure'],
    [h => (h.DeviceOrientationEvent = undefined), 'unsupported'],
  ]) {
    const h = host();
    setup(h);
    const tilt = createTiltSteering(h);
    await tilt.enable();
    assert.equal(tilt.getState().status, status);
  }
  const failed = createTiltSteering(host(() => Promise.reject(new Error('NotAllowedError'))));
  await failed.enable();
  assert.equal(failed.getState().status, 'unavailable');

  const h = host();
  const silent = createTiltSteering(h);
  await silent.enable();
  h.reading(null, null);
  h.expire();
  assert.equal(silent.getState().status, 'unavailable');
});

test('calibration, smoothing, re-centring, pausing and rotation stay predictable', async () => {
  const h = host(() => Promise.resolve('granted'));
  const tilt = createTiltSteering(h);
  await tilt.enable();
  h.reading(...sampleForRoll(8));
  assert.equal(tilt.getState().ready, true);
  h.reading(...sampleForRoll(38));
  tilt.update(0.05, true);
  const steering = tilt.getState().steering;
  assert.ok(steering > 0 && steering < 1, 'eases towards the target');
  tilt.update(0.05, false);
  assert.equal(tilt.getState().steering, 0, 'no steering while paused');
  tilt.center();
  tilt.update(0.05, true);
  assert.equal(tilt.getState().steering, 0, 'current grip becomes the new centre');

  h.screen.orientation.angle = 90;
  h.screen.orientation.dispatchEvent(new Event('change'));
  assert.equal(tilt.getState().ready, false, 'rotation re-centres');
  h.reading(...sampleForRoll(0, 90));
  tilt.update(0.05, true);
  near(tilt.getState().steering, 0);
  h.reading(...sampleForRoll(-30, 90));
  tilt.update(0.05, true);
  assert.ok(tilt.getState().steering < 0);

  h.reading(0, 0);
  assert.equal(tilt.getState().ready, false, 'lying flat pauses steering');
  tilt.suspend();
  h.reading(...sampleForRoll(-10, 90));
  tilt.update(0.05, true);
  near(tilt.getState().steering, 0);
  tilt.disable();
  h.reading(...sampleForRoll(30, 90));
  assert.equal(tilt.getState().enabled, false);
});

test('turning tilt off while permission is pending keeps it off', async () => {
  let resolve;
  const h = host(() => new Promise(done => (resolve = done)));
  const tilt = createTiltSteering(h);
  const pending = tilt.enable();
  tilt.disable();
  resolve('granted');
  await pending;
  assert.equal(tilt.getState().status, 'off');
  h.reading(45, 0);
  assert.equal(tilt.getState().ready, false);
});

test('older iOS versions report the screen angle on window.orientation', async () => {
  const h = host();
  delete h.screen.orientation;
  h.orientation = -90;
  const tilt = createTiltSteering(h);
  await tilt.enable();
  h.reading(...sampleForRoll(0, -90));
  h.reading(...sampleForRoll(30, -90));
  tilt.update(0.05, true);
  assert.ok(tilt.getState().steering > 0);
});

/** Sensor angles for a device leaned back `pitch` degrees from upright and turned by `roll`. */
function sampleForPose(pitch, roll = 0, screenAngle = 0) {
  const p = (pitch * Math.PI) / 180;
  const r = ((roll + screenAngle) * Math.PI) / 180;
  const x = Math.sin(r) * Math.cos(p);
  const y = Math.cos(r) * Math.cos(p);
  return [(Math.asin(y) * 180) / Math.PI, (Math.atan2(-x, Math.sin(p)) * 180) / Math.PI];
}

test('leaning back reads the same in portrait and both landscape orientations, whatever the turn', () => {
  for (const screen of [0, 90, -90, 180, 270]) {
    for (const pitch of [0, 15, 30, 45, 60, 80]) {
      for (const turn of [-30, 0, 30]) near(screenPitch(...sampleForPose(pitch, turn, screen)), pitch);
    }
  }
  near(screenPitch(90, 0), 0); // upright portrait
  near(screenPitch(0, -90), 0); // upright landscape
  near(screenPitch(0, 0), 90); // lying flat
  near(screenPitch(100, 0), -10); // tipped forward
  assert.equal(screenPitch(null, 0), null);
  assert.equal(screenPitch(30, NaN), null);
});

test('reversing starts a clear way back from the upright pose, short of lying flat', () => {
  assert.deepEqual(leanBackThresholds(30), { enter: 50, exit: 42 });
  assert.deepEqual(leanBackThresholds(-5), { enter: 15, exit: 7 });
  // Held well back already, there is less room before the screen lies flat.
  assert.deepEqual(leanBackThresholds(55), { enter: 68, exit: 60 });
  assert.deepEqual(leanBackThresholds(62), { enter: 72, exit: 64 });
  for (const upright of [-10, 0, 20, 40, 59]) {
    const { enter, exit } = leanBackThresholds(upright);
    assert.ok(enter - upright >= LEAN_BACK.least && exit > upright, `upright at ${upright}°`);
  }
});

test('the screen has to stay leaned back for a moment, and coming back stops at once', () => {
  let state = { reversing: false, held: 0 };
  const step = (pitch, dt = 0.05, upright = 30) => (state = stepLeanBack(state, pitch, upright, dt));
  for (let i = 0; i < 40; i++) step(45);
  assert.equal(state.reversing, false, 'leaning back a little drives on');
  for (let i = 0; i < 7; i++) step(52);
  assert.equal(state.reversing, false, 'not after 0.35 s');
  step(52, 0.1);
  assert.equal(state.reversing, true, 'after 0.45 s');
  step(44);
  assert.equal(state.reversing, true, 'a wobble back towards upright keeps reversing');
  step(41);
  assert.equal(state.reversing, false, 'back past the band it stops');
  step(52, 0.3);
  step(44, 0.3);
  step(52, 0.3);
  assert.equal(state.reversing, false, 'the time leaned back starts again after each wobble');
  // Laid down in one quick movement, it passes through without reversing.
  state = { reversing: false, held: 0 };
  for (const pitch of [35, 48, 56, 63, 70, null, null]) step(pitch, 0.08);
  assert.equal(state.reversing, false);
  step(55, 1, null);
  assert.equal(state.reversing, false, 'nothing happens before the upright pose is known');
});

test('with leaning back switched on, leaning back reverses; lying flat still stops', async () => {
  const h = host(() => Promise.resolve('granted'));
  const tilt = createTiltSteering(h);
  await tilt.enable();
  tilt.setLeanBack(true);
  h.reading(...sampleForPose(25));
  const drive = (seconds, active = true) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.05) tilt.update(0.05, active);
  };
  drive(1);
  assert.equal(tilt.getState().reversing, false);
  h.reading(...sampleForPose(50, 10));
  drive(0.3);
  assert.equal(tilt.getState().reversing, false, 'not straight away');
  drive(0.15);
  assert.equal(tilt.getState().reversing, true);
  assert.ok(tilt.getState().steering > 0, 'and it still steers');
  drive(0.5, false);
  assert.equal(tilt.getState().reversing, false, 'not while paused');
  drive(0.45);
  assert.equal(tilt.getState().reversing, true);
  h.reading(...sampleForPose(34));
  drive(0.05);
  assert.equal(tilt.getState().reversing, false, 'upright again, it stops reversing');

  // Leaned back and then laid flat: the car stops, and picking it up again doesn't reverse.
  h.reading(...sampleForPose(50));
  drive(0.5);
  h.reading(0, 0);
  drive(0.05);
  assert.deepEqual([tilt.getState().reversing, tilt.getState().ready], [false, false]);
  h.reading(...sampleForPose(25));
  drive(0.05);
  assert.equal(tilt.getState().reversing, false);

  // Re-centring while held further back moves the pose it leans back from.
  h.reading(...sampleForPose(40));
  tilt.center();
  h.reading(...sampleForPose(52));
  drive(1);
  assert.equal(tilt.getState().reversing, false);
  h.reading(...sampleForPose(61));
  drive(0.5);
  assert.equal(tilt.getState().reversing, true);

  tilt.setLeanBack(false);
  assert.equal(tilt.getState().reversing, false);
  drive(1);
  assert.equal(tilt.getState().reversing, false, 'switched off, leaning back does nothing');
});

test('leaning back does nothing unless switched on, and steering is unchanged', async () => {
  const h = host(() => Promise.resolve('granted'));
  const tilt = createTiltSteering(h);
  await tilt.enable();
  h.reading(...sampleForPose(20));
  h.reading(...sampleForPose(60, 20));
  for (let i = 0; i < 40; i++) tilt.update(0.05, true);
  assert.equal(tilt.getState().reversing, false);
  assert.ok(tilt.getState().steering > 0.5);
});

test('a centre for leaning back is not taken while the device is still being picked up', async () => {
  const h = host(() => Promise.resolve('granted'));
  const tilt = createTiltSteering(h);
  await tilt.enable();
  tilt.setLeanBack(true);
  h.reading(...sampleForPose(70));
  h.reading(...sampleForPose(73));
  for (let i = 0; i < 20; i++) tilt.update(0.05, true);
  assert.equal(tilt.getState().reversing, false, 'nearly flat to begin with: no centre yet');
  h.reading(...sampleForPose(30));
  h.reading(...sampleForPose(55));
  for (let i = 0; i < 10; i++) tilt.update(0.05, true);
  assert.equal(tilt.getState().reversing, true, 'held up, it leans back from there');
});
