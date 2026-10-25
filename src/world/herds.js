// Herds out in the outlands: horses, goats and pigs at the farms, sheep above the fjord, camels
// in the desert, and moose, wild boar, red deer and mouflon out in the wild. Each animal
// wanders round its herd's patch of ground, stopping to graze, and now and then breaks into a
// run just for the fun of it. When a car comes close, or honks, they all run off and settle again further away.
// A herd is drawn with one instanced mesh each for bodies, heads and legs, and only when the
// player is near enough to see it.
import * as THREE from 'three';
import { angleDelta, createRandom } from '../core/math.js';
import { HERDS } from './layout.js';
import { terrainHeight, waterDepth } from './terrain.js';
import { PartsBuilder, vertexColorMaterial } from './build.js';

const DARK = '#2f2b26';
const CREAM = '#eee4c9';
/** Herds further than this from the player aren't drawn or moved. */
const DRAW_DISTANCE = 260;

/**
 * What each kind looks like and how it moves. Bodies face +X; `hip` is how high the legs
 * hang from, at each of `feet`, and `neck` where the head turns, nodding down by `graze` to
 * eat. Speeds are in metres a second, `shy` how close a car may come before they run, and
 * `frisky` how often one runs for the fun of it. `call` is the sound a honk gets back.
 */
