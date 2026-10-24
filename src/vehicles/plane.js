// A little two-seat trainer that lives at the airfield. Every few minutes (or when
// you sound the horn beside it) it starts up, taxis to the end of the runway, takes
// off to the north, flies a wide loop round the uplands and lands again to the south.
// It waits while you are on the runway, goes round again if you are on it as it comes
// in to land, and stops for you while taxiing. A second plane stays parked.
import * as THREE from 'three';
import { angleDelta, clamp, damp } from '../core/math.js';
import { AIRFIELD } from '../world/layout.js';
import { createPath, headingOf } from '../world/path.js';
import { terrainHeight } from '../world/terrain.js';
import { PartsBuilder } from '../world/build.js';

const GLASS = '#3d5560';
const DARK = '#2f3430';

const SPIN_UP = 4;
const SPIN_DOWN = 5;
const TAXI = 5;
const LIFT_OFF = 23;
const CRUISE = 30;
const TOUCHDOWN = 21;
const FIRST_FLIGHT = [35, 70];
const BETWEEN_FLIGHTS = [130, 220];

const between = ([least, most]) => least + Math.random() * (most - least);
/** On the ground the planes are too small to make out from further away than this. */
const DRAW_DISTANCE = 450;

/** A low-wing trainer, nose towards -Z, standing on its wheels at y = 0. */
export function buildPlane({ body, trim, stripe }) {
  const root = new THREE.Group();
  const parts = new PartsBuilder();
  parts.box(1.1, 1.15, 3.6, body, { y: 1.35, z: -0.2 }); // cabin
  parts.box(1.0, 0.95, 1.3, body, { y: 1.3, z: -2.6 }); // engine cowling
  // The tail cone, narrowing towards the fin: four flat sides, turned square to the cabin's.
  parts.add(new THREE.CylinderGeometry(0.22, 0.78, 3.2, 4).rotateY(Math.PI / 4), body, {
    y: 1.38,
    z: 3.1,
    rx: Math.PI / 2,
    sx: 0.95,
  });
  parts.add(new THREE.SphereGeometry(1, 12, 8), GLASS, { y: 1.95, z: -0.6, sx: 0.5, sy: 0.48, sz: 1.15 }); // canopy
  for (const x of [-0.56, 0.56]) {
    parts.box(0.02, 0.16, 6.2, stripe, { x, y: 1.25, z: 0.6 }); // cheatline
    parts.box(0.02, 0.1, 5.8, trim, { x, y: 1.06, z: 0.4 });
  }
  // Wings with a little dihedral, painted tips, and the tailplane and fin.
  for (const side of [-1, 1]) {
    parts.box(4.4, 0.16, 1.6, body, { x: side * 2.6, y: 0.95, z: -0.4, rz: side * 0.06 });
    parts.box(0.6, 0.18, 1.62, trim, { x: side * 4.6, y: 1.08, z: -0.4, rz: side * 0.06 });
    parts.box(1.4, 0.1, 0.9, body, { x: side * 0.85, y: 1.62, z: 4.35 });
  }
  parts.box(0.1, 1.3, 1.1, body, { y: 2.25, z: 4.3, rx: -0.3 }); // fin
  parts.box(0.12, 0.9, 0.5, trim, { y: 2.35, z: 4.85, rx: -0.3 }); // rudder
  // Fixed tricycle undercarriage with spats over the main wheels.
  parts.box(0.1, 0.8, 0.1, DARK, { y: 0.55, z: -2.3 });
  parts.add(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10), DARK, { y: 0.22, z: -2.3, rz: Math.PI / 2 });
  for (const side of [-1, 1]) {
    parts.beam({ x: side * 0.4, y: 0.9, z: -0.2 }, { x: side * 1.25, y: 0.35, z: -0.2 }, 0.1, DARK);
    parts.add(new THREE.SphereGeometry(1, 8, 6), trim, {
      x: side * 1.25,
      y: 0.3,
      z: -0.2,
      sx: 0.16,
      sy: 0.3,
      sz: 0.48,
    });
  }
  root.add(parts.mesh());

  const propeller = new THREE.Group();
  propeller.position.set(0, 1.3, -3.3);
  const blades = new PartsBuilder()
    .add(new THREE.ConeGeometry(0.24, 0.5, 10), trim, { z: -0.1, rx: -Math.PI / 2 })
    .box(0.14, 1.95, 0.05, DARK)
    .box(0.15, 0.2, 0.06, '#e3b83c', { y: 0.88 })
    .box(0.15, 0.2, 0.06, '#e3b83c', { y: -0.88 });
  propeller.add(blades.mesh());
  root.add(propeller);
  root.traverse(child => {
    if (child.isMesh) child.castShadow = true;
  });
  return { root, propeller };
}

/**
 * Points the plane flies through: [x, z, height above the runway]. It climbs away to the
 * north, swings round to the east and south, comes back across the north of the
 * uplands and turns onto the final approach, down the runway to the south.
 */
