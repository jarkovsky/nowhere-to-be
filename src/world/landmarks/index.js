import { buildBridge } from './bridge.js';
import { buildTunnel } from './tunnel.js';
import { buildWaterfall } from './waterfall.js';
import { buildCampsites } from './camp.js';
import { buildSigns } from './signs.js';

export { insideTunnel } from './tunnel.js';

/** Builds every landmark. Returns meshes the camera must not pass through. */
export function buildLandmarks(scene, obstacles) {
  buildBridge(scene, obstacles);
  const tunnel = buildTunnel(scene, obstacles);
  const waterfall = buildWaterfall(scene, obstacles);
  const camps = buildCampsites(scene, obstacles);
  buildSigns(scene, { tunnelPortal: tunnel.portal });

  let time = 0;
  return {
    occluders: [...tunnel.occluders, ...waterfall.occluders],
    fire: camps.fire,
    update(dt, night) {
      time += dt;
      waterfall.update(time);
      camps.update(time, night);
    },
  };
}
