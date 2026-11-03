// Orcas in the Lofoten bay: now and then a small pod rises, rolls along the surface for a few
// seconds, showing its back and tall fin, and slips under again, with a ring of foam where it
// breaks the water. Silent. They keep to the bay, away from the quay, and surface where the
// player can see them when the player is near.
import * as THREE from 'three';
import { createRandom } from '../core/math.js';
import { FJORD, LOFOTEN, LOFOTEN_QUAY } from './layout.js';
import { ANIMAL_BEVEL, PartsBuilder } from './build.js';

const BLACK = '#1f2227';
const WHITE = '#f3f2ec';
/** How long one surfacing lasts, in seconds, and how far along the water it goes. */
const ROLL = 5;
const SPEED = 3.2;
/** The pod doesn't surface unless the player is within this far of the bay's middle. */
const AWAKE = 520;

/** An orca on its own, blocky and bevelled like the other animals, nose to +X, with its back at y = 0.55 above its middle. */
function orcaModel() {
  const parts = new PartsBuilder({ bevel: ANIMAL_BEVEL })
    .box(3.4, 1.15, 1.1, BLACK)
    .box(1.3, 0.95, 0.95, BLACK, { x: 2.1, y: -0.08 })
    .box(1.8, 0.62, 0.52, BLACK, { x: -2.5, y: 0.04 })
    .box(0.5, 0.12, 1.9, BLACK, { x: -3.55, y: 0.05 })
    .box(2.3, 0.06, 0.78, WHITE, { x: 0.3, y: -0.55 })
    .box(0.22, 1.1, 0.7, BLACK, { x: -0.2, y: 0.95, rz: 0.22 });
  for (const side of [-1, 1]) {
    parts.box(0.55, 0.2, 0.05, WHITE, { x: 2.05, y: 0.16, z: side * 0.49 });
    parts.box(1, 0.1, 0.5, BLACK, { x: 1.3, y: -0.5, z: side * 0.75, rx: side * 0.4 });
  }
  return parts.mesh({ castShadow: false, receiveShadow: false });
}

export function createOrcas(scene) {
  const random = createRandom(4431);
  const pod = [1, 0.58, 0.8].map((size, i) => {
    const root = new THREE.Group();
    root.add(orcaModel());
    root.scale.setScalar(size);
    root.visible = false;
    scene.add(root);
    return { root, size, delay: i * 0.45 };
  });
  const rings = pod.map(() => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.9, 16),
      new THREE.MeshBasicMaterial({ color: '#eef8f4', transparent: true, opacity: 0, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);
    return ring;
  });
  // Where this surfacing starts and which way it goes, and when it started: not yet.
  const roll = { x: 0, z: 0, heading: 0, start: -100, next: 6 };
  let time = 0;

  /** A spot on the bay's water, in the bay's open middle, nearest the player of a few tried. */
  function choose(player) {
    const bay = FJORD.bay;
    let best = null;
    let nearest = Infinity;
    for (let tries = 0; tries < 14; tries++) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * (bay.radius - 50);
      const [x, z] = [bay.x + Math.cos(a) * r, bay.z + Math.sin(a) * r];
      // Not near the quay, nor the lane the ferry comes in by.
      if (Math.hypot(x - LOFOTEN_QUAY.dock.x, z - LOFOTEN_QUAY.dock.z) < 50) continue;
      const distance = Math.hypot(x - player.x, z - player.z);
      if (distance > 28 && distance < nearest) [best, nearest] = [{ x, z }, distance];
    }
    return best ?? { x: bay.x, z: bay.z };
  }

  return {
    getState: () => ({ rolling: time - roll.start < ROLL + 1, x: roll.x, z: roll.z }),
    update(dt, player) {
      time += dt;
      const awake = Math.hypot(player.x - LOFOTEN.bay.x, player.z - LOFOTEN.bay.z) < AWAKE;
      roll.next -= dt;
      if (awake && roll.next <= 0) {
        Object.assign(roll, choose(player), { heading: random() * Math.PI * 2, start: time, next: 16 + random() * 14 });
      }
      pod.forEach(({ root, size, delay }, i) => {
        const t = (time - roll.start - delay) / ROLL;
        root.visible = t >= 0 && t <= 1;
        rings[i].visible = false;
        if (!root.visible) return;
        // Along the surface, rising to roll over at the middle and going under again.
        const along = (t - 0.5) * ROLL * SPEED;
        const side = (i === 0 ? 0 : i === 1 ? 3.2 : -4.5) + (i === 0 ? 0 : (i - 1.5) * 0.5);
        const [fx, fz] = [Math.cos(roll.heading), -Math.sin(roll.heading)];
        const x = roll.x + fx * along - fz * side;
        const z = roll.z + fz * along + fx * side;
        const lift = Math.sin(t * Math.PI);
        root.position.set(x, FJORD.level - 0.9 * size + lift * 1.55 * size, z);
        root.rotation.set(0, roll.heading, -Math.cos(t * Math.PI) * 0.32, 'YXZ');
        // A ring of foam where it comes up and where it goes down.
        const ring = rings[i];
        const foam = Math.min(t, 1 - t) < 0.12 ? 1 - Math.min(t, 1 - t) / 0.12 : 0;
        ring.visible = foam > 0;
        ring.position.set(x, FJORD.level + 0.04, z);
        ring.scale.setScalar(size * (1 + (1 - foam) * 2));
        ring.material.opacity = 0.7 * foam;
      });
    },
  };
}
