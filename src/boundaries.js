import * as THREE from 'three';
import { terrainHeight, VALLEY_RADIUS } from './terrain.js';
// The front bumper reaches these rails at the same point the driving limit stops it.
export const FENCE_RADIUS=VALLEY_RADIUS+1.8;
export const boundaryClearance=(x,z)=>Math.abs(Math.hypot(x,z)-FENCE_RADIUS)<3.5;
export function boundaryPoints(){
  const count=Math.ceil(2*Math.PI*FENCE_RADIUS/6);
  return Array.from({length:count},(_,i)=>({x:Math.sin(i/count*Math.PI*2)*FENCE_RADIUS,z:Math.cos(i/count*Math.PI*2)*FENCE_RADIUS}));
}
export function buildBoundary(scene){
  const points=boundaryPoints(),material=new THREE.MeshStandardMaterial({color:'#8d896d',roughness:1,flatShading:true});
  const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.23,1.65,.23),material,points.length);
  const rails=new THREE.InstancedMesh(new THREE.BoxGeometry(.14,.15,1),material,points.length*2);
  const dummy=new THREE.Object3D(),a=new THREE.Vector3(),b=new THREE.Vector3(),direction=new THREE.Vector3(),axis=new THREE.Vector3(0,0,1);
  points.forEach((p,i)=>{
    const ground=terrainHeight(p.x,p.z),next=points[(i+1)%points.length];
    dummy.position.set(p.x,ground+.825,p.z);dummy.quaternion.identity();dummy.scale.set(1,1,1);dummy.updateMatrix();posts.setMatrixAt(i,dummy.matrix);
    for(const [level,height] of [.65,1.3].entries()){
      a.set(p.x,ground+height,p.z);b.set(next.x,terrainHeight(next.x,next.z)+height,next.z);
      direction.subVectors(b,a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(axis,direction.clone().normalize());dummy.scale.set(1,1,direction.length());dummy.updateMatrix();rails.setMatrixAt(i*2+level,dummy.matrix);
    }
  });
  for(const mesh of [posts,rails]){mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);}
  return {radius:FENCE_RADIUS,posts:points.length};
}
