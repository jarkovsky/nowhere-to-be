// Other travellers drive the trail loop in both directions, keeping to their
// side of the road and slowing for the player, each other, ducks and anything
// else that blocks the way.
import * as THREE from 'three';
import { damp } from '../core/math.js';
import { chassisPose } from '../core/suspension.js';
import { ROAD } from '../world/layout.js';
import { headingOf } from '../world/path.js';
import { drivingHeight } from '../world/terrain.js';
import { PartsBuilder } from '../world/build.js';
import { createWheel } from './car.js';

/** How far from the middle of the trail the other travellers drive. */
export const LANE = 2.3;
/** How much room a traveller leaves between its front and whatever it is waiting behind. */
const FOLLOW_GAP = 5.7;

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
  const paint = '#b5533c';
  const glass = '#4b6a6c';
  parts.box(2.0, 0.7, 4.8, paint, { y: 1.05 });
  // Cab: painted up to the window line, then glass on all four sides between the pillars.
  parts.box(1.9, 0.35, 1.8, paint, { y: 1.57, z: -0.6 });
  parts.box(1.84, 0.62, 1.74, glass, { y: 2.06, z: -0.6 });
  for (const x of [-0.93, 0.93]) {
    for (const z of [-1.46, 0.26]) parts.box(0.1, 0.64, 0.12, paint, { x, y: 2.06, z });
  }
  parts.box(1.96, 0.12, 1.86, paint, { y: 2.42, z: -0.6 }); // roof
  parts.box(1.95, 0.45, 0.1, '#8e3f2e', { y: 1.6, z: 0.95 });
  for (const x of [-0.95, 0.95]) parts.box(0.1, 0.5, 2.2, '#8e3f2e', { x, y: 1.6, z: 1.3 }); // bed sides
  parts.box(1.95, 0.5, 0.1, '#8e3f2e', { y: 1.6, z: 2.37 }); // tailgate
  parts.box(2.1, 0.2, 0.25, '#e7dfc8', { y: 0.75, z: -2.45 });
  parts.box(2.1, 0.2, 0.25, '#e7dfc8', { y: 0.75, z: 2.45 });
  // A canoe on a rack that stands on the bed rails, with its bow resting on a bar on the cab roof.
  for (const z of [0.55, 2.25]) {
    for (const x of [-0.92, 0.92]) parts.box(0.08, 0.72, 0.08, '#4a4a40', { x, y: 2.21, z });
    parts.box(1.92, 0.08, 0.08, '#4a4a40', { y: 2.57, z });
  }
  parts.box(1.7, 0.08, 0.08, '#4a4a40', { y: 2.52, z: -1.1 }); // roof bar
  parts.add(new THREE.SphereGeometry(1, 12, 6), '#5f8a52', { y: 2.82, z: 0.5, sx: 0.45, sy: 0.28, sz: 2.6 }); // upside down
  return { parts, wheelX: 1.0, wheelZ: [-1.55, 1.6], wheelRadius: 0.52, length: 4.9 };
}

function saloon() {
  const parts = new PartsBuilder();
  const paint = '#e9e2cf';
  parts.box(1.76, 0.56, 4.1, paint, { y: 0.86 });
  parts.box(1.66, 0.12, 1.1, paint, { y: 1.2, z: -1.45 });
  parts.box(1.66, 0.12, 0.8, paint, { y: 1.2, z: 1.62 });
  parts.box(1.6, 0.52, 1.95, '#4b6a6c', { y: 1.5, z: 0.2 });
  for (const x of [-0.8, 0.8]) {
    for (const z of [-0.74, 0.2, 1.14]) parts.box(0.08, 0.54, 0.1, paint, { x, y: 1.5, z });
    parts.box(0.04, 0.04, 3.8, '#b8bcb5', { x: x * 1.105, y: 0.98 });
  }
  parts.box(1.64, 0.08, 2.02, paint, { y: 1.8, z: 0.2 });
  parts.box(1.9, 0.16, 0.16, '#b8bcb5', { y: 0.74, z: -2.08 });
  parts.box(1.9, 0.16, 0.16, '#b8bcb5', { y: 0.74, z: 2.08 });
  return { parts, wheelX: 0.9, wheelZ: [-1.3, 1.28], wheelRadius: 0.42, length: 4.2, lampY: 0.98 };
}

/** A country bus, cream with an orange stripe. */
function bus() {
  const parts = new PartsBuilder();
  const cream = '#efe6cc';
  const stripe = '#d0773b';
  const glass = '#4b6a6c';
  parts.box(2.45, 1.2, 9.4, cream, { y: 1.15 });
  parts.box(2.47, 0.3, 9.42, stripe, { y: 1.3 });
  parts.box(2.45, 1.15, 9.4, cream, { y: 2.35 });
  parts.box(2.47, 0.8, 7.6, glass, { y: 2.4, z: 0.6 }); // side windows
  for (let z = -2.6; z <= 4.2; z += 1.36) parts.box(2.49, 0.82, 0.12, cream, { y: 2.4, z });
  parts.box(2.2, 1.1, 0.08, glass, { y: 2.3, z: -4.71 }); // windscreen
  parts.box(2.3, 0.36, 9.2, '#e2d7b8', { y: 3.08 }); // roof
  parts.box(1.2, 0.32, 0.06, '#2f3430', { y: 3.1, z: -4.72 }); // destination board
  parts.box(2.5, 0.22, 0.25, '#8e8b80', { y: 0.62, z: -4.75 });
  parts.box(2.5, 0.22, 0.25, '#8e8b80', { y: 0.62, z: 4.75 });
  return { parts, wheelX: 1.05, wheelZ: [-3, 3], wheelRadius: 0.55, length: 9.6 };
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
    lamp.position.set(x, model.lampY ?? 1.2, -model.length / 2 - 0.01);
    root.add(lamp);
  }
  root.traverse(child => {
    if (child.isMesh) child.castShadow = true;
  });
  // Circles along the body for collisions, close enough together to leave no gaps.
  const circles = Math.max(2, Math.ceil(model.length / 2.2));
  const along = Array.from({ length: circles }, (_, i) => (i / (circles - 1) - 0.5) * (model.length - 2.2));
  return { root, wheels, lamps, radius: model.wheelRadius, length: model.length, along };
}

export function createTraffic(scene) {
  const travellers = [
    { ...createVehicle(camperVan()), s: ROAD.length * 0.3, direction: 1, cruise: 7.5 },
    { ...createVehicle(saloon()), s: ROAD.length * 0.8, direction: 1, cruise: 7.5 },
    { ...createVehicle(pickup()), s: ROAD.length * 0.75, direction: -1, cruise: 8.5 },
    { ...createVehicle(bus()), s: ROAD.length * 0.2, direction: -1, cruise: 8.5 },
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
        for (const other of travellers) {
          if (other !== t)
            gap = Math.min(gap, gapTo(t, other.root.position.x, other.root.position.z) - other.length / 2);
        }
        for (const blocker of blockers) gap = Math.min(gap, gapTo(t, blocker.x, blocker.z));
        const target = Math.min(t.cruise, Math.max(0, (gap - t.length / 2 - FOLLOW_GAP) * 0.6));
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
        for (const offset of t.along) colliders.push({ x: p.x - sin * offset, z: p.z - cos * offset, radius: 1.15 });
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
