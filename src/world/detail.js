// Fine detail drawn over the ground in its shader, so it doesn't look like it was painted
// with a roller: blotches and grain in the grass, drier patches, streaks where the wind
// combs it, and bands in the rock on steep slopes. It all comes from one small tiling noise
// texture made here, sampled in world space at a few different sizes.
import * as THREE from 'three';
import { createRandom } from '../core/math.js';

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
