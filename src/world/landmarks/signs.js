// Wooden trail signs with painted lettering, and a map board at the trailhead.
import * as THREE from 'three';
import {
  ROAD,
  ROAD_HALF_WIDTH,
  CAMP_TRAIL,
  TRACKS,
  BRIDGE,
  WATERFALL,
  LOOKOUT,
  LAKE,
  CREEK,
  BROOK,
  SPRING,
  CAMP,
  FARM,
  TOWER,
  WINDMILL,
  JETTY,
  CHATA,
  TUNNEL,
  SPAWN,
  PLACES,
  RAILWAY,
  ROADWORKS,
  SUMMIT,
  FARMSTEAD,
  LINKS,
  AIRFIELD,
  RING_ROAD,
} from '../layout.js';
import { terrainHeight } from '../terrain.js';
import { PartsBuilder } from '../build.js';

const FONT = '"Manrope", "DM Sans", system-ui, sans-serif';
const WOOD = '#7a5436';
const PAINT = '#f1e3c0';
const painters = [];

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const redraw = () => {
    paint(canvas.getContext('2d'), width, height);
    texture.needsUpdate = true;
  };
  redraw();
  painters.push(redraw);
  return texture;
}

// Draw once with a fallback font, then again when the web font is ready.
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts
    .load(`800 64px ${FONT}`)
    .then(() => painters.forEach(redraw => redraw()))
    .catch(() => {});
}

function drawArrow(ctx, x, y, size, direction) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate({ right: 0, left: Math.PI, up: -Math.PI / 2 }[direction]);
  ctx.beginPath();
  ctx.moveTo(-size * 0.55, -size * 0.12);
  ctx.lineTo(size * 0.1, -size * 0.12);
  ctx.lineTo(size * 0.1, -size * 0.4);
  ctx.lineTo(size * 0.6, 0);
  ctx.lineTo(size * 0.1, size * 0.4);
  ctx.lineTo(size * 0.1, size * 0.12);
  ctx.lineTo(-size * 0.55, size * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintBoard(text, arrow) {
  return (ctx, w, h) => {
    ctx.fillStyle = WOOD;
    ctx.fillRect(0, 0, w, h);
    // Wood grain and a painted border.
    ctx.strokeStyle = 'rgba(40, 25, 15, 0.18)';
    ctx.lineWidth = 3;
    for (let y = 18; y < h; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(y) * 4);
      ctx.bezierCurveTo(w * 0.3, y - 6, w * 0.6, y + 8, w, y + Math.cos(y) * 4);
      ctx.stroke();
    }
    ctx.strokeStyle = PAINT;
    ctx.lineWidth = 7;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.fillStyle = PAINT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    let size = 92;
    ctx.font = `800 ${size}px ${FONT}`;
    const room = w - (arrow ? 250 : 110);
    while (ctx.measureText(text).width > room && size > 40) ctx.font = `800 ${(size -= 4)}px ${FONT}`;
    const textX = arrow === 'left' ? w / 2 + 60 : arrow ? w / 2 - 60 : w / 2;
    ctx.fillText(text, textX, h / 2 + 4);
    if (arrow) drawArrow(ctx, arrow === 'left' ? 110 : w - 110, h / 2, Math.min(170, h * 0.8), arrow);
  };
}

/** A painted metal plate: dark lettering on white, with a thin border. */
function paintPlate(text, ink = '#2f3d55') {
  return (ctx, w, h) => {
    ctx.fillStyle = '#f4f2ea';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = ink;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    let size = 96;
    ctx.font = `800 ${size}px ${FONT}`;
    while (ctx.measureText(text).width > w - 90 && size > 40) ctx.font = `800 ${(size -= 4)}px ${FONT}`;
    ctx.fillText(text, w / 2, h / 2 + 4);
  };
}

