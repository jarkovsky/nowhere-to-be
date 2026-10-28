// The map of the valley, drawn from the heights, the water and the roads: one picture for the
// full-screen map in the menu and the minimap in the corner, the roads and streams again as
// lines for the full map to draw sharp at any zoom, and the pictures that mark the places.
// Nothing is drawn until the map is first wanted, and then a little at a time.
import { clamp, fractalNoise, lerp, smoothstep } from '../core/math.js';
import * as layout from '../world/layout.js';
import { snowCover, terrainHeight, waterLevel } from '../world/terrain.js';

const {
  AIRFIELD,
  BROOK,
  BROOK_HALF_WIDTH,
  CAMP_TRAIL,
  CREEK,
  CREEK_HALF_WIDTH,
  DESERT,
  FARM,
  FIELDS,
  FIELD_PLOTS,
  FJORD,
  GRAVEL,
  LAKE,
  OXBOW,
  PAVED,
  PLACES,
  PONDS,
  RAILWAY,
  RIVERS,
  ROAD,
  SPRING,
  TRACKS,
  VALLEY_RADIUS,
  WATERFALL,
  desertness,
  winterness,
  lakeDistance,
  rockiness,
} = layout;

/** The picture covers this far from the middle each way, in metres: the fence and a little beyond. */
export const MAP_EXTENT = 1060;
/** Its size in pixels, about a metre each. */
const SIZE = 2048;
/** The ground's colours are worked out at half that and smoothed up: the height grid is 3.5 m apart anyway. */
const HALF = SIZE / 2;
/** Pixels per metre in the picture. */
export const MAP_SCALE = SIZE / (2 * MAP_EXTENT);

export const PAPER = '#efe9d6';
const WATER = '#8cc3d3';

// --- The places ------------------------------------------------------------------------

// The badges' colours: water, buildings, the outdoors, getting about, and the farms and rocks.
const BLUE = '#3b86b5';
const RED = '#c2553a';
const GREEN = '#4a8a4f';
const SLATE = '#4b6274';
const BROWN = '#94693f';

/**
 * A picture for each kind of place, white on a coloured badge, as SVG path data on a 24 by 24
 * grid: `d` is stroked and `solid` filled. `name` is for screen readers and a mouse's tooltip.
 * Places without one aren't marked. They are listed most important first: where badges would crowd each other, the ones further down wait for a
 * closer zoom.
 */
