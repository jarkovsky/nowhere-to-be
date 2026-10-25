// The car ferry at the head of the fjord, and the cars it brings. When it ties up at the quay the
// cars drive off and away up the road, and the ferry waits with its ramp down and an arrow over
// its deck. Drive aboard and stop, and it takes the car out for a short trip round and back. What
// the ferry does is worked out in core/ferry.js; this builds it and the cars, and moves them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  HULL,
  RAMP,
  RAMP_UP,
  allAboard,
  anyOn,
  carry,
  createFerry as createFerryState,
  deckHeight,
  isCarrying,
  onCarDeck,
  quayEnd,
  stepFerry,
  toWorld,
  walls,
} from '../core/ferry.js';
import { createRandom, damp } from '../core/math.js';
import { steer } from '../core/steering.js';
import { chassisPose } from '../core/suspension.js';
import { camperVan, createVehicle, deliveryVan, offRoader, pickup, saloon } from '../vehicles/traffic.js';
import { PartsBuilder } from './build.js';
import { canvasTexture } from './landmarks/signs.js';
import { FERRY_QUAY, FJORD, OUTER_ROAD, TRACKS } from './layout.js';
import { createPath, headingOf } from './path.js';
import { addFloatingDeck, drivingHeight } from './terrain.js';

const WHITE = '#f2efe6';
const HULL_PAINT = '#2b3a46';
const RED = '#b8352a';
const GLASS = '#3f5559';
const DECK = '#767a76';
const STEEL = '#5e676b';
const YELLOW = '#d8b23c';
/** How far from the middle of the outer road the cars that go on along it drive. */
const LANE = 2.3;
/** How far from the middle of the road up from the quay the cars keep, to its right. */
const KEEP_RIGHT = 1.2;
/** How fast the cars drive off the ferry and over the quay, and then up the road. */
const SLOW = 3;
const CRUISE = 6.5;
/** How far along its way a car leaving the ferry is clear of the quay, roughly. */
const CLEAR_OF_QUAY = 34;
/** Further than this from the player, a car that has driven away is gone. */
const GONE = 160;
/** How far round the middles of the circles along a friend's outline the friend reaches, near enough. */
export const OUTLINE = 1.2;

/** The cars that come over on the ferry, a few at a time. */
const PASSENGERS = [
  saloon,
  offRoader('#3f6e9c', 'kayaks'),
  camperVan,
  deliveryVan,
  pickup,
  offRoader('#c9a13e', 'cans'),
];
/** Where the cars stand on the deck, in its own frame from the end at the quay: across, and in from that end. */
const SLOTS = [
  { x: -1.7, in: 3.4 },
  { x: 1.7, in: 3.6 },
  { x: -1.7, in: 10 },
];

