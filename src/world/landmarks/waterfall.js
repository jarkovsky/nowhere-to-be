// Whispering Falls: a horseshoe of rock around the pool where the creek begins.
import * as THREE from 'three';
import { createRandom, smoothstep } from '../../core/math.js';
import { terrainHeight, POOL } from '../terrain.js';
import { triangleGeometry } from '../build.js';
import { rockMaterial, softenRock } from '../rocks.js';

const ARC = 2.25; // half-angle of the horseshoe, opening to the west
const STEPS = 22;
const CLIFF_RADIUS = 12;

/** Point at `angle` around the pool (0 = east), `radius` metres from its centre. */
const around = (angle, radius) => ({ x: POOL.x + Math.cos(angle) * radius, z: POOL.z + Math.sin(angle) * radius });

const cliffHeight = angle => 3 + 13 * Math.cos((angle / ARC) * (Math.PI / 2)) ** 1.2;

export function buildWaterfall(scene, obstacles) {
  const random = createRandom(55);
  // Cross-section: [distance in towards the pool, height as a fraction of the cliff].
  const profile = [
    [2.6, null],
    [1.4, 0.35],
    [0.9, 0.75],
    [0, 1],
    [-2.5, 0.92],
    [-6, 0.6],
    [-9.5, null],
  ];
  const rings = [];
  for (let i = 0; i <= STEPS; i++) {
    const angle = -ARC + (i / STEPS) * ARC * 2;
    let height = cliffHeight(angle);
    // A notch in the lip where the water spills over.
    const notch = 1 - smoothstep(Math.abs(angle), 0.05, 0.22);
    rings.push(
      profile.map(([inward, fraction], k) => {
        const p = around(angle, CLIFF_RADIUS - inward + (random() - 0.5) * 1.2);
        if (fraction === null) return [p.x, terrainHeight(p.x, p.z) - 2, p.z];
        const top = k === 3 ? height - notch * 1.3 : height;
        return [p.x, POOL.level + top * fraction + (random() - 0.5) * 1.4 * fraction, p.z];
      }),
    );
  }

  const positions = [];
  const colors = [];
  const rock = new THREE.Color('#8c909c');
  const moss = new THREE.Color('#948850');
  const color = new THREE.Color();
  const triangle = (a, b, c) => {
    const lowest = Math.min(a[1], b[1], c[1]) - POOL.level;
    color
      .copy(rock)
      .lerp(moss, smoothstep(lowest, 8, 13) * 0.8)
      .multiplyScalar(0.88 + random() * 0.18);
    positions.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) colors.push(color.r, color.g, color.b);
  };
  for (let i = 0; i < STEPS; i++) {
    for (let k = 0; k < profile.length - 1; k++) {
      const a = rings[i][k];
      const b = rings[i + 1][k];
      const c = rings[i][k + 1];
      const d = rings[i + 1][k + 1];
      triangle(a, b, c);
      triangle(c, b, d);
    }
  }
  // Close both ends of the horseshoe, all the way round, under the ground between its feet too.
  for (const [ring, flip] of [
    [rings[0], false],
    [rings[STEPS], true],
  ]) {
    const centre = ring.reduce((sum, p) => sum.map((v, j) => v + p[j] / ring.length), [0, 0, 0]);
    for (let k = 0; k < ring.length; k++) {
      const [p, q] = [ring[k], ring[(k + 1) % ring.length]];
      if (flip) triangle(q, p, centre);
      else triangle(p, q, centre);
    }
  }
  const cliff = new THREE.Mesh(softenRock(triangleGeometry(positions, colors)), rockMaterial);
  cliff.castShadow = true;
  cliff.receiveShadow = true;
  scene.add(cliff);

  for (let i = 0; i < STEPS; i++) {
    const a = around(-ARC + (i / STEPS) * ARC * 2, CLIFF_RADIUS + 3.3);
    const b = around(-ARC + ((i + 1) / STEPS) * ARC * 2, CLIFF_RADIUS + 3.3);
    obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 4.6 });
  }

  // The falling water: a curved ribbon from the notch to the pool.
  const top = cliffHeight(0) - 1.3;
  const path = [
    [12.4, top + 0.1],
    [11.3, top - 0.6],
    [10.5, top * 0.7],
    [9.7, top * 0.32],
    [9.1, 0.05],
  ];
  const waterMaterial = new THREE.MeshLambertMaterial({
    color: '#cdeeed',
    emissive: '#4f8f97',
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const ribbon = (width, push) => {
    const verts = [];
    for (let k = 0; k < path.length - 1; k++) {
      const [r0, y0] = path[k];
      const [r1, y1] = path[k + 1];
      const a = [POOL.x + r0 - push, POOL.level + y0, POOL.z - width / 2];
      const b = [POOL.x + r0 - push, POOL.level + y0, POOL.z + width / 2];
      const c = [POOL.x + r1 - push, POOL.level + y1, POOL.z - width / 2];
      const d = [POOL.x + r1 - push, POOL.level + y1, POOL.z + width / 2];
      verts.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, waterMaterial);
  };
  scene.add(ribbon(2.6, 0), ribbon(1.7, 0.18));

  // Streaks sliding down the falls, foam rings and a little mist at the bottom.
  const streaks = Array.from({ length: 18 }, () => ({
    offset: random(),
    lateral: (random() - 0.5) * 2.2,
    speed: 0.55 + random() * 0.3,
  }));
  const streakMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 1.6, 0.12),
    new THREE.MeshBasicMaterial({ color: '#f4fbf8', transparent: true, opacity: 0.8 }),
    streaks.length,
  );
  // Everywhere the streaks go, so they aren't drawn while the falls are out of view.
  streakMesh.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(POOL.x + 10.5, POOL.level + top / 2, POOL.z),
    Math.hypot(2, top / 2 + 1.5, 1.3) + 0.5,
  );
  scene.add(streakMesh);
  const dummy = new THREE.Object3D();
  const foam = [0, 1, 2].map(i => {
    const material = new THREE.MeshBasicMaterial({
      color: '#eef8f4',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1 + i * 0.9, 1.5 + i * 0.9, 18), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(POOL.x + 8.8, POOL.level + 0.04 + i * 0.01, POOL.z);
    scene.add(ring);
    return ring;
  });

  const pointOnFall = t => {
    const f = t * (path.length - 1);
    const k = Math.min(Math.floor(f), path.length - 2);
    const u = f - k;
    return [path[k][0] + (path[k + 1][0] - path[k][0]) * u, path[k][1] + (path[k + 1][1] - path[k][1]) * u];
  };

  return {
    occluders: [cliff],
    update(time) {
      streaks.forEach(({ offset, lateral, speed }, i) => {
        const t = (offset + time * speed) % 1;
        const [r, y] = pointOnFall(t);
        dummy.position.set(POOL.x + r - 0.25, POOL.level + y, POOL.z + lateral);
        dummy.scale.set(1, 0.5 + t, 1);
        dummy.updateMatrix();
        streakMesh.setMatrixAt(i, dummy.matrix);
      });
      streakMesh.instanceMatrix.needsUpdate = true;
      foam.forEach((ring, i) => {
        const pulse = (time * 0.6 + i / 3) % 1;
        ring.scale.setScalar(0.7 + pulse * 0.9);
        ring.material.opacity = 0.5 * (1 - pulse) + 0.1;
      });
    },
  };
}
