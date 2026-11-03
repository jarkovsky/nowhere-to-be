import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { blizzardAt, createAtmosphere, skyConditions } from '../src/world/atmosphere.js';
import { HERDS, LOFOTEN, OUTER_ROAD, WINTER, insideFence, winterness } from '../src/world/layout.js';
import { waterDepth } from '../src/world/terrain.js';
import { KINDS } from '../src/world/herds.js';

function weather() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.FogExp2();
  const sun = new THREE.DirectionalLight();
  const atmosphere = createAtmosphere(scene, sun, new THREE.HemisphereLight());
  const lines = scene.children.find(child => child.isLineSegments && child.geometry.attributes.position.count === 1800);
  const snowfall = scene.children.find(child => child.isPoints && child.geometry.attributes.position.count === 260);
  // The blizzard's flakes drift on the graphics card.
  const blizzard = scene.children.find(child => child.isPoints && child.geometry.attributes.drift);
  return { scene, sun, atmosphere, lines, snowfall, blizzard };
}

/** Runs the atmosphere for `seconds` with the car at a point. */
function settle(w, centre, seconds = 12) {
  for (let t = 0; t < seconds; t += 0.1) w.atmosphere.update(0.1, centre, true);
  return w.atmosphere.getState();
}

const AUTUMN = { x: 0, z: 0 };
const SNOW = { x: WINTER.snowman.x, z: WINTER.snowman.z };
const COAST = { x: LOFOTEN.x, z: LOFOTEN.z };

test('in the snowy places the rain gives way to snow: no streaks and no rain sound, only the usual snowfall', () => {
  assert.ok(winterness(SNOW.x, SNOW.z) > 0.95 && winterness(COAST.x, COAST.z) > 0.9);
  for (const place of [SNOW, COAST]) {
    const w = weather();
    w.atmosphere.setPreset('rain');
    const sky = settle(w, place);
    assert.ok(sky.rain > 0.8, 'it is a rainy sky');
    assert.ok(sky.rainfall < 0.01, 'but no rain falls');
    assert.equal(w.lines.visible, false);
    assert.ok(w.snowfall.visible && w.snowfall.material.opacity > 0.7, 'the snow falls as always');
    assert.equal(w.blizzard.visible, false, 'a rain spell alone is no blizzard');
  }
  const w = weather();
  w.atmosphere.setPreset('rain');
  const sky = settle(w, AUTUMN);
  assert.ok(sky.rainfall > 0.8 && w.lines.visible, 'rain is still rain elsewhere');
  assert.equal(w.snowfall.visible, false);
});

test('the rain fades out and the snow in as the car drives into the snow', () => {
  const w = weather();
  w.atmosphere.setPreset('rain');
  settle(w, AUTUMN);
  const before = w.atmosphere.getState().rainfall;
  w.atmosphere.update(0.1, SNOW, true);
  const after = w.atmosphere.getState().rainfall;
  assert.ok(after < before && after > 0, 'it eases rather than cutting off');
});

test('the usual snowfall is as it was: 260 flakes, opacity 0.8 in deep snow, none outside it', () => {
  const w = weather();
  assert.equal(w.snowfall.geometry.attributes.position.count, 260);
  settle(w, SNOW, 20);
  assert.ok(Math.abs(w.snowfall.material.opacity - 0.8) < 0.001);
  assert.equal(w.snowfall.material.size, 3);
  const dry = weather();
  settle(dry, AUTUMN);
  assert.equal(dry.snowfall.visible, false);
});

test('a blizzard blows only in the snow: dense, whiter and thicker, and the road stays in sight', () => {
  const calm = weather();
  calm.atmosphere.setPreset('day');
  const clear = settle(calm, SNOW, 20);
  const fogBefore = calm.scene.fog.density;
  for (const place of [SNOW, COAST]) {
    const w = weather();
    w.atmosphere.setPreset('blizzard');
    const sky = settle(w, place, 20);
    assert.ok(sky.blizzard > 0.9);
    assert.ok(w.blizzard.visible && w.blizzard.material.opacity > 0.8);
    assert.ok(w.blizzard.geometry.attributes.position.count > 3 * w.snowfall.geometry.attributes.position.count);
    assert.equal(w.lines.visible, false, 'snow, not rain');
    assert.ok(w.scene.fog.density > fogBefore, 'thicker fog');
    // The haze thickens with distance as exp(-1.25 density d) in the valley (see fog_fragment in sky.js), and
    // the road should still show through well over half at 60 m.
    assert.ok(Math.exp(-w.scene.fog.density * 1.25 * 60) > 0.6, 'the road is clear 60 m ahead');
    assert.ok(w.scene.background.r + w.scene.background.g + w.scene.background.b > 1.8, 'a bright haze, never dark');
    assert.ok(w.sun.intensity >= 0.8, 'light enough');
  }
  assert.ok(clear.blizzard === 0);
  const elsewhere = weather();
  elsewhere.atmosphere.setPreset('blizzard');
  const sky = settle(elsewhere, AUTUMN, 20);
  assert.ok(sky.blizzard < 0.01);
  assert.equal(elsewhere.blizzard.visible, false, 'nothing is drawn outside the snow');
});

