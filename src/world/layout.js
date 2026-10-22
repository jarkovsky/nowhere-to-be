// Where everything in the valley is. Pure data, so tests and the renderer
// agree on the same coordinates. +X is east, +Z is south, heights are metres.
import { createPath, headingOf } from './path.js';

export const WORLD_SIZE = 2400;
/** The fence: the car can't drive further from the centre than this. */
export const VALLEY_RADIUS = 680;
/** The old fence line. Inside it is the valley; between it and the fence are the uplands. */
export const UPLANDS_RADIUS = 355;

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

/** The highest summit in the uplands (after Velká Deštná), snowy on top, with a lookout tower. */
export const SUMMIT = { x: -292, z: -330, radius: 72, height: 46 };

/** Rounded hills out in the uplands, and a rocky peak among the northern crags. */
export const UPLAND_HILLS = [
  { x: 420, z: 40, radius: 52, height: 20 },
  { x: -262, z: 338, radius: 62, height: 24 },
  { x: 40, z: 452, radius: 46, height: 16 },
  { x: -446, z: -40, radius: 56, height: 22 },
  { x: 236, z: -404, radius: 58, height: 38 },
];

/** Farmland in a broad pass to the south-east, flattened for fields. The rows run along its local Z. */
export const FIELDS = { x: 262, z: 318, radius: 95, rotation: 0.85 };

/** A point given in the farmland's own frame: `lx` across the rows, `lz` along them. */
export function fieldPoint(lx, lz) {
  const cos = Math.cos(FIELDS.rotation);
  const sin = Math.sin(FIELDS.rotation);
  return { x: FIELDS.x + lx * cos + lz * sin, z: FIELDS.z - lx * sin + lz * cos };
}

/** The fields, in the farmland's frame. The tractors work `plough` and `mow`, the combine `wheat`. */
export const FIELD_PLOTS = {
  plough: { x0: -62, x1: -4, z0: -6, z1: 70 },
  mow: { x0: 7, x1: 63, z0: -6, z1: 70 },
  rapeseed: { x0: -62, x1: -26, z0: -52, z1: -14 },
  wheat: { x0: 21, x1: 63, z0: -56, z1: -14 },
  young: { x0: -62, x1: 63, z0: 76, z1: 90 },
};

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

/**
 * The upland road: a paved ring round the uplands, given as its distance from the
 * centre every 15 degrees, starting due east and turning towards the south (+Z).
 * It swings in on the east side to leave room for the airfield.
 */
const RING_RADII = [
  495, 500, 540, 590, 600, 600, 592, 590, 595, 600, 597, 590, 586, 585, 590, 600, 605, 600, 595, 595, 592, 585, 560,
  520,
];

/** How far from the centre the upland road runs at an angle (radians, as from Math.atan2(z, x)). */
export function ringRadius(angle) {
  const n = RING_RADII.length;
  const u = ((((angle / (Math.PI * 2)) * n) % n) + n) % n;
  const i = Math.floor(u);
  const t = u - i;
  const [p0, p1, p2, p3] = [-1, 0, 1, 2].map(k => RING_RADII[(i + k + n) % n]);
  // A periodic Catmull-Rom spline through the radii.
  return (
    0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3)
  );
}

