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

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.waitForFunction(() => window.__game.getState().map.ready);
  const { map, car } = await state(page);
  assert.ok(Math.hypot(map.camera.x - car.x, map.camera.z - car.z) < 1, 'the map opens on the car');
  assert.ok(map.shown > 10, `the places are marked (${map.shown})`);
  await page.keyboard.press('Escape');
  assert.ok(await page.getByRole('button', { name: 'Map', exact: true }).isVisible(), 'Escape goes back to the menu');
  await page.getByRole('switch', { name: 'Minimap' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  assert.ok(await page.getByRole('button', { name: 'Open the map' }).isVisible());
  assert.equal((await state(page)).journal.minimap, true);
  step('opens the map on the car from the menu, goes back with Escape, and shows the minimap');

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
  // Every vehicle takes the paint, the lorry with its trailer too.
  await page.getByRole('button', { name: 'Lorry' }).click();
  assert.equal((await state(page)).journal.vehicle, 'lorry');
  assert.ok((await state(page)).trailer, 'the lorry has its trailer');
  // The roadster has no roof for the tent, which it carries packed instead.
  await page.getByRole('button', { name: 'Miata', exact: true }).click();
  assert.equal((await state(page)).journal.vehicle, 'miata');
  assert.ok(await page.locator('#color-options').isVisible());
  // The flatbed carries its digger and leaves the depot with one lorry fewer; the expedition truck is a vehicle of its own.
  await page.getByRole('button', { name: 'Flatbed with a digger' }).click();
  assert.equal((await state(page)).journal.vehicle, 'flatbed');
  assert.ok(!(await state(page)).friends.some(friend => friend.vehicle === 'flatbed'), 'only one flatbed at a time');
  await page.getByRole('button', { name: 'Expedition truck' }).click();
  assert.equal((await state(page)).journal.vehicle, 'expedition');
  assert.equal((await state(page)).friends.filter(friend => friend.vehicle === 'flatbed').length, 1);
  await page.getByRole('button', { name: 'Tractor' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).cameraMode, 'chase');
  step('shows the car in the garage with a flag, a teddy and the roof tent, which opens and stays open');

  // A faster cruise speed lasts for the visit and is not kept: a reload starts at 6 m/s again.
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Cruise speed: slow' }).click();
  await page.getByRole('button', { name: 'Cruise speed: medium' }).click();
  assert.equal((await state(page)).input.cruiseSpeed, 12);
  await page.getByRole('button', { name: 'Resume' }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Play' }).click();
  assert.equal((await state(page)).input.cruiseSpeed, 6);
  const reloaded = await state(page);
  assert.equal(reloaded.journal.color, 'blue');
  assert.deepEqual(reloaded.journal.decorations, ['flag', 'teddy', 'tent']);
  assert.equal(reloaded.journal.vehicle, 'offroader', 'the game always starts in the off-roader');
  step('remembers the colour and roof items after a reload, and starts in the off-roader');

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
  await page.getByRole('button', { name: 'Lorry' }).click();
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

  // Into the oxbow at the ford and out the other side, with the throttle held all the way.
  await page.evaluate(async () => {
    const { OXBOW, TRACKS } = await import('/src/world/layout.js');
    const track = TRACKS.find(t => t.id === 'oxbow').path;
    const p = track.at(track.nearest(OXBOW.ford.x, OXBOW.ford.z).s - 12);
    window.__game.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
  });
  const wading = [];
  await page.keyboard.down('ArrowUp');
  for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(350);
    wading.push(
      await page.evaluate(async () => {
        const { OXBOW } = await import('/src/world/layout.js');
        const { waterDepth, waterLevel } = await import('/src/world/terrain.js');
        const { car, carHeight, camera } = window.__game.getState();
        const { x, z, dx, dz } = OXBOW.ford;
        return {
          across: (car.x - x) * dx + (car.z - z) * dz,
          depth: waterDepth(car.x, car.z),
          speed: car.speed,
          sunk: waterLevel(car.x, car.z) - carHeight,
          camera: camera[1] - waterLevel(camera[0], camera[2]),
        };
      }),
    );
  }
  await page.keyboard.up('ArrowUp');
  const deep = wading.filter(w => w.depth > 0.4);
  assert.ok(deep.length > 1, 'it went through deep water');
  assert.ok(Math.max(...deep.map(w => w.sunk)) > 0.4, 'the lorry sank into it');
  assert.ok(Math.min(...deep.map(w => w.speed)) > 1, 'it never stopped in the water');
  assert.ok(Math.min(...deep.map(w => w.speed)) < 3.5, 'it slowed to a crawl');
  assert.ok(wading.at(-1).across > 10, `it came out the other side (${wading.at(-1).across.toFixed(1)} m)`);
  assert.ok(Math.min(...wading.map(w => w.camera)) > 1, 'the camera stayed above the water');
  step('the lorry crawls through the deep ford, sinking into it, and comes out the other side');

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Back to the start' }).click();
  const home = await state(page);
  // Having stayed the night, the start is the camp.
  const camp = await page.evaluate(async () => (await import('/src/world/layout.js')).CAMP);
  assert.equal(home.mode, 'driving');
  assert.ok(Math.hypot(home.car.x - camp.x, home.car.z - camp.z) < 1, 'back at the start');
  step('the home button in the menu takes the car back to the start');

  // Down the quay onto the ferry on cruise, lorry, trailer and all: it takes them out with it.
  await page.evaluate(async () => {
    const { FERRY_QUAY: quay } = await import('/src/world/layout.js');
    window.__game.dockFerry();
    const back = -8;
    window.__game.teleport(
      quay.x + Math.sin(quay.rotation) * back,
      quay.z + Math.cos(quay.rotation) * back,
      quay.dock.heading,
    );
  });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__game.getState().ferry.carrying, null, { timeout: 20000 });
  const taken = await state(page);
  await page.waitForTimeout(6000);
  const sailing = await state(page);
  assert.equal(sailing.ferry.phase, 'sailing');
  assert.ok(sailing.ferry.carrying);
  assert.ok(Math.hypot(sailing.car.x - taken.car.x, sailing.car.z - taken.car.z) > 3, 'carried out with the ferry');
  await page.keyboard.press('KeyE');
  step('drives aboard the ferry at the fjord and is taken out with it');

  await page.evaluate(() => window.__game.toDepot(-5, 15));
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  const asked = (await state(page)).friends.filter(friend => friend.mode === 'following');
  assert.equal(asked.length, 1);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowDown');
  const along = (await state(page)).friends.find(friend => friend.bay === asked[0].bay);
  assert.ok(Math.hypot(along.x - asked[0].x, along.z - asked[0].z) > 1, 'it pulls out after the car');
  step('F by the depot asks the nearest friend along, and it follows');

  await page.evaluate(() => window.__game.toDepot(16, 16));
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  assert.equal((await state(page)).friends.find(friend => friend.vehicle === 'flatbed').mode, 'following');
  step('the flatbed waits on the apron beside the depot and can be asked along');

  console.log('Phone');
  const phone = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.getByRole('button', { name: 'Play' }).tap();
  // Cruise control and tilt steering are on from the start: the car drives itself, and only
  // the pedal for braking and reversing shows.
  assert.equal(await phone.getByRole('button', { name: 'Drive', exact: true }).isVisible(), false);
  assert.ok(await phone.getByRole('button', { name: 'Brake and reverse' }).isVisible());
  assert.notEqual((await state(phone)).tilt.status, 'off');
  // The car waits while tilt finds its centre. There are no motion sensors here, so tilt gives
  // up after a few seconds, and then the car drives off by itself.
  await phone.waitForFunction(
    () => {
      const { pending, enabled, ready } = window.__game.getState().tilt;
      return !pending && (!enabled || ready);
    },
    null,
    { timeout: 10000 },
  );
  const start = (await state(phone)).car.distance;
  await phone.waitForTimeout(1200);
  assert.ok((await state(phone)).car.distance > start + 2, 'it drives off');
  await phone.getByRole('button', { name: 'Pause' }).tap();
  assert.equal(await phone.getByRole('switch', { name: 'Cruise control' }).getAttribute('aria-checked'), 'true');
  step('on a phone, cruise control and tilt steering are on from the start');

  // The speed tile steps cruise through slow, medium, fast and round again, and the car follows at once.
  const speedTile = name => phone.getByRole('button', { name });
  const cruiseSpeedNow = async () => {
    await phone.getByRole('button', { name: 'Resume' }).tap();
    await phone.waitForTimeout(5000);
    const speed = (await state(phone)).car.speed;
    await phone.getByRole('button', { name: 'Pause' }).tap();
    return speed;
  };
  assert.ok(Math.abs((await state(phone)).input.cruiseSpeed - 6) < 1e-9, 'starts at 6 m/s');
  const slow = await cruiseSpeedNow();
  assert.ok(Math.abs(slow - 6) < 0.5, `slow ${slow}`);
  await speedTile('Cruise speed: slow').tap();
  assert.ok(await speedTile('Cruise speed: medium').isVisible());
  await speedTile('Cruise speed: medium').tap();
  const fast = await cruiseSpeedNow();
  assert.ok(fast > 11, `fast ${fast}`);
  await speedTile('Cruise speed: fast').tap();
  assert.ok(await speedTile('Cruise speed: slow').isVisible(), 'and round to slow again');
  step('the speed tile steps cruise through slow, medium and fast, and the car drives faster');

  // Cruise control off, the pedals drive it.
  await phone.getByRole('switch', { name: 'Cruise control' }).tap();
  await phone.getByRole('button', { name: 'Resume' }).tap();
  assert.ok(await phone.getByRole('button', { name: 'Drive', exact: true }).isVisible());
  await phone.waitForTimeout(800);
  const stopped = (await state(phone)).car.distance;
  const gas = await phone.getByRole('button', { name: 'Drive', exact: true }).boundingBox();
  const cdp = await phone.context().newCDPSession(phone);
  const touch = { x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
  await phone.waitForTimeout(1200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await state(phone)).car.distance > stopped + 1);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  step('with cruise control off, drives with the touch pedals, and fits the screen');

  await phone.evaluate(() => window.__game.toDepot(-3, 14));
  await phone.waitForTimeout(600);
  const target = await phone.evaluate(() => {
    const { friends, carHeight } = window.__game.getState();
    const friend = friends.find(f => f.bay === 1);
    const camera = window.__game.debug.camera;
    const p = new camera.position.constructor(friend.x, carHeight + 1.2, friend.z).project(camera);
    return { bay: friend.bay, x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  });
  await phone.touchscreen.tap(target.x, target.y);
  await phone.waitForTimeout(300);
  // Two lorries wait there, so the bay tells them apart.
  const tapped = (await state(phone)).friends.find(friend => friend.bay === target.bay);
  assert.equal(tapped.mode, 'following');
  step('a tap on a friend at the depot asks it along');

  assert.deepEqual(errors, []);
  step('no errors in the console');
} finally {
  await browser.close();
  await server.close();
}
