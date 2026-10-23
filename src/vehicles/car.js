// The player's vehicles, built from boxes: the little off-roader and the others
// in the garage. They all drive the same way. Paint is a separate material so
// the colour can change; everything else on each vehicle is one merged mesh.
// Four of them are characters with names, faces and colours of their own: two
// lorries with trailers, a rally car and a racing car.
import * as THREE from 'three';
import { PartsBuilder, flatMaterial, prism } from '../world/build.js';
import { detailMap } from '../world/detail.js';

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
const DARK = '#2a2e33';
const EYE_WHITE = '#f6f3ea';

/** The characters, which keep their own colours whatever paint is chosen. */
export const CHARACTERS = ['oliver', 'ruda', 'hyundai', 'mercedes'];

export const WHEEL_RADIUS = 0.59;

export function createWheel(radius = WHEEL_RADIUS, width = 0.4, hub = CREAM) {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 12), flatMaterial(RUBBER));
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const wheelHub = new PartsBuilder()
    .add(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.02, 10), hub, { rz: Math.PI / 2 })
    .add(new THREE.CylinderGeometry(radius * 0.19, radius * 0.19, width + 0.04, 8), METAL, { rz: Math.PI / 2 })
    .mesh({ castShadow: false });
  spin.add(tire, wheelHub);
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

/** A side view, given as [z, y] corners in order round it, made solid `width` across. */
function profile(points, width) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
    .translate(0, 0, -width / 2)
    .rotateY(Math.PI / 2);
}

/** A darker (or lighter) version of a colour. */
const shade = (color, amount) => `#${new THREE.Color(color).multiplyScalar(amount).getHexString()}`;

/** The race number 01 on a white panel, on the car's left (side -1) or right (side 1) flank. */
function raceNumber(parts, side, { x, y, z }) {
  const ink = '#1d2024';
  parts.box(0.02, 0.38, 0.5, '#f4f1e8', { x, y, z });
  const at = x + side * 0.012;
  // Seen from the left, the front of the car is on the reader's left, so the 0 goes nearer the front.
  const zero = z + side * 0.09;
  const one = z - side * 0.08;
  for (const dz of [-0.055, 0.055]) parts.box(0.02, 0.26, 0.035, ink, { x: at, y, z: zero + dz });
  for (const dy of [-0.112, 0.112]) parts.box(0.02, 0.036, 0.145, ink, { x: at, y: y + dy, z: zero });
  parts.box(0.02, 0.26, 0.035, ink, { x: at, y, z: one });
  parts.box(0.02, 0.035, 0.06, ink, { x: at, y: y + 0.105, z: one + side * 0.035 });
}

