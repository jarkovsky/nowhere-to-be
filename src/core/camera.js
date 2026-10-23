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
  // Offsets for keeping something else in view as well as the car, such as the tractor
  // coming to pull it out of the mud, and how far the view looks over towards it.
  const framing = { yaw: 0, pitch: 0, zoom: 1, toward: 0 };

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

  /**
   * Swings the camera round to look past the car at `watch` ({ x, z }), from further back and
   * higher up, or back behind the car once there is nothing to watch. `watch` can also say how
   * far back (`zoom`), how much higher (`pitch`), how far over towards it to look (`toward`), how
   * far round the car it may swing (`turn`, in radians from behind it), how slowly (`ease`, below
   * 1 for slower), and whether to look straight on past the car while it swings rather than over
   * towards the point (`past`), which keeps the car in the middle of a narrow screen.
   */
  function frame(car, watch, dt) {
    const { zoom = 1.3, pitch = 0.16, toward = 0.35, turn = 2.6, ease = 1 } = watch ?? {};
    // How far round the car it swings: the shortest way from where the camera is now, so it never
    // flips round, and over and above any other swing (dragging, or looking back at friends).
    let aim = 0;
    if (watch) {
      const swung = orbit.yaw + framing.yaw;
      const wanted = swung + angleDelta(heading + swung, Math.atan2(car.x - watch.x, car.z - watch.z));
      aim = clamp(wanted, -turn, turn) - orbit.yaw;
    }
    const rate = watch ? ease : 1;
    framing.yaw = damp(framing.yaw, aim, 1.2 * rate, dt);
    framing.pitch = damp(framing.pitch, watch ? pitch : 0, rate, dt);
    framing.zoom = damp(framing.zoom, watch ? zoom : 1, rate, dt);
    // On the way back it looks at the car again first, so the car stays in view as it swings round.
    framing.toward = damp(framing.toward, watch ? toward : 0, watch ? 1.5 * ease : 3, dt);
    if (watch && watch.past) {
      const reach = Math.hypot(watch.x - car.x, watch.z - car.z);
      const facing = heading + orbit.yaw + framing.yaw;
      Object.assign(framing, { x: car.x - Math.sin(facing) * reach, z: car.z - Math.cos(facing) * reach });
    } else if (watch) {
      Object.assign(framing, { x: watch.x, z: watch.z });
    }
  }

  /** `car.scale` stands the camera further back and higher for the lorries, to see over their trailers. */
  function chaseGoal(car, compact) {
    const speedFactor = clamp(Math.abs(car.speed) / 14, 0, 1);
    const scale = car.scale ?? 1;
    const distance = ((compact ? 17 : 14) + speedFactor * 2.5) * scale;
    const height = ((compact ? 7.5 : 6) + speedFactor * 0.8) * scale ** 1.8;
    // Directly behind the car along its (smoothed) heading, unless the player has swung it round.
    const elevation = clamp(Math.atan2(height, distance) + orbit.pitch + framing.pitch, 0.06, 1.25);
    const boom = Math.hypot(distance, height) * orbit.zoom * framing.zoom;
    aroundCar(car, heading + orbit.yaw + framing.yaw, elevation, boom, 0);
    // Look ahead of the car normally; at the car itself while looking around.
    const ahead = 3 * scale * (1 - clamp(Math.abs(orbit.yaw + framing.yaw) / 0.6, 0, 1));
    look.set(
      car.x - Math.sin(car.heading) * ahead * scale,
      car.y + 2 * scale,
      car.z - Math.cos(car.heading) * ahead * scale,
    );
    // Over towards whatever else is being watched.
    if (framing.toward > 0.001) {
      look.x += (framing.x - look.x) * framing.toward;
      look.z += (framing.z - look.z) * framing.toward;
    }
    origin.set(car.x, car.y + 1.8, car.z);
  }

  /** The garage view: a close orbit around the parked car that turns slowly by itself. */
  function showroomGoal(car, dt, compact) {
    if (!orbit.dragging && orbit.idle > 2.5) orbit.yaw += dt * 0.22;
    const elevation = clamp(0.28 + orbit.pitch, 0.05, 1.2);
    const scale = car.scale ?? 1;
    aroundCar(car, car.heading + 2.4 + orbit.yaw, elevation, (compact ? 13 : 9.5) * scale * orbit.zoom, 1.1 * scale);
    look.set(car.x, car.y + 1.4 * scale, car.z);
    origin.set(car.x, car.y + 1.4 * scale, car.z);
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
      Object.assign(framing, { yaw: 0, pitch: 0, zoom: 1, toward: 0 });
      this.update(0, car, { ...options, snap: true });
    },
    update(dt, car, { compact = false, intro, camp, shot, watch = null, snap = false }) {
      blend = Math.min(1, blend + dt * 0.6);
      if (!orbit.dragging) orbit.idle += dt;
      if (mode === 'chase') {
        heading += angleDelta(heading, car.heading) * (1 - Math.exp(-2.6 * dt));
        // Once the player lets go, the view drifts back behind the car, or round to `car.turn`
        // (to look back past the car at friends waiting behind it).
        if (!orbit.dragging && orbit.idle > 1.2) {
          const settle = Math.abs(car.speed) > 1 ? 2.2 : 0.9;
          orbit.yaw = damp(angleDelta(0, orbit.yaw), car.turn ?? 0, settle, dt);
          orbit.pitch = damp(orbit.pitch, 0, settle, dt);
          orbit.zoom = damp(orbit.zoom, 1, settle * 0.5, dt);
        }
        frame(car, watch, dt);
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
