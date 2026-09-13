import test from 'node:test';
import assert from 'node:assert/strict';
import { screenRoll, steeringFromRoll, createTiltSteering } from '../src/input/tilt.js';

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