export const KINDS = {
  horse: {
    body: p => p.box(2, 0.85, 0.72, '#8a5532', { y: 1.6 }).box(0.16, 0.9, 0.18, DARK, { x: -1.08, y: 1.35, rz: -0.25 }),
    head: p =>
      p
        .box(0.45, 1, 0.4, '#8a5532', { x: 0.2, y: 0.35, rz: -0.45 })
        .box(0.12, 0.95, 0.12, DARK, { x: 0.02, y: 0.45, rz: -0.45 })
        .box(0.78, 0.34, 0.34, '#8a5532', { x: 0.62, y: 0.74, rz: 0.4 })
        .box(0.5, 0.06, 0.1, '#f1ece0', { x: 0.66, y: 0.92, rz: 0.4 })
        .box(0.08, 0.2, 0.08, DARK, { x: 0.38, y: 1.02, z: 0.1 })
        .box(0.08, 0.2, 0.08, DARK, { x: 0.38, y: 1.02, z: -0.1 }),
    leg: p => p.box(0.18, 1.2, 0.18, '#7a4a2c', { y: -0.6 }).box(0.22, 0.2, 0.22, DARK, { y: -1.12 }),
    hip: 1.28,
    feet: [0.75, 0.25],
    neck: [0.88, 1.85],
    graze: 1.1,
    walk: 1.1,
    run: 6.5,
    shy: 16,
    frisky: 0.35,
    call: 'neigh',
  },
  goat: {
    body: p =>
      p.box(1, 0.5, 0.42, '#e8e2d4', { y: 0.85 }).box(0.08, 0.2, 0.08, '#e8e2d4', { x: -0.52, y: 1.12, rz: 0.4 }),
    head: p =>
      p
        .box(0.42, 0.26, 0.24, '#e8e2d4', { x: 0.16, y: 0.16, rz: -0.3 })
        .box(0.06, 0.36, 0.06, '#7b6d58', { x: -0.02, y: 0.42, z: 0.07, rz: 0.6 })
        .box(0.06, 0.36, 0.06, '#7b6d58', { x: -0.02, y: 0.42, z: -0.07, rz: 0.6 })
        .box(0.06, 0.16, 0.06, '#cfc8b6', { x: 0.3, y: -0.04 })
        .box(0.08, 0.05, 0.36, '#e8e2d4', { x: 0.02, y: 0.26 }),
    leg: p => p.box(0.1, 0.62, 0.1, '#d9d2c3', { y: -0.31 }).box(0.11, 0.1, 0.11, DARK, { y: -0.58 }),
    hip: 0.62,
    feet: [0.36, 0.13],
    neck: [0.5, 1.02],
    graze: 0.9,
    walk: 0.8,
    run: 3.6,
    shy: 12,
    frisky: 0.3,
    call: 'baa',
  },
  pig: {
    body: p => p.box(1.15, 0.62, 0.62, '#e9aaa0', { y: 0.66 }).box(0.08, 0.14, 0.08, '#e9aaa0', { x: -0.6, y: 0.86 }),
    head: p =>
      p
        .box(0.4, 0.42, 0.48, '#e9aaa0', { x: 0.14 })
        .box(0.12, 0.22, 0.26, '#d98f86', { x: 0.39, y: -0.06 })
        .box(0.06, 0.18, 0.14, '#e29a90', { x: 0.1, y: 0.28, z: 0.16, rx: 0.4 })
        .box(0.06, 0.18, 0.14, '#e29a90', { x: 0.1, y: 0.28, z: -0.16, rx: -0.4 }),
    leg: p => p.box(0.14, 0.36, 0.14, '#e29a90', { y: -0.18 }),
    hip: 0.38,
    feet: [0.38, 0.2],
    neck: [0.56, 0.68],
    graze: 0.6,
    walk: 0.6,
    run: 2.6,
    shy: 10,
    frisky: 0.12,
    call: 'oink',
  },
  sheep: {
    body: p => p.add(new THREE.IcosahedronGeometry(0.8, 1), CREAM, { y: 0.95, sx: 1.3, sy: 0.8, sz: 0.85 }),
    head: p =>
      p
        .box(0.5, 0.38, 0.36, DARK, { x: 0.18 })
        .box(0.24, 0.08, 0.14, DARK, { x: 0.02, y: 0.12, z: 0.24 })
        .box(0.24, 0.08, 0.14, DARK, { x: 0.02, y: 0.12, z: -0.24 }),
    leg: p => p.box(0.13, 0.62, 0.13, DARK, { y: -0.31 }),
    hip: 0.62,
    feet: [0.55, 0.28],
    neck: [0.9, 1.05],
    graze: 0.7,
    walk: 0.7,
    run: 3.2,
    shy: 12,
    frisky: 0.1,
    call: 'baa',
  },
  moose: {
    body: p => p.box(2.3, 1.1, 0.85, '#4a3829', { y: 1.95 }).box(0.9, 0.35, 0.7, '#4a3829', { x: 0.6, y: 2.6 }),
    head: p => {
      p.box(0.6, 0.6, 0.5, '#4a3829', { x: 0.2, y: 0.05, rz: -0.3 })
        .box(0.95, 0.45, 0.38, '#4a3829', { x: 0.72, y: -0.15, rz: -0.35 })
        .box(0.32, 0.32, 0.36, '#3d2e22', { x: 1.15, y: -0.38 })
        .box(0.12, 0.4, 0.1, '#3d2e22', { x: 0.6, y: -0.5 });
      // Broad, flat antlers with points along their edges.
      for (const side of [-1, 1]) {
        p.box(0.7, 0.08, 0.5, '#cdbb98', { x: 0.3, y: 0.42, z: side * 0.55, rx: side * 0.35 });
        for (let k = 0; k < 3; k++) p.box(0.08, 0.22, 0.08, '#cdbb98', { x: 0.1 + k * 0.22, y: 0.55, z: side * 0.8 });
      }
      return p;
    },
    leg: p => p.box(0.2, 1.5, 0.2, '#b8a68a', { y: -0.75 }),
    hip: 1.5,
    feet: [0.8, 0.28],
    neck: [1.1, 2.3],
    graze: 0.8,
    walk: 1,
    run: 5,
    shy: 22,
    frisky: 0.05,
    call: 'moo',
  },
  boar: {
    body: p => p.box(1.25, 0.7, 0.55, '#4b3b2e', { y: 0.8 }).box(1, 0.18, 0.2, '#2f251d', { x: 0.1, y: 1.2 }),
    head: p =>
      p
        .box(0.55, 0.45, 0.42, '#4b3b2e', { x: 0.2, y: -0.05, rz: -0.25 })
        .box(0.14, 0.2, 0.22, '#2f251d', { x: 0.5, y: -0.2 })
        .box(0.04, 0.14, 0.04, CREAM, { x: 0.45, y: -0.16, z: 0.13 })
        .box(0.04, 0.14, 0.04, CREAM, { x: 0.45, y: -0.16, z: -0.13 }),
    leg: p => p.box(0.13, 0.48, 0.13, '#2f251d', { y: -0.24 }),
    hip: 0.48,
    feet: [0.42, 0.17],
    neck: [0.6, 0.85],
    graze: 0.5,
    walk: 0.8,
    run: 4.5,
    shy: 20,
    frisky: 0.08,
    call: 'oink',
  },
  deer: {
    body: p => p.box(1.9, 0.8, 0.6, '#8a5a3a', { y: 1.45 }).box(0.3, 0.5, 0.62, '#d8c3a0', { x: -0.85, y: 1.45 }),
    head: p => {
      p.box(0.4, 0.8, 0.38, '#8a5a3a', { x: 0.12, y: 0.25, rz: -0.35 })
        .box(0.6, 0.3, 0.3, '#8a5a3a', { x: 0.42, y: 0.62, rz: 0.3 })
        .box(0.12, 0.12, 0.32, DARK, { x: 0.72, y: 0.52 });
      // Antlers: a beam up, back and out on each side, with tines off it.
      for (const side of [-1, 1]) {
        p.box(0.07, 0.95, 0.07, '#d9c9a6', { x: 0.2, y: 1.2, z: side * 0.2, rz: 0.3, rx: side * 0.35 });
        p.box(0.06, 0.4, 0.06, '#d9c9a6', { x: 0.3, y: 1.05, z: side * 0.3, rz: -0.6 });
        p.box(0.06, 0.35, 0.06, '#d9c9a6', { x: 0.12, y: 1.5, z: side * 0.36, rz: -0.4 });
      }
      return p;
    },
    leg: p => p.box(0.15, 1.1, 0.15, '#7a4e32', { y: -0.55 }),
    hip: 1.12,
    feet: [0.68, 0.2],
    neck: [0.85, 1.75],
    graze: 1,
    walk: 1,
    run: 6,
    shy: 26,
    frisky: 0.1,
  },
  mouflon: {
    body: p => p.box(1.05, 0.55, 0.45, '#8b5a36', { y: 0.88 }).box(0.4, 0.3, 0.47, '#d8c7a6', { x: -0.05, y: 0.92 }),
    head: p => {
      p.box(0.42, 0.28, 0.26, '#8b5a36', { x: 0.16, y: 0.08 }).box(0.14, 0.14, 0.2, '#e8dfcc', { x: 0.36, y: 0.02 });
      // Horns curling round in a ring beside each ear.
      for (const side of [-1, 1])
        p.add(new THREE.TorusGeometry(0.17, 0.05, 4, 8), '#a08e6e', { x: 0, y: 0.18, z: side * 0.17 });
      return p;
    },
    leg: p => p.box(0.1, 0.62, 0.1, '#e8dfcc', { y: -0.31 }),
    hip: 0.62,
    feet: [0.36, 0.14],
    neck: [0.5, 1.05],
    graze: 0.9,
    walk: 0.9,
    run: 5,
    shy: 20,
    frisky: 0.15,
    call: 'baa',
  },
  camel: {
    // A dromedary: one hump, a long neck reaching forward and up, and long legs on broad pads.
    body: p =>
      p
        .box(1.8, 0.75, 0.7, '#c8a06a', { y: 1.75 })
        .box(0.55, 0.62, 0.64, '#c8a06a', { x: 0.72, y: 1.66 })
        .add(new THREE.SphereGeometry(0.5, 10, 7), '#c29a63', { x: -0.1, y: 2.16, sx: 1.2, sy: 1, sz: 0.82 })
        .box(0.08, 0.6, 0.08, '#c8a06a', { x: -0.93, y: 1.55, rz: -0.2 })
        .box(0.12, 0.22, 0.1, '#6f5439', { x: -0.99, y: 1.2, rz: -0.2 }),
    head: p =>
      p
        .box(0.34, 1.25, 0.3, '#c8a06a', { x: 0.36, y: 0.38, rz: -0.75 })
        .box(0.64, 0.3, 0.3, '#c8a06a', { x: 0.94, y: 0.9, rz: 0.15 })
        .box(0.2, 0.22, 0.26, '#a8845a', { x: 1.22, y: 0.82, rz: 0.15 })
        .box(0.08, 0.14, 0.06, '#a8845a', { x: 0.74, y: 1.1, z: 0.1 })
        .box(0.08, 0.14, 0.06, '#a8845a', { x: 0.74, y: 1.1, z: -0.1 }),
    leg: p =>
      p
        .box(0.17, 1.36, 0.17, '#bf9762', { y: -0.68 })
        .box(0.22, 0.17, 0.22, '#b38a58', { y: -0.74 })
        .box(0.26, 0.1, 0.26, '#6f5439', { y: -1.37 }),
    hip: 1.42,
    feet: [0.62, 0.22],
    neck: [0.86, 1.95],
    graze: 0.9,
    walk: 0.9,
    run: 4.2,
    shy: 16,
    frisky: 0.06,
  },
};

