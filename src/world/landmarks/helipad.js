// A helipad on the flat-topped hill behind the windmill: a concrete pad with a
// yellow ring and a white H, lights round the edge and a windsock.
import * as THREE from 'three';
import { HELIPAD } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame } from '../build.js';
import { buildWindsock } from './windsock.js';

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

  // The windsock, beside the pad.
  const windsock = buildWindsock(scene, parts, obstacles, local(PAD_RADIUS + 3, -2));
  scene.add(parts.mesh());

  return {
    update(time, night) {
      windsock(time);
      lights.emissiveIntensity = 0.2 + night * 1.2;
    },
  };
}
