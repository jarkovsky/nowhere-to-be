import { habitatClearance } from './habitats.js';
import { buildBoundary, boundaryClearance } from './boundaries.js';
import * as THREE from 'three';
import { WORLD_SIZE, SEGMENTS, CELL, heights, terrainHeight, LAKE, lakeDistance, randomGenerator, roadDistance, roadPoint, SPAWN } from './terrain.js';
import { reservedScenery, buildLandmarks } from './landmarks.js';
const rand = randomGenerator();
const mat = (color) => new THREE.MeshStandardMaterial({color, roughness:1, flatShading:true});
export function buildWorld(scene) {
  const obstacles=[];
  const terrain = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEGMENTS, SEGMENTS);
  terrain.rotateX(-Math.PI/2);
  const pos=terrain.attributes.position;
  for(let i=0;i<pos.count;i++)pos.setY(i,heights[i]);
  let flat=terrain.toNonIndexed();terrain.dispose();
  const p=flat.attributes.position, colors=[];
  const meadow=new THREE.Color('#a5b383'), dry=new THREE.Color('#c1be8b'), high=new THREE.Color('#939f87'), shore=new THREE.Color('#cfca9e');
  for(let i=0;i<p.count;i+=3){
    const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
    const h=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3;
    const c=meadow.clone().lerp(dry, Math.min(1, .30+.25*Math.sin(x*.009+z*.017)+Math.max(0,h-15)*.012));
    if(h>55)c.lerp(high,Math.min(1,(h-55)/100));
    if(lakeDistance(x,z)<1.22)c.lerp(shore,.85);
    c.multiplyScalar(.96+rand()*.08);
    for(let v=0;v<3;v++)colors.push(c.r,c.g,c.b);
  }
  flat.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));flat.computeVertexNormals();
  const ground=new THREE.Mesh(flat,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));ground.receiveShadow=true;scene.add(ground);
  // The trail follows the exact same triangulated surface as the tires.
  const rv=[],ri=[];const steps=1300,width=4.7;
  for(let i=0;i<=steps;i++){
    const t=i/steps,c=roadPoint(t),n=roadPoint(t+.0001),dx=n.x-c.x,dz=n.z-c.z,len=Math.hypot(dx,dz);
    for(let j=0;j<=4;j++) {const s=(j/4*2-1)*width,x=c.x+dz/len*s,z=c.z-dx/len*s;rv.push(x,terrainHeight(x,z)+.07,z);}
    if(i<steps)for(let j=0;j<4;j++){const a=i*5+j;ri.push(a,a+5,a+1,a+1,a+5,a+6);}
  }
  const roadGeo=new THREE.BufferGeometry();roadGeo.setAttribute('position',new THREE.Float32BufferAttribute(rv,3));roadGeo.setIndex(ri);roadGeo.computeVertexNormals();
  const road=new THREE.Mesh(roadGeo,mat('#ccbe97'));road.receiveShadow=true;scene.add(road);
  // A still, turquoise lake, with long spare glints of sunlight.
  const waterGeo=new THREE.CircleGeometry(1,72);waterGeo.rotateX(-Math.PI/2);
  const water=new THREE.Mesh(waterGeo,new THREE.MeshStandardMaterial({color:'#70a9a8',roughness:.48,metalness:.12,transparent:true,opacity:.96}));
  water.scale.set(LAKE.rx*1.11,1,LAKE.rz*1.11);water.position.set(LAKE.x,LAKE.y,LAKE.z);scene.add(water);
  const rippleMat=new THREE.MeshBasicMaterial({color:'#c0d9cc',transparent:true,opacity:.32});
  const ripples=[];
  for(let i=0;i<32;i++){
    const x=LAKE.x+(rand()-.5)*LAKE.rx*1.8,z=LAKE.z+(rand()-.5)*LAKE.rz*1.8;
    if(lakeDistance(x,z)>.88)continue;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2+rand()*8,.10+rand()*.13),rippleMat);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,LAKE.y+.045,z);scene.add(mesh);ripples.push(mesh);
  }
  // Angular, layered peaks have irregular silhouettes and continuous snow caps.
  const mountainMat=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1});
  function mountain(x,z,r,h,tone){
    const verts=[],cols=[];const n=11,rings=6;const jitter=Array.from({length:n},()=>.80+rand()*.4);
    const snow=new THREE.Color('#e6e8da'),rock=new THREE.Color(tone);
    const points=[];
    for(let j=0;j<=rings;j++){
      const f=j/rings,rr=r*(1-f);
      for(let k=0;k<n;k++){const a=k/n*Math.PI*2;points.push(new THREE.Vector3(x+Math.cos(a)*rr*jitter[k]+f*r*.13,terrainHeight(x,z)-18+h*f+(j>0&&j<rings?(rand()-.5)*h*.12:0),z+Math.sin(a)*rr*jitter[k]));}
    }
    function tri(a,b,c){for(const idx of [a,b,c]){const v=points[idx];verts.push(v.x,v.y,v.z);}const height=(points[a].y+points[b].y+points[c].y)/3;const f=(height-terrainHeight(x,z)+18)/h;const color=f>.64?snow.clone():rock.clone();color.multiplyScalar(.90+rand()*.16);for(let k=0;k<3;k++)cols.push(color.r,color.g,color.b);}
    for(let j=0;j<rings;j++)for(let k=0;k<n;k++){const a=j*n+k,b=j*n+(k+1)%n,c=(j+1)*n+k,d=(j+1)*n+(k+1)%n;tri(a,c,b);if(j<rings-1)tri(b,c,d);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,mountainMat);scene.add(mesh);
  }
  for(let i=0;i<26;i++){const a=i/26*Math.PI*2,dist=500+rand()*155;mountain(Math.sin(a)*dist,Math.cos(a)*dist,95+rand()*100,115+rand()*135,['#8caaa3','#97aaa8','#9eafb0','#899e99'][i%4]);}
  // Instanced vegetation keeps the whole valley light enough for tablets.
  const trees=[];
  for(let i=0;i<1900;i++){
    const x=(rand()-.5)*1000,z=(rand()-.5)*1000,d=Math.hypot(x,z);
    if(boundaryClearance(x,z)||habitatClearance(x,z)||reservedScenery(x,z)||d>490||d<30||lakeDistance(x,z)<1.28||roadDistance(x,z)<9||Math.hypot(x-SPAWN.x,z-SPAWN.z)<15)continue;
    if(Math.sin(x*.034)*Math.cos(z*.042)<-.28&&rand()<.9)continue;
    trees.push({x,z,y:terrainHeight(x,z),s: .65+rand()*1.0,rotation:rand()*Math.PI});
  }
  const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.19,.28,3,5),mat('#7d8061'),trees.length);
  const foliageMat=mat('#ffffff');
  const layers=[new THREE.InstancedMesh(new THREE.ConeGeometry(2.2,5.5,5),foliageMat,trees.length),new THREE.InstancedMesh(new THREE.ConeGeometry(1.75,4.7,5),foliageMat,trees.length),new THREE.InstancedMesh(new THREE.ConeGeometry(1.25,3.6,5),foliageMat,trees.length)];
  const dummy=new THREE.Object3D();
  trees.forEach((t,i)=>{
    dummy.position.set(t.x,t.y+t.s*1.5,t.z);dummy.scale.setScalar(t.s);dummy.rotation.set(0,t.rotation,0);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);
    const color=new THREE.Color().setHSL(.24+rand()*.065,.15+rand()*.12,.29+rand()*.13);
    layers.forEach((l,j)=>{dummy.position.y=t.y+t.s*(4.0+j*1.8);dummy.updateMatrix();l.setMatrixAt(i,dummy.matrix);l.setColorAt(i,color);});
    if(Math.hypot(t.x,t.z)<365)obstacles.push({x:t.x,z:t.z,radius:.28*t.s});
  });
  for(const mesh of [trunk,...layers]){mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);}
  const rocks=[];
  for(let i=0;i<290;i++){
    const x=(rand()-.5)*700,z=(rand()-.5)*700;
    if(boundaryClearance(x,z)||habitatClearance(x,z)||reservedScenery(x,z)||lakeDistance(x,z)<1.13||roadDistance(x,z)<7||Math.hypot(x-SPAWN.x,z-SPAWN.z)<12)continue;
    rocks.push({x,z,s:.5+rand()*2.4});
  }
  const rockMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),mat('#999f88'),rocks.length);
  rocks.forEach((r,i)=>{dummy.position.set(r.x,terrainHeight(r.x,r.z)+r.s*.25,r.z);dummy.scale.set(r.s*1.35,r.s*.7,r.s);dummy.rotation.set(rand(),rand()*6,rand());dummy.updateMatrix();rockMesh.setMatrixAt(i,dummy.matrix);if(r.s>1.2)obstacles.push({x:r.x,z:r.z,radius:r.s*.85});});rockMesh.castShadow=true;rockMesh.receiveShadow=true;scene.add(rockMesh);
  // A small A-frame cabin makes a recognisable place to come home to.
  const cabin=new THREE.Group(),cx=-61,cz=106,cy=terrainHeight(cx,cz);cabin.position.set(cx,cy,cz);cabin.rotation.y=.35;
  function cube(w,h,d,x,y,z,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;cabin.add(m);return m;}
  cube(6,3.3,6,0,1.65,0,'#a87851');
  const roofGeo=new THREE.CylinderGeometry(4.65,4.65,7.5,3,1);roofGeo.rotateX(Math.PI/2);roofGeo.rotateZ(Math.PI);const roof=new THREE.Mesh(roofGeo,mat('#727e72'));roof.scale.y=.90;roof.position.y=3.4;cabin.add(roof);roof.castShadow=true;
  cube(1.2,2.3,.1,-.6,1.2,3.06,'#4c6659');cube(1.2,1.05,.11,1.5,2,3.08,'#e5cb87');cube(1.25,.07,.13,1.5,2,3.14,'#e2d1a9');cube(.07,1.1,.13,1.5,2,3.14,'#e2d1a9');cube(7,.22,2,0,.1,4,'#bca881');scene.add(cabin);obstacles.push({x:cx,z:cz,radius:5});
  // Low wooden trail posts.
  const postMat=mat('#a49a71');
  for(let i=0;i<36;i++){
    const t=i/36,p=roadPoint(t),q=roadPoint(t+.001),dx=q.x-p.x,dz=q.z-p.z,l=Math.hypot(dx,dz),x=p.x+dz/l*6.2,z=p.z-dx/l*6.2;
    const post=new THREE.Mesh(new THREE.BoxGeometry(.20,1.1,.20),postMat);post.position.set(x,terrainHeight(x,z)+.55,z);post.castShadow=true;scene.add(post);
  }
  const landmarks=buildLandmarks(scene,obstacles);
  const boundary=buildBoundary(scene);
  return { obstacles, ripples, landmarks, boundary };
}
