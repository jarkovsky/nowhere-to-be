// Small surprises: a shy yeti in the snowfield, a hot-air balloon drifting
// over the valley, and an owl that sits on the fire tower at night.
import * as THREE from 'three';
import { angleDelta, damp } from '../core/math.js';
import { YETI, TOWER } from './layout.js';
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

  // The owl perches on a corner post of the fire tower's railing.
  const owl = createOwl();
  const perch = new THREE.Vector3(TOWER.x + 2.2, terrainHeight(TOWER.x, TOWER.z) + 13.2, TOWER.z + 2.2);
  owl.root.position.copy(perch);
  owl.root.visible = false;
  scene.add(owl.root);
  let dark = false;

  let time = 0;
  let rise = 0;
  let wave = 0;
  return {
    obstacles: [{ x: YETI.x, z: YETI.z, radius: 4 }],
    hearHorn(x, z) {
      if (rise > 0.5 && Math.hypot(x - YETI.x, z - YETI.z) < 60) wave = 2.5;
      if (dark && Math.hypot(x - perch.x, z - perch.z) < 70) onCall('hoot');
    },
    update(dt, player, running, night = 0) {
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