const CIRCUIT = [
  [650, -170, 45],
  [690, 50, 65],
  [610, 320, 70],
  [430, 440, 70],
  [150, 540, 75],
  [-180, 520, 75],
  [-450, 330, 80],
  [-570, 40, 85],
  [-500, -290, 90],
  [-240, -510, 95],
  [110, -560, 85],
  [380, -470, 70],
  [510, -380, 55],
  [572, -315, 44],
];
/** Where the final approach starts, heading south down the runway, and where the wheels touch. */
const FINAL = [AIRFIELD.x, -230, 34];
const TOUCH = [AIRFIELD.x, 24, 0.4];
/** Going round again when the runway isn't clear: on over it, climbing, to rejoin the loop. */
const GO_AROUND = [
  [AIRFIELD.x, 20, 42],
  [612, 190, 58],
];

export function createPlanes(scene, obstacles) {
  const ground = terrainHeight(AIRFIELD.x, (AIRFIELD.z0 + AIRFIELD.z1) / 2);
  const point = (x, z, height) => new THREE.Vector3(x, ground + height, z);

  // The second plane, parked by the hangar.
  const parked = buildPlane({ body: '#f2d64b', trim: '#2f5d8a', stripe: '#2f5d8a' });
  parked.root.position.set(540, ground + 0.05, 160);
  parked.root.rotation.y = headingOf(1, 0.2);
  parked.propeller.rotation.z = 0.6;
  scene.add(parked.root);
  for (const along of [-2, 0.5, 3]) {
    const sin = Math.sin(parked.root.rotation.y);
    const cos = Math.cos(parked.root.rotation.y);
    obstacles.push({ x: 540 - sin * along, z: 160 - cos * along, radius: along === 0.5 ? 1.6 : 0.9 });
  }

  const { root, propeller } = buildPlane({ body: '#f4f2ea', trim: '#c8402f', stripe: '#2f5d8a' });
  scene.add(root);

  const STAND = { x: 560, z: 184, heading: headingOf(1, 0) };
  const taxiOut = createPath([
    [STAND.x, STAND.z],
    [575, 189],
    [589, 196],
    [600, 204],
    [603, 216],
    [601, 226],
    [595, 228],
    [592, 220],
    [594, 208],
  ]);
  const takeoff = createPath([
    [594, 208],
    [597, 190],
    [AIRFIELD.x, 165],
    [AIRFIELD.x, AIRFIELD.z0 - 40],
  ]);
  const rollout = createPath([
    [AIRFIELD.x, TOUCH[1]],
    [AIRFIELD.x, 178],
    [597, 190],
    [589, 197],
    [575, 192],
    [STAND.x + 4, STAND.z + 1],
    [STAND.x, STAND.z],
  ]);
  /** Where the runway part of the roll-out ends and the taxi to the stand begins. */
  const turnOff = rollout.nearest(AIRFIELD.x, 178).s;

  let phase = 'parked'; // parked, starting, taxiOut, holding, rolling, flying, landing, rollout, stopping
  let timer = between(FIRST_FLIGHT);
  let along = 0;
  let speed = 0;
  let spin = 0;
  let heading = STAND.heading;
  let bank = 0;
  let pitch = 0;
  let route = null;
  let routeLength = 0;
  let laps = 0;
  const position = new THREE.Vector3(STAND.x, ground, STAND.z);
  const tangent = new THREE.Vector3();
  const colliders = [];

  function flyThrough(points) {
    route = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    routeLength = route.getLength();
    along = 0;
    phase = 'flying';
    laps++;
  }

  const circuit = () => [...CIRCUIT, FINAL].map(([x, z, h]) => point(x, z, h));

  function runwayClear(player) {
    const onRunway =
      Math.abs(player.x - AIRFIELD.x) < AIRFIELD.width / 2 + 6 &&
      player.z > AIRFIELD.z0 - 20 &&
      player.z < AIRFIELD.z1 + 10;
    return !onRunway;
  }

  /** How fast to go on the ground so as not to run into the player. */
  function giveWay(player, cruise) {
    const ahead = (player.x - position.x) * -Math.sin(heading) + (player.z - position.z) * -Math.cos(heading);
    const side = Math.abs((player.x - position.x) * Math.cos(heading) - (player.z - position.z) * Math.sin(heading));
    if (ahead > 0 && ahead < 18 && side < 7) return 0;
    return cruise;
  }

  function followGround(path, dt) {
    along = Math.min(path.length, along + speed * dt);
    const p = path.at(along);
    position.set(p.x, ground, p.z);
    heading += angleDelta(heading, headingOf(p.dx, p.dz)) * Math.min(1, dt * 6);
    return along >= path.length - 0.01;
  }

  function place() {
    root.position.copy(position);
    root.rotation.set(pitch, heading, bank, 'YXZ');
  }
  place();

  return {
    /** Circles round the plane while it is on the ground. */
    colliders,
    update(dt, { player }) {
      timer -= dt;
      if (phase === 'parked') {
        if (timer <= 0) [phase, timer] = ['starting', SPIN_UP];
      } else if (phase === 'starting') {
        spin = clamp(1 - timer / SPIN_UP, 0, 1) * 0.6;
        if (timer <= 0) [phase, along, speed] = ['taxiOut', 0, 0];
      } else if (phase === 'taxiOut') {
        speed = damp(speed, giveWay(player, TAXI), 2, dt);
        if (followGround(taxiOut, dt)) [phase, speed] = ['holding', 0];
      } else if (phase === 'holding') {
        speed = 0;
        if (runwayClear(player)) [phase, along] = ['rolling', 0];
      } else if (phase === 'rolling') {
        spin = damp(spin, 1, 2, dt);
        speed += 2.4 * dt;
        followGround(takeoff, dt);
        if (speed > LIFT_OFF * 0.6) pitch = damp(pitch, 0.12, 1.5, dt);
        if (speed >= LIFT_OFF) {
          flyThrough([position.clone(), point(AIRFIELD.x, -70, 16), ...circuit()]);
          speed = LIFT_OFF;
        }
      } else if (phase === 'flying' || phase === 'landing') {
        const landing = phase === 'landing';
        speed = damp(speed, landing ? TOUCHDOWN : CRUISE, 0.5, dt);
        along += speed * dt;
        const u = Math.min(1, along / routeLength);
        route.getPointAt(u, position);
        route.getTangentAt(u, tangent);
        const target = Math.atan2(-tangent.x, -tangent.z);
        const turn = angleDelta(heading, target);
        heading += turn * Math.min(1, dt * 3);
        bank = damp(bank, clamp(turn * 3, -0.6, 0.6), 2, dt);
        const climb = Math.asin(clamp(tangent.y, -1, 1));
        pitch = damp(pitch, landing ? (u > 0.85 ? 0.1 : -0.02) : climb * 0.8, 2, dt);
        if (u >= 1 && !landing) {
          // At the start of the final approach: land if the runway is clear, otherwise go round again.
          if (runwayClear(player)) {
            route = new THREE.CatmullRomCurve3([position.clone(), point(...TOUCH)], false);
            routeLength = route.getLength();
            [phase, along] = ['landing', 0];
          } else {
            flyThrough([position.clone(), ...GO_AROUND.map(([x, z, h]) => point(x, z, h)), ...circuit().slice(2)]);
          }
        } else if (u >= 1) {
          [phase, along] = ['rollout', 0];
          position.y = ground;
        }
      } else if (phase === 'rollout') {
        const onRunway = along < turnOff;
        pitch = damp(pitch, 0, 3, dt);
        bank = damp(bank, 0, 4, dt);
        speed = onRunway ? Math.max(TAXI, speed - 2.2 * dt) : damp(speed, giveWay(player, TAXI), 2, dt);
        spin = damp(spin, onRunway ? 0.7 : 0.5, 1, dt);
        if (followGround(rollout, dt)) [phase, timer, speed] = ['stopping', SPIN_DOWN, 0];
      } else if (phase === 'stopping') {
        spin = clamp(timer / SPIN_DOWN, 0, 1) * 0.5;
        heading += angleDelta(heading, STAND.heading) * Math.min(1, dt * 2);
        if (timer <= 0) [phase, timer, spin] = ['parked', between(BETWEEN_FLIGHTS), 0];
      }
      if (phase !== 'flying' && phase !== 'landing') {
        position.y = ground;
        if (phase !== 'rolling') pitch = damp(pitch, 0, 3, dt);
      }
      place();
      propeller.rotation.z += spin * 45 * dt;
      const far = Math.hypot(player.x - position.x, player.z - position.z) > DRAW_DISTANCE;
      root.visible = !far || position.y > ground + 2;
      parked.root.visible = Math.hypot(player.x - 540, player.z - 160) < DRAW_DISTANCE;

      colliders.length = 0;
      if (position.y < ground + 1.5) {
        const sin = Math.sin(heading);
        const cos = Math.cos(heading);
        for (const [offset, radius] of [
          [-2, 0.9],
          [0.4, 1.4],
          [3.2, 0.8],
        ]) {
          colliders.push({ x: position.x - sin * offset, z: position.z - cos * offset, radius });
        }
        // The wings.
        for (const side of [-1, 1])
          colliders.push({ x: position.x + cos * side * 3.4, z: position.z - sin * side * 3.4, radius: 0.9 });
      }
    },
    /** A honk beside the parked plane sends it off early. */
    hearHorn(point) {
      if (phase !== 'parked' || Math.hypot(point.x - STAND.x, point.z - STAND.z) > 45) return false;
      timer = 0;
      return true;
    },
    /** How loud the engine is from a point, 0 to 1, and how fast it beats. */
    engineSound(eye) {
      const distance = root.position.distanceTo(eye);
      return { level: spin * Math.max(0, 1 - distance / 420), rate: 18 + spin * 26 };
    },
    /** `laps` counts the loops flown, including any to go round again. */
    getState: () => ({ phase, x: position.x, y: position.y, z: position.z, speed, laps }),
  };
}
