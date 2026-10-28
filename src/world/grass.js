// Grass over the meadows, drawn by the graphics card around the camera. The ground near the
// camera is split into square tiles, and every tile in view is drawn from one shared set of
// blades, so it costs the same wherever the car is. Each blade finds its place in the shader:
// how high the ground is there, from the same triangles as the ground, so it stands on it;
// the ground's colour, which it takes on; and how grassy the ground is, from the ground's own
// colouring and a mask of the roads, tracks and yards, where none grows. It is shorter where
// the grass thins out, sways and ripples in the wind and lies down where a car has driven
// through it (see trample.js). Tiles near the camera have more blades, each bent in two;
// further off, fewer and wider ones. The extra blades shrink away before a tile changes over,
// so nothing pops.
//
// The blades are solid triangles rather than pictures of grass with see-through edges: the
// graphics chips in phones and tablets lose much of their speed over see-through edges.
import * as THREE from 'three';
import { createRandom } from '../core/math.js';
import { SWAY, detailMap } from './detail.js';
import { GRID, GRID_BANDS, heights } from './terrain.js';
import { TRAMPLE_PARS, trampleUniforms } from './trample.js';

/** Side of a tile, in metres. */
const TILE = 8;
/** Blades to a square metre near the camera, and the share of them that further off tiles keep. */
const DENSITY = 18;
const FAR_SHARE = 0.3;
/** Tiles with any part nearer than this have every blade; the grass ends at FAR. */
export const NEAR = 34;
export const FAR = 82;

/**
 * One tile's blades, each `segments` long, as a geometry: `position` is where a corner lies on
 * its blade (x across it from -1 to 1, y up it from 0 to 1) and `blade` the blade's place in the
 * tile, which way it faces and a number of its own from 0 to 1, plus 1 on the blades that only
 * the near tiles have.
 */
function tileGeometry(blades, segments, keep) {
  const corners = segments * 2 + 1;
  const position = new Float32Array(blades.length * corners * 3);
  const shape = new Float32Array(blades.length * corners * 4);
  const index = [];
  blades.forEach(({ x, z, angle, seed }, n) => {
    const first = n * corners;
    for (let k = 0; k < corners; k++) {
      const tip = k === corners - 1;
      const i = first + k;
      position.set([tip ? 0 : k % 2 ? 1 : -1, tip ? 1 : Math.floor(k / 2) / segments, 0], i * 3);
      shape.set([x, z, angle, seed + (n >= keep ? 1 : 0)], i * 4);
    }
    for (let s = 0; s < segments - 1; s++) {
      const [a, b, c, d] = [first + s * 2, first + s * 2 + 1, first + s * 2 + 2, first + s * 2 + 3];
      index.push(a, b, c, b, d, c);
    }
    const last = first + (segments - 1) * 2;
    index.push(last, last + 1, first + corners - 1);
  });
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('blade', new THREE.BufferAttribute(shape, 4));
  geometry.setIndex(index);
  return geometry;
}

const GRASS_PARS = /* glsl */ `
  uniform sampler2D grassHeights;
  uniform sampler2D grassGround;
  uniform sampler2D grassClear;
  uniform sampler2D groundDetail;
  uniform vec4 grassBands[ ${GRID_BANDS.length} ];
  uniform vec3 grassClearArea;
  uniform float swayTime;
  attribute vec2 tile;
  attribute vec4 blade;
  varying vec3 vGrassColor;
  varying float vGrassTip;

  // Where a point lies on the ground's grid along one axis, and the size of the cells there.
  vec2 grassGrid( float value ) {
    vec4 band = grassBands[ ${GRID_BANDS.length - 1} ];
    for ( int i = 0; i < ${GRID_BANDS.length - 1}; i++ ) {
      if ( value <= grassBands[ i ].y ) {
        band = grassBands[ i ];
        break;
      }
    }
    return vec2( clamp( band.z + ( value - band.x ) / band.w, 0.0, ${GRID}.0 - 1.0001 ), band.w );
  }
  ${TRAMPLE_PARS}
`;

