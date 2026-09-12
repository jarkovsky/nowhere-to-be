import * as THREE from 'three';
import { randomGenerator, terrainHeight } from './terrain.js';
const clamp=THREE.MathUtils.clamp, smooth=THREE.MathUtils.smoothstep;
export const SKY_PRESETS=['automatic','sunset','night','rain','day'];
export function skyConditions(time, preset='automatic') {
  const phase=(time/300+.20)%1;
  let altitude=Math.sin(phase*Math.PI*2);
  let rain=smooth(Math.sin(time/27-2.1),.60,.92)*.75;
  if(preset==='sunset'){altitude=.04;rain=0;}
  if(preset==='night'){altitude=-.8;rain=0;}
  if(preset==='day'){altitude=.95;rain=0;}
  if(preset==='rain'){altitude=.5;rain=.95;}
  const day=smooth(altitude,-.18,.38);
  const sunset=(1-smooth(Math.abs(altitude),.04,.38))*(1-rain);
  return {day,sunset,rain,altitude,phase,label:rain>.4?'A little passing rain':day<.25?'Under the stars':sunset>.45?'The golden hour':'A little sunshine'};
}
export function createAtmosphere(scene, sun, ambient, car) {
  const random=randomGenerator(1538);
  let preset='automatic',time=0,day=1,sunset=0,rain=0,label='A little sunshine';
  const sky=new THREE.Color(),nightSky=new THREE.Color('#233a55'),daySky=new THREE.Color('#dce5da'),sunsetSky=new THREE.Color('#efb38c'),rainSky=new THREE.Color('#aebfc0');
  const sunDay=new THREE.Color('#fff0cc'),sunEvening=new THREE.Color('#ffc087'),sunNight=new THREE.Color('#9abadd');
  const sphere=new THREE.SphereGeometry(1,16,12);
  const sunDisc=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color:'#fff0c2',fog:false}));sunDisc.scale.setScalar(18);scene.add(sunDisc);
  const moon=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color:'#f3efcf',fog:false}));moon.scale.setScalar(11);scene.add(moon);
  const starPositions=[];
  for(let i=0;i<450;i++){const a=random()*Math.PI*2,y=.10+random()*.90,r=Math.sqrt(1-y*y);starPositions.push(Math.sin(a)*r*1100,y*1100,Math.cos(a)*r*1100);}
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
  const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:'#fff3d2',size:2.0,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false}));scene.add(stars);
  const lightTargets=[],headlights=[];
  for(const x of [-.76,.76]){
    const light=new THREE.SpotLight('#fff0bd',0,75,Math.PI*.22,.62,1.1);light.position.set(x,1.3,-1.9);
    const target=new THREE.Object3D();target.position.set(x,0,-24);car.root.add(light,target);light.target=target;lightTargets.push(target);headlights.push(light);
  }
  const rainCount=600,rainPositions=new Float32Array(rainCount*6),rainSeeds=[];
  for(let i=0;i<rainCount;i++)rainSeeds.push({x:(random()-.5)*75,z:(random()-.5)*75,y:random()*35,s:9+random()*8});
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
  const rainMesh=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:'#d5e1df',transparent:true,opacity:0,depthWrite:false}));scene.add(rainMesh);
  const flyCount=55,flyPositions=new Float32Array(flyCount*3),flySeeds=[];
  for(let i=0;i<flyCount;i++)flySeeds.push({x:(random()-.5)*100,z:(random()-.5)*100,y:1+random()*3,phase:random()*7});
  const flyGeo=new THREE.BufferGeometry();flyGeo.setAttribute('position',new THREE.BufferAttribute(flyPositions,3));
  const flies=new THREE.Points(flyGeo,new THREE.PointsMaterial({color:'#f5e5a2',size:.15,transparent:true,opacity:0,depthWrite:false}));scene.add(flies);
  return {
    setPreset(value){if(SKY_PRESETS.includes(value))preset=value;},
    cycle(){preset=SKY_PRESETS[(SKY_PRESETS.indexOf(preset)+1)%SKY_PRESETS.length];return preset;},
    getState:()=>({preset,time,day,sunset,rain,label,headlightIntensity:headlights[0].intensity}),
    update(dt,state,active){
      if(active)time+=dt;
      const target=skyConditions(time,preset),factor=1-Math.exp(-dt*.8);
      day+=(target.day-day)*factor;sunset+=(target.sunset-sunset)*factor;rain+=(target.rain-rain)*factor;label=target.label;
      sky.copy(nightSky).lerp(daySky,day).lerp(sunsetSky,sunset*.8).lerp(rainSky,rain*.65);scene.background.copy(sky);scene.fog.color.copy(sky);scene.fog.density=.0013+rain*.0022;
      ambient.intensity=.85+day*.95;ambient.color.set('#9ebbd0').lerp(new THREE.Color('#eef5ee'),day);ambient.groundColor.set('#526477').lerp(new THREE.Color('#788567'),day);
      sun.intensity=Math.max(.25,.40+day*2.0-rain*.9);sun.color.copy(sunNight).lerp(sunDay,day).lerp(sunEvening,sunset);
      const height=80+day*80-sunset*35;sun.position.set(state.x-90,height,state.z-85);
      sunDisc.position.set(state.x-490,120+day*340-sunset*70,state.z-760);sunDisc.visible=day>.35&&rain<.5;
      moon.position.set(state.x+340,420,state.z-820);moon.visible=day<.45;
      stars.position.set(state.x,0,state.z);stars.material.opacity=(1-day)*.85*(1-rain);stars.visible=day<.9;
      for(const light of headlights)light.intensity=(1-day)*48+rain*8;
      rainMesh.visible=rain>.02;rainMesh.material.opacity=rain*.32;
      if(rainMesh.visible){
        for(let i=0;i<rainCount;i++){const s=rainSeeds[i],x=state.x+s.x,y=terrainHeight(state.x,state.z)+((s.y-time*s.s)%35+35)%35,z=state.z+s.z;rainPositions.set([x,y,z,x-.14,y+.85,z+.06],i*6);}
        rainGeo.attributes.position.needsUpdate=true;rainGeo.computeBoundingSphere();
      }
      flies.visible=day<.5;flies.material.opacity=(1-day)*(1-rain)*.85;
      if(flies.visible){for(let i=0;i<flyCount;i++){const f=flySeeds[i],x=state.x+f.x+Math.sin(time*.3+f.phase)*1.4,z=state.z+f.z;flyPositions.set([x,terrainHeight(x,z)+f.y+Math.sin(time+f.phase)*.5,z],i*3);}flyGeo.attributes.position.needsUpdate=true;flyGeo.computeBoundingSphere();}
      return label;
    }
  };
}