/** The ferry: a hull with a ramp at each end, casings along both sides, the wheelhouse on one and the funnel on the other. */
export function ferryModel() {
  const root = new THREE.Group();
  const parts = new PartsBuilder();
  const { halfLength: L, halfBeam: B, lanes, deck } = HULL;
  parts.box(2 * B, 1.45, 2 * L, HULL_PAINT, { y: -0.3 });
  parts.box(2 * B, 0.35, 2 * L, WHITE, { y: 0.6 });
  parts.box(2 * B + 0.04, 0.12, 2 * L + 0.04, RED, { y: 0.83 });
  parts.box(2 * lanes, 0.06, 2 * L, DECK, { y: deck - 0.03 });
  // A dashed line between the two lanes.
  for (let z = -L + 1.5; z < L - 1; z += 3) parts.box(0.14, 0.02, 1.6, WHITE, { y: deck + 0.005, z });
  const side = (lanes + B) / 2;
  const wide = B - lanes;
  for (const sx of [-1, 1]) {
    // A casing along each side, with windows out and in, and a low wall on to each end.
    parts.box(wide, 2.4, 22, WHITE, { x: sx * side, y: deck + 1.2 });
    parts.box(0.04, 0.6, 19, GLASS, { x: sx * (B + 0.01), y: deck + 1.55 });
    parts.box(0.04, 0.5, 6, GLASS, { x: sx * (lanes - 0.01), y: deck + 1.6, z: -5 });
    parts.box(0.04, 1.9, 0.9, '#8a8f8a', { x: sx * (lanes - 0.01), y: deck + 0.95, z: 3 }); // door
    for (const ez of [-1, 1]) parts.box(wide, 1, 4, WHITE, { x: sx * side, y: deck + 0.5, z: ez * (L - 2) });
    // A rail round the top of the casing.
    for (const x of [lanes + 0.05, B - 0.05]) parts.box(0.06, 0.06, 22, WHITE, { x: sx * x, y: deck + 3.4 });
    for (let z = -10.5; z <= 10.5; z += 3) {
      for (const x of [lanes + 0.05, B - 0.05]) parts.box(0.06, 1, 0.06, WHITE, { x: sx * x, y: deck + 2.9, z });
    }
    // Lifebuoys on the outside.
    for (const z of [-7, 7]) {
      parts.add(new THREE.TorusGeometry(0.32, 0.09, 6, 12), '#e2632e', {
        x: sx * (B + 0.1),
        y: deck + 0.7,
        z,
        ry: Math.PI / 2,
      });
    }
  }
  // The wheelhouse on one casing, its wings out over the side, and a mast on its roof.
  parts.box(2.2, 1.8, 5.4, WHITE, { x: lanes + 1.1, y: deck + 3.3 });
  parts.box(2.24, 0.7, 5.44, GLASS, { x: lanes + 1.1, y: deck + 3.55 });
  parts.box(2.5, 0.16, 5.8, RED, { x: lanes + 1.1, y: deck + 4.28 });
  parts.box(0.12, 2, 0.12, WHITE, { x: lanes + 1.3, y: deck + 5.36 });
  parts.box(0.8, 0.08, 0.08, WHITE, { x: lanes + 1.3, y: deck + 5.9 });
  // The funnel on the other, with a lifeboat canister either side of it.
  parts.box(1.1, 1.7, 1.8, RED, { x: -side, y: deck + 3.25 });
  parts.box(1.14, 0.3, 1.84, '#24282a', { x: -side, y: deck + 4 });
  for (const z of [-4, 4]) {
    parts.add(new THREE.CylinderGeometry(0.4, 0.4, 1.3, 10), WHITE, { x: -side, y: deck + 2.8, z, rx: Math.PI / 2 });
  }
  const hull = parts.mesh();
  root.add(hull);

  // The ramps: a steel plate with yellow edges, hinged on the end of the deck.
  const ramps = [-1, 1].map(end => {
    const plate = new PartsBuilder();
    plate.box(2 * lanes, 0.22, RAMP, STEEL, { y: -0.11, z: (end * RAMP) / 2 });
    for (const x of [-lanes + 0.1, lanes - 0.1])
      plate.box(0.2, 0.24, RAMP, YELLOW, { x, y: -0.1, z: (end * RAMP) / 2 });
    for (let k = 1; k < 5; k++) plate.box(2 * lanes - 0.4, 0.04, 0.08, '#4f575b', { y: 0.01, z: (end * RAMP * k) / 5 });
    const pivot = new THREE.Group();
    pivot.position.set(0, deck, end * L);
    pivot.add(plate.mesh());
    root.add(pivot);
    return pivot;
  });
  // A Norwegian flag on the mast, flying out from it.
  const flag = new THREE.Group();
  flag.position.set(lanes + 1.36, deck + 6.05, 0);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.6),
    new THREE.MeshLambertMaterial({ map: flagTexture(), side: THREE.DoubleSide }),
  );
  cloth.position.x = 0.45;
  flag.add(cloth);
  root.add(flag);
  return { root, ramps, flag };
}

