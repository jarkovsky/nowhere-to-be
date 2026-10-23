// Animals that live in the valley: deer on their meadow walk, a family of
// ducks crossing the trail, grazing sheep, a shy rabbit, cows at the farm,
// foxes, fish in the lake and geese overhead. Out in the uplands there are
// wolves, both farms keep chickens, and herds roam the outlands.
import * as THREE from 'three';
import { angleDelta, createRandom, smoothstep } from '../core/math.js';
import { FARM, HABITATS, LAKE } from './layout.js';
import { terrainHeight } from './terrain.js';
import { PartsBuilder, localFrame } from './build.js';
import { createWolves } from './wolves.js';
import { createChickens } from './chickens.js';
import { createHerds } from './herds.js';

const DARK = '#394439';
const CREAM = '#eee4c9';

/** A leg (or head) that animates around a pivot, built as its own small mesh. */
function limb(parent, x, y, z, build) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(build(new PartsBuilder()).mesh({ receiveShadow: false }));
  parent.add(pivot);
  return pivot;
}

function deer() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = '#ad8962';
  const parts = new PartsBuilder()
    .box(2.05, 0.85, 0.67, fur, { y: 1.54 })
    .box(0.49, 1.05, 0.47, fur, { x: 0.76, y: 2.01, rz: -0.28 })
    .box(0.91, 0.45, 0.43, fur, { x: 1.15, y: 2.63 })
    .box(0.19, 0.22, 0.44, DARK, { x: 1.62, y: 2.6 })
    .box(0.25, 0.4, 0.36, CREAM, { x: -1.09, y: 1.6 });
  for (const z of [-0.27, 0.27]) parts.box(0.16, 0.48, 0.24, fur, { x: 0.92, y: 2.97, z, rx: z });
  for (const z of [-0.23, 0.23]) parts.box(0.07, 0.08, 0.04, DARK, { x: 1.35, y: 2.75, z });
  body.add(parts.mesh({ receiveShadow: false }));
  const legs = [];
  for (const x of [-0.7, 0.7]) {
    for (const z of [-0.23, 0.23]) {
      legs.push(
        limb(body, x, 1.3, z, p =>
          p.box(0.18, 1.16, 0.17, fur, { y: -0.57 }).box(0.2, 0.18, 0.19, DARK, { x: 0.04, y: -1.09 }),
        ),
      );
    }
  }
  return { root, body, legs };
}

function duck(scale) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(
    new PartsBuilder()
      .add(new THREE.IcosahedronGeometry(0.6, 1), CREAM, { y: 0.55, sx: 1.3, sy: 0.65, sz: 0.75 })
      .box(0.45, 0.5, 0.4, '#4f8064', { x: 0.65, y: 0.98 })
      .box(0.4, 0.11, 0.28, '#dfaa49', { x: 0.99, y: 0.85 })
      .box(0.06, 0.07, 0.43, DARK, { x: 0.81, y: 1.04 })
      .mesh({ receiveShadow: false }),
  );
  const legs = [-0.22, 0.22].map(z => limb(body, 0.1, 0.12, z, p => p.box(0.3, 0.1, 0.18, '#dfaa49')));
  root.scale.setScalar(scale);
  return { root, body, legs };
}

function sheep() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const parts = new PartsBuilder().add(new THREE.IcosahedronGeometry(1, 1), CREAM, {
    y: 1.1,
    sx: 1.3,
    sy: 0.8,
    sz: 0.8,
  });
  for (const x of [-0.75, 0.75]) for (const z of [-0.4, 0.4]) parts.box(0.18, 0.7, 0.18, DARK, { x, y: 0.35, z });
  body.add(parts.mesh({ receiveShadow: false }));
  const head = limb(body, 1, 1, 0, p => {
    p.box(0.65, 0.5, 0.5, DARK, { x: 0.1 });
    for (const z of [-0.35, 0.35]) p.box(0.3, 0.16, 0.25, '#cfc3a5', { y: 0.2, z });
    return p;
  });
  return { root, body, legs: [head] };
}

