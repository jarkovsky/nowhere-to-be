// Where everything in the valley is. Pure data, so tests and the renderer
// agree on the same coordinates. +X is east, +Z is south, heights are metres.
import { createRandom, lerp, smoothstep } from '../core/math.js';
import { createPath, headingOf } from './path.js';

export const WORLD_SIZE = 3600;
/** The fence: the car can't drive further from the centre than this. */
export const VALLEY_RADIUS = 1000;
/** The first fence line. Inside it is the valley; between it and the second are the uplands. */
export const UPLANDS_RADIUS = 355;
/** The second fence line. Between it and the fence are the outlands. */
export const OUTLANDS_RADIUS = 680;

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

/**
 * A road's distance from the centre at any angle (radians, as from Math.atan2(z, x)), from
 * `radii` given at even steps round from due east: a periodic Catmull-Rom spline through them.
 */
function radiusAround(radii) {
  const n = radii.length;
  return angle => {
    const u = ((((angle / (Math.PI * 2)) * n) % n) + n) % n;
    const i = Math.floor(u);
    const t = u - i;
    const p0 = radii[(i + n - 1) % n];
    const p1 = radii[i];
    const p2 = radii[(i + 1) % n];
    const p3 = radii[(i + 2) % n];
    return (
      0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3)
    );
  };
}

/** A closed road all the way round the centre, `radius(angle)` out from it. */
function roadAround(radius, points) {
  return createPath(
    Array.from({ length: points }, (_, i) => {
      const angle = (i / points) * Math.PI * 2;
      return [Math.cos(angle) * radius(angle), Math.sin(angle) * radius(angle)];
    }),
    { closed: true },
  );
}

/** How far from the centre the upland road runs at an angle. */
export const ringRadius = radiusAround(RING_RADII);

export const RING_ROAD = roadAround(ringRadius, 180);

// --- The outlands ------------------------------------------------------------------
// Between the second fence line and the fence. A gravel road runs all the way round, with
// roads out to it from the upland road. What lies out here is kept in lists that the
// terrain, the scenery and the builders all read, so another river, rocky hill or farm is
// a matter of adding an entry.

/** A point `r` metres from the centre at an angle in degrees (0 is due east, 90 due south). */
export function polar(degrees, r) {
  const angle = (degrees * Math.PI) / 180;
  return [Math.cos(angle) * r, Math.sin(angle) * r];
}

/**
 * The outer road, every 15 degrees from due east. It swings in round the head of the fjord
 * in the north-west and past the foot of the rocky hill in the east.
 */
const OUTER_RADII = [
  790, 815, 840, 845, 850, 855, 858, 860, 855, 848, 840, 830, 822, 815, 805, 748, 800, 830, 835, 815, 815, 800, 790,
  770,
];

/** How far from the centre the outer road runs at an angle. */
export const outerRadius = radiusAround(OUTER_RADII);

export const OUTER_ROAD = roadAround(outerRadius, 240);

/** A point on the outer road at an angle in degrees. */
export const outerPoint = degrees => polar(degrees, outerRadius((degrees * Math.PI) / 180));

/** Half the width of the gravel roads. */
export const GRAVEL_HALF_WIDTH = 3.4;

/** Gravel roads from the upland road out to the outer road. */
export const CONNECTORS = [
  { id: 'west', path: createPath([ringPoint(176), polar(176.5, 660), polar(177.5, 760), outerPoint(178)]) },
  { id: 'south', path: createPath([ringPoint(84), polar(84, 660), polar(83, 760), outerPoint(84)]) },
  { id: 'north', path: createPath([ringPoint(338), polar(336, 610), polar(330, 690), outerPoint(324)]) },
];

/** Every gravel road: the outer road and the roads out to it. */
export const GRAVEL = [OUTER_ROAD, ...CONNECTORS.map(connector => connector.path)];

/** True near the middle of any gravel road. */
export function onGravel(x, z, distance = GRAVEL_HALF_WIDTH) {
  return Math.hypot(x, z) > OUTLANDS_RADIUS - 140 && GRAVEL.some(path => path.isNear(x, z, distance));
}

/**
 * Rivers in the outlands, from where they come out of the mountains to where they go back
 * into them. Each runs down its own valley, and wherever a gravel road or a track crosses
 * one, the road dips through the water at a ford. `depth` is in the middle of the stream.
 */
