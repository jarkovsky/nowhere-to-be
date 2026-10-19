// A little white chapel on the eastern hill, the kind that stands by roads and
// on hilltops all over the Orlické hory: whitewashed walls, a rounded apse, a
// shingle roof and a small bell turret with a cross.
import * as THREE from 'three';
import { CHAPEL } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder, localFrame, gableRoof, gableEnds } from '../build.js';

const WHITE = '#f1ede2';
const ROOF = '#5d4a3e';

export function buildChapel(scene, obstacles) {
  const parts = new PartsBuilder();
  const { x, z, rotation } = CHAPEL;
  const y = terrainHeight(x, z);
  const local = localFrame(x, z, rotation);
  // Local +Z is the front, with the door, facing down into the valley.
  const at = (lx, ly, lz, extra = {}) => ({ ...local(lx, lz), y: y + ly, ry: rotation, ...extra });
  const width = 3.2;
  const length = 4.4;
  const eave = 3.2;
  const ridge = 5.6;

  parts.box(width + 0.4, 0.5, length + 0.8, '#a39f92', at(0, 0, 0)); // plinth
  parts.box(width, eave - 0.2, length, WHITE, at(0, 0.1 + (eave - 0.2) / 2, 0));
  parts.add(gableEnds(width, length, eave, ridge), WHITE, at(0, 0, 0));
  parts.add(gableRoof(width, length, eave - 0.05, ridge + 0.05, 0.3), ROOF, at(0, 0, 0));
  // The rounded apse at the back, under a half cone.
  parts.add(
    new THREE.CylinderGeometry(1.5, 1.5, eave - 0.2, 10, 1, false, Math.PI / 2, Math.PI),
    WHITE,
    at(0, 0.1 + (eave - 0.2) / 2, -length / 2),
  );
  parts.add(new THREE.ConeGeometry(1.8, 1.5, 10, 1, false, Math.PI / 2, Math.PI), ROOF, at(0, eave + 0.7, -length / 2));
  // The bell turret over the front gable, with a spire and a cross.
  parts.box(0.8, 1.4, 0.8, WHITE, at(0, ridge + 0.4, length / 2 - 0.6));
  for (const [lx, lz] of [
    [0, 0.41],
    [0, -0.41],
    [0.41, 0],
    [-0.41, 0],
  ]) {
    parts.box(lz ? 0.3 : 0.04, 0.45, lz ? 0.04 : 0.3, '#3a3a34', at(lx, ridge + 0.6, length / 2 - 0.6 + lz));
  }
  parts.add(
    new THREE.ConeGeometry(0.62, 1.6, 4),
    ROOF,
    at(0, ridge + 1.9, length / 2 - 0.6, { ry: rotation + Math.PI / 4 }),
  );
  parts.box(0.06, 0.7, 0.06, '#6b6a5f', at(0, ridge + 3, length / 2 - 0.6));
  parts.box(0.36, 0.06, 0.06, '#6b6a5f', at(0, ridge + 3.15, length / 2 - 0.6));
  // Door, a round window over it, and tall windows down each side.
  parts.box(1.1, 2.1, 0.1, '#5a3e2b', at(0, 1.15, length / 2 + 0.01));
  parts.add(
    new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10),
    '#4f6f73',
    at(0, 3.9, length / 2 + 0.01, { rx: Math.PI / 2 }),
  );
  for (const side of [-1, 1]) parts.box(0.08, 1.1, 0.5, '#4f6f73', at(side * (width / 2 + 0.01), 1.9, 0.2));
  // A bench in front.
  parts.box(1.8, 0.1, 0.45, '#8a6446', at(0, 0.5, length / 2 + 2.2));
  for (const side of [-0.7, 0.7]) parts.box(0.1, 0.45, 0.4, '#5f4532', at(side, 0.25, length / 2 + 2.2));
  scene.add(parts.mesh());

  const a = local(0, -length / 2 - 0.8);
  const b = local(0, length / 2 - 1.4);
  obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: width / 2 + 0.3 });
  obstacles.push({ ...local(0, length / 2 + 2.2), radius: 0.9 });
}
