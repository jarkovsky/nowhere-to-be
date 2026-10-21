// The player's vehicles, built from boxes: the little off-roader and the others
// in the garage. They all drive the same way. Paint is a separate material so
// the colour can change; everything else on each vehicle is one merged mesh.
import * as THREE from 'three';
import { PartsBuilder, flatMaterial, prism } from '../world/build.js';

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
const CHROME = '#c9cdc6';

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
  return { pivot, spin, tire, radius };
}

/** Flared arches over the wheels, standing well clear of the tyre so the suspension can move. */
function arches(painted, wheels) {
  for (const { x, z, radius } of wheels) {
    const flare = x * 0.945;
    const top = radius * 2 + 0.32;
    painted.box(0.44, 0.12, radius * 1.8, '#ffffff', { x: flare, y: top, z });
    for (const end of [-1, 1]) {
      painted.beam(
        { x: flare, y: top, z: z + end * radius * 0.85 },
        { x: flare, y: top - 0.48, z: z + end * (radius + 0.27) },
        0.44,
        '#ffffff',
        0.12,
      );
    }
  }
}

/**
 * Each builder paints into `painted` (takes the chosen colour), `trim`, and `cargo` (luggage
 * that makes way for the roof tent), and describes its wheels, lamps and where things go:
 * `mounts` for the decorations, and `tent` as [x, y, z, length] for the roof tent.
 */