function rabbit() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = '#c9b48f';
  const parts = new PartsBuilder()
    .add(new THREE.IcosahedronGeometry(0.58, 1), fur, { y: 0.48, sx: 1.15, sy: 0.8, sz: 0.7 })
    .box(0.48, 0.44, 0.4, fur, { x: 0.49, y: 0.77 })
    .add(new THREE.IcosahedronGeometry(0.18, 0), CREAM, { x: -0.62, y: 0.58 });
  for (const z of [-0.13, 0.13]) {
    parts.box(0.14, 0.6, 0.12, fur, { x: 0.4, y: 1.17, z, rz: 0.18 });
    parts.box(0.06, 0.07, 0.025, DARK, { x: 0.7, y: 0.83, z: z * 1.65 });
  }
  for (const x of [-0.34, 0.4]) for (const z of [-0.23, 0.23]) parts.box(0.29, 0.17, 0.17, fur, { x, y: 0.13, z });
  body.add(parts.mesh({ receiveShadow: false }));
  return { root, body, legs: [] };
}

function cow() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hide = '#f1ece0';
  const patch = '#3c3f3a';
  const parts = new PartsBuilder()
    .box(2.3, 1.1, 1.05, hide, { y: 1.45 })
    .box(0.8, 0.7, 1.08, patch, { x: -0.3, y: 1.6 })
    .box(0.5, 0.5, 1.08, patch, { x: 0.7, y: 1.35 })
    .box(0.35, 0.3, 0.3, '#e9b3a4', { x: -0.55, y: 0.85 })
    .box(0.08, 0.9, 0.08, hide, { x: -1.18, y: 1.3, rz: -0.15 });
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.35, 0.35]) parts.box(0.24, 0.95, 0.24, hide, { x, y: 0.47, z });
  }
  body.add(parts.mesh({ receiveShadow: false }));
  const head = limb(body, 1.15, 1.75, 0, p => {
    p.box(0.75, 0.62, 0.62, hide, { x: 0.35 });
    p.box(0.3, 0.42, 0.66, '#e9b3a4', { x: 0.72, y: -0.08 });
    p.box(0.3, 0.3, 0.64, patch, { x: 0.2, y: 0.16 });
    for (const z of [-0.36, 0.36]) {
      p.box(0.08, 0.22, 0.08, '#e3d6b4', { x: 0.25, y: 0.38, z });
      p.box(0.22, 0.12, 0.2, patch, { x: 0.1, y: 0.15, z: z * 1.35 });
    }
    return p;
  });
  return { root, body, legs: [head] };
}

function fox() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = '#d0773b';
  const parts = new PartsBuilder()
    .box(1.15, 0.45, 0.42, fur, { y: 0.72 })
    .box(0.42, 0.4, 0.4, fur, { x: 0.7, y: 0.95 })
    .box(0.36, 0.2, 0.22, CREAM, { x: 0.98, y: 0.86 })
    .box(0.07, 0.07, 0.08, DARK, { x: 1.17, y: 0.92 })
    .box(0.75, 0.24, 0.24, fur, { x: -0.85, y: 0.82, rz: 0.35 })
    .box(0.2, 0.22, 0.25, CREAM, { x: -1.22, y: 0.97, rz: 0.35 });
  for (const z of [-0.12, 0.12]) parts.box(0.1, 0.22, 0.1, DARK, { x: 0.68, y: 1.25, z });
  body.add(parts.mesh({ receiveShadow: false }));
  const legs = [];
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.14, 0.14]) legs.push(limb(body, x, 0.55, z, p => p.box(0.1, 0.55, 0.1, DARK, { y: -0.25 })));
  }
  return { root, body, legs };
}

/** The flock of geese: one instanced mesh for the bodies and one for the wings. */
function geeseFlock(scene, count) {
  const unlit = { castShadow: false, receiveShadow: false };
  const body = new PartsBuilder()
    .box(1, 0.36, 0.42, '#8a8679')
    .box(0.7, 0.12, 0.14, '#33362f', { x: 0.75, y: 0.08 })
    .box(0.24, 0.2, 0.18, '#33362f', { x: 1.15, y: 0.12 })
    .box(0.3, 0.16, 0.38, '#d9d4c4', { x: -0.55 })
    .mesh(unlit);
  // The wing extends along +Z from its hinge; the left wing is the same one turned half over.
  const wing = new PartsBuilder().box(0.55, 0.05, 1.1, '#6f6c62', { z: 0.55 }).mesh(unlit);
  const bodies = new THREE.InstancedMesh(body.geometry, body.material, count);
  const wings = new THREE.InstancedMesh(wing.geometry, wing.material, count * 2);
  for (const mesh of [bodies, wings]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const dummy = new THREE.Object3D();
  const hinge = new THREE.Object3D();
  dummy.add(hinge);
  return {
    place(i, x, y, z, heading, flap) {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, heading, 0);
      dummy.updateMatrixWorld();
      bodies.setMatrixAt(i, dummy.matrix);
      for (const side of [-1, 1]) {
        hinge.position.set(0, 0.1, side * 0.2);
        hinge.rotation.set(side > 0 ? flap : Math.PI - flap, 0, 0);
        hinge.updateMatrixWorld();
        wings.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), hinge.matrixWorld);
      }
    },
    done() {
      bodies.instanceMatrix.needsUpdate = true;
      wings.instanceMatrix.needsUpdate = true;
    },
  };
}

