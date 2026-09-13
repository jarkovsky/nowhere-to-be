// Static obstacles are circles ({x, z, radius}) or capsules ({ax, az, bx, bz, radius}).
// A uniform grid index keeps per-frame collision checks small.
import { segmentDistance } from './math.js';

const CELL = 16;

function bounds(obstacle) {
  if ('ax' in obstacle) {
    return {
      minX: Math.min(obstacle.ax, obstacle.bx) - obstacle.radius,
      maxX: Math.max(obstacle.ax, obstacle.bx) + obstacle.radius,
      minZ: Math.min(obstacle.az, obstacle.bz) - obstacle.radius,
      maxZ: Math.max(obstacle.az, obstacle.bz) + obstacle.radius,
    };
  }
  return {
    minX: obstacle.x - obstacle.radius,
    maxX: obstacle.x + obstacle.radius,
    minZ: obstacle.z - obstacle.radius,
    maxZ: obstacle.z + obstacle.radius,
  };
}

export function createObstacleIndex(obstacles) {
  const cells = new Map();
  const key = (cx, cz) => (cx * 73856093) ^ (cz * 19349663);
  for (const obstacle of obstacles) {
    const box = bounds(obstacle);
    for (let cx = Math.floor(box.minX / CELL); cx <= Math.floor(box.maxX / CELL); cx++) {
      for (let cz = Math.floor(box.minZ / CELL); cz <= Math.floor(box.maxZ / CELL); cz++) {
        const k = key(cx, cz);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(obstacle);
      }
    }
  }
  const found = new Set();
  return {
    all: obstacles,
    /** Obstacles whose bounds may touch a circle at (x, z). */
    near(x, z, radius) {
      found.clear();
      for (let cx = Math.floor((x - radius) / CELL); cx <= Math.floor((x + radius) / CELL); cx++) {
        for (let cz = Math.floor((z - radius) / CELL); cz <= Math.floor((z + radius) / CELL); cz++) {
          const list = cells.get(key(cx, cz));
          if (list) for (const obstacle of list) found.add(obstacle);
        }
      }
      return found;
    },
  };
}

/**
 * Pushes a circle out of an obstacle. Returns the outward normal and depth,
 * or null when they don't touch.
 */
export function penetration(x, z, radius, obstacle) {
  let cx = obstacle.x;
  let cz = obstacle.z;
  if ('ax' in obstacle) {
    const { t } = segmentDistance(x, z, obstacle.ax, obstacle.az, obstacle.bx, obstacle.bz);
    cx = obstacle.ax + (obstacle.bx - obstacle.ax) * t;
    cz = obstacle.az + (obstacle.bz - obstacle.az) * t;
  }
  const dx = x - cx;
  const dz = z - cz;
  const distance = Math.hypot(dx, dz);
  const overlap = radius + obstacle.radius - distance;
  if (overlap <= 0) return null;
  if (distance < 1e-6) return { nx: 1, nz: 0, depth: overlap };
  return { nx: dx / distance, nz: dz / distance, depth: overlap };
}
