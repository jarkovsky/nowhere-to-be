// A windmill on the flat-topped hill to the west. Its sails turn slowly all day.
import * as THREE from 'three';
import { WINDMILL } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';

// The sails face the middle of the valley.
const FACING = Math.atan2(-WINDMILL.x, -WINDMILL.z);

export function buildWindmill(scene, obstacles) {
  const { x, z } = WINDMILL;
  const y = terrainHeight(x, z);
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.rotation.y = FACING;
  scene.add(root);

  const body = new PartsBuilder();
  body.add(new THREE.CylinderGeometry(2.3, 3.4, 9.5, 8), '#ece4d0', { y: 4.6 });
  body.add(new THREE.CylinderGeometry(3.6, 3.6, 0.5, 8), '#9a978a', { y: 0.1 });
  body.add(new THREE.CylinderGeometry(2.55, 2.55, 0.35, 8), '#7c5a44', { y: 9.4 });
  body.add(new THREE.ConeGeometry(2.6, 2.8, 8), '#7c5a44', { y: 10.9 });
  body.box(1.2, 2.1, 0.3, '#5b6f62', { y: 1.05, z: 3.3 }); // door
  for (const [ly, lz] of [
    [4.2, 2.95],
    [7, 2.55],
  ]) {
    body.box(0.8, 0.9, 0.2, '#e8cf8a', { y: ly, z: lz }); // windows
  }
  body.add(new THREE.CylinderGeometry(0.35, 0.35, 1.4, 8), '#5d4a39', { y: 9.8, z: 2.6, rx: Math.PI / 2 }); // axle
  root.add(body.mesh());

  // Four lattice sails on a hub.
  const hub = new THREE.Group();
  hub.position.set(0, 9.8, 3.35);
  root.add(hub);
  const sails = new PartsBuilder();
  sails.add(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8), '#5d4a39', { rx: Math.PI / 2 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const rotate = (r, side) => ({ x: Math.cos(a) * r - Math.sin(a) * side, y: Math.sin(a) * r + Math.cos(a) * side });
    const tip = rotate(7.5, 0);
    sails.beam({ x: 0, y: 0, z: 0 }, { ...tip, z: 0 }, 0.24, '#6a5340');
    // Canvas panel beside the spar, framed by thin slats.
    const panel = rotate(4.6, 0.75);
    sails.box(5.6, 1.3, 0.06, '#f1ead8', { ...panel, z: 0.05, rz: a });
    for (let k = 0; k <= 4; k++) {
      const slat = rotate(1.8 + k * 1.4, 0.75);
      sails.box(0.06, 1.4, 0.1, '#6a5340', { ...slat, z: 0.1, rz: a });
    }
  }
  const sailMesh = sails.mesh();
  hub.add(sailMesh);

  obstacles.push({ x, z, radius: 3.8 });
  return {
    update(dt) {
      sailMesh.rotation.z -= dt * 0.35;
    },
  };
}
