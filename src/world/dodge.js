// Animals let the car come close, then run out of its way at the last moment. Each keeps an
// offset from where its own routine puts it. When the car is heading straight for it and would
// reach it within about a second, the offset runs out to the side the animal is already on,
// well clear of the car. Once the car has gone, the animal wanders back.

/** How long before the car's front would reach it that an animal runs, in seconds. */
const NOTICE = 0.9;
/** Half the width of the path the car sweeps, with a little to spare. */
const SWEEP = 2.2;
/** How far the car's front is ahead of its middle. */
const NOSE = 2.2;
/** How long an animal stays out of the way before it heads back, in seconds. */
const HOLD = 3.5;

export function createDodge() {
  return { x: 0, z: 0, tx: 0, tz: 0, hold: 0, span: 0 };
}

/**
 * Moves `dodge` on by `dt` for an animal whose routine puts it at (x, z), with the car at
 * `car` ({ x, z, vx, vz }). It runs at `run` metres a second and walks back at `back`.
 * Returns where the animal is, { x, z, moving, facing }: `moving` is 'run' or 'walk' while
 * the offset is changing, and `facing` the turn about the vertical that points an animal
 * facing +x the way it is going.
 */
export function stepDodge(dodge, x, z, car, dt, { run = 6.5, back = 1 } = {}) {
  const rx = x + dodge.x - car.x;
  const rz = z + dodge.z - car.z;
  const gap = Math.hypot(rx, rz);
  const speed = Math.hypot(car.vx, car.vz);
  dodge.hold = Math.max(0, dodge.hold - dt);

  let move = null;
  const settled = Math.hypot(dodge.tx - dodge.x, dodge.tz - dodge.z) < 1e-3;
  if (dodge.hold === 0 && speed > 1.5) {
    const fx = car.vx / speed;
    const fz = car.vz / speed;
    const ahead = rx * fx + rz * fz;
    const across = rz * fx - rx * fz;
    if (ahead > -NOSE && (ahead - NOSE) / speed < NOTICE && Math.abs(across) < SWEEP) {
      // Out to the side it is already on, and on ahead of the car, as an animal bolts.
      const side = across >= 0 ? 1 : -1;
      const out = SWEEP + 3 - Math.abs(across);
      move = [-fz * side * out + fx * 3, fx * side * out + fz * 3];
    }
  }
  if (!move && settled && gap < SWEEP + 0.4) {
    // A car creeping up on it, or standing right beside it: it trots away, as often as it must.
    const out = SWEEP + 2 - gap;
    move = gap > 0.01 ? [(rx / gap) * out, (rz / gap) * out] : [out, 0];
  }
  if (move) {
    dodge.tx = dodge.x + move[0];
    dodge.tz = dodge.z + move[1];
    dodge.span = Math.hypot(...move);
    dodge.hold = HOLD;
  } else if (dodge.hold === 0 && gap > 9 && (dodge.tx || dodge.tz)) {
    // The car has gone: back to where it was going.
    dodge.tx = 0;
    dodge.tz = 0;
    dodge.span = 0;
  }

  const mx = dodge.tx - dodge.x;
  const mz = dodge.tz - dodge.z;
  const left = Math.hypot(mx, mz);
  if (left < 1e-3) {
    dodge.x = dodge.tx;
    dodge.z = dodge.tz;
    return { x: x + dodge.x, z: z + dodge.z, moving: null, facing: null };
  }
  const running = dodge.span > 0;
  // Off at a run straight away, slowing as it gets clear.
  const pace = running ? run * Math.max(0.35, Math.min(1, left / (dodge.span * 0.4))) : back;
  const step = Math.min(left, pace * dt);
  dodge.x += (mx / left) * step;
  dodge.z += (mz / left) * step;
  return { x: x + dodge.x, z: z + dodge.z, moving: running ? 'run' : 'walk', facing: Math.atan2(-mz, mx) };
}
