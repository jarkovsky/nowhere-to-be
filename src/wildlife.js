import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { HABITATS, BURROW, animalJourney } from './habitats.js';
function animal(kind){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const fur=new THREE.MeshStandardMaterial({color:kind==='deer'?'#ad8962':'#dfd3b6',roughness:1,flatShading:true});
  const light=new THREE.MeshStandardMaterial({color:'#eee4c9',roughness:1});
  const dark=new THREE.MeshStandardMaterial({color:'#394439',roughness:1});
  function box(w,h,d,x,y,z,material=fur,parent=body){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
  const legs=[];
  if(kind==='deer'){
    box(2.05,.85,.67,0,1.54,0);const neck=box(.49,1.05,.47,.76,2.01,0);neck.rotation.z=-.28;
    box(.91,.45,.43,1.15,2.63,0);box(.19,.22,.44,1.62,2.6,0,dark);
    for(const z of [-.27,.27]){const ear=box(.16,.48,.24,.92,2.97,z);ear.rotation.x=z;}
    for(const z of [-.23,.23])box(.07,.08,.04,1.35,2.75,z,dark);
    box(.25,.40,.36,-1.09,1.6,0,light);
    for(const x of [-.7,.7])for(const z of [-.23,.23]){const pivot=new THREE.Group();pivot.position.set(x,1.3,z);body.add(pivot);box(.18,1.16,.17,0,-.57,0,fur,pivot);box(.2,.18,.19,.04,-1.09,0,dark,pivot);legs.push(pivot);}
  } else if(kind==='ducks'){
    const torso=new THREE.Mesh(new THREE.IcosahedronGeometry(.6,1),light);torso.scale.set(1.3,.65,.75);torso.position.y=.55;body.add(torso);
    const head=box(.45,.5,.4,.65,.98,0,new THREE.MeshStandardMaterial({color:'#4f8064'}));
    box(.4,.11,.28,.99,.85,0,new THREE.MeshStandardMaterial({color:'#dfaa49'}));
    for(const z of [-.22,.22]){box(.06,.07,.035,.81,1.04,z,dark);legs.push(box(.3,.10,.18,.1,.12,z));}
  } else if(kind==='sheep'){
    const wool=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),light);wool.scale.set(1.3,.8,.8);wool.position.y=1.1;body.add(wool);wool.castShadow=true;
    const head=new THREE.Group();head.position.set(1,1,0);body.add(head);box(.65,.5,.5,.1,0,0,dark,head);for(const z of [-.35,.35])box(.3,.16,.25,0,.2,z,fur,head);legs.push(head);
    for(const x of [-.75,.75])for(const z of [-.4,.4])box(.18,.7,.18,x,.35,z,dark);
  } else {
    const torso=new THREE.Mesh(new THREE.IcosahedronGeometry(.58,1),fur);torso.scale.set(1.15,.8,.7);torso.position.y=.48;body.add(torso);torso.castShadow=true;
    box(.48,.44,.4,.49,.77,0);for(const z of [-.13,.13]){const ear=box(.14,.60,.12,.40,1.17,z);ear.rotation.z=.18;box(.06,.07,.025,.7,.83,z*1.65,dark);}
    const tail=new THREE.Mesh(new THREE.IcosahedronGeometry(.18,0),light);tail.position.set(-.62,.58,0);body.add(tail);
    for(const x of [-.34,.4])for(const z of [-.23,.23])legs.push(box(.29,.17,.17,x,.13,z));
  }
  return {root,body,legs,kind};
}
export function createWildlife(scene,obstacles,onDiscovery,onSticker=()=>{}){
  const groups=HABITATS.map(site=>({...site,walking:false,animals:Array.from({length:site.count},(_,i)=>{
    const a=animal(site.kind);a.root.scale.setScalar(site.kind==='deer'&&i===1?.78:site.kind==='ducks'&&i>0?.55:1);scene.add(a.root);return a;
  })}));
  const animals=groups.flatMap(group=>group.animals);
  const sheep=Array.from({length:4},(_,i)=>{const a=animal('sheep');a.root.position.set(-47+i*3,terrainHeight(-47+i*3,91+i%2*4),91+i%2*4);a.root.rotation.y=i*.7;scene.add(a.root);return a;});
  const rabbit=animal('rabbit');scene.add(rabbit.root);
  const hole=new THREE.Mesh(new THREE.CircleGeometry(1.05,18),new THREE.MeshStandardMaterial({color:'#3e3b30',side:THREE.DoubleSide}));hole.rotation.x=-Math.PI/2;hole.position.set(BURROW.x,terrainHeight(BURROW.x,BURROW.z)+.1,BURROW.z);scene.add(hole);
  let time=0,encounters=0,rabbitProgress=0,rabbitWait=0,rabbitReturning=false;
  const seen=new Set();
  function discover(kind){if(!seen.has(kind)){seen.add(kind);onSticker(kind);onDiscovery?.(kind);}}
  function placeRabbit(){
    const p=rabbitProgress,x=BURROW.x-7*(1-p),z=BURROW.z+2*(1-p);
    const underground=THREE.MathUtils.smoothstep(p,.72,1);
    rabbit.root.position.set(x,terrainHeight(x,z)+Math.abs(Math.sin(time*9))*.25*(1-underground)-underground*1.9,z);
    rabbit.root.rotation.y=Math.atan2(2,7)+(rabbitReturning?Math.PI:0);
    rabbit.body.rotation.z=-Math.sin(underground*Math.PI)*.3;
  }
  function placeGroup(group){
    const dx=group.end.x-group.start.x,dz=group.end.z-group.start.z;
    const phase=animalJourney(time,group.wait,group.duration);
    if(phase.walking&&!group.walking)encounters++;
    group.walking=phase.walking;
    group.animals.forEach((a,i)=>{
      // Members keep their size and wait at the ends instead of vanishing.
      const journey=animalJourney(Math.max(0,time-i*.65),group.wait,group.duration);
      const x=group.start.x+dx*journey.progress,z=group.start.z+dz*journey.progress+i*.65;
      a.root.position.set(x,terrainHeight(x,z)+(journey.walking?Math.abs(Math.sin(time*5-i))*.065:0),z);
      a.root.rotation.y=Math.atan2(-dz,dx)+(journey.returning?Math.PI:0);
      if(a.kind==='deer'){
        a.legs.forEach((leg,j)=>leg.rotation.z=journey.walking?Math.sin(time*7+(j===0||j===3?0:Math.PI))*.42:0);
        a.body.rotation.z=journey.walking?0:-.1+Math.sin(time*.8+i)*.04;
      }else a.body.rotation.z=Math.sin(time*(journey.walking?7:1)+i)*(journey.walking?.1:.025);
    });
  }
  groups.forEach(placeGroup);placeRabbit();
  return {
    getState:()=>({time,encounters,active:groups.find(g=>g.walking)?.kind??null,visible:animals.length,sheep:sheep.length,rabbitHidden:rabbitProgress>=1,rabbitProgress,
      animals:animals.map(a=>({kind:a.kind,x:a.root.position.x,y:a.root.position.y,z:a.root.position.z,scale:a.root.scale.x,visible:a.root.visible})),
      rabbit:{x:rabbit.root.position.x,y:rabbit.root.position.y,z:rabbit.root.position.z,scale:rabbit.root.scale.x}}),
    update(dt,state,playing){
      if(!playing)return;time+=dt;
      for(const [i,a] of sheep.entries()){a.legs[0].rotation.z=-.3+Math.sin(time*1.2+i)*.22;a.root.position.y=terrainHeight(a.root.position.x,a.root.position.z)+Math.sin(time*1.5+i)*.025;if(Math.hypot(state.x-a.root.position.x,state.z-a.root.position.z)<24)discover('sheep');}
      const distance=Math.hypot(state.x-BURROW.x,state.z-BURROW.z),near=distance<25;
      if(near&&rabbitProgress<.95)discover('rabbit');
      if(near){rabbitReturning=false;rabbitWait=0;rabbitProgress=Math.min(1,rabbitProgress+dt*.25);}
      else if(rabbitProgress>0){
        rabbitWait+=dt;
        if(distance>32&&rabbitWait>8)rabbitReturning=true;
        if(rabbitReturning)rabbitProgress=Math.max(0,rabbitProgress-dt*.25);
      }
      placeRabbit();
      groups.forEach(placeGroup);
      for(const a of animals)if(Math.hypot(state.x-a.root.position.x,state.z-a.root.position.z)<30)discover(a.kind);
    }
  };
}
