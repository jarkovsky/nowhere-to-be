// Third-person chase camera on a "spring arm": it trails directly behind the
// car, and pulls in whenever rock (the tunnel, the cliffs) would come between
// the camera and the car, so it never ends up inside a mountain. Dragging
// swings it around the car; it drifts back behind once you let go.
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
  // Offsets from dragging: yaw and pitch in radians, zoom as a factor of the boom length.
  const orbit = { yaw: 0, pitch: 0, zoom: 1, idle: Infinity, dragging: false };

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

  /** Sets `desired` to a point `boom` metres from the car at a yaw and elevation. */
  function aroundCar(car, yaw, elevation, boom, lift) {
    desired.set(
      car.x + Math.sin(yaw) * Math.cos(elevation) * boom,
      car.y + lift + Math.sin(elevation) * boom,
      car.z + Math.cos(yaw) * Math.cos(elevation) * boom,
    );
  }

  function chaseGoal(car, compact) {
    const speedFactor = clamp(Math.abs(car.speed) / 14, 0, 1);
    const distance = (compact ? 17 : 14) + speedFactor * 2.5;
    const height = (compact ? 7.5 : 6) + speedFactor * 0.8;
    // Directly behind the car along its (smoothed) heading, unless the player has swung it round.
    const elevation = clamp(Math.atan2(height, distance) + orbit.pitch, 0.06, 1.25);
    aroundCar(car, heading + orbit.yaw, elevation, Math.hypot(distance, height) * orbit.zoom, 0);
    // Look ahead of the car normally; at the car itself while looking around.
    const ahead = 3 * (1 - clamp(Math.abs(orbit.yaw) / 0.6, 0, 1));
    look.set(car.x - Math.sin(car.heading) * ahead, car.y + 2, car.z - Math.cos(car.heading) * ahead);
    origin.set(car.x, car.y + 1.8, car.z);
  }

  /** The garage view: a close orbit around the parked car that turns slowly by itself. */
  function showroomGoal(car, dt, compact) {
    if (!orbit.dragging && orbit.idle > 2.5) orbit.yaw += dt * 0.22;
    const elevation = clamp(0.28 + orbit.pitch, 0.05, 1.2);
    aroundCar(car, car.heading + 2.4 + orbit.yaw, elevation, (compact ? 13 : 9.5) * orbit.zoom, 1.1);
    look.set(car.x, car.y + 1.4, car.z);
    origin.set(car.x, car.y + 1.4, car.z);
  }

  return {
    setMode(next) {
      if (next === mode) return;
      mode = next;
      blend = 0;
      Object.assign(orbit, { yaw: 0, pitch: 0, zoom: 1, idle: Infinity });
    },
    /** Swing the camera by a drag of (dx, dy) pixels. */
    drag(dx, dy) {
      orbit.yaw -= dx * 0.008;
      orbit.pitch = clamp(orbit.pitch + dy * 0.005, -0.4, 0.9);
      orbit.dragging = true;
      orbit.idle = 0;
    },
    release() {
      orbit.dragging = false;
    },
    zoom(amount) {
      orbit.zoom = clamp(orbit.zoom * Math.exp(amount * 0.001), 0.65, 1.6);
      orbit.idle = 0;
    },
    /** Jump straight to the goal (after teleporting the car). */
    snap(car, options) {
      heading = car.heading;
      arm = 1;
      blend = 1;
      orbit.yaw = 0;
      orbit.pitch = 0;
      this.update(0, car, { ...options, snap: true });
    },
    update(dt, car, { compact = false, intro, camp, shot, snap = false }) {
      blend = Math.min(1, blend + dt * 0.6);
      if (!orbit.dragging) orbit.idle += dt;
      if (mode === 'chase') {
        heading += angleDelta(heading, car.heading) * (1 - Math.exp(-2.6 * dt));
        // Once the player lets go, the view drifts back behind the car.
        if (!orbit.dragging && orbit.idle > 1.2) {
          const settle = Math.abs(car.speed) > 1 ? 2.2 : 0.9;
          orbit.yaw = damp(angleDelta(0, orbit.yaw), 0, settle, dt);
          orbit.pitch = damp(orbit.pitch, 0, settle, dt);
          orbit.zoom = damp(orbit.zoom, 1, settle * 0.5, dt);
        }
        chaseGoal(car, compact);
      } else if (mode === 'showroom') {
        showroomGoal(car, dt, compact);
      } else if (mode === 'camp' || mode === 'shot') {
        const view = mode === 'camp' ? camp : shot;
        desired.copy(view.position);
        look.copy(view.target);
      } else {
        desired.copy(intro.position);
        look.copy(intro.target);
      }
      const followsCar = mode === 'chase' || mode === 'showroom';
      if (followsCar) {
        const free = clearLineOfSight(origin, desired);
        // Pull in instantly when blocked, ease back out once clear.
        arm = free < arm ? free : damp(arm, free, 1.5, dt);
        desired.lerpVectors(origin, desired, arm);
        desired.y = Math.max(desired.y, groundHeight(desired.x, desired.z) + (mode === 'chase' ? 1.6 : 0.8));
      }
      if (snap) {
        camera.position.copy(desired);
        lookAt.copy(look);
      } else {
        // Follow tightly while driving or dragging; glide slowly when switching views.
        const tight = mode === 'chase' || (mode === 'showroom' && blend > 0.6);
        const rate = tight ? 3 + 9 * blend * blend : 1.2;
        camera.position.lerp(desired, 1 - Math.exp(-rate * dt));
        lookAt.lerp(look, 1 - Math.exp(-(rate + 2) * dt));
        // Smoothing must never drag the camera through rock either.
        if (followsCar) {
          const free = clearLineOfSight(origin, camera.position);
          if (free < 1) camera.position.lerpVectors(origin, camera.position, free);
        }
      }
      camera.lookAt(lookAt);
    },
    /** True when the camera is currently pulled in by an obstacle. */
    isBlocked: () => arm < 0.98,
    getMode: () => mode,
  };
}