export const PLACE_ICONS = {
  campsite: {
    name: 'Camp',
    color: GREEN,
    d: 'M3 20h18M5 20l7-13 7 13M9.5 20l2.5-5 2.5 5M10.5 4.2 12 7l1.5-2.8',
  },
  waterfall: {
    name: 'Whispering Falls',
    color: BLUE,
    d: 'M5 4.5h14M8.5 4.5V13M12 4.5V15M15.5 4.5V13M3.5 19.5q2.1-1.8 4.2 0t4.3 0 4.3 0 4.2 0',
  },
  farm: {
    name: 'Farm',
    color: RED,
    d: 'M4 20v-9.5L12 5l8 5.5V20ZM9 20v-6h6v6M9 14l6 6M15 14l-6 6',
  },
  tunnel: {
    name: 'Echo Mountain',
    color: SLATE,
    d: 'M2 20h20M3 20 9.5 7.5l3 4.5 2-2.8L21 20M8.5 20v-2.5a3.5 3.5 0 0 1 7 0V20',
  },
  bridge: {
    name: 'Bridge',
    color: SLATE,
    d: 'M2 8.5h20M4.5 8.5V19M19.5 8.5V19M4.5 19a7.5 7.5 0 0 1 15 0',
  },
  tower: {
    name: 'Fire Tower',
    color: GREEN,
    d: 'M8.5 21 10.3 10M15.5 21 13.7 10M9.4 15.5h5.2M7 10h10M8.5 10V6.5h7V10M7 6.5 12 3l5 3.5',
  },
  windmill: {
    name: 'Windmill',
    color: GREEN,
    d: 'M9.2 21 10.6 13h2.8l1.4 8ZM12 10 6 4M12 10l6-6M12 10l-5 5M12 10l5 5',
  },
  chata: {
    name: 'Masarykova chata',
    color: RED,
    d: 'M1.5 13.5 7 6.5l2.5 3M22.5 13.5 17 6.5l-2.5 3M6 21v-7l6-5 6 5v7ZM10.5 21v-3.5h3V21',
  },
  jetty: {
    name: 'Jetty',
    color: BLUE,
    d: 'M3 15.5h18l-3 4.5H6ZM12 15.5V3M12 4.5l6 9H12M10 6.5 6 13.5h4',
  },
  airfield: {
    name: 'Airfield',
    color: SLATE,
    solid: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z',
  },
  summit: {
    name: 'Velká Deštná',
    color: GREEN,
    d: 'M2 20.5 9.5 7l3.5 6 2.5-3.5 6.5 11ZM9.5 7V2.5l4.5 1.6-4.5 1.6',
  },
  fjord: {
    name: 'Fjord',
    color: BLUE,
    d: 'M2 15.5 6 4l3.5 11.5M22 15.5 18 4l-3.5 11.5M3.5 19.5q2.1-1.8 4.2 0t4.3 0 4.3 0 4.2 0',
  },
  desert: {
    name: 'Desert',
    color: '#c4943b',
    d: 'M3 21h18',
    solid:
      'M10 21V5a2 2 0 0 1 4 0v16ZM10 15.5H7.5A2.5 2.5 0 0 1 5 13V9.5a1.5 1.5 0 0 1 3 0V13h2ZM14 12.5h2.5A2.5 2.5 0 0 0 19 10V6.5a1.5 1.5 0 0 0-3 0V10h-2Z',
  },
  village: {
    name: 'Fire station',
    color: RED,
    d: 'M2.5 17V10.5H14V17M14 12.5h4l3.5 3.5v1M2.5 17h1.3M8.2 17h5.6M19.7 17h1.8M3.5 7.5h9.5M5.5 7.5v3M8.2 7.5v3M11 7.5v3',
    solid: 'M4 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15.5 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  },
  chapel: {
    name: 'Chapel',
    color: RED,
    d: 'M6 21v-9l6-5 6 5v9ZM12 7V2M10 4h4M10.5 21v-3a1.5 1.5 0 0 1 3 0v3',
  },
  fishing: {
    name: 'Fishing hut',
    color: BLUE,
    d: 'M2.5 12c2.8-4.2 8-5.6 12.5-3.2 1.5.8 2.8 2.1 4.2 3.2-1.4 1.1-2.7 2.4-4.2 3.2-4.5 2.4-9.7 1-12.5-3.2ZM19.2 12l2.3-3.5v7Z',
    solid: 'M7.4 11a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z',
  },
  orchard: {
    name: 'Orchard',
    color: GREEN,
    d: 'M12 8c-1.5-1.1-3.5-1.5-5.2-.7C4 8.5 3.3 12 4.3 15.1c1 3.2 3.3 5.9 5.4 5.9 1 0 1.4-.5 2.3-.5s1.3.5 2.3.5c2.1 0 4.4-2.7 5.4-5.9 1-3.1.3-6.6-2.5-7.8-1.7-.8-3.7-.4-5.2.7ZM12 8c0-2 .5-3.5 1.8-4.8',
    solid: 'M13.6 5.6c.8-1.9 2.7-2.9 4.9-2.6-.6 2-2.6 3-4.9 2.6Z',
  },
  depot: {
    name: 'Depot',
    color: BROWN,
    d: 'M3 20.5V9.5L12 4l9 5.5v11M7 20.5v-8h10v8M7 15.2h10M7 17.9h10',
  },
  halt: {
    name: 'Railway halt',
    color: SLATE,
    d: 'M7 3.5h10a3 3 0 0 1 3 3V15a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3ZM4 10.5h16M8 18l-2.5 3.5M16 18l2.5 3.5',
    solid: 'M6.7 14.3a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0M14.7 14.3a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0',
  },
  oxbow: {
    name: 'Deep ford',
    color: BLUE,
    d: 'M6.5 11.5 8 7.5h8l1.5 4M4 15.5v-4h16v4M2.5 16.5q2.4-2 4.8 0t4.7 0 4.7 0 4.8 0M4.5 20.5q1.9-1.6 3.8 0t3.7 0 3.7 0 3.8 0',
  },
  helipad: {
    name: 'Helipad',
    color: SLATE,
    d: 'M3.5 4.5h15M11 4.5V8M9 8h5.5a4 4 0 0 1 0 8H9a4 4 0 0 1 0-8ZM18.5 12h3.5M22 10v4M7 20h10M9.5 16v4M14.5 16v4',
  },
  fields: {
    name: 'Upland farm',
    color: BROWN,
    d: 'M12 21.5V6.5',
    solid:
      'M12 10.5c-2.5 0-4-1.7-4-4 2.5 0 4 1.7 4 4ZM12 10.5c2.5 0 4-1.7 4-4-2.5 0-4 1.7-4 4ZM12 14.5c-2.5 0-4-1.7-4-4 2.5 0 4 1.7 4 4ZM12 14.5c2.5 0 4-1.7 4-4-2.5 0-4 1.7-4 4ZM12 18.5c-2.5 0-4-1.7-4-4 2.5 0 4 1.7 4 4ZM12 18.5c2.5 0 4-1.7 4-4-2.5 0-4 1.7-4 4ZM12 6.5c-1.2-1.2-1.2-3.3 0-4.5 1.2 1.2 1.2 3.3 0 4.5Z',
  },
  rockhill: {
    name: 'Rocky hill',
    color: BROWN,
    d: 'M2 20h20M3.2 20c-.6-4.6 1.6-9 5.8-9.2 3.4-.2 5.2 2.6 5.6 5.4M12.8 20c0-3.4 1.9-5.8 4.5-5.8s3.9 2.6 3.9 5.8M7 14.5l1.5 1.5',
  },
  roadworks: {
    name: 'Roadworks',
    color: '#d58a22',
    d: 'M3 20.5h18M6 20.5 10.5 4h3L18 20.5M8.2 12.5h7.6M7.1 16.5h9.8',
  },
  horses: {
    name: 'Horses',
    color: BROWN,
    solid:
      'M14.5 2.5 13 5.8C10.5 7 7.5 10 5 12.7c-1 1-.9 2.7.3 3.4 1.2.7 2.6.4 3.6-.4l2-1.6c.5 2 .2 4.2-.6 6.4h9c.3-5-.6-10-3-13.8l-.8-3.4-.9 1.3Z',
  },
  goats: {
    name: 'Goats',
    color: BROWN,
    d: 'M9 7.5C8.2 4.8 6.2 3.2 3.5 3.5M15 7.5c.8-2.7 2.8-4.3 5.5-4M8.6 9.5 4.5 10.5M15.4 9.5l4.1 1M9 7.5h6l1 4.5-2.5 6.5h-3L8 12ZM11 18.5l1 3 1-3',
  },
  bunker: {
    name: 'Bunkers',
    color: '#6f7448',
    d: 'M3 19.5h18M4.5 19.5l1.5-8h12l1.5 8M8 15.2h8M8.5 11.5 9.5 9M12 11.5V8.5M15.5 11.5 14.5 9',
  },
  lookout: {
    name: 'Lookout',
    color: GREEN,
    d: 'M3.5 21.5v-2a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v2ZM6.5 16.5v-1.8a2.6 2.6 0 0 1 2.6-2.6h5.8a2.6 2.6 0 0 1 2.6 2.6v1.8ZM9.2 12.1v-1.5a2.3 2.3 0 0 1 2.3-2.3h1a2.3 2.3 0 0 1 2.3 2.3v1.5ZM12 8.3V3',
  },
};

/** The places to mark on the map, most important first, with their pictures. */
export const MAP_PLACES = Object.keys(PLACE_ICONS).flatMap(id =>
  PLACES.filter(place => place.id === id).map(place => ({ ...place, ...PLACE_ICONS[id] })),
);

/** A place's badge as markup: the coloured circle comes from CSS (`--badge`). */
export function badgeMarkup({ d, solid }) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${d ? `<path d="${d}"/>` : ''}${solid ? `<path class="solid" d="${solid}"/>` : ''}</svg>`;
}

/** The arrow for the car, pointing up the 24 by 24 grid. */
export const ARROW = 'M12 2.6 19.8 20.6 12 16.4 4.2 20.6Z';

export function arrowMarkup() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ARROW}"/></svg>`;
}

