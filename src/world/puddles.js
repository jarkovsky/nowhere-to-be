// The puddles the rain leaves. A few dozen places along the tracks, where the ground dips
// across a few metres, are picked once, with a random of their own. As the ground gets wet each
// fills in at its own wetness, a flat dark disc that mirrors the sky, and as it dries they shrink
// and go, the shallowest first. All of them are one instanced mesh.
import * as THREE from 'three';
import { createRandom, smoothstep } from '../core/math.js';
import { TRACKS, surfaceAt, winterness } from './layout.js';
import { reflectSky } from './reflection.js';
import { onDeck, snowCover, terrainHeight, waterDepth } from './terrain.js';

/** Most puddles there are, the least a hollow must dip (m), and the closest two may be (m). */
const MOST = 40;
const SHALLOWEST = 0.03;
const APART = 24;
/** Most along one track, so they are spread about. */
const PER_TRACK = 4;
/** How far each is from the ground's lie, and how far above it the disc is drawn (m). */
const LIFT = 0.12;

/** How far the ground round (x, z), 4 m out, lies above it: how deep a hollow it is in. */
function dip(x, z) {
  let ring = 0;
  for (let k = 0; k < 8; k++) {
    const angle = (k * Math.PI) / 4;
    ring += terrainHeight(x + Math.cos(angle) * 4, z + Math.sin(angle) * 4) / 8;
  }
  return ring - terrainHeight(x, z);
}

/** How uneven the ground is within 1.6 m of (x, z): a disc is only laid where it is level enough. */
function unevenness(x, z) {
  const heights = [0, 1, 2, 3].map(k => terrainHeight(x + Math.cos(k * 1.5708) * 1.6, z + Math.sin(k * 1.5708) * 1.6));
  return Math.max(...heights) - Math.min(...heights);
}

/**
 * The places puddles fill: { x, z, r, angle, need }, where `r` is the half-width (m), `angle`
 * the way the puddle is stretched, and `need` the wetness at which it starts to fill. The
 * deepest hollows fill first.
 */
export function puddleSpots() {
  const random = createRandom(2087);
  const candidates = [];
  for (const track of TRACKS) {
    const { path } = track;
    for (let s = 8; s < path.length - 8; s += 3) {
      const at = path.at(s);
      const [x, z] = [at.x, at.z];
      const depth = dip(x, z);
      if (depth < SHALLOWEST || unevenness(x, z) > 0.22) continue;
      if (waterDepth(x, z) > 0 || onDeck(x, z) || surfaceAt(x, z) !== 'grass') continue;
      if (snowCover(x, z) > 0.1 || winterness(x, z) > 0.1) continue;
      candidates.push({
        x,
        z,
        ruts: !!track.ruts,
        depth: depth + random() * 0.05,
        track: track.id,
        angle: Math.atan2(at.dx, at.dz),
      });
    }
  }
  candidates.sort((a, b) => b.depth - a.depth);
  const chosen = [];
  const perTrack = {};
  for (const spot of candidates) {
    if (chosen.length >= MOST) break;
    if ((perTrack[spot.track] ?? 0) >= PER_TRACK) continue;
    if (chosen.some(other => Math.hypot(other.x - spot.x, other.z - spot.z) < APART)) continue;
    perTrack[spot.track] = (perTrack[spot.track] ?? 0) + 1;
    chosen.push(spot);
  }
  // The deepest fill at the lowest wetness and the shallowest need the ground well soaked.
  return chosen.map((spot, rank) => ({
    x: spot.x,
    z: spot.z,
    ruts: spot.ruts,
    r: 0.9 + random() * 0.7,
    angle: spot.angle + (random() - 0.5) * 0.3,
    need: 0.1 + (rank / Math.max(1, chosen.length - 1)) * 0.5,
  }));
}

/** How much of its full size a puddle is at `wetness`: it grows over the 0.3 of wetness after it starts. */
export const puddleSize = (spot, wetness) => smoothstep(wetness, spot.need, spot.need + 0.3);

/** How far from the middle of a track its wheel ruts lie, and how wide a rut's puddle is (half-width, m). */
const RUT = 0.85;
const RUT_HALF_WIDTH = 0.3;
/** A puddle is this many times as long as `r` (half-length, m). */
const LENGTH = 1.9;
const WATER = [0.2, 0.22, 0.22];
const MUD = [0.36, 0.29, 0.21];

/**
 * One long, narrow puddle with an uneven outline, 1 m across and 2 m long, made of three
 * rings round its middle: the water, a rim where the water turns to mud, and a soft fringe of
 * mud that fades into the ground. `mirror` is 1 on the water and fades to 0 on the rim, so only
 * the water shows the sky. It is a unit shape, scaled for each puddle.
 */