/** Builds a herd's three instanced meshes from its kind's parts. */
function herdMeshes(scene, kind, herd) {
  // The whole of the herd's patch, up and down its slopes, so it isn't drawn while the patch is out of view.
  const patch = new THREE.Sphere(
    new THREE.Vector3(herd.x, terrainHeight(herd.x, herd.z), herd.z),
    herd.radius * 1.5 + 6,
  );
  const mesh = (build, n) => {
    const instanced = new THREE.InstancedMesh(build(new PartsBuilder()).geometry(), vertexColorMaterial, n);
    instanced.castShadow = true;
    instanced.boundingSphere = patch;
    scene.add(instanced);
    return instanced;
  };
  return {
    bodies: mesh(kind.body, herd.count),
    heads: mesh(kind.head, herd.count),
    legs: mesh(kind.leg, herd.count * 4),
  };
}

function createHerd(scene, herd, random) {
  const kind = KINDS[herd.kind];
  const meshes = herdMeshes(scene, kind, herd);
  /** A random spot in the herd's patch, on dry ground. */
  const pasture = () => {
    for (let tries = 0; ; tries++) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * herd.radius;
      const x = herd.x + Math.cos(a) * r;
      const z = herd.z + Math.sin(a) * r;
      if (tries > 20 || waterDepth(x, z) === 0) return { x, z };
    }
  };
  const animals = Array.from({ length: herd.count }, (_, i) => ({
    ...pasture(),
    heading: random() * Math.PI * 2,
    target: null,
    speed: 0,
    pace: 0,
    rest: random() * 8,
    stride: random() * 10,
    nod: kind.graze,
    scale: i < (herd.young ?? 0) ? 0.6 : 0.9 + random() * 0.2,
  }));

  // One animal's pose is built on these, then copied into the instanced meshes.
  const root = new THREE.Object3D();
  const neck = new THREE.Object3D();
  neck.position.set(kind.neck[0], kind.neck[1], 0);
  const hips = [-1, 1].flatMap(x =>
    [-1, 1].map(z => {
      const hip = new THREE.Object3D();
      hip.position.set(x * kind.feet[0], kind.hip, z * kind.feet[1]);
      return hip;
    }),
  );
  root.add(neck, ...hips);

  /** Sends an animal off towards a spot in its patch, walking or running. */
  function goTo(animal, spot, running) {
    animal.target = spot;
    animal.pace = running ? kind.run : kind.walk;
  }

  /** Runs from a point, as far as the patch allows. */
  function flee(animal, x, z) {
    const away = Math.atan2(animal.z - z, animal.x - x);
    const spot = { x: animal.x + Math.cos(away) * 18, z: animal.z + Math.sin(away) * 18 };
    const out = Math.hypot(spot.x - herd.x, spot.z - herd.z);
    if (out > herd.radius) {
      spot.x = herd.x + ((spot.x - herd.x) * herd.radius) / out;
      spot.z = herd.z + ((spot.z - herd.z) * herd.radius) / out;
    }
    goTo(animal, spot, true);
    animal.rest = 0;
  }

  let time = 0;
  return {
    herd,
    kind,
    hearHorn(x, z) {
      if (Math.hypot(herd.x - x, herd.z - z) > herd.radius + 40) return false;
      for (const animal of animals) flee(animal, x, z);
      return true;
    },
    update(dt, player) {
      const near = Math.hypot(player.x - herd.x, player.z - herd.z) < DRAW_DISTANCE + herd.radius;
      for (const mesh of Object.values(meshes)) mesh.visible = near;
      if (!near) return;
      time += dt;
      const moving = Math.abs(player.speed ?? 0) > 1;
      animals.forEach((animal, i) => {
        const car = Math.hypot(animal.x - player.x, animal.z - player.z);
        if (moving && car < kind.shy * animal.scale + 4 && animal.pace !== kind.run) flee(animal, player.x, player.z);
        if (animal.target) {
          const dx = animal.target.x - animal.x;
          const dz = animal.target.z - animal.z;
          const left = Math.hypot(dx, dz);
          if (left < 0.5) {
            animal.target = null;
            animal.rest = 4 + random() * 10;
          } else {
            const turn = angleDelta(animal.heading, Math.atan2(-dz, dx));
            animal.heading += turn * Math.min(1, dt * 3);
            const pace = Math.abs(turn) < 0.8 ? animal.pace * animal.scale ** 0.3 : 0;
            animal.speed += (Math.min(pace, left * 2) - animal.speed) * Math.min(1, dt * 3);
          }
        } else {
          animal.speed = Math.max(0, animal.speed - dt * 4);
          if ((animal.rest -= dt) <= 0) goTo(animal, pasture(), random() < kind.frisky);
        }
        animal.x += Math.cos(animal.heading) * animal.speed * dt;
        animal.z -= Math.sin(animal.heading) * animal.speed * dt;
        // Keep a little apart from each other.
        for (let j = i + 1; j < animals.length; j++) {
          const other = animals[j];
          const dx = other.x - animal.x;
          const dz = other.z - animal.z;
          const gap = Math.hypot(dx, dz);
          const room = (animal.scale + other.scale) * kind.feet[0] * 1.4;
          if (gap > 0.01 && gap < room) {
            // Each steps back half the overlap, so the pair stay centred where they were.
            const push = ((room - gap) / gap) * 0.5;
            animal.x -= dx * push;
            animal.z -= dz * push;
            other.x += dx * push;
            other.z += dz * push;
          }
        }
        // And within their patch: for farm animals, that is inside the fence.
        const out = Math.hypot(animal.x - herd.x, animal.z - herd.z);
        if (out > herd.radius) {
          animal.x = herd.x + ((animal.x - herd.x) * herd.radius) / out;
          animal.z = herd.z + ((animal.z - herd.z) * herd.radius) / out;
        }

        // Grazing nods down to the grass; moving, or with a car close by, the head comes up.
        const watching = car < kind.shy * 2;
        const nod = animal.speed > 0.2 || watching ? -0.1 : kind.graze + Math.sin(time * 0.9 + i) * 0.08;
        animal.nod += (nod - animal.nod) * Math.min(1, dt * 4);
        animal.stride += (animal.speed / (animal.scale * kind.hip)) * dt * 2.4;
        const swing = Math.min(0.6, animal.speed * 0.15);
        const bounce = animal.pace === kind.run ? Math.abs(Math.sin(animal.stride)) * 0.12 * animal.scale : 0;

        root.position.set(animal.x, terrainHeight(animal.x, animal.z) + bounce, animal.z);
        root.rotation.set(0, animal.heading, 0);
        root.scale.setScalar(animal.scale);
        neck.rotation.z = -animal.nod;
        hips.forEach(
          (hip, k) => (hip.rotation.z = Math.sin(animal.stride + (k === 0 || k === 3 ? 0 : Math.PI)) * swing),
        );
        root.updateMatrixWorld(true);
        meshes.bodies.setMatrixAt(i, root.matrixWorld);
        meshes.heads.setMatrixAt(i, neck.matrixWorld);
        hips.forEach((hip, k) => meshes.legs.setMatrixAt(i * 4 + k, hip.matrixWorld));
      });
      for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
    },
    getState: () => animals.map(({ x, z, speed }) => ({ x, z, speed })),
  };
}

export function createHerds(scene) {
  const random = createRandom(6113);
  const herds = HERDS.map(herd => createHerd(scene, herd, random));
  return {
    /** Herds near a honk run from it. Returns the sounds they make back. */
    hearHorn(x, z) {
      return herds.filter(herd => herd.hearHorn(x, z) && herd.kind.call).map(herd => herd.kind.call);
    },
    update(dt, player) {
      for (const herd of herds) herd.update(dt, player);
    },
    getState: () => herds.map(herd => ({ kind: herd.herd.kind, animals: herd.getState() })),
  };
}
