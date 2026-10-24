// A striped windsock on a pole, swinging round and drooping as the wind comes and goes.
import * as THREE from 'three';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';

/** Adds the pole to `parts` and the sock to the scene. Returns its per-frame update. */
export function buildWindsock(scene, parts, obstacles, { x, z }) {
  const y = terrainHeight(x, z);
  const top = 4.8;
  parts.add(new THREE.CylinderGeometry(0.06, 0.09, top, 6), '#d9d6cc', { x, y: y + top / 2, z });
  parts.add(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), '#5d5f5a', { x, y: y + top, z });
  // The sock hangs from a ring held out in front of the swivel on four struts, so however
  // it droops it never touches the pole.
  const swivel = new THREE.Group();
  swivel.position.set(x, y + top, z);
  const sock = new PartsBuilder();
  const mouth = 0.42;
  const out = 0.7;
  sock.add(new THREE.TorusGeometry(mouth, 0.025, 4, 12), '#5d5f5a', { z: out });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    sock.beam({ x: 0, y: 0, z: 0 }, { x: Math.cos(a) * mouth, y: Math.sin(a) * mouth, z: out }, 0.03, '#5d5f5a');
  }
  for (let i = 0; i < 4; i++) {
    const r0 = mouth - i * 0.07;
    sock.add(new THREE.CylinderGeometry(r0 - 0.07, r0, 0.5, 10, 1, true), i % 2 ? '#f4f2ea' : '#e2672f', {
      z: out + 0.25 + i * 0.5,
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