const GRASS_VERTEX = /* glsl */ `
  vec2 root = tile + blade.xy;
  vec2 gridX = grassGrid( root.x );
  vec2 gridZ = grassGrid( root.y );
  vec2 cell = floor( vec2( gridX.x, gridZ.x ) );
  vec2 f = vec2( gridX.x, gridZ.x ) - cell;
  ivec2 at = ivec2( cell );
  float h00 = texelFetch( grassHeights, at, 0 ).r;
  float h10 = texelFetch( grassHeights, at + ivec2( 1, 0 ), 0 ).r;
  float h01 = texelFetch( grassHeights, at + ivec2( 0, 1 ), 0 ).r;
  float h11 = texelFetch( grassHeights, at + ivec2( 1, 1 ), 0 ).r;
  // The same split of each cell into two triangles as the ground's, so the blade stands on it.
  float groundY = f.x + f.y <= 1.0
    ? h00 + ( h10 - h00 ) * f.x + ( h01 - h00 ) * f.y
    : h11 + ( h01 - h11 ) * ( 1.0 - f.x ) + ( h10 - h11 ) * ( 1.0 - f.y );
  vec3 slope = normalize( vec3(
    -mix( h10 - h00, h11 - h01, f.y ) / gridX.y,
    1.0,
    -mix( h01 - h00, h11 - h10, f.x ) / gridZ.y
  ) );
  vec4 ground = texture2D( grassGround, ( vec2( gridX.x, gridZ.x ) + 0.5 ) / ${GRID}.0 );
  float cleared = texture2D( grassClear, ( root - grassClearArea.xy ) / grassClearArea.z ).r;
  float amount = ground.a * ( 1.0 - cleared );

  float seed = fract( blade.w );
  float extra = step( 1.0, blade.w );
  float dist = distance( root, cameraPosition.xz );
  // Towards the far tiles, the blades only the near ones have shrink away and the others widen.
  float thinning = smoothstep( ${NEAR - 13}.0, ${NEAR - 2}.0, dist );
  float thin = extra * thinning;
  float fade = 1.0 - smoothstep( ${FAR - 20}.0, ${FAR}.0, dist );
  // Taller in some patches than others, and shorter where the grass thins out.
  float patches = texture2D( groundDetail, root / 41.0 ).g;
  float height = ( 0.2 + 0.3 * fract( seed * 7.13 ) ) * mix( 0.55, 1.4, smoothstep( 0.3, 0.75, patches ) );
  height *= smoothstep( 0.08, 0.6, amount ) * fade * ( 1.0 - thin );
  float width = 0.05 * ( 1.0 + 1.1 * thinning * ( 1.0 - extra ) ) * ( 0.75 + 0.5 * fract( seed * 3.71 ) );
  width *= step( 0.02, height );

  float along = position.y;
  vec2 across = vec2( cos( blade.z ), sin( blade.z ) );
  // Each blade leans its own way and curves over towards its tip.
  float leanAngle = blade.z + 1.3 + fract( seed * 11.3 ) * 2.0;
  vec2 lean = vec2( cos( leanAngle ), sin( leanAngle ) ) * ( 0.15 + 0.3 * fract( seed * 5.9 ) );
  // Swaying out of step with its neighbours, with slow waves rolling across the meadow.
  float phase = swayTime * 1.4 + root.x * 0.31 + root.y * 0.23;
  float wave = sin( swayTime * 0.7 - dot( root, vec2( 0.09, 0.05 ) ) );
  lean += vec2( sin( phase ), cos( phase * 0.8 ) ) * 0.1 + vec2( 0.87, 0.48 ) * ( 0.12 + 0.1 * wave );
  vec3 rel = vec3(
    across.x * position.x * width * ( 1.0 - 0.6 * along ) + lean.x * height * along * along,
    height * along,
    across.y * position.x * width * ( 1.0 - 0.6 * along ) + lean.y * height * along * along
  );
  // Laid over where a car has driven through, or bent ahead of one pushing through.
  vec3 lay = trampled( vec3( root.x, groundY, root.y ), 0.7 );
  float fall = pow( lay.x, 0.8 ) * 1.4;
  rel.xz = rel.xz * ( 1.0 - 0.5 * fall / 1.4 ) + lay.yz * rel.y * sin( fall );
  rel.y *= cos( fall );
  vec3 grassPosition = vec3( root.x, groundY - 0.04, root.y ) + rel;

  // Lit much as the ground under it is, so a meadow reads as one surface; a little of each
  // blade's own facing gives it some sparkle.
  vec3 facing = vec3( -across.y, 0.0, across.x ) * ( fract( seed * 13.7 ) - 0.5 );
  vec3 grassNormal = normalize( slope + facing * 0.7 );

  // A little greener or more golden than the ground round it, here and there.
  float hue = fract( seed * 5.31 );
  vec3 tint = hue < 0.3 ? vec3( 0.9, 1.04, 0.84 ) : hue < 0.62 ? vec3( 1.1, 1.0, 0.8 ) : vec3( 1.0 );
  vGrassColor = ground.rgb * tint;
  vGrassTip = along;
`;

