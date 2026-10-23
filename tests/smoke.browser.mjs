// End-to-end smoke test in a real browser (Chrome via Playwright).
// Run with `npm run test:browser`; it starts its own dev server.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { startServer } from '../scripts/server.mjs';

const server = await startServer();
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
const state = page => page.evaluate(() => window.__game.getState());
const step = message => console.log(`  ✔ ${message}`);

async function open(options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => message.type() === 'error' && errors.push(message.text()));
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Play' }).waitFor();
  return page;
}

try {
  console.log('Desktop');
  const page = await open({ viewport: { width: 1280, height: 800 } });
  await page.getByRole('button', { name: 'Play' }).click();
  assert.equal((await state(page)).mode, 'driving');
  step('starts from the title screen');

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  const driven = await state(page);
  assert.ok(driven.car.distance > 4, `drove ${driven.car.distance} m`);
  step('drives and steers with the keyboard');

  await page.keyboard.press('Escape');
  assert.equal((await state(page)).mode, 'paused');
  assert.ok(await page.locator('#menu').isVisible());
  const paused = (await state(page)).car;
  await page.waitForTimeout(300);
  assert.equal((await state(page)).car.distance, paused.distance);
  await page.getByRole('button', { name: 'Resume' }).click();
  assert.equal((await state(page)).mode, 'driving');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.mouse.click(30, 400);
  assert.equal((await state(page)).mode, 'driving');
  step('pauses, and resumes from the play button or a tap on the game beside the menu');

  await page.evaluate(async () => {
    const { GNOMES } = await import('/src/world/layout.js');
    window.__game.teleport(GNOMES[0].x + 1.5, GNOMES[0].z, 0);
  });
  await page.waitForTimeout(400);
  assert.deepEqual((await state(page)).journal.gnomes, [0]);
  assert.ok(await page.locator('#gnome-progress').isVisible());
  assert.equal(await page.locator('#gnome-row .found').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#gnome-tally-row .found').count(), 1);
  await page.getByRole('button', { name: 'Resume' }).click();
  step('picks up a gnome and fills in the first one in the row, here and in the menu');

  await page.evaluate(async () => {
    const { CAMP } = await import('/src/world/layout.js');
    window.__game.teleport(CAMP.x, CAMP.z, CAMP.heading);
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Stay the night/ }).click();
  assert.equal((await state(page)).mode, 'camping');
  await page.getByRole('button', { name: 'Wake up' }).click();
  assert.equal((await state(page)).mode, 'driving');
  assert.equal((await state(page)).journal.camp, true);
  step('spends a night at camp and wakes up there');

  await page.keyboard.press('KeyC');
  assert.equal((await state(page)).cameraMode, 'showroom');
  await page.getByRole('button', { name: 'Blue' }).click();
  await page.getByRole('button', { name: 'Flag' }).click();
  await page.getByRole('button', { name: 'Teddy' }).click();
  await page.getByRole('button', { name: 'Roof tent' }).click();
  await page.waitForTimeout(2200);
  assert.equal((await state(page)).tentOpen, 1);
  await page.waitForTimeout(200);
  assert.equal((await state(page)).tentOpen, 1, 'the open tent stays still');
  await page.getByRole('button', { name: 'Tractor' }).click();
  assert.equal((await state(page)).journal.vehicle, 'tractor');
  // The characters keep their own colours, so the paint choice goes away for them.
  await page.getByRole('button', { name: 'Oliver' }).click();
  assert.equal(await page.locator('#color-options').isVisible(), false);
  assert.ok((await state(page)).trailer, 'the lorry has its trailer');
  await page.getByRole('button', { name: 'Off-roader' }).click();
  assert.ok(await page.locator('#color-options').isVisible());
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).cameraMode, 'chase');
  step('shows the car in the garage with a flag, a teddy and the roof tent, which opens and stays open');

  await page.reload();
  await page.getByRole('button', { name: 'Play' }).click();
  const reloaded = await state(page);
  assert.equal(reloaded.journal.color, 'blue');
  assert.deepEqual(reloaded.journal.decorations, ['flag', 'teddy', 'tent']);
  assert.deepEqual(reloaded.journal.gnomes, [0]);
  step('remembers car choices and gnomes after a reload');

  const canvas = await page.locator('#world').boundingBox();
  await page.mouse.move(canvas.width / 2, canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.width / 2 + 200, canvas.height / 2, { steps: 8 });
  const before = (await state(page)).camera;
  await page.waitForTimeout(300);
  await page.mouse.up();
  const swung = (await state(page)).camera;
  assert.ok(Math.hypot(swung[0] - before[0], swung[2] - before[2]) > 0.5, 'dragging swings the camera');
  step('dragging the view swings the camera around the car');

  const world = await state(page);
  assert.equal(world.traffic.length, 4);
  assert.ok(['halt', 'out', 'away', 'in'].includes(world.train.phase));
  assert.equal(world.helicopter.phase, 'parked');
  assert.equal(world.plane.phase, 'parked');
  assert.ok(world.calls < 200, `draw calls stay low (${world.calls})`);
  step('other travellers are on the road, the train, helicopter and plane are about; draw calls stay low');

  await page.evaluate(() => window.__game.teleport(560, 160, -1.57));
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(500);
  assert.equal((await state(page)).plane.phase, 'starting');
  step('a honk beside the plane at the airfield starts it up');

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Car' }).click();
  await page.getByRole('button', { name: 'Oliver' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.evaluate(() => window.__game.teleport(540, 120, -1.57));
  assert.equal((await state(page)).trailer.swing, 0);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  const { swing } = (await state(page)).trailer;
  assert.ok(swing < -0.05 && swing > -1.06, `the trailer swings out on the bend (${swing.toFixed(2)})`);
  step('the lorry pulls its trailer round a bend');

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Back to the start' }).click();
  const home = await state(page);
  // Having stayed the night, the start is the camp.
  const camp = await page.evaluate(async () => (await import('/src/world/layout.js')).CAMP);
  assert.equal(home.mode, 'driving');
  assert.ok(Math.hypot(home.car.x - camp.x, home.car.z - camp.z) < 1, 'back at the start');
  step('the home button in the menu takes the car back to the start');

  console.log('Phone');
  const phone = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.getByRole('button', { name: 'Play' }).tap();
  assert.ok(await phone.getByRole('button', { name: 'Drive', exact: true }).isVisible());
  const gas = await phone.getByRole('button', { name: 'Drive', exact: true }).boundingBox();
  const cdp = await phone.context().newCDPSession(phone);
  const touch = { x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
  await phone.waitForTimeout(1200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await state(phone)).car.distance > 2);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  step('drives with the touch pedals and fits the screen');

  await phone.getByRole('button', { name: 'Pause' }).tap();
  await phone.getByRole('switch', { name: 'Cruise control' }).tap();
  await phone.getByRole('button', { name: 'Resume' }).tap();
  assert.equal(await phone.getByRole('button', { name: 'Drive', exact: true }).isVisible(), false);
  assert.ok(await phone.getByRole('button', { name: 'Brake and reverse' }).isVisible());
  step('with cruise control on, only the brake and reverse pedal shows');

  assert.deepEqual(errors, []);
  step('no errors in the console');
} finally {
  await browser.close();
  await server.close();
}
