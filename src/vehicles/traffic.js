// Other travellers drive the trail loop in both directions, keeping to their
// side of the road and slowing for the player, each other, ducks and anything
// else that blocks the way. Every few minutes an ambulance or a fire engine
// comes by with its blue lights on, and the others pull over to let it pass.
import * as THREE from 'three';
import { damp } from '../core/math.js';
import { chassisPose } from '../core/suspension.js';
import { BRIDGE, ROAD } from '../world/layout.js';
import { headingOf } from '../world/path.js';
import { drivingHeight } from '../world/terrain.js';
import { PartsBuilder } from '../world/build.js';
import { createWheel } from './car.js';

/** How far from the middle of the trail the other travellers drive. */
export const LANE = 2.3;
/** How much room a traveller leaves between its front and whatever it is waiting behind. */
const FOLLOW_GAP = 5.7;
/** How far from the middle a traveller pulls over to let an emergency vehicle by. */
const VERGE = LANE + 1.9;
/** Seconds before the first emergency vehicle, and between later ones. */
const FIRST_CALL = [70, 120];
const BETWEEN_CALLS = [160, 280];
const GLASS = '#4b6a6c';

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

/** An ambulance in Czech colours: sulphur yellow with a green and yellow chequered band. */
function ambulance() {
  const parts = new PartsBuilder();
  const yellow = '#f1dc3c';
  parts.box(2.1, 0.95, 1.5, yellow, { y: 1.05, z: -2.05 }); // bonnet
  parts.box(2.04, 0.8, 1.1, yellow, { y: 1.9, z: -1.75 }); // cab
  parts.box(1.9, 0.62, 0.08, GLASS, { y: 1.95, z: -2.3, rx: -0.18 }); // windscreen
  parts.box(2.06, 0.5, 0.75, GLASS, { y: 2, z: -1.75 }); // cab windows
  parts.box(2.3, 2.3, 3.7, yellow, { y: 1.8, z: 1.05 }); // the box at the back
  for (const x of [-1.16, 1.16]) {
    for (let k = 0; k < 13; k++) {
      for (const row of [0, 1]) {
        const green = (k + row) % 2 === 0;
        parts.box(0.03, 0.4, 0.42, green ? '#2f8f4e' : '#d6e64f', { x, y: 1.05 + row * 0.4, z: -2.7 + k * 0.42 });
      }
    }
    parts.box(0.04, 0.5, 0.8, GLASS, { x: x * 1.005, y: 2.3, z: 0.4 });
  }
  parts.box(2.32, 0.8, 0.04, GLASS, { y: 2.1, z: 2.91 }); // rear windows
  parts.box(0.06, 1.8, 0.05, '#c9cdc6', { y: 1.65, z: 2.93 }); // rear door split
  parts.box(2.2, 0.2, 0.25, '#d8d4c6', { y: 0.62, z: -2.82 }); // bumpers
  parts.box(2.3, 0.2, 0.25, '#d8d4c6', { y: 0.62, z: 2.95 });
  parts.box(1.5, 0.12, 0.34, '#d8d4c6', { y: 2.37, z: -1.75 }); // light bar
  return {
    parts,
    wheelX: 1,
    wheelZ: [-1.85, 1.75],
    wheelRadius: 0.46,
    length: 5.8,
    lampY: 1.15,
    beacons: [
      [-0.5, 2.5, -1.75],
      [0.5, 2.5, -1.75],
      [-1.0, 3.0, 2.85],
      [1.0, 3.0, 2.85],
    ],
  };
}

/** A red fire engine with a white stripe and a ladder on the roof. */
function fireEngine() {
  const parts = new PartsBuilder();
  const red = '#c7312a';
  parts.box(2.45, 0.5, 8, '#2f3430', { y: 0.95 }); // chassis
  parts.box(2.45, 1.9, 2.1, red, { y: 2.05, z: -2.9 }); // cab
  parts.box(2.2, 0.85, 0.08, GLASS, { y: 2.45, z: -3.96 }); // windscreen
  parts.box(2.47, 0.65, 1.6, GLASS, { y: 2.45, z: -2.95 }); // cab windows
  parts.box(2.5, 2.1, 5.3, red, { y: 2.15, z: 1.25 }); // the body, with lockers along the sides
  for (const x of [-1.26, 1.26]) {
    for (let k = 0; k < 4; k++) parts.box(0.03, 1.4, 1.15, '#b3b7b1', { x, y: 2.05, z: -0.95 + k * 1.3 });
  }
  parts.box(2.52, 0.18, 8.02, '#f2efe6', { y: 1.2 }); // white stripe
  parts.box(2.6, 0.25, 0.3, '#c9cdc6', { y: 0.85, z: -4.05 }); // bumper
  // The ladder, along the roof.
  for (const x of [-0.45, 0.45]) parts.box(0.08, 0.14, 6.2, '#c9cdc6', { x, y: 3.35, z: 0.9 });
  for (let z = -2.1; z <= 3.9; z += 0.45) parts.box(0.9, 0.05, 0.05, '#c9cdc6', { y: 3.35, z });
  parts.box(1.9, 0.14, 0.34, '#d8d4c6', { y: 3.06, z: -3.2 }); // light bar
  return {
    parts,
    wheelX: 1.08,
    wheelZ: [-2.8, 1.4, 2.8],
    wheelRadius: 0.56,
    length: 8.1,
    lampY: 1.35,
    beacons: [
      [-0.62, 3.2, -3.2],
      [0.62, 3.2, -3.2],
    ],
  };
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
  // Blue lights in two banks that flash in turn.
  const beacons = model.beacons
    ? [0, 1].map(() => new THREE.MeshLambertMaterial({ color: '#2f5fc4', emissive: '#4f8dff', emissiveIntensity: 0 }))
    : null;
  model.beacons?.forEach(([x, y, z], i) => {
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.3), beacons[i % 2]);
    beacon.position.set(x, y, z);
    root.add(beacon);
  });
  root.traverse(child => {
    if (child.isMesh) child.castShadow = true;
  });
  // Circles along the body for collisions, close enough together to leave no gaps.
  const circles = Math.max(2, Math.ceil(model.length / 2.2));
  const along = Array.from({ length: circles }, (_, i) => (i / (circles - 1) - 0.5) * (model.length - 2.2));
  return { root, wheels, lamps, beacons, radius: model.wheelRadius, length: model.length, along };
}