/**
 * A place's badge drawn on a canvas `size` pixels across, for the minimap to stamp: a coloured
 * circle with a white edge and the picture in white.
 */
export function badgeImage(icon, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.ceil(size);
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  ctx.beginPath();
  ctx.arc(r, r, r - size * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = icon.color;
  ctx.fill();
  ctx.lineWidth = size * 0.08;
  ctx.strokeStyle = '#fffdf4';
  ctx.stroke();
  const inner = size * 0.6;
  ctx.translate(r - inner / 2, r - inner / 2);
  ctx.scale(inner / 24, inner / 24);
  ctx.strokeStyle = ctx.fillStyle = '#fffdf4';
  ctx.lineWidth = 2.3;
  ctx.lineCap = ctx.lineJoin = 'round';
  if (icon.d) ctx.stroke(new Path2D(icon.d));
  if (icon.solid) ctx.fill(new Path2D(icon.solid));
  return canvas;
}

// --- The lines: streams, tracks, roads and the railway --------------------------------

/** A path as a Path2D in world metres, with every `step`th of its samples (about a metre apart). */
function pathShape(path, step = 3) {
  const shape = new Path2D();
  const { samples } = path;
  for (let i = 0; i < samples.length; i += step) {
    const p = samples[i];
    if (i === 0) shape.moveTo(p.x, p.z);
    else shape.lineTo(p.x, p.z);
  }
  const last = samples[samples.length - 1];
  if (path.closed) shape.closePath();
  else shape.lineTo(last.x, last.z);
  return shape;
}

function shapeOf(paths, step) {
  const shape = new Path2D();
  for (const path of paths) shape.addPath(pathShape(path, step));
  return shape;
}

/** Rectangles in world metres, as one Path2D. */
function boxes(list) {
  const shape = new Path2D();
  for (const { x0, x1, z0, z1 } of list) shape.rect(x0, z0, x1 - x0, z1 - z0);
  return shape;
}

/** The desert's buttes, as one Path2D in world metres. */
function buttes() {
  const shape = new Path2D();
  for (const { x, z, rx, rz } of DESERT.buttes) {
    shape.moveTo(x + rx, z);
    shape.ellipse(x, z, rx, rz, 0, 0, Math.PI * 2);
  }
  return shape;
}

function segment(x0, z0, x1, z1) {
  const shape = new Path2D();
  shape.moveTo(x0, z0);
  shape.lineTo(x1, z1);
  return shape;
}

/**
 * The lines on the map, bottom to top. Widths are in metres, about as wide as they are in the
 * world, and `min` is the narrowest each is drawn in pixels, so they still show from afar. A
 * `casing` is a darker `edge` either side, in metres. Dashes are in metres, and never shorter
 * than as many pixels. `fill` fills a shape instead, with a thin edge.
 */
let lines = null;
function mapLines() {
  if (lines) return lines;
  const tracks = TRACKS.map(track => track.path);
  const { apron } = AIRFIELD;
  const runway = {
    x0: AIRFIELD.x - AIRFIELD.width / 2,
    x1: AIRFIELD.x + AIRFIELD.width / 2,
    z0: AIRFIELD.z0,
    z1: AIRFIELD.z1,
  };
  const taxiway = { x0: apron.x1 - 1, x1: AIRFIELD.x, z0: AIRFIELD.taxiZ - 5, z1: AIRFIELD.taxiZ + 5 };
  lines = [
    ...RIVERS.map(river => ({ shape: shapeOf([river.path], 4), color: WATER, width: river.typical * 2, min: 2.5 })),
    { shape: shapeOf([CREEK], 4), color: WATER, width: CREEK_HALF_WIDTH * 2, min: 2 },
    { shape: shapeOf([BROOK], 4), color: WATER, width: BROOK_HALF_WIDTH * 2, min: 2 },
    // The tracks: brown dashes on a pale verge, so they show on the woods as well as the meadows.
    { shape: shapeOf(tracks), color: '#f3ead0', width: 4.2, min: 3.4 },
    { shape: shapeOf(tracks), color: '#94704a', width: 2.6, min: 1.8, dash: [6, 4] },
    { shape: shapeOf(GRAVEL), color: '#e6d9b4', width: 6.8, min: 3.2, casing: 1.6, edge: '#a08d6b' },
    { shape: boxes([apron, taxiway]), fill: '#d6d7d0', edge: '#8f918a' },
    { shape: buttes(), fill: '#cf9b72', edge: '#a26a46' },
    { shape: boxes([runway]), fill: '#a9aba4', edge: '#7e807a' },
    {
      shape: segment(AIRFIELD.x, AIRFIELD.z0 + 8, AIRFIELD.x, AIRFIELD.z1 - 8),
      color: '#fbfaf5',
      width: 0.8,
      min: 1,
      dash: [6, 6],
    },
    { shape: shapeOf(PAVED), color: '#fdfcf6', width: 8.8, min: 4, casing: 1.6, edge: '#8f918a' },
    { shape: shapeOf([CAMP_TRAIL]), color: '#f6e7bd', width: 5.2, min: 3, casing: 1.5, edge: '#b0915c' },
    { shape: shapeOf([ROAD]), color: '#f6e7bd', width: 8.8, min: 4.5, casing: 1.6, edge: '#b0915c' },
    { shape: shapeOf([RAILWAY]), color: '#55584f', width: 2.8, min: 3 },
    { shape: shapeOf([RAILWAY]), color: '#fbfaf5', width: 1.1, min: 1.2, dash: [5, 5] },
  ];
  return lines;
}

/**
 * Draws the lines on a canvas whose transform maps world metres to its pixels, `scale` pixels
 * to a metre. They are clipped to the fence, which is drawn as a dashed line.
 */
export function drawMapLines(ctx, scale) {
  const px = value => value / scale;
  ctx.save();
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, VALLEY_RADIUS, 0, Math.PI * 2);
  ctx.setLineDash([Math.max(7, px(7)), Math.max(6, px(6))]);
  ctx.lineWidth = Math.max(1.2, px(1.5));
  ctx.strokeStyle = '#a58b62';
  ctx.stroke();
  ctx.clip();
  // Each kind of road is one shape, its darker edge drawn under all of it before its middle,
  // so where two of them meet they join up cleanly.
  for (const line of mapLines()) {
    const width = Math.max(line.width ?? 0, px(line.min ?? 0));
    if (line.fill) {
      ctx.setLineDash([]);
      ctx.lineWidth = Math.max(px(1.2), 1.5);
      ctx.strokeStyle = line.edge;
      ctx.stroke(line.shape);
      ctx.fillStyle = line.fill;
      ctx.fill(line.shape);
      continue;
    }
    if (line.casing) {
      ctx.setLineDash([]);
      ctx.lineWidth = width + 2 * Math.max(line.casing, px(1.2));
      ctx.strokeStyle = line.edge;
      ctx.stroke(line.shape);
    }
    ctx.setLineDash(line.dash ? line.dash.map(length => Math.max(px(length), length)) : []);
    ctx.lineWidth = width;
    ctx.strokeStyle = line.color;
    ctx.stroke(line.shape);
  }
  ctx.restore();
}