const VEHICLE_BUILDERS = {
  offroader(painted, trim, cargo) {
    painted.box(2.05, 0.62, 3.8, '#ffffff', { y: 1.03 });
    painted.box(1.9, 0.32, 1.15, '#ffffff', { y: 1.48, z: -1.25 }); // bonnet
    // Cabin: painted up to the window line, glass all round above it, and
    // pillars standing just proud of the glass.
    painted.box(1.92, 0.44, 2.3, '#ffffff', { y: 1.48, z: 0.35 });
    trim.box(1.86, 0.74, 2.26, GLASS, { y: 2.06, z: 0.35 });
    for (const x of [-0.95, 0.95]) {
      for (const z of [-0.77, 0.22, 1.45]) painted.box(0.1, 0.76, 0.13, '#ffffff', { x, y: 2.06, z });
      painted.box(0.1, 0.1, 2.3, '#ffffff', { x, y: 2.43, z: 0.35 }); // roof rail above the windows
      trim.box(0.05, 0.06, 0.27, CREAM, { x: x * 1.02, y: 1.52, z: -0.2 }); // door handles
      trim.box(0.04, 0.42, 0.04, RUBBER, { x: x * 1.015, y: 1.47, z: 0.22 }); // door seam
      // Mirrors on short arms, with the glass facing back.
      const side = Math.sign(x);
      painted.box(0.26, 0.06, 0.07, '#ffffff', { x: side * 1.08, y: 1.74, z: -0.66 });
      painted.box(0.12, 0.26, 0.38, '#ffffff', { x: side * 1.24, y: 1.8, z: -0.66 });
      trim.box(0.09, 0.2, 0.02, '#b9cfd0', { x: side * 1.24, y: 1.8, z: -0.46 });
    }
    for (const z of [-0.78, 1.47]) painted.box(1.92, 0.08, 0.1, '#ffffff', { y: 2.43, z }); // window frames, front and back
    trim.box(2.06, 0.14, 2.48, CREAM, { y: 2.5, z: 0.35 }); // roof
    trim.box(2.26, 0.21, 0.23, CREAM, { y: 0.86, z: -2.02 }); // bumpers
    trim.box(2.26, 0.21, 0.23, CREAM, { y: 0.86, z: 1.98 });
    trim.box(1.23, 0.3, 0.05, RUBBER, { y: 1.18, z: -1.94 }); // grille
    for (let i = -3; i <= 3; i++) trim.box(0.055, 0.24, 0.025, METAL, { x: i * 0.14, y: 1.18, z: -1.98 });
    // Roof rack with a duffel bag and a cooler.
    for (const x of [-0.76, 0.76]) trim.box(0.06, 0.13, 2, RUBBER, { x, y: 2.64, z: 0.35 });
    for (const z of [-0.55, 1.22]) trim.box(1.58, 0.13, 0.06, RUBBER, { y: 2.64, z });
    cargo.box(1.15, 0.4, 0.8, '#758676', { x: -0.12, y: 2.85, z: 0.65 });
    cargo.box(1.19, 0.045, 0.1, CREAM, { x: -0.12, y: 2.9, z: 0.65 });
    cargo.box(0.6, 0.25, 0.7, CREAM, { x: 0.35, y: 2.78, z: -0.23 });
    // Spare wheel on the tailgate.
    trim.add(new THREE.CylinderGeometry(0.54, 0.54, 0.3, 12), RUBBER, { y: 1.58, z: 2.07, rx: Math.PI / 2 });
    trim.add(new THREE.CylinderGeometry(0.29, 0.29, 0.32, 10), CREAM, { y: 1.58, z: 2.07, rx: Math.PI / 2 });

    const wheels = [-1.08, 1.08].flatMap(x => [-1.2, 1.24].map(z => ({ x, z, radius: WHEEL_RADIUS })));
    arches(painted, wheels);
    return {
      wheels,
      headlamps: { x: 0.77, y: 1.23, z: -1.97 },
      brakeLights: { x: 0.77, y: 1.21, z: 1.94 },
      mounts: { flag: [0.7, 2.71, 1.22], teddy: [-0.38, 2.66, -0.38], gnome: [0, 1.63, -1.45] },
      tent: [0, 2.71, 0.3, 2.2],
    };
  },

  pickup(painted, trim) {
    painted.box(2, 0.62, 4.6, '#ffffff', { y: 1.02 });
    painted.box(1.9, 0.3, 1.4, '#ffffff', { y: 1.47, z: -1.55 }); // bonnet
    // The cab, with glass all round between the pillars.
    painted.box(1.92, 0.4, 1.6, '#ffffff', { y: 1.52, z: -0.1 });
    trim.box(1.86, 0.66, 1.56, GLASS, { y: 2.05, z: -0.1 });
    for (const x of [-0.95, 0.95]) {
      for (const z of [-0.88, 0.68]) painted.box(0.1, 0.68, 0.13, '#ffffff', { x, y: 2.05, z });
      trim.box(0.05, 0.06, 0.27, CREAM, { x: x * 1.02, y: 1.55, z: -0.2 });
    }
    painted.box(1.96, 0.12, 1.66, '#ffffff', { y: 2.42, z: -0.1 }); // roof
    // The open bed, with a load of firewood.
    for (const x of [-0.95, 0.95]) painted.box(0.1, 0.42, 1.95, '#ffffff', { x, y: 1.52, z: 1.6 });
    painted.box(1.9, 0.42, 0.1, '#ffffff', { y: 1.52, z: 2.53 });
    trim.box(1.8, 0.05, 1.9, '#5c5148', { y: 1.34, z: 1.6 });
    for (const [x, y] of [
      [-0.45, 1.55],
      [0.05, 1.55],
      [0.55, 1.55],
      [-0.2, 1.95],
      [0.3, 1.95],
    ]) {
      trim.add(new THREE.CylinderGeometry(0.22, 0.22, 1.5, 7), '#8a6446', { x, y, z: 1.6, rx: Math.PI / 2 });
      trim.add(new THREE.CylinderGeometry(0.19, 0.19, 1.52, 7), '#d2b483', { x, y, z: 1.6, rx: Math.PI / 2 });
    }
    trim.box(2.2, 0.21, 0.23, CREAM, { y: 0.84, z: -2.36 }); // bumpers
    trim.box(2.2, 0.21, 0.23, CREAM, { y: 0.84, z: 2.36 });
    trim.box(1.3, 0.28, 0.05, RUBBER, { y: 1.16, z: -2.31 }); // grille
    for (let i = -3; i <= 3; i++) trim.box(0.055, 0.22, 0.025, METAL, { x: i * 0.15, y: 1.16, z: -2.35 });

    const wheels = [-1.04, 1.04].flatMap(x => [-1.45, 1.5].map(z => ({ x, z, radius: 0.56 })));
    arches(painted, wheels);
    return {
      wheels,
      headlamps: { x: 0.77, y: 1.2, z: -2.33 },
      brakeLights: { x: 0.8, y: 1.3, z: 2.6 },
      mounts: { flag: [0.82, 1.73, 2.4], teddy: [-0.35, 2.48, -0.4], gnome: [0, 1.63, -1.8] },
      tent: [0, 2.48, -0.1, 1.8],
    };
  },

  van(painted, trim) {
    // Painted below the waistline, cream above it, with a pop-top roof.
    painted.box(2.05, 1, 4.3, '#ffffff', { y: 1.12 });
    trim.box(2.05, 0.95, 4.1, CREAM, { y: 2.08, z: 0.1 });
    trim.box(2.07, 0.58, 3, GLASS, { y: 2.14, z: 0.5 }); // side windows
    trim.box(1.8, 0.6, 0.08, GLASS, { y: 2.12, z: -1.97, rx: -0.1 }); // windscreen
    trim.box(1.9, 0.2, 3.5, '#e2d7b8', { y: 2.64, z: 0.25 }); // pop-top
    trim.box(1.7, 0.36, 3.2, CREAM, { y: 2.88, z: 0.35 });
    painted.box(2.06, 0.08, 4.12, '#ffffff', { y: 1.66, z: 0.1 }); // waist stripe
    trim.add(new THREE.CircleGeometry(0.26, 10), CREAM, { y: 1.42, z: -2.16, ry: Math.PI }); // badge
    trim.box(2.12, 0.2, 0.25, CREAM, { y: 0.72, z: -2.2 }); // bumpers
    trim.box(2.12, 0.2, 0.25, CREAM, { y: 0.72, z: 2.2 });
    for (const x of [-1.03, 1.03]) trim.box(0.04, 0.06, 0.25, METAL, { x, y: 1.5, z: -1.2 }); // door handles

    const wheels = [-0.98, 0.98].flatMap(x => [-1.45, 1.45].map(z => ({ x, z, radius: 0.5 })));
    return {
      wheels,
      headlamps: { x: 0.68, y: 1.12, z: -2.16 },
      brakeLights: { x: 0.85, y: 1.3, z: 2.16 },
      mounts: { flag: [0.7, 3.06, 1.7], teddy: [-0.35, 3.06, -0.7], gnome: [0.4, 3.06, 0.6] },
      tent: [0, 3.06, 0.35, 2.4],
    };
  },

  saloon(painted, trim) {
    // A boxy little saloon from the seventies, low and square.
    painted.box(1.76, 0.56, 4.1, '#ffffff', { y: 0.86 });
    painted.box(1.66, 0.12, 1.1, '#ffffff', { y: 1.2, z: -1.45 }); // bonnet
    painted.box(1.66, 0.12, 0.8, '#ffffff', { y: 1.2, z: 1.62 }); // boot lid
    trim.box(1.6, 0.52, 1.95, GLASS, { y: 1.5, z: 0.2 });
    for (const x of [-0.8, 0.8]) {
      for (const z of [-0.74, 0.2, 1.14]) painted.box(0.08, 0.54, 0.1, '#ffffff', { x, y: 1.5, z });
      trim.box(0.04, 0.05, 0.22, CHROME, { x: x * 1.12, y: 1.06, z: -0.2 });
      trim.box(0.04, 0.04, 3.8, CHROME, { x: x * 1.105, y: 0.98, z: 0 }); // side trim
    }
    painted.box(1.64, 0.08, 2.02, '#ffffff', { y: 1.8, z: 0.2 }); // roof
    trim.box(1.9, 0.16, 0.16, CHROME, { y: 0.74, z: -2.08 }); // bumpers
    trim.box(1.9, 0.16, 0.16, CHROME, { y: 0.74, z: 2.08 });
    trim.box(0.9, 0.2, 0.04, RUBBER, { y: 0.98, z: -2.06 }); // grille
    for (let i = -2; i <= 2; i++) trim.box(0.04, 0.16, 0.02, CHROME, { x: i * 0.17, y: 0.98, z: -2.08 });

    const wheels = [-0.9, 0.9].flatMap(x => [-1.3, 1.28].map(z => ({ x, z, radius: 0.42 })));
    return {
      wheels,
      headlamps: { x: 0.62, y: 0.98, z: -2.06, square: true },
      brakeLights: { x: 0.66, y: 0.98, z: 2.06 },
      mounts: { flag: [0.6, 1.84, 0.95], teddy: [-0.3, 1.84, -0.1], gnome: [0, 1.26, -1.55] },
      tent: [0, 1.84, 0.2, 2],
    };
  },

  tractor(painted, trim) {
    // A long bonnet over a narrow chassis, big wheels at the back and a glass cab over them.
    trim.box(0.7, 0.45, 3.4, '#3a3f3a', { y: 0.78, z: -0.3 }); // chassis
    painted.box(0.9, 0.82, 2, '#ffffff', { y: 1.38, z: -1.05 }); // bonnet
    painted.box(0.94, 0.12, 2.04, '#ffffff', { y: 1.84, z: -1.05 });
    trim.box(0.86, 0.66, 0.06, '#40463f', { y: 1.36, z: -2.07 }); // grille
    for (let i = 0; i < 4; i++) trim.box(0.8, 0.04, 0.03, METAL, { y: 1.14 + i * 0.15, z: -2.1 });
    trim.add(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), '#2f3430', { x: 0.28, y: 2.2, z: -1.35 }); // exhaust
    trim.add(new THREE.CylinderGeometry(0.08, 0.06, 0.12, 6), '#2f3430', { x: 0.28, y: 2.82, z: -1.35 });
    // Cab: corner posts, glass on every side and a painted roof.
    trim.box(1.5, 0.12, 1.5, '#3a3f3a', { y: 1.35, z: 0.85 }); // floor
    for (const x of [-0.74, 0.74]) {
      for (const z of [0.12, 1.58]) trim.box(0.08, 1.45, 0.08, '#3a3f3a', { x, y: 2.08, z });
      trim.box(0.04, 1.3, 1.4, GLASS, { x, y: 2.1, z: 0.85 });
    }
    for (const z of [0.12, 1.58]) trim.box(1.4, 1.3, 0.04, GLASS, { y: 2.1, z });
    trim.box(0.7, 0.5, 0.6, '#2f3430', { y: 1.65, z: 1.05 }); // seat
    painted.box(1.76, 0.12, 1.76, '#ffffff', { y: 2.84, z: 0.85 }); // roof
    // Mudguards over the big rear wheels.
    for (const x of [-0.98, 0.98]) {
      painted.box(0.6, 0.1, 1.2, '#ffffff', { x, y: 1.86, z: 0.85 });
      for (const end of [-1, 1]) {
        painted.beam({ x, y: 1.86, z: 0.85 + end * 0.6 }, { x, y: 1.2, z: 0.85 + end * 1.05 }, 0.6, '#ffffff', 0.1);
      }
    }
    trim.box(1.3, 0.18, 0.2, METAL, { y: 0.8, z: -2.15 }); // front weight
    trim.box(0.6, 0.1, 0.5, METAL, { y: 0.7, z: 2 }); // hitch

    const wheels = [
      ...[-0.98, 0.98].map(x => ({ x, z: 0.85, radius: 0.86, width: 0.52 })),
      ...[-0.72, 0.72].map(x => ({ x, z: -1.55, radius: 0.46, width: 0.26 })),
    ];
    return {
      wheels,
      headlamps: { x: 0.3, y: 1.62, z: -2.09, radius: 0.12 },
      brakeLights: { x: 0.98, y: 1.6, z: 1.92 },
      mounts: { flag: [0.6, 2.9, 1.5], teddy: [-0.35, 2.9, 0.6], gnome: [0, 1.9, -1.55] },
      tent: [0, 2.9, 0.85, 1.8],
    };
  },
};

