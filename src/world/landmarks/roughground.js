// Rough ground on the side tracks: a corduroy of logs across a muddy patch, a garden of low rock
// slabs, a washed-out track with two deep ruts and a hump between them, a few tilted rock steps
// and a dry stony stream bed. Every log, slab and stone is set into the ground the tyres rest on
// (see placeBoulder), so the wheels and the springs ride over them, and the car slows to a crawl
// by itself. Each stretch is an entry in ROUGH_GROUND (layout.js); its `kind` is a builder below,
// so a new kind is one more function in KINDS, and a new stretch one more entry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom, smoothstep } from '../../core/math.js';
import { vertexColorMaterial } from '../build.js';
import { ROUGH_GROUND } from '../layout.js';
import { boulderGeometry, rockMaterial } from '../rocks.js';
import { ribbon } from '../scenery.js';
import { placeBoulder, terrainHeight } from '../terrain.js';

const BARKS = ['#6e4f35', '#7b5a3c', '#5f4630', '#84613f'];
/** The wood showing at the cut end of a log, a little different from log to log. */
const ENDS = ['#d3ab6c', '#c99d5c', '#dbb77d'];
const MUD = '#4d3b2a';
const GRAVEL = '#aa9f86';
/** How far a corner of the flat underside of a stone may stand above the ground. */
const UNDERSIDE = 0.08;
const EARTH = { rut: '#5f4d38', hump: '#8f7a58', verge: '#8c7a58' };

const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
const position = new THREE.Vector3();

/**
 * A log about 1 m long with its axis up Y, the ends cut square and bevelled, seven sided, with
 * the bark painted round it and the pale wood at its two ends.
 */