export const RIVERS = [
  {
    // In from the mountains in the south-west, round inside the outer road and out again.
    id: 'river',
    halfWidth: 4,
    depth: 0.8,
    path: createPath(
      [
        polar(150, 1080),
        polar(149, 990),
        polar(147, 900),
        polar(145, 840),
        polar(142, 780),
        polar(136, 740),
        polar(128, 725),
        polar(120, 735),
        polar(114, 775),
        polar(112, 857),
        polar(110, 950),
        polar(108, 1080),
      ],
      { spacing: 1.5 },
    ),
  },
];

/** How deep the water is where a road fords a river. */
export const FORD_DEPTH = 0.3;

/** The river at a point, if it is within `distance` of one: { river, s, distance }, or null. */
export function nearRiver(x, z, distance) {
  for (const river of RIVERS) {
    if (!river.path.isNear(x, z, distance)) continue;
    const { s, distance: d } = river.path.nearest(x, z);
    if (d < distance) return { river, s, distance: d };
  }
  return null;
}

/** A hill of bare rock out to the east, with a track that winds round it to the top. */
export const ROCK_HILL = { x: 857, z: -198, radius: 70, height: 44 };

/**
 * Rocky ground: bare rock and scree, rough and slow to drive over. Tracks across it climb
 * over rocks that lie under one wheel or the other, so the car rocks from side to side.
 */
export const ROCK_FIELDS = [{ x: ROCK_HILL.x, z: ROCK_HILL.z, radius: 150 }];

/** How rocky the ground is at a point: 1 well inside a rocky area, 0 outside them all. */
export function rockiness(x, z) {
  let rocky = 0;
  for (const field of ROCK_FIELDS) {
    const d = Math.hypot(x - field.x, z - field.z);
    if (d < field.radius) rocky = Math.max(rocky, 1 - smoothstep(d, field.radius * 0.6, field.radius));
  }
  return rocky;
}

/** A natural arch of rock over the outer road, below the rocky hill. `span` and `height` are of the opening. */
export const ROCK_GATE = (() => {
  const p = OUTER_ROAD.at(OUTER_ROAD.nearest(...outerPoint(342)).s);
  return { ...p, span: 25, height: 18 };
})();

/**
 * A fjord in the north-west: a long arm of still, deep water between steep rock walls,
 * reaching in from beyond the fence. Its head ends in a gentler slope with a small village
 * at the water's edge, and a road comes down that slope in hairpins from the outer road.
 * `level` is the height of the water; it is wider towards its mouth.
 */
export const FJORD = {
  level: 30,
  depth: 8,
  halfWidth: s => 28 + Math.min(s, 260) * 0.06,
  path: createPath([polar(228, 860), polar(227, 940), polar(226, 1020), polar(225, 1120), polar(224, 1320)], {
    spacing: 2,
  }),
};

// The fjord's extent, so points far from it are turned away at once.
const fjordBox = (() => {
  const reach = FJORD.halfWidth(FJORD.path.length) + 10;
  const xs = FJORD.path.samples.map(p => p.x);
  const zs = FJORD.path.samples.map(p => p.z);
  return {
    x0: Math.min(...xs) - reach,
    x1: Math.max(...xs) + reach,
    z0: Math.min(...zs) - reach,
    z1: Math.max(...zs) + reach,
  };
})();

/** True on the fjord's water, or within `margin` metres of it. */
export function inFjord(x, z, margin = 0) {
  if (x < fjordBox.x0 - margin || x > fjordBox.x1 + margin || z < fjordBox.z0 - margin || z > fjordBox.z1 + margin)
    return false;
  const { s, distance } = FJORD.path.nearest(x, z);
  return distance < FJORD.halfWidth(s) + margin;
}

/**
 * The village round the fjord's head. Places are given by `bearing`, in degrees from
 * straight inland (negative to the left looking inland), and `distance` from the end of the
 * water; they all face the water. `level` is how high each one's ground is levelled to.
 */