// --- The picture ---------------------------------------------------------------------------

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const TINT = {
  meadow: rgb('#d9c48f'),
  dry: rgb('#e3cf9a'),
  high: rgb('#c8b88f'),
  woods: rgb('#93b07a'),
  rock: rgb('#bab4a6'),
  stone: rgb('#cdc3ab'),
  alpine: rgb('#c9c6b6'),
  snow: rgb('#f7f8f3'),
  winter: rgb('#e4edf9'),
  sand: rgb('#e8dcb2'),
  desert: rgb('#eed9a8'),
  paper: rgb(PAPER),
  shallow: rgb('#a4d2de'),
  deep: rgb(WATER),
};
/** The crop fields in their colours, in the frames inCrop() uses. */
const CROPS = [
  { frame: FARM, plot: FARM.wheat, tint: rgb('#e6cd82') },
  ...Object.entries(FIELD_PLOTS).map(([name, plot]) => ({
    frame: FIELDS,
    plot,
    tint: rgb({ plough: '#bc9a74', mow: '#c4d58f', rapeseed: '#ecd962', wheat: '#e6cd82' }[name] ?? '#c9da9c'),
  })),
].map(crop => ({ ...crop, cos: Math.cos(crop.frame.rotation), sin: Math.sin(crop.frame.rotation) }));

