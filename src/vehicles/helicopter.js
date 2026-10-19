// A red and white rescue helicopter that waits on the helipad. Sound the horn
// beside it and the pilot starts up, lifts off, flies a loop over the valley
// and lands again.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { angleDelta, clamp, damp, smoothstep } from '../core/math.js';
import { HELIPAD } from '../world/layout.js';
import { terrainHeight } from '../world/terrain.js';
import { PartsBuilder } from '../world/build.js';

const RED = '#c8402f';
const WHITE = '#f2efe6';
const GLASS = '#3d5560';
const DARK = '#2f3430';

const SPIN_UP = 5;
const CLIMB = 7;
const DESCEND = 8;
const SPIN_DOWN = 6;
const CRUISE = 26;
const HOVER = 22; // how high above the pad the loop starts and ends

/** Where it flies: round the valley, high above the hills, and back to the pad. Heights are above sea level. */
const ROUTE = [
  [-232, -60, 78],
  [-120, -200, 92],
  [40, -232, 100],
  [168, -176, 110],
  [240, -30, 88],
  [200, 140, 80],
  [60, 222, 78],
  [-100, 205, 74],
  [-220, 118, 72],
];

function buildHelicopter() {
  const root = new THREE.Group();
  const parts = new PartsBuilder();
  parts.add(new RoundedBoxGeometry(2, 2, 4.2, 2, 0.6), RED, { y: 1.75 });
  parts.add(new RoundedBoxGeometry(1.84, 1.2, 1.4, 2, 0.45), GLASS, { y: 2.05, z: -1.75 }); // nose glass
  parts.box(2.03, 0.35, 3.6, WHITE, { y: 1.3, z: 0.2 }); // white band
  for (const x of [-1.01, 1.01]) parts.box(0.04, 0.7, 1.3, GLASS, { x, y: 2.15, z: 0.2 }); // side windows
  parts.box(1.2, 0.5, 2, RED, { y: 2.95, z: 0.4 }); // engine cowling
  parts.add(new THREE.CylinderGeometry(0.22, 0.45, 5.5, 8), RED, { y: 2.25, z: 4.4, rx: Math.PI / 2 }); // tail boom
  parts.box(0.12, 1.5, 0.9, RED, { y: 2.9, z: 7 }); // fin
  parts.box(1.8, 0.08, 0.55, WHITE, { y: 2.3, z: 6.3 }); // tailplane
  parts.add(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 6), DARK, { y: 3.4 }); // mast
  // Skids on struts.
  for (const x of [-1, 1]) {
    parts.box(0.1, 0.1, 3.8, DARK, { x, y: 0.1, z: 0.2 });
    parts.beam({ x, y: 0.1, z: 0.2 }, { x, y: 0.1, z: -1.95 }, 0.1, DARK);
    for (const z of [-0.8, 1.1]) parts.beam({ x, y: 0.1, z }, { x: x * 0.7, y: 0.85, z }, 0.09, DARK);
  }
  root.add(parts.mesh());

  const rotor = new THREE.Group();
  rotor.position.y = 3.72;
  const blades = new PartsBuilder();
  blades.add(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8), DARK);
  for (let k = 0; k < 4; k++)
    blades.box(0.32, 0.05, 5.6, DARK, {
      z: 2.8 * Math.cos((k * Math.PI) / 2),
      x: 2.8 * Math.sin((k * Math.PI) / 2),
      ry: (k * Math.PI) / 2,
    });
  rotor.add(blades.mesh());
  root.add(rotor);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.12, 2.95, 7.2);
  const tail = new PartsBuilder();
  for (const k of [0, 1]) tail.box(0.04, 1.5, 0.16, DARK, { rx: (k * Math.PI) / 2 });
  tailRotor.add(tail.mesh());
  root.add(tailRotor);
  return { root, rotor, tailRotor };
}

