// The sky and the haze. The haze is the renderer's fog, changed so its colour depends on
// where you look: warm towards the sun and, at sunrise and sunset, cool away from it. It thickens
// with distance faster than plain fog does, and is thicker low down, so it settles in the valley
// and each ridge fades further into it than the one in front. In the early morning a thin mist
// lies in the lowest ground (the lake basin and the oxbow), added to the same fog. The sky is a
// dome around the camera that starts from the same colours at the horizon and darkens towards the
// top, with a glow round the sun, so the far hills meet it without a seam.
import * as THREE from 'three';

/**
 * Shared by every material that has fog, and by the sky. Plain arrays rather than vectors:
 * the renderer copies vectors for each material, but passes these along as they are, so
 * setting them once updates them everywhere.
 */
export const HAZE = {
  sunColor: new Float32Array(3),
  sunDirection: new Float32Array([0, 1, 0]),
  /** The haze on the side away from the sun: the plain haze colour by day and night, bluer at sunrise and sunset. */
  coolColor: new Float32Array(3),
  /** The sky straight up, for what the water mirrors. */
  zenith: new Float32Array(3),
  /** The morning mist: how much of it there is from 0 to 1, and the height it lies up to. */
  mist: new Float32Array([0, 3, 0]),
};

const HAZE_COLOR = /* glsl */ `
  vec3 hazeColor( vec3 direction ) {
    float facing = dot( direction, hazeSunDirection );
    float sun = max( facing, 0.0 );
    vec3 away = mix( fogColor, hazeCoolColor, smoothstep( 0.3, - 0.8, facing ) );
    return mix( away, hazeSunColor, 0.7 * pow( sun, 7.0 ) + 0.3 * sun * sun );
  }
`;

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
  #ifdef USE_FOG
    varying float vFogDepth;
    varying vec3 vFogOffset;
  #endif
`;

THREE.ShaderChunk.fog_vertex = /* glsl */ `
  #ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    // From the camera to the point, turned back into world space.
    vFogOffset = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
  #endif
`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
  #ifdef USE_FOG
    uniform vec3 fogColor;
    uniform vec3 hazeSunColor;
    uniform vec3 hazeSunDirection;
    uniform vec3 hazeCoolColor;
    uniform vec3 hazeMist;
    varying float vFogDepth;
    varying vec3 vFogOffset;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear;
      uniform float fogFar;
    #endif
    ${HAZE_COLOR}
  #endif
`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      // The scene's density is used for haze that thickens steadily with distance rather
      // than with its square, so nearby slopes soften a little and the far hills still show.
      // It is thicker in the valley than up on the hills, judged halfway along the line of sight,
      // and beyond a few hundred metres it thickens faster still, so every ridge stands out
      // against the one behind it. Rain and blizzards already fill the air, so they keep to plain haze.
      float hazeHeight = cameraPosition.y + vFogOffset.y * 0.5;
      float hazeDensity = fogDensity * mix( 1.6, 0.6, smoothstep( - 5.0, 130.0, hazeHeight ) );
      float hazeReach = vFogDepth * ( 1.0 + vFogDepth * ( 1.0 - smoothstep( 0.0012, 0.0032, fogDensity ) ) / 1000.0 );
      float fogFactor = 1.0 - exp( - hazeDensity * hazeReach );
      // The morning mist, lying below the height in hazeMist.y and thinning out over the metres above it:
      // how much of the way to the point is under that, judged at the camera, halfway and at the point.
      if ( hazeMist.x > 0.001 ) {
        float lowest = cameraPosition.y;
        float middle = lowest + vFogOffset.y * 0.5;
        float highest = lowest + vFogOffset.y;
        float inside = 1.0 - ( smoothstep( hazeMist.y - 5.0, hazeMist.y, lowest ) + 2.0 * smoothstep( hazeMist.y - 5.0, hazeMist.y, middle ) + smoothstep( hazeMist.y - 5.0, hazeMist.y, highest ) ) * 0.25;
        float mist = min( 1.0 - exp( - hazeMist.x * 0.0045 * vFogDepth * inside ), 0.8 );
        fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - mist );
      }
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColor( normalize( vFogOffset ) ), fogFactor );
  #endif