export const RING_ROAD = createPath(
  Array.from({ length: 180 }, (_, i) => {
    const angle = (i / 180) * Math.PI * 2;
    const radius = ringRadius(angle);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  }),
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

/** A small white chapel on top of the eastern knoll, facing down into the valley. */
export const CHAPEL = { x: 245, z: 144, rotation: Math.atan2(-245, -144) };

/** A helipad on the flat-topped hill, behind the windmill. `heading` is the way the helicopter faces. */
export const HELIPAD = { x: -287, z: 37, heading: 0.9 };

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

/** A small upland farm where the fields track ends: a timber cottage and an open shed. */
export const FARMSTEAD = { x: 236, z: 312, rotation: FIELDS.rotation };

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
    // Off the west road, up onto the flat-topped hill.
    id: 'windmill',
    ruts: true,
    path: createPath([
      [-212, -17],
      [-224, 0],
      [-238, 15],
      [-251, 25],
    ]),
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
    // Up the long north-west slope and round three hairpins to the summit.
    id: 'summit',
    ruts: true,
    path: createPath(
      fromRoad(
        -178,
        -34,
        [-205, -72],
        [-238, -110],
        [-268, -145],
        [-300, -165],
        [-322, -188],
        [-318, -210],
        [-290, -214],
        [-262, -218],
        [-246, -232],
        [-258, -250],
        [-286, -258],
        [-314, -268],
        [-332, -286],
        [-326, -306],
        [-306, -312],
        [-300, -320],
      ),
    ),
  },
  {
    // Past the chapel and up onto the farmland in the south-east.
    id: 'fields',
    ruts: true,
    path: createPath(
      fromRoad(
        112,
        80,
        [148, 100],
        [178, 128],
        [192, 160],
        [214, 180],
        [238, 190],
        [230, 214],
        [218, 240],
        [228, 272],
        [244, 298],
      ),
    ),
  },
  {
    id: 'shore',
    ruts: false,
    path: createPath([[33, -12], [46, -5], [60, 4], [74, 13], [90, 11], [104, 9], [117, 22], ...fromRoad(128, 40)]),
  },
];

