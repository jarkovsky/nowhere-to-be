import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { skyConditions, createAtmosphere } from '../src/world/atmosphere.js';

function atmosphere() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.FogExp2();
  return createAtmosphere(scene, new THREE.DirectionalLight(), new THREE.HemisphereLight());
}

test('the automatic sky passes through day, sunset, night and rain', () => {
  const samples = Array.from({ length: 720 }, (_, t) => skyConditions(t));
  assert.ok(samples.some(s => s.day > 0.99));
  assert.ok(samples.some(s => s.day < 0.01));
  assert.ok(samples.some(s => s.sunset > 0.9));
  assert.ok(samples.some(s => s.rain > 0.6));
});

test('presets cycle in order and night settles in', () => {
  const sky = atmosphere();
  assert.equal(sky.cycle(), 'sunset');
  assert.equal(sky.cycle(), 'night');
  for (let i = 0; i < 150; i++) sky.update(0.05, { x: 0, z: 0 }, true);
  assert.ok(sky.getState().day < 0.01);
});

test('the clock pauses with the game, and waking up brings a dry morning', () => {
  const sky = atmosphere();
  sky.update(1, { x: 0, z: 0 }, true);
  const time = sky.getState().time;
  sky.update(1, { x: 0, z: 0 }, false);
  assert.equal(sky.getState().time, time);
  sky.setPreset('night');
  sky.wakeUp();
  const morning = skyConditions(sky.getState().time);
  assert.equal(sky.getState().preset, 'auto');
  assert.ok(morning.day > 0.3 && morning.rain < 0.05);
});
