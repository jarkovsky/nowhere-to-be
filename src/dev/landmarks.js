// Every landmark's builder by name, for the object viewer and the geometry checks.
import { buildBridge } from '../world/landmarks/bridge.js';
import { buildTunnel } from '../world/landmarks/tunnel.js';
import { buildWaterfall } from '../world/landmarks/waterfall.js';
import { buildCampsites } from '../world/landmarks/camp.js';
import { buildFarm } from '../world/landmarks/farm.js';
import { buildTower } from '../world/landmarks/tower.js';
import { buildWindmill } from '../world/landmarks/windmill.js';
import { buildJetty } from '../world/landmarks/jetty.js';
import { buildOxbow } from '../world/landmarks/oxbow.js';
import { buildHut } from '../world/landmarks/hut.js';
import { buildBunkers } from '../world/landmarks/bunkers.js';
import { buildRailway } from '../world/landmarks/railway.js';
import { buildRoadworks } from '../world/landmarks/roadworks.js';
import { buildHelipad } from '../world/landmarks/helipad.js';
import { buildChapel } from '../world/landmarks/chapel.js';
import { buildSummit } from '../world/landmarks/summit.js';
import { buildFields } from '../world/landmarks/fields.js';
import { buildAirfield } from '../world/landmarks/airfield.js';
import { buildRockGate } from '../world/landmarks/rockgate.js';
import { buildFjord } from '../world/landmarks/fjord.js';
import { buildFarms } from '../world/landmarks/farms.js';
import { buildVillage } from '../world/landmarks/village.js';
import { buildDepot } from '../world/landmarks/depot.js';
import { buildDesert } from '../world/landmarks/desert.js';
import { buildOrchard } from '../world/landmarks/orchard.js';
import { buildHeaps } from '../world/heaps.js';
import { HELIPAD, KRYSTOF } from '../world/layout.js';
import { drivingHeight, waterLevel } from '../world/terrain.js';

/** What things stand on: the ground, the decks and heaps the car drives on, or still water. */
export const standing = (x, z) => Math.max(drivingHeight(x, z), waterLevel(x, z));

export const LANDMARKS = {
  bridge: buildBridge,
  tunnel: buildTunnel,
  waterfall: buildWaterfall,
  camp: buildCampsites,
  farm: buildFarm,
  tower: buildTower,
  windmill: buildWindmill,
  jetty: buildJetty,
  oxbow: buildOxbow,
  hut: buildHut,
  bunkers: buildBunkers,
  railway: buildRailway,
  roadworks: (scene, obstacles) => {
    // The machines take their places on the first update.
    const roadworks = buildRoadworks(scene, obstacles);
    roadworks.update(0.016, { x: 0, z: 0, speed: 0, heading: 0 });
    return roadworks;
  },
  helipad: (scene, obstacles) => buildHelipad(scene, obstacles, HELIPAD),
  krystofPad: (scene, obstacles) => buildHelipad(scene, obstacles, KRYSTOF.pad),
  chapel: buildChapel,
  orchard: buildOrchard,
  summit: buildSummit,
  fields: (scene, obstacles) => {
    // The tractors and the combine take their places in the fields on the first update.
    const fields = buildFields(scene, obstacles);
    fields.update(0.016, { x: 0, z: 0, speed: 0, heading: 0 });
    return fields;
  },
  airfield: buildAirfield,
  rockgate: buildRockGate,
  fjord: buildFjord,
  farms: buildFarms,
  village: buildVillage,
  depot: buildDepot,
  desert: buildDesert,
  heaps: scene => buildHeaps(scene),
};
