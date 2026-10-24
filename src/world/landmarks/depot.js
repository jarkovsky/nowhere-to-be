// The depot by the trail: a long, low garage with four open doors, a concrete yard in
// front with painted bays, and a picture of a lorry over the doors. The friends who can
// come along wait in the bays (see vehicles/friends.js); the lorry's trailer stands back
// inside the doors. A lamp over each door comes on at dusk.
import * as THREE from 'three';
import { DEPOT, FORECOURTS } from '../layout.js';
import { PartsBuilder, gableEnds, gableRoof } from '../build.js';
import { canvasTexture } from './signs.js';
import { framer } from './frame.js';

const WALL = '#efe3c4';
const BAND = '#3f78a8';
const ROOF = '#5d7f97';
const DOOR = '#d9a441';
const TRIM = '#f6f1e4';
const INSIDE = '#47443e';
const CONCRETE = '#b9b6ab';

const WIDTH = 23;
const DEPTH = 12;
const EAVE = 5.4;
const RIDGE = 7.6;
const DOOR_WIDTH = 4.3;
const DOOR_HEIGHT = 4.7;
/** How far the doors are swung open, past square to the wall. */
const OPEN = 1.75;

/** A lorry with a trailer, two little cars and the name, for the board over the doors. */
function paintBoard(ctx, w, h) {
  ctx.fillStyle = TRIM;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = BAND;
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  const car = (x, y, scale, color) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-60, -34, 120, 40, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-34, -64, 66, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#2f3430';
    for (const wx of [-34, 34]) {
      ctx.beginPath();
      ctx.arc(wx, 8, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  car(140, 170, 0.95, '#d16b38');
  car(w - 140, 170, 0.95, '#72947d');
  ctx.fillStyle = '#2f3d55';
  ctx.font = '800 108px "Manrope", "DM Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DEPOT', w / 2, h / 2 + 6);
}

export function buildDepot(scene, obstacles) {
  const parts = new PartsBuilder();
  const frame = framer(DEPOT);
  const { at, local, rotation } = frame;

  // The walls, with an opening for each door along the front.
  parts.box(WIDTH + 0.4, 0.3, DEPTH + 0.4, '#a9a597', at(0, -0.07, -DEPTH / 2));
  parts.box(WIDTH, EAVE, 0.3, WALL, at(0, EAVE / 2, -DEPTH + 0.15));
  for (const side of [-1, 1]) parts.box(0.3, EAVE, DEPTH, WALL, at(side * (WIDTH / 2 - 0.15), EAVE / 2, -DEPTH / 2));
  const edges = [-WIDTH / 2, ...DEPOT.bays.flatMap(x => [x - DOOR_WIDTH / 2, x + DOOR_WIDTH / 2]), WIDTH / 2];
  for (let i = 0; i < edges.length; i += 2) {
    const [x0, x1] = [edges[i], edges[i + 1]];
    parts.box(x1 - x0, DOOR_HEIGHT, 0.3, WALL, at((x0 + x1) / 2, DOOR_HEIGHT / 2, -0.15));
  }
  parts.box(WIDTH, EAVE - DOOR_HEIGHT, 0.3, WALL, at(0, (EAVE + DOOR_HEIGHT) / 2, -0.15));
  parts.box(WIDTH + 0.04, 0.32, DEPTH + 0.04, BAND, at(0, EAVE - 0.2, -DEPTH / 2)); // a band under the eaves
  parts.add(gableEnds(DEPTH, WIDTH, EAVE, RIDGE), WALL, at(0, 0, -DEPTH / 2, { ry: rotation + Math.PI / 2 }));
  parts.add(gableRoof(DEPTH, WIDTH, EAVE, RIDGE, 0.6), ROOF, at(0, 0, -DEPTH / 2, { ry: rotation + Math.PI / 2 }));

  // Inside, in shadow: a floor, a ceiling, and a wall between each bay and the next.
  parts.box(WIDTH - 0.6, 0.06, DEPTH - 0.6, INSIDE, at(0, 0.06, -DEPTH / 2));
  parts.box(WIDTH - 0.6, 0.1, DEPTH - 0.6, INSIDE, at(0, EAVE - 0.1, -DEPTH / 2));
  parts.box(WIDTH - 0.6, EAVE - 0.2, 0.06, INSIDE, at(0, EAVE / 2, -DEPTH + 0.34));
  for (const side of [-1, 1])
    parts.box(0.06, EAVE - 0.2, DEPTH - 0.6, INSIDE, at(side * (WIDTH / 2 - 0.34), EAVE / 2, -DEPTH / 2));
  for (let i = 1; i < DEPOT.bays.length; i++) {
    const x = (DEPOT.bays[i - 1] + DEPOT.bays[i]) / 2;
    parts.box(0.2, EAVE - 0.2, DEPTH - 1, INSIDE, at(x, EAVE / 2, -DEPTH / 2 - 0.3));
  }

  // The doors, two to each opening, swung right open and standing out from the wall.
  const leaf = DOOR_WIDTH / 2;
  for (const bay of DEPOT.bays) {
    for (const side of [-1, 1]) {
      const hinge = bay + side * leaf;
      // Each leaf turns out about its hinge, away from the middle of the opening.
      const turn = side < 0 ? -OPEN : Math.PI + OPEN;
      const dx = Math.cos(turn);
      const dz = -Math.sin(turn);
      const mid = (along, ly, extra) => at(hinge + dx * along, ly, 0.1 + dz * along, { ry: rotation + turn, ...extra });
      parts.box(leaf, DOOR_HEIGHT - 0.1, 0.12, DOOR, mid(leaf / 2, DOOR_HEIGHT / 2));
      for (const y of [0.8, DOOR_HEIGHT - 0.8]) parts.box(leaf - 0.1, 0.18, 0.16, TRIM, mid(leaf / 2, y));
      const brace = Math.atan2(DOOR_HEIGHT - 1.6, leaf - 0.2);
      parts.box(
        Math.hypot(DOOR_HEIGHT - 1.6, leaf - 0.2),
        0.16,
        0.15,
        TRIM,
        mid(leaf / 2, DOOR_HEIGHT / 2, { rz: -side * brace }),
      );
      const a = local(hinge, 0.1);
      const b = local(hinge + dx * leaf, 0.1 + dz * leaf);
      obstacles.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, radius: 0.25 });
    }
  }

  // The yard: concrete in front of the doors, with white lines between the bays.
  const yard = FORECOURTS.find(court => court.id === 'depot');
  parts.box(
    yard.x1 - yard.x0,
    0.12,
    yard.z1 - yard.z0,
    CONCRETE,
    at((yard.x0 + yard.x1) / 2, -0.03, (yard.z0 + yard.z1) / 2),
  );
  for (let i = 0; i <= DEPOT.bays.length; i++) {
    const x =
      i === 0
        ? DEPOT.bays[0] - 2.75
        : i === DEPOT.bays.length
          ? DEPOT.bays.at(-1) + 2.75
          : (DEPOT.bays[i - 1] + DEPOT.bays[i]) / 2;
    parts.box(0.14, 0.02, 5.6, TRIM, at(x, 0.04, 3.1));
  }

  // A stack of tyres by one end, and an oil drum by the other.
  for (let k = 0; k < 4; k++) {
    parts.add(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 12), '#303a35', at(WIDTH / 2 + 1.1, 0.25 + k * 0.31, -1));
  }
  parts.add(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), '#b5402f', at(-WIDTH / 2 - 0.9, 0.6, -1.2));
  for (const lx of [WIDTH / 2 + 1.1, -WIDTH / 2 - 0.9]) obstacles.push({ ...local(lx, -1.1), radius: 0.7 });

  // The building itself, as one capsule along its length.
  const ends = [local(-WIDTH / 2 + DEPTH / 2, -DEPTH / 2), local(WIDTH / 2 - DEPTH / 2, -DEPTH / 2)];
  obstacles.push({ ax: ends[0].x, az: ends[0].z, bx: ends[1].x, bz: ends[1].z, radius: DEPTH / 2 + 0.2 });

  // The board stands on the roof above the doors, and a lamp hangs over each door.
  for (const x of [-2.6, 2.6]) parts.box(0.14, 1.2, 0.14, '#5b4636', at(x, 6.2, -0.78));
  parts.box(6.6, 1.8, 0.1, BAND, at(0, 6.75, -0.76));
  scene.add(parts.mesh());
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.6),
    new THREE.MeshLambertMaterial({ map: canvasTexture(1024, 256, paintBoard) }),
  );
  const boardAt = at(0, 6.75, -0.7);
  board.position.set(boardAt.x, boardAt.y, boardAt.z);
  board.rotation.y = rotation;
  scene.add(board);
  const lamp = new THREE.MeshLambertMaterial({ color: '#fff3ce', emissive: '#ffd88e', emissiveIntensity: 0 });
  const lamps = new PartsBuilder();
  for (const x of DEPOT.bays) lamps.box(0.7, 0.18, 0.4, '#ffffff', at(x, DOOR_HEIGHT + 0.12, 0.2));
  scene.add(lamps.mesh({ material: lamp, castShadow: false }));

  // The camera pulls in rather than end up inside the building.
  const shell = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, RIDGE, DEPTH));
  const middle = at(0, RIDGE / 2, -DEPTH / 2);
  shell.position.set(middle.x, middle.y, middle.z);
  shell.rotation.y = rotation;
  shell.updateMatrixWorld();

  return {
    occluders: [shell],
    update(night) {
      lamp.emissiveIntensity = night * 1.6;
    },
  };
}
