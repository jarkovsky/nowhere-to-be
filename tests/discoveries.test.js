import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { skyConditions, createAtmosphere } from '../src/atmosphere.js';
import { createWildlife } from '../src/wildlife.js';
import { createCar } from '../src/car.js';
import { SPAWN } from '../src/terrain.js';

test('automatic sky includes daylight, sunset, night, and passing rain',()=>{
  const samples=Array.from({length:300},(_,t)=>skyConditions(t));
  assert.ok(samples.some(s=>s.day>.99));assert.ok(samples.some(s=>s.day<.01));
  assert.ok(samples.some(s=>s.sunset>.9));assert.ok(samples.some(s=>s.rain>.6));
});
test('night enables headlights; paused simulation holds the sky clock',()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.FogExp2();
  const a=createAtmosphere(scene,new THREE.DirectionalLight(),new THREE.HemisphereLight(),createCar());
  assert.equal(a.cycle(),'sunset');assert.equal(a.cycle(),'night');
  for(let i=0;i<150;i++)a.update(.05,SPAWN,true);
  const s=a.getState();assert.ok(s.day<.01);assert.ok(s.headlightIntensity>40);
  a.update(.05,SPAWN,false);assert.equal(a.getState().time,s.time);
});
test('wildlife encounters alternate species and pause along with driving',()=>{
  const found=[],w=createWildlife(new THREE.Scene(),[],s=>found.push(s));
  for(let i=0;i<200;i++)w.update(.05,SPAWN,true);
  assert.equal(w.getState().active,'deer');assert.ok(w.getState().visible>0);
  const time=w.getState().time;w.update(.05,SPAWN,false);assert.equal(w.getState().time,time);
  for(let i=0;i<1100;i++)w.update(.05,SPAWN,true);
  assert.ok(w.getState().encounters>=2);assert.equal(found.length,2);
});