/** The parts of one of the garage's vehicles, for building a copy of it elsewhere (the farm's tractors). */
export function vehicleParts(name) {
  const painted = new PartsBuilder();
  const trim = new PartsBuilder();
  const spec = VEHICLE_BUILDERS[name](painted, trim, new PartsBuilder());
  return { painted, trim, spec };
}

export function createCar() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshLambertMaterial({ color: CAR_COLORS.orange, flatShading: true });
  // Lamps glow brighter at night; brake lights glow when braking.
  const headlampMaterial = new THREE.MeshLambertMaterial({
    color: '#fff3ce',
    emissive: '#ffd88e',
    emissiveIntensity: 0.3,
  });
  const brakeMaterial = new THREE.MeshLambertMaterial({ color: '#ad3f28', emissive: '#ff3a1c', emissiveIntensity: 0 });

  const vehicles = {};
  for (const [name, build] of Object.entries(VEHICLE_BUILDERS)) {
    const painted = new PartsBuilder();
    const trim = new PartsBuilder();
    const cargoParts = new PartsBuilder();
    const spec = build(painted, trim, cargoParts);
    const shell = new THREE.Group();
    shell.add(painted.mesh({ material: paint }), trim.mesh());
    const cargo = cargoParts.isEmpty ? null : cargoParts.mesh();
    if (cargo) shell.add(cargo);
    const [tx, ty, tz, length] = spec.tent;
    const tent = createRoofTent(length, ty);
    tent.root.position.set(tx, ty, tz);
    tent.root.visible = false;
    shell.add(tent.root);
    for (const side of [-1, 1]) {
      const { x, y, z, square, radius = 0.19 } = spec.headlamps;
      const lamp = square
        ? new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.06), headlampMaterial)
        : new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.08, 12).rotateX(Math.PI / 2), headlampMaterial);
      lamp.position.set(side * x, y, z);
      const brake = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.28, 0.06), brakeMaterial);
      brake.position.set(side * spec.brakeLights.x, spec.brakeLights.y, spec.brakeLights.z);
      shell.add(lamp, brake);
    }
    body.add(shell);

    // Wheels hang from the root rather than the body, so they don't lean with it.
    const wheels = spec.wheels.map(({ x, z, radius, width }) => {
      const wheel = createWheel(radius, width);
      // At rest each wheel sits a little above its own radius, leaving room to droop.
      wheel.rest = radius + 0.06;
      wheel.pivot.position.set(x, wheel.rest, z);
      root.add(wheel.pivot);
      return { ...wheel, front: z < 0 };
    });
    vehicles[name] = { shell, wheels, spec, cargo, tent };
  }

  // One spotlight between the headlamps keeps the light count (and cost) down.
  const headlight = new THREE.SpotLight('#fff0bd', 0, 70, Math.PI * 0.24, 0.6, 1.2);
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

  let current = vehicles.offroader;
  let rainbow = false;
  let tentOpen = 0;
  const car = {
    root,
    body,
    wheels: current.wheels,
    headlight,
    /** `chosen` lists the roof items to show; they all fit at once. With the tent, the roof ones ride on it. */
    customize(color, chosen = [], vehicle = 'offroader') {
      current = vehicles[vehicle] ?? vehicles.offroader;
      car.wheels = current.wheels;
      for (const v of Object.values(vehicles)) {
        v.shell.visible = v === current;
        for (const wheel of v.wheels) wheel.pivot.visible = v === current;
      }
      const { headlamps, mounts } = current.spec;
      headlight.position.set(0, headlamps.y + 0.07, headlamps.z + 0.07);
      headlight.target.position.set(0, -1, headlamps.z - 20);
      rainbow = color === 'rainbow';
      if (!rainbow) paint.color.set(CAR_COLORS[color] ?? CAR_COLORS.orange);
      const withTent = chosen.includes('tent');
      for (const v of Object.values(vehicles)) {
        v.tent.root.visible = withTent && v === current;
        if (v.cargo) v.cargo.visible = !withTent;
      }
      for (const [name, object] of Object.entries(decorations)) {
        object.visible = chosen.includes(name);
        const onRoof = mounts[name][1] >= current.spec.tent[1] - 0.1;
        if (withTent && onRoof) current.tent.carry(name, object);
        else {
          body.add(object);
          object.position.set(...mounts[name]);
        }
      }
      car.setTent(tentOpen, 0);
    },
    /** Opens the roof tent by `amount` (0 folded, 1 open); `night` lights the lantern inside. */
    setTent(amount, night) {
      tentOpen = amount;
      current.tent.open(amount, night);
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
  car.customize('orange');
  return car;
}

const TENT_WIDTH = 1.5;
const TENT_SHELL = '#3f4541';
const CANVAS = '#d9893b';
/** How far the lid swings over: past upright, so it hangs out to the side like an awning. */
const LID_SWING = 2.45;

/** A triangular prism, `width` across and one metre tall, running `length` along Z, with its ends open. */
function ridgeGeometry(width, length) {
  const w = width / 2;
  const d = length / 2;
  return prism([
    [-w, 0, d],
    [0, 1, -d],
    [-w, 0, -d],
    [-w, 0, d],
    [0, 1, d],
    [0, 1, -d],
    [w, 0, d],
    [w, 0, -d],
    [0, 1, -d],
    [w, 0, d],
    [0, 1, -d],
    [0, 1, d],
  ]);
}

/**
 * A roof tent: a low box on the roof that opens into a little ridge tent. The lid
 * swings over to one side, the canvas rises and a ladder slides down to the ground.
 * There is room at the front for the teddy. The origin is the middle of the base,
 * which sits `roof` metres above the ground.
 */
function createRoofTent(length, roof) {
  const half = length / 2;
  const w = TENT_WIDTH / 2;
  const porch = 0.45;
  const tentLength = length - porch;
  const middle = porch / 2; // the tent's centre, behind the porch
  const root = new THREE.Group();
  root.add(
    new PartsBuilder()
      .box(TENT_WIDTH, 0.2, length, TENT_SHELL, { y: 0.1 })
      .box(TENT_WIDTH + 0.02, 0.04, length + 0.02, '#c9c3b0', { y: 0.2 })
      .mesh(),
  );

  // The lid turns about its right-hand edge.
  const lid = new THREE.Group();
  lid.position.set(w, 0.22, middle);
  root.add(lid);
  lid.add(new PartsBuilder().box(TENT_WIDTH, 0.2, tentLength, TENT_SHELL, { x: -w, y: 0.1 }).mesh());

  // The canvas, with a doorway at the back that is lit from inside after dark.
  const tent = new THREE.Group();
  tent.position.set(0, 0.22, middle);
  root.add(tent);
  const canvas = new THREE.Mesh(
    ridgeGeometry(TENT_WIDTH - 0.04, tentLength),
    flatMaterial(CANVAS, { side: THREE.DoubleSide }),
  );
  canvas.castShadow = true;
  const ends = new PartsBuilder();
  for (const end of [-1, 1]) {
    ends.add(
      prism([
        [-w + 0.02, 0, 0],
        [w - 0.02, 0, 0],
        [0, 1, 0],
      ]),
      '#c97a33',
      { z: (end * tentLength) / 2 },
    );
  }
  const glow = new THREE.MeshLambertMaterial({ color: '#4b3b2c', emissive: '#ffbf5e', emissiveIntensity: 0 });
  const doorway = new THREE.Mesh(
    prism([
      [-0.3, 0, 0],
      [0.3, 0, 0],
      [0, 0.78, 0],
    ]),
    glow,
  );
  doorway.position.z = tentLength / 2 + 0.01;
  tent.add(
    canvas,
    ends.mesh({ material: flatMaterial('#ffffff', { vertexColors: true, side: THREE.DoubleSide }) }),
    doorway,
  );
  tent.add(new PartsBuilder().box(0.06, 0.06, tentLength + 0.1, '#6b5a45', { y: 1 }).mesh({ castShadow: false })); // ridge pole

  // A ladder at the side, down to the ground.
  const ladderParts = new PartsBuilder();
  for (const z of [-0.22, 0.22]) ladderParts.box(0.05, 1, 0.05, '#b8beb7', { y: -0.5, z });
  for (let k = 1; k <= 5; k++) ladderParts.box(0.04, 0.035, 0.44, '#b8beb7', { y: -k / 6 });
  const ladder = ladderParts.mesh({ receiveShadow: false });
  ladder.position.set(-w - 0.06, 0.18, middle);
  ladder.rotation.z = -0.22;
  root.add(ladder);
  const reach = (roof + 0.18) / Math.cos(0.22);

  const spots = {
    flag: { parent: root, at: [-w - 0.05, 0.05, half - 0.12] },
    teddy: { parent: root, at: [-0.3, 0.22, -half + 0.24] },
    gnome: { parent: root, at: [0.36, 0.22, -half + 0.24] },
  };

  return {
    root,
    carry(name, object) {
      const spot = spots[name];
      spot.parent.add(object);
      object.position.set(...spot.at);
    },
    open(amount, night) {
      // The lid swings over first, then the tent rises, then the ladder slides out.
      const swing = Math.min(1, amount / 0.6);
      const rise = Math.max(0, (amount - 0.25) / 0.75);
      const slide = Math.max(0, (amount - 0.6) / 0.4);
      lid.rotation.z = -Math.sin((swing * Math.PI) / 2) * LID_SWING;
      tent.visible = rise > 0;
      tent.scale.y = Math.max(0.001, rise * 1.05);
      glow.emissiveIntensity = night * rise * 1.5;
      ladder.visible = slide > 0;
      ladder.scale.y = Math.max(0.001, slide * reach);
    },
  };
}

/** A pennant on a pole. The group's origin is the foot of the pole. */
function createFlag() {
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.05), flatMaterial(METAL));
  pole.position.y = 0.75;
  const pennantShape = new THREE.BufferGeometry();
  pennantShape.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.5, 0, 0, 0, 0, 0, 0.25, 0.8], 3));
  pennantShape.computeVertexNormals();
  const pennant = new THREE.Mesh(
    pennantShape,
    new THREE.MeshLambertMaterial({ color: '#e5bb56', side: THREE.DoubleSide }),
  );
  pennant.position.y = 1;
  flag.add(pole, pennant);
  flag.userData.pennant = pennant;
  return flag;
}

/** A teddy bear sitting with its feet on the roof. */
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
  teddy.scale.setScalar(0.85);
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

/** Sits on the bonnet, or wherever the vehicle has room. */
function createGnomeMascot() {
  return gnomeParts(new PartsBuilder(), { scale: 0.8 }).mesh({ castShadow: false });
}
