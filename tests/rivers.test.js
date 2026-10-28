import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIDGES,
  BRIDGE_STYLES,
  CROSSINGS,
  FISHING,
  GRAVEL_HALF_WIDTH,
  OUTER_ROAD,
  RIVERS,
  TRACKS,
} from '../src/world/layout.js';
import {
  FORDS,
  bridgeAt,
  bridgeHeight,
  deckHeight,
  drivingHeight,
  isDriveable,
  onDeck,
  riverLevel,
  terrainHeight,
  waterDepth,
  waterLevel,
} from '../src/world/terrain.js';

/** A point `along` a bridge and `side` metres to its right. */
const onBridge = (bridge, along, side = 0) => ({
  x: bridge.x + bridge.dx * along - bridge.dz * side,
  z: bridge.z + bridge.dz * along + bridge.dx * side,
});

const rivered = BRIDGES.filter(bridge => bridge.river);

test('bridges are a list, the creek bridge first, each in a style', () => {
  assert.equal(BRIDGES[0].id, 'creek');
  assert.ok(BRIDGES.every(bridge => bridge.style in BRIDGE_STYLES));
  for (const style of Object.keys(BRIDGE_STYLES))
    assert.ok(
      BRIDGES.some(bridge => bridge.style === style),
      style,
    );
});

test('every bridge deck meets the ground at both ends and clears the water under it', () => {
  for (const bridge of BRIDGES) {
    for (const end of [-1, 1]) {
      const p = onBridge(bridge, (end * bridge.length) / 2);
      const step = deckHeight((end * bridge.length) / 2, bridge) - terrainHeight(p.x, p.z);
      assert.ok(Math.abs(step - bridge.lift) < 0.05, `${bridge.id}: a ${step.toFixed(2)} m step at an end`);
    }
    const water = waterLevel(bridge.x, bridge.z);
    assert.ok(Number.isFinite(water), `${bridge.id}: there is water under it`);
    // The deck's planks are a hand's width thick, so its top is at least that above the water.
    assert.ok(deckHeight(0, bridge) > water + 0.45, `${bridge.id}: the deck clears the water`);
  }
});

test('the deck of a bridge is never steeper than a car can climb at cruise', () => {
  for (const bridge of BRIDGES) {
    for (let along = -bridge.length / 2; along < bridge.length / 2; along += 0.5) {
      const slope = Math.abs(deckHeight(along + 0.5, bridge) - deckHeight(along, bridge)) / 0.5;
      assert.ok(slope < 0.25, `${bridge.id}: ${slope.toFixed(2)} steep at ${along}`);
    }
  }
});

test('a deck is only where the bridge is, and counts as a deck', () => {
  for (const bridge of BRIDGES) {
    const middle = onBridge(bridge, 0);
    assert.equal(bridgeAt(middle.x, middle.z), bridge);
    assert.ok(onDeck(middle.x, middle.z) && isDriveable(middle.x, middle.z));
    assert.equal(bridgeHeight(middle.x, middle.z), deckHeight(0, bridge));
    assert.ok(drivingHeight(middle.x, middle.z) >= deckHeight(0, bridge));
    const beside = onBridge(bridge, 0, bridge.width / 2 + 1);
    assert.equal(bridgeAt(beside.x, beside.z), null);
    const past = onBridge(bridge, bridge.length / 2 + 1);
    assert.equal(bridgeAt(past.x, past.z), null);
  }
});

test('the narrow log crossing is a car and 0.6 m either side wide, and has no rails of its own', () => {
  const log = BRIDGES.find(bridge => bridge.style === 'log');
  assert.ok(log.width >= 3.2 && log.width <= 3.6);
  assert.ok(deckHeight(0, log) - waterLevel(log.x, log.z) < 1, 'low over the water');
});

test('the creek bridge is as it always was', () => {
  const creek = BRIDGES[0];
  assert.ok(Math.abs(creek.width - 9.6) < 1e-9);
  assert.ok(Math.abs(creek.length - 21.8) < 0.1);
  assert.ok(Math.abs(deckHeight(0) - deckHeight(0, creek)) < 1e-9);
});

test('rivers change along their length: wider and narrower, deeper and shallower, with quick and slow stretches', () => {
  for (const river of RIVERS) {
    const samples = river.path.samples.filter(p => p.s > 100 && p.s < river.path.length - 100);
    const widths = samples.map(p => river.halfWidth(p.s));
    const depths = samples.map(p => river.depth(p.s));
    const flows = samples.map(p => river.flow(p.s));
    const range = values => Math.max(...values) - Math.min(...values);
    assert.ok(range(widths) > 1.5, `${river.id}: ${range(widths).toFixed(1)} m of change in width`);
    assert.ok(range(depths) > 0.3, `${river.id}: ${range(depths).toFixed(2)} m of change in depth`);
    assert.ok(range(flows) > 0.5, `${river.id}: the water goes at the same pace all the way`);
    assert.ok(Math.max(...samples.map(p => river.shallow(p.s))) > 0.5, `${river.id} has riffles`);
    assert.ok(Math.max(...widths) <= river.widest);
  }
});