/** The Norwegian flag: a red field with a blue cross edged in white. */
function flagTexture() {
  return canvasTexture(66, 48, ctx => {
    ctx.fillStyle = '#ba0c2f';
    ctx.fillRect(0, 0, 66, 48);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(18, 0, 12, 48);
    ctx.fillRect(0, 18, 66, 12);
    ctx.fillStyle = '#00205b';
    ctx.fillRect(21, 0, 6, 48);
    ctx.fillRect(0, 21, 66, 6);
  });
}

/** The short trip: straight out from the dock, round in a loop and straight back in, a teardrop on the water. */
function spinRoute(dock) {
  const out = { x: -Math.sin(dock.heading), z: -Math.cos(dock.heading) };
  const across = { x: out.z, z: -out.x };
  const [reach, width] = [52, 17];
  const points = [];
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const along = (reach * (1 - Math.cos(a))) / 2;
    const side = (width * Math.sin(a) * (1 - Math.cos(a))) / 2;
    points.push([dock.x + out.x * along + across.x * side, dock.z + out.z * along + across.z * side]);
  }
  return createPath(points);
}

/** The long trip, out along the fjord until it is out of sight. */
function voyageRoute(dock) {
  const out = { x: -Math.sin(dock.heading), z: -Math.cos(dock.heading) };
  const points = [
    [dock.x, dock.z],
    [dock.x + out.x * 12, dock.z + out.z * 12],
  ];
  for (let s = 24; s <= 330; s += 8) {
    const p = FJORD.path.at(s);
    points.push([p.x, p.z]);
  }
  return createPath(points);
}

