import { menuAction, openMenu, resumeDriving } from './menu-helpers.mjs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const url = process.env.GAME_URL || 'http://localhost:5173';
const read = page => page.evaluate(() => window.__littleWilds.getState());
await mkdir('artifacts', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    // Isolate the fixture from the desktop browser's real null sensor events.
    window.addEventListener('deviceorientation', event => { if (event.isTrusted) event.stopImmediatePropagation(); }, true);
    window.motionRequests = 0;
    window.motionPermission = 'granted';
    DeviceOrientationEvent.requestPermission = async () => { window.motionRequests++; return window.motionPermission; };
    window.wheelReading = (turn, angle = 0) => {
      Object.defineProperty(screen.orientation, 'angle', { configurable: true, value: angle });
      const r = (turn + angle) * Math.PI / 180;
      const x = Math.sin(r) * Math.SQRT1_2, y = Math.cos(r) * Math.SQRT1_2;
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: Math.asin(y) * 180 / Math.PI, gamma: Math.atan2(-x, Math.SQRT1_2) * 180 / Math.PI }));
    };
  });
  const page = await context.newPage();page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);await page.getByRole('button', { name: 'Let’s wander' }).click();
  assert.equal(await page.evaluate(() => window.motionRequests), 0);
  await openMenu(page);
  await page.getByRole('button', { name: /Tilt steering/ }).click();
  await page.waitForFunction(() => window.__littleWilds.getState().tilt.enabled);
  assert.equal(await page.evaluate(() => window.motionRequests), 1);
  await page.evaluate(() => window.wheelReading(0));
  assert.equal((await read(page)).tilt.ready, true);
  await resumeDriving(page);
  await page.evaluate(() => window.wheelReading(25));await page.waitForTimeout(450);
  assert.ok((await read(page)).input.tilt > .6, JSON.stringify(await read(page)));
  const origin = await read(page);
  // Genuine touch pedal plus sensor steering, without a steering-arrow press.
  const cdp = await context.newCDPSession(page);
  const pedal = await page.getByRole('button', { name: 'Drive forward', exact: true }).boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pedal.x + pedal.width / 2, y: pedal.y + pedal.height / 2, id: 1 }] });
  await page.waitForTimeout(1100);
  const moved = await read(page);assert.ok(moved.distance > origin.distance + 3);assert.ok(moved.heading > origin.heading + .1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await menuAction(page, 'Center steering');await page.waitForTimeout(100);assert.ok(Math.abs((await read(page)).input.tilt) < .01);
  await page.evaluate(() => window.wheelReading(-5));await page.waitForTimeout(300);assert.ok((await read(page)).input.tilt < -.8);
  await menuAction(page, /Little explorer/);await page.waitForTimeout(1000);assert.ok((await read(page)).speed > 3);
  await openMenu(page);assert.equal((await read(page)).paused, true);
  await page.evaluate(() => window.wheelReading(20));await page.waitForTimeout(100);assert.equal((await read(page)).tilt.steering, 0);
  await page.getByRole('button', { name: /Back to the fresh air/ }).click();await page.waitForTimeout(150);assert.ok(Math.abs((await read(page)).input.tilt) < .01);
  await menuAction(page, /Little explorer/);
  await page.screenshot({ path: 'artifacts/phone-tilt.png' });
  for (const angle of [90, 270]) {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(angle => { Object.defineProperty(screen.orientation, 'angle', { configurable: true, value: angle });screen.orientation.dispatchEvent(new Event('change')); }, angle);
    assert.equal((await read(page)).tilt.ready, false);
    await page.evaluate(angle => window.wheelReading(0, angle), angle);await page.waitForTimeout(100);assert.ok(Math.abs((await read(page)).input.tilt) < .01);
    await page.evaluate(angle => window.wheelReading(25, angle), angle);await page.waitForTimeout(350);assert.ok((await read(page)).input.tilt > .6);
  }
  await page.screenshot({ path: 'artifacts/landscape-tilt.png' });
  for (const [width, height, screenshot] of [[390, 844, 'phone-tilt'], [568, 320, 'small-landscape-tilt'], [1024, 768, 'ipad-tilt']]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.getByRole('button', { name: /Tilt steering/ }).isVisible(), false);
    await openMenu(page);
    for (const name of [/Tilt steering/, 'Center steering']) {
      const control=page.getByRole('button', { name, exact: typeof name === 'string' });await control.scrollIntoViewIfNeeded();
      const r = await control.boundingBox();assert.ok(r && r.height >= 44 && r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= height, `${name} outside ${width} × ${height}`);
    }
    await resumeDriving(page);
    await page.screenshot({ path: `artifacts/${screenshot}.png` });
  }
  await openMenu(page);
  await page.getByRole('button', { name: /Tilt steering/ }).click();assert.equal((await read(page)).tilt.enabled, false);assert.equal((await read(page)).input.tilt, 0);
  await page.evaluate(() => window.motionPermission = 'denied');await page.getByRole('button', { name: /Tilt steering/ }).click();assert.equal((await read(page)).tilt.status, 'denied');assert.equal(await page.getByRole('button', { name: 'Center steering' }).isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS tilt: permission, calibration, analog steering with touch pedal, recenter, explorer, pause/resume, both landscape directions, disable, denial, phone layout; no runtime errors');
} finally { await browser.close(); }
