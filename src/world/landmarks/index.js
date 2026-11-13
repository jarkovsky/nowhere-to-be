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
import { buildLofoten } from './lofoten.js';
import { buildFarms } from './farms.js';
import { buildVillage } from './village.js';
import { buildDepot } from './depot.js';
import { buildDesert } from './desert.js';
import { buildOrchard } from './orchard.js';
import { buildSnowman } from './snowman.js';
import { buildLookout } from './lookout.js';
import { buildFishing } from './fishing.js';
import { buildCrash } from './crash.js';
import { buildMine } from './mine.js';
import { buildLogging } from './logging.js';
import { buildRoughGround } from './roughground.js';
import { buildHeaps } from '../heaps.js';
import { HELIPAD, KRYSTOF } from '../layout.js';
import { SIGHT } from '../sight.js';

export { insideTunnel } from './tunnel.js';

/** Closer than this a landmark stays in the picture even out of view: its shadow may fall into view. */
const CLOSE = 300;

/**
 * The sphere a group's meshes lie in, with `room` to spare for the parts of it that move about.
 * Meshes drawn many times over count by where each stands now. A group whose reach can't be
 * told counts as reaching everywhere.
 */
export function reachOf(group, room = true) {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  group.updateWorldMatrix(true, true);
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry.boundingBox ?? mesh.geometry.computeBoundingBox();
    if (!mesh.isInstancedMesh) return box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(matrix.premultiply(mesh.matrixWorld)));
    }
  });
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (box.isEmpty() || !Number.isFinite(sphere.radius)) return new THREE.Sphere(new THREE.Vector3(), Infinity);
  if (room) sphere.radius = sphere.radius * 1.15 + 25;
  return sphere;
}

/**
 * Builds every landmark, each in a group of its own named after it, which keeps the obstacles
 * it adds in `userData.obstacles` (for the object viewer). Returns meshes the camera must not
 * pass through.
 *
 * What a landmark costs each frame goes by whether it can be seen, not by how many there are:
 * show() takes those out of view out of the scene, and update() leaves alone those too far
 * off to be made out at all.
 */
export function buildLandmarks(scene, obstacles) {
  /** Each landmark's group, the sphere it lies in, whether it is near enough to be made out and whether it is in the scene. */
  const places = {};
  /** `roams` is how much further than it is built anything in it wanders, where that is a long way. */
  const own = (name, build, roams = 0) => {
    const group = new THREE.Group();
    group.name = name;
    scene.add(group);
    const before = obstacles.length;
    const result = build(group, obstacles);
    group.userData.obstacles = obstacles.slice(before);
    places[name] = { group, sphere: reachOf(group), near: true, shown: true };
    places[name].sphere.radius += roams;
    return result;
  };
  own('bridge', buildBridge);
  const tunnel = own('tunnel', buildTunnel);
  const waterfall = own('waterfall', buildWaterfall);
  const camps = own('camp', buildCampsites);
  const farm = own('farm', buildFarm);
  const tower = own('tower', buildTower);
  const windmill = own('windmill', buildWindmill);
  // The fishing boat drifts in a wide loop round the lake.
  const jetty = own('jetty', buildJetty, 40);
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
  own('orchard', buildOrchard);
  own('snowman', buildSnowman);
  own('summit', buildSummit);
  const fields = own('fields', buildFields);
  const airfield = own('airfield', buildAirfield);
  const gate = own('rockgate', buildRockGate);
  const fjord = own('fjord', buildFjord);
  const lofoten = own('lofoten', buildLofoten);
  const farms = own('farms', buildFarms);
  const village = own('village', buildVillage);
  const depot = own('depot', buildDepot);
  const desert = own('desert', buildDesert);
  own('lookout', buildLookout);
  own('fishing', buildFishing);
  own('crash', buildCrash);
  own('mine', buildMine);
  own('logging', buildLogging);
  own('roughground', buildRoughGround);
  own('heaps', group => buildHeaps(group));
  const signs = own('signs', group => buildSigns(group, { tunnelPortal: tunnel.portal, hutBoard: hut.nameBoard }));

  let time = 0;
  const machines = [];
  const frustum = new THREE.Frustum();
  const view = new THREE.Matrix4();
  return {
    /** Where each landmark stands and how far it reaches, by name: { group, sphere, near, shown }. */
    places,
    /**
     * Takes the landmarks `camera` can't see out of the scene, so nothing in them is looked at
     * when the frame is drawn, and notes which are too far off to be made out at all.
     */
    show(camera) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const eye = camera.position;
      for (const place of Object.values(places)) {
        const { center, radius } = place.sphere;
        const distance = Math.hypot(center.x - eye.x, center.z - eye.z) - radius;
        place.near = distance < SIGHT;
        const shown = distance < CLOSE || (place.near && frustum.intersectsSphere(place.sphere));
        if (shown === place.shown) continue;
        place.shown = shown;
        if (shown) scene.add(place.group);
        else scene.remove(place.group);
      }
    },
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
    /** True if a standing crop, the wheat or the meadow's long grass, grows at (x, z). */
    cropAt: (x, z) => farm.cropAt(x, z) || fields.cropAt(x, z),
    /** The roadworks machines and the tractors in the fields, for collisions. */
    machines,
    fields,
    /** The fire engine at the village answers a honk nearby. */
    hearHorn: (x, z) => village.hearHorn(x, z),
    update(dt, night, { crossingClosed = false, player = null } = {}) {
      time += dt;
      // Only those near enough to be made out are kept moving (see show).
      const near = places;
      if (near.waterfall.near) waterfall.update(time);
      if (near.camp.near) camps.update(time, night);
      if (near.farm.near) farm.update(time);
      if (near.tower.near) tower.update(time);
      if (near.windmill.near) windmill.update(dt);
      if (near.jetty.near) jetty.update(time);
      if (near.hut.near) hut.update(time);
      if (near.railway.near) crossing.update(dt, crossingClosed);
      if (near.roadworks.near) roadworks.update(dt, player);
      if (near.fields.near) fields.update(dt, player);
      machines.length = 0;
      machines.push(...roadworks.colliders, ...fields.colliders);
      if (near.helipad.near) helipads[0].update(time, night);
      if (near.krystofPad.near) helipads[1].update(time, night);
      if (near.airfield.near) airfield.update(time, night, player);
      if (near.fjord.near) fjord.update(dt);
      if (near.lofoten.near) lofoten.update(dt);
      if (near.farms.near) farms.update(time);
      if (near.village.near) village.update(dt);
      if (near.depot.near) depot.update(night);
      if (near.desert.near) desert.update(dt, night, player);
      if (player && near.signs.near) signs.update(player.x, player.z);
    },
  };
}