const logs = new Map();
function logGeometry(bark, end) {
  const key = `${bark}|${end}`;
  if (logs.has(key)) return logs.get(key);
  const bevel = 0.1;
  const profile = [
    [0, -0.5],
    [1 - bevel, -0.5],
    [1, -0.5 + bevel],
    [1, 0.5 - bevel],
    [1 - bevel, 0.5],
    [0, 0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(profile, 7);
  geometry.deleteAttribute('uv');
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const [barkColor, endColor] = [new THREE.Color(bark), new THREE.Color(end)];
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const color = Math.abs(geometry.attributes.position.getY(i)) > 0.5 - bevel / 2 ? endColor : barkColor;
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  logs.set(key, geometry);
  return geometry;
}

/** What one stretch is made of while it is laid out: the pieces to draw, in three kinds of material. */
class Stretch {
  constructor(entry) {
    this.entry = entry;
    this.random = createRandom(entry.seed);
    this.timbers = [];
    this.rocks = [];
    this.beds = [];
    this.ground = [];
    this.shapes = new Map();
  }

  /** The boulder shape `seed` with `moss` on it, made once. */
  shape(seed, moss = 0.15, detail = 1) {
    const key = `${seed}|${moss}|${detail}`;
    if (!this.shapes.has(key)) this.shapes.set(key, boulderGeometry(seed, { moss, detail }));
    return this.shapes.get(key);
  }

  /** Where the track is `along` metres from its start and `side` metres to its right, and which way it runs. */
  at(along, side = 0) {
    const { path } = this.entry;
    const here = path.at(along);
    const p = path.offset(along, side);
    return { x: p.x, z: p.z, dx: here.dx, dz: here.dz };
  }

  /**
   * Sets `geometry` down as a piece of the ground: scaled by `size` ({ x, y, z }), tipped by `tip`
   * ({ x, z } radians) and turned to face `yaw`, at (x, z), with its top `top` metres above the ground
   * there. It is drawn, and the tyres rest on it. Where the ground falls away under it, it is made
   * thicker, so that no corner of its flat underside is left standing in the air.
   */
  stone(geometry, { x, z, yaw = 0, size, tip = { x: 0, z: 0 }, top }) {
    quaternion.setFromEuler(euler.set(tip.x, yaw, tip.z, 'YXZ'));
    const corners = geometry.attributes.position;
    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = 0; i < corners.count; i++) {
      lowest = Math.min(lowest, corners.getY(i));
      highest = Math.max(highest, corners.getY(i));
    }
    const matrix = new THREE.Matrix4();
    let thick = size.y;
    for (let attempt = 0; attempt < 4; attempt++) {
      matrix.compose(position.set(x, terrainHeight(x, z), z), quaternion, scale.set(size.x, thick, size.z));
      // Lowered or raised until its highest point is where it should be above the ground.
      let high = -Infinity;
      for (let i = 0; i < corners.count; i++) {
        position.fromBufferAttribute(corners, i).applyMatrix4(matrix);
        high = Math.max(high, position.y);
      }
      matrix.elements[13] += terrainHeight(x, z) + top - high;
      // How high the underside stands over the ground at its highest corner.
      let gap = 0;
      for (let i = 0; i < corners.count; i++) {
        if (corners.getY(i) > lowest + 1e-4) continue;
        position.fromBufferAttribute(corners, i).applyMatrix4(matrix);
        gap = Math.max(gap, position.y - terrainHeight(position.x, position.z));
      }
      if (gap <= UNDERSIDE) break;
      thick += (gap - UNDERSIDE * 0.8) / (highest - lowest);
    }
    this.rocks.push(geometry.clone().applyMatrix4(matrix));
    placeBoulder(geometry, matrix.elements);
  }

  /**
   * Lays a log across the track at `along`, `length` long and `radius` thick, its two ends resting
   * on the ground `reach` metres out to either side, so it follows the lie of the land. Its top is `top`
   * metres above the ground at its middle. It is drawn, and the tyres rest on it.
   */
  log(along, { reach, radius, top, turn = 0, bark, end, side = 0 }) {
    const { random } = this;
    const a = this.at(along, side - reach);
    const b = this.at(along, side + reach);
    const [ya, yb] = [terrainHeight(a.x, a.z), terrainHeight(b.x, b.z)];
    const axis = new THREE.Vector3(b.x - a.x, yb - ya, b.z - a.z);
    const length = axis.length();
    axis.normalize();
    // A little turned from square across the track, about the up direction.
    axis.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
    const shape = logGeometry(
      bark ?? BARKS[Math.floor(random() * BARKS.length)],
      end ?? ENDS[Math.floor(random() * ENDS.length)],
    );
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const middle = this.at(along, side);
    const matrix = new THREE.Matrix4().compose(
      position.set(middle.x, 0, middle.z),
      quaternion,
      scale.set(radius, length * 1.05, radius),
    );
    // The thickness of the log under its axis, so the top is where it should be.
    let highest = -Infinity;
    const corners = shape.attributes.position;
    for (let i = 0; i < corners.count; i++) {
      position.fromBufferAttribute(corners, i).applyMatrix4(matrix);
      highest = Math.max(highest, position.y);
    }
    matrix.elements[13] += terrainHeight(middle.x, middle.z) + top - highest;
    this.timbers.push(shape.clone().applyMatrix4(matrix));
    placeBoulder(shape, matrix.elements);
  }
}

/**
 * A bed of bare earth over `across` metres either side of the track from `from` to `to`, `height(along,
 * side)` above the ground, in chunks a few metres long: each chunk is a bump of its own for the tyres to
 * rest on, drawn in the colours `color(along, side)` gives it. `reach(along, side)`, from 0 to 1, says how
 * much of the bed is there: where it is less, the bed sinks into the ground and so ends in a ragged edge.
 */
function earthwork(stretch, { from, to, across, step = 0.25, rowStep = 0.5, height, reach = () => 1, color }) {
  const chunk = 3;
  const tint = new THREE.Color();
  for (let start = from; start < to - 1e-6; start += chunk) {
    const end = Math.min(to, start + chunk);
    const rows = Math.max(1, Math.round((end - start) / rowStep));
    const columns = Math.round((2 * across) / step);
    const mid = stretch.at((start + end) / 2);
    const base = terrainHeight(mid.x, mid.z);
    const positions = [];
    const colors = [];
    for (let i = 0; i <= rows; i++) {
      const along = start + ((end - start) * i) / rows;
      for (let j = 0; j <= columns; j++) {
        const side = -across + (2 * across * j) / columns;
        const p = stretch.at(along, side);
        const sunk = 0.3 * (1 - reach(along, side));
        positions.push(p.x - mid.x, terrainHeight(p.x, p.z) + 0.03 + height(along, side) - sunk - base, p.z - mid.z);
        tint.set(color(along, side)).toArray(colors, colors.length);
      }
    }
    const indices = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < columns; j++) {
        const a = i * (columns + 1) + j;
        const b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    // Set down at the middle of its chunk, as a boulder is.
    const matrix = new THREE.Matrix4().makeTranslation(mid.x, base, mid.z);
    stretch.beds.push(geometry.clone().applyMatrix4(matrix));
    placeBoulder(geometry, matrix.elements);
  }
}

/** How far into a stretch, from 0 at either end to 1 where it is at its fullest, `ease` metres in. */
const fullness = ({ from, to }, along, ease) =>
  smoothstep(along, from, from + ease) * (1 - smoothstep(along, to - ease, to));

/** What each kind of rough ground is made of. */
export const KINDS = {
  /** Logs laid side by side across a patch of mud. */
  corduroy(stretch) {
    const { entry, random } = stretch;
    stretch.ground.push({ half: 2.7, color: MUD, from: entry.from - 1.5, to: entry.to + 1.5 });
    for (let along = entry.from + 0.8; along < entry.to - 0.5; along += 0.34) {
      const radius = 0.17 + random() * 0.06;
      // The first and last are half sunk, so the wheels climb on to the others.
      const top = radius * (0.8 + 0.8 * fullness(entry, along, 2));
      stretch.log(along, {
        reach: 2.1 + random() * 0.4,
        radius,
        top,
        turn: (random() - 0.5) * 0.14,
        side: (random() - 0.5) * 0.3,
      });
    }
  },

  /** Low, flat slabs scattered over the track, a few on each line the wheels run in. */
  garden(stretch) {
    const { entry, random } = stretch;
    const slab = (along, side, big) => {
      const { x, z, dx, dz } = stretch.at(along, side);
      const wide = (big ? 0.55 : 0.35) + random() * 0.25;
      stretch.stone(stretch.shape(Math.floor(random() * 4) + 41), {
        x,
        z,
        yaw: Math.atan2(-dx, -dz) + (random() - 0.5) * 1.8,
        size: { x: wide, y: 0.16 + random() * 0.05, z: wide * (0.7 + random() * 0.3) },
        tip: { x: (random() - 0.5) * 0.12, z: (random() - 0.5) * 0.12 },
        top: (0.2 + random() * 0.14) * (0.5 + 0.5 * fullness(entry, along, 3)),
      });
    };
    // A slab for each wheel about every three metres, one wheel a little ahead of the other.
    for (let along = entry.from + 1.5, k = 0; along < entry.to - 1; along += 1.5, k++) {
      slab(along, (k % 2 ? -1 : 1) * (1 + (random() - 0.5) * 0.5), true);
      slab(along + 0.75, (k % 2 ? 1 : -1) * (1 + (random() - 0.5) * 0.5), true);
    }
    // And smaller ones between and beside.
    for (let k = 0; k < 8; k++) {
      slab(entry.from + 1 + random() * (entry.to - entry.from - 2), (random() - 0.5) * 4.4, false);
    }
  },

  /**
   * A washed-out track, dug out of the ground (see terrain.js): a hump along the middle about as high
   * as the ground was, and a deep rut for each wheel below it, with stones lying in the ruts. The bed
   * is drawn on the dug ground, from the same dig, so it comes up to the old level and no higher.
   */
  washout(stretch) {
    const { entry, random } = stretch;
    const ruts = 1.08;
    const bed = { from: entry.from - 3, to: entry.to + 3 };
    const height = (along, side) => {
      const across = Math.abs(side);
      const rut = Math.max(0, 1 - ((across - ruts) / 0.55) ** 2);
      const dug = entry.dig(along, side);
      const bare = Math.max(0, dug - 0.08 - 0.4 * rut * rut * smoothstep(dug, 0.1, 0.4));
      // The floor of a rut stays above the track's faint wheel marks drawn on the ground.
      return dug > 0.05 ? Math.max(bare, 0.08) : bare;
    };
    earthwork(stretch, {
      ...bed,
      across: 3.7,
      height,
      reach: entry.shape,
      color: (along, side) => {
        const across = Math.abs(side);
        const base = new THREE.Color(across < 0.6 ? EARTH.hump : across < 1.9 ? EARTH.rut : EARTH.verge);
        // Mottled, a patch of each, so the bed isn't flat colour.
        return base.multiplyScalar(0.92 + 0.16 * Math.abs(Math.sin(along * 2.3 + side * 3.1)));
      },
    });
    // Stones lying in the ruts, close enough that a wheel is always on one.
    const small = stretch.shape(51, 0.05, 0);
    for (let along = entry.from + 1; along < entry.to - 1; along += 1.3) {
      for (const side of [-ruts, ruts]) {
        const at = along + random() * 0.8;
        const { x, z, dx, dz } = stretch.at(at, side + (random() - 0.5) * 0.3);
        const size = 0.32 + random() * 0.16;
        stretch.stone(small, {
          x,
          z,
          yaw: Math.atan2(-dx, -dz) + random() * 3,
          size: { x: size, y: size * 0.7, z: size },
          top: 0.26 + random() * 0.1,
        });
      }
    }
  },

  /** Across the track a few ledges of tilted slab, one half for each wheel, tipped opposite ways. */
  steps(stretch) {
    const { entry, random } = stretch;
    const count = 4;
    for (let k = 0; k < count; k++) {
      const along = entry.from + 2 + ((entry.to - entry.from - 4) * k) / (count - 1);
      for (const side of [-1, 1]) {
        const { x, z, dx, dz } = stretch.at(along + (random() - 0.5) * 0.6, side * 0.95);
        stretch.stone(stretch.shape(Math.floor(random() * 4) + 61, 0.1), {
          x,
          z,
          yaw: Math.atan2(-dx, -dz) + (random() - 0.5) * 0.3,
          size: { x: 1.3 + random() * 0.2, y: 0.24, z: 0.7 + random() * 0.15 },
          // Tipped across the track, the two halves of a ledge leaning different ways, and along it a little.
          tip: { x: (random() - 0.5) * 0.14, z: side * (0.1 + random() * 0.06) },
          top: 0.32 + random() * 0.1,
        });
      }
    }
  },

  /** A dry stream bed winding across the track, dug a little below the ground, with rounded stones lying in it. */
  streambed(stretch) {
    const { entry, random } = stretch;
    const reach = entry.shape;
    const earth = new THREE.Color(EARTH.verge);
    earthwork(stretch, {
      from: entry.from - 1,
      to: entry.to + 1,
      across: entry.half,
      step: 0.8,
      rowStep: 0.75,
      height: () => 0,
      reach,
      // Gravel in the middle of the bed, blending into the earth at its edges.
      color: (along, side) =>
        new THREE.Color(GRAVEL)
          .multiplyScalar(0.9 + 0.2 * Math.abs(Math.sin(along * 1.7 + side * 2.3)))
          .lerp(earth, 1 - smoothstep(reach(along, side), 0.2, 0.8)),
    });
    const stone = (along, side) => {
      if (reach(along, side) < 0.8) return;
      const { x, z } = stretch.at(along, side);
      const size = 0.2 + random() * 0.18;
      stretch.stone(stretch.shape(Math.floor(random() * 4) + 71, 0.05), {
        x,
        z,
        yaw: random() * 6.3,
        size: { x: size * (1 + random() * 0.3), y: size * 0.75, z: size },
        top: 0.2 + random() * 0.18,
      });
    };
    // Along each line the wheels run in, and scattered over the rest of the bed.
    for (let along = entry.from + 1; along < entry.to - 1; along += 0.9) {
      stone(along + random() * 0.6, -1.08 + (random() - 0.5) * 0.6);
      stone(along + 0.45 + random() * 0.6, 1.08 + (random() - 0.5) * 0.6);
    }
    for (let k = 0; k < 40; k++) {
      stone(entry.from + random() * (entry.to - entry.from), (random() - 0.5) * 2 * (entry.half - 0.5));
    }
  },
};

/** Builds all the rough ground. Nothing here is solid: it is all ground to drive over. */
export function buildRoughGround(scene) {
  for (const entry of ROUGH_GROUND) {
    const stretch = new Stretch(entry);
    KINDS[entry.kind](stretch);
    const group = new THREE.Group();
    group.name = entry.id;
    for (const { half, color, from, to } of stretch.ground) {
      group.add(ribbon(entry.path, half, color, { lift: 0.04, skip: s => s < from || s > to }));
    }
    for (const [geometries, material, shadows] of [
      [stretch.timbers, vertexColorMaterial, true],
      [stretch.beds, vertexColorMaterial, false],
      [stretch.rocks, rockMaterial, true],
    ]) {
      if (!geometries.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.geometry.computeBoundingSphere();
      group.add(mesh);
    }
    scene.add(group);
  }
}
