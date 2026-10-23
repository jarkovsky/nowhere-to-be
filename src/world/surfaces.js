// Puddles and creek splashes, crunchy leaves, mud, and tyre tracks in the snow.
import * as THREE from 'three';
import { createRandom, valueNoise } from '../core/math.js';
import { ROAD, ROAD_HALF_WIDTH, SURFACES, TRACKS, surfaceAt } from './layout.js';
import { groundMaterial } from './detail.js';
import { onDeck, snowCover, terrainHeight, waterDepth } from './terrain.js';

const TRACK_CAPACITY = 6000;

/** True inside one of `puddles` ({ x, z, r, angle }: ellipses half as long again as they are wide). */
function inPuddle(puddles, x, z) {
  return puddles.some(({ x: px, z: pz, r, angle }) => {
    const [dx, dz] = [x - px, z - pz];
    const along = dx * Math.cos(angle) - dz * Math.sin(angle);
    const across = -dx * Math.sin(angle) - dz * Math.cos(angle);
    return (along / (1.5 * r)) ** 2 + (across / r) ** 2 < 1;
  });
}

/** Which effect the tyres make at a point. Puddles only count where there is water in them. */
function effectAt(x, z, puddles) {
  if (onDeck(x, z)) return 'grass'; // planks: no splashes, no tracks
  if (waterDepth(x, z) > 0.12) return 'water';
  if (snowCover(x, z) > 0.5) return 'snow';
  const patch = surfaceAt(x, z);
  if (patch === 'puddle') return inPuddle(puddles, x, z) ? 'puddle' : 'grass';
  return patch;
}

const UP = new THREE.Vector3(0, 1, 0);
const slope = new THREE.Vector3();
const tilt = new THREE.Quaternion();
const lay = new THREE.Quaternion();
const flat = new THREE.Euler();

/** Lays a flat mark on the ground at (x, z), turned to `heading` and tilted to match the slope. */
function layOnGround(dummy, x, z, heading) {
  const h = terrainHeight(x, z);
  slope.set(h - terrainHeight(x + 0.5, z), 0.5, h - terrainHeight(x, z + 0.5)).normalize();
  tilt.setFromUnitVectors(UP, slope);
  lay.setFromEuler(flat.set(-Math.PI / 2, 0, heading));
  dummy.position.set(x, h + 0.06, z);
  dummy.quaternion.copy(tilt).multiply(lay);
}

/**
 * A patch of mud laid over the ground: a disc with a ragged edge, following the ground's
 * shape, with darker wet hollows here and there.
 */
