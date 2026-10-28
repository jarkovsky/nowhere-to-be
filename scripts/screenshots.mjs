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
  await page.waitForFunction(() => !document.getElementById('play').disabled);
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

  // The plane taking off from the airfield. It has to be parked to hear the horn, so this
  // comes before its first flight of the day.
  await inGame(page, `g.teleport(560, 160, -1.57);`);
  await page.keyboard.press('KeyH');
  await inGame(page, `g.teleport(540, 236, -0.6);`);
  await page.waitForFunction(
    () => {
      const { plane } = window.__game.getState();
      return plane.phase === 'rolling' && plane.speed > 19;
    },
    null,
    { timeout: 90000 },
  );
  await inGame(
    page,
    `
    const plane = g.getState().plane;
    g.shot([plane.x - 30, plane.y + 6, plane.z - 20], [plane.x, plane.y + 1.5, plane.z - 2]);
  `,
  );
  await capture(page, 'airfield', 150);
  await inGame(page, `g.followCar();`);

  await inGame(
    page,
    `
    const { path, asphalt, gravel } = L.ROADWORKS;
    const car = path.at(asphalt - 6);
    g.teleport(car.x, car.z, Math.atan2(-car.dx, -car.dz));
    const eye = path.offset(asphalt - 22, 3);
    const at = path.offset(gravel + 10, -1);
    g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 6, eye.z], [at.x, T.terrainHeight(at.x, at.z) + 1, at.z]);
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

  // The combine cutting the wheat, seen from the end of the field.
  await inGame(
    page,
    `
    const combine = g.getState().fields.find(f => f.kind === 'combine');
    const cos = Math.cos(L.FIELDS.rotation);
    const sin = Math.sin(L.FIELDS.rotation);
    const dx = combine.x - L.FIELDS.x;
    const dz = combine.z - L.FIELDS.z;
    const lx = dx * cos - dz * sin;
    const car = L.fieldPoint(lx - 6, -84);
    const toField = L.fieldPoint(lx - 6, -70);
    g.teleport(car.x, car.z, Math.atan2(-(toField.x - car.x), -(toField.z - car.z)));
    const eye = L.fieldPoint(lx - 6, -72);
    const h = T.terrainHeight(combine.x, combine.z);
    g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 8, eye.z], [combine.x, h + 1, combine.z]);
  `,
  );
  await capture(page, 'combine', 2000);

  // Wading through the deep ford in the hollow, with the bow wave and the wake.
  await inGame(
    page,
    `
    g.followCar();
    const { x, z, dx, dz } = L.OXBOW.ford;
    g.teleport(x - dx * 10, z - dz * 10, Math.atan2(-dx, -dz));
  `,
  );
  await page.keyboard.down('ArrowUp');
  await capture(page, 'ford', 2600);
  await page.keyboard.up('ArrowUp');

  // The depot by the trail, with an arrow over each car that would come along.
  await inGame(page, `g.toDepot(0, 17);`);
  await capture(page, 'depot', 2000);

  // Stuck in the mud hole below the farm, with the tractor pulling the car out.
  await inGame(
    page,
    `
    const lane = L.TRACKS.find(t => t.id === 'lane').path;
    const p = lane.at(lane.length - 14);
    g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
  `,
  );
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__game.getState().mudHole.phase === 'stuck', null, { timeout: 20000 });
  await page.keyboard.up('ArrowUp');
  await page.waitForFunction(() => window.__game.getState().mudHole.phase === 'towed', null, { timeout: 60000 });
  await capture(page, 'tow', 1200);
  // Once let go, the car is free to be moved on.
  await page.waitForFunction(() => window.__game.getState().mudHole.phase === 'free', null, { timeout: 60000 });

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

  // A police car and the army off-roader on the upland road.
  for (const kind of ['police', 'army']) {
    await inGame(
      page,
      `
      g.followCar();
      const p = L.RING_ROAD.offset(${kind === 'police' ? 1250 : 2500}, 8);
      g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
      g.callOut('${kind}');
    `,
    );
    await page.waitForFunction(
      () => {
        const { visitors, car } = window.__game.getState();
        const v = visitors[1];
        return v && Math.hypot(v.x - car.x, v.z - car.z) < 46;
      },
      null,
      { timeout: 60000 },
    );
    await inGame(
      page,
      `
      const v = g.getState().visitors[1];
      const eye = L.RING_ROAD.offset(v.s + v.direction * 30, -v.direction * 7.5);
      const ground = T.terrainHeight(v.x, v.z);
      g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 2.6, eye.z], [v.x, ground + 1.2, v.z]);
    `,
    );
    await capture(page, kind, 350);
  }
  await inGame(page, `g.followCar();`);

  // The rock arch, with the causeway along the fin up onto its top.
  await inGame(
    page,
    `
    const G = L.ROCK_GATE;
    const car = L.OUTER_ROAD.at(G.s - 18);
    g.teleport(car.x, car.z, Math.atan2(-car.dx, -car.dz));
    const ground = T.terrainHeight(G.x, G.z);
    const eye = { x: G.x - G.dx * 55 - G.dz * 30, z: G.z - G.dz * 55 + G.dx * 30 };
    g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 14, eye.z], [G.x + 15, ground + 16, G.z]);
  `,
  );
  await capture(page, 'arch', 2500);

  // The oasis in the desert, at the end of the track through the canyon.
  await inGame(
    page,
    `
    const track = L.TRACKS.find(t => t.id === 'desert').path;
    const car = track.at(track.length - 22);
    g.teleport(car.x, car.z, Math.atan2(-car.dx, -car.dz));
    const { oasis } = L.DESERT;
    const eye = { x: car.x + 17, z: car.z + 13 };
    g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 4.5, eye.z], [oasis.x - 2, T.terrainHeight(oasis.x, oasis.z) + 1.5, oasis.z + 2]);
  `,
  );
  await capture(page, 'desert', 2500);

  // The snowy log crossing over the river in the winter, in the north-east.
  await inGame(
    page,
    `
    g.followCar();
    g.setSky('day');
    const b = L.BRIDGES.find(b => b.style === 'log');
    g.teleport(b.x - b.dx * 16, b.z - b.dz * 16, Math.atan2(-b.dx, -b.dz));
  `,
  );
  // Long enough for the rain to clear and the light to settle into day.
  await page.waitForTimeout(6000);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowUp');
  await capture(page, 'winter', 3500);

  // The old plane lying in its meadow, from the end of its track.
  await inGame(
    page,
    `
    const t = L.TRACKS.find(t => t.id === 'crash').path;
    const p = t.at(t.length - 10);
    g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
    // From 16 m short of the plane on the way in, a little to one side, so the plane fills the frame.
    const { x, z } = L.CRASH;
    const [ax, az] = [(p.x - x) / Math.hypot(p.x - x, p.z - z), (p.z - z) / Math.hypot(p.x - x, p.z - z)];
    const eye = { x: x + ax * 16 - az * 6, z: z + az * 16 + ax * 6 };
    const y = T.terrainHeight(x, z);
    g.shot([eye.x, T.terrainHeight(eye.x, eye.z) + 2.4, eye.z], [x, y + 1, z]);
  `,
  );
  await capture(page, 'crash', 3000);
  await inGame(page, `g.followCar();`);

  // Climbing the rough trail over the ridge.
  await inGame(
    page,
    `
    const p = L.ROUGH.path.at(150);
    g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz));
  `,
  );
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  await capture(page, 'rough', 2500);

  // The cairn and the bench at the top, looking out over the outlands the way the bench faces.
  await inGame(
    page,
    `
    const { x, z, view } = L.ROUGH.lookout;
    const [dx, dz] = [Math.sin(view), Math.cos(view)];
    // Parked beside the cairn, facing out the way the bench does, seen from behind and to one side.
    g.teleport(x + dz * 3 + dx * 0.5, z - dx * 3 + dz * 0.5, view + Math.PI);
    const y = T.terrainHeight(x, z);
    g.shot([x - dx * 11 + dz * 7, y + 3.6, z - dz * 11 - dx * 7], [x + dx * 10, y - 1, z + dz * 10]);
  `,
  );
  await capture(page, 'lookout', 2500);
  await inGame(page, `g.followCar();`);
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
    const p = track.at(track.length - 22);
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
  // The sky eases into day while driving, not while paused in the garage.
  await inGame(page, `g.setSky('day');`);
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: 'Pause' }).click();
  await capture(page, 'menu', 600);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.waitForFunction(() => window.__game.getState().map.ready, null, { timeout: 30000 });
  await capture(page, 'map', 800);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Car' }).click();
  await page.getByRole('button', { name: 'Flag' }).click();
  await page.getByRole('button', { name: 'Teddy' }).click();
  await page.getByRole('button', { name: 'Roof tent' }).click();
  await page.waitForFunction(() => document.getElementById('toast').hidden, null, { timeout: 30000 });
  await capture(page, 'garage', 2500);

  // The lorry on the upland road, and the rally car on the summit track.
  for (const item of ['Flag', 'Teddy', 'Roof tent']) await page.getByRole('button', { name: item }).click();
  for (const [name, shot, setup] of [
    [
      'Lorry',
      'lorry',
      `const p = L.RING_ROAD.offset(1000, 2.2);
      const heading = Math.atan2(-p.dx, -p.dz);
      g.teleport(p.x, p.z, heading);
      const f = { x: -Math.sin(heading), z: -Math.cos(heading) };
      const eye = { x: p.x + f.x * 15 - f.z * 7, z: p.z + f.z * 15 + f.x * 7 };
      const y = T.terrainHeight(p.x, p.z);
      g.shot([eye.x, Math.max(y, T.terrainHeight(eye.x, eye.z)) + 2.6, eye.z], [p.x - f.x * 4, y + 2.2, p.z - f.z * 4]);`,
    ],
    [
      'Flatbed with a digger',
      'flatbed',
      `const p = L.RING_ROAD.offset(1400, 2.2);
      const heading = Math.atan2(-p.dx, -p.dz);
      g.teleport(p.x, p.z, heading);
      const f = { x: -Math.sin(heading), z: -Math.cos(heading) };
      const eye = { x: p.x + f.x * 14 + f.z * 7, z: p.z + f.z * 14 - f.x * 7 };
      const y = T.terrainHeight(p.x, p.z);
      g.shot([eye.x, Math.max(y, T.terrainHeight(eye.x, eye.z)) + 2.6, eye.z], [p.x - f.x * 3, y + 2, p.z - f.z * 3]);`,
    ],
    [
      'Expedition truck',
      'expedition',
      `const p = L.ROUGH.path.at(250);
      const heading = Math.atan2(-p.dx, -p.dz);
      g.teleport(p.x, p.z, heading);
      const f = { x: -Math.sin(heading), z: -Math.cos(heading) };
      const eye = { x: p.x + f.x * 9 - f.z * 5, z: p.z + f.z * 9 + f.x * 5 };
      const y = T.terrainHeight(p.x, p.z);
      g.shot([eye.x, Math.max(y, T.terrainHeight(eye.x, eye.z)) + 1.8, eye.z], [p.x, y + 1.6, p.z]);`,
    ],
    [
      'Hyundai',
      'rally',
      `const track = L.TRACKS.find(t => t.id === 'summit').path;
      const p = track.at(track.length * 0.45);
      const heading = Math.atan2(-p.dx, -p.dz);
      g.teleport(p.x, p.z, heading);
      const f = { x: -Math.sin(heading), z: -Math.cos(heading) };
      const eye = { x: p.x + f.x * 6 + f.z * 3, z: p.z + f.z * 6 - f.x * 3 };
      const y = T.terrainHeight(p.x, p.z);
      g.shot([eye.x, Math.max(y, T.terrainHeight(eye.x, eye.z)) + 1.3, eye.z], [p.x, y + 0.8, p.z]);`,
    ],
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Resume' }).click();
    await inGame(page, setup);
    await capture(page, shot, 2500);
    await inGame(page, `g.followCar();`);
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Car' }).click();
  }

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
