// A natural arch of rock over the outer road, below the rocky hill: wide and high enough
// for the rescue helicopter to fly through. It is a half ring of rock, lumpy and banded,
// with its feet sunk into the ground on either side of the road and a flat top. A fin of
// the same rock runs out to it from the side of the hill, and the top of the fin is a rough
// causeway: the car can drive along it and out onto the top of the arch, high over the road,
// between rims of boulders that keep it from going over the edge.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, createRandom, fractalNoise, lerp, smoothstep } from '../../core/math.js';
import { ROCK_FIN, ROCK_GATE } from '../layout.js';
import { GATE_GROUND, GATE_TOP, finLevel, terrainHeight } from '../terrain.js';
import { vertexColorMaterial } from '../build.js';
import { boulderGeometry } from '../rocks.js';

const BANDS = ['#b9ad95', '#a99d86', '#c2b69c', '#9f947f'];
const TOP = new THREE.Color('#c9bea4');
/** How much thicker than round the opening the rock is along the road, so its top is wide enough to drive on. */
const DEPTH = 1.35;

/** Bands of paler and darker stone, as in sandstone, by height above the arch's ground. */
function band(y) {
  return BANDS[Math.floor((y - GATE_GROUND) / 1.6 + 40) % BANDS.length];
}

/** Paints each triangle by its height, darker underneath, and the level tops paler, like dusty rock. */
function paintRock(geometry, { level = Infinity } = {}) {
  const normal = geometry.attributes.normal;
  const corner = geometry.attributes.position;
  const colors = new Float32Array(corner.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < corner.count; i += 3) {
    const y = (corner.getY(i) + corner.getY(i + 1) + corner.getY(i + 2)) / 3;
    if (normal.getY(i) > 0.92 && y > level) color.copy(TOP).multiplyScalar(0.94 + ((i * 0.618) % 1) * 0.1);
    else color.set(band(y));
    if (normal.getY(i) < -0.3) color.multiplyScalar(0.8);
    for (let k = 0; k < 3; k++) color.toArray(colors, (i + k) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** The arch, in the world: its own X across the road, its feet on the ground and its top cut flat. */
function archGeometry() {
  const { x, z, dx, dz, span, height, thickness, crown } = ROCK_GATE;
  const radius = span / 2 + thickness;
  // A half ring standing on end in its own XY plane, then stretched up to the arch's height.
  let geometry = new THREE.TorusGeometry(radius, thickness, 8, 20, Math.PI);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const rise = height / (radius - thickness);
  for (let i = 0; i < position.count; i++) {
    const px = position.getX(i);
    const py = position.getY(i);
    const pz = position.getZ(i);
    // Knobs and hollows all over, and a little more bulk low down.
    const lump = (fractalNoise(px / 5 + 3.1, py / 5 + pz / 7, 2, 47) - 0.5) * 3.2;
    const scale = 1 + lump / thickness + Math.max(0, 1 - py / 10) * 0.25;
    const along = Math.hypot(px, py);
    const cx = (px / along) * radius;
    const cy = (py / along) * radius;
    // The top is worn flat a little below the fin's causeway, which lies over it.
    const y = Math.min((cy + (py - cy) * scale) * rise - 3, crown - 0.25);
    position.setXYZ(i, cx + (px - cx) * scale, y, pz * scale * DEPTH);
  }
  geometry = geometry.toNonIndexed();
  geometry.rotateY(Math.atan2(-dx, -dz));
  geometry.translate(x, GATE_GROUND, z);
  geometry.computeVertexNormals();
  return paintRock(geometry);
}

/** Height of the outside of the arch, without its lumps, `u` metres across the road from its middle. */
function archTop(u) {
  const { span, height, thickness } = ROCK_GATE;
  const radius = span / 2 + thickness;
  const outer = radius + thickness;
  const rise = height / (radius - thickness);
  return GATE_GROUND + rise * Math.sqrt(Math.max(0, outer * outer - u * u)) - 3;
}

/**
 * The fin: cross-sections along the causeway, each a level top with rounded shoulders and sides
 * that lean out as they go down into the ground. Near the arch it narrows to the arch's width
 * and stops at the arch's back instead of going down to the ground, leaving the opening clear.
 */
function finGeometry() {
  const { path, width, arch } = ROCK_FIN;
  const { x: gx, z: gz, dx, dz } = ROCK_GATE;
  const half = width / 2;
  // Across the cross-section: 0 and 1 are the bottoms of the two sides, the top in between.
  const profile = [
    [-1, 1],
    [-1, 0.72],
    [-1, 0.42],
    [-1, 0.16],
    [-0.97, 0.03],
    [-0.88, 0],
    [0, 0],
    [0.88, 0],
    [0.97, 0.03],
    [1, 0.16],
    [1, 0.42],
    [1, 0.72],
    [1, 1],
  ];
  const rows = [];
  for (let s = 0; s <= path.length + 0.01; s += 2) {
    const p = path.at(Math.min(s, path.length));
    const top = finLevel(p.s);
    // How far across the road from the arch's middle this is (positive on the hill's side).
    const u = (p.x - gx) * dz - (p.z - gz) * dx;
    const overArch = smoothstep(p.s, arch - 16, arch - 3);
    // Out on the arch the sides only go down into its back; before it, into the ground.
    const ground = terrainHeight(p.x, p.z);
    const bottom = lerp(ground - 1.2, Math.max(ground - 1.2, Math.min(archTop(u) - 2.6, top - 1.6)), overArch);
    const flare = 0.42 * (1 - overArch);
    rows.push(
      profile.map(([across, down], k) => {
        const depth = (top - bottom) * down;
        const side = across * (half + depth * flare);
        // Lumps and ledges on the sides; the causeway itself stays smooth to drive on.
        const rough =
          down > 0.1
            ? (fractalNoise(p.s / 5 + k * 1.3, down * 4 + across, 3, 91) - 0.5) * (1.2 + 3 * down) * Math.sqrt(down)
            : 0;
        // Ledges: each row's points sit a little higher or lower, so the faces don't line up.
        const ledge = down > 0.1 && down < 1 ? (fractalNoise(p.s / 3 + 7.7, k * 2.1, 2, 93) - 0.5) * 1.6 : 0;
        const out = side + Math.sign(across) * rough;
        return [p.x - p.dz * out, top - depth + ledge, p.z + p.dx * out];
      }),
    );
  }
  const positions = [];
  const quad = (a, b, c, d) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i + 1 < rows.length; i++) {
    for (let k = 0; k + 1 < profile.length; k++) quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
  }
  // The far end, out on the arch, closed off down to the arch.
  const last = rows.at(-1);
  for (let k = 1; k + 1 < profile.length; k++) positions.push(...last[0], ...last[k + 1], ...last[k]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return paintRock(geometry, { level: GATE_GROUND + 6 });
}

/**
 * Boulders along both edges of the causeway, where the fin stands high enough to fall from, and
 * across its far end out on the arch; and the obstacles that go with them, which only something
 * up on the causeway bumps into.
 */
function rims(obstacles) {
  const { path, width } = ROCK_FIN;
  const random = createRandom(5813);
  const shapes = [0, 1, 2, 3].map(seed => boulderGeometry(seed + 21, { moss: 0.1 }));
  const parts = [];
  const boulder = (x, z, y, size) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y - size * 0.15, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * 6.3, 0)),
      new THREE.Vector3(size, size * 0.8, size),
    );
    parts.push(shapes[Math.floor(random() * shapes.length)].clone().applyMatrix4(matrix));
  };
  const edge = width / 2 - 0.55;
  const high = s => {
    const p = path.at(s);
    return finLevel(s) - terrainHeight(p.x, p.z) > 1.4;
  };
  const start = path.samples.find(p => high(p.s))?.s ?? 0;
  for (const side of [-1, 1]) {
    let previous = null;
    for (let s = start; s <= path.length; s += 1.7 + random() * 0.8) {
      const p = path.offset(s, side * (edge + random() * 0.15));
      boulder(p.x, p.z, finLevel(s), 0.42 + random() * 0.3);
      if (previous) {
        obstacles.push({ ax: previous.x, az: previous.z, bx: p.x, bz: p.z, radius: 0.55, base: finLevel(s) - 1.2 });
      }
      previous = p;
    }
  }
  // Across the far end.
  const end = path.at(path.length);
  const across = [-1, 1].map(side => path.offset(path.length - 0.6, side * edge));
  for (let t = 0; t <= 1; t += 0.2) {
    boulder(lerp(across[0].x, across[1].x, t), lerp(across[0].z, across[1].z, t), GATE_TOP, 0.5 + random() * 0.25);
  }
  obstacles.push({
    ax: across[0].x,
    az: across[0].z,
    bx: across[1].x,
    bz: across[1].z,
    radius: 0.6,
    base: GATE_TOP - 1.2,
  });
  return { geometry: mergeGeometries(parts), end };
}