export const FJORD_VILLAGE = (() => {
  const head = FJORD.path.at(0);
  const place = (bearing, distance, rise, extra) => {
    const a = (bearing * Math.PI) / 180;
    // Inland is back along the fjord; left of that is its other side.
    const x = head.x - head.dx * Math.cos(a) * distance - head.dz * Math.sin(a) * distance;
    const z = head.z - head.dz * Math.cos(a) * distance + head.dx * Math.sin(a) * distance;
    return { x, z, rotation: Math.atan2(head.x - x, head.z - z), level: FJORD.level + rise, ...extra };
  };
  return {
    head,
    houses: [
      place(-62, 34, 1.8, { paint: '#a5382b' }),
      place(-82, 35, 2, { paint: '#d6a94e' }),
      place(62, 34, 1.8, { paint: '#efe8da' }),
      place(82, 35, 2, { paint: '#a5382b' }),
      place(-66, 50, 4.6, { paint: '#a5382b' }),
    ],
    // Boathouses stand with their doors to the water, at its edge along each side.
    boathouses: [place(-114, 33, 0.9, { paint: '#a5382b' }), place(114, 33, 0.9, { paint: '#a5382b' })],
    church: place(70, 62, 7.2, {}),
    pier: place(-6, 30, 1.2, {}),
    road: hairpins(place, [
      [-50, 100, 28, 80],
      [28, 62, -24, 50],
      [-24, 34, -4, 32],
    ]),
  };
})();

/**
 * Points for a road down a slope round the head of a valley, given as legs of
 * [bearing, distance, bearing, distance] from the start of each to its end. Each leg runs
 * round the head while closing in on it, so it drops steadily, and turns back on itself into
 * the next round a half circle.
 */
function hairpins(place, legs) {
  const points = [];
  const add = (bearing, distance) => {
    const p = place(bearing, distance, 0);
    points.push([p.x, p.z]);
  };
  legs.forEach(([b0, d0, b1, d1], i) => {
    const steps = Math.max(2, Math.round(Math.abs(b1 - b0) / 6));
    for (let k = 0; k <= steps; k++) add(lerp(b0, b1, k / steps), lerp(d0, d1, k / steps));
    const next = legs[i + 1];
    if (!next) return;
    const middle = (d1 + next[1]) / 2;
    const radius = (d1 - next[1]) / 2;
    for (const turn of [0.25, 0.5, 0.75]) {
      const a = turn * Math.PI;
      add(b1 + Math.sign(b1 - b0) * ((radius * Math.sin(a)) / middle) * (180 / Math.PI), middle + radius * Math.cos(a));
    }
  });
  return points;
}

/** Rolling hills out in the outlands. */
export const OUTLAND_HILLS = [
  { x: 790, z: 120, radius: 70, height: 24 },
  { x: 560, z: 690, radius: 80, height: 22 },
  { x: 390, z: 830, radius: 60, height: 18 },
  { x: -640, z: 760, radius: 70, height: 22 },
  { x: -900, z: -200, radius: 75, height: 26 },
  { x: -300, z: -900, radius: 80, height: 30 },
  { x: 800, z: -420, radius: 70, height: 22 },
];

/** A track that leaves a road at `start` and winds round a hill, closing in on its top. */
function roundAndUp(hill, [x, z], { turns = 1.35, from = 80, to = 13 } = {}) {
  const a0 = Math.atan2(z - hill.z, x - hill.x);
  const steps = Math.round(turns * 9);
  const points = [[x, z]];
  for (let k = 0; k <= steps; k++) {
    const a = a0 - (k / steps) * turns * Math.PI * 2;
    const d = lerp(from, to, k / steps);
    points.push([hill.x + Math.cos(a) * d, hill.z + Math.sin(a) * d]);
  }
  return points;
}

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

/** A brook from a spring at the foot of the northern hills, across the trail at a ford and into the lake. */
export const BROOK = createPath(
  [
    [47, -192],
    [51, -172],
    [55, -154],
    [59, -134],
    [63, -115],
    [69, -101],
    [74, -89],
  ],
  { spacing: 0.75 },
);
export const BROOK_HALF_WIDTH = 1.8;
export const SPRING = { x: 47, z: -192, radius: 3.2 };

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

/** Points for a track that leaves the outer road where it passes closest to the first of them. */
function fromOuterRoad(...points) {
  const start = OUTER_ROAD.nearest(...points[0]).sample;
  return [[start.x, start.z], ...points];
}

