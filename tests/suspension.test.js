import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCar } from '../src/car.js';
import { chassisPose, settleWheels } from '../src/suspension.js';
import { terrainHeight } from '../src/terrain.js';

function clearances(car, sample) {
  car.root.updateWorldMatrix(true, true);
  return car.wheels.map(w => {
    const p=w.tire.geometry.attributes.position,v=new THREE.Vector3();let min=Infinity;
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(w.tire.matrixWorld);min=Math.min(min,v.y-sample(v.x,v.z));}
    return min;
  });
}
function place(car,x,z,heading,sample,lag=1){
  const p=chassisPose(x,z,heading,sample);car.root.position.set(x,p.height,z);car.root.rotation.order='YXZ';car.root.rotation.y=heading;
  car.root.rotation.x+=(p.pitch-car.root.rotation.x)*lag;car.root.rotation.z+=(p.roll-car.root.rotation.z)*lag;
  settleWheels(car,sample);
}
test('chassis pitches uphill in the direction the car is facing',()=>{
  const sample=(x,z)=>-.3*z;
  assert.ok(chassisPose(0,0,0,sample).pitch>0);
  assert.ok(chassisPose(0,0,Math.PI,sample).pitch<0);
  assert.ok(Math.abs(chassisPose(0,0,Math.PI/2,sample).pitch)<1e-10);
});
test('all four tires touch flat ground and compound slopes at different headings',()=>{
  const car=createCar();
  for(const sample of [()=>0,(x,z)=>x*.2-z*.3,(x,z)=>-x*.35+z*.1]){
    for(let heading=0;heading<Math.PI*2;heading+=.4){place(car,10,20,heading,sample);for(const d of clearances(car,sample))assert.ok(d>=0&&d<.018,`contact gap ${d}`);}
  }
});
test('suspension maintains contact across terrain triangles while body angle eases',()=>{
  const car=createCar();
  for(let i=0;i<110;i++){
    const x=-90+i*1.3,z=99-i*.5,heading=Math.sin(i*.12);
    car.wheels.forEach(w=>{w.spin.rotation.x=i*.4;w.pivot.rotation.y=w.front?.25:0;});
    place(car,x,z,heading,terrainHeight,.18);
    for(const d of clearances(car,terrainHeight))assert.ok(d>=-.003&&d<.025,`contact gap ${d} at ${i}`);
  }
});
