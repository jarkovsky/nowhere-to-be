// Copies of the garage's vehicles, for the friends at the depot. Full copies drive like the
// player's car, with their lamps and trailers, and are borrowed from a small pool as they are
// needed. Merged copies, one mesh each, stand still in the bays and cost little.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { angleDelta, clamp, damp } from '../core/math.js';
import { createSteering, steer } from '../core/steering.js';
import { chassisPose, settleWheels } from '../core/suspension.js';
import { createTrailerState, stepTrailer } from '../core/trailer.js';
import { drivingHeight } from '../world/terrain.js';
import { createCar } from './car.js';

const flat = () => 0;
const box = new THREE.Box3();
const part = new THREE.Box3();

/**
 * A copy of the player's car, without what would make it cost more than it needs to: its lamps
 * glow but cast no beam, and it stays clean, as the mud on the player's car is placed from where
 * the player's car is and would land in the wrong places on a copy.
 */
function createCopy() {
  const car = createCar({ mud: false, headlight: false });
  car.root.rotation.order = 'YXZ';
  return {
    car,
    vehicle: null,
    color: null,
    busy: false,
    wheelbase: 0,
    /** Where its trailer is; `ready` false puts it straight behind next time. */
    trailer: createTrailerState(),
    lean: { pitch: 0, roll: 0, speed: 0, heading: 0 },
    steering: createSteering(0),
    hitch: new THREE.Vector3(),
    point: new THREE.Vector3(),
  };
}

/** Hangs the trailer from the lorry's hitch and lets it follow on behind, as the player's does. */
function hangTrailer(copy, heading, speed, sample) {
  const { car, trailer, hitch, point } = copy;
  const { root, axles, spec } = car.trailer;
  const { radius } = spec.wheel;
  car.root.localToWorld(hitch.set(...spec.hitch));
  const moved = Math.hypot(hitch.x - trailer.x, hitch.z - trailer.z);
  stepTrailer(trailer, hitch, heading, spec.axle);
  const sin = Math.sin(trailer.heading);
  const cos = Math.cos(trailer.heading);
  const ground = (lx, lz) => sample(hitch.x + cos * lx + sin * lz, hitch.z - sin * lx + cos * lz);
  const left = ground(-spec.track / 2, spec.axle);
  const right = ground(spec.track / 2, spec.axle);
  const drop = (left + right) / 2 + radius + 0.01 - hitch.y - spec.rest;
  root.position.copy(hitch);
  root.rotation.set(
    Math.asin(clamp(-drop / spec.axle, -0.5, 0.5)),
    trailer.heading,
    Math.atan((right - left) / spec.track),
    'YXZ',
  );
  root.updateMatrixWorld();
  const roll = moved < 5 ? moved * Math.sign(speed) : 0;
  for (const axle of axles) {
    const under = (ground(-spec.track / 2, axle.z) + ground(spec.track / 2, axle.z)) / 2 + radius + 0.01;
    const height = root.localToWorld(point.set(0, spec.rest, axle.z)).y;
    axle.pivot.position.y = spec.rest + clamp(under - height, -0.24, 0.13);
    axle.spin.rotation.x -= roll / radius;
  }
}

/**
 * Puts a copy at `at` ({ x, z, heading, speed }) on the ground under it, leaning into bends and
 * steering round them, its trailer following on. With `settle` each wheel finds the ground too,
 * which is only worth doing where it can be seen.
 */
export function poseCopy(copy, { x, z, heading, speed }, dt, settle) {
  const { car, lean } = copy;
  // Up on the top of the rock fin and the arch once it has driven onto it, like the car.
  copy.level = drivingHeight(x, z, copy.level ?? -Infinity);
  const surface = (px, pz) => drivingHeight(px, pz, copy.level);
  const ground = chassisPose(x, z, heading, surface);
  car.root.position.set(x, ground.height, z);
  car.root.rotation.y = heading;
  car.root.rotation.x = dt ? damp(car.root.rotation.x, ground.pitch, 14, dt) : ground.pitch;
  car.root.rotation.z = dt ? damp(car.root.rotation.z, ground.roll, 14, dt) : ground.roll;
  if (dt > 0) {
    const accel = (speed - lean.speed) / dt;
    const yawRate = angleDelta(lean.heading, heading) / dt;
    lean.pitch = damp(lean.pitch, clamp(accel * 0.006, -0.05, 0.04), 6, dt);
    lean.roll = damp(lean.roll, clamp(-yawRate * speed * 0.0045, -0.06, 0.06), 6, dt);
  }
  lean.speed = speed;
  lean.heading = heading;
  car.body.rotation.set(lean.pitch, 0, lean.roll);
  // The front wheels turn as far as the bend needs.
  const angle = steer(copy.steering, heading, speed, dt);
  for (const wheel of car.wheels) {
    wheel.pivot.rotation.y = wheel.front ? angle : 0;
    wheel.spin.rotation.x -= (speed * dt) / wheel.radius;
  }
  if (settle) settleWheels(car, surface);
  else car.root.updateMatrixWorld();
  if (car.trailer) hangTrailer(copy, heading, speed, surface);
}