`;

for (const shader of Object.values(THREE.ShaderLib)) {
  if (!shader.uniforms.fogColor) continue;
  shader.uniforms.hazeSunColor = { value: HAZE.sunColor };
  shader.uniforms.hazeSunDirection = { value: HAZE.sunDirection };
  shader.uniforms.hazeCoolColor = { value: HAZE.coolColor };
  shader.uniforms.hazeMist = { value: HAZE.mist };
}

/** Far enough for the most distant hills, but inside the camera's far plane. */
const DOME_RADIUS = 1850;

/**
 * The dome, with soft clouds drifting across it and the sun, which the clouds pass in front
 * of. `fogColor` is the haze colour away from the sun (the scene's fog colour); the rest is
 * set through the material's uniforms every frame.
 */
export function createSkyDome(fogColor) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      fogColor: { value: fogColor },
      hazeSunColor: { value: HAZE.sunColor },
      hazeSunDirection: { value: HAZE.sunDirection },
      hazeCoolColor: { value: HAZE.coolColor },
      zenith: { value: new THREE.Color() },
      cloudColor: { value: new THREE.Color() },
      /** How much of the sky the clouds cover, from 0 to 1. */
      cloudCover: { value: 0.3 },
      /** Seconds, for the clouds' drift. */
      time: { value: 0 },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      /** Black when the sun isn't out. */
      sunColor: { value: new THREE.Color() },
      /** The glow round the sun: how strong it is, and how tight (higher is tighter). */
      sunGlow: { value: new THREE.Vector2() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 fogColor;
      uniform vec3 hazeSunColor;
      uniform vec3 hazeSunDirection;
      uniform vec3 hazeCoolColor;
      uniform vec3 zenith;
      uniform vec3 cloudColor;
      uniform float cloudCover;
      uniform float time;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform vec2 sunGlow;
      varying vec3 vDirection;
      ${HAZE_COLOR}

      float hash( vec2 p ) {
        p = fract( p * vec2( 123.34, 456.21 ) );
        p += dot( p, p + 45.32 );
        return fract( p.x * p.y );
      }
      float noise( vec2 p ) {
        vec2 i = floor( p );
        vec2 f = fract( p );
        f = f * f * ( 3.0 - 2.0 * f );
        return mix(
          mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ),
          mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), f.x ),
          f.y
        );
      }
      float clouds( vec2 p ) {
        float value = 0.0;
        float weight = 0.5;
        for ( int i = 0; i < 4; i ++ ) {
          value += weight * noise( p );
          p = p * 2.07 + vec2( 17.1, 4.3 );
          weight *= 0.5;
        }
        return value;
      }

      void main() {
        vec3 direction = normalize( vDirection );
        float up = max( direction.y, 0.0 );
        vec3 color = mix( hazeColor( direction ), zenith, smoothstep( 0.0, 0.75, sqrt( up ) ) * 0.85 );

        float sun = dot( direction, sunDirection );
        // A soft glow round the sun, wide and warm when it is low, drawn into the haze.
        float near = max( sun, 0.0 );
        color += hazeSunColor * sunGlow.x * ( 0.55 * pow( near, sunGlow.y ) + 0.45 * pow( near, sunGlow.y * 0.2 ) * 0.5 );
        color = mix( color, sunColor, smoothstep( 0.99982, 0.99988, sun ) );

        // Clouds on a flat layer overhead, so they bunch up towards the horizon, stretched
        // along the wind and fading out before they reach the hills.
        vec2 layer = direction.xz / ( direction.y + 0.12 );
        float shape = clouds( layer * vec2( 0.9, 2.2 ) + vec2( time * 0.006, time * 0.002 ) );
        float edge = 0.62 - cloudCover * 0.32;
        float cover = smoothstep( edge, edge + 0.16, shape );
        cover *= smoothstep( 0.02, 0.2, direction.y ) * 0.85;
        vec3 lit = cloudColor + hazeSunColor * 0.6 * pow( max( sun, 0.0 ), 6.0 );
        color = mix( color, lit, cover );

        gl_FragColor = vec4( color, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), material);
  dome.name = 'sky';
  dome.frustumCulled = false;
  // Drawn after everything solid, so only the sky that shows between things is filled in.
  dome.renderOrder = 1000;
  dome.matrixAutoUpdate = false;
  dome.onBeforeRender = (renderer, scene, camera) => {
    dome.position.copy(camera.position);
    dome.updateMatrix();
    dome.updateMatrixWorld();
  };
  return dome;
}