/**
 * Narrow side tracks: two dirt ruts with grass between, or a footpath along the shore.
 * `grade`, where given, is the steepest they climb.
 */
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
    // Up the brook's west bank to the spring, over a stretch of rocks on the way.
    id: 'spring',
    ruts: true,
    path: createPath(fromRoad(52, -112, [46, -128], [42, -145], [41, -162], [43, -178])),
  },
  {
    id: 'shore',
    ruts: false,
    path: createPath([[33, -12], [46, -5], [60, 4], [74, 13], [90, 11], [104, 9], [117, 22], ...fromRoad(128, 40)]),
  },
  {
    // Off the outer road, then round the rocky hill and over its rocks to the top.
    id: 'rockhill',
    ruts: true,
    grade: 0.22,
    path: createPath(roundAndUp(ROCK_HILL, outerPoint(354))),
  },
  {
    // Off the outer road and down the slope at the head of the fjord to the village.
    id: 'fjord',
    ruts: true,
    grade: 0.14,
    path: createPath(fromOuterRoad(...FJORD_VILLAGE.road)),
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
/**
 * Rocks across the tracks to drive over, as bumps in the surface the tyres rest on: `h` high
 * in the middle, easing off to nothing `r` metres away. They lie under one wheel or the other
 * in turn, so the car rocks from side to side: a stretch of them on the spring track, and
 * all the way across rocky ground.
 */
export const TRACK_ROCKS = (() => {
  const spring = TRACKS.find(track => track.id === 'spring').path;
  const rocks = Array.from({ length: 11 }, (_, k) => {
    const p = spring.offset(15 + k * 2.2, (k % 2 ? 1 : -1) * (0.75 + ((k * 0.37) % 0.4)));
    return { x: p.x, z: p.z, r: 0.85 + ((k * 0.53) % 0.35), h: 0.22 + ((k * 0.71) % 0.18) };
  });
  const random = createRandom(4471);
  for (const { path } of TRACKS) {
    let side = 1;
    for (let s = 10; s < path.length - 6; s += 1.9 + random() * 1.3) {
      const p = path.at(s);
      if (rockiness(p.x, p.z) < 0.5) continue;
      side = -side;
      const q = path.offset(s, side * (0.7 + random() * 0.45));
      rocks.push({ x: q.x, z: q.z, r: 0.8 + random() * 0.4, h: 0.2 + random() * 0.22 });
    }
  }
  return rocks;
})();

/** Where the trail fords the brook: `s` along the trail and `brook` along the brook. */
export const FORD = (() => {
  let best = { distance: Infinity };
  for (const sample of ROAD.samples) {
    const { distance, s } = BROOK.nearest(sample.x, sample.z);
    if (distance < best.distance) best = { x: sample.x, z: sample.z, s: sample.s, brook: s, distance };
  }
  return best;
})();

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
  { id: 'rockhill', x: ROCK_HILL.x, z: ROCK_HILL.z },
  { id: 'fjord', x: FJORD_VILLAGE.pier.x, z: FJORD_VILLAGE.pier.z },
];

/**
 * Ground that flattens so buildings and camp furniture sit on level ground: to its natural
 * height, or to `level` where one is given.
 */
export const PADS = [
  ...[...FJORD_VILLAGE.houses, ...FJORD_VILLAGE.boathouses, FJORD_VILLAGE.church].map(({ x, z, level }) => ({
    x,
    z,
    level,
    radius: 6,
    falloff: 5,
  })),
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

/** The point `fraction` of the way along a side track. */
function patchOnTrack(id, fraction) {
  const { path } = TRACKS.find(track => track.id === id);
  const p = path.at(path.length * fraction);
  return { x: p.x, z: p.z };
}

/** Special driving surfaces. Ellipses with radii rx/rz. */
export const SURFACES = [
  { id: 'puddle', ...patchOnRoad(40, 110), rx: 9, rz: 6 },
  { id: 'leaves', ...patchOnRoad(-150, 40), rx: 20, rz: 18 },
  { id: 'snow', ...patchOnRoad(-92, -116), rx: 26, rz: 22 },
  // Muddy stretches of the side tracks.
  { id: 'mud', ...patchOnTrack('farm', 0.5), rx: 6, rz: 6 },
  { id: 'mud', ...patchOnTrack('tower', 0.5), rx: 7, rz: 6 },
  { id: 'mud', ...patchOnTrack('fields', 0.5), rx: 8, rz: 7 },
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
