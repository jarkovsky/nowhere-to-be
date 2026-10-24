// Takes pictures of everything in the object viewer from a few sides, with the problems the
// geometry checks find, into artifacts/catalogue/ (open index.html there to look through them).
// `npm run catalogue -- hangar lorry` only takes the entries whose id contains one of the words.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { startServer } from './server.mjs';

const OUT = 'artifacts/catalogue';
const words = process.argv.slice(2);
const VIEWS = {
  model: [
    [2.4, 0.3],
    [-0.75, 0.3],
    [Math.PI / 2, 0.08],
    [3.6, 1.0],
  ],
  place: [
    [2.4, 0.45],
    [-0.75, 0.6],
  ],
};

const server = await startServer();
const browser = await chromium.launch({ channel: 'chrome' });
await mkdir(OUT, { recursive: true });
const rows = [];
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', error => console.log('  error:', error.message));
  await page.goto(`${server.url}viewer.html`);
  await page.waitForFunction(() => window.__viewer?.ready, null, { timeout: 120000 });
  // Just the picture: no list, no toolbar, no notes.
  await page.addStyleTag({ content: '.panel, .toolbar, .info, .toggle-panel { display: none !important; }' });
  const entries = (await page.evaluate(() => window.__viewer.entries())).filter(
    entry => !words.length || words.some(word => entry.id.includes(word)),
  );
  for (const entry of entries) {
    await page.evaluate(id => window.__viewer.select(id), entry.id);
    const problems = await page.evaluate(() => window.__viewer.problems());
    const pictures = [];
    for (const [n, [yaw, pitch]] of VIEWS[entry.kind].entries()) {
      await page.evaluate(view => window.__viewer.frame(view), { yaw, pitch });
      await page.waitForTimeout(entry.kind === 'place' ? 500 : 150);
      const file = `${entry.id}-${n}.png`;
      await page.screenshot({ path: `${OUT}/${file}` });
      pictures.push(file);
    }
    rows.push({ ...entry, problems, pictures });
    console.log(`${entry.id}: ${problems.length} problem(s)`);
  }
} finally {
  await browser.close();
  await server.close();
}

await writeFile(`${OUT}/problems.json`, JSON.stringify(rows, null, 1));

const escape = text => text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
await writeFile(
  `${OUT}/index.html`,
  `<!doctype html><meta charset="utf-8"><title>Catalogue</title>
<style>body{font:14px system-ui;margin:20px;background:#f4f2ea}section{margin:0 0 28px}img{width:24%;margin-right:.5%}
h2{font-size:16px;margin:0 0 6px}li{color:#a02050}</style>
${rows
  .map(
    row => `<section><h2>${escape(row.name)} <small>${row.id}</small></h2>
${row.pictures.map(file => `<img src="${file}" loading="lazy">`).join('')}
<ul>${row.problems.map(p => `<li><b>${p.kind}</b> ${escape(p.message)}</li>`).join('')}</ul></section>`,
  )
  .join('\n')}`,
);
console.log(`\n${rows.length} entries, ${rows.reduce((n, r) => n + r.problems.length, 0)} problems: ${OUT}/index.html`);
