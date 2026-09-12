import './style.css';
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createCar } from './car.js';
import { terrainHeight, SPAWN } from './terrain.js';
import { createCarState, resetCar, stepDriving } from './driving.js';
import { createAudio } from './audio.js';
import { chassisPose, settleWheels } from './suspension.js';
import { createAtmosphere } from './atmosphere.js';
import { createWildlife } from './wildlife.js';
import { createSurfaces } from './surfaces.js';
import { createJournal, STICKERS, PLACES, CAMP, COLORS, TUNNEL, SURFACES, drivingHeight } from './discoveries.js';
import { stickerArt } from './stickers.js';
import { createTiltSteering } from './tilt.js';

const $=id=>document.getElementById(id);
const state=createCarState(), keys=new Set(), pointers=new Map();
let atmosphere,wildlife,surfaces;
let storage;try{storage=window.localStorage;}catch{/* Private browsing: session memories still work. */}
const journal=createJournal(storage);
let camping=false,bookPage='places',adventureFromMenu=false;
if(journal.get().camp)Object.assign(state,CAMP);

let started=false, paused=false, explorer=false, renderer, scene, camera, car, world, lastTime=0, elapsed=0;
const sound=createAudio();
const menu=$('menu');
const tilt=createTiltSteering(window,updateTiltUI);
function updateTiltUI(info){
  $('tilt-toggle').setAttribute('aria-pressed',String(info.enabled));
  $('tilt-toggle').disabled=info.pending;
  $('tilt-caption').textContent={off:'Off · turn your device to steer',permission:'Allow motion access…',waiting:'Hold like a wheel. Finding center…',centering:'Hold comfortably. Finding center…',ready:'On · turn gently left or right',upright:'Lift the screen a little to steer',insecure:'Needs a secure HTTPS game link',unsupported:'Motion isn’t supported here',denied:'Motion access was not allowed',unavailable:'No motion readings. Try again.'}[info.status];
  $('tilt-center').hidden=!info.enabled;
  if(['insecure','unsupported','denied','unavailable'].includes(info.status)){
    state.speed=0;clearInput();
    reportIssue({insecure:'Tilt needs HTTPS. Open a secure game link; arrow controls still work here.',unsupported:'This device has no available motion controls. You can use the arrows.',denied:'Motion access wasn’t allowed. You can try again or use the arrows.',unavailable:'No motion readings arrived. Try Tilt steering again, or use the arrows.'}[info.status]);
  }
}
$('tilt-toggle').addEventListener('click',()=>{
  clearInput();state.speed=0;state.steering=0;$('menu-feedback').hidden=true;
  if(tilt.getState().enabled)tilt.disable();else tilt.enable();
  $('tilt-toggle').blur();
});
$('tilt-center').addEventListener('click',()=>{clearInput();state.steering=0;tilt.center();$('tilt-center').blur();});
function reportIssue(message){$('menu-feedback').textContent=message;$('menu-feedback').hidden=false;}
function clearInput(){tilt.center();keys.clear();pointers.clear();document.querySelectorAll('[data-control]').forEach(b=>b.classList.remove('pressed'));}
function openMenu(){if(!started||adventure.open)return;clearInput();paused=true;state.speed=0;$('camp-action').hidden=camping||Math.hypot(state.x-CAMP.x,state.z-CAMP.z)>20;$('camp-evening').hidden=!camping;$('pause').setAttribute('aria-expanded','true');if(!menu.open)menu.showModal();}

