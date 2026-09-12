import { roadPoint, terrainHeight } from './terrain.js';
export function trailSite(t) {
  const p=roadPoint(t), q=roadPoint(t+.0001), length=Math.hypot(q.x-p.x,q.z-p.z);
  return {...p, dx:(q.x-p.x)/length, dz:(q.z-p.z)/length};
}
export const BRIDGE={...trailSite(.13),length:26,width:9};
export const TUNNEL={...trailSite(.65),length:34,width:12};
export const CAMP={x:28,z:-8,heading:Math.PI};
export const PLACES=[
  {id:'waterfall',name:'Whispering falls',icon:'💦',x:184,z:-72,radius:32,hint:'Follow the trail around the far side of the lake.',story:'We stopped to listen to the water tumbling over the rocks.'},
  {id:'bridge',name:'The wooden bridge',icon:'🌉',...BRIDGE,radius:15,hint:'Take the trail east from the meadow.',story:'Over the stream, one wooden plank at a time.'},
  {id:'tunnel',name:'Echo mountain',icon:'⛰️',...TUNNEL,radius:18,hint:'The western trail goes right through a mountain.',story:'A little beep sounded extra lovely inside the mountain.'},
  {id:'campsite',name:'Our secret campsite',icon:'⛺',...CAMP,radius:19,hint:'Look for a little path on the lake’s southwest shore.',story:'A warm fire, a quiet lake, and a sky full of stars.'},
];
export const ANIMAL_STICKERS=[
  {id:'deer',name:'Meadow deer',icon:'🦌',hint:'Watch the trail quietly.',story:'A family of deer took the scenic route too.'},
  {id:'ducks',name:'Make way for ducks',icon:'🦆',hint:'A waddling family visits the trail.',story:'We waited while every last duckling crossed.'},
  {id:'sheep',name:'Woolly neighbours',icon:'🐑',hint:'Look beside the southern meadow trail.',story:'The sheep had all afternoon to finish their lunch.'},
  {id:'rabbit',name:'Home for a rabbit',icon:'🐇',hint:'A little burrow hides beside the western trail.',story:'Two long ears, a little hop, and home again.'},
];
export const STICKERS=[...PLACES,...ANIMAL_STICKERS];
export const SURFACES=[{id:'puddle',...trailSite(.025),rx:9,rz:6},{id:'leaves',...trailSite(.83),rx:18,rz:17},{id:'snow',...trailSite(.58),rx:27,rz:22}];
export function surfaceAt(x,z){return SURFACES.find(p=>Math.hypot((x-p.x)/p.rx,(z-p.z)/p.rz)<1)?.id??'grass';}
export function localPoint(site,along,side=0){return {x:site.x+site.dx*along-site.dz*side,z:site.z+site.dz*along+site.dx*side};}
export function bridgeHeight(x,z){
  const along=(x-BRIDGE.x)*BRIDGE.dx+(z-BRIDGE.z)*BRIDGE.dz;
  const side=-(x-BRIDGE.x)*BRIDGE.dz+(z-BRIDGE.z)*BRIDGE.dx;
  if(Math.abs(side)>BRIDGE.width/2||Math.abs(along)>BRIDGE.length/2)return null;
  return terrainHeight(x,z)+.24+Math.sin((along/BRIDGE.length+.5)*Math.PI)*1.5;
}
export const drivingHeight=(x,z)=>bridgeHeight(x,z)??terrainHeight(x,z);
export const SAVE_KEY='little-wilds-adventures-v1';
export const COLORS={orange:'#d16b38',sage:'#72947d',blue:'#659eaf',berry:'#ac6075',yellow:'#dfbb57'};
export function createJournal(storage){
  let data={found:[],color:'orange',decoration:'none',horn:'beep',camp:false};
  try{const saved=JSON.parse(storage?.getItem(SAVE_KEY)||'null');if(saved&&typeof saved==='object')data={found:Array.isArray(saved.found)?[...new Set(saved.found.filter(id=>STICKERS.some(s=>s.id===id)))]:[],color:Object.hasOwn(COLORS,saved.color)?saved.color:'orange',decoration:['none','flag','teddy'].includes(saved.decoration)?saved.decoration:'none',horn:['beep','bicycle','quack','twinkle'].includes(saved.horn)?saved.horn:'beep',camp:saved.camp===true};}catch{/* A private browser can still keep a journal for this outing. */}
  let persistent=Boolean(storage);
  return {get:()=>({...data,found:[...data.found]}),save(patch){data={...data,...patch};try{storage?.setItem(SAVE_KEY,JSON.stringify(data));persistent=Boolean(storage);}catch{persistent=false;}return persistent;},discover(id){if(data.found.includes(id)||!STICKERS.some(s=>s.id===id))return false;this.save({found:[...data.found,id]});return true;},isPersistent:()=>persistent};
}
