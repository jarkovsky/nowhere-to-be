// The player's little off-roader, built from boxes. Paint is a separate
// material so the colour can change; everything else is one merged mesh.
import * as THREE from 'three';
import { PartsBuilder, flatMaterial } from '../world/build.js';

export const CAR_COLORS = {
  orange: '#d16b38',
  sage: '#72947d',
  blue: '#5f97ab',
  berry: '#ac6075',
  yellow: '#dfbb57',
};

const CREAM = '#eee4c8';
const RUBBER = '#303a35';
const METAL = '#737e73';
const GLASS = '#4f6f73';

export const WHEEL_RADIUS = 0.59;

export function createWheel(radius = WHEEL_RADIUS, width = 0.4) {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 12), flatMaterial(RUBBER));
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const hub = new PartsBuilder()
    .add(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.02, 10), CREAM, { rz: Math.PI / 2 })
    .add(new THREE.CylinderGeometry(radius * 0.19, radius * 0.19, width + 0.04, 8), METAL, { rz: Math.PI / 2 })
    .mesh({ castShadow: false });
  spin.add(tire, hub);
  return { pivot, spin, tire };
}

export function createCar() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshLambertMaterial({ color: CAR_COLORS.orange, flatShading: true });
  const painted = new PartsBuilder();
  const trim = new PartsBuilder();

  painted.box(2.05, 0.62, 3.8, '#ffffff', { y: 1.03 });
  painted.box(1.9, 0.32, 1.15, '#ffffff', { y: 1.48, z: -1.25 }); // bonnet
  painted.box(1.92, 1.18, 2.3, '#ffffff', { y: 1.85, z: 0.35 }); // cabin
  trim.box(1.85, 0.2, 3.9, RUBBER, { y: 0.72 });
  trim.box(1.71, 0.85, 2.34, GLASS, { y: 1.96, z: 0.35 });
  for (const x of [-0.93, 0.93]) {
    for (const z of [-0.8, 0.22, 1.47]) painted.box(0.09, 1.17, 0.1, '#ffffff', { x, y: 1.87, z });
    trim.box(0.05, 0.06, 0.27, CREAM, { x: x * 1.04, y: 1.52, z: 0.36 }); // door handles
    trim.box(0.26, 0.28, 0.15, RUBBER, { x: x * 1.17, y: 1.81, z: -0.72 }); // mirrors
  }
  trim.box(2.06, 0.14, 2.48, CREAM, { y: 2.5, z: 0.35 }); // roof
  trim.box(2.26, 0.21, 0.23, CREAM, { y: 0.86, z: -2.02 }); // bumpers
  trim.box(2.26, 0.21, 0.23, CREAM, { y: 0.86, z: 1.98 });
  trim.box(1.23, 0.3, 0.05, RUBBER, { y: 1.18, z: -1.94 }); // grille
  for (let i = -3; i <= 3; i++) trim.box(0.055, 0.24, 0.025, METAL, { x: i * 0.14, y: 1.18, z: -1.98 });
  // Roof rack with a duffel bag and a cooler.
  for (const x of [-0.76, 0.76]) trim.box(0.06, 0.13, 2, RUBBER, { x, y: 2.64, z: 0.35 });
  for (const z of [-0.55, 1.22]) trim.box(1.58, 0.13, 0.06, RUBBER, { y: 2.64, z });
  trim.box(1.15, 0.4, 0.8, '#758676', { x: -0.12, y: 2.85, z: 0.65 });
  trim.box(1.19, 0.045, 0.1, CREAM, { x: -0.12, y: 2.9, z: 0.65 });
  trim.box(0.6, 0.25, 0.7, CREAM, { x: 0.35, y: 2.78, z: -0.23 });
  // Spare wheel on the tailgate.
  trim.add(new THREE.CylinderGeometry(0.54, 0.54, 0.3, 12), RUBBER, { y: 1.58, z: 2.07, rx: Math.PI / 2 });
  trim.add(new THREE.CylinderGeometry(0.29, 0.29, 0.32, 10), CREAM, { y: 1.58, z: 2.07, rx: Math.PI / 2 });

  const wheels = [];
  for (const x of [-1.08, 1.08]) {
    for (const z of [-1.2, 1.24]) {
      const wheel = createWheel();
      wheel.pivot.position.set(x, 0.65, z);
      root.add(wheel.pivot);
      wheels.push({ ...wheel, front: z < 0 });
      painted.box(0.25, 0.18, 1.26, '#ffffff', { x, y: 1.16, z }); // wheel arches
    }
  }

  const paintMesh = painted.mesh({ material: paint });
  body.add(paintMesh, trim.mesh());

  // Lamps glow brighter at night; brake lights glow when braking.
  const headlampMaterial = new THREE.MeshLambertMaterial({
    color: '#fff3ce',
    emissive: '#ffd88e',
    emissiveIntensity: 0.3,
  });
  const brakeMaterial = new THREE.MeshLambertMaterial({ color: '#ad3f28', emissive: '#ff3a1c', emissiveIntensity: 0 });
  for (const x of [-0.77, 0.77]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 12), headlampMaterial);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(x, 1.23, -1.97);
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.28, 0.06), brakeMaterial);
    brake.position.set(x, 1.21, 1.94);
    body.add(lamp, brake);
  }

  // One spotlight between the headlamps keeps the light count (and cost) down.
  const headlight = new THREE.SpotLight('#fff0bd', 0, 70, Math.PI * 0.24, 0.6, 1.2);
  headlight.position.set(0, 1.3, -1.9);
  headlight.target.position.set(0, -1, -22);
  body.add(headlight, headlight.target);

  const decorations = {
    flag: createFlag(),
    teddy: createTeddy(),
    gnome: createGnomeMascot(),
  };
  for (const decoration of Object.values(decorations)) {
    decoration.visible = false;
    body.add(decoration);
  }

  let rainbow = false;
  return {
    root,
    body,
    wheels,
    headlight,
    customize(color, decoration) {
      rainbow = color === 'rainbow';
      if (!rainbow) paint.color.set(CAR_COLORS[color] ?? CAR_COLORS.orange);
      for (const [name, object] of Object.entries(decorations)) object.visible = name === decoration;
    },
    setLights(night, braking) {
      headlight.intensity = night * 55;
      headlampMaterial.emissiveIntensity = 0.3 + night * 1.6;
      brakeMaterial.emissiveIntensity = braking ? 1.4 : night * 0.35;
    },
    animate(time) {
      decorations.flag.userData.pennant.rotation.y = Math.sin(time * 5) * 0.12;
      if (rainbow) paint.color.setHSL((time * 0.08) % 1, 0.55, 0.55);
    },
  };
}