/** A blue road sign with a white plane on it, for the way to the airfield. No words needed. */
function paintAirfieldSign(arrow) {
  return (ctx, w, h) => {
    ctx.fillStyle = '#f4f2ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2d5fa8';
    ctx.beginPath();
    ctx.roundRect(14, 14, w - 28, h - 28, 26);
    ctx.fill();
    ctx.fillStyle = '#f4f2ea';
    // The plane, seen from above, nose up.
    ctx.save();
    ctx.translate(w / 2, h * 0.36);
    const u = w / 300;
    ctx.scale(u, u);
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, -12);
    ctx.lineTo(-100, 18);
    ctx.lineTo(-100, 34);
    ctx.lineTo(-10, 18);
    ctx.lineTo(10, 18);
    ctx.lineTo(100, 34);
    ctx.lineTo(100, 18);
    ctx.lineTo(10, -12);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-8, 50);
    ctx.lineTo(-38, 68);
    ctx.lineTo(-38, 78);
    ctx.lineTo(38, 78);
    ctx.lineTo(38, 68);
    ctx.lineTo(8, 50);
    ctx.fill();
    ctx.restore();
    if (arrow) drawArrow(ctx, w / 2, h * 0.79, w * 0.42, arrow);
  };
}

/** Which way an arrow should point for someone reading the sign from the front or back. */
function arrowFor(from, yaw, to, back) {
  const vx = to.x - from.x;
  const vz = to.z - from.z;
  const sign = back ? -1 : 1;
  const right = sign * (vx * Math.cos(yaw) - vz * Math.sin(yaw));
  const ahead = -sign * (vx * Math.sin(yaw) + vz * Math.cos(yaw));
  if (ahead > Math.abs(right) * 1.2) return 'up';
  return right > 0 ? 'right' : 'left';
}

/**
 * A board between two posts, which stand clear of its ends so they hide none of it. `yaw`
 * points the front face; the back carries the same text with the arrow mirrored so it
 * still points the right way.
 */
function addSign(scene, parts, { x, z, yaw, text, destination, width = 3.6, height = 0.95, postHeight = 2.1 }) {
  const y = terrainHeight(x, z);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  for (const side of [-1, 1]) {
    const px = x + cos * side * (width / 2 + 0.1);
    const pz = z - sin * side * (width / 2 + 0.1);
    const top = postHeight + 0.12;
    parts.box(0.2, top + 0.8, 0.2, '#6a4a31', { x: px, y: y + (top - 0.8) / 2, z: pz, ry: yaw });
    parts.box(0.26, 0.06, 0.26, '#5a3e29', { x: px, y: y + top + 0.03, z: pz, ry: yaw }); // cap
  }
  parts.box(width, height, 0.12, WOOD, { x, y: y + postHeight - height / 2, z, ry: yaw });
  for (const back of [false, true]) {
    const arrow = destination ? arrowFor({ x, z }, yaw, destination, back) : null;
    const material = new THREE.MeshLambertMaterial({
      map: canvasTexture(1024, Math.round((1024 * height) / width), paintBoard(text, arrow)),
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.04, height - 0.04), material);
    const push = back ? -0.065 : 0.065;
    face.position.set(x + sin * push, y + postHeight - height / 2, z + cos * push);
    face.rotation.y = yaw + (back ? Math.PI : 0);
    scene.add(face);
  }
}

/** A square sign on a pole showing the way to the airfield, readable from both sides. */
function airfieldSign(scene, parts, { x, z, yaw }) {
  const y = terrainHeight(x, z);
  const size = 1.3;
  // The pole stops at the bottom edge of the sign, so it covers none of the picture.
  parts.box(0.12, 1.6, 0.12, '#8e938d', { x, y: y + 0.8, z, ry: yaw });
  parts.box(size, size, 0.06, '#d9d6cc', { x, y: y + 2.2, z, ry: yaw });
  const destination = { x: AIRFIELD.x, z: (AIRFIELD.z0 + AIRFIELD.z1) / 2 };
  for (const back of [false, true]) {
    const arrow = arrowFor({ x, z }, yaw, destination, back);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(size - 0.04, size - 0.04),
      new THREE.MeshLambertMaterial({ map: canvasTexture(256, 256, paintAirfieldSign(arrow)) }),
    );
    const push = back ? -0.035 : 0.035;
    face.position.set(x + Math.sin(yaw) * push, y + 2.2, z + Math.cos(yaw) * push);
    face.rotation.y = yaw + (back ? Math.PI : 0);
    scene.add(face);
  }
}

