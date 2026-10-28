import * as THREE from 'three';
import { buildBridge } from './bridge.js';
import { buildTunnel } from './tunnel.js';
import { buildWaterfall } from './waterfall.js';
import { buildCampsites } from './camp.js';
import { buildFarm } from './farm.js';
import { buildTower } from './tower.js';
import { buildWindmill } from './windmill.js';
import { buildJetty } from './jetty.js';
import { buildOxbow } from './oxbow.js';
import { buildHut } from './hut.js';
import { buildBunkers } from './bunkers.js';
import { buildRailway } from './railway.js';
import { buildRoadworks } from './roadworks.js';
import { buildHelipad } from './helipad.js';
import { buildChapel } from './chapel.js';
import { buildSummit } from './summit.js';
import { buildFields } from './fields.js';
import { buildSigns } from './signs.js';
import { buildAirfield } from './airfield.js';
import { buildRockGate } from './rockgate.js';
import { buildFjord } from './fjord.js';
import { buildFarms } from './farms.js';
import { buildVillage } from './village.js';
import { buildDepot } from './depot.js';
import { buildDesert } from './desert.js';
import { buildHeaps } from '../heaps.js';
import { HELIPAD, KRYSTOF } from '../layout.js';

export { insideTunnel } from './tunnel.js';

/**
 * Builds every landmark, each in a group of its own named after it, which keeps the obstacles
 * it adds in `userData.obstacles` (for the object viewer). Returns meshes the camera must not
 * pass through.
 */
export function buildLandmarks(scene, obstacles) {
  const own = (name, build) => {
    const group = new THREE.Group();
    group.name = name;
    scene.add(group);
    const before = obstacles.length;
    const result = build(group, obstacles);
    group.userData.obstacles = obstacles.slice(before);
    return result;
  };
  own('bridge', buildBridge);
  const tunnel = own('tunnel', buildTunnel);
  const waterfall = own('waterfall', buildWaterfall);
  const camps = own('camp', buildCampsites);
  const farm = own('farm', buildFarm);
  const tower = own('tower', buildTower);
  const windmill = own('windmill', buildWindmill);
  const jetty = own('jetty', buildJetty);
  own('oxbow', buildOxbow);
  const hut = own('hut', buildHut);
  own('bunkers', buildBunkers);
  const crossing = own('railway', buildRailway);
  const roadworks = own('roadworks', buildRoadworks);
  const helipads = [
    own('helipad', (group, list) => buildHelipad(group, list, HELIPAD)),
    own('krystofPad', (group, list) => buildHelipad(group, list, KRYSTOF.pad)),
  ];
  own('chapel', buildChapel);
  own('summit', buildSummit);
  const fields = own('fields', buildFields);
  const airfield = own('airfield', buildAirfield);
  const gate = own('rockgate', buildRockGate);
  const fjord = own('fjord', buildFjord);
  const farms = own('farms', buildFarms);
  const village = own('village', buildVillage);
  const depot = own('depot', buildDepot);
  const desert = own('desert', buildDesert);
  own('heaps', group => buildHeaps(group));
  own('signs', group => buildSigns(group, { tunnelPortal: tunnel.portal, hutBoard: hut.nameBoard }));

  let time = 0;
  const machines = [];
  return {
    occluders: [
      ...tunnel.occluders,
      ...waterfall.occluders,
      ...airfield.occluders,
      ...gate.occluders,
      ...depot.occluders,
      ...desert.occluders,
    ],
    /** The level crossing: where traffic waits, and the barriers while they are down. */
    crossing,
    /** The roadworks machines and the tractors in the fields, for collisions. */
    machines,
    fields,
    /** The fire engine at the village answers a honk nearby. */
    hearHorn: (x, z) => village.hearHorn(x, z),
    update(dt, night, { crossingClosed = false, player = null } = {}) {
      time += dt;
      waterfall.update(time);
      camps.update(time, night);
      farm.update(time);
      tower.update(time);
      windmill.update(dt);
      jetty.update(time);
      hut.update(time);
      crossing.update(dt, crossingClosed);
      roadworks.update(dt, player);
      fields.update(dt, player);
      machines.length = 0;
      machines.push(...roadworks.colliders, ...fields.colliders);
      for (const helipad of helipads) helipad.update(time, night);
      airfield.update(time, night, player);
      fjord.update(dt);
      farms.update(time);
      village.update(dt);
      depot.update(night);
      desert.update(dt, night, player);
    },
  };
}
