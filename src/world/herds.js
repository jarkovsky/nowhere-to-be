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
import { PartsBuilder } from './build.js';
import { cone, eyes, fleece, furMaterial, leg, lump, pair, sheepFace, tube } from './creatures.js';

const DARK = '#2f2b26';
const CREAM = '#eee4c9';
const BAY = '#8a5532';
const GOAT = '#e8e2d4';
const PIG = '#e9aaa0';
const MOOSE = '#4a3829';
const BOAR = '#4b3b2e';
const RED = '#8a5a3a';
const MOUFLON = '#8b5a36';
const CAMEL = '#c8a06a';
const ANTLER = '#d4c4a0';
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
    body: p => {
      lump(p, BAY, [0, 1.62, 0], [0.95, 0.42, 0.36]);
      lump(p, BAY, [0.6, 1.62, 0], [0.4, 0.45, 0.35]); // chest
      lump(p, BAY, [-0.6, 1.68, 0], [0.42, 0.42, 0.36]); // quarters
      tube(p, DARK, [-0.96, 1.85, 0], [-1.22, 1.05, 0], 0.09, 0.06); // tail
      return lump(p, DARK, [-1.23, 1.02, 0], [0.08, 0.14, 0.08]);
    },
    head: p => {
      tube(p, BAY, [-0.04, -0.12, 0], [0.42, 0.8, 0], 0.3, 0.19); // neck
      lump(p, DARK, [0.12, 0.42, 0], [0.09, 0.48, 0.07], { tilt: -0.47 }); // mane
      lump(p, BAY, [0.5, 0.84, 0], [0.24, 0.19, 0.17], { tilt: -0.3 });
      tube(p, BAY, [0.56, 0.82, 0], [0.98, 0.68, 0], 0.17, 0.12); // face
      lump(p, '#6e4228', [0.99, 0.67, 0], [0.12, 0.12, 0.13]); // muzzle
      lump(p, '#f1ece0', [0.78, 0.8, 0], [0.2, 0.035, 0.05], { tilt: -0.3 }); // blaze
      eyes(p, 0.62, 0.92, 0.15);
      return pair(p, side => cone(p, BAY, [0.4, 0.98, side * 0.08], [0.36, 1.22, side * 0.11], 0.06, 0.5));
    },
    leg: p => leg(p, '#7a4a2c', { length: 1.28, top: 0.11, bottom: 0.06, foot: DARK, hoof: 0.08 }),
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
    body: p => {
      lump(p, GOAT, [0, 0.86, 0], [0.5, 0.26, 0.22]);
      lump(p, GOAT, [0.3, 0.88, 0], [0.24, 0.27, 0.22]);
      lump(p, GOAT, [-0.3, 0.9, 0], [0.24, 0.25, 0.22]);
      tube(p, GOAT, [0.32, 0.95, 0], [0.52, 1.08, 0], 0.15, 0.11); // neck
      return cone(p, GOAT, [-0.46, 1.0, 0], [-0.6, 1.2, 0], 0.05); // tail, up
    },
    head: p => {
      lump(p, GOAT, [0.1, 0.12, 0], [0.16, 0.14, 0.13], { tilt: -0.3 });
      tube(p, GOAT, [0.14, 0.1, 0], [0.36, -0.02, 0], 0.1, 0.07); // face
      lump(p, '#d9d2c3', [0.37, -0.03, 0], [0.06, 0.06, 0.065]); // muzzle
      cone(p, '#cfc8b6', [0.3, -0.06, 0], [0.32, -0.26, 0], 0.045); // beard
      eyes(p, 0.18, 0.17, 0.11, 0.03);
      pair(p, side => cone(p, '#7b6d58', [0.04, 0.24, side * 0.06], [-0.18, 0.46, side * 0.1], 0.04)); // horns
      return pair(p, side => cone(p, GOAT, [0.04, 0.17, side * 0.1], [0, 0.12, side * 0.3], 0.06, 0.5)); // ears
    },
    leg: p => leg(p, '#d9d2c3', { length: 0.62, top: 0.06, bottom: 0.035, foot: DARK }),
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
    body: p => {
      lump(p, PIG, [0, 0.68, 0], [0.62, 0.33, 0.32]);
      lump(p, PIG, [0.32, 0.66, 0], [0.32, 0.31, 0.3]);
      lump(p, PIG, [-0.3, 0.7, 0], [0.33, 0.32, 0.31]);
      return tube(p, PIG, [-0.6, 0.8, 0], [-0.68, 0.9, 0], 0.03, 0.02); // tail
    },
    head: p => {
      lump(p, PIG, [0.12, 0, 0], [0.24, 0.22, 0.25]);
      tube(p, PIG, [0.2, -0.04, 0], [0.42, -0.06, 0], 0.14, 0.12);
      lump(p, '#d98f86', [0.43, -0.06, 0], [0.04, 0.1, 0.12]); // snout
      eyes(p, 0.26, 0.08, 0.14, 0.03);
      return pair(p, side => cone(p, '#e29a90', [0.1, 0.18, side * 0.12], [0.26, 0.3, side * 0.2], 0.08, 0.4)); // ears
    },
    leg: p => leg(p, '#e29a90', { length: 0.38, top: 0.07, bottom: 0.05, foot: '#b57f74' }),
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
    body: p => fleece(p, 0.95, 1.05),
    head: p => sheepFace(p, 1, DARK),
    leg: p => leg(p, DARK, { length: 0.62, top: 0.065, bottom: 0.04 }),
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
    body: p => {
      lump(p, MOOSE, [0, 1.95, 0], [1.1, 0.52, 0.42]);
      lump(p, MOOSE, [0.6, 2.15, 0], [0.55, 0.55, 0.42]); // the hump over the shoulders
      lump(p, MOOSE, [-0.7, 1.98, 0], [0.45, 0.48, 0.4]);
      return lump(p, MOOSE, [-1.1, 2.1, 0], [0.08, 0.1, 0.07]); // stub of a tail
    },
    head: p => {
      tube(p, MOOSE, [-0.05, 0, 0], [0.4, 0.05, 0], 0.32, 0.26); // neck
      lump(p, MOOSE, [0.42, 0, 0], [0.26, 0.24, 0.22], { tilt: -0.35 });
      tube(p, MOOSE, [0.5, -0.05, 0], [1.05, -0.4, 0], 0.2, 0.17); // long face
      lump(p, '#3d2e22', [1.1, -0.42, 0], [0.18, 0.16, 0.17]); // big soft muzzle
      tube(p, '#3d2e22', [0.55, -0.2, 0], [0.6, -0.6, 0], 0.08, 0.04); // bell
      eyes(p, 0.6, 0.06, 0.18);
      pair(p, side => cone(p, MOOSE, [0.3, 0.2, side * 0.15], [0.2, 0.38, side * 0.35], 0.08, 0.5)); // ears
      // Broad, flat antlers with points along their edges.
      return pair(p, side => {
        tube(p, ANTLER, [0.3, 0.2, side * 0.16], [0.32, 0.42, side * 0.42], 0.06, 0.05, 5);
        lump(p, ANTLER, [0.32, 0.46, side * 0.64], [0.38, 0.06, 0.3], { roll: -side * 0.35 });
        for (let k = 0; k < 4; k++) {
          const x = 0.05 + k * 0.18;
          cone(p, ANTLER, [x, 0.54, side * 0.86], [x, 0.76, side * 0.94], 0.04, 1, 5);
        }
      });
    },
    leg: p => leg(p, '#b8a68a', { length: 1.5, top: 0.12, bottom: 0.065, foot: '#3d2e22' }),
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
    body: p => {
      lump(p, BOAR, [0, 0.82, 0], [0.62, 0.36, 0.28]);
      lump(p, BOAR, [0.32, 0.88, 0], [0.34, 0.4, 0.29]); // deep in the chest
      lump(p, '#2f251d', [0.1, 1.12, 0], [0.5, 0.1, 0.1]); // bristles along the back
      return tube(p, BOAR, [-0.6, 0.9, 0], [-0.7, 0.68, 0], 0.03, 0.02); // tail
    },
    head: p => {
      lump(p, BOAR, [0.12, -0.02, 0], [0.24, 0.22, 0.2], { tilt: -0.25 });
      tube(p, BOAR, [0.18, -0.06, 0], [0.5, -0.2, 0], 0.15, 0.09); // long snout
      lump(p, '#2f251d', [0.51, -0.2, 0], [0.04, 0.08, 0.09]);
      eyes(p, 0.24, 0.06, 0.15, 0.03);
      pair(p, side => cone(p, CREAM, [0.42, -0.2, side * 0.08], [0.44, -0.08, side * 0.13], 0.025)); // tusks
      return pair(p, side => cone(p, '#2f251d', [0.04, 0.16, side * 0.11], [-0.02, 0.32, side * 0.16], 0.06, 0.5));
    },
    leg: p => leg(p, '#2f251d', { length: 0.48, top: 0.08, bottom: 0.045 }),
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
    body: p => {
      // Paler underneath.
      const coat = (x, y) => (y < 1.2 ? '#c9a67e' : RED);
      lump(p, coat, [0, 1.45, 0], [0.92, 0.38, 0.29]);
      lump(p, coat, [0.55, 1.45, 0], [0.4, 0.4, 0.29]);
      lump(p, coat, [-0.55, 1.5, 0], [0.4, 0.37, 0.29]);
      return lump(p, '#d8c3a0', [-0.9, 1.52, 0], [0.1, 0.24, 0.24]); // pale rump
    },
    head: p => {
      tube(p, RED, [-0.05, -0.15, 0], [0.24, 0.6, 0], 0.24, 0.15); // neck
      lump(p, RED, [0.3, 0.66, 0], [0.22, 0.17, 0.15], { tilt: -0.15 });
      tube(p, RED, [0.38, 0.63, 0], [0.7, 0.55, 0], 0.12, 0.075);
      lump(p, DARK, [0.71, 0.55, 0], [0.05, 0.065, 0.07]);
      eyes(p, 0.42, 0.7, 0.13);
      pair(p, side => cone(p, RED, [0.22, 0.76, side * 0.09], [0.12, 0.96, side * 0.28], 0.08, 0.45));
      // Antlers: a beam up, back and out on each side, with tines off it.
      return pair(p, side => {
        const bend = [0.12, 1.3, side * 0.32];
        tube(p, ANTLER, [0.24, 0.78, side * 0.08], bend, 0.04, 0.035, 5);
        tube(p, ANTLER, bend, [0.02, 1.72, side * 0.4], 0.035, 0.022, 5);
        cone(p, ANTLER, [0.21, 0.95, side * 0.14], [0.45, 1.1, side * 0.2], 0.025, 1, 5);
        cone(p, ANTLER, [0.1, 1.4, side * 0.34], [0.3, 1.6, side * 0.42], 0.022, 1, 5);
      });
    },
    leg: p => leg(p, '#7a4e32', { length: 1.12, top: 0.09, bottom: 0.045, foot: DARK }),
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
    body: p => {
      // A pale belly and a pale saddle on the flanks.
      const coat = (x, y) => (y < 0.74 ? '#e8dfcc' : Math.abs(x + 0.05) < 0.2 && y < 0.98 ? '#d8c7a6' : MOUFLON);
      lump(p, coat, [0, 0.9, 0], [0.52, 0.27, 0.22]);
      lump(p, coat, [0.3, 0.9, 0], [0.24, 0.28, 0.22]);
      lump(p, coat, [-0.3, 0.92, 0], [0.24, 0.26, 0.22]);
      return tube(p, MOUFLON, [0.32, 0.98, 0], [0.52, 1.1, 0], 0.14, 0.11); // neck
    },
    head: p => {
      lump(p, MOUFLON, [0.12, 0.06, 0], [0.17, 0.14, 0.13]);
      tube(p, '#e8dfcc', [0.18, 0.04, 0], [0.38, 0, 0], 0.09, 0.065); // muzzle
      eyes(p, 0.2, 0.12, 0.11, 0.03);
      pair(p, side => cone(p, MOUFLON, [0.02, 0.14, side * 0.1], [-0.04, 0.12, side * 0.28], 0.05, 0.5)); // ears
      // Horns curling round in a ring beside each ear.
      return pair(p, side => p.add(new THREE.TorusGeometry(0.16, 0.05, 5, 10), '#a08e6e', { y: 0.18, z: side * 0.18 }));
    },
    leg: p => leg(p, '#e8dfcc', { length: 0.62, top: 0.06, bottom: 0.035, foot: DARK }),
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
    // A dromedary: one hump, a long neck dipping forward and curving up, and long legs on broad pads.
    body: p => {
      lump(p, CAMEL, [0, 1.75, 0], [0.92, 0.38, 0.35]);
      lump(p, CAMEL, [0.62, 1.68, 0], [0.38, 0.36, 0.33]);
      lump(p, '#c29a63', [-0.1, 2.12, 0], [0.6, 0.48, 0.38]); // the hump
      tube(p, CAMEL, [-0.88, 1.85, 0], [-0.98, 1.3, 0], 0.04, 0.03); // tail
      return lump(p, '#6f5439', [-0.99, 1.25, 0], [0.05, 0.1, 0.05]);
    },
    head: p => {
      tube(p, CAMEL, [-0.05, -0.05, 0], [0.55, 0.1, 0], 0.22, 0.15);
      lump(p, CAMEL, [0.55, 0.1, 0], 0.15);
      tube(p, CAMEL, [0.55, 0.1, 0], [0.8, 0.84, 0], 0.15, 0.12);
      lump(p, CAMEL, [0.86, 0.9, 0], [0.2, 0.15, 0.14], { tilt: 0.1 });
      tube(p, CAMEL, [0.95, 0.89, 0], [1.25, 0.82, 0], 0.12, 0.1);
      lump(p, '#a8845a', [1.26, 0.81, 0], [0.07, 0.1, 0.11]);
      eyes(p, 0.93, 0.98, 0.12);
      return pair(p, side => cone(p, '#a8845a', [0.76, 1.0, side * 0.08], [0.7, 1.14, side * 0.12], 0.04));
    },
    leg: p =>
      lump(
        leg(p, '#bf9762', { length: 1.42, top: 0.1, bottom: 0.055, foot: '#6f5439', hoof: 0.06, knee: 0.04 }),
        '#6f5439',
        [0, -1.38, 0],
        [0.13, 0.05, 0.13],
      ),
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
    const instanced = new THREE.InstancedMesh(build(new PartsBuilder()).geometry(), furMaterial, n);
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