function createFlag() {
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.5, 0.045), flatMaterial(METAL));
  pole.position.set(0.85, 3.2, 1);
  const pennantShape = new THREE.BufferGeometry();
  pennantShape.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.5, 0, 0, 0, 0, 0, 0.25, 0.8], 3));
  pennantShape.computeVertexNormals();
  const pennant = new THREE.Mesh(
    pennantShape,
    new THREE.MeshLambertMaterial({ color: '#e5bb56', side: THREE.DoubleSide }),
  );
  pennant.position.set(0.85, 3.45, 1);
  flag.add(pole, pennant);
  flag.userData.pennant = pennant;
  return flag;
}

function createTeddy() {
  const parts = new PartsBuilder();
  const fur = '#bd9368';
  const bead = '#343c32';
  const ball = (r, x, y, z, color = fur) => parts.add(new THREE.IcosahedronGeometry(r, 1), color, { x, y, z });
  ball(0.33, 0, 0.28, 0);
  ball(0.28, 0, 0.76, 0);
  for (const side of [-1, 1]) {
    ball(0.12, side * 0.23, 0.98, 0);
    ball(0.14, side * 0.32, 0.4, 0);
    ball(0.16, side * 0.19, 0.06, -0.19);
    ball(0.035, side * 0.1, 0.8, -0.25, bead);
  }
  ball(0.07, 0, 0.7, -0.28, bead);
  const teddy = parts.mesh({ castShadow: false });
  teddy.position.set(0.05, 2.7, -0.4);
  return teddy;
}

/** Unlocked by finding every gnome. */
export function gnomeParts(parts, transform = {}) {
  const { x = 0, y = 0, z = 0, scale = 1 } = transform;
  const s = scale;
  parts.add(new THREE.CylinderGeometry(0.28 * s, 0.34 * s, 0.55 * s, 7), '#3f6aa1', { x, y: y + 0.28 * s, z });
  parts.add(new THREE.IcosahedronGeometry(0.2 * s, 1), '#f0c9a6', { x, y: y + 0.7 * s, z });
  parts.add(new THREE.ConeGeometry(0.22 * s, 0.45 * s, 4), '#f3efe2', {
    x,
    y: y + 0.6 * s,
    z: z - 0.08 * s,
    rx: Math.PI,
  });
  parts.add(new THREE.ConeGeometry(0.23 * s, 0.6 * s, 7), '#c8432f', { x, y: y + 1.05 * s, z });
  return parts;
}

function createGnomeMascot() {
  const mesh = gnomeParts(new PartsBuilder(), { scale: 0.8 }).mesh({ castShadow: false });
  mesh.position.set(0, 1.62, -1.45);
  return mesh;
}
