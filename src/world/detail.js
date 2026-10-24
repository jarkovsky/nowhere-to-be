// Fine detail drawn over the ground in its shader, so it doesn't look like it was painted
// with a roller: blotches and grain in the grass, drier patches, streaks where the wind
// combs it, and bands in the rock on steep slopes. It all comes from one small tiling noise
// texture made here, sampled in world space at a few different sizes.
import * as THREE from 'three';
import { createRandom } from '../core/math.js';
import { TRAMPLE_PARS, trampleUniforms } from './trample.js';

const SIZE = 128;

/** Value noise on a lattice `cells` wide that wraps at the texture's edges, at pixel (x, y). */
function tilingNoise(lattice, cellsX, cellsY, x, y) {
  const fx = (x / SIZE) * cellsX;
  const fy = (y / SIZE) * cellsY;
  const [ix, iy] = [Math.floor(fx), Math.floor(fy)];
  const [tx, ty] = [fx - ix, fy - iy];
  const at = (i, j) => lattice[((j % cellsY) * cellsX + (i % cellsX)) % lattice.length];
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
  const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
  return top + (bottom - top) * sy;
}

/**
 * Four kinds of noise, one in each channel: R soft blotches, G a second, unrelated set of
 * blotches, B streaks stretched along X, A fine grain. Every one tiles.
 */
function detailTexture() {
  const random = createRandom(7203);
  const lattice = Float32Array.from({ length: 64 * 64 }, () => random());
  const octaves = (x, y, cells, stretch = 1, offset = 0) => {
    let value = 0;
    let weight = 0.5;
    for (let k = 0; k < 3; k++) {
      const c = cells << k;
      value += weight * tilingNoise(lattice, Math.max(1, c / stretch), c, x + offset, y + offset * 3);
      weight *= 0.5;
    }
    return value / 0.875;
  };
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      data[i] = octaves(x, y, 4) * 255;
      data[i + 1] = octaves(x, y, 4, 1, 37) * 255;
      data[i + 2] = octaves(x, y, 16, 8, 11) * 255;
      data[i + 3] = octaves(x, y, 16, 1, 71) * 255;
    }
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const materials = new Map();
let detail = null;

/** The detail texture, as a uniform to share with other shaders. */
export function detailMap() {
  detail ??= { value: detailTexture() };
  return detail;
}

/** Shared by everything that sways in the wind: the time. */
export const SWAY = { time: { value: 0 } };

/**
 * The ground's material: smooth-shaded, coloured by its vertices, with the detail drawn on
 * top. The trails and roads laid over the ground use it too, with `options` to keep them in
 * front of it.
 */
export function groundMaterial(options = {}) {
  const key = JSON.stringify(options);
  if (materials.has(key)) return materials.get(key);
  detail ??= { value: detailTexture() };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, name: 'ground', ...options });
  materials.set(key, material);
  material.onBeforeCompile = shader => {
    shader.uniforms.groundDetail = detail;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;\nvarying vec3 vGroundNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = position;\nvGroundNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D groundDetail;\nvarying vec3 vGround;\nvarying vec3 vGroundNormal;',
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GROUND_DETAIL}`);
  };
  return material;
}

const GROUND_DETAIL = /* glsl */ `
  {
    vec2 p = vGround.xz;
    float up = normalize( vGroundNormal ).y;
    // Fine grain only up close, where it can be made out.
    float near = 1.0 - smoothstep( 60.0, 260.0, distance( vGround, cameraPosition ) );
    float blotch = texture2D( groundDetail, p / 53.0 ).r;
    float patches = texture2D( groundDetail, p / 190.0 + 0.31 ).g;
    float grain = texture2D( groundDetail, p / 9.0 ).a;
    // Streaks in the grass, combed one way by the wind.
    vec2 combed = vec2( p.x * 0.8 + p.y * 0.6, p.y * 0.8 - p.x * 0.6 );
    float streak = texture2D( groundDetail, combed / vec2( 31.0, 5.0 ) ).b;
    // Green is grass: it gets drier patches. Grey rock and white snow don't.
    float grassy = smoothstep( 0.02, 0.09, diffuseColor.g - diffuseColor.b ) * smoothstep( 0.7, 0.88, up );
    vec3 dry = diffuseColor.rgb * vec3( 1.13, 1.03, 0.78 );
    diffuseColor.rgb = mix( diffuseColor.rgb, dry, smoothstep( 0.5, 0.72, patches ) * 0.75 * grassy );
    float shade = ( blotch - 0.5 ) * 0.3 + ( grain - 0.5 ) * 0.3 * near + ( streak - 0.5 ) * 0.2 * grassy * near;
    // Bands in the rock where the ground is steep, roughly level like layers of stone.
    float steep = 1.0 - smoothstep( 0.6, 0.84, up );
    float band = texture2D( groundDetail, vec2( ( p.x - p.y ) / 47.0, vGround.y / 5.0 ) ).g;
    shade += steep * ( band - 0.5 ) * 0.45;
    // Far away, larger blotches, and streaks running down the steep slopes like gullies and
    // scree, so the distant hills and mountains have some grain too.
    float far = smoothstep( 150.0, 600.0, distance( vGround, cameraPosition ) );
    float blotchFar = texture2D( groundDetail, p / 470.0 + 0.17 ).r;
    float gullies = texture2D( groundDetail, vec2( ( p.x - p.y ) / 240.0, vGround.y / 900.0 ) ).r;
    shade += far * ( ( blotchFar - 0.5 ) * 0.3 + steep * ( gullies - 0.5 ) * 0.45 );
    // Snow keeps most of its brightness.
    float snowy = smoothstep( 0.72, 0.88, min( diffuseColor.r, diffuseColor.b ) );
    diffuseColor.rgb *= 1.0 + shade * ( 1.0 - 0.7 * snowy );
  }
