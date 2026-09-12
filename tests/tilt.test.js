import test from 'node:test';
import assert from 'node:assert/strict';
import { screenRoll, steeringFromRoll, createTiltSteering } from '../src/tilt.js';
import { createCarState, stepDriving } from '../src/driving.js';

function host(permission) {
  const target = new EventTarget(), orientation = new EventTarget();
  orientation.angle = 0;
  let timer, requests = 0;
  Object.assign(target, { isSecureContext: true, screen: { orientation },
    DeviceOrientationEvent: permission ? { requestPermission: () => { requests++; return permission(); } } : {},
    setTimeout(callback) { timer = callback; return 1; }, clearTimeout() { timer = null; },
    expire() { timer?.(); }, requests: () => requests,
    reading(beta, gamma) { const event = new Event('deviceorientation'); Object.assign(event, { beta, gamma }); target.dispatchEvent(event); },
  });
  return target;
}
// Physical wheel rolls, tilted 45 degrees back, encoded as sensor Euler angles.
function sampleForRoll(roll, screenAngle = 0) {
  const r = (roll + screenAngle) * Math.PI / 180;
  const x = Math.sin(r) * Math.SQRT1_2, y = Math.cos(r) * Math.SQRT1_2, z = Math.SQRT1_2;
  return [Math.asin(y) * 180 / Math.PI, Math.atan2(-x, z) * 180 / Math.PI];
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('wheel turns have the same direction in portrait and both landscape orientations', () => {
  for (const screen of [0, 90, -90, 180, 270]) for (const turn of [-30, 0, 30]) {
    const [beta, gamma] = sampleForRoll(turn, screen);
    near(screenRoll(beta, gamma, screen), turn);
  }
  near(screenRoll(70, -90), 20);near(screenRoll(70, 90), -20);
  near(screenRoll(90, 0), 0); // An upright portrait phone, where gamma alone is unsuitable.
  assert.equal(screenRoll(0, 0), null);
  assert.equal(screenRoll(null, 0), null);
  assert.equal(screenRoll(0, NaN), null);
});
test('steering has a dead zone, proportional range, saturation, and wraparound', () => {
  assert.equal(steeringFromRoll(2, 0), 0);near(steeringFromRoll(16.5, 0), .5);
  assert.equal(steeringFromRoll(-70, 0), -1);assert.equal(steeringFromRoll(70, 0), 1);
  near(steeringFromRoll(-178, 178), 1 / 27);assert.equal(steeringFromRoll(null, 0), 0);
});
test('motion permission is requested only by enable and denied access leaves steering off', async () => {
  const h = host(() => Promise.resolve('denied')), tilt = createTiltSteering(h);
  assert.equal(h.requests(), 0);await tilt.enable();assert.equal(h.requests(), 1);
  assert.equal(tilt.getState().status, 'denied');assert.equal(tilt.getState().enabled, false);
  h.reading(45, 30);tilt.update(.05, true);assert.equal(tilt.getState().steering, 0);
});
test('insecure, unsupported, failed permissions, and missing sensor readings fail gracefully', async () => {
  for (const [setup, status] of [[h => h.isSecureContext = false, 'insecure'], [h => h.DeviceOrientationEvent = undefined, 'unsupported']]) {
    const h = host();setup(h);const tilt = createTiltSteering(h);await tilt.enable();assert.equal(tilt.getState().status, status);
  }
  const failed = createTiltSteering(host(() => Promise.reject(new Error('NotAllowedError'))));await failed.enable();assert.equal(failed.getState().status, 'unavailable');
  const h = host(), tilt = createTiltSteering(h);await tilt.enable();h.reading(null, null);h.expire();assert.equal(tilt.getState().status, 'unavailable');
});
test('calibration, damping, recenter, pause, and rotation keep steering predictable', async () => {
  const h = host(() => Promise.resolve('granted')), tilt = createTiltSteering(h);await tilt.enable();
  h.reading(...sampleForRoll(8));assert.equal(tilt.getState().ready, true);
  h.reading(...sampleForRoll(38));tilt.update(.05, true);assert.ok(tilt.getState().steering > 0 && tilt.getState().steering < 1);
  tilt.update(.05, false);assert.equal(tilt.getState().steering, 0);
  tilt.center();tilt.update(.05, true);assert.equal(tilt.getState().steering, 0);
  h.screen.orientation.angle = 90;h.screen.orientation.dispatchEvent(new Event('change'));
  assert.equal(tilt.getState().ready, false);h.reading(...sampleForRoll(0, 90));tilt.update(.05, true);near(tilt.getState().steering, 0);
  h.reading(...sampleForRoll(-30, 90));tilt.update(.05, true);assert.ok(tilt.getState().steering < 0);
  h.reading(0, 0);assert.equal(tilt.getState().ready, false);assert.equal(tilt.getState().steering, 0);
  tilt.suspend();h.reading(...sampleForRoll(-10, 90));tilt.update(.05, true);near(tilt.getState().steering, 0);
  tilt.disable();h.reading(...sampleForRoll(30, 90));assert.equal(tilt.getState().enabled, false);
});
test('turning tilt off while permission is pending cannot reenable it later', async () => {
  let resolve;const h = host(() => new Promise(done => resolve = done)), tilt = createTiltSteering(h);
  const pending = tilt.enable();tilt.disable();resolve('granted');await pending;assert.equal(tilt.getState().status, 'off');h.reading(45, 0);assert.equal(tilt.getState().ready, false);
});
test('legacy iOS screen angle and arrow overrides work with analog steering', async () => {
  const h = host();delete h.screen.orientation;h.orientation = -90;const tilt = createTiltSteering(h);await tilt.enable();h.reading(...sampleForRoll(0, -90));h.reading(...sampleForRoll(30, -90));tilt.update(.05, true);assert.ok(tilt.getState().steering > 0);
  const a = createCarState(), b = createCarState(), c = createCarState();
  for (let i = 0; i < 30; i++) {stepDriving(a, { forward: true, tilt: .5 }, .05);stepDriving(b, { forward: true, tilt: 1 }, .05);stepDriving(c, { forward: true, tilt: 1, right: true }, .05);}
  assert.ok(a.heading > createCarState().heading);assert.ok(b.heading > a.heading);assert.ok(c.heading < createCarState().heading);
  const d = createCarState();stepDriving(d, { tilt: NaN }, .05);assert.equal(d.steering, 0);
});