export function createHelicopter(scene, { onTakeOff = () => {} } = {}) {
  const { root, rotor, tailRotor } = buildHelicopter();
  scene.add(root);
  const ground = terrainHeight(HELIPAD.x, HELIPAD.z) + 0.12;
  const pad = new THREE.Vector3(HELIPAD.x, ground, HELIPAD.z);
  const above = pad.clone().setY(ground + HOVER);
  const route = new THREE.CatmullRomCurve3(
    [above, ...ROUTE.map(([x, z, y]) => new THREE.Vector3(x, y, z)), above.clone()],
    false,
    'centripetal',
  );
  const routeLength = route.getLength();

  let phase = 'parked'; // 'parked' | 'starting' | 'climbing' | 'flying' | 'landing' | 'stopping'
  let timer = 0;
  let along = 0;
  let spin = 0; // rotor speed, 0 to 1
  let heading = HELIPAD.heading;
  let bank = 0;
  let pitch = 0;
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const colliders = [];

  function setParked() {
    root.position.copy(pad);
    root.rotation.set(0, HELIPAD.heading, 0, 'YXZ');
    heading = HELIPAD.heading;
  }
  setParked();

  return {
    /** Circles round the helicopter while it sits on the pad. */
    colliders,
    update(dt) {
      timer += dt;
      if (phase === 'starting') {
        spin = clamp(timer / SPIN_UP, 0, 1);
        if (timer > SPIN_UP) [phase, timer] = ['climbing', 0];
      } else if (phase === 'climbing') {
        root.position.lerpVectors(pad, above, smoothstep(timer, 0, CLIMB));
        if (timer > CLIMB) [phase, timer, along] = ['flying', 0, 0];
      } else if (phase === 'flying') {
        along += CRUISE * dt;
        const u = Math.min(1, along / routeLength);
        route.getPointAt(u, point);
        route.getTangentAt(u, tangent);
        root.position.copy(point);
        // Turn to face the way it's going, leaning into the turns and dipping its nose.
        const target = Math.atan2(-tangent.x, -tangent.z);
        const turn = angleDelta(heading, target);
        heading += turn * Math.min(1, dt * 2.5);
        bank = damp(bank, clamp(turn * 2.2, -0.45, 0.45), 2, dt);
        pitch = damp(pitch, u < 0.97 ? -0.12 : 0, 1.5, dt);
        if (u >= 1) [phase, timer] = ['landing', 0];
      } else if (phase === 'landing') {
        root.position.lerpVectors(above, pad, smoothstep(timer, 0, DESCEND));
        heading += angleDelta(heading, HELIPAD.heading) * Math.min(1, dt * 1.5);
        bank = damp(bank, 0, 3, dt);
        pitch = damp(pitch, 0, 3, dt);
        if (timer > DESCEND) [phase, timer] = ['stopping', 0];
      } else if (phase === 'stopping') {
        spin = clamp(1 - timer / SPIN_DOWN, 0, 1);
        if (timer > SPIN_DOWN) {
          [phase, timer, spin] = ['parked', 0, 0];
          setParked();
        }
      }
      if (phase !== 'parked') root.rotation.set(pitch, heading, bank, 'YXZ');
      rotor.rotation.y += spin * 30 * dt;
      tailRotor.rotation.x += spin * 45 * dt;

      colliders.length = 0;
      if (root.position.y < ground + 1) {
        const sin = Math.sin(heading);
        const cos = Math.cos(heading);
        for (const [along, radius] of [
          [0, 1.6],
          [3.5, 0.9],
          [6, 0.9],
        ]) {
          colliders.push({ x: root.position.x + sin * along, z: root.position.z + cos * along, radius });
        }
      }
    },
    /** A honk beside the pad sends it off round the valley. */
    hearHorn(point) {
      if (phase !== 'parked' || Math.hypot(point.x - pad.x, point.z - pad.z) > 40) return false;
      [phase, timer] = ['starting', 0];
      onTakeOff();
      return true;
    },
    /** How loud the rotor is from a point, 0 to 1, and how fast the blades beat. */
    rotorSound(point) {
      const distance = root.position.distanceTo(point);
      return { level: spin * Math.max(0, 1 - distance / 320), rate: 4 + spin * 14 };
    },
    getState: () => ({ phase, x: root.position.x, y: root.position.y, z: root.position.z }),
  };
}
