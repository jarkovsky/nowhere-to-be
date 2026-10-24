// Runs the geometry checks on a few things and says what they find: `npm run check -- hut lorry`
// checks every landmark, model and place in the object viewer whose id contains one of the
// words (a place, like fjord.church, only near it). Each fault is marked new, or known with the
// reason the baseline gives. Exits with 1 if anything new turns up. With no words, it checks
// everything and lists only the new faults.
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import '../tests/dom.js';
import { checkLandmark, checkModel, findingKey } from '../src/dev/checks.js';
import { LANDMARKS } from '../src/dev/landmarks.js';
import { MODELS } from '../src/dev/models.js';
import { PLACES } from '../src/dev/places.js';

const baseline = JSON.parse(await readFile('tests/geometry-baseline.json', 'utf8'));
const words = process.argv.slice(2);
const wanted = id => !words.length || words.some(word => id.includes(word));

const entries = [
  ...Object.keys(LANDMARKS).map(name => ({ id: `landmark.${name}`, name, check: () => checkLandmark(name) })),
  ...MODELS.map(model => ({ id: `model.${model.id}`, name: model.name, check: () => checkModel(model) })),
];
// A place is part of a landmark: its faults are those of the landmark that lie near it.
if (words.length) {
  for (const place of PLACES) {
    if (!wanted(`place.${place.id}`) || entries.some(entry => entry.id === `landmark.${place.id}`)) continue;
    entries.push({
      id: `landmark.${place.landmark}`,
      name: place.name,
      label: `place.${place.id}`,
      check: () =>
        checkLandmark(place.landmark).filter(issue => {
          const middle = issue.box.getCenter(new THREE.Vector3());
          const half = issue.box.getSize(new THREE.Vector3()).length() / 2;
          return Math.hypot(middle.x - place.x, middle.z - place.z) < place.radius + half;
        }),
    });
  }
}

let fresh = 0;
let shown = 0;
for (const entry of entries) {
  if (!entry.label && !wanted(entry.id)) continue;
  const issues = entry.check();
  const known = baseline[entry.id] ?? {};
  const lines = issues
    .map(issue => {
      const key = findingKey(issue);
      const isNew = !(key in known);
      if (isNew) fresh++;
      const note = isNew ? 'NEW' : `known${known[key] ? `: ${known[key]}` : ''}`;
      return { isNew, text: `  ${issue.kind.padEnd(10)} ${issue.message} [${note}]` };
    })
    .filter(line => words.length || line.isNew);
  if (!words.length && !lines.length) continue;
  shown++;
  console.log(
    `${entry.label ?? entry.id} (${entry.name}): ${issues.length ? `${issues.length} fault(s)` : 'no faults'}`,
  );
  for (const line of lines) console.log(line.text);
}
if (!shown) console.log(words.length ? `Nothing matches ${words.join(', ')}.` : 'No new faults.');
if (fresh) {
  console.log(
    `\n${fresh} new fault(s). Look at them in the object viewer (npm run dev, then /viewer.html); once fixed, or if they really are fine, npm run geometry records the new list.`,
  );
}
process.exit(fresh ? 1 : 0);
