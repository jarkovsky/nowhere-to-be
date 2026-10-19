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
import { buildSigns } from './signs.js';

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
  buildSigns(scene, { tunnelPortal: tunnel.portal, hutBoard: hut.nameBoard });

  let time = 0;
  return {
    occluders: [...tunnel.occluders, ...waterfall.occluders],
    fire: camps.fire,
    /** The level crossing: where traffic waits, and the barriers while they are down. */
    crossing,
    /** The roadworks machines that move about, for collisions. */
    machines: roadworks.colliders,
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
    },
  };
}
