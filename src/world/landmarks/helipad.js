// A helipad on the flat-topped hill behind the windmill: a concrete pad with a
// yellow ring and a white H, lights round the edge and a windsock.
import * as THREE from 'three';
import { HELIPAD } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame } from '../build.js';

export const PAD_RADIUS = 8.5;

export function buildHelipad(scene, obstacles) {
  const { x, z, heading } = HELIPAD;
  const y = terrainHeight(x, z);
  const local = localFrame(x, z, heading);
  const at = (lx, ly, lz, extra = {}) => ({ ...local(lx, lz), y: y + ly, ry: heading, ...extra });
  const parts = new PartsBuilder();
  parts.add(new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS + 0.3, 0.5, 28), '#c2bfb5', at(0, -0.15, 0));
  parts.add(new THREE.CylinderGeometry(6.6, 6.6, 0.52, 28), '#e3b83c', at(0, -0.15, 0));
  parts.add(new THREE.CylinderGeometry(5.9, 5.9, 0.54, 28), '#c2bfb5', at(0, -0.15, 0));
  // The H, read from the windsock side.
  for (const lx of [-1.3, 1.3]) parts.box(0.7, 0.56, 4.2, '#f4f2ea', at(lx, -0.15, 0));
  parts.box(1.9, 0.56, 0.7, '#f4f2ea', at(0, -0.15, 0));
  const lights = new THREE.MeshLambertMaterial({ color: '#d7f0dc', emissive: '#9cffb4', emissiveIntensity: 0.2 });
  const lamp = new THREE.CylinderGeometry(0.14, 0.18, 0.3, 8);
  const lamps = new THREE.InstancedMesh(lamp, lights, 10);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const p = local(Math.cos(a) * (PAD_RADIUS + 0.2), Math.sin(a) * (PAD_RADIUS + 0.2));
    dummy.position.set(p.x, terrainHeight(p.x, p.z) + 0.15, p.z);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
  }
  scene.add(lamps);

  // The windsock: a striped cone on a swivel at the top of a pole, beside the pad.
  const pole = local(PAD_RADIUS + 3, -2);
  const poleY = terrainHeight(pole.x, pole.z);
  parts.add(new THREE.CylinderGeometry(0.06, 0.09, 5, 6), '#d9d6cc', { x: pole.x, y: poleY + 2.5, z: pole.z });
  scene.add(parts.mesh());
  const swivel = new THREE.Group();
  swivel.position.set(pole.x, poleY + 4.8, pole.z);
  const sock = new PartsBuilder();
  for (let i = 0; i < 4; i++) {
    const r0 = 0.42 - i * 0.07;
    sock.add(new THREE.CylinderGeometry(r0 - 0.07, r0, 0.5, 10, 1, true), i % 2 ? '#f4f2ea' : '#e2672f', {
      z: 0.25 + i * 0.5,
      rx: Math.PI / 2,
    });
  }
  const sockMesh = sock.mesh({
    material: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }),
  });
  swivel.add(sockMesh);
  scene.add(swivel);
  obstacles.push({ x: pole.x, z: pole.z, radius: 0.3 });

  return {
    update(time, night) {
      // The wind comes and goes; the sock swings round and droops when it drops.
      const gust = 0.6 + 0.4 * Math.sin(time * 0.3) * Math.sin(time * 0.17 + 1);
      swivel.rotation.set((1 - gust) * 0.9, 1.2 + Math.sin(time * 0.21) * 0.5, 0, 'YXZ');
      lights.emissiveIntensity = 0.2 + night * 1.2;
    },
  };
}