export function createFerry(scene, { onHorn }) {
  const random = createRandom(5501);
  const { dock } = FERRY_QUAY;
  const ferry = createFerryState({
    dock,
    quay: FERRY_QUAY,
    spin: spinRoute(dock),
    voyage: voyageRoute(dock),
    level: FJORD.level,
  });
  addFloatingDeck({ height: (x, z) => deckHeight(ferry, x, z) });
  const model = ferryModel();
  scene.add(model.root);

  // --- The cars it brings ------------------------------------------------------------------

  const road = TRACKS.find(track => track.id === 'fjord').path;
  const top = OUTER_ROAD.nearest(road.at(0).x, road.at(0).z).s;
  const passengers = PASSENGERS.map(model => {
    const vehicle = createVehicle(model());
    vehicle.root.visible = false;
    scene.add(vehicle.root);
    return { ...vehicle, mode: 'gone', slot: null, way: null, s: 0, speed: 0, wait: 0, x: 0, z: 0, heading: 0 };
  });

  /** Puts two or three of the cars not out on the road aboard, in their places on the deck. */
  function load() {
    const free = passengers.filter(p => p.mode === 'gone');
    const count = Math.min(free.length, random() < 0.5 ? 2 : 3);
    for (let i = 0; i < count; i++) {
      const p = free.splice(Math.floor(random() * free.length), 1)[0];
      Object.assign(p, { mode: 'aboard', slot: SLOTS[i], speed: 0 });
      p.root.visible = true;
      p.steering.heading = null;
    }
  }

  /**
   * The way off for a car aboard, through world points: along its lane and off the end of the
   * ferry, over the quay's ramp, round onto the road and up it, then along the outer road one way
   * or the other.
   */
  function wayOff(p) {
    const end = quayEnd(ferry);
    const points = [];
    // To the land end of the quay's ramp.
    const ashore = FERRY_QUAY.berth - FERRY_QUAY.from;
    for (let lz = HULL.halfLength - p.slot.in - p.length / 2; lz < ashore; lz += 3) {
      const q = toWorld(ferry, p.slot.x, end * lz);
      points.push([q.x, q.z]);
    }
    const shore = toWorld(ferry, p.slot.x, end * ashore);
    points.push([shore.x, shore.z]);
    // Round onto the road, from the end of the quay's ramp.
    const { x, z, rotation } = FERRY_QUAY;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const last = points.at(-1);
    const lx = (last[0] - x) * cos - (last[1] - z) * sin;
    const quay = (qx, qz) => [x + qx * cos + qz * sin, z - qx * sin + qz * cos];
    points.push(quay(lx + 1, -0.6), quay(lx + 3.2, -2));
    for (let s = road.length; s >= 0; s -= 4) {
      const q = road.offset(s, -KEEP_RIGHT);
      if (s < road.length - 30 || quayAcross(q) > lx + 5) points.push([q.x, q.z]);
    }
    const direction = random() < 0.5 ? 1 : -1;
    for (let k = 1; k <= 45; k++) {
      const q = OUTER_ROAD.offset(top + k * 4 * direction, direction * LANE);
      points.push([q.x, q.z]);
    }
    return createPath(points);
  }

  /** How far across the quay's frame a point is. */
  function quayAcross({ x, z }) {
    const cos = Math.cos(FERRY_QUAY.rotation);
    const sin = Math.sin(FERRY_QUAY.rotation);
    return (x - FERRY_QUAY.x) * cos - (z - FERRY_QUAY.z) * sin;
  }

  /** Sends the cars aboard off, one after another. */
  function unload() {
    passengers
      .filter(p => p.mode === 'aboard')
      .sort((a, b) => a.slot.in - b.slot.in)
      .forEach((p, i) => Object.assign(p, { mode: 'leaving', way: wayOff(p), s: 0, speed: 0, wait: 0.6 + i * 1.6 }));
  }

  /** Places a car and turns and spins its wheels. */
  function place(p, x, z, heading, dt) {
    const pose = chassisPose(x, z, heading, drivingHeight);
    p.root.position.set(x, pose.height + 0.06, z);
    p.root.rotation.set(pose.pitch, heading, pose.roll, 'YXZ');
    const angle = steer(p.steering, heading, p.speed, dt);
    for (const wheel of p.wheels) {
      if (wheel.front) wheel.pivot.rotation.y = angle;
      wheel.spin.rotation.x -= (p.speed * dt) / p.radius;
    }
    Object.assign(p, { x, z, heading });
  }

  /** How far ahead along the way a car has before it must stop: for the player, the others and anything else in the way. */
  function room(p, blockers) {
    const fx = -Math.sin(p.heading);
    const fz = -Math.cos(p.heading);
    let gap = Infinity;
    const check = (x, z, size) => {
      const ahead = (x - p.x) * fx + (z - p.z) * fz;
      const across = Math.abs((x - p.x) * fz - (z - p.z) * fx);
      if (ahead > 0 && ahead < 30 && across < 2.2) gap = Math.min(gap, ahead - size);
    };
    for (const b of blockers) check(b.x, b.z, b.size ?? 2.5);
    for (const other of passengers)
      if (other !== p && other.mode === 'leaving') check(other.x, other.z, other.length / 2);
    return gap;
  }

  function drive(p, dt, player, blockers) {
    if ((p.wait -= dt) > 0) return;
    const cruise = p.s < CLEAR_OF_QUAY ? SLOW : CRUISE;
    const gap = room(p, blockers);
    const target = Math.min(cruise, Math.max(0, (gap - p.length / 2 - 3.5) * 0.7));
    p.speed = damp(p.speed, target, target < p.speed ? 4 : 0.9, dt);
    p.s = Math.min(p.way.length, p.s + p.speed * dt);
    const q = p.way.at(p.s);
    place(p, q.x, q.z, headingOf(q.dx, q.dz), dt);
    // Away up the road and out of sight, or at the end of its way, it is gone.
    const far = !player || Math.hypot(p.x - player.x, p.z - player.z) > GONE;
    if (p.s >= p.way.length || (p.s > CLEAR_OF_QUAY + 60 && far)) {
      p.mode = 'gone';
      p.root.visible = false;
    }
  }

  // --- The arrow over the deck ---------------------------------------------------------------

  const arrow = new THREE.Mesh(
    mergeGeometries([
      new THREE.ConeGeometry(0.62, 0.85, 4).rotateX(Math.PI).translate(0, 0.42, 0).toNonIndexed(),
      new THREE.BoxGeometry(0.42, 0.7, 0.42).translate(0, 1.15, 0).toNonIndexed(),
    ]),
    new THREE.MeshBasicMaterial({ color: '#f08a3c' }),
  );
  const rippleMaterial = new THREE.MeshBasicMaterial({
    color: '#ffd37a',
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2), rippleMaterial);
  scene.add(arrow, ripple);
  let cue = 0;

  // --- Every frame -----------------------------------------------------------------------------

  const colliders = [];
  const points = [];
  let answerAt = null;
  let time = 0;
  let boarding = false;
  let aboard = false;
  let crowded = false;
  const partlyOn = circles => anyOn(ferry, circles, OUTLINE, false) && !allAboard(ferry, circles, OUTLINE);

  /**
   * Moves the ferry and the cars on by `dt` seconds. `player` is the driving state while
   * someone is driving, or null; `corners` the corners of its outline, `others` the outlines of
   * friends that come along, and `blockers` points the cars leaving must not run into.
   */
  function update(dt, { player = null, corners = [], others = [], blockers = [], listener }) {
    time += dt;
    const busy = passengers.some(p => p.mode === 'aboard' || (p.mode === 'leaving' && anyOn(ferry, [p], p.length / 2)));
    stepFerry(ferry, dt, { car: player, corners, others, busy });
    boarding = player !== null && anyOn(ferry, corners);
    aboard = player !== null && allAboard(ferry, corners);
    crowded = ferry.phase === 'docked' && aboard && Math.abs(player.speed) < 0.3;
    const distance = Math.hypot(ferry.x - listener.x, ferry.z - listener.z);
    for (const event of ferry.events) {
      if (event === 'toot') onHorn(distance, 1);
      if (event === 'loading') load();
      if (event === 'arrived') unload();
    }
    // Answering a honk, it toots twice.
    if (answerAt !== null && (answerAt -= dt) <= 0) {
      answerAt = null;
      onHorn(distance, 2);
    }

    model.root.visible = ferry.shown;
    model.root.position.set(ferry.x, ferry.y, ferry.z);
    model.root.rotation.set(ferry.pitch, ferry.heading, ferry.roll, 'YXZ');
    model.ramps.forEach((pivot, i) => {
      const end = i === 0 ? -1 : 1;
      // Down, a ramp rests on the end of the quay's.
      const rest = Math.atan2(HULL.deck + ferry.y - FERRY_QUAY.high, RAMP);
      const angle = -rest + (RAMP_UP + rest) * ferry.ramps[i];
      pivot.rotation.x = -end * angle;
    });
    model.flag.rotation.y = Math.sin(time * 2.3) * 0.2;

    for (const p of passengers) {
      if (p.mode === 'aboard') {
        const end = quayEnd(ferry);
        const q = toWorld(ferry, p.slot.x, end * (HULL.halfLength - p.slot.in - p.length / 2));
        p.root.visible = ferry.shown;
        place(p, q.x, q.z, ferry.heading + (end > 0 ? Math.PI : 0), 0);
      } else if (p.mode === 'leaving') {
        drive(p, dt, player, player ? [player, ...blockers] : blockers);
      }
    }

    // The arrow over the deck while the ferry waits for a car.
    const waiting = ferry.phase === 'docked' && !busy && !isCarrying(ferry);
    const near = player && Math.hypot(player.x - FERRY_QUAY.x, player.z - FERRY_QUAY.z) < 70;
    const askable = waiting && near && !allAboard(ferry, corners);
    cue = damp(cue, askable ? 1 : 0, 4, dt);
    arrow.visible = ripple.visible = cue > 0.02;
    if (arrow.visible) {
      const deck = ferry.y + HULL.deck;
      arrow.position.set(ferry.x, deck + 3.6 + Math.sin(time * 2.6) * 0.3, ferry.z);
      arrow.rotation.y = time * 1.1;
      arrow.scale.setScalar(1.6 * cue);
      const spread = 1 + ((time / 2.2) % 1) * 0.3;
      ripple.position.set(ferry.x, deck + 0.04, ferry.z);
      ripple.rotation.y = ferry.heading;
      ripple.scale.set(2.6 * spread * cue, 1, 5 * spread * cue);
      rippleMaterial.opacity = 0.7 * (1 - ((time / 2.2) % 1)) ** 1.5;
    }

    colliders.length = 0;
    colliders.push(...walls(ferry));
    points.length = 0;
    for (const p of passengers) {
      if (p.mode === 'gone' || !p.root.visible) continue;
      const sin = Math.sin(p.heading);
      const cos = Math.cos(p.heading);
      for (const offset of p.along) colliders.push({ x: p.x - sin * offset, z: p.z - cos * offset, radius: 1.15 });
      if (p.mode === 'leaving') points.push({ x: p.x, z: p.z });
    }
  }

  return {
    update,
    /** The ferry's walls and the cars it brought, for the car to bump into. */
    colliders,
    /** The cars driving away from it, for the traffic and the train to wait for. */
    points,
    /** True while the ferry has the car: it goes where it is taken and the controls do nothing. */
    holding: () => isCarrying(ferry),
    /** Moves something on the deck ({ x, z, heading }) the way the ferry moved this frame. */
    carry: thing => carry(ferry, thing),
    /** Whether the car is on the ferry or the quay's ramp. */
    boarding: () => boarding,
    /** Whether all of the car is on the ferry's deck. */
    aboard: () => aboard,
    /**
     * While the car stands aboard, ready to go: whether an outline (circles) is partly on the
     * ferry, with no room for the rest of it. Otherwise null.
     */
    crowded: () => (crowded ? partlyOn : null),
    /**
     * Whether a point is on the car deck, `margin` in from its edges, where the deck was before
     * it moved this frame, as is whatever has not been moved along with it yet.
     */
    onDeck: (x, z, margin = 0) => onCarDeck(ferry.last, x, z, margin),
    /**
     * Where the camera looks past the car while it is on the ferry: from further back and higher
     * up, over any friends behind it, and once the ferry sails, round to one side, so the ferry
     * and the fjord are in view.
     */
    watch(state) {
      if (!boarding && !isCarrying(ferry)) return null;
      const fx = -Math.sin(state.heading);
      const fz = -Math.cos(state.heading);
      const side = isCarrying(ferry) ? 28 : 0;
      return {
        x: state.x + fx * 40 - fz * side,
        z: state.z + fz * 40 + fx * side,
        zoom: 1.7,
        pitch: 0.06,
        toward: 0.1,
        turn: 1.2,
        ease: 0.6,
      };
    },
    /** It answers a honk nearby. */
    hearHorn(x, z) {
      if (ferry.shown && answerAt === null && Math.hypot(x - ferry.x, z - ferry.z) < 120) answerAt = 0.7;
    },
    getState: () => ({
      phase: ferry.phase,
      trip: ferry.trip,
      x: ferry.x,
      z: ferry.z,
      heading: ferry.heading,
      ramps: [...ferry.ramps],
      shown: ferry.shown,
      carrying: isCarrying(ferry),
      quayEnd: quayEnd(ferry),
      cue,
      passengers: passengers.map(({ mode, x, z, heading, speed }) => ({ mode, x, z, heading, speed })),
    }),
    /** For tests and screenshots: ties the ferry up at the quay at once, empty, with its ramp down. */
    dock() {
      for (const p of passengers) Object.assign(p, { mode: 'gone' }).root.visible = false;
      const end = quayEnd(ferry);
      Object.assign(ferry, { phase: 'docked', trip: 'in', time: 0, shown: true, speed: 0, carrying: null });
      ferry.ramps[end < 0 ? 0 : 1] = 0;
      ferry.ramps[end < 0 ? 1 : 0] = 1;
    },
    /** For tests and screenshots: brings the ferry in from the far end now, with cars aboard. */
    callIn() {
      Object.assign(ferry, { phase: 'away', time: 1e3, shown: false });
    },
  };
}
