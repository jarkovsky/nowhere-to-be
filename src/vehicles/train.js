// The local train: two railbuses coupled together, in the yellow, white and
// blue of the Czech class 810. It waits at the halt, runs up the line into the
// tunnel, waits out of sight and comes back. It stops short of anything on the
// track, answers the horn, and closes the level crossing while it is near.
import * as THREE from 'three';
import { RAILWAY, LEVEL_CROSSING } from '../world/layout.js';
import { railLevel } from '../world/terrain.js';
import { RAIL_TOP } from '../world/landmarks/railway.js';
import { PartsBuilder } from '../world/build.js';

const CAR_LENGTH = 13.4;
const COUPLING = 0.8;
const CARS = 2;
export const TRAIN_LENGTH = CARS * CAR_LENGTH + (CARS - 1) * COUPLING;
const AXLES = 4.4; // from the middle of a car to each axle
const CRUISE = 9;
const ACCELERATION = 0.9;
const BRAKING = 1.1;
/** Where the halt end of the train stops, just short of the buffer stop. */
const AT_HALT = 1.5;
/** Far enough into the tunnel to be out of sight. */
const AWAY = RAILWAY.length + 6;
const WAIT_AT_HALT = 22;
const WAIT_AWAY = 28;
/** How long the crossing warns before the train sets off from the halt. */
const WARNING = 6;

const WHITE = '#e9ebe6';
const BLUE = '#2f5d9e';
const YELLOW = '#e7b92e';
const GLASS = '#3d5560';
const DARK = '#353a37';

/** One railbus, built along local Z with a driving cab at each end. */
function railbus() {
  const parts = new PartsBuilder();
  const half = CAR_LENGTH / 2;
  parts.box(2.3, 0.55, CAR_LENGTH - 2, DARK, { y: 0.8 }); // underframe
  for (const z of [-AXLES, AXLES]) {
    for (const x of [-0.72, 0.72]) {
      parts.add(new THREE.CylinderGeometry(0.45, 0.45, 0.16, 12), '#2a2e2c', { x, y: 0.45, z, rz: Math.PI / 2 });
    }
    parts.box(2.2, 0.35, 1.4, DARK, { y: 0.55, z }); // axle box
  }
  parts.box(2.9, 0.5, CAR_LENGTH, BLUE, { y: 1.3 });
  parts.box(2.9, 2, CAR_LENGTH, WHITE, { y: 2.55 });
  parts.box(2.92, 0.12, CAR_LENGTH - 0.6, BLUE, { y: 1.9 }); // stripe below the windows
  // Side windows in a blue band, with a door near each end.
  parts.box(2.92, 0.95, CAR_LENGTH - 4.6, BLUE, { y: 2.75 });
  for (let z = -half + 2.9; z <= half - 2.8; z += 1.3) parts.box(2.95, 0.68, 0.98, GLASS, { y: 2.78, z });
  for (const end of [-1, 1]) {
    parts.box(2.94, 2, 0.95, BLUE, { y: 2.3, z: end * (half - 1.5) });
    parts.box(2.96, 0.8, 0.3, GLASS, { y: 2.85, z: end * (half - 1.5) });
  }
  parts.box(2.7, 0.3, CAR_LENGTH - 0.2, '#c9ccc6', { y: 3.68 }); // roof
  parts.box(2.86, 0.14, CAR_LENGTH, '#d8dbd5', { y: 3.52 });
  // The cabs: a yellow nose, two big windscreens in a white frame, lamps and buffers.
  for (const end of [-1, 1]) {
    const z = end * (half + 0.03);
    parts.box(2.9, 1.35, 0.08, YELLOW, { y: 1.65, z });
    parts.box(2.9, 0.25, 0.08, BLUE, { y: 0.95, z });
    for (const x of [-0.7, 0.7]) parts.box(1.25, 1, 0.1, GLASS, { x, y: 2.85, z: z + end * 0.01 });
    for (const x of [-1.05, -0.75, 0.75, 1.05]) {
      parts.add(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), '#fff3ce', {
        x,
        y: 1.75,
        z: z + end * 0.04,
        rx: Math.PI / 2,
      });
    }
    parts.add(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10), '#fff3ce', {
      y: 3.6,
      z: z + end * 0.04,
      rx: Math.PI / 2,
    });
    for (const x of [-0.85, 0.85]) {
      parts.add(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 8), DARK, {
        x,
        y: 1.05,
        z: z + end * 0.25,
        rx: Math.PI / 2,
      });
    }
  }
  return parts.mesh();
}