function closeMenu(){menu.close();paused=false;clearInput();$('pause').setAttribute('aria-expanded','false');}
function goHome(){camping=false;document.body.classList.remove('camping');$('camp-evening').hidden=true;resetCar(state);if(journal.get().camp)Object.assign(state,CAMP);clearInput();if(camera){updateCar(0);snapCamera();}}
$('start').addEventListener('click',()=>{
  started=true;document.body.classList.add('playing');$('welcome').hidden=true;$('welcome-footer').hidden=true;$('landscape-caption').hidden=true;$('touch-controls').hidden=false;$('pause').hidden=false;
  $('start').blur();clearInput();
});
$('explorer').addEventListener('click',()=>{explorer=!explorer;$('explorer').setAttribute('aria-pressed',String(explorer));$('mode-caption').textContent=explorer?'Auto-drive on · just steer':'Auto-drive off';$('explorer').blur();});
$('sky').addEventListener('click',()=>{const preset=atmosphere?.cycle();if(preset)$('sky').setAttribute('aria-label',`Change sky (currently ${preset})`);$('sky').blur();});
$('home').addEventListener('click',()=>{goHome();closeMenu();});
$('pause').addEventListener('click',openMenu);$('close-menu').addEventListener('click',closeMenu);$('resume').addEventListener('click',closeMenu);
menu.addEventListener('cancel',e=>{e.preventDefault();closeMenu();});
menu.addEventListener('click',e=>{if(e.target===menu){const r=menu.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeMenu();}});
$('sound').addEventListener('click',async()=>{try{const enabled=await sound.toggle();$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'Turn sound off':'Turn sound on');$('sound-waves').setAttribute('d',enabled?'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14':'m16 9 6 6m0-6-6 6');$('sound').blur();}catch{reportIssue('Sound is unavailable in this browser.');}});
const adventure=$('adventure-dialog');
function saveChoices(patch){const saved=journal.save(patch);if(!saved)reportIssue('We’ll keep these memories for this outing. Browser saving is unavailable.');renderChoices();}
function discover(id){if(!journal.discover(id))return;$('sticker-count').textContent=`${journal.get().found.length} / ${STICKERS.length}`;}
function renderBook(){
  const found=journal.get().found;
  $('sticker-grid').innerHTML=STICKERS.filter(s=>bookPage==='places'?PLACES.some(p=>p.id===s.id):!PLACES.some(p=>p.id===s.id)).map(s=>{const unlocked=found.includes(s.id);return `<article class="sticker-card ${unlocked?'':'locked'}">${unlocked?`<span class="found-tag">FOUND TOGETHER</span>${stickerArt(s.id)}`:'<div class="unfound-picture" aria-hidden="true">?</div>'}<strong>${s.name}</strong><p>${unlocked?s.story:s.hint}</p></article>`;}).join('');
  $('save-note').textContent=journal.isPersistent()?'Kept in this browser, ready for your next adventure.':'Kept for this outing. Browser saving is unavailable.';
}
function renderChoices(){
  const choices=journal.get();if(car)car.customize(COLORS[choices.color],choices.decoration);
  document.querySelector('.car-preview').style.setProperty('--car-color',COLORS[choices.color]);$('decoration-preview').textContent={none:'',flag:'⚑',teddy:'🧸'}[choices.decoration];
  for(const type of ['color','decoration','horn'])document.querySelectorAll(`[data-${type}]`).forEach(b=>{const active=b.dataset[type]===choices[type];b.setAttribute('aria-pressed',String(active));if(type==='color')b.textContent=active?'✓':'';});
  $('sticker-count').textContent=`${choices.found.length} / ${STICKERS.length}`;
  $('home').querySelector('span').textContent=choices.camp?'Back to our campsite':'Back to the meadow';
}
function openAdventure(panel){adventureFromMenu=menu.open;if(menu.open)menu.close();$('pause').setAttribute('aria-expanded','true');clearInput();paused=true;state.speed=0;$('book-panel').hidden=panel!=='book';$('car-panel').hidden=panel!=='car';$('adventure-title').textContent=panel==='book'?'Our discovery scrapbook.':'A car that feels like us.';$('adventure-eyebrow').textContent=panel==='book'?'LITTLE THINGS, LOVELY MEMORIES':'PACK A LITTLE PERSONALITY';renderBook();renderChoices();if(!adventure.open)adventure.showModal();}
function closeAdventure(){adventure.close();if(adventureFromMenu)openMenu();else{paused=false;clearInput();$('pause').setAttribute('aria-expanded','false');}}
$('close-adventure').addEventListener('click',closeAdventure);adventure.addEventListener('cancel',e=>{e.preventDefault();closeAdventure();});
$('scrapbook').addEventListener('click',()=>openAdventure('book'));$('camp-book').addEventListener('click',()=>openAdventure('book'));$('customize').addEventListener('click',()=>openAdventure('car'));
for(const button of document.querySelectorAll('[data-page]'))button.addEventListener('click',()=>{bookPage=button.dataset.page;document.querySelectorAll('[data-page]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderBook();});
$('color-options').innerHTML=Object.entries(COLORS).map(([name,color])=>`<button data-color="${name}" style="--swatch:${color}" aria-label="${name[0].toUpperCase()+name.slice(1)} car" aria-pressed="false"></button>`).join('');
for(const type of ['color','decoration','horn'])for(const button of document.querySelectorAll(`[data-${type}]`))button.addEventListener('click',()=>{saveChoices({[type]:button.dataset[type]});if(type==='horn')honk();});
async function honk(){try{await sound.horn(journal.get().horn);$('sound').setAttribute('aria-pressed','true');$('sound').setAttribute('aria-label','Turn sound off');$('sound-waves').setAttribute('d','M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14');}catch{reportIssue('Sound is unavailable in this browser.');}}
$('horn').addEventListener('click',()=>{honk();$('horn').blur();});
$('camp-action').addEventListener('click',()=>{
  if(Math.hypot(state.x-CAMP.x,state.z-CAMP.z)>20||Math.abs(state.speed)>.8)return;
  camping=true;state.speed=0;clearInput();Object.assign(state,CAMP);updateCar(0);discover('campsite');saveChoices({camp:true});atmosphere.setPreset('night');$('sky').setAttribute('aria-label','Change sky (currently night)');document.body.classList.add('camping');$('camp-evening').hidden=false;$('camp-action').hidden=true;snapCamera();closeMenu();
});
$('next-outing').addEventListener('click',()=>{goHome();atmosphere.setPreset('day');$('sky').setAttribute('aria-label','Change sky (currently day)');closeMenu();});
renderChoices();
const controlCodes=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space'];
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'&&started&&!menu.open&&!adventure.open){e.preventDefault();openMenu();return;}
  if(!started||paused||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.code==='KeyH'&&!e.repeat){honk();return;}
  if(e.code==='KeyB'&&!e.repeat){openAdventure('book');return;}
  if(e.code==='KeyC'&&!e.repeat){openAdventure('car');return;}
  if(camping)return;
  if(e.code==='KeyR'&&!e.repeat){goHome();return;}
  if(controlCodes.includes(e.code)){e.preventDefault();keys.add(e.code);}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInput();tilt.suspend();if(started&&!tilt.getState().pending)openMenu();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();tilt.suspend();if(started)openMenu();}});
