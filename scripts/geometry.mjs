// Records the faults the geometry checks find in each landmark and model, as the baseline the
// tests hold the world to (tests/geometry-baseline.json): each one by its kind and where it is,
// with the reason it is allowed. Reasons already written for faults still there are kept. Run
// it after fixing faults, so they come out of the list and can't come back unnoticed.
import { readFile, writeFile } from 'node:fs/promises';
import '../tests/dom.js';
import { checkEverything, findingKey } from '../src/dev/checks.js';

const FILE = 'tests/geometry-baseline.json';
const old = JSON.parse(await readFile(FILE, 'utf8').catch(() => '{}'));
const baseline = {};
let total = 0;
let unexplained = 0;
for (const [id, issues] of Object.entries(checkEverything())) {
  if (!issues.length) continue;
  baseline[id] = {};
  for (const issue of issues) {
    const key = findingKey(issue);
    // Keep the reason if it was given before; a new one starts with what was found.
    const reason = typeof old[id]?.[key] === 'string' ? old[id][key] : '';
    baseline[id][key] = reason;
    total++;
    if (!reason) {
      unexplained++;
      console.log(`${id}: ${issue.kind} ${issue.message}`);
    }
  }
}
await writeFile(FILE, JSON.stringify(baseline, null, 2) + '\n');
console.log(`${total} faults in ${Object.keys(baseline).length} landmarks and models, ${unexplained} without a reason`);
