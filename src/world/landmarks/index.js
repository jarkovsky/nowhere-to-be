import { buildBridge } from './bridge.js';
import { buildTunnel } from './tunnel.js';
import { buildWaterfall } from './waterfall.js';
import { buildCampsites } from './camp.js';
import { buildFarm } from './farm.js';
import { buildTower } from './tower.js';
import { buildWindmill } from './windmill.js';
import { buildJetty } from './jetty.js';
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
import { HELIPAD, KRYSTOF } from '../layout.js';

export { insideTunnel } from './tunnel.js';

/** Builds every landmark. Returns meshes the camera must not pass through. */
export function buildLandmarks(scene, obstacles) {
  buildBridge(scene, obstacles);
  const tunnel = buildTunnel(scene, obstacles);
  const waterfall = buildWaterfall(scene, obstacles);
  const camps = buildCampsites(scene, obstacles);
  const farm = buildFarm(scene, obstacles);
  const tower = buildTower(scene, obstacles);
  const windmill = buildWindmill(scene, obstacles);
  const jetty = buildJetty(scene, obstacles);
  const hut = buildHut(scene, obstacles);
  buildBunkers(scene, obstacles);
  const crossing = buildRailway(scene, obstacles);
  const roadworks = buildRoadworks(scene, obstacles);
  const helipads = [HELIPAD, KRYSTOF.pad].map(pad => buildHelipad(scene, obstacles, pad));
  buildChapel(scene, obstacles);
  buildSummit(scene, obstacles);
  const fields = buildFields(scene, obstacles);
  const airfield = buildAirfield(scene, obstacles);
  const gate = buildRockGate(scene, obstacles);
  const fjord = buildFjord(scene, obstacles);
  const farms = buildFarms(scene, obstacles);
  const village = buildVillage(scene, obstacles);
  buildSigns(scene, { tunnelPortal: tunnel.portal, hutBoard: hut.nameBoard });

  let time = 0;
  const machines = [];
  return {
    occluders: [...tunnel.occluders, ...waterfall.occluders, ...airfield.occluders, ...gate.occluders],
    fire: camps.fire,
    /** The level crossing: where traffic waits, and the barriers while they are down. */
    crossing,
    /** The roadworks machines and the tractors in the fields, for collisions. */
    machines,
    fields,
    /** The fire engine at the village answers a honk nearby. */
    hearHorn: (x, z) => village.hearHorn(x, z),
    sirenLevel: (x, z) => village.sirenLevel(x, z),
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
    },
  };
}