`;

/**
 * The material for scattered trees (`kind` 'trees') or grass ('grass'): coloured by its
 * vertices, and by each one's own tint where the geometry's `tinted` attribute is 1 (the
 * leaves, but not the trunks), swaying in the wind, and with some grain in the leaves.
 * Grass also lies down where a car has driven through it and bends ahead of one pushing
 * through it (see trample.js), and grows out of the ground as it comes within `range` of the
 * camera, so it doesn't appear all at once. Only for instanced meshes that are never moved, so
 * the position after the instance's matrix is in the world.
 *
 * The stalks of a crop pass `crop`, uniforms of their own: each stands while `cropCut` is
 * between the first two of its `cropSpan` and, once the cut passes the last, is carried
 * `cropSpan.z` times as far as it has gone on along `cropAxis` (see `nearStalks` in fields.js).
 */
export function foliageMaterial(kind, range = 0, crop = null) {
  const key = `foliage|${kind}|${range}`;
  if (!crop && materials.has(key)) return materials.get(key);
  detail ??= { value: detailTexture() };
  const grass = kind === 'grass';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !grass, name: kind });
  material.defines = { [grass ? 'SWAY_GRASS' : 'SWAY_TREES']: '' };
  if (range) material.defines.GRASS_RANGE = range.toFixed(1);
  if (crop) material.defines.CROP_SPAN = '';
  else materials.set(key, material);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, crop, trampleUniforms(), { groundDetail: detail, swayTime: SWAY.time });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SWAY_PARS}\n${TRAMPLE_PARS}`)
      .replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz *= mix( vec3( 1.0 ), instanceColor.xyz, tinted );')
      .replace('#include <project_vertex>', SWAY_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D groundDetail;\nvarying vec3 vFoliage;\nvarying float vFoliageHeight;',
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FOLIAGE_DETAIL}`);
  };
  return material;
}

const SWAY_PARS = /* glsl */ `
  uniform float swayTime;
  attribute float tinted;
  varying vec3 vFoliage;
  varying float vFoliageHeight;
  #ifdef CROP_SPAN
    uniform float cropCut;
    uniform vec2 cropAxis;
    attribute vec4 cropSpan;
  #endif
`;

const SWAY_VERTEX = /* glsl */ `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    vec3 root = instanceMatrix[ 3 ].xyz;
    #ifdef GRASS_RANGE
      mvPosition.xyz *= 1.0 - smoothstep( GRASS_RANGE * 0.72, GRASS_RANGE * 0.97, distance( root.xz, cameraPosition.xz ) );
    #endif
    #ifdef CROP_SPAN
      mvPosition.xyz *= step( cropSpan.x, cropCut ) * step( cropCut, cropSpan.y );
      vec2 carried = cropAxis * cropSpan.z * max( cropCut - cropSpan.w, 0.0 );
    #else
      vec2 carried = vec2( 0.0 );
    #endif
    mvPosition = instanceMatrix * mvPosition;
    mvPosition.xz += carried;
    root.xz += carried;
  #else
    vec3 root = vec3( 0.0 );
  #endif
  // Each one sways a little out of step with its neighbours.
  float phase = swayTime * 1.1 + root.x * 0.21 + root.z * 0.17;
  #ifdef SWAY_TREES
    mvPosition.xz += vec2( sin( phase ), cos( phase * 0.8 ) ) * position.y * position.y * 0.0012;
  #else
    mvPosition.xz += vec2( sin( phase * 1.7 ), cos( phase * 1.3 ) ) * position.y * 0.06;
    // Laid over where a car has driven through, or bent ahead of one pushing through: every
    // blade goes over from its root the way the stalks there lie, whichever way it leant before.
    vec3 lay = trampled( root );
    float fall = pow( lay.x, 0.8 ) * 1.45;
    vec3 rel = mvPosition.xyz - root;
    rel.xz = rel.xz * ( 1.0 - 0.5 * fall / 1.45 ) + lay.yz * rel.y * sin( fall );
    rel.y *= cos( fall );
    mvPosition.xyz = root + rel;
  #endif
  vFoliage = mvPosition.xyz;
  vFoliageHeight = position.y;
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
`;

const FOLIAGE_DETAIL = /* glsl */ `
  #ifdef SWAY_TREES
    // Clumps of needles and leaves, and darker low in the crown, where less light gets in.
    float clumps = texture2D( groundDetail, vFoliage.xz / 2.3 + vFoliage.y * 0.37 ).a;
    float tufts = texture2D( groundDetail, vec2( vFoliage.x + vFoliage.z, vFoliage.y ) / 1.7 ).r;
    diffuseColor.rgb *= ( 0.84 + 0.32 * mix( clumps, tufts, 0.5 ) ) * ( 0.8 + 0.2 * smoothstep( 1.0, 7.0, vFoliageHeight ) );
  #else
    // Darker at the roots than at the tips.
    diffuseColor.rgb *= 0.62 + 0.45 * smoothstep( 0.0, 1.0, vFoliageHeight );
  #endif
`;