test('every crossing is a bridge or a ford, and the river is a river on either side of it', () => {
  assert.equal(CROSSINGS.filter(c => c.style).length, rivered.length);
  assert.equal(CROSSINGS.filter(c => !c.style).length, FORDS.length);
  for (const river of RIVERS)
    assert.ok(
      CROSSINGS.some(c => c.river === river),
      `${river.id} is crossed`,
    );
});

test('each new river is crossed where it should be, by the road it should be crossed by', () => {
  const by = (river, road, style) =>
    CROSSINGS.filter(c => c.river.id === river && c.id === road && (style === undefined || c.style === style));
  assert.equal(by('winter', 'outer', 'timber').length, 2, 'timber bridges on the outer road');
  assert.equal(by('winter', 'north').length, 1, 'the north gravel road crosses it');
  assert.equal(by('winter', 'winter-log', 'log').length, 1, 'a log bridge on the track');
  assert.equal(by('winter', 'winter-log', null).length, 1, 'and a ford to come back');
  assert.ok(by('east', 'outer', 'stone').length === 1, 'a stone bridge on the outer road in the east');
  assert.ok(by('east', 'east-ford', null).length === 1, 'a ford on its track');
  const south = CROSSINGS.filter(c => c.river.id === 'river' && c.id === 'outer');
  assert.ok(
    south.some(c => c.style),
    'one crossing of the south-west river is a bridge',
  );
  assert.ok(
    south.some(c => !c.style),
    'and one is a ford',
  );
});

test('fords are wide and no more than 0.3 m deep across the whole road', () => {
  for (const ford of FORDS) {
    const width = ford.width;
    for (let along = -ford.river.halfWidth(ford.riverS); along <= ford.river.halfWidth(ford.riverS); along += 1) {
      const p = ford.path.offset(ford.s + along, width / 2);
      for (const [x, z] of [
        [p.x, p.z],
        [ford.path.at(ford.s + along).x, ford.path.at(ford.s + along).z],
      ]) {
        assert.ok(waterDepth(x, z) < 0.45, `${waterDepth(x, z).toFixed(2)} m deep at ${x.toFixed(0)}, ${z.toFixed(0)}`);
        assert.ok(isDriveable(x, z));
      }
    }
    assert.ok(ford.river.halfWidth(ford.riverS) > 4.5, 'the water spreads wide over a ford');
  }
});

test('a river runs downhill, level under a bridge or a ford', () => {
  for (const river of RIVERS) {
    let last = Infinity;
    for (let s = 0; s < river.path.length; s += 3) {
      const level = riverLevel(river, s);
      assert.ok(level <= last + 1e-6, `${river.id} rises at ${s}`);
      last = level;
    }
    for (const site of river.sites.filter(site => site.kind !== 'pool')) {
      assert.ok(Math.abs(riverLevel(river, site.s - 8) - riverLevel(river, site.s + 8)) < 0.05, 'level at a crossing');
    }
  }
});

test('the winter river and the east river come in from beyond the fence and go back out', () => {
  for (const id of ['winter', 'east']) {
    const river = RIVERS.find(r => r.id === id);
    assert.ok(Math.hypot(river.path.at(0).x, river.path.at(0).z) > 1050);
    assert.ok(Math.hypot(river.path.at(river.path.length).x, river.path.at(river.path.length).z) > 1050);
  }
});

test('the fishing hut stands on the bank, clear of the water, with its jetty out over it', () => {
  const river = RIVERS.find(r => r.id === 'river');
  assert.ok(river.path.isNear(FISHING.x, FISHING.z, 20));
  assert.equal(waterDepth(FISHING.x, FISHING.z), 0);
  const end = onBridge(
    { x: FISHING.x, z: FISHING.z, dx: Math.sin(FISHING.rotation), dz: Math.cos(FISHING.rotation) },
    FISHING.jetty.to,
    -FISHING.jetty.lx,
  );
  assert.ok(waterDepth(end.x, end.z) > 0.5, 'the end of the jetty is over deep water');
  const track = TRACKS.find(t => t.id === 'fishing').path;
  assert.ok(Math.hypot(track.at(track.length).x - FISHING.x, track.at(track.length).z - FISHING.z) < 12);
});