/**
 * Each builder paints into `painted` (takes the chosen colour), `trim`, and `cargo` (luggage
 * that makes way for the roof tent), and describes its wheels, lamps and where things go:
 * `mounts` for the decorations, and `tent` as [x, y, z, length, ladder] for the roof tent,
 * where `ladder` is how far out to the side its ladder hangs, clear of the body and wheels.
 * The characters also have a `face`, a `voice` for the engine and horn, a `camera` that
 * stands further back for the big ones, and the lorries a `trailer`.
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
      tent: [0, 2.71, 0.3, 2.2, 1.14],
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
      tent: [0, 2.48, -0.1, 1.8, 1.1],
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
      tent: [0, 3.06, 0.35, 2.4, 1.12],
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
      tent: [0, 1.84, 0.2, 2, 0.98],
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
      tent: [0, 2.9, 0.85, 1.8, 1.2],
    };
  },

  oliver: lorry('#2f6cb3'),
  ruda: lorry('#c43b2e'),

  hyundai(_, trim, cargo) {
    // A rally car: a small hatchback on wide arches, in dark blue and pale silver with red stripes.
    const navy = '#1f2b4b';
    const pale = '#c6cdd8';
    const red = '#d0392f';
    trim.add(
      profile(
        [
          [-2.06, 0.24],
          [-2.1, 0.62],
          [-1.98, 0.78],
          [-0.8, 0.94],
          [1.9, 1.0],
          [2.04, 0.96],
          [2.06, 0.3],
          [1.92, 0.22],
        ],
        1.82,
      ),
      pale,
    );
    trim.box(1.86, 0.38, 4.24, navy, { y: 0.41, z: -0.02 }); // dark below the waist, and the front bumper
    for (const points of [
      [
        [-1.92, 0.34],
        [-1.84, 0.78],
        [-1.6, 0.88],
        [-1.0, 0.9],
        [-0.76, 0.78],
        [-0.7, 0.34],
      ],
      [
        [0.68, 0.34],
        [0.76, 0.8],
        [1.0, 0.96],
        [1.65, 0.98],
        [1.88, 0.82],
        [1.94, 0.34],
      ],
    ])
      trim.add(profile(points, 1.98), navy); // wide arches
    // Glass all round, a dark roof and pillars, and a big wing at the back of the roof.
    trim.add(
      profile(
        [
          [-0.8, 0.94],
          [-0.05, 1.42],
          [1.5, 1.42],
          [1.94, 1.0],
        ],
        1.54,
      ),
      GLASS,
    );
    trim.box(1.58, 0.06, 1.62, navy, { y: 1.45, z: 0.72 });
    for (const side of [-1, 1]) {
      trim.add(
        profile(
          [
            [1.0, 1.0],
            [1.0, 1.415],
            [1.5, 1.42],
            [1.94, 1.0],
          ],
          0.04,
        ),
        pale,
        { x: side * 0.765 },
      );
      trim.box(0.04, 0.44, 0.1, navy, { x: side * 0.77, y: 1.2, z: 0.35 });
      trim.beam({ x: side * 0.76, y: 0.95, z: -0.78 }, { x: side * 0.74, y: 1.41, z: -0.06 }, 0.07, navy);
      // Red and orange stripes sweeping back along the doors, and the race number.
      trim.box(0.02, 0.1, 1.3, red, { x: side * 0.915, y: 0.72, z: -0.35, rx: -0.22 });
      trim.box(0.02, 0.06, 1.1, '#e58a3a', { x: side * 0.915, y: 0.86, z: -0.45, rx: -0.22 });
      raceNumber(trim, side, { x: side * 0.915, y: 0.78, z: 0.55 });
      trim.box(0.2, 0.12, 0.16, navy, { x: side * 0.86, y: 1.05, z: -0.62 }); // mirrors
      trim.box(0.04, 0.03, 0.14, '#b9cfd0', { x: side * 0.86, y: 1.05, z: -0.535 });
      for (const z of [-1.3 + 0.48, 1.3 + 0.48]) trim.box(0.36, 0.3, 0.03, navy, { x: side * 0.86, y: 0.3, z }); // mud flaps
      trim.box(0.3, 0.16, 0.04, DARK, { x: side * 0.72, y: 0.35, z: -2.13 }); // air intakes
    }
    // A pale bonnet with a dark stripe and two red pinstripes.
    trim.box(0.5, 0.02, 1.15, navy, { y: 0.875, z: -1.39, rx: -0.135 });
    for (const side of [-1, 1]) trim.box(0.06, 0.02, 1.15, red, { x: side * 0.31, y: 0.875, z: -1.39, rx: -0.135 });
    trim.box(1.0, 0.26, 0.04, DARK, { y: 0.42, z: -2.13 }); // grille
    trim.box(1.94, 0.05, 0.3, DARK, { y: 0.21, z: -2.02 }); // splitter
    trim.box(1.94, 0.03, 0.04, red, { y: 0.24, z: -2.17 });
    trim.box(1.66, 0.05, 0.45, navy, { y: 1.53, z: 1.86, rx: -0.1 }); // wing
    for (const side of [-1, 1]) {
      trim.box(0.03, 0.25, 0.52, navy, { x: side * 0.84, y: 1.48, z: 1.86 });
      trim.box(0.05, 0.12, 0.3, DARK, { x: side * 0.5, y: 1.46, z: 1.78 });
    }
    trim.box(1.6, 0.14, 0.1, DARK, { y: 0.3, z: 2.08 }); // diffuser
    trim.add(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 10), METAL, { x: 0.5, y: 0.3, z: 2.1, rx: Math.PI / 2 });
    // The air scoop on the roof makes way for the roof tent.
    cargo.box(0.32, 0.12, 0.42, red, { y: 1.54, z: 0.2 });
    cargo.box(0.24, 0.07, 0.02, DARK, { y: 1.55, z: -0.015 });

    const wheels = [-0.86, 0.86].flatMap(x =>
      [-1.3, 1.3].map(z => ({ x, z, radius: 0.42, width: 0.34, hub: '#d6a537' })),
    );
    return {
      wheels,
      headlamps: { x: 0.62, y: 0.7, z: -2.07, square: true },
      brakeLights: { x: 0.7, y: 0.86, z: 2.05 },
      mounts: { flag: [0.65, 1.56, 1.95], teddy: [-0.3, 1.48, 0.7], gnome: [0, 0.92, -1.45] },
      tent: [0, 1.48, 0.75, 1.8, 0.98],
      face: {
        eyes: { at: [0, 1.18, -0.425], lean: 1.0, spread: 0.6, width: 0.48, height: 0.62, iris: '#3f8fd0' },
        mouth: { at: [0, 0.535, -2.155], width: 0.86, height: 0.23 },
      },
      voice: { engine: 1.25 },
    };
  },

  mercedes(_, trim) {
    // A racing car: low and wide, silver, with a long bonnet, a grille of upright bars and a big wing.
    const silver = '#ced2d4';
    const red = '#c8372d';
    trim.add(
      profile(
        [
          [-2.3, 0.22],
          [-2.3, 0.64],
          [-2.12, 0.73],
          [-1.9, 0.75],
          [-0.6, 0.86],
          [1.0, 0.9],
          [2.02, 0.94],
          [2.22, 0.86],
          [2.25, 0.38],
          [2.1, 0.22],
        ],
        1.94,
      ),
      silver,
    );
    for (const points of [
      [
        [-2.08, 0.34],
        [-1.98, 0.74],
        [-1.75, 0.82],
        [-1.15, 0.84],
        [-0.88, 0.74],
        [-0.82, 0.34],
      ],
      [
        [0.72, 0.34],
        [0.8, 0.82],
        [1.05, 0.92],
        [1.75, 0.94],
        [1.98, 0.82],
        [2.02, 0.34],
      ],
    ])
      trim.add(profile(points, 2.04), silver); // arches
    // A low glass cabin with a fastback.
    trim.add(
      profile(
        [
          [-0.6, 0.86],
          [0.02, 1.24],
          [0.6, 1.26],
          [1.3, 0.9],
        ],
        1.5,
      ),
      GLASS,
    );
    trim.box(1.46, 0.05, 0.62, silver, { y: 1.265, z: 0.31 });
    for (const side of [-1, 1]) {
      trim.add(
        profile(
          [
            [0.55, 0.88],
            [0.55, 1.25],
            [0.62, 1.26],
            [1.3, 0.9],
          ],
          0.04,
        ),
        silver,
        { x: side * 0.755 },
      );
      trim.beam({ x: side * 0.74, y: 0.86, z: -0.58 }, { x: side * 0.72, y: 1.25, z: 0.04 }, 0.07, silver);
      trim.box(0.06, 0.12, 1.9, DARK, { x: side * 0.98, y: 0.3, z: -0.05 }); // side skirts
      raceNumber(trim, side, { x: side * 0.975, y: 0.6, z: 0.15 });
      trim.box(0.2, 0.1, 0.16, silver, { x: side * 0.86, y: 0.95, z: -0.42 }); // mirrors
      trim.box(0.04, 0.03, 0.14, '#b9cfd0', { x: side * 0.86, y: 0.95, z: -0.335 });
      trim.box(0.36, 0.02, 0.45, DARK, { x: side * 0.32, y: 0.805, z: -1.3, rx: -0.085 }); // bonnet vents
      trim.box(0.22, 0.03, 0.26, red, { x: side * 0.86, y: 0.4, z: -2.2 }); // canards
      trim.box(0.04, 0.46, 0.14, DARK, { x: side * 0.5, y: 1.13, z: 2.0 }); // wing posts
      trim.box(0.03, 0.28, 0.52, DARK, { x: side * 0.99, y: 1.33, z: 2.08 });
      trim.add(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 8), METAL, {
        x: side * 0.35,
        y: 0.3,
        z: 2.28,
        rx: Math.PI / 2,
      });
    }
    // The grille's upright bars, the dark mouth of the bumper below it and the splitter.
    trim.box(0.9, 0.15, 0.03, DARK, { y: 0.565, z: -2.31 });
    for (let i = -5; i <= 5; i++) trim.box(0.022, 0.13, 0.02, CHROME, { x: i * 0.075, y: 0.565, z: -2.325 });
    for (const side of [-1, 1]) trim.box(0.3, 0.16, 0.03, DARK, { x: side * 0.72, y: 0.33, z: -2.31 });
    trim.box(2.0, 0.05, 0.36, DARK, { y: 0.2, z: -2.22 });
    trim.box(1.96, 0.05, 0.44, DARK, { y: 1.38, z: 2.08, rx: 0.08 }); // wing
    trim.box(1.6, 0.14, 0.12, DARK, { y: 0.3, z: 2.24 }); // diffuser

    const wheels = [-0.9, 0.9].flatMap(x =>
      [-1.45, 1.35].map(z => ({ x, z, radius: 0.4, width: 0.34, hub: '#45494e' })),
    );
    return {
      wheels,
      headlamps: { x: 0.66, y: 0.63, z: -2.26, square: true },
      brakeLights: { x: 0.68, y: 0.74, z: 2.24, size: [0.36, 0.12] },
      mounts: { flag: [0.8, 1.41, 2.15], teddy: [-0.3, 1.29, 0.25], gnome: [0, 0.82, -1.5] },
      tent: [0, 1.29, 0.3, 1.6, 1.0],
      face: {
        eyes: { at: [0, 1.04, -0.3], lean: 1.01, spread: 0.62, width: 0.5, height: 0.62, iris: '#3f8fd0' },
        mouth: { at: [0, 0.465, -2.32], width: 0.9, height: 0.22 },
      },
      voice: { engine: 1.3 },
    };
  },
};

/** A European lorry with a flat-fronted cab, pulling a box trailer in the same colour. */
function lorry(paint) {
  return (_, trim) => {
    const line = shade(paint, 0.78);
    // The cab sits over the front wheels, with a raised roof.
    trim.box(2.44, 2.4, 2.3, paint, { y: 2.2, z: -1.2 });
    trim.add(
      profile(
        [
          [-2.3, 3.39],
          [-2.04, 3.82],
          [-0.05, 3.88],
          [-0.05, 3.39],
        ],
        2.38,
      ),
      paint,
    );
    // The front: windscreen, a sun visor with marker lamps, the grille and the bumper.
    trim.box(2.16, 0.92, 0.04, GLASS, { y: 2.68, z: -2.36 });
    trim.box(2.42, 0.14, 0.42, DARK, { y: 3.25, z: -2.5 });
    for (let i = -2; i <= 2; i++) trim.box(0.14, 0.06, 0.03, '#f2c14e', { x: i * 0.45, y: 3.25, z: -2.72 });
    trim.box(2.0, 0.8, 0.04, DARK, { y: 1.52, z: -2.36 });
    trim.box(1.9, 0.05, 0.03, CHROME, { y: 1.98, z: -2.37 });
    trim.box(2.44, 0.42, 0.3, paint, { y: 0.8, z: -2.3 });
    trim.box(2.3, 0.12, 0.26, DARK, { y: 0.53, z: -2.28 });
    for (const side of [-1, 1]) {
      trim.box(0.04, 0.72, 0.9, GLASS, { x: side * 1.225, y: 2.72, z: -1.75 });
      trim.box(0.03, 2.0, 0.03, line, { x: side * 1.225, y: 2.1, z: -1.0 }); // back of the door
      trim.box(0.04, 0.06, 0.24, CHROME, { x: side * 1.235, y: 2.15, z: -1.25 });
      // Big mirrors on arms, and steps up to the door.
      trim.beam({ x: side * 1.2, y: 3.0, z: -2.15 }, { x: side * 1.5, y: 2.95, z: -2.34 }, 0.06, DARK);
      trim.box(0.13, 0.62, 0.26, paint, { x: side * 1.52, y: 2.7, z: -2.36 });
      trim.box(0.09, 0.52, 0.02, '#b9cfd0', { x: side * 1.52, y: 2.7, z: -2.22 });
      for (const y of [0.45, 0.78]) trim.box(0.34, 0.06, 0.34, DARK, { x: side * 1.08, y, z: -0.62 });
      // The chassis behind the cab: fuel tanks, mudguards over the back wheels and the frame.
      trim.add(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 10), CHROME, {
        x: side * 0.98,
        y: 0.72,
        z: 0.5,
        rx: Math.PI / 2,
      });
      trim.box(0.62, 0.06, 1.2, DARK, { x: side * 0.98, y: 1.13, z: 2.1 });
      trim.box(0.6, 0.5, 0.03, DARK, { x: side * 0.98, y: 0.55, z: 2.75 });
      trim.box(0.18, 0.28, 5.6, DARK, { x: side * 0.5, y: 0.82, z: 0.55 });
    }
    trim.box(1.3, 0.14, 1.1, '#3b3f3c', { y: 1.07, z: 1.9 }); // the hitch

    // The trailer, built from its hitch point, which rests on the lorry's hitch.
    const trailer = new PartsBuilder();
    trailer.box(2.5, 2.74, 10, paint, { y: 1.43, z: 3.75 });
    trailer.box(2.54, 0.16, 10.04, DARK, { y: 0.1, z: 3.75 });
    for (const side of [-1, 1]) {
      for (let z = -0.75; z < 8.5; z += 1) trailer.box(0.04, 2.56, 0.07, line, { x: side * 1.26, y: 1.5, z });
      trailer.box(0.2, 0.3, 9.4, DARK, { x: side * 0.5, y: -0.13, z: 4 });
      trailer.box(0.12, 0.85, 0.12, DARK, { x: side * 0.9, y: -0.42, z: 0.9 }); // legs it stands on when unhitched
      trailer.box(0.24, 0.05, 0.3, DARK, { x: side * 0.9, y: -0.86, z: 0.9 });
      for (const y of [-0.22, -0.45]) trailer.box(0.04, 0.08, 3.4, METAL, { x: side * 1.2, y, z: 3.1 });
    }
    // The back: two doors with their lock bars, and a bumper with the lamps.
    trailer.box(0.03, 2.56, 0.02, line, { y: 1.5, z: 8.76 });
    for (const x of [-0.95, -0.35, 0.35, 0.95]) trailer.box(0.05, 2.4, 0.04, METAL, { x, y: 1.5, z: 8.78 });
    trailer.box(2.3, 0.16, 0.14, DARK, { y: -0.42, z: 8.62 });

    const wheels = [
      ...[-1.02, 1.02].map(x => ({ x, z: -1.5, radius: 0.52, width: 0.36, hub: CHROME })),
      ...[-0.98, 0.98].map(x => ({ x, z: 2.1, radius: 0.52, width: 0.56, hub: CHROME })),
    ];
    return {
      wheels,
      headlamps: { x: 0.9, y: 0.82, z: -2.46, square: true, size: [0.42, 0.2] },
      brakeLights: { x: 0.9, y: 0.9, z: 3.36 },
      mounts: { flag: [0.95, 3.88, -0.3], teddy: [-0.45, 3.86, -1.75], gnome: [0.45, 3.86, -1.75] },
      tent: [0, 3.88, -1.05, 1.9, 1.42],
      face: {
        eyes: { at: [0, 2.66, -2.385], lean: 0, spread: 1.02, width: 0.84, height: 0.8, iris: '#8a5a2c' },
        mouth: { at: [0, 1.66, -2.385], width: 1.45, height: 0.48 },
      },
      voice: { engine: 0.7, horn: 'air' },
      camera: 1.6,
      trailer: {
        parts: trailer,
        wheel: { radius: 0.5, width: 0.46, hub: CHROME },
        axles: [5.8, 6.85, 7.9],
        lamps: [
          [-0.85, -0.42, 8.7],
          [0.85, -0.42, 8.7],
        ],
        // Where the wheels hang below the hitch, from the hitch to the middle axle, and across.
        rest: -0.56,
        hitch: [0, 1.14, 1.9],
        axle: 6.85,
        track: 1.96,
      },
    };
  };
}

