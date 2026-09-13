// Small surprises: a shy yeti in the snowfield and a hot-air balloon drifting
// over the valley.
import * as THREE from 'three';
import { damp } from '../core/math.js';
import { YETI } from './layout.js';
import { terrainHeight } from './terrain.js';
import { PartsBuilder } from './build.js';

function createYeti() {
  const fur = '#eef1f2';
  const face = '#8ea2ad';
  const root = new THREE.Group();
  const body = new PartsBuilder()
    .add(new THREE.IcosahedronGeometry(1.25, 1), fur, { y: 1.5, sx: 1, sy: 1.25, sz: 0.85 })
    .add(new THREE.IcosahedronGeometry(0.75, 1), fur, { y: 3.05 })
    .box(0.8, 0.55, 0.3, face, { y: 3, z: -0.55 })
    .box(0.12, 0.12, 0.05, '#2d3a40', { x: -0.2, y: 3.1, z: -0.72 })
    .box(0.12, 0.12, 0.05, '#2d3a40', { x: 0.2, y: 3.1, z: -0.72 })
    .box(0.3, 0.07, 0.05, '#2d3a40', { y: 2.88, z: -0.72 });
  for (const x of [-0.55, 0.55]) body.add(new THREE.IcosahedronGeometry(0.42, 0), fur, { x, y: 0.35, z: -0.1 });
  root.add(body.mesh());
  const arms = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.1, 2.3, 0);
    pivot.add(new PartsBuilder().add(new THREE.IcosahedronGeometry(0.4, 0), fur, { y: -0.7, sy: 2 }).mesh());
    root.add(pivot);
    return pivot;
  });
  return { root, arms };
}

function createBalloon() {
  const root = new THREE.Group();
  const envelope = new THREE.SphereGeometry(7, 12, 10).toNonIndexed();
  const colors = [];
  const stripes = ['#d8643f', '#f0d27a', '#5c9a96', '#f3ece0'].map(c => new THREE.Color(c));
  const position = envelope.attributes.position;
  for (let i = 0; i < position.count; i += 3) {
    const angle = Math.atan2(
      position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2),
      position.getX(i) + position.getX(i + 1) + position.getX(i + 2),
    );
    const color = stripes[Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 12) % 4];
    for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
  }
  envelope.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  envelope.scale(1, 1.15, 1);
  const parts = new PartsBuilder().add(new THREE.CylinderGeometry(3.2, 1.2, 4, 12, 1, true), '#d8643f', { y: -8.5 });
  parts.box(1.6, 1.2, 1.6, '#8a6446', { y: -12.2 });
  for (const [x, z] of [
    [-0.7, -0.7],
    [0.7, -0.7],
    [-0.7, 0.7],
    [0.7, 0.7],
  ]) {
    parts.beam({ x, y: -11.6, z }, { x: x * 2.2, y: -10.4, z: z * 2.2 }, 0.05, '#4a4a40');
  }
  root.add(
    new THREE.Mesh(envelope, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
    parts.mesh(),
  );
  return root;
}

export function createSecrets(scene, { onSpotted = () => {} } = {}) {
  // The yeti hides behind a big boulder at the edge of the snowfield.
  const ground = terrainHeight(YETI.x, YETI.z);
  const rock = new PartsBuilder()
    .add(new THREE.IcosahedronGeometry(3.4, 0), '#9aa3a0', { y: 1.4, sx: 1.4, sy: 1, sz: 0.9 })
    .add(new THREE.IcosahedronGeometry(2, 0), '#e9eeea', { y: 3.2, sx: 1.5, sy: 0.4, sz: 1 })
    .mesh();
  rock.position.set(YETI.x, ground, YETI.z);
  scene.add(rock);
  const yeti = createYeti();
  yeti.root.position.set(YETI.x, ground, YETI.z - 2.6);
  scene.add(yeti.root);

  const balloon = createBalloon();
  scene.add(balloon);

  let time = 0;
  let rise = 0;
  let wave = 0;
  return {
    obstacles: [{ x: YETI.x, z: YETI.z, radius: 4 }],
    hearHorn(x, z) {
      if (rise > 0.5 && Math.hypot(x - YETI.x, z - YETI.z) < 60) wave = 2.5;
    },
    update(dt, player, running) {
      if (!running) return;
      time += dt;
      const distance = Math.hypot(player.x - YETI.x, player.z - YETI.z);
      // Leans out from behind the rock when you're a little way off, and slips
      // back out of sight if you come close.
      const peeking = distance > 18 && distance < 75;
      rise = damp(rise, peeking ? 1 : 0, peeking ? 0.8 : 4, dt);
      wave = Math.max(0, wave - dt);
      const { position } = yeti.root;
      position.set(YETI.x + rise * 4.3, ground + Math.sin(time * 1.3) * 0.05 * rise, YETI.z - 2.6);
      yeti.root.rotation.set(0, Math.atan2(position.x - player.x, position.z - player.z), rise * 0.18, 'YXZ');
      yeti.arms[1].rotation.z = wave > 0 ? 2.6 + Math.sin(time * 10) * 0.5 : 0.2;
      yeti.arms[0].rotation.z = -0.2;
      if (rise > 0.6 && distance < 50) onSpotted('yeti');

      // A slow loop over the valley, about four minutes around.
      const angle = time * 0.026;
      balloon.position.set(
        Math.sin(angle) * 210 + 30,
        105 + Math.sin(time * 0.1) * 8,
        Math.cos(angle * 1.3) * 160 - 20,
      );
      balloon.rotation.y = time * 0.05;
    },
  };
}
