// Where everything in the valley is. Pure data, so tests and the renderer
// agree on the same coordinates. +X is east, +Z is south, heights are metres.
import { createPath, headingOf } from './path.js';

export const WORLD_SIZE = 1600;
/** The fence: the car can't drive further from the centre than this. */
export const VALLEY_RADIUS = 355;

export const LAKE = { x: 93, z: -54, rx: 61, rz: 44, level: -2.2 };

export const ROAD_HALF_WIDTH = 4.4;

/** Rounded hills that break up the valley floor. */
export const KNOLLS = [
  { x: 100, z: 188, radius: 30, height: 17 },
  { x: -118, z: 186, radius: 26, height: 11 },
  { x: 226, z: 138, radius: 30, height: 13 },
];

/** A rounded summit in the northern hills (after Šerlich in the Orlické hory), with a mountain hut on top. */
export const SERLICH = { x: 150, z: -236, radius: 60, height: 16 };

/** A flat-topped hill out to the west. */
export const MESA = { x: -262, z: 30, top: 26, edge: 62, height: 13 };

/** The main trail, a loop around the valley floor. */
export const ROAD = createPath(
  [
    [-12, 104],
    [34, 110],
    [78, 102],
    [112, 80],
    [130, 46],
    [146, 14],
    [170, -16],
    [184, -52],
    [175, -90],
    [138, -116],
    [88, -122],
    [40, -110],
    [-10, -120],
    [-50, -128],
    [-86, -118],
    [-116, -98],
    [-146, -70],
    [-174, -40],
    [-186, -6],
    [-174, 22],
    [-146, 42],
    [-110, 56],
    [-78, 74],
    [-46, 92],
  ],
  { closed: true },
);

/** Mountain stream: from the waterfall pool, under the bridge, into the lake. */
export const CREEK = createPath(
  [
    [224, -60],
    [210, -55],
    [196, -57],
    [184, -53],
    [172, -56],
    [160, -53],
    [146, -54],
  ],
  { spacing: 0.75 },
);
export const CREEK_HALF_WIDTH = 2.2;

export const WATERFALL = { x: 226, z: -60, poolRadius: 9, height: 15 };

/** A narrow dirt spur from the trail down to the lakeside campsite. */
export const CAMP_TRAIL = createPath([
  [-24, 97],
  [-12, 70],
  [6, 40],
  [22, 12],
  [33, -12],
]);

export const CAMP = { x: 36, z: -17, heading: headingOf(0.55, -0.83) };

/** The farm, and its paddock in the farm's own frame (X along the barn row, Z towards the field). */
export const FARM = { x: -76, z: 14, rotation: 0.45, paddock: { x0: -20, x1: -4, z0: 7, z1: 21 } };

/** A fire lookout tower on top of the southern knoll. */
export const TOWER = { x: 101, z: 196 };

export const WINDMILL = { x: MESA.x, z: MESA.z };

/** Masarykova chata, the mountain hut on the summit, facing down into the valley. */
export const CHATA = { x: 138, z: -198, rotation: Math.atan2(-138, 198) };

/** Small concrete pillboxes from 1938 (řopíky) in a line along the northern ridge. */
export const BUNKERS = [
  { x: 64, z: -244 },
  { x: 24, z: -252 },
  { x: -18, z: -244 },
];

/** A boathouse and a jetty on the south shore of the lake. The jetty is wide enough to drive onto. */
export const JETTY = { x: 84, z: 2, heading: headingOf(0, -1), length: 24, width: 5 };

/**
 * A branch railway. It starts at a buffer stop by a halt inside the trail loop
 * (s = 0), crosses the trail at a level crossing and climbs a cutting into a
 * tunnel in the northern hills.
 */
export const RAILWAY = createPath([
  [-17, -46],
  [-20, -72],
  [-24, -98],
  [-29, -124],
  [-36, -150],
  [-45, -174],
  [-56, -198],
  [-67, -220],
]);
/** How steeply the line climbs from the level crossing to the tunnel. */
export const RAIL_GRADE = 0.035;
/** The halt's platform runs beside the line between these distances, on its west side. */
export const HALT = { from: 5, to: 33, side: -1 };

export const CABIN = { x: -62, z: 112, rotation: 0.35 };

export const LOOKOUT = { x: -148, z: -44, heading: headingOf(1, 0.1) };

function nearestRoadSample(x, z) {
  return ROAD.nearest(x, z).sample;
}