/** A sign by the trail at distance `s`, facing traffic driving in the trail's direction. */
function trailSign(scene, parts, s, side, text, destination) {
  const p = ROAD.offset(s, side * (ROAD_HALF_WIDTH + 2.6));
  const yaw = Math.atan2(-p.dx, -p.dz) + side * 0.35;
  addSign(scene, parts, { x: p.x, z: p.z, yaw, text, destination });
}

function paintMap(ctx, w, h) {
  const scale = 1.25;
  const cx = w / 2 + 10;
  const cy = h / 2 + 18;
  const px = x => cx + x * scale;
  const pz = z => cy + z * scale;
  ctx.fillStyle = '#efe4c6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 18;
  ctx.strokeRect(0, 0, w, h);
  ctx.fillStyle = '#cfd6b0';
  ctx.beginPath();
  ctx.ellipse(px(0), pz(0), 330 * scale, 245 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8fbcbf';
  ctx.beginPath();
  // The shore sits about a third further out than the lake's core ellipse.
  ctx.ellipse(px(LAKE.x), pz(LAKE.z), LAKE.rx * 1.3 * scale, LAKE.rz * 1.3 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8fbcbf';
  ctx.lineWidth = 5;
  ctx.beginPath();
  CREEK.samples.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
  BROOK.samples.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
  ctx.stroke();
  const trail = (path, width, dash = [14, 9]) => {
    ctx.strokeStyle = '#8a6440';
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    path.samples.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
    if (path.closed) ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  };
  // The railway: a dark line with cross ties.
  ctx.strokeStyle = '#4c4f4a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  RAILWAY.samples.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let s = 0; s < RAILWAY.length; s += 6) {
    const p = RAILWAY.at(s);
    ctx.beginPath();
    ctx.moveTo(px(p.x - p.dz * 4), pz(p.z + p.dx * 4));
    ctx.lineTo(px(p.x + p.dz * 4), pz(p.z - p.dx * 4));
    ctx.stroke();
  }
  // The paved roads out to the ring, as solid grey lines running off the edge.
  ctx.strokeStyle = '#7d7f79';
  ctx.lineWidth = 7;
  for (const { path } of LINKS) {
    ctx.beginPath();
    path.samples.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
    ctx.stroke();
  }
  trail(ROAD, 6);
  trail(CAMP_TRAIL, 4);
  for (const track of TRACKS) trail(track.path, 3, [5, 7]);
  ctx.fillStyle = '#7d8e86';
  ctx.beginPath();
  ctx.moveTo(px(TUNNEL.x - 22), pz(TUNNEL.z + 16));
  ctx.lineTo(px(TUNNEL.x), pz(TUNNEL.z - 26));
  ctx.lineTo(px(TUNNEL.x + 22), pz(TUNNEL.z + 16));
  ctx.fill();
  const labels = {
    waterfall: 'Whispering Falls',
    bridge: 'Bridge',
    tunnel: 'Echo Mountain',
    campsite: 'Camp',
    lookout: 'Lookout',
    farm: 'Farm',
    tower: 'Fire Tower',
    windmill: 'Windmill',
    jetty: 'Jetty',
    chata: 'Masarykova chata',
    bunker: 'Bunkers',
    halt: 'Railway halt',
    roadworks: 'Roadworks',
    helipad: 'Helipad',
    chapel: 'Chapel',
    summit: 'Velká Deštná',
    fields: 'Upland farm',
    airfield: 'Airfield',
    rockhill: 'Rocky hill',
  };
  /** Draws text in the current font and alignment, and returns the box it fills. */
  const write = (text, x, y, size) => {
    ctx.fillText(text, x, y);
    const width = ctx.measureText(text).width;
    const x0 = ctx.textAlign === 'left' ? x : ctx.textAlign === 'right' ? x - width : x - width / 2;
    return { x0, x1: x0 + width, y0: y - size * 0.8, y1: y + size * 0.25 };
  };
  const dot = (x, y, r) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    return { x0: x - r, x1: x + r, y0: y - r, y1: y + r };
  };
  ctx.fillStyle = '#3f4f45';
  ctx.font = `800 40px ${FONT}`;
  ctx.textAlign = 'left';
  // Everything written on the map so far, so the labels at its edge can keep clear of it.
  const taken = [write('VALLEY TRAIL', 40, 62, 40)];
  ctx.font = `700 26px ${FONT}`;
  ctx.textAlign = 'center';
  // Labels sit above their dot, except where that would crowd a neighbour.
  const below = ['bridge', 'jetty', 'lookout', 'bunker', 'helipad'];
  const margin = 46;
  const clampX = x => Math.min(w - margin, Math.max(margin, x));
  const clampY = y => Math.min(h - margin, Math.max(34, y));
  const beyond = [];
  for (const place of PLACES) {
    const [x, y] = [px(place.x), pz(place.z)];
    if (clampX(x) !== x || clampY(y) !== y) beyond.push(place);
    else taken.push(dot(x, y, 7), write(labels[place.id], x, y + (below.includes(place.id) ? 32 : -16), 26));
  }
  ctx.fillStyle = '#c75b32';
  taken.push(dot(px(SPAWN.x), pz(SPAWN.z), 11), write('You are here', px(SPAWN.x), pz(SPAWN.z) + 38, 26));
  ctx.fillStyle = '#3f4f45';

  // Places beyond the valley are off the edge of the map: an arrow at the edge points the way,
  // moved along the edge as far as it takes to keep its label clear of everything else.
  const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  for (const place of beyond) {
    const [x, y] = [px(place.x), pz(place.z)];
    // It slides along the edge it lies furthest beyond, and from a corner down the other edge too.
    const pastX = Math.max(margin - x, x - (w - margin));
    const pastY = Math.max(34 - y, y - (h - margin));
    const steps = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6];
    const slides = [
      ...steps.map(step => (pastY >= pastX ? [step, 0] : [0, step])),
      ...(pastX > 0 && pastY > 0 ? steps.map(step => (pastY >= pastX ? [0, step] : [step, 0])) : []),
    ];
    const spots = slides.map(([sx, sy]) => {
      const ex = clampX(clampX(x) + sx * 30);
      const ey = clampY(clampY(y) + sy * 30);
      const right = ex > w / 2;
      const width = ctx.measureText(labels[place.id]).width;
      const [x0, x1] = right ? [ex - 26 - width, ex + 18] : [ex - 18, ex + 26 + width];
      return { ex, ey, right, box: { x0, x1, y0: ey - 18, y1: ey + 18 } };
    });
    const { ex, ey, right, box } = spots.find(spot => !taken.some(t => overlaps(t, spot.box))) ?? spots[0];
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(Math.atan2(y - ey, x - ex));
    // A shaft and a head, so the way it points is plain even on a slant.
    ctx.fillRect(-16, -3.5, 18, 7);
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(0, -11);
    ctx.lineTo(0, 11);
    ctx.fill();
    ctx.restore();
    ctx.textAlign = right ? 'right' : 'left';
    ctx.fillText(labels[place.id], ex + (right ? -26 : 26), ey + 9);
    taken.push(box);
  }
}