const between = ([least, most]) => least + Math.random() * (most - least);
/** Distance between two points on the trail loop, whichever way round is shorter. */
const apart = (a, b) => Math.min(ROAD.wrap(a - b), ROAD.wrap(b - a));
const onBridge = s => apart(s, BRIDGE.s) < BRIDGE.length / 2 + 4;

export function createTraffic(scene) {
  const travellers = [
    { ...createVehicle(camperVan()), s: ROAD.length * 0.3, direction: 1, cruise: 7.5 },
    { ...createVehicle(saloon()), s: ROAD.length * 0.8, direction: 1, cruise: 7.5 },
    { ...createVehicle(pickup()), s: ROAD.length * 0.75, direction: -1, cruise: 8.5 },
    { ...createVehicle(bus()), s: ROAD.length * 0.2, direction: -1, cruise: 8.5 },
  ].map(t => ({ ...t, speed: t.cruise, honkAt: null, flash: 0, offset: LANE }));
  // The emergency vehicles wait out of sight until they are called out.
  const responders = [
    { ...createVehicle(ambulance()), kind: 'ambulance', cruise: 12 },
    { ...createVehicle(fireEngine()), kind: 'fireengine', cruise: 11 },
  ].map(t => ({ ...t, speed: 0, honkAt: null, flash: 0, offset: 0.6, active: false, s: 0, direction: 1, driven: 0 }));
  for (const t of [...travellers, ...responders]) scene.add(t.root);
  for (const r of responders) r.root.visible = false;
  let nextCall = between(FIRST_CALL);
  let calls = 0;
  let time = 0;

  /**
   * How far ahead of a traveller a point is along its way, or Infinity if it isn't
   * in the way: off the trail, more than `width` to either side of the traveller's
   * line, or further than 40 m ahead.
   */
  function gapTo(t, x, z, width = 3.4) {
    if (!ROAD.isNear(x, z, 9)) return Infinity;
    const near = ROAD.nearest(x, z);
    if (Math.abs(near.side - t.direction * t.offset) > width) return Infinity;
    const ahead = ROAD.wrap((near.s - t.s) * t.direction);
    return ahead < 40 ? ahead : Infinity;
  }

  /** Sends the next emergency vehicle along the trail towards the player, starting out of sight behind them. */
  function callOut(player) {
    if (!ROAD.isNear(player.x, player.z, 24)) return false;
    const { s: playerS } = ROAD.nearest(player.x, player.z);
    const responder = responders[calls % responders.length];
    for (const direction of Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
      const s = ROAD.wrap(playerS - direction * 190);
      const start = ROAD.at(s);
      // Where the trail doubles back, the start could be in plain view.
      if (Math.hypot(start.x - player.x, start.z - player.z) < 130) continue;
      if (travellers.some(t => apart(t.s, s) < 15)) continue;
      Object.assign(responder, { active: true, s, direction, speed: responder.cruise, offset: 0.6, driven: 0 });
      responder.root.visible = true;
      calls++;
      return true;
    }
    return false;
  }

  /** Moves a vehicle to its place on the trail and spins its wheels. */
  function place(t, dt) {
    const p = ROAD.offset(t.s, t.direction * t.offset);
    const heading = headingOf(p.dx * t.direction, p.dz * t.direction);
    const pose = chassisPose(p.x, p.z, heading, drivingHeight);
    t.root.position.set(p.x, pose.height + 0.06, p.z);
    t.root.rotation.set(pose.pitch, heading, pose.roll, 'YXZ');
    for (const wheel of t.wheels) wheel.spin.rotation.x -= (t.speed * dt) / t.radius;
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    for (const offset of t.along) colliders.push({ x: p.x - sin * offset, z: p.z - cos * offset, radius: 1.15 });
  }

  function honkBack(t, dt, night) {
    if (t.honkAt !== null && (t.honkAt -= dt) <= 0) {
      t.honkAt = null;
      t.flash = 0.8;
      t.onHonk?.();
    }
    t.flash = Math.max(0, t.flash - dt);
    t.lamps.emissiveIntensity = 0.2 + night * 1.4 + (t.flash > 0 && Math.sin(t.flash * 30) > 0 ? 2 : 0);
  }

  const colliders = [];
  return {
    /** Circles the player's car collides with. */
    colliders,
    /** Sends an emergency vehicle out now, if the player is by the trail. */
    callOut,
    update(dt, { player, blockers = [], night }) {
      time += dt;
      colliders.length = 0;
      const responder = responders.find(r => r.active);
      if (!responder && (nextCall -= dt) <= 0) nextCall = callOut(player) ? between(BETWEEN_CALLS) : 5;

      for (const t of travellers) {
        // Pull over onto the verge while an emergency vehicle goes by, though not on the bridge.
        const yielding = responder && apart(t.s, responder.s) < 55;
        t.offset = damp(t.offset, yielding && !onBridge(t.s) ? VERGE : LANE, 1.6, dt);
        let gap = gapTo(t, player.x, player.z);
        for (const other of [...travellers, ...responders]) {
          if (other !== t && (other.active ?? true))
            gap = Math.min(gap, gapTo(t, other.root.position.x, other.root.position.z) - other.length / 2);
        }
        for (const blocker of blockers) gap = Math.min(gap, gapTo(t, blocker.x, blocker.z));
        let target = Math.min(t.cruise, Math.max(0, (gap - t.length / 2 - FOLLOW_GAP) * 0.6));
        if (yielding) target = Math.min(target, 1.2);
        t.speed = damp(t.speed, target, target < t.speed ? 4 : 0.8, dt);
        t.s = ROAD.wrap(t.s + t.speed * t.direction * dt);
        place(t, dt);
        honkBack(t, dt, night);
      }

      if (responder) {
        const r = responder;
        // Keep just right of the middle; if the player is in the way, go round them on the side with room.
        let line = 0.6;
        if (ROAD.isNear(player.x, player.z, 9)) {
          const near = ROAD.nearest(player.x, player.z);
          if (ROAD.wrap((near.s - r.s) * r.direction) < 45) {
            const side = near.side * r.direction;
            if (side > 0.5) line = -1.8;
            else if (side < -0.5) line = 2.6;
          }
        }
        r.offset = damp(r.offset, line, 1.5, dt);
        let gap = gapTo(r, player.x, player.z, 2.7);
        for (const t of travellers) {
          if (t.offset < LANE + 1)
            gap = Math.min(gap, gapTo(r, t.root.position.x, t.root.position.z, 2.7) - t.length / 2);
        }
        for (const blocker of blockers) gap = Math.min(gap, gapTo(r, blocker.x, blocker.z, 4));
        const target = Math.min(r.cruise, Math.max(0, (gap - r.length / 2 - FOLLOW_GAP) * 0.6));
        r.speed = damp(r.speed, target, target < r.speed ? 4 : 0.8, dt);
        r.s = ROAD.wrap(r.s + r.speed * r.direction * dt);
        r.driven += r.speed * dt;
        place(r, dt);
        honkBack(r, dt, night);
        const flash = Math.sin(time * 17) > 0;
        r.beacons[0].emissiveIntensity = flash ? 2.4 : 0.15;
        r.beacons[1].emissiveIntensity = flash ? 0.15 : 2.4;
        // Once it is well past and out of sight, it has gone on its way.
        const distance = Math.hypot(r.root.position.x - player.x, r.root.position.z - player.z);
        if (r.driven > 280 && distance > 170) {
          r.active = false;
          r.root.visible = false;
        }
      }
    },
    /** How loud the siren is where the player is: 0 when no emergency vehicle is near. */
    sirenLevel(player) {
      const r = responders.find(responder => responder.active);
      if (!r) return 0;
      return Math.max(0, 1 - Math.hypot(r.root.position.x - player.x, r.root.position.z - player.z) / 150);
    },
    /** The emergency vehicle that is out, if any, and where it is on the trail. */
    emergency() {
      const r = responders.find(responder => responder.active);
      return r
        ? { kind: r.kind, x: r.root.position.x, z: r.root.position.z, speed: r.speed, s: r.s, direction: r.direction }
        : null;
    },
    /** Travellers within earshot answer a honk with one of their own. */
    answerHonk(x, z, respond) {
      let answered = false;
      for (const t of [...travellers, ...responders.filter(r => r.active)]) {
        if (t.honkAt === null && Math.hypot(t.root.position.x - x, t.root.position.z - z) < 32) {
          t.honkAt = 0.45 + Math.random() * 0.3;
          t.onHonk = respond;
          answered = true;
        }
      }
      return answered;
    },
    getState: () =>
      travellers.map(t => ({
        x: t.root.position.x,
        z: t.root.position.z,
        speed: t.speed,
        pulledOver: t.offset > LANE + 1,
      })),
  };
}
