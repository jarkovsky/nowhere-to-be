// Regenerates the screenshots used in the README: `npm run screenshots`.
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { startServer } from './server.mjs';

const OUT = 'docs';
const server = await startServer();
const browser = await chromium.launch({ channel: 'chrome' });
await mkdir(OUT, { recursive: true });

/** Runs code in the page with the layout module available as `L`. */
const inGame = (page, body) =>
  page.evaluate(`(async () => {
  const L = await import('/src/world/layout.js');
  const T = await import('/src/world/terrain.js');
  const g = window.__game;
  ${body}
})()`);

async function capture(page, name, settle = 1500) {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 86 });
  console.log(`  ${OUT}/${name}.jpg`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Play' }).waitFor();
  await capture(page, 'title', 2500);

  await page.getByRole('button', { name: 'Play' }).click();
  // The railbus waits at the halt for a few seconds after the game starts.
  await inGame(
    page,
    `
    const car = L.RAILWAY.offset(44, -6);
    g.teleport(car.x, car.z, Math.atan2(car.dx, car.dz));
    const eye = L.RAILWAY.offset(44, -14);
    const at = L.RAILWAY.offset(16, 0);
    g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 4, eye.z], [at.x, T.terrainHeight(at.x, at.z) + 1.5, at.z]);
  `,
  );
  await capture(page, 'railway', 1500);

  await inGame(
    page,
    `
    const { path, asphalt, gravel } = L.ROADWORKS;
    const car = path.at(asphalt - 6);
    g.teleport(car.x, car.z, Math.atan2(-car.dx, -car.dz));
    const eye = path.offset(asphalt - 16, -5);
    const at = path.offset(gravel + 4, 1);
    g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 4.5, eye.z], [at.x, T.terrainHeight(at.x, at.z) + 1, at.z]);
  `,
  );
  await capture(page, 'roadworks', 3000);

  // Parked below the lookout tower on the snowy summit.
  await inGame(
    page,
    `
    const track = L.TRACKS.find(t => t.id === 'summit').path;
    const p = track.at(track.length - 2);
    const toTower = Math.atan2(L.SUMMIT.x - p.x, L.SUMMIT.z - p.z);
    g.teleport(p.x, p.z, toTower + Math.PI);
    const eye = { x: p.x - Math.sin(toTower) * 13 + Math.cos(toTower) * 6, z: p.z - Math.cos(toTower) * 13 - Math.sin(toTower) * 6 };
    const top = T.terrainHeight(L.SUMMIT.x, L.SUMMIT.z);
    g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 3, eye.z], [L.SUMMIT.x, top + 6, L.SUMMIT.z]);
  `,
  );
  await capture(page, 'summit', 2000);

  // The upland farm: the plough at work with gulls behind it, seen from the track between the fields.
  await inGame(
    page,
    `
    const p = L.fieldPoint(1, 30);
    const ahead = L.fieldPoint(1, 40);
    g.teleport(p.x, p.z, Math.atan2(-(ahead.x - p.x), -(ahead.z - p.z)));
    const [plough] = g.getState().fields;
    const eye = L.fieldPoint(-20, -48);
    g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 16, eye.z], [plough.x, T.terrainHeight(plough.x, plough.z) - 2, plough.z]);
  `,
  );
  await capture(page, 'fields', 2000);

  // The wolf pack on the slopes below the summit.
  await inGame(
    page,
    `
    const wolves = g.getState().wildlife.wolves;
    const p = L.WOLF_ROUTE.at(wolves.s);
    g.teleport(p.x - p.dz * 24, p.z + p.dx * 24, 0);
    const near = L.WOLF_ROUTE.at(wolves.s - 3);
    const h = T.terrainHeight(near.x, near.z);
    g.shot([near.x - near.dz * 9 + near.dx * 5, h + 2.2, near.z + near.dx * 9 + near.dz * 5], [near.x, h + 0.8, near.z]);
  `,
  );
  await capture(page, 'wolves', 1800);

  // An ambulance coming along the trail, with the others pulled over.
  await inGame(
    page,
    `
    g.followCar();
    const p = L.ROAD.offset(L.ROAD.length * 0.2, 8);
    g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
    g.callOut();
  `,
  );
  await page.waitForFunction(
    () => {
      const { emergency, car } = window.__game.getState();
      return emergency && Math.hypot(emergency.x - car.x, emergency.z - car.z) < 42;
    },
    null,
    { timeout: 60000 },
  );
  await inGame(
    page,
    `
    // From the verge a little way ahead of it.
    const { emergency } = g.getState();
    const eye = L.ROAD.offset(emergency.s + emergency.direction * 34, -emergency.direction * 7.5);
    const ground = T.terrainHeight(emergency.x, emergency.z);
    g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 3, eye.z], [emergency.x, ground + 1.4, emergency.z]);
  `,
  );
  await capture(page, 'ambulance', 350);
  await inGame(page, `g.followCar();`);

  await inGame(
    page,
    `
    const p = L.ROAD.at(L.BRIDGE.s - 20);
    g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
    g.setSky('sunset');
  `,
  );
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowUp');
  await capture(page, 'bridge', 4000);

  await inGame(
    page,
    `
    g.setSky('day');
    const p = L.ROAD.at(L.TUNNEL.s - L.TUNNEL.length / 2 - 34);
    g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
  `,
  );
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowUp');
  await capture(page, 'tunnel', 3500);

  // Up the farm track towards the barn.
  await inGame(
    page,
    `
    const track = L.TRACKS.find(t => t.id === 'farm').path;
    const p = track.at(track.length - 30);
    g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
  `,
  );
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowUp');
  await capture(page, 'farm', 3500);

  // Round the last hairpin to the hut.
  await inGame(
    page,
    `
    const track = L.TRACKS.find(t => t.id === 'chata').path;
    const p = track.at(track.length - 34);
    g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
  `,
  );
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowUp');
  await capture(page, 'hut', 3500);

  // Out along the jetty.
  await inGame(page, `g.teleport(L.JETTY.x, L.JETTY.z + 6, L.JETTY.heading);`);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1800);
  await page.keyboard.up('ArrowUp');
  await capture(page, 'jetty', 2500);

  await inGame(page, `g.teleport(L.CAMP.x, L.CAMP.z, L.CAMP.heading);`);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Stay the night/ }).click();
  await capture(page, 'camp', 5000);

  await page.getByRole('button', { name: 'Wake up' }).click();
  // Visit a few more places so the scrapbook has something in it.
  for (const place of ['waterfall', 'lookout', 'jetty', 'tower']) {
    await inGame(page, `const p = L.PLACES.find(p => p.id === '${place}'); g.teleport(p.x, p.z, 0);`);
    await page.waitForTimeout(400);
  }
  await inGame(page, `const d = L.HABITATS.deer.start; g.teleport(d.x + 8, d.z + 8, 0);`);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: /Scrapbook/ }).click();
  await capture(page, 'scrapbook', 800);

  await page.getByRole('button', { name: 'Back to menu' }).click();
  await page.getByRole('button', { name: /^Car/ }).click();
  await page.getByRole('button', { name: 'Flag' }).click();
  await page.getByRole('button', { name: 'Teddy' }).click();
  await page.getByRole('button', { name: 'Roof tent' }).click();
  await page.waitForFunction(() => document.getElementById('toast').hidden, null, { timeout: 30000 });
  await capture(page, 'garage', 2500);

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await phone.newPage();
  await mobile.goto(server.url);
  await mobile.getByRole('button', { name: 'Play' }).tap();
  await inGame(
    mobile,
    `
    const p = L.ROAD.at(L.BRIDGE.s + 40);
    g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
  `,
  );
  await mobile.waitForTimeout(2500);
  await mobile.screenshot({ path: `${OUT}/phone.jpg`, type: 'jpeg', quality: 86 });
  console.log(`  ${OUT}/phone.jpg`);
} finally {
  await browser.close();
  await server.close();
}
