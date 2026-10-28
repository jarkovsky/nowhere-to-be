// A small pack of wolves that roams the snowy slopes below the summit. They keep
// their distance: when a car comes close they stop and watch it, then move on.
// After dark, or when you sound the horn nearby, they sit back and howl.
import * as THREE from 'three';
import { angleDelta, createRandom } from '../core/math.js';
import { WOLF_ROUTE } from './layout.js';
import { terrainHeight } from './terrain.js';
import { PartsBuilder, limb } from './build.js';
import { cone, eyes, furMaterial, leg, lump, pair, tube } from './creatures.js';

const FUR = '#7d7f7a';
const PALE = '#d9d6cc';
const DARK = '#2f332f';
const GREY = '#6c6e69';
const TROT = 2.2;
const SPACING = 3.4;
const HOWL = 3.4;

/** A grey wolf facing +X, a little larger than the fox and longer in the leg. */
export function wolf(scale) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const p = new PartsBuilder();
  lump(p, FUR, [0, 1.02, 0], [0.72, 0.29, 0.27]);
  lump(p, PALE, [0.5, 0.95, 0], [0.32, 0.3, 0.27]); // chest
  lump(p, GREY, [0.42, 1.26, 0], [0.34, 0.24, 0.3]); // ruff
  tube(p, FUR, [-0.66, 1.1, 0], [-1.02, 0.74, 0], 0.11, 0.13); // tail, hanging low
  tube(p, FUR, [-1.02, 0.74, 0], [-1.2, 0.5, 0], 0.13, 0.08);
  lump(p, DARK, [-1.22, 0.48, 0], [0.08, 0.1, 0.08]);
  body.add(p.mesh({ material: furMaterial, receiveShadow: false }));
  const head = limb(
    body,
    0.78,
    1.32,
    0,
    q => {
      lump(q, FUR, [0.12, 0.06, 0], [0.24, 0.21, 0.21]);
      tube(q, PALE, [0.24, 0, 0], [0.6, -0.04, 0], 0.12, 0.08); // muzzle
      lump(q, DARK, [0.61, -0.03, 0], 0.05); // nose
      eyes(q, 0.3, 0.14, 0.12, 0.035, '#b8913f');
      return pair(q, side => cone(q, FUR, [0.04, 0.22, side * 0.1], [0, 0.46, side * 0.14], 0.08, 0.5)); // ears
    },
    furMaterial,
  );
  const legs = [];
  for (const x of [-0.5, 0.48]) {
    for (const z of [-0.17, 0.17]) {
      legs.push(
        limb(body, x, 0.78, z, q => leg(q, GREY, { length: 0.78, top: 0.08, bottom: 0.045, foot: DARK }), furMaterial),
      );
    }
  }
  root.scale.setScalar(scale);
  root.traverse(child => {
    if (child.isMesh) child.castShadow = true;
  });
  return { root, body, head, legs };
}

export function createWolves(scene, { onCall = () => {} } = {}) {
  const random = createRandom(5150);
  const pack = [wolf(1.05), wolf(0.92), wolf(0.85)];
  for (const member of pack) scene.add(member.root);
  let s = 0; // how far the leader has trotted round the loop
  let watching = 0; // seconds left standing to watch a car
  let howling = 0;
  let nextHowl = 12;
  let time = 0;
  const leader = new THREE.Vector3();

  function howl() {
    if (howling > 0) return;
    howling = HOWL;
    onCall('howl');
  }

  return {
    getState: () => ({ x: leader.x, z: leader.z, s, watching: watching > 0, howling: howling > 0 }),
    hearHorn(x, z) {
      if (Math.hypot(x - leader.x, z - leader.z) < 70) howl();
    },
    update(dt, player, night) {
      time += dt;
      const front = WOLF_ROUTE.at(s);
      leader.set(front.x, 0, front.z);
      const distance = Math.hypot(player.x - leader.x, player.z - leader.z);
      const visible = distance < 260;
      for (const member of pack) member.root.visible = visible;
      if (howling > 0) howling = Math.max(0, howling - dt);
      if (distance < 30) watching = 3;
      else watching = Math.max(0, watching - dt);
      // After dark they howl now and then, if anyone is near enough to hear.
      if (night > 0.6 && distance < 150 && (nextHowl -= dt) <= 0) {
        howl();
        nextHowl = 22 + random() * 18;
      }
      const moving = watching === 0 && howling === 0;
      if (moving) s = WOLF_ROUTE.wrap(s + TROT * dt);
      if (!visible) return;

      pack.forEach((member, i) => {
        const p = WOLF_ROUTE.offset(s - i * SPACING, (i % 2 ? 1 : -1) * 0.8 * Math.min(1, i));
        const facing = Math.atan2(-p.dz, p.dx);
        member.root.position.set(
          p.x,
          terrainHeight(p.x, p.z) + (moving ? Math.abs(Math.sin(time * 9 + i)) * 0.05 : 0),
          p.z,
        );
        member.root.rotation.y = facing;
        member.legs.forEach((leg, j) => {
          leg.rotation.z = moving ? Math.sin(time * 9 + i + (j === 0 || j === 3 ? 0 : Math.PI)) * 0.45 : 0;
        });
        // Sitting back to howl, or turning to watch the car.
        const sit = howling > 0 ? Math.min(1, (HOWL - howling) * 3, howling * 2) : 0;
        member.body.rotation.z = sit * 0.42;
        member.head.rotation.z = sit * 0.75;
        const look = watching > 0 ? angleDelta(facing, Math.atan2(-(player.z - p.z), player.x - p.x)) : 0;
        member.head.rotation.y += (Math.max(-1.1, Math.min(1.1, look)) - member.head.rotation.y) * Math.min(1, dt * 4);
      });
    },
  };
}