/** A golden eagle with its wings spread for soaring, as one rigid mesh. */
function eagle() {
  const brown = '#5e4632';
  const parts = new PartsBuilder()
    .box(1.1, 0.34, 0.42, brown)
    .box(0.36, 0.3, 0.3, '#b48a4e', { x: 0.66, y: 0.06 })
    .box(0.18, 0.12, 0.12, '#e0b649', { x: 0.88, y: 0.02 })
    .box(0.5, 0.06, 0.62, brown, { x: -0.72, y: 0.04 });
  for (const side of [-1, 1]) {
    // Broad inner wing, narrower outer wing tipped up a little, and splayed tip feathers.
    parts.box(0.66, 0.06, 1.2, brown, { x: 0.02, y: 0.08, z: side * 0.78, rx: side * 0.1 });
    parts.box(0.5, 0.05, 0.9, '#4d3a2a', { x: 0.04, y: 0.2, z: side * 1.8, rx: side * 0.22 });
    for (let k = 0; k < 3; k++) {
      parts.box(0.12, 0.03, 0.42, '#3f3024', { x: 0.2 - k * 0.17, y: 0.3, z: side * 2.42, rx: side * 0.3 });
    }
  }
  const root = new THREE.Group();
  root.add(parts.mesh({ receiveShadow: false }));
  root.scale.setScalar(1.4); // a little larger than life, so it can be spotted from the ground
  return root;
}

function fish() {
  const root = new THREE.Group();
  root.add(
    new PartsBuilder()
      .add(new THREE.IcosahedronGeometry(0.3, 0), '#9fb2a8', { sx: 1.7, sy: 0.8, sz: 0.6 })
      .box(0.3, 0.36, 0.06, '#8aa198', { x: -0.62 })
      .mesh({ castShadow: false, receiveShadow: false }),
  );
  return root;
}

/** Where a walking group is in its back-and-forth cycle. */
function walkCycle(time, wait, duration) {
  const cycle = 2 * (wait + duration);
  const phase = ((time % cycle) + cycle) % cycle;
  if (phase < wait) return { progress: 0, walking: false, returning: false };
  if (phase < wait + duration) return { progress: (phase - wait) / duration, walking: true, returning: false };
  if (phase < 2 * wait + duration) return { progress: 1, walking: false, returning: true };
  return { progress: 1 - (phase - 2 * wait - duration) / duration, walking: true, returning: true };
}