/** The grass's material: three's cheap Lambert lighting, with the blades placed as above. */
function grassMaterial(uniforms) {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, name: 'grass blades' });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, trampleUniforms(), { swayTime: SWAY.time, groundDetail: detailMap() });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GRASS_PARS}`)
      .replace('#include <beginnormal_vertex>', `${GRASS_VERTEX}\nvec3 objectNormal = grassNormal;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = grassPosition;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassColor;\nvarying float vGrassTip;')
      // Darker at the roots, where the light doesn't reach, than at the tips.
      .replace('#include <color_fragment>', 'diffuseColor.rgb = vGrassColor * ( 0.52 + 0.62 * vGrassTip );')
      // Both sides of a blade are lit alike, by its own normal rather than one turned away.
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal = normalize( vNormal );\nnonPerturbedNormal = normal;',
      );
  };
  return material;
}

/** A float texture of the ground's heights, one texel to a grid point. */
function heightTexture() {
  const texture = new THREE.DataTexture(heights, GRID, GRID, THREE.RedFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
}

/**
 * The grass. `ground` is the ground's colour at each grid point as an RGBA texture (with how
 * grassy it is in A, from 0 to 1) and `colors` its bytes; `clear` the mask of where nothing
 * grows, a texture covering the square `area` (x0, z0, size) with its bytes in `clearBytes`.
 */
export function createGrass({ ground, colors, clear, clearBytes, area }) {
  const random = createRandom(4423);
  const blades = Array.from({ length: DENSITY * TILE * TILE }, () => ({
    x: random() * TILE,
    z: random() * TILE,
    angle: random() * Math.PI * 2,
    seed: random() * 0.999,
  }));
  const keep = Math.round(blades.length * FAR_SHARE);
  const material = grassMaterial({
    grassHeights: { value: heightTexture() },
    grassGround: { value: ground },
    grassClear: { value: clear },
    grassBands: { value: GRID_BANDS.map(b => new THREE.Vector4(b.from, b.to, b.start, b.size)) },
    grassClearArea: { value: new THREE.Vector3(area.x0, area.z0, area.size) },
  });

  // Which tiles have any grass at all, and how high their middles are, so the camera's view can
  // be checked for each and tiles with none are never drawn.
  const across = Math.ceil(area.size / TILE);
  const grassy = new Uint8Array(across * across);
  const middles = new Float32Array(across * across);
  const clearSize = Math.sqrt(clearBytes.length);
  // The nearest grid line to every other metre across the area, and the mask's texel there.
  const STEP = 2;
  const spots = Math.floor(area.size / STEP) + 1;
  const gridLine = new Int32Array(spots);
  const texel = new Int32Array(spots);
  for (let k = 0; k < spots; k++) {
    const value = Math.min(area.x0 + k * STEP, area.x0 + area.size - 0.01);
    const band = GRID_BANDS.find(b => value <= b.to) ?? GRID_BANDS.at(-1);
    gridLine[k] = Math.round(Math.min(GRID - 1, Math.max(0, band.start + (value - band.from) / band.size)));
    texel[k] = Math.min(clearSize - 1, Math.floor(((value - area.x0) / area.size) * clearSize));
  }
  const per = TILE / STEP;
  for (let tz = 0; tz < across; tz++) {
    for (let tx = 0; tx < across; tx++) {
      let most = 0;
      for (let k = tz * per; k <= Math.min(spots - 1, (tz + 1) * per); k++) {
        for (let j = tx * per; j <= Math.min(spots - 1, (tx + 1) * per); j++) {
          const grass =
            colors[(gridLine[k] * GRID + gridLine[j]) * 4 + 3] * (255 - clearBytes[texel[k] * clearSize + texel[j]]);
          if (grass > most) most = grass;
        }
      }
      grassy[tz * across + tx] = most > 0.05 * 255 * 255 ? 1 : 0;
      const middle = Math.min(spots - 1, tz * per + per / 2);
      middles[tz * across + tx] = heights[gridLine[middle] * GRID + gridLine[Math.min(spots - 1, tx * per + per / 2)]];
    }
  }

  const reach = Math.ceil(FAR / TILE) + 1;
  const capacity = (reach * 2 + 1) ** 2;
  const lods = [tileGeometry(blades, 2, keep), tileGeometry(blades.slice(0, keep), 1, keep)].map(geometry => {
    const tiles = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    tiles.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('tile', tiles);
    geometry.instanceCount = 0;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'grass';
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    return mesh;
  });
  const group = new THREE.Group();
  group.name = 'grass';
  group.add(...lods);

  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const counts = [0, 0];

  return {
    group,
    getState: () => ({ near: lods[0].geometry.instanceCount, far: lods[1].geometry.instanceCount }),
    /** How grassy the ground is at (x, z), from 0 to 1, as the shader works it out. */
    amountAt(x, z) {
      const bands = GRID_BANDS;
      const grid = value => {
        const band = bands.find(b => value <= b.to) ?? bands.at(-1);
        return Math.min(GRID - 1.0001, Math.max(0, band.start + (value - band.from) / band.size));
      };
      const [gx, gz] = [grid(x), grid(z)];
      const [ix, iz] = [Math.floor(gx), Math.floor(gz)];
      const [u, v] = [gx - ix, gz - iz];
      const alpha = (i, j) => colors[((iz + j) * GRID + ix + i) * 4 + 3] / 255;
      const ground =
        (alpha(0, 0) * (1 - u) + alpha(1, 0) * u) * (1 - v) + (alpha(0, 1) * (1 - u) + alpha(1, 1) * u) * v;
      // The mask between its four nearest texels, as the graphics card filters it.
      const tx = ((x - area.x0) / area.size) * clearSize - 0.5;
      const tz = ((z - area.z0) / area.size) * clearSize - 0.5;
      const [cx, cz] = [Math.floor(tx), Math.floor(tz)];
      const [p, q] = [tx - cx, tz - cz];
      const mask = (i, j) => {
        const [mx, mz] = [Math.min(clearSize - 1, Math.max(0, cx + i)), Math.min(clearSize - 1, Math.max(0, cz + j))];
        return clearBytes[mz * clearSize + mx] / 255;
      };
      const cleared = (mask(0, 0) * (1 - p) + mask(1, 0) * p) * (1 - q) + (mask(0, 1) * (1 - p) + mask(1, 1) * p) * q;
      return ground * (1 - cleared);
    },
    /** Calls `visit(x, z, half)` for the middle of every tile with any grass, and half its side. */
    eachTile(visit) {
      for (let tz = 0; tz < across; tz++) {
        for (let tx = 0; tx < across; tx++) {
          if (grassy[tz * across + tx]) visit(area.x0 + (tx + 0.5) * TILE, area.z0 + (tz + 0.5) * TILE, TILE / 2);
        }
      }
    },
    /** Picks the tiles in view of `camera` and which of them are near. */
    update(camera) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(
        viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      const eye = camera.position;
      const cx = Math.floor((eye.x - area.x0) / TILE);
      const cz = Math.floor((eye.z - area.z0) / TILE);
      const arrays = lods.map(mesh => mesh.geometry.attributes.tile.array);
      counts[0] = counts[1] = 0;
      let changed = false;
      for (let tz = Math.max(0, cz - reach); tz <= Math.min(across - 1, cz + reach); tz++) {
        for (let tx = Math.max(0, cx - reach); tx <= Math.min(across - 1, cx + reach); tx++) {
          if (!grassy[tz * across + tx]) continue;
          const x0 = area.x0 + tx * TILE;
          const z0 = area.z0 + tz * TILE;
          const distance = Math.hypot(
            Math.max(0, x0 - eye.x, eye.x - x0 - TILE),
            Math.max(0, z0 - eye.z, eye.z - z0 - TILE),
          );
          if (distance > FAR) continue;
          sphere.center.set(x0 + TILE / 2, middles[tz * across + tx], z0 + TILE / 2);
          sphere.radius = TILE * 0.71 + 4;
          if (!frustum.intersectsSphere(sphere)) continue;
          const lod = distance < NEAR ? 0 : 1;
          const n = counts[lod]++;
          const array = arrays[lod];
          if (array[n * 2] !== x0 || array[n * 2 + 1] !== z0) {
            array[n * 2] = x0;
            array[n * 2 + 1] = z0;
            changed = true;
          }
        }
      }
      lods.forEach((mesh, lod) => {
        const geometry = mesh.geometry;
        if (geometry.instanceCount !== counts[lod]) changed = true;
        geometry.instanceCount = counts[lod];
        mesh.visible = counts[lod] > 0;
      });
      if (changed) {
        for (const [lod, mesh] of lods.entries()) {
          const tiles = mesh.geometry.attributes.tile;
          tiles.clearUpdateRanges();
          tiles.addUpdateRange(0, counts[lod] * 2);
          tiles.needsUpdate = true;
        }
      }
    },
  };
}
