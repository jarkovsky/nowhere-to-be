// Animals that live in the valley: deer on their meadow walk, a family of
// ducks crossing the trail, grazing sheep and a shy rabbit.
import * as THREE from 'three';
import { smoothstep } from '../core/math.js';
import { HABITATS } from './layout.js';
import { terrainHeight } from './terrain.js';
import { PartsBuilder } from './build.js';

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

/** Where a walking group is in its back-and-forth cycle. */
function walkCycle(time, wait, duration) {
  const cycle = 2 * (wait + duration);
  const phase = ((time % cycle) + cycle) % cycle;
  if (phase < wait) return { progress: 0, walking: false, returning: false };
  if (phase < wait + duration) return { progress: (phase - wait) / duration, walking: true, returning: false };
  if (phase < 2 * wait + duration) return { progress: 1, walking: false, returning: true };
  return { progress: 1 - (phase - 2 * wait - duration) / duration, walking: true, returning: true };
}

export function createWildlife(scene, { onSpotted = () => {}, onCall = () => {} } = {}) {
  const deerGroup = { ...HABITATS.deer, animals: [deer(), deer()], kind: 'deer', startle: 0 };
  deerGroup.animals[1].root.scale.setScalar(0.78);
  const duckGroup = {
    ...HABITATS.ducks,
    animals: [duck(1), duck(0.55), duck(0.55), duck(0.55)],
    kind: 'ducks',
    startle: 0,
  };
  const walkers = [deerGroup, duckGroup];
  const flock = Array.from({ length: HABITATS.sheep.count }, (_, i) => {
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
  const bunny = rabbit();
  const burrow = HABITATS.burrow;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1.05, 18), new THREE.MeshLambertMaterial({ color: '#3e3b30' }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(burrow.x, terrainHeight(burrow.x, burrow.z) + 0.08, burrow.z);
  scene.add(hole);
  for (const animal of [...deerGroup.animals, ...duckGroup.animals, ...flock, bunny]) {
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
        animal.root.position.set(
          x,
          terrainHeight(x, z) + (step.walking ? Math.abs(Math.sin(time * 5 - i)) * 0.065 : 0) + hop,
          z,
        );
        animal.root.rotation.y = Math.atan2(-dz, dx) + (step.returning ? Math.PI : 0);
        if (group.kind === 'deer') {
          animal.legs.forEach(
            (leg, j) =>
              (leg.rotation.z = step.walking ? Math.sin(time * 7 + (j === 0 || j === 3 ? 0 : Math.PI)) * 0.42 : 0),
          );
          animal.body.rotation.z = step.walking || group.startle > 0 ? 0 : -0.1 + Math.sin(time * 0.8 + i) * 0.04;
        } else {
          animal.body.rotation.z = Math.sin(time * (step.walking ? 7 : 1) + i) * (step.walking ? 0.1 : 0.025);
          animal.legs.forEach(
            (leg, j) => (leg.rotation.z = step.walking ? Math.sin(time * 12 + j * Math.PI) * 0.4 : 0),
          );
        }
      });
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
    },
    getState: () => ({
      time,
      rabbitHidden: rabbitState.progress >= 1,
      deer: deerGroup.animals[0].root.position.clone(),
    }),
    update(dt, player, running) {
      if (!running) return;
      time += dt;
      sheepLookUp = Math.max(0, sheepLookUp - dt);
      for (const group of walkers) group.startle = Math.max(0, group.startle - dt * 0.9);

      flock.forEach((animal, i) => {
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

      const close = (p, range) => Math.hypot(player.x - p.x, player.z - p.z) < range;
      if (close(deerGroup.animals[0].root.position, 30)) onSpotted('deer');
      if (close(duckGroup.animals[0].root.position, 30)) onSpotted('ducks');
      if (close(HABITATS.sheep, 26)) onSpotted('sheep');
      if (distance < 25 && rabbitState.progress < 0.95) onSpotted('rabbit');
    },
  };
}