export function createWildlife(scene, { onCall = () => {} } = {}) {
  const deerGroup = { ...HABITATS.deer, animals: [deer(), deer()], kind: 'deer', startle: 0 };
  deerGroup.animals[1].root.scale.setScalar(0.78);
  const duckGroup = {
    ...HABITATS.ducks,
    animals: [duck(1), duck(0.55), duck(0.55), duck(0.55)],
    kind: 'ducks',
    startle: 0,
  };
  const walkers = [deerGroup, duckGroup];
  const sheepFlock = Array.from({ length: HABITATS.sheep.count }, (_, i) => {
    const animal = sheep();
    const angle = i * 2.4;
    animal.home = {
      x: HABITATS.sheep.x + Math.cos(angle) * (3 + i * 1.6),
      z: HABITATS.sheep.z + Math.sin(angle) * (3 + i * 1.6),
    };
    animal.root.position.set(animal.home.x, terrainHeight(animal.home.x, animal.home.z), animal.home.z);
    animal.root.rotation.y = angle * 1.7;
    return animal;
  });
  const foxGroups = [HABITATS.fox, HABITATS.woodFox].map(home => ({
    ...home,
    animals: [fox()],
    kind: 'fox',
    startle: 0,
  }));
  walkers.push(...foxGroups);

  // A fox hunting in the long grass: it listens, crouches and pounces, then trots to a new spot.
  const hunter = fox();
  const huntGround = HABITATS.mousingFox;
  const hunt = { x: huntGround.x, z: huntGround.z, heading: 0, state: 'listen', timer: 2, from: null, to: null };

  // Cows wander around the farm paddock.
  const random = createRandom(907);
  const paddock = FARM.paddock;
  const toWorld = localFrame(FARM.x, FARM.z, FARM.rotation);
  const pasture = () =>
    toWorld(
      paddock.x0 + 2 + random() * (paddock.x1 - paddock.x0 - 4),
      paddock.z0 + 2 + random() * (paddock.z1 - paddock.z0 - 4),
    );
  const herd = Array.from({ length: HABITATS.cows.count }, (_, i) => {
    const animal = cow();
    const spot = pasture();
    Object.assign(animal, { x: spot.x, z: spot.z, target: pasture(), heading: i * 2, rest: i * 3 });
    return animal;
  });
  let cowsLookUp = 0;

  const flock = HABITATS.geese;
  const geese = geeseFlock(scene, 7);
  const leadGoose = new THREE.Vector3();

  const soarer = eagle();
  const eyrie = HABITATS.eagle;
  const eagleHeight = terrainHeight(eyrie.x, eyrie.z) + eyrie.height;
  scene.add(soarer);

  const jumper = fish();
  const splash = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.75, 14),
    new THREE.MeshBasicMaterial({ color: '#eef8f4', transparent: true, opacity: 0, depthWrite: false }),
  );
  splash.rotation.x = -Math.PI / 2;
  scene.add(jumper, splash);
  const leap = { x: LAKE.x, z: LAKE.z, heading: 0, start: -10, next: 3 };

  const bunny = rabbit();
  const burrow = HABITATS.burrow;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.05, 18), new THREE.MeshLambertMaterial({ color: '#3e3b30' }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(burrow.x, terrainHeight(burrow.x, burrow.z) + 0.08, burrow.z);
  scene.add(hole);
  for (const animal of [
    ...deerGroup.animals,
    ...duckGroup.animals,
    ...foxGroups.flatMap(group => group.animals),
    hunter,
    ...sheepFlock,
    ...herd,
    bunny,
  ]) {
    animal.root.traverse(child => {
      if (child.isMesh) child.castShadow = true;
    });
    scene.add(animal.root);
  }

  let time = 0;
  let sheepLookUp = 0;
  const rabbitState = { progress: 0, wait: 0, returning: false };

  function placeWalkers() {
    for (const group of walkers) {
      const dx = group.end.x - group.start.x;
      const dz = group.end.z - group.start.z;
      group.animals.forEach((animal, i) => {
        // Followers trail a little behind the leader.
        const step = walkCycle(Math.max(0, time - i * 0.65), group.wait, group.duration);
        const x = group.start.x + dx * step.progress;
        const z = group.start.z + dz * step.progress + i * 0.65;
        const hop = Math.max(0, Math.sin(group.startle * 9)) * group.startle * 0.8;
        // Ducks that start out on the lake swim until they reach the shore.
        const ground = terrainHeight(x, z);
        const swimming = group.kind === 'ducks' && ground < LAKE.level - 0.1;
        const y = swimming
          ? LAKE.level - 0.3 * animal.root.scale.y + Math.sin(time * 2 + i) * 0.03
          : ground + (step.walking ? Math.abs(Math.sin(time * 5 - i)) * 0.065 : 0) + hop;
        animal.root.position.set(x, y, z);
        animal.root.rotation.y = Math.atan2(-dz, dx) + (step.returning ? Math.PI : 0);
        if (group.kind === 'deer' || group.kind === 'fox') {
          const pace = group.kind === 'fox' ? 11 : 7;
          animal.legs.forEach(
            (leg, j) =>
              (leg.rotation.z = step.walking ? Math.sin(time * pace + (j === 0 || j === 3 ? 0 : Math.PI)) * 0.42 : 0),
          );
          const grazing = group.kind === 'deer' && !step.walking && group.startle === 0;
          animal.body.rotation.z = grazing ? -0.1 + Math.sin(time * 0.8 + i) * 0.04 : 0;
        } else {
          const paddling = step.walking && !swimming;
          animal.body.rotation.z = Math.sin(time * (paddling ? 7 : 1) + i) * (paddling ? 0.1 : 0.025);
          animal.legs.forEach((leg, j) => (leg.rotation.z = paddling ? Math.sin(time * 12 + j * Math.PI) * 0.4 : 0));
        }
      });
    }
  }

  function updateHerd(dt) {
    cowsLookUp = Math.max(0, cowsLookUp - dt);
    herd.forEach((animal, i) => {
      const dx = animal.target.x - animal.x;
      const dz = animal.target.z - animal.z;
      let walking = false;
      if (animal.rest > 0) {
        animal.rest -= dt;
      } else if (Math.hypot(dx, dz) < 0.4) {
        animal.target = pasture();
        animal.rest = 6 + random() * 12;
      } else {
        const turn = angleDelta(animal.heading, Math.atan2(-dz, dx));
        animal.heading += turn * Math.min(1, dt * 1.2);
        if (Math.abs(turn) < 0.6) {
          animal.x += Math.cos(animal.heading) * 0.6 * dt;
          animal.z -= Math.sin(animal.heading) * 0.6 * dt;
          walking = true;
        }
      }
      const head = cowsLookUp > 0 || walking ? 0.1 : -0.55 + Math.sin(time * 0.9 + i) * 0.08;
      animal.legs[0].rotation.z += (head - animal.legs[0].rotation.z) * Math.min(1, dt * 4);
      animal.body.rotation.z = walking ? Math.sin(time * 4 + i) * 0.03 : 0;
      animal.root.position.set(animal.x, terrainHeight(animal.x, animal.z), animal.z);
      animal.root.rotation.y = animal.heading;
    });
  }

  /** The eagle circles over the hut on the hill, banking into the turn. */
  function updateEagle() {
    const a = (time / eyrie.period) * Math.PI * 2;
    soarer.position.set(
      eyrie.x + Math.cos(a) * eyrie.radius,
      eagleHeight + Math.sin(time * 0.3) * 3,
      eyrie.z + Math.sin(a) * eyrie.radius,
    );
    soarer.rotation.set(0.35, Math.atan2(-Math.cos(a), -Math.sin(a)), 0, 'YXZ'); // inner wing down
  }

  function updateGeese() {
    const angle = (time / flock.period) * Math.PI * 2;
    for (let i = 0; i < 7; i++) {
      // A V: each pair flies a little further behind and further out than the one in front.
      const rank = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      const a = angle - rank * 0.03;
      const radius = flock.radius + side * rank * 3.5;
      const x = flock.x + Math.cos(a) * radius;
      const z = flock.z + Math.sin(a) * radius;
      const y = flock.height + Math.sin(time * 0.7 + i) * 0.4;
      geese.place(i, x, y, z, Math.atan2(-Math.cos(a), -Math.sin(a)), Math.sin(time * 5 + i * 0.7) * 0.5);
      if (i === 0) leadGoose.set(x, y, z);
    }
    geese.done();
  }

  /** Every few seconds a fish jumps somewhere on the lake, preferably where the player can see it. */
  function updateFish(dt, player) {
    leap.next -= dt;
    if (leap.next <= 0) {
      let best = Infinity;
      for (let k = 0; k < 12; k++) {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * 0.85;
        const x = LAKE.x + Math.cos(a) * r * LAKE.rx;
        const z = LAKE.z + Math.sin(a) * r * LAKE.rz;
        const distance = Math.hypot(x - player.x, z - player.z);
        if (terrainHeight(x, z) < LAKE.level - 1 && distance < best) {
          best = distance;
          Object.assign(leap, { x, z });
        }
      }
      Object.assign(leap, { heading: random() * Math.PI * 2, start: time, next: 4 + random() * 5 });
    }
    const t = (time - leap.start) / 1.1;
    jumper.visible = t >= 0 && t <= 1;
    if (jumper.visible) {
      const along = (t - 0.5) * 2.4;
      jumper.position.set(
        leap.x + Math.cos(leap.heading) * along,
        LAKE.level - 0.3 + Math.sin(t * Math.PI) * 1.5,
        leap.z - Math.sin(leap.heading) * along,
      );
      jumper.rotation.set(0, leap.heading, Math.cos(t * Math.PI) * 0.9);
    }
    // A ring of foam where it lands.
    const after = time - leap.start - 1.1;
    splash.visible = after >= 0 && after < 1;
    if (splash.visible) {
      splash.position.set(
        leap.x + Math.cos(leap.heading) * 1.2,
        LAKE.level + 0.03,
        leap.z - Math.sin(leap.heading) * 1.2,
      );
      splash.scale.setScalar(0.6 + after * 1.6);
      splash.material.opacity = 0.7 * (1 - after);
    }
  }

  function placeRabbit() {
    const p = rabbitState.progress;
    const x = burrow.x - 7 * (1 - p);
    const z = burrow.z + 2 * (1 - p);
    const underground = smoothstep(p, 0.72, 1);
    bunny.root.position.set(
      x,
      terrainHeight(x, z) + Math.abs(Math.sin(time * 9)) * 0.25 * (1 - underground) - underground * 1.9,
      z,
    );
    bunny.root.rotation.y = Math.atan2(2, 7) + (rabbitState.returning ? Math.PI : 0);
    bunny.body.rotation.z = -Math.sin(underground * Math.PI) * 0.3;
    bunny.root.visible = underground < 0.99;
  }

  /** The hunting fox's next move: a short trot to a fresh patch of grass near its home. */
  function trotTo(x, z, state = 'trot') {
    hunt.from = { x: hunt.x, z: hunt.z };
    hunt.to = { x, z };
    hunt.state = state;
    hunt.timer = Math.hypot(x - hunt.x, z - hunt.z) / (state === 'flee' ? 4 : 1.5);
    hunt.length = hunt.timer;
    hunt.heading = Math.atan2(-(z - hunt.z), x - hunt.x);
  }

  function updateHunter(dt, player) {
    const distance = Math.hypot(player.x - hunt.x, player.z - hunt.z);
    hunter.root.visible = distance < 220;
    if (distance < 13 && hunt.state !== 'flee') {
      const away = Math.atan2(hunt.z - player.z, hunt.x - player.x);
      const r = Math.min(16, 26 - Math.hypot(hunt.x - huntGround.x, hunt.z - huntGround.z));
      trotTo(hunt.x + Math.cos(away) * r, hunt.z + Math.sin(away) * r, 'flee');
    }
    hunt.timer -= dt;
    let lift = 0;
    let pitch = 0;
    let walking = false;
    if (hunt.state === 'trot' || hunt.state === 'flee' || hunt.state === 'leap') {
      const t = Math.min(1, 1 - hunt.timer / hunt.length);
      hunt.x = hunt.from.x + (hunt.to.x - hunt.from.x) * t;
      hunt.z = hunt.from.z + (hunt.to.z - hunt.from.z) * t;
      if (hunt.state === 'leap') {
        // A high arc, nose up on the way up and nose down into the grass.
        lift = Math.sin(t * Math.PI) * 1.3;
        pitch = Math.cos(t * Math.PI) * 0.7;
      } else walking = true;
    } else if (hunt.state === 'crouch') {
      lift = -0.15;
      pitch = -0.15;
    } else if (hunt.state === 'dig') {
      pitch = -0.5 + Math.sin(time * 14) * 0.08;
    }
    if (hunt.timer <= 0) {
      if (hunt.state === 'listen') {
        hunt.state = 'crouch';
        hunt.timer = 0.7;
      } else if (hunt.state === 'crouch') {
        trotTo(hunt.x + Math.cos(-hunt.heading) * 2.6, hunt.z + Math.sin(-hunt.heading) * 2.6, 'leap');
        hunt.timer = hunt.length = 0.9;
      } else if (hunt.state === 'leap') {
        hunt.state = 'dig';
        hunt.timer = 1.6;
      } else if (hunt.state === 'dig') {
        const a = random() * Math.PI * 2;
        const r = 4 + random() * 9;
        trotTo(huntGround.x + Math.cos(a) * r, huntGround.z + Math.sin(a) * r);
      } else {
        hunt.state = 'listen';
        hunt.timer = 2 + random() * 2.5;
      }
    }
    hunter.root.position.set(hunt.x, terrainHeight(hunt.x, hunt.z) + lift, hunt.z);
    hunter.root.rotation.y = hunt.heading;
    // Listening: the head cocks one way, then the other.
    hunter.body.rotation.set(hunt.state === 'listen' ? Math.sin(time * 1.7) * 0.12 : 0, 0, pitch);
    const pace = hunt.state === 'flee' ? 16 : 11;
    hunter.legs.forEach((leg, j) => {
      leg.rotation.z = walking
        ? Math.sin(time * pace + (j === 0 || j === 3 ? 0 : Math.PI)) * 0.42
        : hunt.state === 'leap'
          ? 0.6 * (j < 2 ? -1 : 1)
          : 0;
    });
  }

  const wolves = createWolves(scene, { onCall });
  const chickens = createChickens(scene);
  const herds = createHerds(scene);

  placeWalkers();
  placeRabbit();

  /** Ducks on the trail: traffic waits for them. */
  function crossingDucks() {
    const leader = duckGroup.animals[0].root.position;
    const step = walkCycle(time, duckGroup.wait, duckGroup.duration);
    return step.walking ? [{ x: leader.x, z: leader.z }] : [];
  }

  return {
    crossingDucks,
    /** The animals' reply when the player honks nearby. */
    hearHorn(x, z) {
      const near = p => Math.hypot(p.x - x, p.z - z);
      if (near(deerGroup.animals[0].root.position) < 35) deerGroup.startle = 1;
      if (near(duckGroup.animals[0].root.position) < 30) onCall('quack');
      if (near(HABITATS.sheep) < 30) {
        sheepLookUp = 2.5;
        onCall('baa');
      }
      if (near(burrow) < 30) rabbitState.progress = Math.max(rabbitState.progress, 0.75);
      if (near(herd[0]) < 35) {
        cowsLookUp = 3;
        onCall('moo');
      }
      for (const group of foxGroups) if (near(group.animals[0].root.position) < 30) group.startle = 1;
      wolves.hearHorn(x, z);
      if (chickens.hearHorn(x, z)) onCall('cluck');
      if (near(leadGoose) < 90) onCall('honk');
      for (const call of new Set(herds.hearHorn(x, z))) onCall(call);
    },
    getState: () => ({
      time,
      rabbitHidden: rabbitState.progress >= 1,
      deer: deerGroup.animals[0].root.position.clone(),
      geese: leadGoose.clone(),
      wolves: wolves.getState(),
      herds: herds.getState(),
    }),
    update(dt, player, running, night = 0) {
      if (!running) return;
      time += dt;
      sheepLookUp = Math.max(0, sheepLookUp - dt);
      for (const group of walkers) group.startle = Math.max(0, group.startle - dt * 0.9);

      sheepFlock.forEach((animal, i) => {
        const grazing = sheepLookUp > 0 ? 0.25 : -0.3 + Math.sin(time * 1.2 + i) * 0.22;
        animal.legs[0].rotation.z += (grazing - animal.legs[0].rotation.z) * Math.min(1, dt * 6);
        animal.root.position.y = terrainHeight(animal.home.x, animal.home.z) + Math.sin(time * 1.5 + i) * 0.025;
      });

      const distance = Math.hypot(player.x - burrow.x, player.z - burrow.z);
      if (distance < 25) {
        rabbitState.returning = false;
        rabbitState.wait = 0;
        rabbitState.progress = Math.min(1, rabbitState.progress + dt * 0.25);
      } else if (rabbitState.progress > 0) {
        rabbitState.wait += dt;
        if (distance > 32 && rabbitState.wait > 8) rabbitState.returning = true;
        if (rabbitState.returning) rabbitState.progress = Math.max(0, rabbitState.progress - dt * 0.25);
      }
      placeRabbit();
      placeWalkers();
      updateHerd(dt);
      updateGeese();
      updateEagle();
      updateFish(dt, player);
      updateHunter(dt, player);
      wolves.update(dt, player, night);
      chickens.update(dt, player);
      herds.update(dt, player);

      const close = (p, range) => Math.hypot(player.x - p.x, player.z - p.z) < range;
      for (const group of foxGroups) group.animals[0].root.visible = close(group.animals[0].root.position, 230);
    },
  };
}
