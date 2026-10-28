// A snowman by the outer road in the winter, with a carrot for a nose, two stick arms and a red
// scarf, and a wooden sledge leaning against it. Something for a small driver to stop and look at.
import * as THREE from 'three';
import { WINTER } from '../layout.js';
import { PartsBuilder } from '../build.js';
import { framer } from './frame.js';

const SNOW = '#f4f8ff';
const SNOW_SHADE = '#dfe8fa';
const CARROT = '#e8802c';
const COAL = '#34363d';
const STICK = '#6b4f36';
const SCARF = '#c4382a';
const WOOD = '#a8794a';
const RUNNER = '#5a5e66';
const ROPE = '#d8c79a';

export function buildSnowman(scene, obstacles) {
  const { snowman } = WINTER;
  const frame = framer(snowman);
  const { at } = frame;
  const parts = new PartsBuilder();
  const ball = (r, y, colour, squash = 0.95) =>
    parts.add(new THREE.IcosahedronGeometry(r, 2), colour, at(0, y, 0, { sy: squash }));
  // Three balls of snow, each a little smaller, sunk into the one below.
  ball(0.78, 0.66, SNOW_SHADE);
  ball(0.56, 1.58, SNOW);
  ball(0.4, 2.27, SNOW);
  // A carrot for a nose, pointing the way the snowman faces.
  parts.add(new THREE.ConeGeometry(0.075, 0.5, 6), CARROT, at(0, 2.25, 0.62, { rx: Math.PI / 2 }));
  for (const side of [-1, 1]) {
    parts.add(new THREE.IcosahedronGeometry(0.055, 0), COAL, at(side * 0.15, 2.38, 0.36));
  }
  // A smile of coals, and three down the front.
  for (const [lx, ly] of [
    [-0.17, 2.14],
    [-0.08, 2.08],
    [0.08, 2.08],
    [0.17, 2.14],
  ]) {
    parts.add(new THREE.IcosahedronGeometry(0.04, 0), COAL, at(lx, ly, 0.38));
  }
  for (const ly of [1.72, 1.52, 1.32]) parts.add(new THREE.IcosahedronGeometry(0.06, 0), COAL, at(0, ly, 0.55));
  // The scarf, wound round the neck with a striped end hanging down the front.
  parts.add(new THREE.CylinderGeometry(0.43, 0.46, 0.14, 10), SCARF, at(0, 1.97, 0));
  parts.box(0.15, 0.55, 0.05, SCARF, at(0.2, 1.68, 0.47, { rz: 0.08 }));
  parts.box(0.15, 0.35, 0.05, '#e0b13d', at(0.2, 1.43, 0.47, { rz: 0.08 }));
  // Stick arms, each with a twig branching off it.
  for (const side of [-1, 1]) {
    const shoulder = { x: side * 0.5, y: 1.62, z: 0 };
    const hand = { x: side * 1.45, y: 2.1, z: 0.2 };
    parts.beam(frame.at(shoulder.x, shoulder.y, shoulder.z), frame.at(hand.x, hand.y, hand.z), 0.06, STICK);
    parts.beam(frame.at(side * 1.05, 1.9, 0.1), frame.at(side * 1.25, 2.4, 0.15), 0.04, STICK);
  }
  // A sledge leaning against its side, nearly upright with its front end up against the snowman:
  // two runners with the tips curling up, slats across them and a cord between the tips.
  const base = frame.local(0.82, 0);
  const yaw = Math.atan2(snowman.x - base.x, snowman.z - base.z);
  const lean = new THREE.Matrix4().compose(
    new THREE.Vector3(base.x, frame.ground(0.82, 0) + 0.72, base.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.2, yaw, 0, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  /** A part in the sledge's own frame, lying flat with its front towards +Z, put in its leaning place. */
  const onSledge = (x, y, z, extra = {}) => {
    const { rx = 0 } = extra;
    return new THREE.Matrix4().multiplyMatrices(
      lean,
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)),
        new THREE.Vector3(1, 1, 1),
      ),
    );
  };
  for (const side of [-0.27, 0.27]) {
    parts.add(new THREE.BoxGeometry(0.06, 0.08, 1.4), RUNNER, onSledge(side, 0, -0.05));
    parts.add(new THREE.BoxGeometry(0.06, 0.07, 0.3), RUNNER, onSledge(side, 0.05, 0.72, { rx: -0.5 }));
    parts.add(new THREE.BoxGeometry(0.05, 0.12, 0.05), RUNNER, onSledge(side, 0.08, 0.4));
  }
  for (let k = 0; k < 6; k++) {
    parts.add(new THREE.BoxGeometry(0.7, 0.04, 0.15), WOOD, onSledge(0, 0.15, -0.6 + k * 0.2));
  }
  parts.add(new THREE.BoxGeometry(0.56, 0.025, 0.03), ROPE, onSledge(0, 0.1, 0.82));
  scene.add(parts.mesh());
  obstacles.push({ ...frame.local(0, 0), radius: 0.85 });
  obstacles.push({ ...frame.local(0.95, 0), radius: 0.45 });
}