function cropAt(x, z) {
  for (const { frame, plot, tint, cos, sin } of CROPS) {
    const dx = x - frame.x;
    const dz = z - frame.z;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (lx > plot.x0 && lx < plot.x1 && lz > plot.z0 && lz < plot.z1) return tint;
  }
  return null;
}

/** Mixes `tint` into the colour `c` by `t`. */
function mix(c, tint, t) {
  if (t <= 0) return;
  c[0] += (tint[0] - c[0]) * t;
  c[1] += (tint[1] - c[1]) * t;
  c[2] += (tint[2] - c[2]) * t;
}

/**
 * The colour of the ground at a point, much as the ground itself is coloured (see groundColor
 * in scenery.js) but paler, like a map: meadows, the woods, bare rock and snow higher up.
 */
function groundTint(x, z, h, slope, c) {
  const r = Math.hypot(x, z);
  c[0] = TINT.meadow[0];
  c[1] = TINT.meadow[1];
  c[2] = TINT.meadow[2];
  mix(c, TINT.dry, clamp(0.2 + 0.12 * Math.sin(x * 0.009 + z * 0.017) + Math.max(0, h - 15) * 0.004, 0, 1));
  if (h > 45) mix(c, TINT.high, Math.min(1, (h - 45) / 80));
  // The woods, with a clean edge where the trees grow thick: the same noise that decides where
  // they grow (buildTrees in scenery.js).
  const woods = smoothstep(fractalNoise(x / 150 + 3.3, z / 150 + 8.1, 2, 5), 0.465, 0.49);
  const rocky = rockiness(x, z);
  // The desert, where the woods give way to sand.
  const sand = desertness(x, z);
  mix(c, TINT.woods, woods * (1 - smoothstep(h, 88, 100)) * (1 - rocky) * (1 - sand) * (1 - smoothstep(slope, 0.8, 1)));
  mix(c, TINT.rock, smoothstep(slope, 0.6, 1.05) * 0.85);
  mix(c, TINT.alpine, smoothstep(h, 86, 108) * 0.75);
  if (h > 90) mix(c, TINT.snow, snowCover(x, z, h) * (1 - smoothstep(slope, 0.85, 1.3)));
  if (rocky > 0) mix(c, TINT.stone, rocky * 0.85);
  if (sand > 0) mix(c, TINT.desert, smoothstep(sand, 0.25, 0.75));
  mix(c, TINT.winter, winterness(x, z) * 0.9);
  if (lakeDistance(x, z) < 2.2) mix(c, TINT.sand, 1 - smoothstep(h, LAKE.level + 0.35, LAKE.level + 1.2));
  const crop = r < 400 ? cropAt(x, z) : null;
  if (crop) mix(c, crop, 0.9);
}

