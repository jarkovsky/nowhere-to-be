// The village out on the outer road in the west: houses on both sides of the road, a pond on
// the green, and the volunteer fire station that every Czech village has, with a tall tower
// for drying the hoses, a siren on the roof and the fire engine parked out front. Sound the
// horn by it and the engine answers with its blue lights and siren.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FORECOURTS, VILLAGE } from '../layout.js';
import { terrainHeight, pondLevel } from '../terrain.js';
import { PartsBuilder, hipRoof } from '../build.js';
import { gabledHouse } from './house.js';
import { headingOf } from '../path.js';
import { parkedFireEngine } from '../../vehicles/traffic.js';
import { cottage } from './farms.js';
import { framer } from './frame.js';

const CREAM = '#efe6cf';
const TILES = '#a5503c';
const RED = '#c7312a';
const ALARM = 10;

function fireStation(parts, obstacles, frame) {
  const { at, local, rotation } = frame;
  const [width, depth, eave, ridge] = [11, 8, 4.4, 7.4];
  parts.box(width + 0.4, 0.4, depth + 0.4, '#9a978a', at(0, 0, -3));
  obstacles.push(
    gabledHouse(parts, frame, {
      z: -3,
      width,
      depth,
      base: 0.1,
      eave: eave + 0.1,
      ridge: ridge + 0.05,
      overhang: 0.5,
      ridgeAlong: 'x',
      walls: CREAM,
      roof: TILES,
    }),
  );
  parts.box(width + 0.02, 0.35, depth + 0.02, RED, at(0, eave - 0.3, -3)); // red band under the eaves
  // Two big red doors onto the apron.
  for (const lx of [-2.6, 2.2]) {
    parts.box(3.4, 3.4, 0.12, RED, at(lx, 1.8, 1.02));
    for (let k = 1; k < 4; k++) parts.box(3.36, 0.05, 0.14, '#9e2620', at(lx, 0.1 + k * 0.85, 1.04));
  }
  const apron = FORECOURTS.find(court => court.id === 'fire station');
  // A concrete apron, thick enough to reach the ground where it falls away.
  parts.box(apron.x1 - apron.x0, 0.4, apron.z1 - apron.z0, '#b9b6ab', at(0, -0.12, (apron.z0 + apron.z1) / 2));
  // The hose tower, with slatted openings near the top, a pyramid roof and the siren above.
  const tower = { x: 7.2, z: -5 };
  // The walls go up to where the roof, hanging out past them from its eaves at 13 m, crosses them.
  const [eaves, peak, reach] = [13, 15.2, 1.9];
  const top = eaves + ((peak - eaves) * (reach - 1.5)) / reach;
  parts.box(3, top, 3, CREAM, at(tower.x, top / 2, tower.z));
  parts.box(3.04, 0.35, 3.04, RED, at(tower.x, 10.6, tower.z));
  for (const [lx, lz, ry] of [
    [0, 1.53, 0],
    [0, -1.53, 0],
    [1.53, 0, Math.PI / 2],
    [-1.53, 0, Math.PI / 2],
  ]) {
    for (let k = 0; k < 4; k++)
      parts.box(1.6, 0.1, 0.08, '#5b4636', at(tower.x + lx, 11.4 + k * 0.32, tower.z + lz, { ry: rotation + ry }));
  }
  parts.add(hipRoof(reach * 2, reach * 2, eaves, 0, 0, peak), TILES, at(tower.x, 0, tower.z));
  parts.add(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), '#6b6a5f', at(tower.x, 15.6, tower.z));
  parts.add(new THREE.CylinderGeometry(0.45, 0.3, 0.45, 10), '#6b6a5f', at(tower.x, 16.5, tower.z)); // siren
  parts.add(new THREE.ConeGeometry(0.55, 0.3, 10), '#6b6a5f', at(tower.x, 16.9, tower.z));
  obstacles.push({ ...local(tower.x, tower.z), halfX: 1.8, halfZ: 1.8, rotation, radius: 0 });
}

/**
 * Merges the meshes under `root` that share a material into one mesh each, with where they
 * stand built in, leaving those on `keep` as they are. For a group that never comes apart,
 * while it still stands at the origin.
 */
