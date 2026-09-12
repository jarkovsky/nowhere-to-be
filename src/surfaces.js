import * as THREE from 'three';
import { terrainHeight, randomGenerator } from './terrain.js';
import { SURFACES, surfaceAt } from './discoveries.js';
export function createSurfaces(scene,sound,onMoment){
  const random=randomGenerator(441),dummy=new THREE.Object3D();
  for(const p of SURFACES){
    const geo=new THREE.PlaneGeometry(p.rx*2,p.rz*2,32,32);geo.rotateX(-Math.PI/2);const v=geo.attributes.position;
    for(let i=0;i<v.count;i++){const x=v.getX(i),z=v.getZ(i),d=Math.hypot(x/p.rx,z/p.rz);v.setXYZ(i,p.x+x,terrainHeight(p.x+x,p.z+z)+(d<.95?.11:-.25),p.z+z);}geo.computeVertexNormals();
    const patch=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:{puddle:'#8dbbbe',leaves:'#ae7844',snow:'#eaf0e8'}[p.id],roughness:p.id==='puddle'?.25:1,metalness:p.id==='puddle'?.15:0}));patch.receiveShadow=true;scene.add(patch);
    if(p.id==='leaves'){
      const leaves=new THREE.InstancedMesh(new THREE.CircleGeometry(.3,5),new THREE.MeshStandardMaterial({color:'#ffffff',side:THREE.DoubleSide}),350);
      for(let i=0;i<350;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*.93,x=p.x+Math.cos(a)*r*p.rx,z=p.z+Math.sin(a)*r*p.rz;dummy.position.set(x,terrainHeight(x,z)+.17,z);dummy.rotation.set(-Math.PI/2,0,random()*6);dummy.scale.set(1,.5+random(),1);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);leaves.setColorAt(i,new THREE.Color(['#cd8c3c','#a64d32','#e2b85b'][i%3]));}scene.add(leaves);
      // Copper crowns mark the autumn grove.
      for(let i=0;i<7;i++){const a=i/7*Math.PI*2,x=p.x+Math.cos(a)*21,z=p.z+Math.sin(a)*20,y=terrainHeight(x,z);const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.3,.5,5,6),new THREE.MeshStandardMaterial({color:'#7e6a50'}));trunk.position.set(x,y+2.5,z);scene.add(trunk);const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(4,1),new THREE.MeshStandardMaterial({color:['#bb773d','#c99a50','#a66135'][i%3],flatShading:true}));crown.position.set(x,y+6,z);crown.castShadow=true;scene.add(crown);}
    }
  }
  const capacity=6000,tracks=new THREE.InstancedMesh(new THREE.PlaneGeometry(.39,.68),new THREE.MeshStandardMaterial({color:'#a5b8b9',roughness:1,side:THREE.DoubleSide}),capacity);tracks.count=0;tracks.frustumCulled=false;scene.add(tracks);
  const particles=[];const geo=new THREE.IcosahedronGeometry(.13,0),materials={puddle:new THREE.MeshBasicMaterial({color:'#c6eff3'}),leaves:new THREE.MeshStandardMaterial({color:'#e0a449'}),snow:new THREE.MeshBasicMaterial({color:'#faffff'})};
  for(let i=0;i<64;i++){const mesh=new THREE.Mesh(geo,materials.puddle);mesh.visible=false;scene.add(mesh);particles.push({mesh,life:0,vx:0,vz:0,vy:0});}
  let cursor=0,trackCursor=0,lastTrack=null,lastParticle=0,lastSound=0,time=0,current='grass';const seen=new Set();
  return {getState:()=>({surface:current,tracks:tracks.count,particles:particles.filter(p=>p.life>0).length}),update(dt,state,active){
    if(!active)return;time+=dt;current=surfaceAt(state.x,state.z);
    if(Math.abs(state.speed)>.6&&current!=='grass'){
      if(!seen.has(current)){seen.add(current);onMoment({puddle:'Splish, splash! Little puddles, big smiles.',leaves:'Crunch, crunch. An autumn carpet.',snow:'Look behind you! Your tires drew in the snow.'}[current]);}
      if(time-lastSound>.22){sound.surface(current);lastSound=time;}
      if(time-lastParticle>.045){lastParticle=time;for(const side of [-1,1]){const p=particles[cursor++%particles.length],x=state.x+Math.cos(state.heading)*side*1.15,z=state.z-Math.sin(state.heading)*side*1.15;p.mesh.material=materials[current];p.mesh.position.set(x,terrainHeight(x,z)+.4,z);p.mesh.visible=true;p.life=.65;p.vx=Math.cos(state.heading)*side*2;p.vz=-Math.sin(state.heading)*side*2;p.vy=2+random()*2;}}
      if(current==='snow'&&(!lastTrack||Math.hypot(state.x-lastTrack.x,state.z-lastTrack.z)>.48)){
        for(const side of [-1,1]){const x=state.x+Math.cos(state.heading)*side*1.08,z=state.z-Math.sin(state.heading)*side*1.08;if(surfaceAt(x,z)!=='snow')continue;dummy.position.set(x,terrainHeight(x,z)+.14,z);dummy.rotation.set(-Math.PI/2,0,state.heading);dummy.scale.set(1,1,1);dummy.updateMatrix();tracks.setMatrixAt(trackCursor++%capacity,dummy.matrix);tracks.count=Math.min(trackCursor,capacity);}tracks.instanceMatrix.needsUpdate=true;lastTrack={x:state.x,z:state.z};
      }
    }
    for(const p of particles)if(p.life>0){p.life-=dt;p.vy-=9*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vz*dt;p.mesh.position.y+=p.vy*dt;p.mesh.rotation.x+=dt*4;p.mesh.visible=p.life>0&&p.mesh.position.y>terrainHeight(p.mesh.position.x,p.mesh.position.z);}
  }};
}
