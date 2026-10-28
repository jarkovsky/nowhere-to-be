// Where vehicles are parked or wait to set off, and whether each can get out to the roads over
// paved ground: a fire engine parked on a forecourt with grass between it and the road would
// have no way out. Checked by tests/access.test.js; anything new that parks a vehicle belongs
// in PARKED.
import {
  CAMP_TRAIL,
  DEPOT,
  DESERT,
  GRAVEL,
  GRAVEL_HALF_WIDTH,
  PAVED,
  ROAD,
  ROAD_HALF_WIDTH,
  TRACKS,
  VILLAGE,
  onAirfield,
  onDriveway,
  onForecourt,
} from './layout.js';
import { onDeck } from './terrain.js';

const frame = ({ x, z, rotation }, lx, lz) => ({
  x: x + lx * Math.cos(rotation) + lz * Math.sin(rotation),
  z: z - lx * Math.sin(rotation) + lz * Math.cos(rotation),
});

/** Every spot a vehicle is parked or waits at, by name. */
export const PARKED = [
  ...DEPOT.bays.map((lx, i) => ({ name: `depot bay ${i + 1}`, ...frame(DEPOT, lx, DEPOT.noses - 2) })),
  { name: 'depot apron', ...frame(DEPOT, DEPOT.apron.lx, DEPOT.apron.nose - 2) },
  { name: 'fire engine', ...frame(VILLAGE.fireStation, -2.6, 5.2) },
  { name: 'camper van at the petrol station', ...frame(DESERT.station, -0.6, 5.1) },
  { name: 'planes on the apron', x: 540, z: 162 },
  { name: 'planes on the apron', x: 560, z: 178 },
];

/** True on the roads, tracks and trails that join up into the network everything drives on. */
export function onNetwork(x, z) {
  return (
    ROAD.isNear(x, z, ROAD_HALF_WIDTH) ||
    CAMP_TRAIL.isNear(x, z, 2.2) ||
    PAVED.some(path => path.isNear(x, z, ROAD_HALF_WIDTH)) ||
    GRAVEL.some(path => path.isNear(x, z, GRAVEL_HALF_WIDTH)) ||
    TRACKS.some(track => track.path.isNear(x, z, (track.width ?? 2) * 0.7))
  );
}

/** True where a vehicle can drive without leaving firm, made ground. */
export function onFirmGround(x, z) {
  return onNetwork(x, z) || onDriveway(x, z) || onForecourt(x, z) || onAirfield(x, z) || onDeck(x, z);
}

/**
 * Whether a vehicle at (x, z) can drive out to the network over firm ground, searching outwards
 * a metre at a time no further than `reach` metres. Returns the distance walked, or Infinity.
 */
export function wayOut(x, z, reach = 400) {
  const STEP = 1;
  const key = (i, j) => `${i},${j}`;
  const start = [Math.round(x / STEP), Math.round(z / STEP)];
  const seen = new Set([key(...start)]);
  let frontier = [start];
  for (let walked = 0; walked < reach && frontier.length; walked += STEP) {
    const next = [];
    for (const [i, j] of frontier) {
      if (onNetwork(i * STEP, j * STEP)) return walked;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const k = key(i + di, j + dj);
        if (seen.has(k) || !onFirmGround((i + di) * STEP, (j + dj) * STEP)) continue;
        seen.add(k);
        next.push([i + di, j + dj]);
      }
    }
    frontier = next;
  }
  return Infinity;
}
