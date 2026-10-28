// Small surprises: a hot-air balloon drifting over the valley, and an owl that sits on the
// fire tower at night.
import * as THREE from 'three';
import { angleDelta, damp } from '../core/math.js';
import { TOWER } from './layout.js';
import { terrainHeight } from './terrain.js';
import { PartsBuilder } from './build.js';

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

function createOwl() {
  const root = new THREE.Group();
  const feathers = '#8b6f52';
  root.add(
    new PartsBuilder()
      .add(new THREE.IcosahedronGeometry(0.3, 1), feathers, { y: 0.3, sy: 1.3 })
      .add(new THREE.IcosahedronGeometry(0.2, 1), '#d8c7a6', { y: 0.27, z: -0.13, sy: 1.2 })
      .box(0.08, 0.06, 0.12, '#e3b23c', { x: -0.08, y: 0.02, z: -0.04 })
      .box(0.08, 0.06, 0.12, '#e3b23c', { x: 0.08, y: 0.02, z: -0.04 })
      .mesh({ castShadow: false }),
  );
  // The head turns on its own to follow you.
  const head = new THREE.Group();
  head.position.y = 0.66;
  const eyes = new THREE.MeshLambertMaterial({ color: '#f2c94c', emissive: '#f2c94c', emissiveIntensity: 0.6 });
  head.add(
    new PartsBuilder()
      .add(new THREE.IcosahedronGeometry(0.24, 1), feathers)
      .add(new THREE.ConeGeometry(0.06, 0.16, 4), feathers, { x: -0.13, y: 0.22 })
      .add(new THREE.ConeGeometry(0.06, 0.16, 4), feathers, { x: 0.13, y: 0.22 })
      .add(new THREE.ConeGeometry(0.04, 0.1, 4), '#4a3b2c', { y: -0.06, z: -0.22, rx: -Math.PI / 2 })
      .mesh({ castShadow: false }),
  );
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10).rotateX(Math.PI / 2), eyes);
    eye.position.set(side * 0.09, 0.03, -0.21);
    const pupil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#1d1d1a' }),
    );
    pupil.position.set(side * 0.09, 0.03, -0.23);
    head.add(eye, pupil);
  }
  root.add(head);
  return { root, head };
}

export function createSecrets(scene, { onCall = () => {} } = {}) {
  const balloon = createBalloon();
  scene.add(balloon);

  // The owl perches on a corner post of the fire tower's railing.
  const owl = createOwl();
  const perch = new THREE.Vector3(TOWER.x + 2.2, terrainHeight(TOWER.x, TOWER.z) + 13.2, TOWER.z + 2.2);
  owl.root.position.copy(perch);
  owl.root.visible = false;
  scene.add(owl.root);
  let dark = false;

  let time = 0;
  return {
    hearHorn(x, z) {
      if (dark && Math.hypot(x - perch.x, z - perch.z) < 70) onCall('hoot');
    },
    update(dt, player, night = 0) {
      time += dt;
      // A slow loop over the valley, about four minutes around.
      const angle = time * 0.026;
      balloon.position.set(
        Math.sin(angle) * 210 + 30,
        105 + Math.sin(time * 0.1) * 8,
        Math.cos(angle * 1.3) * 160 - 20,
      );
      balloon.rotation.y = time * 0.05;

      // Only out after dark. It keeps an eye on you, and now and then looks away.
      dark = night > 0.55;
      owl.root.visible = dark;
      if (dark) {
        const look = Math.atan2(perch.x - player.x, perch.z - player.z);
        const glance = Math.sin(time * 0.4) > 0.85 ? 1.2 : 0;
        // The short way round, even where the angle to the player jumps from one side to the other.
        const turn = angleDelta(owl.head.rotation.y, look + glance);
        owl.head.rotation.y = damp(owl.head.rotation.y, owl.head.rotation.y + turn, 3, dt);
      }
    },
  };
}