export function createCopies(scene) {
  const pool = [];
  const sizes = new Map();
  const statues = new Map();

  function idle() {
    let copy = pool.find(c => !c.busy);
    if (!copy) pool.push((copy = createCopy()));
    return copy;
  }

  function dress(copy, vehicle, color) {
    if (copy.vehicle === vehicle && copy.color === color) return;
    copy.car.customize(color, [], vehicle);
    copy.vehicle = vehicle;
    copy.color = color;
    const axles = copy.car.wheels.map(wheel => wheel.pivot.position.z);
    copy.wheelbase = Math.max(...axles) - Math.min(...axles);
    copy.steering = createSteering(copy.wheelbase);
    copy.trailer.ready = false;
  }

  /** Stands a copy still on flat ground at the origin, facing -Z, its wheels down and its trailer straight. */
  function standStill(copy) {
    const { car } = copy;
    car.root.position.set(0, -0.06, 0);
    car.root.rotation.set(0, 0, 0);
    car.body.rotation.set(0, 0, 0);
    for (const wheel of car.wheels) wheel.pivot.rotation.y = 0;
    settleWheels(car, flat);
    copy.trailer.ready = false;
    if (car.trailer) hangTrailer(copy, 0, 0, flat);
    car.root.updateMatrixWorld(true);
    car.towed.updateMatrixWorld(true);
  }

  return {
    /**
     * How big a vehicle is: from its middle to its nose and to its tail (the trailer's), half
     * its width, its height and its wheelbase; whether it is a lorry, and the horn it has.
     */
    sizeOf(vehicle) {
      if (sizes.has(vehicle)) return sizes.get(vehicle);
      const copy = idle();
      dress(copy, vehicle, 'orange');
      standStill(copy);
      box.makeEmpty();
      const add = mesh => {
        if (!mesh.isMesh) return;
        mesh.geometry.boundingBox ?? mesh.geometry.computeBoundingBox();
        box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
      };
      copy.car.root.traverseVisible(add);
      copy.car.towed.traverseVisible(add);
      const size = {
        front: -box.min.z,
        back: box.max.z,
        half: Math.min(1.3, Math.max(-box.min.x, box.max.x)),
        height: box.max.y,
        wheelbase: copy.wheelbase,
        lorry: Boolean(copy.car.trailer),
        horn: copy.car.spec.voice?.horn ?? 'beep',
      };
      sizes.set(vehicle, size);
      return size;
    },

    /** The vehicle as one merged geometry, standing as it parks, its origin under its middle. */
    statueOf(vehicle, color) {
      const key = `${vehicle}|${color}`;
      if (statues.has(key)) return statues.get(key);
      const copy = idle();
      dress(copy, vehicle, color);
      standStill(copy);
      const pieces = [];
      const add = mesh => {
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        for (const name of Object.keys(geometry.attributes)) {
          if (name !== 'position' && name !== 'normal' && name !== 'color') geometry.deleteAttribute(name);
        }
        // Parts painted with a material's colour take it on as theirs, shaded by their own if they have one.
        const { r, g, b } = mesh.material.color;
        if (!mesh.material.vertexColors || !geometry.attributes.color) {
          const colors = new Float32Array(geometry.attributes.position.count * 3);
          for (let i = 0; i < colors.length; i += 3) colors.set([r, g, b], i);
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        } else if (r !== 1 || g !== 1 || b !== 1) {
          const colors = geometry.attributes.color;
          for (let i = 0; i < colors.count; i++) {
            colors.setXYZ(i, colors.getX(i) * r, colors.getY(i) * g, colors.getZ(i) * b);
          }
        }
        pieces.push(geometry.applyMatrix4(mesh.matrixWorld));
      };
      copy.car.root.traverseVisible(add);
      copy.car.towed.traverseVisible(add);
      const geometry = mergeGeometries(pieces);
      geometry.computeBoundingSphere();
      statues.set(key, geometry);
      return geometry;
    },

    /** A full copy dressed as `vehicle`, in the scene, to drive. */
    borrow(vehicle, color, heading) {
      const copy = idle();
      copy.busy = true;
      dress(copy, vehicle, color);
      copy.trailer.ready = false;
      Object.assign(copy.lean, { pitch: 0, roll: 0, speed: 0, heading });
      Object.assign(copy.steering, { angle: 0, heading });
      scene.add(copy.car.root, copy.car.towed);
      return copy;
    },

    giveBack(copy) {
      scene.remove(copy.car.root, copy.car.towed);
      copy.busy = false;
    },

    /** Dresses a borrowed copy as another vehicle, or in another paint. */
    dress,
  };
}
