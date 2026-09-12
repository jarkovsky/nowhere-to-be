import { roadPoint } from './terrain.js';
function trailCrossing(t, distance) {
  const p=roadPoint(t),q=roadPoint(t+.001),length=Math.hypot(q.x-p.x,q.z-p.z);
  const dx=(q.z-p.z)/length*distance,dz=-(q.x-p.x)/length*distance;
  return {start:{x:p.x-dx,z:p.z-dz},end:{x:p.x+dx,z:p.z+dz}};
}
// Permanent residents: the landscape is already inhabited when an outing begins.
export const HABITATS=[
  {kind:'deer',start:{x:-32,z:65},end:{x:10,z:89},count:2,wait:7,duration:20},
  {kind:'ducks',...trailCrossing(.29,15),count:4,wait:11,duration:18},
];
export const BURROW={x:-161,z:38};
export function habitatClearance(x,z){
  return HABITATS.some(({start,end})=>{
    const dx=end.x-start.x,dz=end.z-start.z,t=Math.max(0,Math.min(1,((x-start.x)*dx+(z-start.z)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-start.x-dx*t,z-start.z-dz*t)<5;
  });
}
export function animalJourney(time,wait,duration){
  const cycle=2*(wait+duration),phase=((time%cycle)+cycle)%cycle;
  if(phase<wait)return {progress:0,walking:false,returning:false};
  if(phase<wait+duration)return {progress:(phase-wait)/duration,walking:true,returning:false};
  if(phase<2*wait+duration)return {progress:1,walking:false,returning:true};
  return {progress:1-(phase-2*wait-duration)/duration,walking:true,returning:true};
}
