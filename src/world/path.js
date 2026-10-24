import * as THREE from 'three';

/**
 * A smooth path over the ground plane, resampled at even spacing so that
 * positions can be addressed by distance travelled (`s`). Used for the trail,
 * the creek and the campsite spur.
 */
export function createPath(points, { closed = false, spacing = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    closed,
    'centripetal',
  );
  const length = curve.getLength();
  const count = Math.max(2, Math.round(length / spacing));
  const step = length / count;
  const tangent = new THREE.Vector3();

  const samples = curve.getSpacedPoints(count).map((point, i) => {
    curve.getTangentAt(Math.min(i / count, 1), tangent);
    const norm = Math.hypot(tangent.x, tangent.z) || 1;
    return { x: point.x, z: point.z, dx: tangent.x / norm, dz: tangent.z / norm, s: i * step };
  });
  // A closed curve repeats its first point at the end.
  if (closed) samples.pop();

  function wrap(s) {
    return closed ? ((s % length) + length) % length : THREE.MathUtils.clamp(s, 0, length);
  }

  /** Interpolated position and direction at distance `s` along the path. */
  function at(s) {
    const u = wrap(s) / step;
    const i = Math.floor(u);
    const a = samples[closed ? i % samples.length : Math.min(i, samples.length - 1)];
    const b = samples[closed ? (i + 1) % samples.length : Math.min(i + 1, samples.length - 1)];
    const t = u - i;
    const dx = a.dx + (b.dx - a.dx) * t;
    const dz = a.dz + (b.dz - a.dz) * t;
    const norm = Math.hypot(dx, dz) || 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: dx / norm, dz: dz / norm, s: wrap(s) };
  }

  // Samples bucketed into a coarse grid, so nearby lookups stay cheap every frame.
  const BUCKET = 24;
  const buckets = new Map();
  const bucketKey = (bx, bz) => bx * 8192 + bz;
  for (const sample of samples) {
    const key = bucketKey(Math.floor(sample.x / BUCKET), Math.floor(sample.z / BUCKET));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(sample);
  }

  function candidates(x, z) {
    const bx = Math.floor(x / BUCKET);
    const bz = Math.floor(z / BUCKET);
    const nearby = [];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) nearby.push(...(buckets.get(bucketKey(bx + i, bz + j)) ?? []));
    }
    // Far from the path, fall back to checking every sample.
    return nearby.length ? nearby : samples;
  }

  /**
   * Closest sample to a point. `side` is positive to the right of the
   * direction of travel. Exact within one bucket of the path.
   */
  function nearest(x, z) {
    let best = samples[0];
    let bestDistance = Infinity;
    for (const sample of candidates(x, z)) {
      const distance = (x - sample.x) ** 2 + (z - sample.z) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = sample;
      }
    }
    const side = (x - best.x) * -best.dz + (z - best.z) * best.dx;
    return { sample: best, s: best.s, distance: Math.sqrt(bestDistance), side };
  }

  // The path's extent, so points far from all of it are turned away at once.
  const box = samples.reduce(
    (b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), z0: Math.min(b.z0, p.z), z1: Math.max(b.z1, p.z) }),
    { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },
  );

  /** True if the path passes within `distance` of a point. Quick, but only for distances up to 24 m. */
  function isNear(x, z, distance) {
    if (x < box.x0 - distance || x > box.x1 + distance || z < box.z0 - distance || z > box.z1 + distance) return false;
    const bx = Math.floor(x / BUCKET);
    const bz = Math.floor(z / BUCKET);
    const limit = distance * distance;
    // Only the buckets that reach within `distance` of the point, and no further than the next ones.
    const i1 = Math.min(bx + 1, Math.floor((x + distance) / BUCKET));
    const j1 = Math.min(bz + 1, Math.floor((z + distance) / BUCKET));
    for (let i = Math.max(bx - 1, Math.floor((x - distance) / BUCKET)); i <= i1; i++) {
      for (let j = Math.max(bz - 1, Math.floor((z - distance) / BUCKET)); j <= j1; j++) {
        const bucket = buckets.get(bucketKey(i, j));
        if (!bucket) continue;
        for (const sample of bucket) if ((x - sample.x) ** 2 + (z - sample.z) ** 2 < limit) return true;
      }
    }
    return false;
  }

  /** World position at distance `along` the path and `side` metres to its right. */
  function offset(along, side = 0) {
    const p = at(along);
    return { x: p.x - p.dz * side, z: p.z + p.dx * side, dx: p.dx, dz: p.dz };
  }

  /** How far apart two distances along the path are, the short way round a closed one. */
  function apart(a, b) {
    return closed ? Math.abs(wrap(a - b + length / 2) - length / 2) : Math.abs(a - b);
  }

  return { closed, length, spacing: step, samples, at, nearest, isNear, offset, wrap, apart };
}

/** Heading (rotation about +Y) of something facing along direction (dx, dz). */
export const headingOf = (dx, dz) => Math.atan2(-dx, -dz);
