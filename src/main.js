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

const $=id=>document.getElementById(id);
const state=createCarState(), keys=new Set(), pointers=new Map();
let atmosphere,wildlife,surfaces;
let storage;try{storage=window.localStorage;}catch{/* Private browsing: session memories still work. */}
const journal=createJournal(storage);
let camping=false,bookPage='places',hintTime=0;
if(journal.get().camp)Object.assign(state,CAMP);

let started=false, paused=false, explorer=false, renderer, scene, camera, car, world, lastTime=0, toastTimer, elapsed=0, borderMessageAt=-10;
const sound=createAudio();
const menu=$('menu');
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4200);}
function clearInput(){keys.clear();pointers.clear();document.querySelectorAll('[data-control]').forEach(b=>b.classList.remove('pressed'));}
function openMenu(){if(adventure.open)return;clearInput();paused=true;state.speed=0;if(!menu.open)menu.showModal();}
function closeMenu(){menu.close();paused=false;clearInput();}
function goHome(){camping=false;document.body.classList.remove('camping');$('camp-evening').hidden=true;resetCar(state);if(journal.get().camp)Object.assign(state,CAMP);clearInput();if(camera){updateCar(0);snapCamera();}toast(journal.get().camp?'Back at our campsite. Ready for another wander?':'Back in the meadow. A new little adventure?');}
$('start').addEventListener('click',()=>{
  started=true;document.body.classList.add('playing');$('welcome').hidden=true;$('welcome-footer').hidden=true;$('landscape-caption').hidden=true;$('hud').hidden=false;$('touch-controls').hidden=false;$('pause').disabled=false;
  $('start').blur();clearInput();toast(matchMedia('(pointer:coarse)').matches?'Hold ↑ to go. Hold an arrow to steer.':'Use the arrow keys or WASD. Let go to slow down.');
});
$('explorer').addEventListener('click',()=>{explorer=!explorer;$('explorer').setAttribute('aria-pressed',String(explorer));$('mode-caption').textContent=explorer?'Auto-drive on · just steer':'Auto-drive off';$('explorer').blur();toast(explorer?'Little explorer is on. Just steer! Hold brake to stop.':'You’re in the driving seat. Hold ↑ to go.');});
$('sky').addEventListener('click',()=>{const preset=atmosphere?.cycle();if(!preset)return;$('sky').setAttribute('aria-label',`Change sky (currently ${preset})`);toast(preset==='automatic'?'Let the sky wander. Day, dusk, and night will pass.':{sunset:'A golden evening in the valley.',night:'Stars above. Headlights on. Look out for fireflies.',rain:'Just a little passing rain.',day:'Hello again, sunshine.'}[preset]);$('sky').blur();});
$('home').addEventListener('click',()=>{goHome();$('home').blur();});
$('help').addEventListener('click',openMenu);$('pause').addEventListener('click',openMenu);$('close-menu').addEventListener('click',closeMenu);$('resume').addEventListener('click',closeMenu);
menu.addEventListener('cancel',e=>{e.preventDefault();closeMenu();});
menu.addEventListener('click',e=>{if(e.target===menu){const r=menu.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeMenu();}});
$('sound').addEventListener('click',async()=>{try{const enabled=await sound.toggle();$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'Turn sound off':'Turn sound on');$('sound-waves').setAttribute('d',enabled?'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14':'m16 9 6 6m0-6-6 6');$('sound').blur();}catch{toast('Sound is unavailable in this browser. You can still explore.');}});
const adventure=$('adventure-dialog');
function saveChoices(patch){const saved=journal.save(patch);if(!saved)toast('We’ll keep these memories for this outing. Browser saving is unavailable.');renderChoices();}
function discover(id){if(!journal.discover(id))return;const sticker=STICKERS.find(s=>s.id===id);$('sticker-count').textContent=`${journal.get().found.length} / ${STICKERS.length}`;toast(`${sticker.icon} ${sticker.name} — a new sticker for our scrapbook!`);}
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
  $('home').querySelector('span').textContent=choices.camp?'Back to our campsite':'Back to the meadow';$('home').title=choices.camp?'Back to our campsite (R)':'Back to the meadow (R)';
}
function openAdventure(panel){clearInput();paused=true;state.speed=0;$('book-panel').hidden=panel!=='book';$('car-panel').hidden=panel!=='car';$('adventure-title').textContent=panel==='book'?'Our discovery scrapbook.':'A car that feels like us.';$('adventure-eyebrow').textContent=panel==='book'?'LITTLE THINGS, LOVELY MEMORIES':'PACK A LITTLE PERSONALITY';renderBook();renderChoices();if(!adventure.open)adventure.showModal();}
function closeAdventure(){adventure.close();paused=false;clearInput();}
$('close-adventure').addEventListener('click',closeAdventure);adventure.addEventListener('cancel',e=>{e.preventDefault();closeAdventure();});
$('scrapbook').addEventListener('click',()=>openAdventure('book'));$('camp-book').addEventListener('click',()=>openAdventure('book'));$('customize').addEventListener('click',()=>openAdventure('car'));
for(const button of document.querySelectorAll('[data-page]'))button.addEventListener('click',()=>{bookPage=button.dataset.page;document.querySelectorAll('[data-page]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderBook();});
$('color-options').innerHTML=Object.entries(COLORS).map(([name,color])=>`<button data-color="${name}" style="--swatch:${color}" aria-label="${name[0].toUpperCase()+name.slice(1)} car" aria-pressed="false"></button>`).join('');
for(const type of ['color','decoration','horn'])for(const button of document.querySelectorAll(`[data-${type}]`))button.addEventListener('click',()=>{saveChoices({[type]:button.dataset[type]});if(type==='horn')honk();});
async function honk(){try{await sound.horn(journal.get().horn);$('sound').setAttribute('aria-pressed','true');$('sound').setAttribute('aria-label','Turn sound off');$('sound-waves').setAttribute('d','M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14');}catch{toast('Sound is unavailable in this browser.');}}
$('horn').addEventListener('click',()=>{honk();$('horn').blur();});
$('camp-action').addEventListener('click',()=>{
  if(Math.hypot(state.x-CAMP.x,state.z-CAMP.z)>20||Math.abs(state.speed)>.8)return;
  camping=true;state.speed=0;clearInput();Object.assign(state,CAMP);updateCar(0);discover('campsite');saveChoices({camp:true});atmosphere.setPreset('night');$('sky').setAttribute('aria-label','Change sky (currently night)');document.body.classList.add('camping');$('camp-evening').hidden=false;$('camp-action').hidden=true;snapCamera();
});
$('next-outing').addEventListener('click',()=>{goHome();atmosphere.setPreset('day');$('sky').setAttribute('aria-label','Change sky (currently day)');toast('A fresh morning. Which way shall we wander?');});
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
window.addEventListener('blur',()=>{clearInput();if(started)openMenu();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(started)openMenu();}});
for(const button of document.querySelectorAll('[data-control]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();if(paused||!started||camping)return;button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,button.dataset.control);button.classList.add('pressed');});
  const release=e=>{pointers.delete(e.pointerId);if(![...pointers.values()].includes(button.dataset.control))button.classList.remove('pressed');};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);button.addEventListener('contextmenu',e=>e.preventDefault());
}
function input(){const touch=new Set(pointers.values());return {forward:keys.has('ArrowUp')||keys.has('KeyW')||touch.has('forward'),backward:keys.has('ArrowDown')||keys.has('KeyS')||touch.has('backward'),left:keys.has('ArrowLeft')||keys.has('KeyA')||touch.has('left'),right:keys.has('ArrowRight')||keys.has('KeyD')||touch.has('right'),brake:keys.has('Space')||touch.has('brake'),explorer};}
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
  if(started&&!paused&&!camping){
    const blocked=stepDriving(state,input(),dt,world.obstacles);
    if(blocked&&elapsed-borderMessageAt>7){toast('A little edge of the world. Reverse and find another path.');borderMessageAt=elapsed;}
    updateCar(dt);
    cameraHeading+=Math.atan2(Math.sin(state.heading-cameraHeading),Math.cos(state.heading-cameraHeading))*(1-Math.exp(-2.4*dt));
    $('speed').textContent=Math.round(Math.abs(state.speed)*3.6);$('distance').textContent=Math.round(state.distance);
  }
  cameraGoal();camera.position.lerp(desiredCamera,1-Math.exp(-3*dt));camera.lookAt(look);
  const active=started&&!paused;
  world.landmarks.update(dt,!paused);car.animate(elapsed);surfaces.update(dt,state,active&&!camping);
  if(active&&!camping){
    for(const place of PLACES)if(Math.hypot(state.x-place.x,state.z-place.z)<place.radius)discover(place.id);
    const nearCamp=Math.hypot(state.x-CAMP.x,state.z-CAMP.z)<20;
    $('camp-action').hidden=!nearCamp;$('camp-action').disabled=Math.abs(state.speed)>.8;$('camp-action').textContent=Math.abs(state.speed)>.8?'Slow down to settle in…':'⛺ Park & watch the stars';
    hintTime+=dt;if(hintTime>.5){hintTime=0;const next=PLACES.filter(p=>!journal.get().found.includes(p.id)).sort((a,b)=>Math.hypot(state.x-a.x,state.z-a.z)-Math.hypot(state.x-b.x,state.z-b.z))[0];$('trail-note').textContent=next?`${next.icon} ${next.name} · ${Math.round(Math.hypot(state.x-next.x,state.z-next.z))} m to wander`:'Every place holds a memory. Shall we visit camp?';}
  }
  const weatherLabel=atmosphere.update(dt,state,started&&!paused);$('sky').title=weatherLabel+' · click to change the sky';
  document.body.classList.toggle('night',atmosphere.getState().day<.4);
  wildlife.update(dt,state,started&&!paused);
  sun.target.position.set(state.x,0,state.z);sun.target.updateMatrixWorld();
  sound.update(state.speed,started&&(!paused||adventure.open)&&!document.hidden);
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
  world=buildWorld(scene);car=createCar();scene.add(car.root);atmosphere=createAtmosphere(scene,sun,ambient,car);wildlife=createWildlife(scene,world.obstacles,toast,discover);surfaces=createSurfaces(scene,sound,toast);renderChoices();updateCar(0);resize();snapCamera();
  $('start-label').textContent='Let’s wander';$('start').disabled=false;
  window.addEventListener('resize',resize);
  $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;clearInput();$('error').hidden=false;});
  requestAnimationFrame(frame);
  // Development-only scene traversal and diagnostics for browser smoke tests.
  if(import.meta.env.DEV)window.__littleWilds={getObstacles:()=>world.obstacles.map(o=>({...o})),visit:(id)=>{const p=[...PLACES,...SURFACES].find(p=>p.id===id);if(p){Object.assign(state,{x:p.x-(id==='waterfall'?16:0),z:p.z,speed:0,heading:id==='waterfall'?-Math.PI/2:p.dx!==undefined?Math.atan2(-p.dx,-p.dz):state.heading});updateCar(0);snapCamera();}},getState:()=>({...state,started,paused,explorer,carHeight:car.root.position.y,groundHeight:terrainHeight(state.x,state.z),input:input(),atmosphere:atmosphere.getState(),wildlife:wildlife.getState(),render:renderer.info.render,camping,journal:journal.get(),surfaces:surfaces.getState()})};
}catch(error){console.error(error);$('error').hidden=false;}
