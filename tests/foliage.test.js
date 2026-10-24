import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TINTED_COLOR, foliageMaterial } from '../src/world/detail.js';

test("the trees' own tints only go on the parts marked tinted, so the trunks keep their colour", () => {
  // If three's colour chunk changes, the line to change may no longer be found.
  assert.ok(TINTED_COLOR.includes('mix( vec3( 1.0 ), instanceColor.xyz, tinted )'));
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
  };
  foliageMaterial('trees').onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('instanceColor.xyz, tinted'));
  assert.ok(!shader.vertexShader.includes('#include <color_vertex>'));
});
