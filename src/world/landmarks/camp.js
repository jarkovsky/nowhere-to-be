// The lakeside campsite and the cabin by the trailhead.
// All three stand on flattened pads (see PADS in layout.js), so nothing floats.
import * as THREE from 'three';
import { CAMP, CABIN } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame as frame, prism, createSmoke } from '../build.js';
import { framer } from './frame.js';

function addTent(parts, x, z, rotation) {
  const y = terrainHeight(x, z) - 0.04;
  const w = 1.9;
  const h = 2.3;
  const l = 2.1;
  const transform = { x, y, z, ry: rotation };
  const left = prism([
    [-w, 0, l],
    [0, h, l],
    [-w, 0, -l],
    [-w, 0, -l],
    [0, h, l],
    [0, h, -l],
  ]);
  const right = prism([
    [w, 0, l],
    [w, 0, -l],
    [0, h, l],
    [0, h, l],
    [w, 0, -l],
    [0, h, -l],
  ]);
  // Both ends are closed, so the tent never shows its hollow inside.
  const ends = prism([
    [-w, 0, -l],
    [0, h, -l],
    [w, 0, -l],
    [-w, 0, l],
    [w, 0, l],
    [0, h, l],
  ]);
  const door = prism([
    [-w * 0.55, 0, l + 0.02],
    [w * 0.55, 0, l + 0.02],
    [0, h * 0.78, l + 0.02],
  ]);
  parts.add(left, '#d08d55', transform).add(right, '#c47f4a', transform).add(ends, '#c98650', transform);
  parts.add(door, '#4e463a', transform);
  parts.box(2 * w + 0.6, 0.04, 2 * l + 0.8, '#6d7a64', { x, y: y + 0.03, z, ry: rotation });
  const local = frame(x, z, rotation);
  for (const end of [-1, 1]) {
    const peg = local(0, end * (l + 1.4));
    const top = local(0, end * (l + 0.15));
    parts.box(0.08, 2.5, 0.08, '#8a7756', { x: top.x, y: y + 1.2, z: top.z });
    parts.beam({ ...top, y: y + h + 0.05 }, { ...peg, y: terrainHeight(peg.x, peg.z) }, 0.03, '#e8e0c8');
  }
}

function addCampfire(scene, parts, x, z) {
  const y = terrainHeight(x, z);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.add(new THREE.IcosahedronGeometry(0.42, 0), i % 2 ? '#9c9b8f' : '#8a8a80', {
      x: x + Math.cos(a) * 1.25,
      y: y + 0.12,
      z: z + Math.sin(a) * 1.25,
      sy: 0.7,
      ry: a,
    });
  }
  for (const a of [0.3, 1.4, 2.5]) {
    parts.add(new THREE.CylinderGeometry(0.13, 0.15, 1.7, 6), '#5b3c27', {
      x,
      y: y + 0.3,
      z,
      rz: Math.PI / 2 - 0.25,
      ry: a,
    });
  }
  // Two log benches facing the fire.
  for (const [a, length] of [
    [Math.PI * 0.8, 2.8],
    [Math.PI * 1.35, 2.4],
  ]) {
    const bx = x + Math.cos(a) * 3.4;
    const bz = z + Math.sin(a) * 3.4;
    parts.add(new THREE.CylinderGeometry(0.32, 0.34, length, 8), '#7b5a3d', {
      x: bx,
      y: terrainHeight(bx, bz) + 0.3,
      z: bz,
      rz: Math.PI / 2,
      ry: -a + Math.PI / 2,
    });
  }

  const flameMaterial = new THREE.MeshBasicMaterial({ color: '#ffb14a', transparent: true, opacity: 0.92 });
  const coreMaterial = new THREE.MeshBasicMaterial({ color: '#ffe08a' });
  const flames = [0, 1, 2].map(i => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.55 - i * 0.12, 1.5 + i * 0.35, 6),
      i === 2 ? coreMaterial : flameMaterial,
    );
    flame.position.set(x + (i - 1) * 0.25, y + 0.85, z + (i - 1) * 0.15);
    scene.add(flame);
    return flame;
  });

  // A soft additive disc instead of a real point light: much cheaper to render.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  const ctx = glowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 180, 90, 0.9)');
  gradient.addColorStop(0.4, 'rgba(255, 150, 70, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 140, 60, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(glowCanvas),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(x, y + 0.08, z);
  scene.add(glow);

  const sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), coreMaterial, 10);
  // Everywhere the sparks rise to, so they aren't drawn while the fire is out of view.
  sparks.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y + 2.75, z), 2.5);
  scene.add(sparks);
  const dummy = new THREE.Object3D();

  return {
    update(time, night) {
      flames.forEach((flame, i) => {
        flame.scale.set(
          1 + Math.sin(time * 9 + i) * 0.14,
          1 + Math.sin(time * 7 + i * 2) * 0.24,
          1 + Math.cos(time * 8 + i) * 0.14,
        );
      });
      glowMaterial.opacity = (0.35 + night * 0.65) * (0.9 + Math.sin(time * 8) * 0.1);
      sparks.visible = night > 0.3;
      if (!sparks.visible) return;
      for (let i = 0; i < sparks.count; i++) {
        const offset = i / sparks.count;
        const t = (time * 0.5 + offset) % 1;
        const a = offset * 40;
        dummy.position.set(x + Math.sin(a + t * 3) * 0.4 * t, y + 1 + t * 3.5, z + Math.cos(a + t * 2) * 0.4 * t);
        dummy.updateMatrix();
        sparks.setMatrixAt(i, dummy.matrix);
      }
      sparks.instanceMatrix.needsUpdate = true;
    },
  };
}

