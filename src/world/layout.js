// Where everything in the valley is. Pure data, so tests and the renderer
// agree on the same coordinates. +X is east, +Z is south, heights are metres.
import { createPath, headingOf } from './path.js';

export const WORLD_SIZE = 1600;
/** The fence: the car can't drive further from the centre than this. */
export const VALLEY_RADIUS = 355;

export const LAKE = { x: 93, z: -54, rx: 61, rz: 44, level: -2.2 };

export const ROAD_HALF_WIDTH = 4.4;

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

const crossing = findCrossing();
export const BRIDGE = { ...crossing, length: 22, width: 7.6 };

const tunnelCentre = nearestRoadSample(-134, -84);
export const TUNNEL = { ...tunnelCentre, length: 38, radius: 6.4 };

const start = ROAD.at(nearestRoadSample(-36, 97).s);
export const SPAWN = { x: start.x, z: start.z, heading: headingOf(start.dx, start.dz) };

/** Places that earn a scrapbook sticker. `radius` is how close you need to get. */
export const PLACES = [
  { id: 'waterfall', x: WATERFALL.x - 14, z: WATERFALL.z, radius: 26 },
  { id: 'bridge', x: BRIDGE.x, z: BRIDGE.z, radius: 9 },
  { id: 'tunnel', x: TUNNEL.x, z: TUNNEL.z, radius: 12 },
  { id: 'campsite', x: CAMP.x, z: CAMP.z, radius: 16 },
  { id: 'lookout', x: LOOKOUT.x, z: LOOKOUT.z, radius: 10 },
];

/** Ground that flattens so buildings and camp furniture sit on level ground. */
export const PADS = [
  { x: CAMP.x - 4, z: CAMP.z - 2, radius: 13, falloff: 10 },
  { x: CABIN.x, z: CABIN.z, radius: 9, falloff: 8 },
  { x: LOOKOUT.x, z: LOOKOUT.z, radius: 6, falloff: 8 },
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
