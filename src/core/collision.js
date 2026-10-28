// Static obstacles are circles ({x, z, radius}), capsules ({ax, az, bx, bz, radius}) or boxes
// ({x, z, halfX, halfZ, rotation, radius}): a rectangle `halfX` by `halfZ` each side of its
// middle, turned by `rotation` like a localFrame, its edges rounded out by `radius`, which
// fits a building's walls. Where things stand at different levels, as on and under the rock arch, an obstacle can
// also have a `top` (only something lower down bumps into it) or a `base` (only something
// up at that level does). One that is `soft` (a crop) stops the car without a bump. A uniform
// grid index keeps per-frame collision checks small.
import { clamp, segmentDistance } from './math.js';

const CELL = 16;

/** How far a box reaches from its middle along X and along Z, rounded corners and all. */
function boxReach(obstacle) {
  const cos = Math.abs(Math.cos(obstacle.rotation));
  const sin = Math.abs(Math.sin(obstacle.rotation));
  return {
    x: cos * obstacle.halfX + sin * obstacle.halfZ + obstacle.radius,
    z: sin * obstacle.halfX + cos * obstacle.halfZ + obstacle.radius,
  };
}

function bounds(obstacle) {
  if ('halfX' in obstacle) {
    const reach = boxReach(obstacle);
    return {
      minX: obstacle.x - reach.x,
      maxX: obstacle.x + reach.x,
      minZ: obstacle.z - reach.z,
      maxZ: obstacle.z + reach.z,
    };
  }
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

/**
 * True if (x, z) comes within `reach` of the obstacle's bounds along both axes. A circle of
 * radius `reach` there can only touch the obstacle if it does.
 */
export function mayTouch(obstacle, x, z, reach) {
  if ('halfX' in obstacle) {
    const box = boxReach(obstacle);
    return Math.abs(x - obstacle.x) < box.x + reach && Math.abs(z - obstacle.z) < box.z + reach;
  }
  const grow = obstacle.radius + reach;
  if ('ax' in obstacle) {
    return (
      x > Math.min(obstacle.ax, obstacle.bx) - grow &&
      x < Math.max(obstacle.ax, obstacle.bx) + grow &&
      z > Math.min(obstacle.az, obstacle.bz) - grow &&
      z < Math.max(obstacle.az, obstacle.bz) + grow
    );
  }
  return Math.abs(x - obstacle.x) < grow && Math.abs(z - obstacle.z) < grow;
}

/** True if something with its wheels at height `y` can bump into the obstacle. */
export function atLevel(obstacle, y) {
  if (obstacle.top !== undefined && y > obstacle.top - 0.4) return false;
  return obstacle.base === undefined || y > obstacle.base;
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
    /**
     * Obstacles whose bounds may touch a circle at (x, z), for something whose wheels are at
     * height `y`: on the ground, unless it says otherwise. One switched `off` is left out.
     */
    near(x, z, radius, y = -Infinity) {
      found.clear();
      for (let cx = Math.floor((x - radius) / CELL); cx <= Math.floor((x + radius) / CELL); cx++) {
        for (let cz = Math.floor((z - radius) / CELL); cz <= Math.floor((z + radius) / CELL); cz++) {
          const list = cells.get(key(cx, cz));
          if (list) for (const obstacle of list) if (!obstacle.off && atLevel(obstacle, y)) found.add(obstacle);
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
  if ('halfX' in obstacle) return boxPenetration(x, z, radius, obstacle);
  let cx = obstacle.x;
  let cz = obstacle.z;
  const capsule = 'ax' in obstacle;
  if (capsule) {
    const { t } = segmentDistance(x, z, obstacle.ax, obstacle.az, obstacle.bx, obstacle.bz);
    cx = obstacle.ax + (obstacle.bx - obstacle.ax) * t;
    cz = obstacle.az + (obstacle.bz - obstacle.az) * t;
  }
  const dx = x - cx;
  const dz = z - cz;
  const distance = Math.hypot(dx, dz);
  const overlap = radius + obstacle.radius - distance;
  if (overlap <= 0) return null;
  if (distance < 1e-6) {
    // Right on a capsule's middle line: out to one side of it, never along it.
    const ax = capsule ? obstacle.bx - obstacle.ax : 0;
    const az = capsule ? obstacle.bz - obstacle.az : 0;
    const length = Math.hypot(ax, az);
    return length > 1e-6 ? { nx: -az / length, nz: ax / length, depth: overlap } : { nx: 1, nz: 0, depth: overlap };
  }
  return { nx: dx / distance, nz: dz / distance, depth: overlap };
}

function boxPenetration(x, z, radius, box) {
  const cos = Math.cos(box.rotation);
  const sin = Math.sin(box.rotation);
  // Into the box's own frame (the inverse of localFrame).
  const dx = x - box.x;
  const dz = z - box.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const qx = clamp(lx, -box.halfX, box.halfX);
  const qz = clamp(lz, -box.halfZ, box.halfZ);
  let nx;
  let nz;
  let depth;
  if (qx !== lx || qz !== lz) {
    // Outside the rectangle: away from the nearest point of it.
    const ox = lx - qx;
    const oz = lz - qz;
    const distance = Math.hypot(ox, oz);
    depth = radius + box.radius - distance;
    if (depth <= 0) return null;
    [nx, nz] = [ox / distance, oz / distance];
  } else {
    // Inside it: out through the nearest side.
    const sideX = box.halfX - Math.abs(lx);
    const sideZ = box.halfZ - Math.abs(lz);
    if (sideX < sideZ) [nx, nz, depth] = [lx < 0 ? -1 : 1, 0, sideX];
    else [nx, nz, depth] = [0, lz < 0 ? -1 : 1, sideZ];
    depth += radius + box.radius;
  }
  // Back into the world.
  return { nx: nx * cos + nz * sin, nz: -nx * sin + nz * cos, depth };
}
