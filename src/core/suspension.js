// Fits the car body to the ground under its four wheels, then drops each
// faceted tyre onto the exact triangle beneath it.
import * as THREE from 'three';

const TRACK = 2.16;
const FRONT_Z = -1.2;
const REAR_Z = 1.24;
const CONTACT_CLEARANCE = 0.012;

/** How far each wheel can move from its rest height: up into the arch, and down. */
export const TRAVEL = { rest: 0.65, up: 0.13, down: 0.24 };

/** Height, pitch and roll of a chassis at (x, z) facing `heading` on the surface `sample`. */
export function chassisPose(x, z, heading, sample) {
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  const at = (lx, lz) => sample(x + cos * lx + sin * lz, z - sin * lx + cos * lz);
  const fl = at(-TRACK / 2, FRONT_Z);
  const fr = at(TRACK / 2, FRONT_Z);
  const bl = at(-TRACK / 2, REAR_Z);
  const br = at(TRACK / 2, REAR_Z);
  // A positive X rotation raises the front of a car facing -Z.
  const pitch = Math.atan2((fl + fr - bl - br) / 2, REAR_Z - FRONT_Z);
  const sideSlope = (fr + br - fl - bl) / (2 * TRACK);
  return { height: (fl + fr + bl + br) / 4 - 0.06, pitch, roll: Math.atan(sideSlope * Math.cos(pitch)) };
}

const vertex = new THREE.Vector3();
const up = new THREE.Vector3();

/** The outermost ring of tyre vertices: the only ones that can touch the ground. */
function rimPoints(tire) {
  const position = tire.geometry.attributes.position;
  const points = [];
  let radius = 0;
  for (let i = 0; i < position.count; i++) radius = Math.max(radius, Math.hypot(position.getX(i), position.getZ(i)));
  for (let i = 0; i < position.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(position, i);
    if (Math.hypot(point.x, point.z) > radius * 0.98 && !points.some(p => p.distanceToSquared(point) < 1e-6))
      points.push(point);
  }
  return points;
}

/** Moves one wheel along the suspension axis until its tyre rests on the ground. */
function settleWheel(wheel, sample) {
  wheel.rim ??= rimPoints(wheel.tire);
  for (let iteration = 0; iteration < 4; iteration++) {
    wheel.tire.updateWorldMatrix(true, false);
    let clearance = Infinity;
    for (const point of wheel.rim) {
      vertex.copy(point).applyMatrix4(wheel.tire.matrixWorld);
      clearance = Math.min(clearance, vertex.y - sample(vertex.x, vertex.z));
    }
    const correction = (CONTACT_CLEARANCE - clearance) / up.y;
    wheel.pivot.position.y += correction;
    if (Math.abs(correction) < 0.0005) break;
  }
}

/**
 * Drops each tyre onto the ground beneath it, accounting for wheel spin,
 * steering, body pitch and roll, and sharp crests. If a wheel would have to
 * rise further into its arch than the suspension allows, the whole car is
 * lifted instead; a wheel over a dip hangs at full droop.
 */
export function settleWheels(car, sample) {
  car.root.updateWorldMatrix(true, true);
  up.set(0, 1, 0).applyQuaternion(car.root.quaternion);
  for (let pass = 0; pass < 2; pass++) {
    let lift = 0;
    for (const wheel of car.wheels) {
      settleWheel(wheel, sample);
      lift = Math.max(lift, wheel.pivot.position.y - TRAVEL.rest - TRAVEL.up);
    }
    if (lift < 0.002) break;
    car.root.position.y += lift * up.y;
    car.root.updateWorldMatrix(true, true);
  }
  for (const wheel of car.wheels) {
    wheel.pivot.position.y = Math.min(
      Math.max(wheel.pivot.position.y, TRAVEL.rest - TRAVEL.down),
      TRAVEL.rest + TRAVEL.up,
    );
    wheel.pivot.updateWorldMatrix(true, true);
  }
}