/** Where the trail meets the creek. */
function findCrossing() {
  let best = { distance: Infinity };
  for (const sample of ROAD.samples) {
    const { distance } = CREEK.nearest(sample.x, sample.z);
    if (distance < best.distance) best = { ...sample, distance };
  }
  return best;
}

function fromRoad(x, z, ...points) {
  const start = nearestRoadSample(x, z);
  return [[start.x, start.z], ...points];
}

/** Narrow side tracks: two dirt ruts with grass between, or a footpath along the shore. */
export const TRACKS = [
  { id: 'farm', ruts: true, path: createPath(fromRoad(-118, 52, [-104, 38], [-92, 27], [-80, 18])) },
  {
    id: 'tower',
    ruts: true,
    path: createPath(fromRoad(64, 108, [74, 128], [86, 150], [96, 170], [100, 186])),
  },
  {
    id: 'windmill',
    ruts: true,
    path: createPath(fromRoad(-186, -6, [-210, 4], [-232, 15], [-251, 25])),
  },
  {
    id: 'chata',
    ruts: true,
    // Up the hillside on a long diagonal, then a hairpin back to the hut.
    path: createPath(fromRoad(128, -118, [158, -138], [182, -156], [194, -170], [188, -182], [168, -190], [152, -194])),
  },
  {
    // A new road being built: finished asphalt, then a gravel base, then bare earth where the digging is.
    id: 'roadworks',
    ruts: false,
    width: 3.6,
    path: createPath(fromRoad(3, 111, [0, 128], [-4, 146], [-10, 164], [-16, 180])),
  },
  {
    id: 'shore',
    ruts: false,
    path: createPath([[33, -12], [46, -5], [60, 4], [74, 13], [90, 11], [104, 9], [117, 22], ...fromRoad(128, 40)]),
  },
];

const roadworksPath = TRACKS.find(track => track.id === 'roadworks').path;
/** Where each stage of the new road ends, in metres along it. */
export const ROADWORKS = {
  path: roadworksPath,
  asphalt: roadworksPath.length * 0.42,
  gravel: roadworksPath.length * 0.74,
  site: roadworksPath.at(roadworksPath.length),
};

// The deck runs straight between two points on the curving trail, so the
// trail never strays far from the middle of the bridge.
const crossing = findCrossing();
const bridgeEnds = [ROAD.at(crossing.s - 11), ROAD.at(crossing.s + 11)];
const span = Math.hypot(bridgeEnds[1].x - bridgeEnds[0].x, bridgeEnds[1].z - bridgeEnds[0].z);
export const BRIDGE = {
  s: crossing.s,
  x: (bridgeEnds[0].x + bridgeEnds[1].x) / 2,
  z: (bridgeEnds[0].z + bridgeEnds[1].z) / 2,
  dx: (bridgeEnds[1].x - bridgeEnds[0].x) / span,
  dz: (bridgeEnds[1].z - bridgeEnds[0].z) / span,
  length: span,
  width: 9.6, // a little wider than the trail itself
};

/** Where the railway crosses the trail: `s` along the railway, `roadS` along the trail. */
export const LEVEL_CROSSING = (() => {
  let best = { distance: Infinity };
  for (const sample of RAILWAY.samples) {
    const { distance, s } = ROAD.nearest(sample.x, sample.z);
    if (distance < best.distance) best = { s: sample.s, roadS: s, x: sample.x, z: sample.z, distance };
  }
  return { s: best.s, roadS: best.roadS, x: best.x, z: best.z };
})();

const tunnelCentre = nearestRoadSample(-134, -84);
export const TUNNEL = { ...tunnelCentre, length: 38, radius: 6.4 };

const start = ROAD.at(nearestRoadSample(-36, 97).s);
export const SPAWN = { x: start.x, z: start.z, heading: headingOf(start.dx, start.dz) };

const { x: haltX, z: haltZ } = RAILWAY.offset((HALT.from + HALT.to) / 2, HALT.side * 4);
const haltCentre = { x: haltX, z: haltZ };