function mergeByMaterial(root, keep) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse(mesh => {
    if (!mesh.isMesh || keep.includes(mesh.material)) return;
    if (!groups.has(mesh.material)) groups.set(mesh.material, []);
    groups.get(mesh.material).push(mesh);
  });
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const merged = new THREE.Mesh(
      mergeGeometries(meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld))),
      material,
    );
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    for (const mesh of meshes) {
      // And the groups that held only it, such as a wheel's pivot.
      let parent = mesh.parent;
      mesh.removeFromParent();
      while (parent !== root && parent.children.length === 0) {
        const above = parent.parent;
        parent.removeFromParent();
        parent = above;
      }
    }
    root.add(merged);
  }
}

/** The pond: still water inside a ring of flat stones, and a bench on the bank. */
function pond(scene, parts, obstacles) {
  const { x, z, radius } = VILLAGE.pond;
  const level = pondLevel(VILLAGE.pond);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(radius + 0.8, 28).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: '#5f8f8a', emissive: '#1e3d3c', emissiveIntensity: 0.25 }),
  );
  water.position.set(x, level, z);
  water.receiveShadow = true;
  scene.add(water);
  const stones = 30;
  for (let k = 0; k < stones; k++) {
    const a = (k / stones) * Math.PI * 2;
    const sx = x + Math.cos(a) * (radius + 0.9);
    const sz = z + Math.sin(a) * (radius + 0.9);
    // Flat stones set into the ground, which the car rolls over.
    const top = Math.max(level + 0.08, terrainHeight(sx, sz) + 0.08);
    parts.box(1.9, 0.3, 0.9, k % 3 ? '#a7a497' : '#8f8c80', { x: sx, y: top - 0.15, z: sz, ry: -a + Math.PI / 2 });
  }
  // Facing the water.
  const bench = framer({ x: x + radius + 4, z, rotation: -Math.PI / 2 });
  parts.box(1.8, 0.1, 0.45, '#8a6446', bench.at(0, 0.5, 0));
  for (const lx of [-0.7, 0.7]) parts.box(0.1, 0.45, 0.4, '#5f4532', bench.at(lx, 0.25, 0));
  const [left, right] = [bench.local(-0.8, 0), bench.local(0.8, 0)];
  obstacles.push({ x, z, radius: radius + 0.4 }, { ax: left.x, az: left.z, bx: right.x, bz: right.z, radius: 0.3 });
}

export function buildVillage(scene, obstacles) {
  const parts = new PartsBuilder();
  for (const house of VILLAGE.houses) cottage(parts, obstacles, framer(house), 0, 0, house);
  const frame = framer(VILLAGE.fireStation);
  fireStation(parts, obstacles, frame);
  pond(scene, parts, obstacles);
  scene.add(parts.mesh());

  // The fire engine on the apron, facing the road.
  const engine = parkedFireEngine();
  // It never moves, so its parts are drawn a material at a time. The blue lights flash, so they stay apart.
  mergeByMaterial(engine.root, engine.beacons);
  const spot = frame.local(-2.6, 5.2);
  const heading = headingOf(Math.sin(frame.rotation), Math.cos(frame.rotation));
  engine.root.position.set(spot.x, terrainHeight(spot.x, spot.z) + 0.06, spot.z);
  engine.root.rotation.y = heading;
  scene.add(engine.root);
  for (const along of engine.along)
    obstacles.push({ x: spot.x - Math.sin(heading) * along, z: spot.z - Math.cos(heading) * along, radius: 1.3 });

  let alarm = 0;
  let time = 0;
  return {
    update(dt) {
      time += dt;
      alarm = Math.max(0, alarm - dt);
      const flash = alarm > 0 && Math.sin(time * 17) > 0;
      engine.beacons[0].emissiveIntensity = alarm > 0 ? (flash ? 2.4 : 0.15) : 0;
      engine.beacons[1].emissiveIntensity = alarm > 0 ? (flash ? 0.15 : 2.4) : 0;
    },
    /** A honk by the fire station sets off the engine's lights and siren for a while. */
    hearHorn(x, z) {
      if (Math.hypot(x - spot.x, z - spot.z) > 40) return false;
      alarm = ALARM;
      return true;
    },
    /** How loud the siren is from a point, 0 to 1. */
    sirenLevel(x, z) {
      return alarm > 0 ? Math.max(0, 1 - Math.hypot(x - spot.x, z - spot.z) / 150) * Math.min(1, alarm) : 0;
    },
  };
}
