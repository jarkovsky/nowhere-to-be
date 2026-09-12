export const DEFAULT_CRUISE_SPEED=8;
export const MIN_CRUISE_SPEED=4;
export const MAX_CRUISE_SPEED=11;
export const controlSpeed=value=>Number.isFinite(value)?Math.max(MIN_CRUISE_SPEED,Math.min(MAX_CRUISE_SPEED,value)):DEFAULT_CRUISE_SPEED;
// Save keys keep the game's original name so existing saves survive the rename.
const KEY='little-wilds-controls-v1';
export function createControlPreferences(storage){
  let data={cruiseSpeed:DEFAULT_CRUISE_SPEED,tilt:null};
  try{const saved=JSON.parse(storage?.getItem(KEY)||'null');if(saved&&typeof saved==='object')data={cruiseSpeed:controlSpeed(saved.cruiseSpeed),tilt:typeof saved.tilt==='boolean'?saved.tilt:null};}catch{}
  return {get:()=>({...data}),save(patch){data={...data,...patch};try{storage?.setItem(KEY,JSON.stringify(data));}catch{}}};
}
export function shouldAutoTilt(host,preference){return preference!==false&&host.isSecureContext===true&&(host.navigator?.maxTouchPoints||0)>0&&Boolean(host.DeviceOrientationEvent);}
export function createScreenBrake(canvas,isActive){
  const fingers=new Set();
  function down(event){if(event.pointerType!=='touch'||!isActive())return;event.preventDefault();fingers.add(event.pointerId);canvas.setPointerCapture(event.pointerId);}
  function up(event){fingers.delete(event.pointerId);}
  canvas.addEventListener('pointerdown',down);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,up);
  return {held:()=>fingers.size>0,clear:()=>fingers.clear(),dispose(){fingers.clear();canvas.removeEventListener('pointerdown',down);for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.removeEventListener(name,up);}};
}