export function createTrain(scene, { onHorn = () => {} } = {}) {
  const cars = Array.from({ length: CARS }, () => {
    const mesh = railbus();
    scene.add(mesh);
    return mesh;
  });

  let phase = 'halt'; // 'halt' | 'out' | 'away' | 'in'
  let timer = 12;
  let head = AT_HALT; // the halt end of the train, in metres along the line
  let speed = 0;
  let hootAt = null;
  const colliders = [];
  const ahead = new THREE.Vector3();

  /** Where along the line the player is, if they are on the track. */
  function playerOnTrack(player) {
    const near = RAILWAY.nearest(player.x, player.z);
    return near.distance < 3.4 ? near.s : null;
  }

  /** Room to stop: up to `limit` metres, less if the player is on the track in front. */
  function roomAhead(player, limit) {
    const s = playerOnTrack(player);
    if (s === null) return limit;
    const gap = phase === 'in' ? head - s : s - (head + TRAIN_LENGTH);
    return gap > -2 && gap < limit + 4 ? Math.max(0, gap - 4) : limit;
  }

  function drive(dt, room) {
    const stopping = Math.sqrt(2 * BRAKING * Math.max(0, room));
    speed = Math.min(speed + ACCELERATION * dt, CRUISE, stopping);
    if (room <= 0.05) speed = 0;
  }

  function place() {
    colliders.length = 0;
    cars.forEach((mesh, k) => {
      const middle = head + k * (CAR_LENGTH + COUPLING) + CAR_LENGTH / 2;
      const a = RAILWAY.at(middle - AXLES);
      const b = RAILWAY.at(middle + AXLES);
      const ya = railLevel(middle - AXLES) + RAIL_TOP;
      const yb = railLevel(middle + AXLES) + RAIL_TOP;
      // Past the portal the line runs on straight into the hill.
      const extend = (p, s) => {
        const over = Math.max(0, s - RAILWAY.length);
        return { x: p.x + p.dx * over, z: p.z + p.dz * over };
      };
      const pa = extend(a, middle - AXLES);
      const pb = extend(b, middle + AXLES);
      ahead.set(pb.x - pa.x, yb - ya, pb.z - pa.z);
      mesh.position.set((pa.x + pb.x) / 2, (ya + yb) / 2, (pa.z + pb.z) / 2);
      mesh.rotation.set(-Math.atan2(ahead.y, Math.hypot(ahead.x, ahead.z)), Math.atan2(ahead.x, ahead.z), 0, 'YXZ');
      mesh.visible = phase !== 'away';
      if (!mesh.visible) return;
      for (let s = middle - CAR_LENGTH / 2 + 1.4; s < middle + CAR_LENGTH / 2; s += 2.1) {
        if (s > RAILWAY.length) break;
        const p = RAILWAY.at(s);
        colliders.push({ x: p.x, z: p.z, radius: 1.55 });
      }
    });
  }
  place();

  return {
    /** Circles the player's car collides with. */
    colliders,
    update(dt, { player }) {
      if (phase === 'halt') {
        timer -= dt;
        if (timer <= 0) {
          phase = 'out';
          hootAt = 0;
        }
      } else if (phase === 'out') {
        drive(dt, roomAhead(player, 200));
        head += speed * dt;
        if (head >= AWAY) {
          phase = 'away';
          timer = WAIT_AWAY;
          speed = 0;
        }
      } else if (phase === 'away') {
        timer -= dt;
        if (timer <= 0) {
          phase = 'in';
          speed = CRUISE * 0.7;
          hootAt = 1.5;
        }
      } else {
        drive(dt, Math.min(head - AT_HALT, roomAhead(player, 200)));
        head -= speed * dt;
        if (head - AT_HALT < 0.05) {
          head = AT_HALT;
          phase = 'halt';
          timer = WAIT_AT_HALT;
          speed = 0;
        }
      }
      if (hootAt !== null && (hootAt -= dt) <= 0) {
        hootAt = null;
        onHorn(this.distanceTo(player));
      }
      place();
    },
    /** True while the crossing should warn: just before setting off, and while the train is near it. */
    crossingClosed() {
      const c = LEVEL_CROSSING.s;
      const tail = head + TRAIN_LENGTH;
      if (phase === 'halt') return timer < WARNING && tail < c;
      // The trail crosses at an angle, so it is wider than it looks along the line.
      if (phase === 'out') return head < c + 8;
      if (phase === 'in') return tail > c - 8 && head < c + 75;
      return false;
    },
    /** Distance from a point to the nearest part of the train, or Infinity while it is in the tunnel. */
    distanceTo(point) {
      if (phase === 'away') return Infinity;
      let best = Infinity;
      for (const c of colliders) best = Math.min(best, Math.hypot(c.x - point.x, c.z - point.z));
      return best;
    },
    /** The driver answers a honk with the train's horn. */
    answerHonk(point) {
      if (this.distanceTo(point) < 60 && hootAt === null) hootAt = 0.5;
    },
    isRunning: () => phase === 'out' || phase === 'in',
    getState: () => ({ phase, head: +head.toFixed(1), speed: +speed.toFixed(1) }),
  };
}
