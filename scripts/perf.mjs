// How long the game takes to start, and what a frame costs at a few places around the map:
// `npm run perf`, or `npm run perf -- --phone` for a phone-sized screen with the processor
// slowed down four times. It starts its own dev server. Frames aren't capped at 60 here,
// so the frame rate shows how much room there is; "script" is the time spent each frame
// in the game and in preparing the drawing, and "calls" and "triangles" are for the view
// (not the shadows).
import { chromium } from '@playwright/test';
import { startServer } from './server.mjs';

const phone = process.argv.includes('--phone');
const PLACES = [
  ['start', ''],
  ['lake', 'g.teleport(60, 30, 0.6)'],
  ['farm', 'g.teleport(-60, 40, 2.6)'],
  ['summit', 'g.teleport(-300, -300, 2.6)'],
  ['upland farm', 'g.teleport(244, 298, -2.3)'],
  ['airfield', 'g.teleport(560, 200, -0.8)'],
  ['upland road', 'const p = L.RING_ROAD.at(1200); g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz))'],
  ['tunnel', 'const p = L.ROAD.at(L.TUNNEL.s - 40); g.teleport(p.x, p.z, Math.atan2(-p.dx, -p.dz))'],
];

const server = await startServer();
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
try {
  const context = await browser.newContext(
    phone
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  );
  const page = await context.newPage();
  // Time every animation frame callback: that is where the game runs.
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    window.__frames = [];
    window.requestAnimationFrame = callback =>
      request(time => {
        const start = performance.now();
        callback(time);
        window.__frames.push(performance.now() - start);
      });
  });
  if (phone) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.goto(server.url + '?uncapped');
  await page.waitForFunction(() => !document.getElementById('play').disabled, null, { timeout: 120000 });
  const ready = await page.evaluate(() => performance.now());
  const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize);
  console.log(`${phone ? 'Phone, processor slowed down 4 times' : 'Desktop'}`);
  console.log(`Ready to play after ${(ready / 1000).toFixed(1)} s, using ${Math.round(heap / 1e6)} MB of memory\n`);

  await page.getByRole('button', { name: 'Play' }).click();
  // Cruise control keeps the car moving, so the scenery around it changes as it would.
  await page.keyboard.press('KeyE');
  console.log('place          fps   script ms   calls   triangles');
  for (const [name, move] of PLACES) {
    await page.evaluate(`(async () => {
      const L = await import('/src/world/layout.js');
      const g = window.__game;
      ${move}
    })()`);
    await page.waitForTimeout(1000);
    const result = await page.evaluate(
      () =>
        new Promise(resolve => {
          window.__frames.length = 0;
          const start = performance.now();
          setTimeout(() => {
            const frames = [...window.__frames];
            const seconds = (performance.now() - start) / 1000;
            const { calls, triangles } = window.__game.getState();
            resolve({
              fps: frames.length / seconds,
              script: frames.reduce((a, b) => a + b, 0) / frames.length,
              calls,
              triangles,
            });
          }, 3000);
        }),
    );
    console.log(
      [
        name.padEnd(12),
        result.fps.toFixed(0).padStart(5),
        result.script.toFixed(2).padStart(11),
        String(result.calls).padStart(7),
        `${Math.round(result.triangles / 1000)}k`.padStart(11),
      ].join(' '),
    );
  }
} finally {
  await browser.close();
  await server.close();
}