/** Places that earn a scrapbook sticker. `radius` is how close you need to get. */
export const PLACES = [
  { id: 'waterfall', x: WATERFALL.x - 14, z: WATERFALL.z, radius: 26 },
  { id: 'bridge', x: BRIDGE.x, z: BRIDGE.z, radius: 9 },
  { id: 'tunnel', x: TUNNEL.x, z: TUNNEL.z, radius: 12 },
  { id: 'campsite', x: CAMP.x, z: CAMP.z, radius: 16 },
  { id: 'lookout', x: LOOKOUT.x, z: LOOKOUT.z, radius: 10 },
  { id: 'farm', x: FARM.x, z: FARM.z, radius: 24 },
  { id: 'tower', x: TOWER.x, z: TOWER.z, radius: 14 },
  { id: 'windmill', x: WINDMILL.x, z: WINDMILL.z, radius: 18 },
  { id: 'jetty', x: JETTY.x, z: JETTY.z + 6, radius: 12 },
  { id: 'chata', x: CHATA.x, z: CHATA.z, radius: 22 },
  { id: 'bunker', x: BUNKERS[1].x, z: BUNKERS[1].z, radius: 14 },
  { id: 'halt', ...haltCentre, radius: 16 },
  { id: 'roadworks', x: ROADWORKS.site.x, z: ROADWORKS.site.z, radius: 24 },
];

/** Ground that flattens so buildings and camp furniture sit on level ground. */
export const PADS = [
  { x: CAMP.x - 4, z: CAMP.z - 2, radius: 11, falloff: 16 },
  { x: CABIN.x, z: CABIN.z, radius: 9, falloff: 8 },
  { x: LOOKOUT.x, z: LOOKOUT.z, radius: 6, falloff: 8 },
  { x: FARM.x, z: FARM.z, radius: 20, falloff: 10 },
  { x: TOWER.x, z: TOWER.z, radius: 7, falloff: 8 },
  { x: WINDMILL.x, z: WINDMILL.z, radius: 8, falloff: 8 },
  { x: JETTY.x - 10, z: JETTY.z + 1, radius: 4, falloff: 10 },
  { x: CHATA.x, z: CHATA.z, radius: 15, falloff: 16 },
  ...BUNKERS.map(bunker => ({ ...bunker, radius: 4.5, falloff: 6 })),
  { x: ROADWORKS.site.x, z: ROADWORKS.site.z, radius: 14, falloff: 10 },
];

function patchOnRoad(x, z) {
  const p = nearestRoadSample(x, z);
  return { x: p.x, z: p.z };
}

/** Special driving surfaces. Ellipses with radii rx/rz. */
export const SURFACES = [
  { id: 'puddle', ...patchOnRoad(40, 110), rx: 9, rz: 6 },
  { id: 'leaves', ...patchOnRoad(-150, 40), rx: 20, rz: 18 },
  { id: 'snow', ...patchOnRoad(-92, -116), rx: 26, rz: 22 },
];

export function surfaceAt(x, z) {
  const patch = SURFACES.find(p => Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz) < 1);
  return patch ? patch.id : 'grass';
}

export function lakeDistance(x, z) {
  return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
}

/** Animals that live in the valley. Walking groups shuttle between two points. */
export const HABITATS = {
  deer: { start: { x: -40, z: 62 }, end: { x: 4, z: 82 }, count: 2, wait: 7, duration: 20 },
  ducks: { start: { x: 92, z: -104 }, end: { x: 102, z: -134 }, count: 4, wait: 11, duration: 16 },
  sheep: { x: -44, z: 80, count: 5 },
  burrow: { x: -161, z: 30 },
  cows: { count: 3 },
  fox: { start: { x: 166, z: 62 }, end: { x: 204, z: 104 }, count: 1, wait: 9, duration: 14 },
  geese: { x: -20, z: 10, radius: 170, height: 58, period: 80 },
  eagle: { x: SERLICH.x, z: SERLICH.z, radius: 34, height: 30, period: 38 },
};

/** Garden gnomes hidden around the valley. Entirely optional. */
export const GNOMES = [
  { x: -71, z: 121 }, // behind the cabin
  { x: 176, z: -64 }, // down by the creek, under the bridge
  { x: 214, z: -71 }, // beside the waterfall pool
  { ...ROAD.offset(TUNNEL.s + 6, 5.4) }, // in the tunnel
  { x: -170, z: 58 }, // in the autumn grove
  { x: -144, z: -40 }, // at the lookout
  { x: 40, z: -318 }, // up against the northern fence
  { x: 64, z: 262 }, // on the southern hills
  { x: -318, z: 70 }, // far out west
  { x: 268, z: 96 }, // on the eastern slopes
];

/** Something large and shy lives in the snow. */
export const YETI = { x: -78, z: -146 };
