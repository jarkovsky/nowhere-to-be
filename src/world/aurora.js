// The northern lights: a few slow curtains of soft green, shading to violet at their tops, hung
// in the northern sky and swaying gently, drawn over the stars on clear nights on the Lofoten
// coast. Each is a strip of triangles bent into an arc round the camera; the graphics card
// does the swaying and the rays (the strips are never rebuilt), and they are added together
// with what is behind them so they stay see-through.
import * as THREE from 'three';

/**
 * The curtains: `from` and `to` are angles round the camera from due north (towards the east),
 * over the open water of the fjord, where the mountains don't hide them.
 */
const CURTAINS = [
  { radius: 1050, from: 1.3, to: 3.0, low: 170, high: 600, seed: 0.0 },
  { radius: 1300, from: 1.9, to: 3.5, low: 230, high: 760, seed: 3.1 },
  { radius: 1500, from: 0.8, to: 2.2, low: 300, high: 840, seed: 6.2 },
];
const ACROSS = 72;
const UP = 8;

const vertexShader = /* glsl */ `
  uniform float time;
  uniform float seed;
  uniform float radius;
  uniform float low;
  uniform float high;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // The curtain folds in and out as it goes round, and the folds drift along.
    float fold = sin(uv.x * 9.0 + time * 0.07 + seed) * 70.0 + sin(uv.x * 23.0 - time * 0.11 + seed * 2.0) * 22.0;
    float r = radius + fold + uv.y * 40.0;
    float angle = position.x;
    // The foot rises and falls a little along it, and the whole sways with the height.
    float foot = low + sin(uv.x * 6.0 + time * 0.09 + seed) * 35.0;
    float y = foot + uv.y * (high - low) + sin(uv.x * 11.0 + time * 0.05) * 10.0 * uv.y;
    float sway = sin(uv.y * 2.2 + time * 0.13 + seed) * 0.03 * uv.y;
    vec3 p = vec3(sin(angle + sway) * r, y, -cos(angle + sway) * r);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float time;
  uniform float seed;
  uniform float amount;
  varying vec2 vUv;
  void main() {
    float v = vUv.y;
    // Bright and sharp at the foot, fading up into violet and then nothing.
    float body = smoothstep(0.0, 0.1, v) * (1.0 - smoothstep(0.3, 1.0, v));
    // Long rays standing up the curtain, drifting slowly along it, and slow waves of brightness.
    float rays = 0.55 + 0.45 * sin(vUv.x * 160.0 + sin(vUv.x * 17.0 + time * 0.2 + seed) * 4.0 + v * 3.0);
    float waves = 0.5 + 0.5 * sin(vUv.x * 7.0 - time * 0.16 + seed * 1.7);
    float bright = smoothstep(0.1, 0.8, waves * 0.8 + 0.3 * sin(vUv.x * 3.0 + time * 0.05));
    vec3 green = vec3(0.22, 0.95, 0.52);
    vec3 violet = vec3(0.55, 0.38, 0.95);
    vec3 colour = mix(green, violet, smoothstep(0.25, 0.9, v));
    float edge = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
    float alpha = body * mix(0.55, 1.0, rays) * bright * edge * amount * 0.42;
    gl_FragColor = vec4(colour * alpha, alpha);
  }
`;

/** One curtain's strip: `position.x` is the angle round the camera from due north, `uv` where on the strip. */
function curtainGeometry({ from, to }) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= UP; j++) {
    for (let i = 0; i <= ACROSS; i++) {
      positions.push(from + ((to - from) * i) / ACROSS, 0, 0);
      uvs.push(i / ACROSS, j / UP);
    }
  }
  for (let j = 0; j < UP; j++) {
    for (let i = 0; i < ACROSS; i++) {
      const a = j * (ACROSS + 1) + i;
      indices.push(a, a + 1, a + ACROSS + 1, a + 1, a + ACROSS + 2, a + ACROSS + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * The northern lights. `update(time, centre, amount)` moves them to hang round `centre`, the
 * camera or the car, and shows them by `amount` from 0 (not at all) to 1.
 */
export function createAurora(scene) {
  const group = new THREE.Group();
  group.name = 'aurora';
  const uniforms = { time: { value: 0 }, amount: { value: 0 } };
  for (const curtain of CURTAINS) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...uniforms,
        seed: { value: curtain.seed },
        radius: { value: curtain.radius },
        low: { value: curtain.low },
        high: { value: curtain.high },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(curtainGeometry(curtain), material);
    mesh.frustumCulled = false;
    // Behind the clouds and the stars, but over the sky.
    mesh.renderOrder = -1;
    group.add(mesh);
  }
  group.visible = false;
  scene.add(group);
  return {
    group,
    update(time, centre, amount) {
      group.visible = amount > 0.01;
      if (!group.visible) return;
      group.position.set(centre.x, 0, centre.z);
      uniforms.time.value = time;
      uniforms.amount.value = amount;
    },
  };
}