/** Beyond the fence the ground fades into the paper, all the way by the picture's edge. */
const fadeBeyond = (x, z) => smoothstep(Math.hypot(x, z), VALLEY_RADIUS + 2, MAP_EXTENT - 2);

/** World boxes round the still water, the only places worth asking whether a pixel is wet. */
function waterBoxes() {
  const around = (points, margin) => ({
    x0: Math.min(...points.map(p => p.x)) - margin,
    x1: Math.max(...points.map(p => p.x)) + margin,
    z0: Math.min(...points.map(p => p.z)) - margin,
    z1: Math.max(...points.map(p => p.z)) + margin,
  });
  return [
    { x0: LAKE.x - LAKE.rx * 2, x1: LAKE.x + LAKE.rx * 2, z0: LAKE.z - LAKE.rz * 2, z1: LAKE.z + LAKE.rz * 2 },
    around([WATERFALL], WATERFALL.poolRadius + 6),
    around([SPRING], SPRING.radius + 2),
    around(OXBOW.path.samples, 12),
    around(FJORD.path.samples, FJORD.halfWidth(FJORD.path.length) + 6),
    ...PONDS.map(pond => around([pond], pond.radius + 2)),
  ];
}

const makeCanvas = (width, height = width) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/** The ground's height averaged over a few metres, which rounds off the facets of its triangles along the shore. */
const smoothHeight = (x, z) =>
  (terrainHeight(x, z) * 2 +
    terrainHeight(x - 1.8, z - 1.8) +
    terrainHeight(x + 1.8, z - 1.8) +
    terrainHeight(x - 1.8, z + 1.8) +
    terrainHeight(x + 1.8, z + 1.8)) /
  6;