test('a blizzard fades in over many seconds, not all at once', () => {
  let start = 0;
  while (blizzardAt(start + 1) <= 0) start += 1;
  const w = weather();
  // Let the car settle in the snow with the clock stopped, then let the storm come.
  w.atmosphere.setTime(start - 20);
  for (let t = 0; t < 8; t += 0.1) w.atmosphere.update(0.1, SNOW, false);
  const levels = [];
  for (let t = 0; t < 40; t += 1) {
    for (let k = 0; k < 10; k++) w.atmosphere.update(0.1, SNOW, true);
    levels.push(w.atmosphere.getState().blizzard);
  }
  assert.ok(levels[19] < 0.1, 'calm until the storm begins');
  assert.ok(levels[24] > 0.1 && levels[24] < 0.9, 'building');
  assert.ok(levels.at(-1) > 0.9, 'there in the end');
  assert.ok(
    levels.every((v, i) => i === 0 || v >= levels[i - 1] - 1e-9),
    'rising steadily',
  );
});

test('blizzards come only now and then: every third rain spell, a minute or two long, fading over 10 to 20 seconds', () => {
  const spells = [];
  const blizzards = [];
  let inSpell = false;
  let inBlizzard = false;
  for (let t = 0; t < 7200; t += 1) {
    const rain = skyConditions(t).rain > 0.05;
    if (rain && !inSpell) spells.push(t);
    inSpell = rain;
    const storm = blizzardAt(t) > 0.5;
    if (storm && !inBlizzard) blizzards.push({ start: t });
    else if (!storm && inBlizzard) blizzards.at(-1).end = t;
    inBlizzard = storm;
  }
  assert.ok(spells.length >= 25, 'rain spells come round every few minutes');
  assert.ok(blizzards.length >= 6 && blizzards.length <= spells.length / 2, 'a blizzard in some of them only');
  assert.equal(blizzardAt(0), 0, 'the game starts calm');
  for (const { start, end } of blizzards.slice(0, -1)) {
    assert.ok(end - start >= 40 && end - start <= 120, `lasts ${end - start} s`);
    assert.ok(
      spells.some(t => Math.abs(t + 20 - (start + end) / 2) < 25),
      'in the middle of a rain spell',
    );
  }
  const gaps = blizzards.slice(1).map((b, i) => b.start - blizzards[i].start);
  assert.ok(Math.min(...gaps) > 480, 'a long wait between blizzards');
  // The fade takes 10 to 20 seconds each way.
  let from = 0;
  while (blizzardAt(from) < 0.99) from += 0.5;
  let ramp = from;
  while (blizzardAt(ramp) > 0.01) ramp -= 0.5;
  assert.ok(from - ramp >= 10 && from - ramp <= 20, `fades in over ${from - ramp} s`);
});

test('a blizzard in the automatic sky reaches the car in the snow, and never on a dry autumn road', () => {
  const t = (() => {
    for (let s = 0; s < 3000; s++) if (blizzardAt(s) > 0.99) return s;
  })();
  const w = weather();
  w.atmosphere.setTime(t - 3);
  settle(w, SNOW, 4);
  assert.ok(w.atmosphere.getState().blizzard > 0.5);
  const w2 = weather();
  w2.atmosphere.setTime(t - 3);
  settle(w2, AUTUMN, 4);
  assert.ok(w2.atmosphere.getState().blizzard < 0.01);
});

test('the snow animals stand inside the fence, on dry ground, close to a road but not on it', () => {
  const SNOW_KINDS = ['reindeer', 'polarBear', 'arcticFox', 'snowLeopard'];
  const winter = HERDS.filter(h => SNOW_KINDS.includes(h.kind) && h.x > 0);
  const kinds = new Set(winter.map(h => h.kind));
  for (const kind of SNOW_KINDS) assert.ok(kinds.has(kind), `${kind} in the winter`);
  const coast = HERDS.filter(h => h.kind === 'snowLeopard' && h.x < -700);
  assert.ok(coast.length >= 2, 'snow leopards in the Lofoten foothills');
  const roads = [OUTER_ROAD, ...Object.values(LOFOTEN.roads)];
  for (const herd of [...winter, ...coast]) {
    assert.ok(insideFence(herd.x, herd.z, herd.radius), `${herd.kind} within the fence`);
    assert.equal(waterDepth(herd.x, herd.z), 0);
    assert.ok(winterness(herd.x, herd.z) > 0.9, `${herd.kind} out of the snow`);
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const [x, z] = [herd.x + Math.cos(a) * herd.radius, herd.z + Math.sin(a) * herd.radius];
      assert.equal(waterDepth(x, z), 0, `${herd.kind} could wade at ${x.toFixed(0)}, ${z.toFixed(0)}`);
    }
    const road = Math.min(...roads.map(r => r.nearest(herd.x, herd.z).distance));
    assert.ok(road > herd.radius + 4, `${herd.kind} patch on the road (${road.toFixed(0)} m)`);
    assert.ok(road < 100, `${herd.kind} too far from a road (${road.toFixed(0)} m)`);
  }
});

test('the snow leopard is a blocky cat with a long tail, and a quiet one', () => {
  const kind = KINDS.snowLeopard;
  assert.ok(kind && kind.body && kind.head && kind.leg);
  assert.equal(kind.call, undefined, 'it makes no sound when honked at');
  assert.ok(kind.run <= 6, 'never faster than a lope');
});
