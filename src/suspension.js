import * as THREE from 'three';
import { drivingHeight as terrainHeight } from './discoveries.js';

const TRACK = 2.16;
const FRONT_Z = -1.2;
const REAR_Z = 1.24;
const CONTACT_CLEARANCE = .012;

export function chassisPose(x, z, heading, sample = terrainHeight) {
  const sin = Math.sin(heading), cos = Math.cos(heading);
  const at = (lx, lz) => sample(x + cos * lx + sin * lz, z - sin * lx + cos * lz);
  const fl = at(-TRACK / 2, FRONT_Z), fr = at(TRACK / 2, FRONT_Z);
  const bl = at(-TRACK / 2, REAR_Z), br = at(TRACK / 2, REAR_Z);
  // In Three.js, positive X rotation raises the front of a car facing -Z.
  const pitch = Math.atan2((fl + fr - bl - br) / 2, REAR_Z - FRONT_Z);
  const sideSlope = (fr + br - fl - bl) / (2 * TRACK);
  return {
    height: (fl + fr + bl + br) / 4 - .06,
    pitch,
    roll: Math.atan(sideSlope * Math.cos(pitch)),
  };
}

const vertex = new THREE.Vector3();
const suspensionAxis = new THREE.Vector3();
// Place the actual faceted tire against the actual triangular terrain. Sampling
// tire vertices accounts for wheel rotation, steering, banking, and sharp crests.
// Wheels settle immediately; the chassis can still ease into its new attitude.
export function settleWheels(car, sample = terrainHeight) {
  car.root.updateWorldMatrix(true, true);
  suspensionAxis.set(0, 1, 0).applyQuaternion(car.root.quaternion);
  for (const wheel of car.wheels) {
    const positions = wheel.tire.geometry.attributes.position;
    for (let iteration = 0; iteration < 5; iteration++) {
      wheel.tire.updateWorldMatrix(true, false);
      let clearance = Infinity;
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(wheel.tire.matrixWorld);
        clearance = Math.min(clearance, vertex.y - sample(vertex.x, vertex.z));
      }
      const correction = (CONTACT_CLEARANCE - clearance) / suspensionAxis.y;
      wheel.pivot.position.y += correction;
      if (Math.abs(correction) < .0005) break;
    }
    wheel.pivot.updateWorldMatrix(true, true);
  }
}
