// Two other travellers drive the trail loop in opposite directions, keeping to
// their side of the road and slowing for the player, each other and ducks.
import * as THREE from 'three';
import { damp } from '../core/math.js';
import { chassisPose } from '../core/suspension.js';
import { ROAD } from '../world/layout.js';
import { headingOf } from '../world/path.js';
import { drivingHeight } from '../world/terrain.js';
import { PartsBuilder } from '../world/build.js';
import { createWheel } from './car.js';

const LANE = 2.3;
const FOLLOW_DISTANCE = 8;

function camperVan() {
  const parts = new PartsBuilder();
  parts.box(2.05, 1.05, 4.5, '#5c9a96', { y: 1.15 });
  parts.box(2.05, 0.95, 4.3, '#efe6cc', { y: 2.15, z: 0.1 });
  parts.box(2.07, 0.6, 3.1, '#4b6a6c', { y: 2.2, z: 0.55 }); // side windows
  parts.box(1.8, 0.62, 0.08, '#4b6a6c', { y: 2.2, z: -2.11, rx: -0.12 }); // windscreen
  parts.box(1.9, 0.18, 3.6, '#e2d7b8', { y: 2.72, z: 0.3 }); // pop-top roof
  parts.box(2.12, 0.2, 0.25, '#e7dfc8', { y: 0.72, z: -2.3 });
  parts.box(2.12, 0.2, 0.25, '#e7dfc8', { y: 0.72, z: 2.3 });
  parts.add(new THREE.CircleGeometry(0.28, 10), '#efe6cc', { y: 1.45, z: -2.26, ry: Math.PI }); // badge
  return { parts, wheelX: 0.95, wheelZ: [-1.5, 1.55], wheelRadius: 0.46, length: 4.6 };
}

function pickup() {
  const parts = new PartsBuilder();
  parts.box(2.0, 0.7, 4.8, '#b5533c', { y: 1.05 });
  parts.box(1.9, 0.95, 1.8, '#b5533c', { y: 1.85, z: -0.6 }); // cab
  parts.box(1.92, 0.55, 1.5, '#4b6a6c', { y: 1.95, z: -0.6 });
  parts.box(1.95, 0.45, 0.1, '#8e3f2e', { y: 1.6, z: 0.95 });
  for (const x of [-0.95, 0.95]) parts.box(0.1, 0.5, 2.2, '#8e3f2e', { x, y: 1.6, z: 1.3 }); // bed sides
  parts.box(2.1, 0.2, 0.25, '#e7dfc8', { y: 0.75, z: -2.45 });
  parts.box(2.1, 0.2, 0.25, '#e7dfc8', { y: 0.75, z: 2.45 });
  // A canoe on a rack over the bed.
  for (const z of [-0.6, 2]) parts.box(1.8, 0.08, 0.08, '#4a4a40', { y: 2.45, z });
  parts.add(new THREE.SphereGeometry(1, 10, 4), '#5f8a52', { y: 2.7, z: 0.6, sx: 0.42, sy: 0.22, sz: 2.6 });
  return { parts, wheelX: 1.0, wheelZ: [-1.55, 1.6], wheelRadius: 0.52, length: 4.9 };
}

function createVehicle(model) {
  const root = new THREE.Group();
  const body = model.parts.mesh();
  root.add(body);
  const wheels = [];
  for (const x of [-model.wheelX, model.wheelX]) {
    for (const z of model.wheelZ) {
      const wheel = createWheel(model.wheelRadius, 0.36);
      wheel.pivot.position.set(x, model.wheelRadius, z);
      root.add(wheel.pivot);
      wheels.push(wheel);
    }
  }
  const lamps = new THREE.MeshLambertMaterial({ color: '#fff3ce', emissive: '#ffd88e', emissiveIntensity: 0.2 });
  for (const x of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.06), lamps);
    lamp.position.set(x, 1.2, -model.length / 2 - 0.01);
    root.add(lamp);
  }
  root.traverse(child => {
    if (child.isMesh) child.castShadow = true;
  });
  return { root, wheels, lamps, radius: model.wheelRadius, length: model.length };
}

export function createTraffic(scene) {
  const travellers = [
    { ...createVehicle(camperVan()), s: ROAD.length * 0.3, direction: 1, cruise: 7.5 },
    { ...createVehicle(pickup()), s: ROAD.length * 0.75, direction: -1, cruise: 8.5 },
  ].map(t => ({ ...t, speed: t.cruise, honkAt: null, flash: 0 }));
  for (const t of travellers) scene.add(t.root);

  /** How far ahead of a traveller a point is along its lane, or Infinity if not in the way. */
  function gapTo(t, x, z) {
    const near = ROAD.nearest(x, z);
    if (near.distance > 9 || Math.abs(near.side - t.direction * LANE) > 3.4) return Infinity;
    const ahead = ROAD.wrap((near.s - t.s) * t.direction);
    return ahead < 40 ? ahead : Infinity;
  }

  const colliders = [];
  return {
    /** Circles the player's car collides with. */
    colliders,
    update(dt, { player, blockers = [], night }) {
      colliders.length = 0;
      for (const t of travellers) {
        let gap = gapTo(t, player.x, player.z);
        for (const other of travellers)
          if (other !== t) gap = Math.min(gap, gapTo(t, other.root.position.x, other.root.position.z));
        for (const blocker of blockers) gap = Math.min(gap, gapTo(t, blocker.x, blocker.z));
        const target = Math.min(t.cruise, Math.max(0, (gap - FOLLOW_DISTANCE) * 0.6));
        t.speed = damp(t.speed, target, target < t.speed ? 4 : 0.8, dt);
        t.s = ROAD.wrap(t.s + t.speed * t.direction * dt);

        const p = ROAD.offset(t.s, t.direction * LANE);
        const heading = headingOf(p.dx * t.direction, p.dz * t.direction);
        const pose = chassisPose(p.x, p.z, heading, drivingHeight);
        t.root.position.set(p.x, pose.height + 0.06, p.z);
        t.root.rotation.set(pose.pitch, heading, pose.roll, 'YXZ');
        for (const wheel of t.wheels) wheel.spin.rotation.x -= (t.speed * dt) / t.radius;

        if (t.honkAt !== null && (t.honkAt -= dt) <= 0) {
          t.honkAt = null;
          t.flash = 0.8;
          t.onHonk?.();
        }
        t.flash = Math.max(0, t.flash - dt);
        t.lamps.emissiveIntensity = 0.2 + night * 1.4 + (t.flash > 0 && Math.sin(t.flash * 30) > 0 ? 2 : 0);

        const sin = Math.sin(heading);
        const cos = Math.cos(heading);
        for (const end of [-1, 1]) {
          colliders.push({ x: p.x - sin * end * t.length * 0.27, z: p.z - cos * end * t.length * 0.27, radius: 1.15 });
        }
      }
    },
    /** Travellers within earshot answer a honk with one of their own. */
    answerHonk(x, z, respond) {
      let answered = false;
      for (const t of travellers) {
        if (t.honkAt === null && Math.hypot(t.root.position.x - x, t.root.position.z - z) < 32) {
          t.honkAt = 0.45 + Math.random() * 0.3;
          t.onHonk = respond;
          answered = true;
        }
      }
      return answered;
    },
    getState: () => travellers.map(t => ({ x: t.root.position.x, z: t.root.position.z, speed: t.speed })),
  };
}
