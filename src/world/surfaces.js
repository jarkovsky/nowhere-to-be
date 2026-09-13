// Puddles and creek splashes, crunchy leaves, and tyre tracks in the snow.
import * as THREE from 'three';
import { createRandom } from '../core/math.js';
import { SURFACES, surfaceAt } from './layout.js';
import { terrainHeight, waterDepth } from './terrain.js';

const TRACK_CAPACITY = 6000;

/** Which effect the tyres make at a point. */
function effectAt(x, z) {
  if (waterDepth(x, z) > 0.12) return 'water';
  return surfaceAt(x, z);
}

export function createSurfaces(scene, sound) {
  const random = createRandom(441);
  const dummy = new THREE.Object3D();

  // Shallow puddles on the trail.
  const puddleMaterial = new THREE.MeshLambertMaterial({
    color: '#8dbbbe',
    emissive: '#2d5a5f',
    emissiveIntensity: 0.3,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  for (const patch of SURFACES.filter(p => p.id === 'puddle')) {
    for (let i = 0; i < 4; i++) {
      const x = patch.x + (random() - 0.5) * patch.rx * 1.2;
      const z = patch.z + (random() - 0.5) * patch.rz * 1.2;
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.2 + random() * 1.4, 9), puddleMaterial);
      puddle.rotation.set(-Math.PI / 2, 0, random() * 3);
      puddle.scale.set(1.5, 1, 1);
      puddle.position.set(x, terrainHeight(x, z) + 0.1, z);
      scene.add(puddle);
    }
  }

  // Fallen leaves scattered across the autumn grove, under copper-coloured trees.
  const grove = SURFACES.find(p => p.id === 'leaves');
  const leaves = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.3, 5),
    new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
    380,
  );
  const leafColor = new THREE.Color();
  for (let i = 0; i < leaves.count; i++) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * 0.95;
    const x = grove.x + Math.cos(angle) * r * grove.rx;
    const z = grove.z + Math.sin(angle) * r * grove.rz;
    dummy.position.set(x, terrainHeight(x, z) + 0.12, z);
    dummy.rotation.set(-Math.PI / 2, 0, random() * 6);
    dummy.scale.set(1, 0.5 + random(), 1);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    leaves.setColorAt(i, leafColor.set(['#cd8c3c', '#a64d32', '#e2b85b'][i % 3]));
  }
  scene.add(leaves);
  const crowns = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.3;
    const x = grove.x + Math.cos(angle) * (grove.rx + 3);
    const z = grove.z + Math.sin(angle) * (grove.rz + 3);
    const y = terrainHeight(x, z);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 5, 6),
      new THREE.MeshLambertMaterial({ color: '#7e6a50', flatShading: true }),
    );
    trunk.position.set(x, y + 2.3, z);
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.6 + random(), 1),
      new THREE.MeshLambertMaterial({ color: ['#bb773d', '#c99a50', '#a66135'][i % 3], flatShading: true }),
    );
    crown.position.set(x, y + 6, z);
    crown.castShadow = trunk.castShadow = true;
    crowns.add(trunk, crown);
  }
  scene.add(crowns);

  const tracks = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.39, 0.68),
    new THREE.MeshLambertMaterial({ color: '#b3c3c4', polygonOffset: true, polygonOffsetFactor: -4 }),
    TRACK_CAPACITY,
  );
  tracks.count = 0;
  tracks.frustumCulled = false;
  scene.add(tracks);

  const particleGeometry = new THREE.IcosahedronGeometry(0.13, 0);
  const particleMaterials = {
    water: new THREE.MeshBasicMaterial({ color: '#d4f2f2' }),
    puddle: new THREE.MeshBasicMaterial({ color: '#c6eff3' }),
    leaves: new THREE.MeshLambertMaterial({ color: '#e0a449' }),
    snow: new THREE.MeshBasicMaterial({ color: '#faffff' }),
  };
  const particles = Array.from({ length: 72 }, () => {
    const mesh = new THREE.Mesh(particleGeometry, particleMaterials.water);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, life: 0, vx: 0, vy: 0, vz: 0 };
  });

  let cursor = 0;
  let trackCursor = 0;
  let lastTrack = null;
  let lastParticle = 0;
  let lastSound = 0;
  let time = 0;
  let current = 'grass';

  return {
    getState: () => ({ surface: current, tracks: tracks.count, particles: particles.filter(p => p.life > 0).length }),
    update(dt, car, running) {
      if (!running) return;
      time += dt;
      current = effectAt(car.x, car.z);
      const sin = Math.sin(car.heading);
      const cos = Math.cos(car.heading);
      const moving = Math.abs(car.speed) > 0.6;

      if (moving && current !== 'grass') {
        if (time - lastSound > 0.22) {
          sound.surface(current);
          lastSound = time;
        }
        const rate = current === 'water' ? 0.03 : 0.045;
        if (time - lastParticle > rate) {
          lastParticle = time;
          for (const side of [-1, 1]) {
            const p = particles[cursor++ % particles.length];
            const x = car.x + cos * side * 1.15 + sin * 1.2;
            const z = car.z - sin * side * 1.15 + cos * 1.2;
            p.mesh.material = particleMaterials[current];
            p.mesh.position.set(x, terrainHeight(x, z) + (current === 'water' ? 0.6 : 0.4), z);
            p.mesh.visible = true;
            p.life = 0.65;
            const spread = current === 'water' ? 3 : 2;
            p.vx = cos * side * spread + (random() - 0.5);
            p.vz = -sin * side * spread + (random() - 0.5);
            p.vy = 2 + random() * (current === 'water' ? 3 : 2);
          }
        }
        if (current === 'snow' && (!lastTrack || Math.hypot(car.x - lastTrack.x, car.z - lastTrack.z) > 0.48)) {
          for (const side of [-1, 1]) {
            const x = car.x + cos * side * 1.08;
            const z = car.z - sin * side * 1.08;
            if (surfaceAt(x, z) !== 'snow') continue;
            dummy.position.set(x, terrainHeight(x, z) + 0.05, z);
            dummy.rotation.set(-Math.PI / 2, 0, car.heading);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            tracks.setMatrixAt(trackCursor++ % TRACK_CAPACITY, dummy.matrix);
            tracks.count = Math.min(trackCursor, TRACK_CAPACITY);
          }
          tracks.instanceMatrix.needsUpdate = true;
          lastTrack = { x: car.x, z: car.z };
        }
      }

      for (const p of particles) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.vy -= 9 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += dt * 4;
        p.mesh.visible = p.life > 0 && p.mesh.position.y > terrainHeight(p.mesh.position.x, p.mesh.position.z) - 0.3;
      }
    },
  };
}
