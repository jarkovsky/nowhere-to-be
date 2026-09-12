import { menuAction, resumeDriving } from './menu-helpers.mjs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
const read=page=>page.evaluate(()=>window.__nowhereToBe.getState());
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.GAME_URL||'http://localhost:5173');await page.getByRole('button',{name:'Let’s wander'}).click();
 const route=await page.evaluate(async()=>{
   const {stepDriving}=await import('/src/driving.js'),{roadPoint}=await import('/src/terrain.js');
   const obstacles=window.__nowhereToBe.getObstacles(),state={...roadPoint(0),heading:0,speed:0,steering:0,distance:0};
   for(let i=1;i<=260;i++){const p=roadPoint(i/260);let steps=0;while(Math.hypot(state.x-p.x,state.z-p.z)>2&&steps++<300){state.heading=Math.atan2(state.x-p.x,state.z-p.z);stepDriving(state,{forward:true},.05,obstacles);}if(steps>=300)return {blockedAt:i};}
   // The campsite spur is also clear of trees, rocks, and camp furniture.
   Object.assign(state,{x:-20,z:89,speed:0});
   for(let i=1;i<=90;i++){const t=i/90,p={x:-20+48*t+Math.sin(t*Math.PI)*8,z:89-97*t};let steps=0;while(Math.hypot(state.x-p.x,state.z-p.z)>1&&steps++<100){state.heading=Math.atan2(state.x-p.x,state.z-p.z);stepDriving(state,{forward:true},.05,obstacles);}if(steps>=100)return {campBlockedAt:i};}
   return {clear:true};
 });assert.deepEqual(route,{clear:true});
 await menuAction(page,/My car/);assert.equal((await read(page)).paused,true);
 await page.getByRole('button',{name:'Blue car',exact:true}).click();await page.getByRole('button',{name:'🧸 Teddy',exact:true}).click();await page.getByRole('button',{name:'Quack!',exact:true}).click();
 await page.screenshot({path:'artifacts/car-choices.png'});await resumeDriving(page);
 assert.equal((await read(page)).journal.color,'blue');assert.equal((await read(page)).journal.decoration,'teddy');assert.equal((await read(page)).journal.horn,'quack');
 for(const id of ['bridge','tunnel','waterfall','campsite']){await page.evaluate(id=>window.__nowhereToBe.visit(id),id);await page.waitForTimeout(650);assert.ok((await read(page)).journal.found.includes(id));await page.screenshot({path:`artifacts/place-${id}.png`});}
 await menuAction(page,/Park & watch the stars/);await page.waitForTimeout(4200);let state=await read(page);assert.equal(state.camping,true);assert.equal(state.journal.camp,true);assert.ok(state.atmosphere.day<.1);
 const parked=state.distance;await page.keyboard.down('ArrowUp');await page.waitForTimeout(500);await page.keyboard.up('ArrowUp');assert.equal((await read(page)).distance,parked);await page.screenshot({path:'artifacts/camp-evening.png'});
 await menuAction(page,'Look through our scrapbook');assert.equal(await page.locator('.sticker-card:not(.locked)').count(),4);await page.screenshot({path:'artifacts/scrapbook.png'});await resumeDriving(page);assert.equal((await read(page)).camping,true);
 await menuAction(page,'Start the next outing');assert.equal((await read(page)).camping,false);assert.equal((await read(page)).atmosphere.preset,'day');
 await page.reload();await page.getByRole('button',{name:'Let’s wander'}).click();state=await read(page);assert.equal(state.x,28);assert.equal(state.z,-8);assert.equal(state.journal.color,'blue');assert.equal(state.journal.found.filter(id=>['bridge','tunnel','waterfall','campsite'].includes(id)).length,4);
 await page.evaluate(()=>window.__nowhereToBe.visit('snow'));await page.keyboard.down('ArrowUp');await page.waitForTimeout(1700);await page.keyboard.up('ArrowUp');assert.ok((await read(page)).surfaces.tracks>4);await page.screenshot({path:'artifacts/snow-tracks.png'});
 await page.evaluate(()=>window.__nowhereToBe.visit('leaves'));await page.keyboard.down('ArrowUp');await page.waitForTimeout(900);assert.equal((await read(page)).surfaces.surface,'leaves');assert.ok((await read(page)).surfaces.particles>0);await page.keyboard.up('ArrowUp');
 await page.evaluate(()=>window.__nowhereToBe.visit('puddle'));await page.keyboard.down('ArrowUp');await page.waitForTimeout(600);assert.ok((await read(page)).surfaces.particles>0);await page.keyboard.up('ArrowUp');
 await page.setViewportSize({width:390,height:844});await menuAction(page,/Scrapbook/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'artifacts/phone-scrapbook.png'});await resumeDriving(page);await menuAction(page,/My car/);await page.screenshot({path:'artifacts/phone-car.png'});await resumeDriving(page);
 assert.deepEqual(errors,[]);console.log('PASS adventures: customization, horn, landmark stickers, camp night, parked controls, next outing, reload persistence, snow tracks, leaves, puddles, mobile book and car; no runtime errors');
}finally{await browser.close();}
