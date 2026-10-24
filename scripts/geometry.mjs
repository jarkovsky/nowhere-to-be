// Records how many faults the geometry checks find in each landmark and model, as the
// baseline the tests hold the world to (tests/geometry-baseline.json). Run it after fixing
// faults, so they can't come back unnoticed.
import { writeFile } from 'node:fs/promises';
import '../tests/dom.js';
import { checkEverything } from '../src/dev/checks.js';

const results = checkEverything();
const found = Object.entries(results).filter(([, counts]) => Object.keys(counts).length);
await writeFile('tests/geometry-baseline.json', JSON.stringify(Object.fromEntries(found), null, 2) + '\n');
const total = found.reduce((n, [, counts]) => n + Object.values(counts).reduce((a, b) => a + b, 0), 0);
console.log(`${total} faults in ${found.length} of ${Object.keys(results).length} landmarks and models`);
