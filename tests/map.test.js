import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, VALLEY_RADIUS } from '../src/world/layout.js';
import { MAP_EXTENT, MAP_PLACES, PLACE_ICONS } from '../src/ui/mapart.js';

test('the map marks every place with a picture, but not the lookout or the viewpoints', () => {
  const marked = new Set(MAP_PLACES.map(place => place.id));
  for (const place of PLACES) {
    const left = place.id === 'lookout' || place.id.startsWith('view-');
    assert.equal(marked.has(place.id), !left, place.id);
  }
  for (const place of MAP_PLACES) {
    assert.ok(place.name && place.color && (place.d || place.solid), place.id);
    assert.ok(Math.hypot(place.x, place.z) < VALLEY_RADIUS, `${place.id} is inside the fence`);
  }
  assert.ok(Object.keys(PLACE_ICONS).every(id => PLACES.some(place => place.id === id)));
  assert.ok(MAP_EXTENT > VALLEY_RADIUS, 'the picture covers the whole valley');
});