function buildCamp(scene, obstacles) {
  const parts = new PartsBuilder();
  const local = frame(CAMP.x, CAMP.z, CAMP.heading);
  const tent = local(-7, -4);
  addTent(parts, tent.x, tent.z, CAMP.heading + 0.9);
  const fireSpot = local(-4.5, -9);
  const fire = addCampfire(scene, parts, fireSpot.x, fireSpot.z);

  // Firewood stack and a lantern on a post.
  const wood = local(-11, -1);
  for (let i = 0; i < 6; i++) {
    parts.add(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 6), '#7c5a3b', {
      x: wood.x + (i % 3) * 0.33 - 0.33,
      y: terrainHeight(wood.x, wood.z) + 0.17 + Math.floor(i / 3) * 0.3,
      z: wood.z,
      rx: Math.PI / 2,
      ry: CAMP.heading,
    });
  }
  const lanternSpot = local(-4, 1.5);
  const ly = terrainHeight(lanternSpot.x, lanternSpot.z);
  parts.box(0.12, 2, 0.12, '#5e4a36', { x: lanternSpot.x, y: ly + 0.6, z: lanternSpot.z });
  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.38, 0.3),
    new THREE.MeshBasicMaterial({ color: '#ffd68a' }),
  );
  lantern.position.set(lanternSpot.x, ly + 1.75, lanternSpot.z);
  scene.add(lantern);

  scene.add(parts.mesh());
  obstacles.push(
    { x: tent.x, z: tent.z, radius: 2.4 },
    { x: fireSpot.x, z: fireSpot.z, radius: 1.6 },
    { x: wood.x, z: wood.z, radius: 0.9 },
    { x: lanternSpot.x, z: lanternSpot.z, radius: 0.2 },
  );
  return fire;
}

function buildCabin(scene, obstacles) {
  const parts = new PartsBuilder();
  const { x, z } = CABIN;
  const y = terrainHeight(x, z);
  const { at, local } = framer(CABIN, y);

  // A classic A-frame: the roof comes right down to the stone footing.
  const eave = 4.4;
  const ridge = 7.2;
  const roofTop = h => 0.35 + (1 - Math.abs(h) / eave) * (ridge - 0.35);
  parts.box(7.6, 0.7, 8.6, '#9a978a', at(0, 0.05, 0));
  const roof = prism([
    [-eave, 0.35, 4.6],
    [0, ridge, 4.6],
    [-eave, 0.35, -4.6],
    [-eave, 0.35, -4.6],
    [0, ridge, 4.6],
    [0, ridge, -4.6],
    [eave, 0.35, 4.6],
    [eave, 0.35, -4.6],
    [0, ridge, 4.6],
    [0, ridge, 4.6],
    [eave, 0.35, -4.6],
    [0, ridge, -4.6],
  ]);
  parts.add(roof, '#6e7b6e', at(0, 0, 0));
  // Front and back walls sit just inside the roofline.
  const wall = 4.0;
  const gable = prism([
    [-wall, 0.4, 4],
    [wall, 0.4, 4],
    [0, roofTop(0) - 0.4, 4],
    [wall, 0.4, -4],
    [-wall, 0.4, -4],
    [0, roofTop(0) - 0.4, -4],
  ]);
  parts.add(gable, '#b4855b', at(0, 0, 0));
  // Fascia boards along the roof edges.
  for (const end of [-4.62, 4.62]) {
    for (const side of [-1, 1]) {
      parts.beam(
        { ...local(side * eave, end), y: y + 0.35 },
        { ...local(0, end), y: y + ridge + 0.05 },
        0.22,
        '#e2d1a9',
        0.3,
      );
    }
  }
  parts.box(1.2, 2.1, 0.12, '#4c6659', at(-1.1, 1.45, 4.06)); // door
  parts.box(1.3, 1.1, 0.12, '#e8cf8a', at(1.2, 1.9, 4.06)); // window
  parts.box(1.5, 0.12, 0.16, '#e2d1a9', at(1.2, 2.5, 4.1));
  parts.box(1.5, 0.12, 0.16, '#e2d1a9', at(1.2, 1.32, 4.1));
  parts.box(1, 1, 0.12, '#e8cf8a', at(0, 4.3, 4.06)); // loft window
  parts.box(7.2, 0.22, 2.4, '#bca57d', at(0, 0.38, 5.6)); // porch
  parts.box(2, 0.2, 0.7, '#bca57d', at(-1.1, 0.12, 7.1)); // step
  parts.box(0.8, 3.4, 0.8, '#8e8b7f', at(1.7, roofTop(1.7) + 0.8, -1.6)); // chimney
  scene.add(parts.mesh());
  obstacles.push({ x, z, radius: 5 }, { ...local(0, 5.8), radius: 1.6 });

  // Wood smoke drifting from the chimney.
  return createSmoke(scene, at(1.7, 7.4, -1.6), { count: 7, rate: 0.12, rise: 9, size: 0.6 });
}

export function buildCampsites(scene, obstacles) {
  const fire = buildCamp(scene, obstacles);
  const cabin = buildCabin(scene, obstacles);
  return {
    update(time, night) {
      fire.update(time, night);
      cabin.update(time);
    },
  };
}
