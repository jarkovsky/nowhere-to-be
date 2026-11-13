// Where the scenery may be placed: the circles kept clear round every building and place, the
// tracks kept clear, and how steep the land is. Shared by the trees, rocks and flowers placed on
// the page (see scenery.js) and the long grass, which is placed in a worker (see longgrass.js).
import {
  inCrop,
  inOrchard,
  inDiscovery,
  LAKE,
  ROAD,
  CREEK,
  BROOK,
  SPRING,
  OXBOW,
  CAMP_TRAIL,
  TRACKS,
  onDriveway,
  RAILWAY,
  HALT,
  BRIDGES,
  FISHING,
  TUNNEL,
  WATERFALL,
  CAMP,
  CABIN,
  FARM,
  TOWER,
  WINDMILL,
  JETTY,
  ROADWORKS,
  HELIPAD,
  CHAPEL,
  SUMMIT,
  FIELDS,
  FARMSTEAD,
  SPAWN,
  DEPOT,
  VALLEY_RADIUS,
  HABITATS,
  SURFACES,
  GLADES,
  STRANDED,
  STRANDED_SPOTS,
  AIRFIELD,
  ROCK_GATE,
  ROCK_FIN,
  FJORD_VILLAGE,
  FARMS,
  VILLAGE,
  PONDS,
  DESERT,
  inFjord,
  onPaved,
  onGravel,
  nearRiver,
  lakeDistance,
} from './layout.js';
import { terrainHeight, placementHeight } from './terrain.js';
import { desertTakes } from './sand.js';

/** Circles kept clear of trees and rocks. */
export const CLEARINGS = [
  { x: SPAWN.x, z: SPAWN.z, r: 16 },
  { x: DEPOT.x, z: DEPOT.z, r: 26 },
  { x: CAMP.x, z: CAMP.z, r: 24 },
  { x: CABIN.x, z: CABIN.z, r: 14 },
  { x: TUNNEL.x, z: TUNNEL.z, r: 34 },
  ...BRIDGES.map(({ x, z, length }) => ({ x, z, r: length / 2 + 8 })),
  { x: WATERFALL.x, z: WATERFALL.z, r: 26 },
  { x: FARM.x, z: FARM.z, r: 40 },
  { x: TOWER.x, z: TOWER.z, r: 14 },
  { x: WINDMILL.x, z: WINDMILL.z, r: 20 },
  { x: JETTY.x - 4, z: JETTY.z, r: 16 },
  { x: HABITATS.sheep.x, z: HABITATS.sheep.z, r: 18 },
  { x: HABITATS.burrow.x, z: HABITATS.burrow.z, r: 10 },
  // Where the yeti hid: the glade stays, so no tree moves.
  { x: -78, z: -146, r: 10 },
  { ...RAILWAY.at((HALT.from + HALT.to) / 2), r: 24 },
  { ...ROADWORKS.path.at(0), r: 20 },
  { ...ROADWORKS.path.at(ROADWORKS.gravel), r: 40 },
  { x: HELIPAD.x, z: HELIPAD.z, r: 20 },
  { x: CHAPEL.x, z: CHAPEL.z, r: 9 },
  { x: SUMMIT.x, z: SUMMIT.z, r: 16 },
  { x: FISHING.x, z: FISHING.z, r: 15 },
  { x: FARMSTEAD.x, z: FARMSTEAD.z, r: 22 },
  { x: FIELDS.x, z: FIELDS.z, r: FIELDS.radius },
  { ...AIRFIELD.hangar, r: 22 },
  { ...AIRFIELD.tower, r: 12 },
  { x: ROCK_GATE.x, z: ROCK_GATE.z, r: ROCK_GATE.span },
  // Along the fin of rock out to the arch: its sides lean out a long way where it stands tall.
  ...ROCK_FIN.path.samples.filter((_, i) => i % 6 === 0).map(({ x, z }) => ({ x, z, r: 13 })),
  ...[...FJORD_VILLAGE.houses, ...FJORD_VILLAGE.boathouses].map(({ x, z }) => ({ x, z, r: 9 })),
  { x: FJORD_VILLAGE.church.x, z: FJORD_VILLAGE.church.z, r: 12 },
  ...FARMS.flatMap(farm => [
    { x: farm.x, z: farm.z, r: 28 },
    { x: farm.paddock.x, z: farm.paddock.z, r: farm.paddock.radius + 4 },
    ...(farm.sty ? [{ x: farm.sty.x, z: farm.sty.z, r: farm.sty.radius + 3 }] : []),
  ]),
  ...VILLAGE.houses.map(({ x, z }) => ({ x, z, r: 10 })),
  { x: VILLAGE.fireStation.x, z: VILLAGE.fireStation.z, r: 14 },
  ...PONDS.filter(pond => pond !== DESERT.oasis).map(({ x, z, radius }) => ({ x, z, r: radius + 6 })),
  ...GLADES.map(glade => ({ ...glade, r: 4 })),
  ...STRANDED_SPOTS.map(({ x, z }) => ({ x, z, r: STRANDED.radius })),
  // The mud lies on the tracks, which are kept clear anyway.
  ...SURFACES.filter(p => p.id !== 'mud').map(p => ({ x: p.x, z: p.z, r: Math.max(p.rx, p.rz) + 4 })),
];

