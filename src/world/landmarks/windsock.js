// A striped windsock on a pole, swinging round and drooping as the wind comes and goes.
import * as THREE from 'three';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';

/** Adds the pole to `parts` and the sock to the scene. Returns its per-frame update. */
export function buildWindsock(scene, parts, obstacles, { x, z }) {
  const y = terrainHeight(x, z);
  parts.add(new THREE.CylinderGeometry(0.06, 0.09, 5, 6), '#d9d6cc', { x, y: y + 2.5, z });
  const swivel = new THREE.Group();
  swivel.position.set(x, y + 4.8, z);
  const sock = new PartsBuilder();
  for (let i = 0; i < 4; i++) {
    const r0 = 0.42 - i * 0.07;
    sock.add(new THREE.CylinderGeometry(r0 - 0.07, r0, 0.5, 10, 1, true), i % 2 ? '#f4f2ea' : '#e2672f', {
      z: 0.25 + i * 0.5,
      rx: Math.PI / 2,
    });
  }
  swivel.add(
    sock.mesh({
      material: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }),
    }),
  );
  scene.add(swivel);
  obstacles.push({ x, z, radius: 0.3 });
  return time => {
    const gust = 0.6 + 0.4 * Math.sin(time * 0.3) * Math.sin(time * 0.17 + 1);
    swivel.rotation.set((1 - gust) * 0.9, 1.2 + Math.sin(time * 0.21) * 0.5, 0, 'YXZ');
  };
}