/**
 * What the car bumps into from the ground: the arch's feet and the fin's sides, up to the top of
 * the fin, so that once up on it the car drives over them.
 */
function footings(obstacles) {
  const { x, z, dx, dz, span, thickness } = ROCK_GATE;
  const reach = span / 2 + thickness;
  for (const side of [-1, 1]) {
    obstacles.push({ x: x - dz * side * reach, z: z + dx * side * reach, radius: thickness + 0.8, top: GATE_TOP });
  }
  const { path, width, arch } = ROCK_FIN;
  for (let s = 0; s + 4 <= arch - 8; s += 4) {
    const [a, b] = [path.at(s), path.at(s + 4)];
    const level = Math.min(finLevel(s), finLevel(s + 4));
    const tall = Math.min(level - terrainHeight(a.x, a.z), level - terrainHeight(b.x, b.z));
    if (tall < 0.8) continue;
    const spread = clamp(width / 2 + tall * 0.42 * 0.8, width / 2, 14);
    // Its reach overlaps the causeway either side, where the top may be a little lower.
    const top = Math.min(finLevel(s - spread), finLevel(s + 4 + spread)) - 1;
    obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: spread, top });
  }
}

export function buildRockGate(scene, obstacles) {
  const gate = new THREE.Mesh(archGeometry(), vertexColorMaterial);
  const fin = new THREE.Mesh(finGeometry(), vertexColorMaterial);
  const boulders = new THREE.Mesh(rims(obstacles).geometry, vertexColorMaterial);
  for (const mesh of [gate, fin, boulders]) {
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  footings(obstacles);
  return { occluders: [gate, fin] };
}