/** The parts of one of the garage's vehicles, for building a copy of it elsewhere (the farm's tractors). */
export function vehicleParts(name) {
  const painted = new PartsBuilder();
  const trim = new PartsBuilder();
  const spec = VEHICLE_BUILDERS[name](painted, trim, new PartsBuilder());
  return { painted, trim, spec };
}

/**
 * Mud thrown up over the car from below: `amount` (0 clean to 1 caked) sets how high it
 * reaches, and `space` turns world positions into the car's own, where y is the height
 * above the ground under it, so the splashes stay put on the car as it moves.
 */
const MUD = {
  amount: { value: 0 },
  color: { value: new THREE.Color('#5e4a33') },
  space: { value: new THREE.Matrix4() },
};

const MUD_FRAGMENT = /* glsl */ `
  {
    float splash = texture2D( mudDetail, vMud.xz * 0.8 + vMud.y * 0.5 ).a;
    float spots = texture2D( mudDetail, vec2( vMud.x * 1.3 + vMud.z * 0.7, vMud.y * 1.1 ) ).r;
    // A ragged line up to where it reaches, and spots flicked up above it.
    float reach = mudAmount * 1.4 + ( splash - 0.5 ) * 0.4;
    float mud = 1.0 - smoothstep( reach - 0.15, reach + 0.05, vMud.y );
    mud = max( mud, smoothstep( 0.58, 0.66, spots ) * ( 1.0 - smoothstep( reach, reach + 0.6, vMud.y ) ) );
    mud *= smoothstep( 0.0, 0.08, mudAmount );
    diffuseColor.rgb = mix( diffuseColor.rgb, mudColor * ( 0.8 + 0.4 * splash ), mud * 0.85 );
  }
`;