function addMapBoard(scene, parts) {
  const s = ROAD.nearest(SPAWN.x, SPAWN.z).s - 9;
  const p = ROAD.offset(s, ROAD_HALF_WIDTH + 3.2);
  const yaw = Math.atan2(-p.dx, -p.dz) + 0.9;
  const y = terrainHeight(p.x, p.z);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const width = 3.4;
  const height = 2.3;
  for (const side of [-1, 1]) {
    const px = p.x + cos * side * (width / 2 + 0.1);
    const pz = p.z - sin * side * (width / 2 + 0.1);
    parts.box(0.24, 3.9, 0.24, '#6a4a31', { x: px, y: y + 1.45, z: pz, ry: yaw });
  }
  parts.box(width + 0.4, height + 0.3, 0.16, WOOD, { x: p.x, y: y + 2, z: p.z, ry: yaw });
  for (const side of [-1, 1]) {
    parts.box(width + 1, 0.08, 0.95, '#5d6e5f', {
      x: p.x + sin * side * 0.4,
      y: y + 3.45,
      z: p.z + cos * side * 0.4,
      ry: yaw,
      rx: side * 0.5,
    });
  }
  const map = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshLambertMaterial({ map: canvasTexture(1024, 692, paintMap) }),
  );
  map.position.set(p.x + sin * 0.09, y + 2, p.z + cos * 0.09);
  map.rotation.y = yaw;
  scene.add(map);
}