/** Paints the still water in one world box onto the picture, pixel by pixel, deeper water darker. */
function* paintWater(ctx, box) {
  const i0 = clamp(Math.floor((box.x0 + MAP_EXTENT) * MAP_SCALE), 0, SIZE);
  const i1 = clamp(Math.ceil((box.x1 + MAP_EXTENT) * MAP_SCALE), 0, SIZE);
  const j0 = clamp(Math.floor((box.z0 + MAP_EXTENT) * MAP_SCALE), 0, SIZE);
  const j1 = clamp(Math.ceil((box.z1 + MAP_EXTENT) * MAP_SCALE), 0, SIZE);
  if (i1 <= i0 || j1 <= j0) return;
  const image = new ImageData(i1 - i0, j1 - j0);
  const c = [0, 0, 0];
  // A couple of thousand pixels at a time.
  const rows = Math.max(1, Math.floor(2000 / (i1 - i0)));
  for (let j = j0; j < j1; j++) {
    if ((j - j0) % rows === rows - 1) yield;
    const z = (j + 0.5) / MAP_SCALE - MAP_EXTENT;
    for (let i = i0; i < i1; i++) {
      const x = (i + 0.5) / MAP_SCALE - MAP_EXTENT;
      const level = waterLevel(x, z);
      if (level === -Infinity) continue;
      const depth = level - smoothHeight(x, z);
      if (!(depth > 0)) continue;
      c[0] = TINT.shallow[0];
      c[1] = TINT.shallow[1];
      c[2] = TINT.shallow[2];
      mix(c, TINT.deep, smoothstep(depth, 0.3, 3));
      mix(c, TINT.paper, fadeBeyond(x, z));
      const k = ((j - j0) * (i1 - i0) + (i - i0)) * 4;
      image.data[k] = c[0];
      image.data[k + 1] = c[1];
      image.data[k + 2] = c[2];
      image.data[k + 3] = 255 * smoothstep(depth, 0, 0.3);
    }
  }
  const tile = makeCanvas(i1 - i0, j1 - j0);
  tile.getContext('2d').putImageData(image, 0, 0);
  ctx.drawImage(tile, i0, j0);
}

