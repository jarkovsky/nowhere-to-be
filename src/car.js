import * as THREE from 'three';
export function createCar() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const materials = {
    paint: new THREE.MeshStandardMaterial({ color: '#d16b38', roughness: .85 }),
    cream: new THREE.MeshStandardMaterial({ color: '#eee4c8', roughness: .85 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#303a35', roughness: 1 }),
    metal: new THREE.MeshStandardMaterial({ color: '#737e73', roughness: .8 }),
    glass: new THREE.MeshStandardMaterial({ color: '#557579', roughness: .3, metalness: .15 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#fff3ce', emissive: '#ffd88e', emissiveIntensity: .35 }),
    red: new THREE.MeshStandardMaterial({ color: '#ad3f28' }),
    bag: new THREE.MeshStandardMaterial({ color: '#758676', roughness: 1 }),
  };
  function box(w, h, d, x, y, z, material, parent = body) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  box(2.05,.62,3.8,0,1.03,0,'paint');
  box(1.85,.20,3.9,0,.72,0,'rubber');
  box(1.9,.32,1.15,0,1.48,-1.25,'paint');
  box(1.92,1.18,2.30,0,1.85,.35,'paint');
  box(1.71,.85,2.34,0,1.96,.35,'glass');
  // Window pillars, cream roof, hood detailing and bumpers.
  for(const x of [-.93,.93]) {
    for(const z of [-.8,.22,1.47]) box(.09,1.17,.10,x,1.87,z,'paint');
    box(.08,.08,2.4,x,1.55,.3,'paint');
    box(.05,.06,.27,x*1.04,1.52,.36,'cream');
    box(.26,.28,.15,x*1.17,1.81,-.72,'rubber');
  }
  box(2.06,.14,2.48,0,2.50,.35,'cream');
  box(2.26,.21,.23,0,.86,-2.02,'cream');
  box(2.26,.21,.23,0,.86,1.98,'cream');
  box(1.23,.3,.05,0,1.18,-1.94,'rubber');
  for(let i=-3;i<=3;i++) box(.055,.24,.025,i*.14,1.18,-1.98,'metal');
  for(const x of [-.77,.77]) {
    const lamp=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.08,12),materials.lamp);lamp.rotation.x=Math.PI/2;lamp.position.set(x,1.23,-1.97);body.add(lamp);
    box(.23,.28,.06,x,1.21,1.94,'red');
  }
  const wheels = [];
  for(const x of [-1.08,1.08]) for(const z of [-1.2,1.24]) {
    const pivot = new THREE.Group(); pivot.position.set(x,.65,z); root.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(.59,.59,.40,12),materials.rubber); tire.rotation.z=Math.PI/2; tire.castShadow=true; spin.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.29,.29,.42,10),materials.cream);hub.rotation.z=Math.PI/2;spin.add(hub);
    const center = new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.44,8),materials.metal);center.rotation.z=Math.PI/2;spin.add(center);
    wheels.push({ pivot, spin, tire, front:z<0 });
    box(.25,.18,1.26,x,1.16,z,'paint');
  }
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(.54,.54,.3,12),materials.rubber);spare.rotation.x=Math.PI/2;spare.position.set(0,1.58,2.07);body.add(spare);
  const spareHub = new THREE.Mesh(new THREE.CylinderGeometry(.29,.29,.32,10),materials.cream);spareHub.rotation.x=Math.PI/2;spareHub.position.copy(spare.position);body.add(spareHub);
  for(const x of [-.76,.76]) box(.06,.13,2,x,2.64,.35,'rubber');
  for(const z of [-.55,1.22]) box(1.58,.13,.06,0,2.64,z,'rubber');
  box(1.15,.40,.80,-.12,2.85,.65,'bag');box(1.19,.045,.10,-.12,2.9,.65,'cream');
  box(.60,.25,.70,.35,2.78,-.23,'cream');
  const flag=new THREE.Group();body.add(flag);
  box(.045,1.5,.045,.85,3.2,1,'metal',flag);
  const pennant=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([.85,3.95,1,1.65,3.7,1,.85,3.45,1],3)),new THREE.MeshStandardMaterial({color:'#e5bb56',side:THREE.DoubleSide}));pennant.geometry.computeVertexNormals();flag.add(pennant);
  const teddy=new THREE.Group();teddy.position.set(.05,2.7,-.4);body.add(teddy);
  const fur=new THREE.MeshStandardMaterial({color:'#bd9368',roughness:1,flatShading:true});
  const bead=new THREE.MeshStandardMaterial({color:'#343c32'});
  function ball(r,x,y,z,m=fur){const b=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),m);b.position.set(x,y,z);teddy.add(b);return b;}
  ball(.33,0,.28,0);ball(.28,0,.76,0);
  for(const side of [-1,1]){ball(.12,side*.23,.98,0);ball(.14,side*.32,.4,0);ball(.16,side*.19,.06,-.19);ball(.035,side*.10,.8,-.25,bead);}
  ball(.07,0,.70,-.28,bead);
  flag.visible=teddy.visible=false;
  return { root, body, wheels, customize(color,decoration){materials.paint.color.set(color);flag.visible=decoration==='flag';teddy.visible=decoration==='teddy';}, animate(time){pennant.rotation.z=Math.sin(time*5)*.05;} };
}
