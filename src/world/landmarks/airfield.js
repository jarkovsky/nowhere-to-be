// A small airfield on the eastern plateau: a runway with white markings and edge
// lights, an apron joined to it by a short taxiway, a hangar with a curved roof you
// can drive into, a little control tower whose beacon turns at night, and a windsock.
import * as THREE from 'three';
import { AIRFIELD } from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';
import { buildWindsock } from './windsock.js';

const ASPHALT = '#6c6e69';
/** Lamps, the beacon and the windsock are too small to make out from further away than this. */
const DETAIL_RANGE = 380;
const CONCRETE = '#b9b6ab';
const WHITE = '#f1efe7';
const YELLOW = '#e3b83c';

export function buildAirfield(scene, obstacles) {
  const { x: rx, z0, z1, width, apron, taxiZ, hangar, tower } = AIRFIELD;
  const y = terrainHeight(rx, (z0 + z1) / 2);
  const flat = new PartsBuilder();
  /** A flat patch from x0..x1, za..zb, `top` metres above the ground. */
  const patch = (x0, x1, za, zb, color, top) =>
    flat.box(x1 - x0, 0.1, zb - za, color, { x: (x0 + x1) / 2, y: y + top - 0.05, z: (za + zb) / 2 });

  // The runway, with white edge lines, a dashed centre line and striped thresholds at both ends.
  const half = width / 2;
  patch(rx - half, rx + half, z0, z1, ASPHALT, 0.06);
  for (const side of [-1, 1]) patch(rx + side * (half - 0.7), rx + side * (half - 0.4), z0 + 2, z1 - 2, WHITE, 0.08);
  for (let z = z0 + 26; z < z1 - 30; z += 12) patch(rx - 0.2, rx + 0.2, z, z + 6, WHITE, 0.08);
  for (const [from, to] of [
    [z0 + 3, z0 + 15],
    [z1 - 15, z1 - 3],
  ]) {
    for (let k = -2.5; k <= 2.5; k++) patch(rx + k * 2 - 0.5, rx + k * 2 + 0.5, from, to, WHITE, 0.08);
  }
  // Aiming points a little way in from each threshold.
  for (const z of [z0 + 42, z1 - 56]) {
    for (const side of [-1, 1]) patch(rx + side * 3.2 - 0.9, rx + side * 3.2 + 0.9, z, z + 14, WHITE, 0.08);
  }

  // The apron and the taxiway, with yellow lines to follow.
  patch(apron.x0, apron.x1, apron.z0, apron.z1, CONCRETE, 0.05);
  patch(apron.x1 - 0.5, rx - half + 0.2, taxiZ - 5, taxiZ + 5, CONCRETE, 0.05);
  patch(548, rx - 2, taxiZ - 0.15, taxiZ + 0.15, YELLOW, 0.07);
  patch(560, 560.3, 168, taxiZ, YELLOW, 0.07);
  patch(540, 540.3, 152, 172, YELLOW, 0.07);

  const parts = new PartsBuilder();

  const shed = new PartsBuilder();
  // The hangar: a curved metal roof on low concrete kerbs, with a floor level with the apron
  // and a wide door in the arched end facing it. The roof, its ribs and the end walls are
  // solid shapes swept along the hangar, so they have both faces and no edges to see through.
  const length = 18;
  const radius = 9;
  const hx = hangar.x;
  const hz = hangar.z;
  const base = y + 0.3; // where the arch springs from, on top of the kerbs
  const door = { half: 6.5, height: 5.6 };
  /** An arch between two radii (or a half disc, with no inner one) in the hangar's cross-section, `depth` thick along it. */
  const arch = (outer, inner, depth, opening) => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, Math.PI, 0, true);
    if (opening) {
      shape.lineTo(opening.half, 0);
      shape.lineTo(opening.half, opening.height);
      shape.lineTo(-opening.half, opening.height);
      shape.lineTo(-opening.half, 0);
    } else if (inner) {
      shape.lineTo(inner, 0);
      shape.absarc(0, 0, inner, 0, Math.PI, false);
    }
    shape.closePath();
    // Twelve straight pieces round the half circle, like the roof's metal sheets.
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  };
  // Swept along +X from `x`: the shape's own X runs across the hangar (along Z) and Y up.
  const along = (x, extra = {}) => ({ x, y: base, z: hz, ry: Math.PI / 2, ...extra });
  const shade = (outside, inside) => (_x, py, pz) =>
    Math.hypot(py - base, pz - hz) > radius - 0.08 ? outside : inside;
  shed.add(arch(radius, radius - 0.15, length), shade('#b9c0bc', '#8d948f'), along(hx - length / 2));
  for (let k = -2; k <= 2; k++) {
    shed.add(arch(radius + 0.08, radius - 0.02, 0.25), '#9aa29d', along(hx + (k * length) / 5 - 0.125));
  }
  // The closed back wall, and the front with its door, framed round the arch.
  shed.add(arch(radius - 0.1, 0, 0.15), '#d8d3c3', along(hx - length / 2 + 0.05));
  shed.add(arch(radius - 0.1, 0, 0.2, door), '#d8d3c3', along(hx + length / 2 - 0.3));
  shed.add(arch(radius + 0.12, radius - 0.3, 0.4), '#c9c3b2', along(hx + length / 2 - 0.2));
  shed.box(0.3, 0.35, door.half * 2 + 0.2, '#c9c3b2', {
    x: hx + length / 2 - 0.2,
    y: y + door.height + 0.3 + 0.15,
    z: hz,
  });
  for (const side of [-1, 1]) {
    shed.box(0.3, door.height + 0.3, 0.3, '#c9c3b2', {
      x: hx + length / 2 - 0.2,
      y: y + (door.height + 0.3) / 2,
      z: hz + side * (door.half + 0.13),
    });
    // Kerbs under the long sides, and under the front wall either side of the door.
    shed.box(length + 0.4, 0.4, 0.6, '#a7a397', { x: hx, y: y + 0.1, z: hz + side * radius });
    shed.box(0.6, 0.4, radius - door.half - 0.3, '#a7a397', {
      x: hx + length / 2 - 0.2,
      y: y + 0.1,
      z: hz + (side * (radius + door.half + 0.3)) / 2,
    });
  }
  shed.box(0.6, 0.4, radius * 2 + 0.6, '#a7a397', { x: hx - length / 2, y: y + 0.1, z: hz });
  // The floor, level with the apron and joined to it by a strip of concrete.
  shed.box(length, 0.1, radius * 2 - 0.6, '#a7a397', { x: hx, y: y + 0.01, z: hz });
  patch(hx + length / 2, apron.x0 + 0.5, hz - door.half - 1.5, hz + door.half + 1.5, CONCRETE, 0.05);
  // Inside: a workbench and an oil drum.
  shed.box(1, 1, 4, '#8a6c4c', { x: hx - length / 2 + 1.2, y: y + 0.56, z: hz + 4 });
  shed.add(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10), '#3f6aa1', {
    x: hx - length / 2 + 1.4,
    y: y + 0.51,
    z: hz - 5,
  });
  // Walls to bump into: the back, both sides and the front either side of the door.
  for (const side of [-1, 1]) {
    obstacles.push({
      ax: hx - length / 2,
      az: hz + side * (radius - 0.4),
      bx: hx + length / 2,
      bz: hz + side * (radius - 0.4),
      radius: 0.5,
    });
    obstacles.push({
      ax: hx + length / 2 - 0.2,
      az: hz + side * (door.half + 0.5),
      bx: hx + length / 2 - 0.2,
      bz: hz + side * (radius - 0.4),
      radius: 0.45,
    });
  }
  obstacles.push({ ax: hx - length / 2, az: hz - radius, bx: hx - length / 2, bz: hz + radius, radius: 0.5 });

  scene.add(flat.mesh({ castShadow: false }));

  // The control tower: an office at the bottom, a slim stem and a glass cab on top.
  const { x: tx, z: tz } = tower;
  const ty = terrainHeight(tx, tz);
  parts.box(7, 3.6, 6, '#e9e4d4', { x: tx, y: ty + 1.8, z: tz });
  parts.box(7.3, 0.3, 6.3, '#8f8a7c', { x: tx, y: ty + 3.75, z: tz });
  for (const lx of [-2, 0.2, 2.2]) parts.box(1.2, 1, 0.06, '#4f6f73', { x: tx + lx, y: ty + 2.2, z: tz + 3.01 });
  parts.box(0.06, 2.2, 1, '#6d5a45', { x: tx - 3.51, y: ty + 1.1, z: tz + 1 }); // door
  parts.box(2.6, 6, 2.6, '#e9e4d4', { x: tx, y: ty + 6.6, z: tz });
  parts.add(new THREE.CylinderGeometry(2.6, 2.2, 0.5, 8), '#e9e4d4', { x: tx, y: ty + 9.8, z: tz });
  parts.add(new THREE.CylinderGeometry(2.5, 2.5, 2, 8), '#4f6f73', { x: tx, y: ty + 11, z: tz });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    parts.box(0.12, 2, 0.12, '#e9e4d4', { x: tx + Math.sin(a) * 2.45, y: ty + 11, z: tz + Math.cos(a) * 2.45 });
  }
  parts.add(new THREE.CylinderGeometry(2.9, 2.9, 0.3, 8), '#c8432f', { x: tx, y: ty + 12.15, z: tz });
  parts.add(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), '#5d5f5a', { x: tx, y: ty + 12.9, z: tz });
  obstacles.push({ x: tx, z: tz, radius: 4.4 });

  // Edge lights along the runway, green at its ends.
  const lit = new THREE.MeshLambertMaterial({ color: '#f4f1df', emissive: '#fff2c0', emissiveIntensity: 0.1 });
  const green = new THREE.MeshLambertMaterial({ color: '#cdeccf', emissive: '#7dff9a', emissiveIntensity: 0.1 });
  const lamp = new THREE.CylinderGeometry(0.12, 0.16, 0.35, 6);
  const edge = [];
  for (let z = z0 + 10; z < z1 - 4; z += 18) for (const side of [-1, 1]) edge.push([rx + side * (half + 0.8), z]);
  const ends = [];
  for (const z of [z0 - 0.8, z1 + 0.8]) for (let k = -3; k <= 3; k++) ends.push([rx + k * 2.2, z]);
  const dummy = new THREE.Object3D();
  const details = new THREE.Group();
  scene.add(details);
  for (const [list, material] of [
    [edge, lit],
    [ends, green],
  ]) {
    const mesh = new THREE.InstancedMesh(lamp, material, list.length);
    list.forEach(([lx, lz], i) => {
      dummy.position.set(lx, y + 0.17, lz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    details.add(mesh);
  }

  const windsock = buildWindsock(details, parts, obstacles, { x: rx - half - 6, z: 118 });
  scene.add(parts.mesh());
  const hangarMesh = shed.mesh();
  scene.add(hangarMesh);

  // The beacon on the tower: a green and white light that turns slowly after dark.
  const beacon = new THREE.Group();
  beacon.position.set(tx, ty + 13.6, tz);
  const beams = new PartsBuilder()
    .add(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 8), '#e0e3dc')
    .mesh({ castShadow: false });
  const glowGreen = new THREE.MeshLambertMaterial({ color: '#bfe8c4', emissive: '#6dff8e', emissiveIntensity: 0 });
  const glowWhite = new THREE.MeshLambertMaterial({ color: '#f6f3e6', emissive: '#fff6d6', emissiveIntensity: 0 });
  for (const [side, material] of [
    [-1, glowGreen],
    [1, glowWhite],
  ]) {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.4), material);
    lens.position.x = side * 0.3;
    beacon.add(lens);
  }
  beacon.add(beams);
  details.add(beacon);

  return {
    /** The hangar roof, which the camera must not pass through. */
    occluders: [hangarMesh],
    update(time, night, player) {
      details.visible = !player || Math.hypot(player.x - rx, player.z - (z0 + z1) / 2) < DETAIL_RANGE;
      if (!details.visible) return;
      windsock(time);
      lit.emissiveIntensity = green.emissiveIntensity = 0.1 + night * 1.4;
      beacon.rotation.y = time * 1.6;
      glowGreen.emissiveIntensity = glowWhite.emissiveIntensity = night * 2.2;
    },
  };
}
