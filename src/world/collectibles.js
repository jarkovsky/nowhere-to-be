// Garden gnomes hidden around the valley. Purely optional: they turn to watch
// you drive past, and hop away when you get close.
import * as THREE from 'three';
import { GNOMES } from './layout.js';
import { terrainHeight } from './terrain.js';
import { PartsBuilder } from './build.js';
import { gnomeParts } from '../vehicles/car.js';

const REACH = 3.8;

export function createGnomes(scene, { found = [], onFound = () => {} } = {}) {
  const geometry = gnomeParts(new PartsBuilder(), { scale: 1.05 }).geometry();
  const gnomes = GNOMES.map((spot, index) => {
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true }),
    );
    const ground = terrainHeight(spot.x, spot.z);
    mesh.position.set(spot.x, ground, spot.z);
    mesh.rotation.y = index * 1.9;
    mesh.castShadow = true;
    mesh.visible = !found.includes(index);
    scene.add(mesh);
    return { mesh, ground, index, collected: found.includes(index), leaving: 0 };
  });

  return {
    count: GNOMES.length,
    update(dt, player, running) {
      if (!running) return;
      for (const gnome of gnomes) {
        if (gnome.leaving > 0) {
          // A little hop and spin, then gone.
          gnome.leaving = Math.max(0, gnome.leaving - dt);
          const t = 1 - gnome.leaving / 0.7;
          gnome.mesh.position.y = gnome.ground + Math.sin(t * Math.PI) * 2.2;
          gnome.mesh.rotation.y += dt * 14;
          gnome.mesh.material.opacity = 1 - t * t;
          if (gnome.leaving === 0) gnome.mesh.visible = false;
          continue;
        }
        if (gnome.collected) continue;
        const dx = player.x - gnome.mesh.position.x;
        const dz = player.z - gnome.mesh.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 30) {
          const facing = Math.atan2(-dx, -dz); // gnomes face -Z
          gnome.mesh.rotation.y +=
            Math.atan2(Math.sin(facing - gnome.mesh.rotation.y), Math.cos(facing - gnome.mesh.rotation.y)) *
            Math.min(1, dt * 3);
        }
        if (distance < REACH) {
          gnome.collected = true;
          gnome.leaving = 0.7;
          onFound(gnome.index);
        }
      }
    },
    getState: () => gnomes.map(g => ({ x: g.mesh.position.x, z: g.mesh.position.z, collected: g.collected })),
  };
}
