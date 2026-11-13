// The world as the driving sees it (see stepDriving in core/driving.js): what the tyres are on,
// how high the ground is under them, where the car may go and what it can bump into.
import { createObstacleIndex } from '../core/collision.js';
import {
  CAMP_TRAIL,
  GRAVEL_HALF_WIDTH,
  ROAD,
  ROAD_HALF_WIDTH,
  TRACKS,
  onAirfield,
  onDriveway,
  onForecourt,
  onGravel,
  onPaved,
  rockiness,
  surfaceAt,
} from './layout.js';
import {
  boulderLift,
  drivingHeight,
  highSnow,
  isDriveable,
  onDeck,
  onFin,
  snowCover,
  wadingDepth,
  waterDepth,
} from './terrain.js';

/** What the tyres are on, for grip and top speed. */
export function surfaceUnder(x, z) {
  if (onDeck(x, z)) return 'road';
  if (waterDepth(x, z) > 0.15) return 'water';
  const patch = surfaceAt(x, z);
  if (patch === 'leaves' || patch === 'mud') return patch;
  if (snowCover(x, z) > 0.5) return highSnow(x, z) > 0.5 ? 'snow' : 'drift';
  if (ROAD.isNear(x, z, ROAD_HALF_WIDTH + 0.6) || CAMP_TRAIL.isNear(x, z, 2.6)) return 'road';
  if (onPaved(x, z, ROAD_HALF_WIDTH + 0.6) || onAirfield(x, z)) return 'road';
  if (onDriveway(x, z, 0.4) || onForecourt(x, z)) return 'road';
  if (onGravel(x, z, GRAVEL_HALF_WIDTH + 0.4)) return 'track';
  if (rockiness(x, z) > 0.5) return 'rock';
  if (TRACKS.some(track => track.path.isNear(x, z, 2))) return 'track';
  return patch === 'sand' ? 'sand' : 'grass';
}

/** Rise over run along `heading` on the surface `height(x, z)`; positive means uphill. */
function slopeAlong(height, x, z, heading) {
  const dx = -Math.sin(heading) * 1.5;
  const dz = -Math.cos(heading) * 1.5;
  return (height(x + dx, z + dz) - height(x - dx, z - dz)) / 3;
}

/**
 * The world for the car `state` to drive in. `obstacles` is everything solid that stands still
 * (a list, or an index of one already made), `dynamic` the list of what moves and can be bumped
 * into, `cropAt(x, z)` says where crops stand, and `wetness()` how wet the ground is, from 0 to 1.
 * The surface is the one at the car's own level (`state.y`), where one runs over another.
 */
export function createDrivingWorld(
  state,
  { obstacles = [], dynamic = [], cropAt = () => false, wetness = () => 0 } = {},
) {
  const height = (x, z) => drivingHeight(x, z, state.y);
  // The surface last worked out. The driving asks where the car is at the start of a step,
  // which is often just where something else asked a moment before.
  const last = { x: NaN, z: NaN, y: NaN, kind: 'grass' };
  return {
    obstacles: Array.isArray(obstacles) ? createObstacleIndex(obstacles) : obstacles,
    dynamic,
    surface(x, z) {
      if (x !== last.x || z !== last.z || state.y !== last.y) {
        last.kind = onFin(x, z, state.y) ? 'track' : cropAt(x, z) ? 'crop' : surfaceUnder(x, z);
        last.x = x;
        last.z = z;
        last.y = state.y;
      }
      return last.kind;
    },
    slope: (x, z, heading) => slopeAlong(height, x, z, heading),
    height,
    boulderLift,
    isDriveable,
    waterDepth: wadingDepth,
    wetness,
  };
}
