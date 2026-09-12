import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { openMenu, menuAction, resumeDriving } from './menu-helpers.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const url=process.env.GAME_URL||'http://localhost:5173';
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);await page.getByRole('button',{name:'Let’s wander'}).click();
 const hiddenOptions=['#explorer','#tilt-toggle','#scrapbook','#customize','#sky','#sound','#horn','#home','#camp-action'];
 const quiet=async()=>{for(const id of hiddenOptions)assert.equal(await page.locator(id).isVisible(),false,id);assert.equal(await page.locator('[title], #toast, #trail-note, #driving-hints, .journey').count(),0);};
 await quiet();assert.equal(await page.getByRole('button').filter({visible:true}).count(),1);
 await page.screenshot({path:'artifacts/quiet-desktop.png'});
 await page.keyboard.down('ArrowUp');await page.waitForTimeout(700);await openMenu(page);await page.keyboard.up('ArrowUp');
 const paused=await page.evaluate(()=>window.__nowhereToBe.getState());assert.equal(paused.paused,true);assert.equal(paused.input.forward,false);assert.equal(paused.speed,0);
 await page.getByRole('button',{name:/Little explorer/}).click();await page.waitForTimeout(100);assert.equal((await page.evaluate(()=>window.__nowhereToBe.getState())).distance,paused.distance);
 await page.getByRole('button',{name:/Scrapbook/}).click();assert.equal(await page.locator('#menu').evaluate(m=>m.open),false);await page.keyboard.press('Escape');assert.equal(await page.locator('#menu').evaluate(m=>m.open),true);
 await page.getByRole('button',{name:/My car/}).click();await page.getByRole('button',{name:'Blue car'}).click();await resumeDriving(page);await quiet();
 await page.waitForTimeout(500);assert.ok((await page.evaluate(()=>window.__nowhereToBe.getState())).speed>0);
 await menuAction(page,/Little explorer/);
 await page.evaluate(()=>window.__nowhereToBe.visit('waterfall'));await page.waitForTimeout(200);await quiet();assert.ok((await page.evaluate(()=>window.__nowhereToBe.getState())).journal.found.includes('waterfall'));
 await page.evaluate(()=>window.__nowhereToBe.visit('campsite'));await page.waitForTimeout(200);await quiet();await menuAction(page,/Park & watch the stars/);assert.equal((await page.evaluate(()=>window.__nowhereToBe.getState())).camping,true);await quiet();assert.equal(await page.locator('#camp-evening').isVisible(),false);
 await menuAction(page,'Start the next outing');assert.equal((await page.evaluate(()=>window.__nowhereToBe.getState())).camping,false);await quiet();
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1024,height:768}]){
  await page.setViewportSize(viewport);await quiet();await page.screenshot({path:`artifacts/quiet-${viewport.width}.png`});await openMenu(page);
  for(const id of hiddenOptions.filter(id=>id!=='#camp-action')){const button=page.locator(id);await button.scrollIntoViewIfNeeded();assert.equal(await button.isVisible(),true);const rect=await button.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=viewport.width);}
  await page.locator('#menu').evaluate(m=>m.scrollTop=0);await page.screenshot({path:`artifacts/menu-${viewport.width}.png`});await resumeDriving(page);await quiet();
 }
 assert.deepEqual(errors,[]);console.log('PASS quiet UI: one desktop button, hidden options, no tooltips/toasts, paused input, submenu navigation, silent discoveries, camp actions, phone/tablet menus; no runtime errors');
}finally{await browser.close();}
