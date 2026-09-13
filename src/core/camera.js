// Third-person chase camera on a "spring arm": it trails directly behind the
// car, and pulls in whenever rock (the tunnel, the cliffs) would come between
// the camera and the car, so it never ends up inside a mountain.
import * as THREE from 'three';
import { angleDelta, clamp, damp } from './math.js';

const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const direction = new THREE.Vector3();
const desired = new THREE.Vector3();
const look = new THREE.Vector3();

export function createChaseCamera(camera, { occluders, groundHeight }) {
  let heading = 0;
  let arm = 1; // fraction of the full boom length currently in use
  let mode = 'intro';
  let blend = 1; // eases the switch between modes
  const lookAt = new THREE.Vector3();

  /** Shortens the boom so nothing solid sits between the car and the camera. */
  function clearLineOfSight(from, to) {
    direction.subVectors(to, from);
    const length = direction.length();
    direction.divideScalar(length);
    raycaster.set(from, direction);
    raycaster.far = length;
    const hit = raycaster.intersectObjects(occluders, false)[0];
    return hit ? clamp((hit.distance - 0.8) / length, 0.18, 1) : 1;
  }

  function chaseGoal(car, compact) {
    const speedFactor = clamp(Math.abs(car.speed) / 14, 0, 1);
    const distance = (compact ? 17 : 14) + speedFactor * 2.5;
    const height = (compact ? 7.5 : 6) + speedFactor * 0.8;
    // Directly behind the car, along its (smoothed) heading.
    desired.set(car.x + Math.sin(heading) * distance, car.y + height, car.z + Math.cos(heading) * distance);
    look.set(car.x - Math.sin(car.heading) * 3, car.y + 2, car.z - Math.cos(car.heading) * 3);
    origin.set(car.x, car.y + 1.8, car.z);
    return { distance, height };
  }

  return {
    setMode(next) {
      if (next !== mode) {
        mode = next;
        blend = 0;
      }
    },
    /** Jump straight to the goal (after teleporting the car). */
    snap(car, options) {
      heading = car.heading;
      arm = 1;
      blend = 1;
      this.update(0, car, { ...options, snap: true });
    },
    update(dt, car, { compact = false, intro, camp, shot, snap = false }) {
      blend = Math.min(1, blend + dt * 0.6);
      if (mode === 'chase') {
        heading += angleDelta(heading, car.heading) * (1 - Math.exp(-2.6 * dt));
        chaseGoal(car, compact);
        const free = clearLineOfSight(origin, desired);
        // Pull in instantly when blocked, ease back out once clear.
        arm = free < arm ? free : damp(arm, free, 1.5, dt);
        desired.lerpVectors(origin, desired, arm);
        desired.y = Math.max(desired.y, groundHeight(desired.x, desired.z) + 1.6);
      } else if (mode === 'camp' || mode === 'shot') {
        const view = mode === 'camp' ? camp : shot;
        desired.copy(view.position);
        look.copy(view.target);
      } else {
        desired.copy(intro.position);
        look.copy(intro.target);
      }
      if (snap) {
        camera.position.copy(desired);
        lookAt.copy(look);
      } else {
        // Follow tightly while driving; glide slowly when switching views.
        const rate = mode === 'chase' ? 3 + 9 * blend * blend : 1.2;
        camera.position.lerp(desired, 1 - Math.exp(-rate * dt));
        lookAt.lerp(look, 1 - Math.exp(-(rate + 2) * dt));
        // Smoothing must never drag the camera through rock either.
        if (mode === 'chase') {
          const free = clearLineOfSight(origin, camera.position);
          if (free < 1) camera.position.lerpVectors(origin, camera.position, free);
        }
      }
      camera.lookAt(lookAt);
    },
    /** True when the camera is currently pulled in by an obstacle. */
    isBlocked: () => arm < 0.98,
  };
}