for(const button of document.querySelectorAll('[data-control]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();if(paused||!started||camping)return;button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,button.dataset.control);button.classList.add('pressed');});
  const release=e=>{pointers.delete(e.pointerId);if(![...pointers.values()].includes(button.dataset.control))button.classList.remove('pressed');};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);button.addEventListener('contextmenu',e=>e.preventDefault());
}
function input(){const touch=new Set(pointers.values()),motion=tilt.getState();return {forward:keys.has('ArrowUp')||keys.has('KeyW')||touch.has('forward'),backward:keys.has('ArrowDown')||keys.has('KeyS')||touch.has('backward'),left:keys.has('ArrowLeft')||keys.has('KeyA')||touch.has('left'),right:keys.has('ArrowRight')||keys.has('KeyD')||touch.has('right'),brake:keys.has('Space')||touch.has('brake')||motion.pending||(motion.enabled&&!motion.ready),tilt:motion.steering,explorer};}
const look=new THREE.Vector3(),desiredCamera=new THREE.Vector3();
let cameraHeading=SPAWN.heading;
function cameraGoal(){
  if(camping){const f=world.landmarks.fire;desiredCamera.set(CAMP.x-22,drivingHeight(CAMP.x,CAMP.z)+9,CAMP.z+24);look.set(f.x,f.y+9,f.z);}
  else if(!started){desiredCamera.set(state.x+43,terrainHeight(state.x,state.z)+25,state.z+54);look.set(state.x-13,terrainHeight(state.x,state.z)+24,state.z-40);}
  else {const compact=innerWidth<700;const inTunnel=Math.hypot(state.x-TUNNEL.x,state.z-TUNNEL.z)<28;const chase=inTunnel?9:23;desiredCamera.set(state.x+Math.sin(cameraHeading)*chase+Math.cos(cameraHeading)*(inTunnel?0:6),drivingHeight(state.x,state.z)+(inTunnel?3.8:9),state.z+Math.cos(cameraHeading)*chase-Math.sin(cameraHeading)*(inTunnel?0:6));desiredCamera.y=Math.max(desiredCamera.y,terrainHeight(desiredCamera.x,desiredCamera.z)+(inTunnel?2:6));look.set(state.x-Math.sin(state.heading)*(compact?2:6),drivingHeight(state.x,state.z)+(inTunnel?2:compact?2:5),state.z-Math.cos(state.heading)*(compact?2:6));}
}
function snapCamera(){cameraHeading=state.heading;cameraGoal();camera.position.copy(desiredCamera);camera.lookAt(look);}
function updateCar(dt){
  const surface=chassisPose(state.x,state.z,state.heading);
  car.root.position.set(state.x,surface.height,state.z);car.root.rotation.order='YXZ';car.root.rotation.y=state.heading;
  car.root.rotation.x=dt===0?surface.pitch:THREE.MathUtils.damp(car.root.rotation.x,surface.pitch,14,dt);
  car.root.rotation.z=dt===0?surface.roll:THREE.MathUtils.damp(car.root.rotation.z,surface.roll,14,dt);
  car.body.rotation.z=THREE.MathUtils.damp(car.body.rotation.z,-state.steering*state.speed*.0025,6,dt);
  car.wheels.forEach(w=>{w.pivot.rotation.y=w.front?state.steering*.32:0;w.spin.rotation.x-=state.speed*dt/.59;});
  settleWheels(car);
}
function resize(){if(!renderer)return;renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<800?1.5:1.75));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<700?60:50;camera.updateProjectionMatrix();}
function frame(time){
  requestAnimationFrame(frame);
  const dt=Math.min((time-lastTime)/1000||0,.05);lastTime=time;elapsed+=dt;
  tilt.update(dt,started&&!paused&&!camping);
  $('tilt-toggle').style.setProperty('--wheel-turn',`${-tilt.getState().steering*35}deg`);
  if(started&&!paused&&!camping){
    stepDriving(state,input(),dt,world.obstacles);
    updateCar(dt);
    cameraHeading+=Math.atan2(Math.sin(state.heading-cameraHeading),Math.cos(state.heading-cameraHeading))*(1-Math.exp(-2.4*dt));
  }
  cameraGoal();camera.position.lerp(desiredCamera,1-Math.exp(-3*dt));camera.lookAt(look);
  const active=started&&!paused;
  world.landmarks.update(dt,!paused);car.animate(elapsed);surfaces.update(dt,state,active&&!camping);
  if(active&&!camping){
    for(const place of PLACES)if(Math.hypot(state.x-place.x,state.z-place.z)<place.radius)discover(place.id);

  }
  atmosphere.update(dt,state,started&&!paused);
  document.body.classList.toggle('night',atmosphere.getState().day<.4);
  wildlife.update(dt,state,started&&!paused);
  sun.target.position.set(state.x,0,state.z);sun.target.updateMatrixWorld();
  sound.update(state.speed,started&&!paused&&!document.hidden,(menu.open||adventure.open)&&!document.hidden);
  world.ripples.forEach((r,i)=>{r.scale.x=1+Math.sin(elapsed*.35+i)*.14;});
  if(!document.hidden)renderer.render(scene,camera);
}
let sun;
try{
  scene=new THREE.Scene();scene.background=new THREE.Color('#dce5da');scene.fog=new THREE.FogExp2('#dce5da',.00165);
  renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.5,1800);
  const ambient=new THREE.HemisphereLight('#eef5ee','#788567',1.8);scene.add(ambient);
  sun=new THREE.DirectionalLight('#fff0cc',2.4);sun.position.set(-90,160,-85);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;sun.shadow.camera.near=1;sun.shadow.camera.far=450;sun.shadow.normalBias=.07;sun.shadow.bias=-.00015;scene.add(sun);scene.add(sun.target);
  world=buildWorld(scene);car=createCar();scene.add(car.root);atmosphere=createAtmosphere(scene,sun,ambient,car);wildlife=createWildlife(scene,world.obstacles,()=>{},discover);surfaces=createSurfaces(scene,sound,()=>{});renderChoices();updateCar(0);resize();snapCamera();
  $('start-label').textContent='Let’s wander';$('start').disabled=false;
  window.addEventListener('resize',resize);
  $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;clearInput();$('error').hidden=false;});
  requestAnimationFrame(frame);
  // Development-only scene traversal and diagnostics for browser smoke tests.
  if(import.meta.env.DEV)window.__littleWilds={getObstacles:()=>world.obstacles.map(o=>({...o})),visit:(id)=>{const p=[...PLACES,...SURFACES].find(p=>p.id===id);if(p){Object.assign(state,{x:p.x-(id==='waterfall'?16:0),z:p.z,speed:0,heading:id==='waterfall'?-Math.PI/2:p.dx!==undefined?Math.atan2(-p.dx,-p.dz):state.heading});updateCar(0);snapCamera();}},getState:()=>({...state,started,paused,explorer,carHeight:car.root.position.y,groundHeight:terrainHeight(state.x,state.z),input:input(),atmosphere:atmosphere.getState(),wildlife:wildlife.getState(),render:renderer.info.render,camping,journal:journal.get(),surfaces:surfaces.getState(),tilt:tilt.getState()})};
}catch(error){console.error(error);$('error').hidden=false;}