export function puddleGeometry() {
  const SIDES = 28;
  const positions = [0, 0, 0];
  const colors = [...WATER, 1];
  const mirror = [1];
  const rings = [
    { scale: 0.72, color: WATER, alpha: 1, mirror: 1 },
    { scale: 1, color: MUD, alpha: 0.95, mirror: 0 },
    { scale: 1.35, color: MUD, alpha: 0, mirror: 0 },
  ];
  for (const ring of rings) {
    for (let side = 0; side < SIDES; side++) {
      const angle = (side / SIDES) * Math.PI * 2;
      // The width swells and pinches along the length, like a string of overlapping blobs, and the rim is uneven.
      const along = Math.cos(angle);
      const swell = 0.62 + 0.38 * Math.sin(along * 4.1 + 1.3) ** 2;
      const ragged = 1 + 0.14 * Math.sin(angle * 5 + 0.7) + 0.1 * Math.sin(angle * 9 + 2.1);
      const x = Math.sin(angle) * RUT_HALF_WIDTH * 1.4 * swell * ragged * ring.scale;
      const z = along * 0.5 * (1 + 0.08 * Math.sin(angle * 3 + 1.9)) * ring.scale * 2;
      positions.push(x, 0, z);
      colors.push(...ring.color, ring.alpha);
      mirror.push(ring.mirror);
    }
  }
  const indices = [];
  for (let side = 0; side < SIDES; side++) {
    const next = (side + 1) % SIDES;
    indices.push(0, 1 + side, 1 + next);
    for (let ring = 0; ring < 2; ring++) {
      const [a, b] = [1 + ring * SIDES + side, 1 + ring * SIDES + next];
      const [c, d] = [a + SIDES, b + SIDES];
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      positions.map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute('mirror', new THREE.Float32BufferAttribute(mirror, 1));
  geometry.setIndex(indices);
  return geometry;
}

/** Where a spot's puddles lie: one in each rut of a track that has ruts, otherwise one wide one in the middle. */
const lanes = spot => (spot.ruts ? [-RUT, RUT] : [0]);

export function createPuddles(scene) {
  const spots = puddleSpots();
  // Each puddle: where it is (the middle of its track, and how far to the side), and how high.
  const puddles = spots.flatMap((spot, index) =>
    lanes(spot).map(side => {
      const x = spot.x - Math.cos(spot.angle) * side;
      const z = spot.z + Math.sin(spot.angle) * side;
      return { spot, index, x, z, y: terrainHeight(x, z) + LIFT, width: spot.ruts ? 1 : 2.4 };
    }),
  );
  const material = reflectSky(
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    }),
    { strength: 0.8, saturation: 0.3, dark: 0.7, band: 0, mask: true },
  );
  const mesh = new THREE.InstancedMesh(puddleGeometry(), material, Math.max(1, puddles.length));
  mesh.name = 'rain puddles';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);
  const sizes = spots.map(() => 0);
  const dummy = new THREE.Object3D();
  let drawn = -1;

  return {
    spots,
    /** How big the puddle at (x, z) is, from 0 to 1, or 0 where there isn't one. */
    at(x, z) {
      for (const puddle of puddles) {
        const size = sizes[puddle.index];
        if (size < 0.3) continue;
        const { spot } = puddle;
        const [dx, dz] = [x - puddle.x, z - puddle.z];
        const along = dx * Math.sin(spot.angle) + dz * Math.cos(spot.angle);
        const across = dx * Math.cos(spot.angle) - dz * Math.sin(spot.angle);
        const half = RUT_HALF_WIDTH * puddle.width * size;
        if ((along / (LENGTH * spot.r * size)) ** 2 + (across / half) ** 2 < 1) return size;
      }
      return 0;
    },
    getState: () => ({ count: spots.length, filled: sizes.filter(size => size > 0.05).length }),
    /** Grows or shrinks the puddles to suit `wetness`; it does nothing while the wetness hasn't changed. */
    update(wetness) {
      if (Math.abs(wetness - drawn) < 0.004) return;
      drawn = wetness;
      spots.forEach((spot, i) => (sizes[i] = puddleSize(spot, wetness)));
      let count = 0;
      for (const puddle of puddles) {
        const size = sizes[puddle.index];
        if (size < 0.02) continue;
        dummy.position.set(puddle.x, puddle.y, puddle.z);
        dummy.rotation.set(0, puddle.spot.angle, 0);
        dummy.scale.set(puddle.width * size, 1, LENGTH * puddle.spot.r * size);
        dummy.updateMatrix();
        mesh.setMatrixAt(count++, dummy.matrix);
      }
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