/** Lets `material` show the mud. */
function addMud(material) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      mudAmount: MUD.amount,
      mudColor: MUD.color,
      mudSpace: MUD.space,
      mudDetail: detailMap(),
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 mudSpace;\nvarying vec3 vMud;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvMud = ( mudSpace * modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float mudAmount;\nuniform vec3 mudColor;\nuniform sampler2D mudDetail;\nvarying vec3 vMud;',
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${MUD_FRAGMENT}`);
  };
  return material;
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

  // The lorries' trailers aren't fixed to the lorry, so they live beside it in the scene.
  const towed = new THREE.Group();
  const vehicles = {};
  for (const [name, build] of Object.entries(VEHICLE_BUILDERS)) {
    const painted = new PartsBuilder();
    const trim = new PartsBuilder();
    const cargoParts = new PartsBuilder();
    const spec = build(painted, trim, cargoParts);
    const shell = new THREE.Group();
    if (!painted.isEmpty) shell.add(painted.mesh({ material: paint }));
    shell.add(trim.mesh());
    const cargo = cargoParts.isEmpty ? null : cargoParts.mesh();
    if (cargo) shell.add(cargo);
    const [tx, ty, tz, length, ladder] = spec.tent;
    const tent = createRoofTent(length, ty, ladder);
    tent.root.position.set(tx, ty, tz);
    tent.root.visible = false;
    shell.add(tent.root);
    for (const side of [-1, 1]) {
      const { x, y, z, square, radius = 0.19, size = [0.34, 0.18] } = spec.headlamps;
      const lamp = square
        ? new THREE.Mesh(new THREE.BoxGeometry(...size, 0.06), headlampMaterial)
        : new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.08, 12).rotateX(Math.PI / 2), headlampMaterial);
      lamp.position.set(side * x, y, z);
      const brake = new THREE.Mesh(
        new THREE.BoxGeometry(...(spec.brakeLights.size ?? [0.23, 0.28]), 0.06),
        brakeMaterial,
      );
      brake.position.set(side * spec.brakeLights.x, spec.brakeLights.y, spec.brakeLights.z);
      shell.add(lamp, brake);
    }
    const face = spec.face ? createFace(spec.face) : null;
    if (face) shell.add(face.root);
    body.add(shell);
    const trailer = spec.trailer ? createTrailer(spec.trailer, brakeMaterial) : null;
    if (trailer) towed.add(trailer.root);

    // Wheels hang from the root rather than the body, so they don't lean with it.
    const wheels = spec.wheels.map(({ x, z, radius, width, hub }) => {
      const wheel = createWheel(radius, width, hub);
      // At rest each wheel sits a little above its own radius, leaving room to droop.
      wheel.rest = radius + 0.06;
      wheel.pivot.position.set(x, wheel.rest, z);
      root.add(wheel.pivot);
      return { ...wheel, front: z < 0 };
    });
    vehicles[name] = { shell, wheels, spec, cargo, tent, face, trailer };
  }

  // The mud goes on the body, the wheels and the trailers, but not on the lamps, the faces or
  // what rides on the roof. Materials shared with the rest of the world get copies of their own.
  const muddied = new Map([[paint, addMud(paint)]]);
  const muddy = mesh => {
    if (!muddied.has(mesh.material)) muddied.set(mesh.material, addMud(mesh.material.clone()));
    mesh.material = muddied.get(mesh.material);
  };
  for (const v of Object.values(vehicles)) {
    for (const part of v.shell.children) {
      if (part.isMesh && part.material !== headlampMaterial && part.material !== brakeMaterial) muddy(part);
    }
    for (const wheel of v.wheels) wheel.spin.children.forEach(muddy);
    v.trailer?.root.traverse(part => part.isMesh && part.material !== brakeMaterial && muddy(part));
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
    towed,
    wheels: current.wheels,
    /** The current vehicle's description, and its trailer ({ root, wheels, spec }) if it has one. */
    spec: current.spec,
    trailer: null,
    headlight,
    /** `chosen` lists the roof items to show; they all fit at once. With the tent, the roof ones ride on it. */
    customize(color, chosen = [], vehicle = 'offroader') {
      current = vehicles[vehicle] ?? vehicles.offroader;
      car.wheels = current.wheels;
      car.spec = current.spec;
      car.trailer = current.trailer;
      // Only the chosen vehicle is in the scene: hidden ones would still be updated every frame.
      for (const v of Object.values(vehicles)) {
        const attach = (parent, object) => (v === current ? parent.add(object) : parent.remove(object));
        attach(body, v.shell);
        for (const wheel of v.wheels) attach(root, wheel.pivot);
        if (v.trailer) attach(towed, v.trailer.root);
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
      current.face?.blink(time);
    },
    /** How dirty the car is, from 0 (clean) to 1. Call it once the car has been moved for the frame. */
    setMud(amount) {
      MUD.amount.value = amount;
      root.updateMatrixWorld();
      MUD.space.value.copy(root.matrixWorld).invert();
    },
    /** The characters look the way they are steering (1 is full left). */
    look(steering) {
      current.face?.look(steering);
    },
  };
  car.customize('orange');
  return car;
}

/** A trailer built from its spec, with its own wheels and brake lamps. Its origin is the hitch point. */
function createTrailer(spec, brakeMaterial) {
  const root = new THREE.Group();
  root.add(spec.parts.mesh());
  const lamps = new PartsBuilder();
  for (const [x, y, z] of spec.lamps) lamps.box(0.3, 0.16, 0.05, '#ffffff', { x, y, z });
  root.add(lamps.mesh({ material: brakeMaterial, castShadow: false }));
  // Each axle's pair of wheels turns as one.
  const { radius, width, hub } = spec.wheel;
  const pair = new PartsBuilder();
  for (const side of [-1, 1]) {
    const x = (side * spec.track) / 2;
    pair.add(new THREE.CylinderGeometry(radius, radius, width, 12), RUBBER, { x, rz: Math.PI / 2 });
    pair.add(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.02, 10), hub, { x, rz: Math.PI / 2 });
  }
  const axles = spec.axles.map(z => {
    const pivot = new THREE.Group();
    const spin = pair.mesh();
    pivot.add(spin);
    pivot.position.set(0, spec.rest, z);
    root.add(pivot);
    return { pivot, spin, z };
  });
  return { root, axles, spec };
}

/**
 * Eyes on the windscreen and a smile on the front, for the characters. `eyes.at` is the
 * middle of the windscreen and `eyes.lean` how far it leans back from upright. The
 * pupils look the way the car is steering, and every few seconds the eyes blink.
 */
function createFace({ eyes, mouth }) {
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.set(...eyes.at);
  holder.rotation.x = eyes.lean;
  root.add(holder);
  const disc = new THREE.CircleGeometry(1, 16).rotateY(Math.PI); // facing forward
  const r = Math.min(eyes.width, eyes.height) * 0.3;
  const reach = (eyes.width / 2 - r) * 0.75;
  const whites = new PartsBuilder();
  const irises = new PartsBuilder();
  for (const side of [-1, 1]) {
    const x = (side * eyes.spread) / 2;
    whites.add(disc, EYE_WHITE, { x, z: -0.02, sx: eyes.width / 2, sy: eyes.height / 2 });
    irises
      .add(disc, eyes.iris, { x, z: -0.03, sx: r, sy: r })
      .add(disc, '#1c1f22', { x, z: -0.036, sx: r * 0.52, sy: r * 0.52 })
      .add(disc, EYE_WHITE, { x: x - r * 0.35, y: r * 0.38, z: -0.042, sx: r * 0.22, sy: r * 0.22 });
  }
  const pupils = irises.mesh({ castShadow: false });
  pupils.position.y = -eyes.height * 0.06;
  holder.add(whites.mesh({ castShadow: false }), pupils);
  const smile = smileParts(mouth.width, mouth.height).mesh({ castShadow: false });
  smile.position.set(...mouth.at);
  root.add(smile);
  return {
    root,
    look(steering) {
      pupils.position.x = -steering * reach;
    },
    blink(time) {
      const phase = time % 4.6;
      const shut = phase < 0.18 ? Math.sin((phase / 0.18) * Math.PI) : 0;
      holder.scale.y = 1 - shut * 0.92;
    },
  };
}

/** A wide open smile facing forward, its top corners at the origin: teeth along the top and a tongue. */
function smileParts(width, height) {
  const curve = depth =>
    Array.from({ length: 13 }, (_, i) => {
      const t = i / 12;
      return new THREE.Vector2((t - 0.5) * width, -Math.sin(t * Math.PI) * depth);
    });
  // The band between two curves that meet at the corners of the mouth.
  const band = (upper, lower) =>
    new THREE.ShapeGeometry(new THREE.Shape([...curve(upper), ...curve(lower).slice(1, -1).reverse()])).rotateY(
      Math.PI,
    );
  return new PartsBuilder()
    .add(band(height * 0.12, height), '#4b1f20', { z: -0.01 })
    .add(band(height * 0.12, height * 0.38), EYE_WHITE, { z: -0.02 })
    .add(new THREE.CircleGeometry(1, 12).rotateY(Math.PI), '#c65d55', {
      y: -height * 0.76,
      z: -0.02,
      sx: width * 0.16,
      sy: height * 0.16,
    });
}

const TENT_WIDTH = 1.5;
const TENT_SHELL = '#3f4541';
const CANVAS = '#d9893b';

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
 * flips right over to lie flat beside it as an awning, two poles slide down to hold
 * it up, the canvas rises and a ladder slides down on the other side, hooked onto
 * the base on brackets so it hangs `ladderOut` metres from the middle, clear of the
 * vehicle. There is room at the front for the teddy. The origin is the middle of the
 * base, which sits `roof` metres above the ground.
 */
function createRoofTent(length, roof, ladderOut) {
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

  // The lid turns about its right-hand edge. Its pale lining faces up once it is open.
  const lid = new THREE.Group();
  lid.position.set(w, 0.22, middle);
  root.add(lid);
  lid.add(
    new PartsBuilder()
      .box(TENT_WIDTH, 0.2, tentLength, TENT_SHELL, { x: -w, y: 0.1 })
      .box(TENT_WIDTH - 0.1, 0.012, tentLength - 0.1, '#d8d2c0', { x: -w, y: -0.004 })
      .mesh(),
  );

  // Poles under the open lid's outer corners, down to the ground, and a canvas flap along its edge.
  const valance = new PartsBuilder()
    .box(0.03, 1, tentLength - 0.04, CANVAS, { x: 3 * w - 0.02, y: -0.5, z: middle })
    .mesh();
  valance.position.y = 0.02;
  root.add(valance);
  const poleParts = new PartsBuilder();
  for (const end of [-1, 1]) {
    poleParts.box(0.06, 1, 0.06, '#b8beb7', { x: 3 * w - 0.08, y: -0.5, z: middle + end * (tentLength / 2 - 0.1) });
  }
  const poles = poleParts.mesh({ receiveShadow: false });
  poles.position.y = 0.02;
  root.add(poles);

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

  // A ladder at the side, leaning out a little, down to the ground.
  const ladderParts = new PartsBuilder();
  for (const z of [-0.22, 0.22]) ladderParts.box(0.05, 1, 0.05, '#b8beb7', { y: -0.5, z });
  for (let k = 1; k <= 5; k++) ladderParts.box(0.04, 0.035, 0.44, '#b8beb7', { y: -k / 6 });
  const ladder = ladderParts.mesh({ receiveShadow: false });
  ladder.position.set(-ladderOut, 0.18, middle);
  ladder.rotation.z = -0.2;
  root.add(ladder);
  const reach = (roof + 0.18) / Math.cos(0.2);
  // The brackets it hangs from, out from the edge of the base.
  const bracketParts = new PartsBuilder();
  for (const z of [-0.22, 0.22]) {
    bracketParts.box(ladderOut - w + 0.04, 0.05, 0.05, '#b8beb7', { x: -(w + ladderOut) / 2, y: 0.17, z: middle + z });
  }
  const brackets = bracketParts.mesh({ receiveShadow: false });
  root.add(brackets);

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
      // The lid flips over first, then the tent rises, then the poles and the ladder slide out.
      const swing = Math.min(1, amount / 0.5);
      const rise = Math.min(1, Math.max(0, (amount - 0.3) / 0.5));
      const slide = Math.max(0, (amount - 0.65) / 0.35);
      lid.rotation.z = -((1 - Math.cos(swing * Math.PI)) / 2) * Math.PI;
      tent.visible = rise > 0;
      tent.scale.y = Math.max(0.001, rise * 1.05);
      glow.emissiveIntensity = night * rise * 1.5;
      ladder.visible = brackets.visible = poles.visible = valance.visible = slide > 0;
      ladder.scale.y = Math.max(0.001, slide * reach);
      poles.scale.y = Math.max(0.001, slide * (roof + 0.02));
      valance.scale.y = Math.max(0.001, slide * 0.24);
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