function mudGeometry(patch, seed) {
  const RINGS = 5;
  const SIDES = 20;
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  const point = (ring, side) => {
    const a = (side / SIDES) * Math.PI * 2;
    const edge = 0.75 + valueNoise(Math.cos(a) * 2 + seed, Math.sin(a) * 2, 23) * 0.35;
    const f = (ring / RINGS) * edge;
    const x = patch.x + Math.cos(a) * patch.rx * f;
    const z = patch.z + Math.sin(a) * patch.rz * f;
    const wet = valueNoise(x / 1.8, z / 1.8, 31 + seed);
    color.set('#5b4b3a').lerp(new THREE.Color('#342a20'), Math.max(0, wet - 0.45) * 1.6);
    return { position: [x, terrainHeight(x, z) + 0.08, z], color: color.toArray() };
  };
  const rings = Array.from({ length: RINGS + 1 }, (_, ring) =>
    Array.from({ length: SIDES }, (_, side) => point(ring, side)),
  );
  for (let ring = 0; ring < RINGS; ring++) {
    for (let side = 0; side < SIDES; side++) {
      const next = (side + 1) % SIDES;
      const quad = [rings[ring][side], rings[ring + 1][side], rings[ring + 1][next], rings[ring][next]];
      for (const k of [0, 2, 1, 0, 3, 2]) {
        positions.push(...quad[k].position);
        colors.push(...quad[k].color);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
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
  const puddles = [];
  for (const patch of SURFACES.filter(p => p.id === 'puddle')) {
    for (let i = 0; i < 4; i++) {
      const x = patch.x + (random() - 0.5) * patch.rx * 1.2;
      const z = patch.z + (random() - 0.5) * patch.rz * 1.2;
      const r = 1.2 + random() * 1.4;
      const angle = random() * 3;
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(r, 9), puddleMaterial);
      puddle.rotation.set(-Math.PI / 2, 0, angle);
      puddle.scale.set(1.5, 1, 1);
      puddle.position.set(x, terrainHeight(x, z) + 0.1, z);
      scene.add(puddle);
      puddles.push({ x, z, r, angle });
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
  // Copper-coloured trees ring the grove, but never stand on the trail or a track.
  const crowns = new THREE.Group();
  const obstacles = [];
  for (let i = 0, placed = 0; i < 16 && placed < 8; i++) {
    const angle = (i / 16) * Math.PI * 2 + 0.3;
    const x = grove.x + Math.cos(angle) * (grove.rx + 3);
    const z = grove.z + Math.sin(angle) * (grove.rz + 3);
    if (ROAD.nearest(x, z).distance < ROAD_HALF_WIDTH + 7) continue;
    if (TRACKS.some(track => track.path.nearest(x, z).distance < 6)) continue;
    const y = terrainHeight(x, z);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 5, 6),
      new THREE.MeshLambertMaterial({ color: '#7e6a50', flatShading: true }),
    );
    trunk.position.set(x, y + 2.3, z);
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.6 + random(), 1),
      new THREE.MeshLambertMaterial({ color: ['#bb773d', '#c99a50', '#a66135'][placed % 3], flatShading: true }),
    );
    crown.position.set(x, y + 6, z);
    crown.castShadow = trunk.castShadow = true;
    crowns.add(trunk, crown);
    obstacles.push({ x, z, radius: 0.5 });
    placed++;
  }
  scene.add(crowns);

  // Mud across the side tracks, with the same grain as the ground around it.
  const mudMaterial = groundMaterial({ polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  SURFACES.filter(p => p.id === 'mud').forEach((patch, i) => {
    const mud = new THREE.Mesh(mudGeometry(patch, i * 5), mudMaterial);
    mud.receiveShadow = true;
    scene.add(mud);
  });

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
    mud: new THREE.MeshLambertMaterial({ color: '#5e4630' }),
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
  let time = 0;
  let current = 'grass';

  return {
    /** The grove's tree trunks, for collisions. */
    obstacles,
    getState: () => ({ surface: current, tracks: tracks.count, particles: particles.filter(p => p.life > 0).length }),
    /** `spin` is how much faster than the car its wheels are turning, when they spin in the mud. */
    update(dt, car, running, spin = 0) {
      if (!running) return;
      time += dt;
      current = effectAt(car.x, car.z, puddles);
      sound.surface(current, Math.abs(car.speed) + Math.abs(spin));
      const sin = Math.sin(car.heading);
      const cos = Math.cos(car.heading);
      const spinning = Math.abs(spin) > 1;
      const moving = Math.abs(car.speed) > 0.6 || spinning;

      if (moving && current !== 'grass') {
        const rate = current === 'water' || spinning ? 0.03 : 0.045;
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
            // Spinning wheels fling it out behind them, high up.
            const fling = spin * (0.5 + random() * 0.4);
            p.vx = cos * side * spread + sin * fling + (random() - 0.5);
            p.vz = -sin * side * spread + cos * fling + (random() - 0.5);
            p.vy = 2 + random() * (current === 'water' ? 3 : 2) + (spinning ? 1.5 : 0);
          }
        }
        if (current === 'snow' && (!lastTrack || Math.hypot(car.x - lastTrack.x, car.z - lastTrack.z) > 0.48)) {
          for (const side of [-1, 1]) {
            const x = car.x + cos * side * 1.08;
            const z = car.z - sin * side * 1.08;
            if (effectAt(x, z, puddles) !== 'snow') continue;
            layOnGround(dummy, x, z, car.heading);
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
