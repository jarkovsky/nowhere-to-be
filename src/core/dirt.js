// How dirty the car is, from 0 (clean) to 1. Driving off the trail leaves it dusty, puddles
// and mud cake it, and water and rain wash it clean again.

/** How fast each surface dirties the car, per second at a fair pace, and how dirty it can make it. */
const DIRTYING = {
  mud: { rate: 0.45, most: 1 },
  puddle: { rate: 0.3, most: 0.8 },
  grass: { rate: 0.012, most: 0.4 },
  crop: { rate: 0.012, most: 0.4 },
  sand: { rate: 0.02, most: 0.45 },
  track: { rate: 0.01, most: 0.4 },
  leaves: { rate: 0.01, most: 0.4 },
  road: { rate: 0.003, most: 0.25 },
};

/** How fast water and snow wash it, per second. */
const WASHING = { water: 0.6, snow: 0.01 };

/** The car's dirt after `dt` seconds on `surface` at `speed` m/s, with `rain` from 0 to 1. */
export function stepDirt(dirt, { surface, speed, rain = 0 }, dt) {
  const pace = Math.min(1, Math.abs(speed) / 6);
  const dirtying = DIRTYING[surface];
  if (dirtying && dirt < dirtying.most) dirt = Math.min(dirtying.most, dirt + dirtying.rate * pace * dt);
  // Water washes it even when the car only creeps through.
  dirt -= (WASHING[surface] ?? 0) * (0.4 + 0.6 * pace) * dt;
  dirt -= rain * 0.03 * dt;
  return Math.min(1, Math.max(0, dirt));
}
