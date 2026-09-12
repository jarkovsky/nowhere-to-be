import * as THREE from 'three';
import { terrainHeight, lakeDistance, randomGenerator } from './terrain.js';
import { trailSite } from './discoveries.js';
const rand=randomGenerator(7721);
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
  const animals=[animal('deer'),animal('deer'),animal('ducks'),animal('ducks'),animal('ducks'),animal('ducks')];
  for(const a of animals){a.root.visible=false;scene.add(a.root);}
  const sheep=Array.from({length:4},(_,i)=>{const a=animal('sheep');a.root.position.set(-47+i*3,terrainHeight(-47+i*3,91+i%2*4),91+i%2*4);a.root.rotation.y=i*.7;scene.add(a.root);return a;});
  const rabbit=animal('rabbit'),burrow={x:-161,z:38};scene.add(rabbit.root);
  const hole=new THREE.Mesh(new THREE.CircleGeometry(.9,18),new THREE.MeshStandardMaterial({color:'#3e3b30',side:THREE.DoubleSide}));hole.rotation.x=-Math.PI/2;hole.position.set(burrow.x,terrainHeight(burrow.x,burrow.z)+.1,burrow.z);scene.add(hole);
  let rabbitPhase=0,rabbitWait=0,rabbitHidden=false;
  let time=0,nextEncounter=7,encounter=0,active=null,seen=new Set();
  function clearRoute(start,end){
    for(let i=0;i<=16;i++){const t=i/16,x=start.x+(end.x-start.x)*t,z=start.z+(end.z-start.z)*t;if(lakeDistance(x,z)<1.28||Math.hypot(x,z)>345)return false;}
    const dx=end.x-start.x,dz=end.z-start.z,den=dx*dx+dz*dz;
    return !obstacles.some(o=>{const t=THREE.MathUtils.clamp(((o.x-start.x)*dx+(o.z-start.z)*dz)/den,0,1);return Math.hypot(o.x-start.x-dx*t,o.z-start.z-dz*t)<o.radius+.7;});
  }
  function spawn(state){
    for(let attempt=0;attempt<12;attempt++){
      const heading=state.heading+(rand()-.5)*1.3,forward=23+rand()*15,side=attempt%2?-1:1,s=Math.sin(heading),c=Math.cos(heading);
      const cx=state.x-s*forward,cz=state.z-c*forward;
      const start={x:cx-c*23*side,z:cz+s*23*side},end={x:cx+c*23*side,z:cz-s*23*side};
      if(!clearRoute(start,end))continue;
      const kind=encounter++%2?'ducks':'deer';
      active={kind,start,end,begin:time,duration:kind==='deer'?12:10};
      
      return;
    }
  }
  return {
    getState:()=>({time,encounters:encounter,active:active?.kind??null,visible:animals.filter(a=>a.root.visible).length,sheep:sheep.length,rabbitHidden}),
    update(dt,state,playing){
      if(!playing)return;time+=dt;
      for(const [i,a] of sheep.entries()){a.legs[0].rotation.z=-.3+Math.sin(time*1.2+i)*.22;a.root.position.y=terrainHeight(a.root.position.x,a.root.position.z)+Math.sin(time*1.5+i)*.025;if(Math.hypot(state.x-a.root.position.x,state.z-a.root.position.z)<24&&!seen.has('sheep')){seen.add('sheep');onSticker('sheep');}}
      const near=Math.hypot(state.x-burrow.x,state.z-burrow.z)<25;
      if(near&&!seen.has('rabbit')){seen.add('rabbit');onSticker('rabbit');}
      if(near&&!rabbitHidden)rabbitPhase=Math.min(1,rabbitPhase+dt*.25);
      if(rabbitPhase>=1){rabbitHidden=true;rabbitWait+=dt;if(!near&&rabbitWait>8){rabbitHidden=false;rabbitPhase=0;rabbitWait=0;}}
      rabbit.root.visible=!rabbitHidden;
      const rx=burrow.x-7*(1-rabbitPhase),rz=burrow.z+2*(1-rabbitPhase);rabbit.root.position.set(rx,terrainHeight(rx,rz)+Math.abs(Math.sin(time*9))*.3,rz);rabbit.root.rotation.y=Math.atan2(2,7);rabbit.root.scale.setScalar(Math.min(1,(1-rabbitPhase)*6));

      if(!active&&time>=nextEncounter){spawn(state);nextEncounter=time+28+rand()*15;}
      if(!active)return;
      const {start,end,begin,duration,kind}=active,dx=end.x-start.x,dz=end.z-start.z;
      let index=0;
      for(const a of animals){
        if(a.kind!==kind){a.root.visible=false;continue;}
        const t=(time-begin-index*.65)/duration;index++;
        a.root.visible=t>=0&&t<=1;if(!a.root.visible)continue;
        const x=start.x+dx*t,z=start.z+dz*t;
        if(Math.hypot(x-state.x,z-state.z)<30&&!seen.has(kind)){seen.add(kind);onDiscovery(kind==='deer'?'Some deer are out for a stroll.':'Make way for the ducklings!');onSticker(kind);}
        const hop=kind==='rabbit'?Math.abs(Math.sin((time-begin)*7-index))*.30:Math.abs(Math.sin((time-begin)*5-index))*.065;
        a.root.position.set(x,terrainHeight(x,z)+hop,z);a.root.rotation.y=Math.atan2(-dz,dx);
        a.root.scale.setScalar(Math.min(1,t*8,(1-t)*8)*(kind==='deer'&&index===2?.78:kind==='ducks'&&index>1?.55:1));
        if(kind==='deer')a.legs.forEach((leg,i)=>leg.rotation.z=Math.sin(time*7+(i===0||i===3?0:Math.PI))*.42);
        else a.body.rotation.z=Math.sin(time*7)*.10;
      }
      if(time-begin>duration+2){active=null;for(const a of animals)a.root.visible=false;}
    }
  };
}
