import * as THREE from 'three';
import { terrainHeight, randomGenerator } from './terrain.js';
import { BRIDGE, TUNNEL, CAMP, PLACES, SURFACES, localPoint, bridgeHeight } from './discoveries.js';
const mat=color=>new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true});
export function reservedScenery(x,z){const t=(89-z)/97;if(t>=0&&t<=1&&Math.abs(x-(-20+48*t+Math.sin(t*Math.PI)*8))<7)return true;return [...PLACES,...SURFACES,{x:-49,z:92,radius:16},{x:-61,z:106,radius:12},{x:-161,z:38,radius:15}].some(p=>Math.hypot(x-p.x,z-p.z)<(p.radius||30)+8);}
export function buildLandmarks(scene,obstacles){
  const wood=mat('#8e6247'),rock=mat('#8e9c98'),canvas=mat('#dca16b'),random=randomGenerator(85);
  function mesh(geo,material,x,y,z){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
  function box(w,h,d,x,y,z,m=wood){return mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z);}
  // The deck and tire contacts use the same gently arched surface.
  for(let a=-12.7;a<13;a+=.65){const geo=new THREE.BoxGeometry(9,.24,.61,9,1,1),v=geo.attributes.position;for(let i=0;i<v.count;i++){const p=localPoint(BRIDGE,Math.min(12.999,a+v.getZ(i)),v.getX(i));v.setXYZ(i,p.x,(bridgeHeight(p.x,p.z)??terrainHeight(p.x,p.z))-.12+v.getY(i),p.z);}geo.computeVertexNormals();mesh(geo,wood,0,0,0);}
  for(const side of [-4.5,4.5])for(let a=-12;a<=12;a+=3){const p=localPoint(BRIDGE,a,side),y=bridgeHeight(localPoint(BRIDGE,a).x,localPoint(BRIDGE,a).z);box(.24,1.5,.24,p.x,y+.65,p.z);obstacles.push({x:p.x,z:p.z,radius:.2});if(a<12){const rail=box(.17,.17,3.2,p.x+BRIDGE.dx*1.5,y+1.25,p.z+BRIDGE.dz*1.5);rail.rotation.y=Math.atan2(BRIDGE.dx,BRIDGE.dz);}}
  // A shallow stream slips out from beneath the wooden bridge.
  const stream=mesh(new THREE.PlaneGeometry(36,3,36,3),mat('#7aaeb5'),0,0,0);stream.geometry.rotateX(-Math.PI/2);
  const sp=stream.geometry.attributes.position;
  for(let i=0;i<sp.count;i++){const p=localPoint(BRIDGE,sp.getZ(i),sp.getX(i));sp.setXYZ(i,p.x,terrainHeight(p.x,p.z)+.09,p.z);}stream.geometry.computeVertexNormals();
  // A continuous mountain shell with an open passage at both ends.
  const verts=[],idx=[];const rings=18,arcs=16;
  for(let j=0;j<=rings;j++)for(let k=0;k<=arcs;k++)for(const outer of [false,true]){
    const a=j/rings*TUNNEL.length-TUNNEL.length/2,angle=k/arcs*Math.PI;
    const radius=outer?7+17*Math.sin(j/rings*Math.PI):6;
    const p=localPoint(TUNNEL,a,Math.cos(angle)*radius),center=localPoint(TUNNEL,a);
    const summit=outer?Math.sin(angle)*7+Math.sin(j/rings*Math.PI)*(1-Math.abs(Math.cos(angle)))*(24+Math.sin(k*2+j)*2):Math.sin(angle)*radius;
    verts.push(p.x,terrainHeight(center.x,center.z)-.3+summit,p.z);
  }
  const stride=(arcs+1)*2;
  for(let j=0;j<rings;j++)for(let k=0;k<arcs;k++)for(let layer=0;layer<2;layer++){const a=j*stride+k*2+layer,b=a+2,c=a+stride;idx.push(a,b,c,b,c+2,c);}
  for(const j of [0,rings])for(let k=0;k<arcs;k++){const a=j*stride+k*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(idx);geo.computeVertexNormals();const mountain=mesh(geo,rock,0,0,0);mountain.material.side=THREE.DoubleSide;
  for(let a=-17;a<=17;a+=2)for(const side of [-6.3,6.3]){const p=localPoint(TUNNEL,a,side);obstacles.push({x:p.x,z:p.z,radius:.5});}
  // Falls spill down an exposed rock face into a small basin.
  const fall=PLACES[0],fy=terrainHeight(fall.x,fall.z);
  for(let i=0;i<12;i++){const x=fall.x+5+random()*5,z=fall.z+(random()-.5)*19;const r=mesh(new THREE.IcosahedronGeometry(1,0),rock,x,fy+5+random()*8,z);r.scale.set(4+random()*3,8+random()*4,4);obstacles.push({x,z,radius:3});}
  const water=new THREE.MeshStandardMaterial({color:'#b7e6e4',emissive:'#518c95',emissiveIntensity:.25,transparent:true,opacity:.8,side:THREE.DoubleSide});
  const falls=[];
  for(let i=0;i<5;i++)falls.push(box(.45,17-i*.6,.7,fall.x,fy+8-i*.3,fall.z-1.5+i*.75,water));
  const pool=mesh(new THREE.CircleGeometry(6,24),mat('#80b9bb'),fall.x-2,fy+.08,fall.z);pool.rotation.x=-Math.PI/2;
  const droplets=[];for(let i=0;i<35;i++)droplets.push(mesh(new THREE.IcosahedronGeometry(.13,0),water,fall.x,fy,fall.z));
  // A winding spur makes the hidden camp accessible from the meadow.
  const pv=[],pi=[];
  for(let i=0;i<=90;i++){const t=i/90,x=-20+48*t+Math.sin(t*Math.PI)*8,z=89-97*t;for(const side of [-1,1]){const xx=x+side*2.6;pv.push(xx,terrainHeight(xx,z)+.08,z);}if(i<90){const a=i*2;pi.push(a,a+2,a+1,a+1,a+2,a+3);}}
  const path=new THREE.BufferGeometry();path.setAttribute('position',new THREE.Float32BufferAttribute(pv,3));path.setIndex(pi);path.computeVertexNormals();mesh(path,mat('#c9bb98'),0,0,0);
  const fx=CAMP.x+7,fz=CAMP.z+3,cy=terrainHeight(fx,fz);
  for(let i=0;i<10;i++){const a=i/10*Math.PI*2;const stone=mesh(new THREE.IcosahedronGeometry(.48,0),rock,fx+Math.cos(a)*1.6,cy+.2,fz+Math.sin(a)*1.6);stone.scale.y=.65;}
  for(const a of [-.6,.6]){const log=box(2.7,.35,.4,fx,cy+.3,fz);log.rotation.y=a;}
  const flameMat=new THREE.MeshBasicMaterial({color:'#ffb547',transparent:true,opacity:.9});
  const flames=[];for(let i=0;i<3;i++)flames.push(mesh(new THREE.ConeGeometry(.65-i*.15,1.8+i*.3,6),flameMat,fx+(i-1)*.4,cy+1,fz));
  const glow=new THREE.PointLight('#ffae58',24,35,1.5);glow.position.set(fx,cy+2,fz);scene.add(glow);
  const tx=CAMP.x-6,tz=CAMP.z-7,ty=terrainHeight(tx,tz);
  const tentGeo=new THREE.BufferGeometry();tentGeo.setAttribute('position',new THREE.Float32BufferAttribute([-3,0,3,0,4,3,-3,0,-3, 0,4,3,0,4,-3,-3,0,-3, 0,4,3,3,0,3,0,4,-3, 3,0,3,3,0,-3,0,4,-3, -3,0,-3,0,4,-3,3,0,-3],3));tentGeo.computeVertexNormals();canvas.side=THREE.DoubleSide;mesh(tentGeo,canvas,tx,ty,tz);
  const doorGeo=new THREE.BufferGeometry();doorGeo.setAttribute('position',new THREE.Float32BufferAttribute([-2.7,0,0,2.7,0,0,0,3.7,0],3));doorGeo.computeVertexNormals();mesh(doorGeo,new THREE.MeshStandardMaterial({color:'#514c3f',side:THREE.DoubleSide}),tx,ty+.03,tz+2.96);
  obstacles.push({x:tx,z:tz,radius:3},{x:fx,z:fz,radius:1.7});
  const seat=box(3,.5,.9,fx,cy+.35,fz+4);seat.rotation.y=.1;
  // Hand-painted trail signs are visible even before their stickers are found.
  for(const p of PLACES){const x=p.x+(p.id==='campsite'?-11:9),z=p.z+(p.id==='campsite'?14:9),y=terrainHeight(x,z);box(.22,2.8,.22,x,y+1.4,z);const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#f0e5c9';ctx.fillRect(0,0,512,128);ctx.fillStyle='#3d5445';ctx.font='bold 35px Georgia';ctx.textAlign='center';ctx.fillText(p.name,256,78);const sign=mesh(new THREE.PlaneGeometry(7,1.75),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide}),x,y+3,z);sign.rotation.y=.2;}
  let time=0;
  return {fire:{x:fx,y:cy,z:fz},update(dt,active){if(active)time+=dt;flames.forEach((f,i)=>{f.scale.set(1+Math.sin(time*9+i)*.14,1+Math.sin(time*7+i*2)*.24,1);});glow.intensity=23+Math.sin(time*8)*3;falls.forEach((f,i)=>{f.scale.x=1+Math.sin(time*5+i)*.15;});droplets.forEach((d,i)=>{const t=(time*1.6+i*.137)%1;d.position.set(fall.x-.3-Math.sin(t*Math.PI)*1.3,fy+17*(1-t),fall.z+Math.sin(i*4)*2.3);});}};
}