export function buildSigns(scene, { tunnelPortal, hutBoard }) {
  const parts = new PartsBuilder();
  const junction = ROAD.nearest(CAMP_TRAIL.samples[0].x, CAMP_TRAIL.samples[0].z).s;
  trailSign(scene, parts, junction - 10, -1, 'CAMPSITE', CAMP);
  trailSign(scene, parts, BRIDGE.s - 16, 1, 'WHISPERING FALLS', WATERFALL);
  const lookout = ROAD.nearest(LOOKOUT.x, LOOKOUT.z).s;
  trailSign(scene, parts, lookout - 12, -1, 'LOOKOUT', LOOKOUT);
  // Signs where the side tracks leave the trail.
  const destinations = {
    farm: ['FARM', FARM],
    tower: ['FIRE TOWER', TOWER],
    windmill: ['WINDMILL', WINDMILL],
    shore: ['JETTY', JETTY],
    chata: ['MASARYKOVA CHATA', CHATA],
    roadworks: ['ROADWORKS', ROADWORKS.site],
    summit: ['VELKÁ DEŠTNÁ', SUMMIT],
    fields: ['UPLAND FARM', FARMSTEAD],
    spring: ['SPRING', SPRING],
  };
  // Tracks out in the outlands leave the gravel road rather than the trail, and have no sign.
  for (const track of TRACKS.filter(track => track.id in destinations)) {
    const [text, destination] = destinations[track.id];
    const fromStart = track.id !== 'shore'; // the shore path ends at the trail rather than starting there
    const inward = track.path.at(fromStart ? 14 : track.path.length - 14);
    const { s, side } = ROAD.nearest(inward.x, inward.z);
    trailSign(scene, parts, s - 12, Math.sign(side) || 1, text, destination);
  }
  addMapBoard(scene, parts);

  // Plane signs where the east road leaves the trail, and on the ring either side of the airfield road.
  const east = LINKS.find(link => link.id === 'east').path;
  const start = ROAD.nearest(east.at(14).x, east.at(14).z);
  const side = Math.sign(start.side) || 1;
  const before = ROAD.offset(start.s - 16, side * (ROAD_HALF_WIDTH + 2.4));
  airfieldSign(scene, parts, { ...before, yaw: Math.atan2(-before.dx, -before.dz) + side * 0.35 });
  const join = LINKS.find(link => link.id === 'airfield').path.at(0);
  const at = RING_ROAD.nearest(join.x, join.z).s;
  for (const along of [-18, 18]) {
    const p = RING_ROAD.offset(at + along, ROAD_HALF_WIDTH + 2.4);
    airfieldSign(scene, parts, { ...p, yaw: Math.atan2(-p.dx, -p.dz) });
  }

  // A board on the summit, facing the end of the track.
  const summitTrack = TRACKS.find(track => track.id === 'summit').path;
  const arrival = summitTrack.at(summitTrack.length);
  const toTrack = Math.atan2(arrival.x - SUMMIT.x, arrival.z - SUMMIT.z);
  addSign(scene, parts, {
    x: SUMMIT.x + Math.sin(toTrack + 0.6) * 7,
    z: SUMMIT.z + Math.cos(toTrack + 0.6) * 7,
    yaw: toTrack,
    text: 'VELKÁ DEŠTNÁ 1115 m',
  });

  // A name board over the tunnel entrance.
  const { x, y, z, yaw } = tunnelPortal;
  const facing = yaw + Math.PI;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.3),
    new THREE.MeshLambertMaterial({ map: canvasTexture(1024, 208, paintBoard('ECHO MOUNTAIN', null)) }),
  );
  board.position.set(x - Math.sin(yaw) * 0.6, y, z - Math.cos(yaw) * 0.6);
  board.rotation.y = facing;
  scene.add(board);

  // The hut's name, on a white plate on the top floor.
  const name = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 1),
    new THREE.MeshLambertMaterial({ map: canvasTexture(1024, 256, paintPlate('MASARYKOVA CHATA')) }),
  );
  name.position.set(hutBoard.x, hutBoard.y, hutBoard.z);
  name.rotation.y = hutBoard.yaw;
  scene.add(name);

  scene.add(parts.mesh());
}
