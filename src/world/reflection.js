// A cheap mirror for flat water: the sky's colour, as the sky dome draws it but a little darker
// and richer, mixed in mostly at grazing angles, with a dark band where the far hills would stand
// in it. Nothing is drawn twice: the colour comes from the same haze the fog and the sky use.
import { HAZE } from './sky.js';

const PARS = /* glsl */ `
  uniform float skyMirror;
  uniform float skySaturation;
  uniform float skyDark;
  uniform float skyBand;
  uniform vec3 hazeZenith;
  varying vec3 vMirrorPosition;
  #ifdef MIRROR_MASK
    varying float vMirror;
  #endif
`;

const VERTEX = /* glsl */ `
  #include <project_vertex>
  vec4 mirrorPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mirrorPosition = instanceMatrix * mirrorPosition;
  #endif
  vMirrorPosition = ( modelMatrix * mirrorPosition ).xyz;
  #ifdef MIRROR_MASK
    vMirror = mirror;
  #endif
`;

const FRAGMENT = /* glsl */ `
  #ifdef USE_FOG
  {
    vec3 toEye = normalize( cameraPosition - vMirrorPosition );
    // Straight back off a flat surface.
    vec3 mirrored = vec3( - toEye.x, abs( toEye.y ), - toEye.z );
    float fresnel = 0.02 + 0.98 * pow( 1.0 - clamp( toEye.y, 0.0, 1.0 ), 5.0 );
    vec3 sky = mix( hazeColor( mirrored ), hazeZenith, smoothstep( 0.0, 0.75, sqrt( mirrored.y ) ) * 0.85 );
    // Water shows the sky darker than it is, and richer or greyer than it, as the material says.
    float grey = dot( sky, vec3( 0.3, 0.59, 0.11 ) );
    sky = mix( vec3( grey ), sky, skySaturation ) * skyDark;
    float mask = 1.0;
    #ifdef MIRROR_MASK
      mask = vMirror;
    #endif
    // The hills on the far shore, a dark band low in the sky, strongest where the view is lowest.
    float hills = smoothstep( 0.0, 0.008, mirrored.y ) * ( 1.0 - smoothstep( 0.06, 0.22, mirrored.y ) );
    outgoingLight *= 1.0 - hills * clamp( fresnel * 2.0, 0.0, 1.0 ) * 0.8 * skyBand;
    outgoingLight = mix( outgoingLight, sky, fresnel * skyMirror * mask );
  }
  #endif
  #include <opaque_fragment>
`;

/** How much of the sky the lake and the fjord mirror at the most (at the lowest angles). */
export const WATER_MIRROR = { strength: 0.38, saturation: 1.55, dark: 0.78, band: 1 };

/**
 * Makes a material (a Lambert one, already with fog) mirror the sky, and returns it. `options`
 * are `strength` (the most of the sky that mixes in, 0 to 1), `saturation` and `dark` (how rich
 * and how bright the sky it mirrors is, 1 being as the sky is), `band` (the strength of the dark
 * band of far hills, 0 for none) and `mask` (true where the geometry has a `mirror` attribute, 1 where it
 * mirrors and 0 where it doesn't).
 */
export function reflectSky(material, options) {
  const { strength, saturation, dark, band, mask = false } = options;
  if (mask) material.defines = { ...material.defines, MIRROR_MASK: '' };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      skyMirror: { value: strength },
      skySaturation: { value: saturation },
      skyDark: { value: dark },
      skyBand: { value: band },
      hazeZenith: { value: HAZE.zenith },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PARS}${mask ? 'attribute float mirror;' : ''}`)
      .replace('#include <project_vertex>', VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace('#include <opaque_fragment>', FRAGMENT);
  };
  return material;
}
