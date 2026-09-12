import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createJournal, BRIDGE, CAMP, drivingHeight, localPoint, surfaceAt, SURFACES } from '../src/discoveries.js';
import { roadPoints, terrainHeight } from '../src/terrain.js';
import { createWildlife } from '../src/wildlife.js';
import { createSurfaces } from '../src/surfaces.js';
import { chassisPose, settleWheels } from '../src/suspension.js';
import { isDriveable } from '../src/driving.js';
import { createCar } from '../src/car.js';

test('journal deduplicates discoveries and restores choices and camp',()=>{
  const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};const a=createJournal(storage);
  assert.equal(a.discover('waterfall'),true);assert.equal(a.discover('waterfall'),false);assert.equal(a.discover('unknown'),false);
  a.save({color:'blue',decoration:'teddy',horn:'quack',camp:true});assert.deepEqual(createJournal(storage).get(),a.get());
});
test('malformed, untrusted, and unavailable browser saves remain playable',()=>{
  assert.deepEqual(createJournal({getItem:()=>'{broken'}).get().found,[]);
  const journal=createJournal({getItem:()=>JSON.stringify({found:['rabbit','bad'],color:'bad',horn:'bad',decoration:'bad',camp:'yes'}),setItem(){throw new Error('quota');}});
  assert.deepEqual(journal.get(),{found:['rabbit'],color:'orange',decoration:'none',horn:'beep',camp:false});assert.equal(journal.discover('bridge'),true);assert.equal(journal.isPersistent(),false);assert.ok(journal.get().found.includes('bridge'));
});
test('trail loop and camp stay on driveable land',()=>{
  for(const p of [...roadPoints,CAMP]){assert.ok(isDriveable(p.x,p.z));}
});
test('bridge tire contacts rise to the deck and return to ground outside it',()=>{
  assert.ok(drivingHeight(BRIDGE.x,BRIDGE.z)>terrainHeight(BRIDGE.x,BRIDGE.z)+1);
  const outside=localPoint(BRIDGE,20);assert.equal(drivingHeight(outside.x,outside.z),terrainHeight(outside.x,outside.z));
  const car=createCar(),pose=chassisPose(BRIDGE.x,BRIDGE.z,0);car.root.position.set(BRIDGE.x,pose.height,BRIDGE.z);car.root.rotation.set(pose.pitch,0,pose.roll);settleWheels(car);assert.ok(car.wheels.every(w=>Number.isFinite(w.pivot.position.y)));
});
test('snow keeps tire marks after leaving; paused surfaces do not emit effects',()=>{
  const scene=new THREE.Scene(),effects=createSurfaces(scene,{surface(){}},()=>{}),snow=SURFACES.find(s=>s.id==='snow');const state={...snow,speed:5,heading:0};
  for(let i=0;i<15;i++){state.z+=.5;effects.update(.05,state,true);}assert.ok(effects.getState().tracks>10);
  const count=effects.getState().tracks;effects.update(.05,{x:0,z:0,speed:0},true);assert.equal(effects.getState().tracks,count);effects.update(10,state,false);assert.equal(effects.getState().tracks,count);
  for(const p of SURFACES)assert.equal(surfaceAt(p.x,p.z),p.id);
});
test('sheep are discoverable and rabbit reaches its burrow, then reappears later',()=>{
  const found=[],w=createWildlife(new THREE.Scene(),[],()=>{},id=>found.push(id));
  w.update(.05,{x:-47,z:91,heading:0},true);assert.ok(found.includes('sheep'));
  for(let i=0;i<100;i++)w.update(.05,{x:-161,z:38,heading:0},true);assert.ok(found.includes('rabbit'));assert.equal(w.getState().rabbitHidden,true);
  for(let i=0;i<200;i++)w.update(.05,{x:0,z:80,heading:0},true);assert.equal(w.getState().rabbitHidden,false);
});
