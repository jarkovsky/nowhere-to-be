import { SPAWN, LAKE, lakeDistance, terrainHeight } from './terrain.js';
export function createCarState() { return { ...SPAWN, speed: 0, distance: 0, steering: 0 }; }
export function resetCar(state) { Object.assign(state, SPAWN, { speed: 0, steering: 0 }); }
export function isDriveable(x,z) {
  const shore=lakeDistance(x,z);
  return shore>=1.10 && (shore>1.5 || terrainHeight(x,z)>=LAKE.y+.7) && Math.hypot(x,z)<=355;
}
export function stepDriving(state, input, dt, obstacles = []) {
  dt = Math.min(Math.max(dt, 0), .05);
  const target = input.brake ? 0 : input.backward ? -5 : input.forward ? 13 : input.explorer ? 6 : 0;
  const rate = input.brake ? 7 : target === 0 ? 3.2 : 1.3;
  state.speed += (target - state.speed) * (1 - Math.exp(-rate * dt));
  if (Math.abs(state.speed) < .025) state.speed = 0;
  const steer = Number(input.left || 0) - Number(input.right || 0);
  state.steering += (steer - state.steering) * (1 - Math.exp(-9 * dt));
  state.heading += state.steering * Math.min(Math.abs(state.speed) / 4, 1) * Math.sign(state.speed) * 1.15 * dt;
  const oldX = state.x, oldZ = state.z;
  let nx = state.x - Math.sin(state.heading) * state.speed * dt;
  let nz = state.z - Math.cos(state.heading) * state.speed * dt;
  // Water and world boundaries softly stop the car. Reversing always remains available.
  const unsafe = !isDriveable(nx,nz);
  if (unsafe) { state.speed *= .35; nx = oldX; nz = oldZ; }
  for (const o of obstacles) {
    const dx = nx - o.x, dz = nz - o.z, r = o.radius + 1.05;
    const d = Math.hypot(dx, dz);
    if (d < r) {
      nx = o.x + (d > .001 ? dx / d : 1) * r;
      nz = o.z + (d > .001 ? dz / d : 0) * r;
      state.speed *= .9;
    }
  }
  // Collision displacement must not push the car into the water or past the boundary.
  if (isDriveable(nx,nz)) { state.x = nx; state.z = nz; }
  state.distance += Math.hypot(state.x - oldX, state.z - oldZ);
  return unsafe;
}
