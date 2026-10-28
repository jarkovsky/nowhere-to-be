// Hens and a rooster pecking about each farmyard. They wander, stop to peck, and
// scatter with a flap when a car drives into the yard. Each yard has one instanced
// mesh for its hens and one for its rooster.
import * as THREE from 'three';
import { createRandom } from '../core/math.js';
import { YARDS } from './layout.js';
import { terrainHeight } from './terrain.js';
import { PartsBuilder, localFrame } from './build.js';
import { cone, eyes, furMaterial, lump, pair, tube } from './creatures.js';

const SCARE = 9;
const BEAK = '#e0a942';
const COMB = '#c8302a';

/** A chicken facing +X. `feathers` colours the body; the rooster has a tall tail and a bigger comb. */
export function chickenGeometry(feathers, rooster) {
  const s = rooster ? 1.2 : 1;
  const p = new PartsBuilder();
  lump(p, feathers, [0, 0.42 * s, 0], [0.3 * s, 0.25 * s, 0.22 * s], { tilt: 0.15 });
  tube(p, feathers, [0.16 * s, 0.5 * s, 0], [0.26 * s, 0.66 * s, 0], 0.1 * s, 0.07 * s); // neck
  lump(p, feathers, [0.27 * s, 0.7 * s, 0], [0.09 * s, 0.085 * s, 0.075 * s]); // head
  cone(p, BEAK, [0.33 * s, 0.69 * s, 0], [0.43 * s, 0.68 * s, 0], 0.03 * s); // beak
  lump(p, COMB, [0.32 * s, 0.62 * s, 0], [0.025, 0.04, 0.02]); // wattle
  lump(p, COMB, [0.26 * s, 0.79 * s, 0], [0.07 * s, (rooster ? 0.06 : 0.035) * s, 0.02]); // comb
  eyes(p, 0.31 * s, 0.72 * s, 0.06 * s, 0.015);
  if (rooster) {
    // Tail feathers arching up and back.
    cone(p, '#2f5546', [-0.24, 0.55, 0], [-0.5, 0.95, 0], 0.1, 0.4);
    cone(p, '#3e3a6b', [-0.26, 0.5, 0], [-0.58, 0.72, 0], 0.09, 0.4);
  } else {
    cone(p, feathers, [-0.22, 0.48, 0], [-0.38, 0.66, 0], 0.1, 0.5);
  }
  pair(p, side => tube(p, BEAK, [0, 0.24 * s, side * 0.08], [0, 0, side * 0.08], 0.022));
  return p.geometry();
}

export function createChickens(scene) {
  const random = createRandom(2718);
  const henGeometry = chickenGeometry('#ffffff', false);
  const roosterGeometry = chickenGeometry('#b5653a', true);
  const tint = new THREE.Color();
  let henCount = 0;
  /** Each yard's birds and its own meshes, so a yard out of view or far away is left out. */
  const flocks = [];
  for (const yard of YARDS) {
    const toWorld = localFrame(yard.x, yard.z, yard.rotation);
    const spot = () => toWorld(yard.x0 + random() * (yard.x1 - yard.x0), yard.z0 + random() * (yard.z1 - yard.z0));
    const birds = [];
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
    const henMesh = new THREE.InstancedMesh(henGeometry, furMaterial, yard.hens);
    const roosterMesh = new THREE.InstancedMesh(roosterGeometry, furMaterial, 1);
    // Some hens are white and some are brown, taking turns across all the yards.
    for (let i = 0; i < yard.hens; i++) {
      henMesh.setColorAt(i, henCount++ % 3 ? tint.set('#f4efe4') : tint.set('#d79a62'));
    }
    for (const mesh of [henMesh, roosterMesh]) {
      mesh.castShadow = true;
      scene.add(mesh);
    }
    flocks.push({ birds, henMesh, roosterMesh });
  }
  const birds = flocks.flatMap(flock => flock.birds);
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  let time = 0;

  /** Moves one yard's birds and puts them in its meshes. */
  function updateFlock({ birds, henMesh, roosterMesh }, dt, player) {
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
    for (const mesh of [henMesh, roosterMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      // Round where the birds are now, so the yard is left out of the drawing while it is out of view.
      mesh.computeBoundingSphere();
    }
  }

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
      for (const flock of flocks) {
        const near = flock.birds.some(bird => Math.hypot(player.x - bird.x, player.z - bird.z) < 200);
        flock.henMesh.visible = flock.roosterMesh.visible = near;
        if (near) updateFlock(flock, dt, player);
      }
    },
  };
}