/**
 * The tracks that the trees, rocks and grass are kept off. The desert's track and its oasis are
 * left out of these and of the clearings: everything is tried in turn from the same run of random
 * numbers, so keeping something off them would move everything placed after it. The desert
 * clears its own ground instead (see desertTakes).
 */
export const PLACED_TRACKS = TRACKS.filter(track => !track.desert);

/** True in or just around a patch of mud. */
export const inMud = (x, z) =>
  SURFACES.some(p => p.id === 'mud' && ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2 < 1.15 ** 2);

function nearWalkway({ start, end }, x, z, clearance) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - start.x - dx * t, z - start.z - dz * t) < clearance;
}

export function isClearGround(x, z, { road = 9 } = {}) {
  const r = Math.hypot(x, z);
  if (Math.abs(r - VALLEY_RADIUS - 1.8) < 4) return false;
  if (lakeDistance(x, z) < 2.2 && terrainHeight(x, z) < LAKE.level + 0.8) return false;
  if (CLEARINGS.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r)) return false;
  if (nearWalkway(HABITATS.deer, x, z, 5) || nearWalkway(HABITATS.ducks, x, z, 5)) return false;
  if (ROAD.isNear(x, z, road) || CAMP_TRAIL.isNear(x, z, 6) || RAILWAY.isNear(x, z, 9)) return false;
  if (PLACED_TRACKS.some(track => track.path.isNear(x, z, 5))) return false;
  if (onPaved(x, z, road) || onGravel(x, z, road - 1) || onDriveway(x, z, 4)) return false;
  // The airfield's levelled ground is kept as open, mown grass.
  const { ground } = AIRFIELD;
  if (x > ground.x0 - 6 && x < ground.x1 + 6 && z > ground.z0 - 6 && z < ground.z1 + 6) return false;
  if (CREEK.isNear(x, z, 10)) return false;
  if (BROOK.isNear(x, z, 7) || Math.hypot(x - SPRING.x, z - SPRING.z) < SPRING.radius + 6) return false;
  if (OXBOW.path.isNear(x, z, 14)) return false;
  return !nearRiver(x, z, 11) && !inFjord(x, z, 3);
}

/** Rise over run of the land at a point, as it was before the desert (see placementHeight). */
export function steepness(x, z) {
  const h = placementHeight(x, z);
  return Math.hypot(placementHeight(x + 1, z) - h, placementHeight(x, z + 1) - h);
}

/**
 * False where nothing grows that is placed out in the country: in the crop fields and a couple of
 * metres round them, in the desert, the orchard and the clearings round the places to discover.
 */
export function grows(x, z) {
  return !inCrop(x, z, 2) && !desertTakes(x, z) && !inOrchard(x, z) && !inDiscovery(x, z);
}