/** A point on the upland road at an angle in degrees (0 is due east, 90 due south). */
function ringPoint(degrees) {
  const angle = (degrees * Math.PI) / 180;
  const radius = ringRadius(angle);
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

/**
 * A small airfield on the eastern plateau, between the upland road and the fence. The
 * runway runs north to south along X = `x`; planes take off to the north and land to
 * the south. `apron` is where they park, joined to the runway by a taxiway at `taxiZ`.
 */
export const AIRFIELD = {
  x: 598,
  z0: 0,
  z1: 232,
  width: 16,
  apron: { x0: 528, x1: 586, z0: 150, z1: 206 },
  taxiZ: 196,
  hangar: { x: 514, z: 160 },
  tower: { x: 554, z: 132 },
  /** The levelled ground round it all. */
  ground: { x0: 500, x1: 612, z0: -8, z1: 240 },
};

/** The ground under the runway, the taxiway and the apron is levelled to one height. */
export function onAirfield(x, z, margin = 0) {
  const { apron } = AIRFIELD;
  const runway =
    Math.abs(x - AIRFIELD.x) < AIRFIELD.width / 2 + margin && z > AIRFIELD.z0 - margin && z < AIRFIELD.z1 + margin;
  const parking = x > apron.x0 - margin && x < apron.x1 + margin && z > apron.z0 - margin && z < apron.z1 + margin;
  const taxiway = x > apron.x1 - 1 && x < AIRFIELD.x && Math.abs(z - AIRFIELD.taxiZ) < 5 + margin;
  return runway || parking || taxiway;
}

/**
 * Paved roads up from the valley trail to the upland road, one to the east and one to
 * the west, and a short one from the upland road to the airfield.
 */
export const LINKS = [
  {
    // Up the steep eastern side of the valley, past the waterfall.
    id: 'east',
    grade: 0.15,
    path: createPath(
      fromRoad(
        180,
        -80,
        [198, -110],
        [214, -146],
        [244, -172],
        [290, -180],
        [340, -172],
        [392, -160],
        [442, -150],
        [482, -143],
        ringPoint(-15.5),
      ),
    ),
  },
  {
    id: 'west',
    grade: 0.12,
    path: createPath(
      fromRoad(
        -186,
        -6,
        [-214, -18],
        [-250, -38],
        [-300, -50],
        [-350, -40],
        [-392, -8],
        [-432, 26],
        [-482, 46],
        [-540, 54],
        ringPoint(175),
      ),
    ),
  },
  {
    id: 'airfield',
    grade: 0.12,
    path: createPath([ringPoint(19.5), [503, 182], [AIRFIELD.apron.x0 + 2, 188]]),
  },
];

/** Every paved road outside the valley: the upland ring and the links to it. */
export const PAVED = [RING_ROAD, ...LINKS.map(link => link.path)];

/** True near the middle of any paved road. */
export function onPaved(x, z, distance = ROAD_HALF_WIDTH) {
  return PAVED.some(path => path.isNear(x, z, distance));
}

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

/** Places marked on the map board at the trailhead. */
export const PLACES = [
  { id: 'waterfall', x: WATERFALL.x - 14, z: WATERFALL.z },
  { id: 'bridge', x: BRIDGE.x, z: BRIDGE.z },
  { id: 'tunnel', x: TUNNEL.x, z: TUNNEL.z },
  { id: 'campsite', x: CAMP.x, z: CAMP.z },
  { id: 'lookout', x: LOOKOUT.x, z: LOOKOUT.z },
  { id: 'farm', x: FARM.x, z: FARM.z },
  { id: 'tower', x: TOWER.x, z: TOWER.z },
  { id: 'windmill', x: WINDMILL.x, z: WINDMILL.z },
  { id: 'jetty', x: JETTY.x, z: JETTY.z + 6 },
  { id: 'chata', x: CHATA.x, z: CHATA.z },
  { id: 'bunker', x: BUNKERS[1].x, z: BUNKERS[1].z },
  { id: 'halt', ...haltCentre },
  { id: 'roadworks', x: ROADWORKS.site.x, z: ROADWORKS.site.z },
  { id: 'helipad', x: HELIPAD.x, z: HELIPAD.z },
  { id: 'chapel', x: CHAPEL.x, z: CHAPEL.z },
  { id: 'summit', x: SUMMIT.x, z: SUMMIT.z },
  { id: 'fields', x: FARMSTEAD.x, z: FARMSTEAD.z },
  { id: 'airfield', x: AIRFIELD.x - 30, z: (AIRFIELD.z0 + AIRFIELD.z1) / 2 },
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
  { x: HELIPAD.x, z: HELIPAD.z, radius: 10.5, falloff: 7 },
  { x: CHAPEL.x, z: CHAPEL.z, radius: 5, falloff: 6 },
  { x: SUMMIT.x, z: SUMMIT.z, radius: 8, falloff: 10 },
  { x: FARMSTEAD.x, z: FARMSTEAD.z, radius: 12, falloff: 10 },
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
  woodFox: { start: { x: -198, z: -98 }, end: { x: -232, z: -136 }, count: 1, wait: 12, duration: 20 },
  /** A fox hunting mice in the long grass at the edge of the upland fields. */
  mousingFox: fieldPoint(-74, 22),
  geese: { x: -20, z: 10, radius: 170, height: 58, period: 80 },
  eagle: { x: SERLICH.x, z: SERLICH.z, radius: 34, height: 30, period: 38 },
};

/** Garden gnomes hidden around the valley. Entirely optional. */
export const GNOMES = [
  { x: -71, z: 121 }, // behind the cabin
  { x: 176, z: -64 }, // down by the creek, under the bridge
  { x: 211.5, z: -70 }, // beside the waterfall pool
  { ...ROAD.offset(TUNNEL.s + 6, 5.4) }, // in the tunnel
  { x: -170, z: 58 }, // in the autumn grove
  { x: -144, z: -40 }, // at the lookout
  { x: 40, z: -318 }, // on the northern ridge
  { x: 64, z: 262 }, // on the southern hills
  { x: -318, z: 70 }, // far out west
  { x: 268, z: 96 }, // on the eastern slopes
];

/** The loop the wolf pack roams, on the slopes below the summit. */
export const WOLF_ROUTE = createPath(
  [
    [-226, -268],
    [-186, -262],
    [-160, -290],
    [-168, -330],
    [-205, -342],
    [-232, -308],
  ],
  { closed: true },
);

/** Farmyards where chickens peck about, in each farm's own frame. */
export const YARDS = [
  { x: FARM.x, z: FARM.z, rotation: FARM.rotation, x0: -4, x1: 3, z0: -1, z1: 6, hens: 6 },
  { x: FARMSTEAD.x, z: FARMSTEAD.z, rotation: FARMSTEAD.rotation, x0: -6, x1: 4, z0: 2.5, z1: 8, hens: 4 },
];

/** Something large and shy lives in the snow. */
export const YETI = { x: -78, z: -146 };
