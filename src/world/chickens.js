// Hens and a rooster pecking about each farmyard. They wander, stop to peck, and
// scatter with a flap when a car drives into the yard. One instanced mesh for the
// hens and one for the roosters.
import * as THREE from 'three';
import { createRandom } from '../core/math.js';
import { YARDS } from './layout.js';
import { terrainHeight } from './terrain.js';
import { PartsBuilder, flatMaterial, localFrame } from './build.js';

const SCARE = 9;
const BEAK = '#e0a942';
const COMB = '#c8302a';

/** A chicken facing +X. `feathers` colours the body; the rooster has a tall tail and a bigger comb. */
export function chickenGeometry(feathers, rooster) {
  const s = rooster ? 1.2 : 1;
  const parts = new PartsBuilder()
    .add(new THREE.IcosahedronGeometry(0.28 * s, 0), feathers, { y: 0.42 * s, sx: 1.25, sy: 0.95, sz: 0.85 })
    .box(0.16 * s, 0.2 * s, 0.16 * s, feathers, { x: 0.25 * s, y: 0.66 * s }) // neck and head
    .box(0.08, 0.06, 0.06, BEAK, { x: 0.36 * s, y: 0.68 * s })
    .box(0.05, 0.08, 0.04, COMB, { x: 0.33 * s, y: 0.6 * s }) // wattle
    .box(0.14 * s, (rooster ? 0.13 : 0.07) * s, 0.04, COMB, { x: 0.25 * s, y: 0.8 * s });
  if (rooster) {
    parts.box(0.12, 0.42, 0.22, '#2f5546', { x: -0.36, y: 0.72, rz: -0.5 }); // tail feathers
    parts.box(0.1, 0.32, 0.18, '#3e3a6b', { x: -0.42, y: 0.66, rz: -0.9 });
  } else {
    parts.box(0.1, 0.22, 0.2, feathers, { x: -0.3, y: 0.56, rz: -0.5 });
  }
  for (const z of [-0.08, 0.08]) parts.box(0.04, 0.22 * s, 0.04, BEAK, { y: 0.11 * s, z });
  return parts.geometry();
}

export function createChickens(scene) {
  const random = createRandom(2718);
  const birds = [];
  for (const yard of YARDS) {
    const toWorld = localFrame(yard.x, yard.z, yard.rotation);
    const spot = () => toWorld(yard.x0 + random() * (yard.x1 - yard.x0), yard.z0 + random() * (yard.z1 - yard.z0));
    for (let i = 0; i <= yard.hens; i++) {
      const start = spot();
      birds.push({
        rooster: i === 0,
        x: start.x,
        z: start.z,
        heading: random() * 6.3,
        target: spot(),
        rest: random() * 4,
        spot,
        home: toWorld((yard.x0 + yard.x1) / 2, (yard.z0 + yard.z1) / 2),
        flee: 0,
        phase: random() * 10,
      });
    }
  }
  const hens = birds.filter(bird => !bird.rooster);
  const roosters = birds.filter(bird => bird.rooster);
  const material = flatMaterial('#ffffff', { vertexColors: true });
  const henMesh = new THREE.InstancedMesh(chickenGeometry('#ffffff', false), material, hens.length);
  const roosterMesh = new THREE.InstancedMesh(chickenGeometry('#b5653a', true), material, roosters.length);
  // Some hens are white and some are brown.
  const tint = new THREE.Color();
  hens.forEach((hen, i) => henMesh.setColorAt(i, i % 3 ? tint.set('#f4efe4') : tint.set('#d79a62')));
  for (const mesh of [henMesh, roosterMesh]) {
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  let time = 0;

  return {
    /** A honk sends the nearby ones running. Returns true if any heard it. */
    hearHorn(x, z) {
      let heard = false;
      for (const bird of birds) {
        if (Math.hypot(bird.x - x, bird.z - z) > 30) continue;
        bird.flee = 1.5;
        bird.target = { x: bird.x + (bird.x - x) * 0.3, z: bird.z + (bird.z - z) * 0.3 };
        heard = true;
      }
      return heard;
    },
    update(dt, player) {
      time += dt;
      const near = birds.some(bird => Math.hypot(player.x - bird.x, player.z - bird.z) < 200);
      henMesh.visible = roosterMesh.visible = near;
      if (!near) return;
      const place = { hen: 0, rooster: 0 };
      for (const bird of birds) {
        const dx = bird.x - player.x;
        const dz = bird.z - player.z;
        const distance = Math.hypot(dx, dz);
        if (distance < SCARE) {
          // Run away from the car, but not too far from home.
          bird.flee = 1.2;
          const away = 6 / Math.max(distance, 0.5);
          const toHome = Math.hypot(bird.home.x - bird.x, bird.home.z - bird.z) > 18 ? 0.5 : 0;
          bird.target = {
            x: bird.x + dx * away + (bird.home.x - bird.x) * toHome,
            z: bird.z + dz * away + (bird.home.z - bird.z) * toHome,
          };
        }
        bird.flee = Math.max(0, bird.flee - dt);
        let walking = false;
        const tx = bird.target.x - bird.x;
        const tz = bird.target.z - bird.z;
        const gap = Math.hypot(tx, tz);
        if (bird.rest > 0 && bird.flee === 0) {
          bird.rest -= dt;
        } else if (gap < 0.3) {
          bird.target = bird.spot();
          bird.rest = 2 + random() * 5;
        } else {
          const speed = bird.flee > 0 ? 3.4 : 0.8;
          const step = Math.min(gap, speed * dt);
          bird.x += (tx / gap) * step;
          bird.z += (tz / gap) * step;
          bird.heading = Math.atan2(-tz, tx);
          walking = true;
        }
        const running = bird.flee > 0 && walking;
        const hop = running
          ? Math.abs(Math.sin(time * 16 + bird.phase)) * 0.25
          : walking
            ? Math.abs(Math.sin(time * 9 + bird.phase)) * 0.04
            : 0;
        // Pecking: the body dips forward in quick bobs while standing still.
        const peck =
          !walking && Math.sin(time * 1.3 + bird.phase) > 0.2 ? Math.max(0, Math.sin(time * 11 + bird.phase)) * 0.7 : 0;
        dummy.position.set(bird.x, terrainHeight(bird.x, bird.z) + hop, bird.z);
        dummy.rotation.set(0, bird.heading, -peck + (running ? 0.25 : 0));
        dummy.updateMatrix();
        if (bird.rooster) roosterMesh.setMatrixAt(place.rooster++, dummy.matrix);
        else henMesh.setMatrixAt(place.hen++, dummy.matrix);
      }
      henMesh.instanceMatrix.needsUpdate = true;
      roosterMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