/**
 * Paints the picture, yielding every so often so the work can be spread over frames: the
 * ground shaded by the lie of the land as if lit from the north-west, the still water, then
 * the lines. Returns the finished canvas.
 */
function* paintPicture() {
  const cell = (2 * MAP_EXTENT) / HALF;
  const at = i => -MAP_EXTENT + (i + 0.5) * cell;
  const heights = new Float32Array(HALF * HALF);
  for (let j = 0; j < HALF; j++) {
    const z = at(j);
    for (let i = 0; i < HALF; i++) heights[j * HALF + i] = terrainHeight(at(i), z);
    if (j % 32 === 31) yield;
  }
  const ground = new ImageData(HALF, HALF);
  const c = [0, 0, 0];
  // Slopes are taken across a few cells, which smooths over the facets of the ground, and
  // exaggerated a little so the gentle valley floor still shows its shape.
  const relief = 1.5;
  const reach = 2;
  const [lx, ly, lz] = [-0.5, Math.SQRT1_2, -0.5];
  for (let j = 0; j < HALF; j++) {
    const z = at(j);
    const up = Math.max(j - reach, 0) * HALF;
    const down = Math.min(j + reach, HALF - 1) * HALF;
    for (let i = 0; i < HALF; i++) {
      const x = at(i);
      const k = j * HALF + i;
      const h = heights[k];
      const left = heights[j * HALF + Math.max(i - reach, 0)];
      const sx = (heights[j * HALF + Math.min(i + reach, HALF - 1)] - left) / (2 * reach * cell);
      const sz = (heights[down + i] - heights[up + i]) / (2 * reach * cell);
      const fade = fadeBeyond(x, z);
      if (fade < 1) groundTint(x, z, h, Math.hypot(sx, sz), c);
      // Lit from the north-west: 1 on flat ground, darker on slopes facing away.
      const nx = -sx * relief;
      const nz = -sz * relief;
      const light = (nx * lx + ly + nz * lz) / Math.hypot(nx, 1, nz) / ly;
      const shade = clamp(1 + (light - 1) * 0.5, 0.7, 1.12);
      const o = k * 4;
      for (let n = 0; n < 3; n++) ground.data[o + n] = lerp(c[n] * shade, TINT.paper[n], fade);
      ground.data[o + 3] = 255;
    }
    if (j % 8 === 7) yield;
  }
  const small = makeCanvas(HALF);
  small.getContext('2d').putImageData(ground, 0, 0);
  yield;
  const picture = makeCanvas(SIZE);
  const ctx = picture.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, SIZE, SIZE);
  yield;
  for (const box of waterBoxes()) {
    yield* paintWater(ctx, box);
    yield;
  }
  ctx.setTransform(MAP_SCALE, 0, 0, MAP_SCALE, SIZE / 2, SIZE / 2);
  drawMapLines(ctx, MAP_SCALE);
  return picture;
}

/**
 * The map's picture, `SIZE` pixels square, covering MAP_EXTENT metres each way from the middle.
 * `canvas` is null until it is painted. `prepare(ms)` paints it over the next frames, about `ms`
 * of each (the latest asked for), and resolves with the canvas.
 */
export function createMapPicture() {
  let canvas = null;
  let painting = null;
  let waiting = null;
  let budget = 0;

  function step(ms) {
    if (canvas) return true;
    painting ??= paintPicture();
    const until = performance.now() + ms;
    do {
      const { done, value } = painting.next();
      if (done) {
        canvas = value;
        painting = null;
        return true;
      }
    } while (performance.now() < until);
    return false;
  }

  return {
    get canvas() {
      return canvas;
    },
    prepare(ms = 6) {
      budget = ms;
      waiting ??= new Promise(resolve => {
        const next = () => (step(budget) ? resolve(canvas) : requestAnimationFrame(next));
        requestAnimationFrame(next);
      });
      return waiting;
    },
  };
}
