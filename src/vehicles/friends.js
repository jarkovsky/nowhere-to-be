// Friends who tag along. Five of the garage's vehicles wait at the depot by the trail: a
// blue lorry and a red one, and the two race cars in the bays, and the flatbed lorry with its
// digger on the apron beside the building. Drive up close and an arrow bobs over each one, with a ripple
// on the ground round it like the one round the play button. Tap one (or press F) and it
// honks, flashes its lamps, pulls out and follows: along the way the player drove, a little
// way behind, stopping when the player stops and honking back when the player honks. All of
// them can come along, each behind the one before.
// Tapping one that follows while stopped, or parking at the depot with them, lets them
// stay, and they go back to their bays once nobody is looking. One left far behind, or one
// that has lost the player (after going back to the start), catches up out of sight.
// Following the player onto the ferry, each finds a lane on the deck with room for it and
// drives in as far as it goes, and the ferry waits for them all; on the other side they drive
// off after the player, the ones nearest the ramp first.
//
// Waiting in their bays, the friends are each drawn as one merged mesh, so they cost little.
// The ones out driving are full copies of the player's car, borrowed from a small pool (copies.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { angleDelta, damp, lerp, segmentDistance, smoothstep } from '../core/math.js';
import { penetration } from '../core/collision.js';
import { DEFAULT_BODY } from '../core/driving.js';
import { berthFor, deckPoint, deckSpan, fromDeck, inward } from '../core/ferry.js';
import {
  addCrumb,
  createFollower,
  createRoute,
  forgetBehind,
  joinRoute,
  layCrumbs,
  leaderAlong,
  moveRoute,
  nearestCrumb,
  poseAt,
  routeEnd,
  routeStart,
  SPACING,
  startRoute,
  stepFollower,
} from '../core/follow.js';
import { vertexColorMaterial } from '../world/build.js';
import { DEPOT } from '../world/layout.js';
import { drivingHeight, isDriveable } from '../world/terrain.js';
import { createCopies, poseCopy } from './copies.js';

/**
 * Who waits at the depot, first come first served, in this order along the bays. The lorries
 * always wear their own paints; the others take one of `PAINTS`.
 */
const LINEUP = [
  { vehicle: 'lorry', color: 'navy' },
  { vehicle: 'lorry', color: 'red' },
  { vehicle: 'hyundai' },
  { vehicle: 'mercedes' },
  { vehicle: 'offroader' },
  { vehicle: 'pickup' },
  { vehicle: 'van' },
  { vehicle: 'saloon' },
  { vehicle: 'tractor' },
  { vehicle: 'miata' },
  // Too long for a bay: it waits on the apron, and the vehicle the player has taken its place.
  { vehicle: 'flatbed' },
];
/** Who waits on the apron rather than in a bay. */
const APRON = 'flatbed';
/** The other friends' paints, each a different one in the order they wait, leaving out the player's. */
const PAINTS = ['blue', 'orange', 'yellow', 'sage', 'berry'];

/** Whether a place in the line-up is this vehicle in this paint (any paint, for one without its own). */
const fits = (entry, vehicle, color) => entry.vehicle === vehicle && (!entry.color || entry.color === color);
/** Where a friend comes in the line-up. */
const rank = ({ vehicle, color }) => LINEUP.findIndex(entry => fits(entry, vehicle, color));
/** How close the player has to be for a friend to show it can come along, and to tap one. */
const NEAR = 20;
const TAP_RANGE = 24;
/** The clear gap a friend keeps behind whoever it follows, more when a lorry or a long truck is involved; and the least. */
const GAP = 6;
const LORRY_GAP = 8;
const LEAST = 2.5;
const TOP = 14;
const CATCH_UP = 16;
/** Further behind than this along the way, a friend catches up out of sight. */
const FAR = 80;
/** How fast a friend drives on and off the ferry, and how hard it slows to stop in its place on the deck. */
const DECK_SPEED = 3.5;
const DECK_BRAKE = 1.5;
/** How far in from the end of the deck at the quay its ramp and the quay's reach: the land end of the quay's ramp. */
const QUAY_END = -9.6;
/** How far round the camera swings, in radians, to look back at the friends waiting behind the parked car. */
const LOOK_BACK = 2.7;
/** Friends further than this from the player aren't drawn. */
const DRAW_DISTANCE = 330;

const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const near = new THREE.Vector3();
const far = new THREE.Vector3();
const pose = { x: 0, z: 0, heading: 0 };

function put(circle, x, z, radius) {
  circle.x = x;
  circle.z = z;
  circle.radius = radius;
}

/** Whether any of the circles in `list` comes within `reach` of (x, z). */
function touches(list, x, z, reach) {
  for (const c of list) if (Math.hypot(c.x - x, c.z - z) < c.radius + reach) return true;
  return false;
}

/**
 * Where the bay at `index` puts a vehicle whose nose is `front` metres ahead of its middle: the
 * apron, past the last bay, has the place for the flatbed.
 */
function bayPose(index, front, out) {
  const cos = Math.cos(DEPOT.rotation);
  const sin = Math.sin(DEPOT.rotation);
  const apron = index >= DEPOT.bays.length;
  const lx = apron ? DEPOT.apron.lx : DEPOT.bays[index];
  const lz = (apron ? DEPOT.apron.nose : DEPOT.noses) - front;
  out.x = DEPOT.x + lx * cos + lz * sin;
  out.z = DEPOT.z - lx * sin + lz * cos;
  out.heading = Math.atan2(-sin, -cos);
  return out;
}

/** Whether (x, z) is in the depot's yard, in front of the doors or on the apron beside them. */
function inYard(x, z) {
  const dx = x - DEPOT.x;
  const dz = z - DEPOT.z;
  const cos = Math.cos(DEPOT.rotation);
  const sin = Math.sin(DEPOT.rotation);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return lx > -15 && lx < DEPOT.apron.lx + 6 && lz > -3 && lz < 20;
}

export function createFriends(scene, { obstacles, onHorn, vehicle: playerVehicle, color: playerColor }) {
  const copies = createCopies(scene);
  const { sizeOf, statueOf } = copies;

  // --- The friends ------------------------------------------------------------------------

  /**
   * Paints for the friends `{ vehicle, color }`: the lorries keep their own, and each of the
   * others gets the next paint along by its place among them.
   */
  const paintAll = waiting => {
    const paints = PAINTS.filter(c => c !== playerColor);
    const painted = waiting.filter(w => LINEUP[rank(w)]?.color === undefined).sort((a, b) => rank(a) - rank(b));
    return waiting.map(w =>
      LINEUP[rank(w)]?.color !== undefined ? w.color : paints[painted.indexOf(w) % paints.length],
    );
  };

  const arrowGeometry = mergeGeometries([
    new THREE.ConeGeometry(0.62, 0.85, 4).rotateX(Math.PI).translate(0, 0.42, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.42, 0.7, 0.42).translate(0, 1.15, 0).toNonIndexed(),
  ]);
  const arrowMaterial = new THREE.MeshBasicMaterial({ color: '#f08a3c' });
  const rippleGeometry = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
  const rippleMaterial = new THREE.MeshBasicMaterial({
    color: '#ffd37a',
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });

  // Everyone but the player: their vehicle, or the lorry in their own paint. The first of them
  // fill the bays, and the flatbed waits on the apron, or whoever is next in line if the player has it.
  const others = LINEUP.filter(entry => entry.vehicle !== APRON && !fits(entry, playerVehicle, playerColor));
  const waiting = [
    ...others.slice(0, DEPOT.bays.length),
    playerVehicle === APRON ? others[DEPOT.bays.length] : { vehicle: APRON },
  ].map(entry => ({ ...entry }));
  const colors = paintAll(waiting);
  const friends = waiting.map(({ vehicle }, bay) => {
    const color = colors[bay];
    const statue = new THREE.Mesh(statueOf(vehicle, color), vertexColorMaterial);
    statue.castShadow = true;
    statue.receiveShadow = true;
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial);
    scene.add(statue, arrow, ripple);
    return {
      vehicle,
      color,
      size: sizeOf(vehicle),
      bay,
      apron: bay === DEPOT.bays.length,
      mode: 'home', // 'home' | 'following' | 'staying'
      x: 0,
      z: 0,
      heading: 0,
      speed: 0,
      statue,
      copy: null,
      route: createRoute(),
      follower: createFollower(),
      starting: false,
      lost: false,
      lostAt: -Infinity,
      /** Partly on a ferry with no room for the rest of it, and backing off it. */
      crowded: false,
      backOff: false,
      /**
       * Its place on the ferry's deck, once it has one: the dock it came aboard at, and whether it
       * has stopped there; whether it is driving off at the other side; and whether it found no room.
       */
      berth: null,
      leaving: false,
      ashore: false,
      since: 0,
      retry: 0,
      away: false,
      wait: 0,
      stuck: 0,
      side: 0,
      aside: 0,
      shove: { x: 0, z: 0 },
      honkAt: null,
      toots: 0,
      flash: 0,
      cue: 0,
      arrow,
      ripple,
      circles: Array.from({ length: 10 }, () => ({ x: 0, z: 0, radius: 1.2 })),
      used: 0,
    };
  });
  /** The friends coming along, in the order they follow. */
  const party = [];
  const colliders = [];
  const points = [];
  const player = { x: 0, z: 0, heading: 0, speed: 0, size: sizeOf(playerVehicle) };
  /** The way the player has come lately, for a friend catching up. */
  const trail = createRoute();
  // The player's car as circles, its trailer's included.
  const body = Object.assign(
    Array.from({ length: 8 }, () => ({ x: 0, z: 0, radius: 1 })),
    { used: 0 },
  );

  function placeStatue(friend) {
    bayPose(friend.bay, friend.size.front, friend);
    friend.speed = 0;
    const { statue } = friend;
    statue.position.set(friend.x, drivingHeight(friend.x, friend.z), friend.z);
    statue.rotation.set(0, friend.heading, 0);
    statue.updateMatrix();
  }
  for (const friend of friends) {
    friend.statue.matrixAutoUpdate = false;
    placeStatue(friend);
  }

  /** Swaps a friend from its merged mesh to a full copy, standing where it stood. */
  function wake(friend) {
    if (friend.copy) return;
    friend.copy = copies.borrow(friend.vehicle, friend.color, friend.heading);
    friend.statue.visible = false;
    poseCopy(friend.copy, friend, 0, true);
  }

  /** Back in its bay, as its merged mesh. */
  function goHome(friend) {
    if (friend.copy) copies.giveBack(friend.copy);
    friend.copy = null;
    friend.mode = 'home';
    friend.away = false;
    friend.statue.visible = true;
    placeStatue(friend);
  }

  function honk(friend, delay, toots = 1) {
    if (!friend.copy) return;
    friend.honkAt = delay;
    friend.toots = toots;
  }

  // --- Seeing, and room to stand ---------------------------------------------------------

  /** Whether a friend standing at (x, z) facing `heading` would be in the camera's view. */
  function seen(friend, x, z, heading) {
    const { front, back, height } = friend.size;
    const middle = (front - back) / 2;
    sphere.center.set(x - Math.sin(heading) * middle, drivingHeight(x, z) + height / 2, z - Math.cos(heading) * middle);
    sphere.radius = (front + back) / 2 + 1.5;
    return frustum.intersectsSphere(sphere);
  }

  /** Whether a vehicle `half` metres wide each side of its middle could stand at (x, z). */
  function roomAt(x, z, half) {
    if (!isDriveable(x, z)) return false;
    for (const obstacle of obstacles.near(x, z, half + 2)) if (penetration(x, z, half, obstacle)) return false;
    return true;
  }

  /** Circles along a friend's body, the trailer's following its own way, for bumping into. */
  function outline(friend) {
    const { x, z, heading, size } = friend;
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const radius = size.half + 0.1;
    const cab = size.lorry ? Math.min(size.back, 2.4) : size.back;
    let n = 0;
    for (let d = -size.front + radius; d <= cab - radius + 0.6 && n < friend.circles.length; d += 2) {
      put(friend.circles[n++], x + sin * d, z + cos * d, radius);
    }
    if (size.lorry) {
      const trailer = friend.copy?.trailer;
      const hx = trailer?.ready ? trailer.x : x + sin * 1.9;
      const hz = trailer?.ready ? trailer.z : z + cos * 1.9;
      const th = trailer?.ready ? trailer.heading : heading;
      for (let d = 1.5; d < 9; d += 2.4) put(friend.circles[n++], hx + Math.sin(th) * d, hz + Math.cos(th) * d, 1.3);
    }
    friend.used = n;
  }

  // --- Following ---------------------------------------------------------------------------

  const leaderOf = friend => {
    const i = party.indexOf(friend);
    return i > 0 ? party[i - 1] : player;
  };
  /**
   * The gap a friend keeps behind its leader, more when a lorry or a long truck is involved. The first in line
   * keeps back behind the camera, so it never fills the view from close up, except when it has
   * just been asked along: then it rolls straight out of its bay, to show it is coming; and
   * when the player is aboard a ferry, where they all close up to fit on.
   */
  function gapBehind(friend, leader) {
    if (friend.follower.s < 5 && friend.mode === 'following' && !friend.lost) return LEAST + 1.5;
    const gap = [friend.size, leader.size].some(size => size.lorry || size.long) ? LORRY_GAP : GAP;
    return leader === player && chasing && !closeUp ? Math.max(gap, cameraBack + 2 - leader.size.back) : gap;
  }

  /**
   * Sets off after `leader`: straight out of where it stands, then on to where the leader is.
   * Behind another friend it takes up the way that one went out of its bay, rather than
   * heading straight for it across a lorry's trailer.
   */
  function setOff(friend, leader) {
    const fx = -Math.sin(friend.heading);
    const fz = -Math.cos(friend.heading);
    startRoute(friend.route, [
      [friend.x, friend.z],
      [friend.x + fx * 4, friend.z + fz * 4],
    ]);
    if (leader !== player && !leader.lost) {
      for (let s = Math.min(4, leader.follower.s); s < leader.follower.s; s += SPACING) {
        poseAt(leader.route, s, 0, pose);
        addCrumb(friend.route, pose.x, pose.z);
      }
    }
    addCrumb(friend.route, leader.x, leader.z);
    friend.follower.s = 0;
    friend.follower.speed = 0;
    friend.lost = false;
    friend.stuck = 0;
  }

  /**
   * Has a friend that has lost its leader take up the way the leader came: from where it
   * stands, once that way passes close by, or else out of sight, a little further back than
   * it likes to be, along the way if that is remembered far enough back or on clear ground
   * straight behind the leader. It follows on from there.
   */
  function catchUp(friend, leader) {
    const behind = leader.size.back + gapBehind(friend, leader) + friend.size.front;
    const path = leader === player ? trail : leader.route;
    const at = leader === player ? leaderAlong(trail, player.x, player.z) : leader.follower.s;
    const known = !leader.lost && path.count > 1;
    // Just after the leader jumped (back to the start, say), the view has jumped too, so it
    // can go from where it is whether it is in view or not.
    const fresh = time - friend.lostAt < 0.5;
    if (!fresh && seen(friend, friend.x, friend.z, friend.heading)) {
      // In view, it waits where it is until the leader has gone by close enough, the same way it faces.
      const near = known ? nearestCrumb(path, friend.x, friend.z) : null;
      if (!near || near.distance > 7 || near.s > at - behind) return;
      const s = near.s;
      poseAt(path, s, friend.size.wheelbase, pose);
      if (Math.abs(angleDelta(friend.heading, pose.heading)) > 1.4) return;
      startRoute(friend.route, [[friend.x, friend.z]]);
      joinRoute(friend.route, path, s, at);
      addCrumb(friend.route, leader.x, leader.z);
      rejoin(friend, 0, leader, false);
      return;
    }
    const s = at - behind - 12;
    if (known && s > routeStart(path)) {
      poseAt(path, s, friend.size.wheelbase, pose);
      if (!seen(friend, pose.x, pose.z, pose.heading)) {
        startRoute(friend.route, [[pose.x, pose.z]]);
        joinRoute(friend.route, path, s, at);
        addCrumb(friend.route, leader.x, leader.z);
        rejoin(friend, 0, leader, true);
        return;
      }
    }
    const bx = Math.sin(leader.heading);
    const bz = Math.cos(leader.heading);
    let room = 0;
    for (let d = leader.size.back + 1; d <= behind + 12 + friend.size.back; d += 1.5) {
      if (!roomAt(leader.x + bx * d, leader.z + bz * d, friend.size.half + 0.3)) break;
      room = d;
    }
    const spot = Math.min(behind + 12, room - friend.size.back);
    if (spot < behind || seen(friend, leader.x + bx * spot, leader.z + bz * spot, leader.heading)) return;
    startRoute(friend.route, [
      [leader.x + bx * (spot + 2), leader.z + bz * (spot + 2)],
      [leader.x, leader.z],
    ]);
    rejoin(friend, 2, leader, true);
  }

  /** Puts a friend `s` along its new route, moving off at the leader's speed; `moved` if it jumped there. */
  function rejoin(friend, s, leader, moved) {
    friend.follower.s = s;
    friend.follower.speed = moved ? Math.max(0, leader.speed) : 0;
    friend.lost = false;
    friend.stuck = 0;
    if (moved && friend.copy) friend.copy.trailer.ready = false;
    poseAt(friend.route, s, friend.size.wheelbase, friend);
  }

  function follow(friend, dt) {
    // On and off the ferry it drives a way of its own.
    if (friend.leaving) return leave(friend, dt);
    if (!friend.berth && deck?.loading && !friend.lost && !friend.starting && !friend.ashore) board(friend);
    if (friend.berth) return park(friend, dt);
    const leader = leaderOf(friend);
    const { route, follower, size } = friend;
    // Backing off a ferry with no room left on it, the way it came, and waiting once it is clear.
    if (friend.backOff) {
      follower.speed = damp(follower.speed, friend.crowded ? -2 : 0, 3, dt);
      follower.s = Math.max(routeStart(route), follower.s + follower.speed * dt);
      poseAt(route, follower.s, size.wheelbase, friend);
      friend.speed = follower.speed;
      return;
    }
    // One asked along behind another that has only just pulled out waits in its bay until all
    // of that one, a lorry's trailer too, is clear of the bays, rather than cutting across in
    // front of the others.
    if (friend.starting) {
      if (leader !== player && !leader.lost && leader.follower.s < Math.max(6, leader.size.back + LEAST)) return;
      friend.starting = false;
      setOff(friend, leader);
    }
    if (!friend.lost && !layCrumbs(route, leader.x, leader.z, leader.speed)) {
      friend.lost = true;
      friend.lostAt = time;
      friend.retry = 0;
    }
    if (friend.lost) {
      friend.speed = damp(friend.speed, 0, 4, dt);
      if ((friend.retry -= dt) <= 0) {
        friend.retry = 0.25;
        catchUp(friend, leader);
      }
      return;
    }
    const along = leaderAlong(route, leader.x, leader.z);
    const sin = Math.sin(friend.heading);
    const cos = Math.cos(friend.heading);
    const noseX = friend.x - sin * size.front;
    const noseZ = friend.z - cos * size.front;

    // In a straight line, when the leader is in front: it may have come back round another way.
    let straight = Infinity;
    if ((leader.x - friend.x) * -sin + (leader.z - friend.z) * -cos > 0) {
      const lx = -Math.sin(leader.heading);
      const lz = -Math.cos(leader.heading);
      const { front, back } = leader.size;
      straight = segmentDistance(
        noseX,
        noseZ,
        leader.x + lx * front,
        leader.z + lz * front,
        leader.x - lx * back,
        leader.z - lz * back,
      ).distance;
    }

    // Anything else in the way along the route: traffic, the train, the barriers, parked friends,
    // and friends further up the line where the ways cross (only those ahead, so no two ever
    // wait for each other).
    const ahead = party.slice(0, Math.max(0, party.indexOf(friend) - 1));
    let blocked = friend.wait > 0 ? 0 : Infinity;
    for (let k = 0; k < 4 && blocked === Infinity; k++) {
      poseAt(route, follower.s + size.front + k * 2, 0, pose);
      // Only what is right in the way: oncoming traffic in its own lane can squeeze by.
      const reach = size.half - 0.4;
      if (
        touches(moving, pose.x, pose.z, reach) ||
        touches(colliders, pose.x, pose.z, reach) ||
        ahead.some(other => touches(other.circles.slice(0, other.used), pose.x, pose.z, reach))
      )
        blocked = k * 2;
    }

    const gap = gapBehind(friend, leader);
    const length = leader.size.back + size.front;
    const clear = stepFollower(follower, route, { along, speed: leader.speed, straight, blocked }, dt, {
      length,
      gap,
      least: LEAST,
      top: TOP,
      catchUp: CATCH_UP,
    });
    poseAt(route, follower.s, size.wheelbase, friend);
    friend.speed = follower.speed;

    // Left far behind, or stuck behind something for a while, it catches up out of sight.
    friend.stuck = Math.abs(follower.speed) < 0.5 && clear > gap + 5 ? friend.stuck + dt : 0;
    if (clear > FAR || (friend.stuck > 12 && clear > 25)) {
      const s = along - length - gap - 14;
      if (s > follower.s) {
        poseAt(route, s, size.wheelbase, pose);
        if (!seen(friend, friend.x, friend.z, friend.heading) && !seen(friend, pose.x, pose.z, pose.heading)) {
          follower.s = s;
          follower.speed = Math.max(0, leader.speed);
          friend.stuck = 0;
          if (friend.copy) friend.copy.trailer.ready = false;
          poseAt(route, s, size.wheelbase, friend);
        }
      }
    }
    if (!inYard(friend.x, friend.z) && Math.hypot(friend.x - DEPOT.x, friend.z - DEPOT.z) > 50) friend.away = true;
  }

  // --- On and off the ferry ------------------------------------------------------------------

  const deckAt = (deck, x, z) => deckPoint(deck, deck.end, x, z);
  const deckXZ = (deck, across, depth) => {
    const q = fromDeck(deck, deck.end, across, depth);
    return [q.x, q.z];
  };

  /** The span of the deck a friend takes up, or will once it stops in its place there. */
  function spanOf(friend) {
    if (!friend.berth) return deckSpan(deck, deck.end, friend.circles.slice(0, friend.used), 1.4);
    const { across, nose } = friend.berth;
    const { half, front, back } = friend.size;
    return { across, half, near: nose - front - back, far: nose };
  }

  /** How far ahead along its way a friend has before the player's car or another friend is in the way. */
  function clearAhead(friend) {
    const { route, follower, size } = friend;
    const reach = size.half - 0.4;
    const car = body.slice(0, body.used);
    for (let k = 0; k < 6; k++) {
      poseAt(route, follower.s + size.front + k * 1.5, 0, pose);
      if (touches(car, pose.x, pose.z, reach)) return k * 1.5;
      for (const other of party) {
        if (other !== friend && touches(other.circles.slice(0, other.used), pose.x, pose.z, reach)) return k * 1.5;
      }
    }
    return Infinity;
  }

  /**
   * Drives a friend on along its way over the deck, slowly, stopping short of anything in the
   * way and at the end of it, or wherever it is when `go` is false. True once stopped at the end.
   */
  function deckDrive(friend, dt, go) {
    const { route, follower, size } = friend;
    const left = routeEnd(route) - follower.s;
    const clear = clearAhead(friend);
    const target = go ? Math.min(DECK_SPEED, Math.sqrt(2 * DECK_BRAKE * left), Math.max(0, (clear - 1.5) * 1.2)) : 0;
    follower.speed = damp(follower.speed, target, target < follower.speed ? 5 : 1.4, dt);
    follower.s = Math.min(routeEnd(route), follower.s + Math.max(0, follower.speed) * dt);
    const there = routeEnd(route) - follower.s < 0.05;
    if (there) follower.speed = 0;
    poseAt(route, follower.s, size.wheelbase, friend);
    friend.speed = follower.speed;
    friend.stuck = follower.speed < 0.1 && !there ? friend.stuck + dt : 0;
    return there;
  }

  /**
   * Finds a friend coming up to the ferry, while the player stands aboard, a place on the deck
   * with room for all of it, and the way there: on along its way to the quay's ramp, over into
   * its lane and in as far as the lane goes. With no room it stays ashore.
   */
  function board(friend) {
    const { size, route, follower } = friend;
    const me = deckAt(deck, friend.x, friend.z);
    // Once it is on the quay's ramp, or has stopped close behind whoever it follows on the way down to it.
    if (me.depth < QUAY_END - 14 || (me.depth < QUAY_END && Math.abs(friend.speed) > 0.3)) return;
    const taken = [deckSpan(deck, deck.end, body.slice(0, body.used), 1.2)];
    for (const other of party) {
      if (other !== friend && !other.lost && (other.berth || deckAt(deck, other.x, other.z).depth > 0)) {
        taken.push(spanOf(other));
      }
    }
    // Already aboard, it stays in the lane it is in.
    const berth = berthFor(
      taken,
      { half: size.half, length: size.front + size.back },
      me.depth > 1 ? [me.across] : undefined,
      me.depth - size.back,
    );
    const middle = berth ? berth.nose - size.front : -Infinity;
    if (middle < me.depth) {
      friend.ashore = true;
      return;
    }
    // A little of the way it came, so it keeps facing the way it was going.
    const points = [];
    for (let back = 3; back > 0; back--) {
      if (follower.s - back < routeStart(route)) continue;
      poseAt(route, follower.s - back, 0, pose);
      points.push([pose.x, pose.z]);
    }
    points.push([friend.x, friend.z]);
    const at = points.length - 1;
    // On along its way while that is still short of the quay's ramp.
    let from = me;
    for (let s = follower.s + 1; from.depth < QUAY_END && s < routeEnd(route); s++) {
      poseAt(route, s, 0, pose);
      from = deckAt(deck, pose.x, pose.z);
      points.push([pose.x, pose.z]);
    }
    // Over into its lane by the time it is aboard, and in along it.
    const into = Math.min(middle, Math.max(from.depth + Math.abs(berth.across - from.across) * 3, 0));
    for (let depth = from.depth + 1; depth < into; depth++) {
      points.push(deckXZ(deck, lerp(from.across, berth.across, smoothstep(depth, from.depth, into)), depth));
    }
    for (let depth = Math.max(into, from.depth + 1); depth < middle; depth += 2)
      points.push(deckXZ(deck, berth.across, depth));
    points.push(deckXZ(deck, berth.across, middle));
    startRoute(route, points);
    follower.s = route.s[at];
    friend.berth = { at: deck.at, across: berth.across, nose: berth.nose, parked: false };
    friend.ashore = false;
    friend.stuck = 0;
  }

  /** Drives a friend in to its place on the deck while the ferry is tied up, and stops there. */
  function park(friend, dt) {
    const { berth } = friend;
    if (berth.parked) {
      friend.speed = friend.follower.speed = 0;
      return;
    }
    if (deckDrive(friend, dt, deck !== null)) berth.parked = true;
    // Held up for a while by something in the way: all aboard, it stops where it is; partly on
    // the ferry, it has no room after all, and backs off.
    if (friend.stuck > 3 && deck) {
      if (spanOf({ ...friend, berth: null }).near > 0) berth.parked = true;
      else Object.assign(friend, { berth: null, ashore: true });
    }
  }

  /**
   * Brought across, the friends aboard drive off after the player, the ones nearest the ramp
   * first: each follows the one before it off, in that order.
   */
  function arrive() {
    const aboard = party.filter(friend => friend.berth && friend.berth.at !== deck.at);
    const depth = friend => deckAt(deck, friend.x, friend.z).depth;
    aboard.sort((a, b) => depth(a) - depth(b));
    const rest = party.filter(friend => !aboard.includes(friend));
    party.splice(0, party.length, ...aboard, ...rest);
    for (const friend of aboard) {
      // One facing back into the deck finds its own way off later, out of sight.
      if (Math.cos(friend.heading - inward(deck, deck.end)) > 0) {
        Object.assign(friend, { berth: null, lost: true, lostAt: time, retry: 0 });
        continue;
      }
      // The way off: straight out of its lane, over to the middle of the ramps and off the quay.
      const { route, follower } = friend;
      const me = deckAt(deck, friend.x, friend.z);
      const points = [
        deckXZ(deck, me.across, me.depth + 3),
        deckXZ(deck, me.across, me.depth + 1.5),
        [friend.x, friend.z],
      ];
      const turn = Math.min(me.depth - 1, 4);
      for (let d = me.depth - 1.5; d > turn; d -= 1.5) points.push(deckXZ(deck, me.across, d));
      for (let d = turn; d > -8; d--) points.push(deckXZ(deck, lerp(me.across, 0, smoothstep(d, turn, -8)), d));
      for (let d = -8; d >= QUAY_END - 1.5; d -= 1.5) points.push(deckXZ(deck, 0, d));
      startRoute(route, points);
      Object.assign(follower, { s: route.s[2], speed: 0 });
      Object.assign(friend, { berth: null, leaving: true, stuck: 0 });
    }
  }

  /**
   * Drives a friend off the ferry after whoever it follows, and then follows on: after the player
   * once the car is off the deck, and after a friend as soon as that one is on its way, so they
   * drive off one behind the other, each stopping short of the one ahead.
   */
  function leave(friend, dt) {
    const leader = leaderOf(friend);
    const ahead = deck ? deckAt(deck, leader.x, leader.z).depth : -Infinity;
    const underway = leader !== player && leader.leaving && leader.follower.s - leader.route.s[2] > 3;
    const go = deck !== null && (leader === player ? ahead < -2 : !leader.leaving || underway);
    if (!deckDrive(friend, dt, go)) return;
    // Off the quay: it takes up the way its leader went from where it is.
    friend.leaving = false;
    const path = leader === player ? trail : leader.route;
    const at = leader === player ? leaderAlong(trail, player.x, player.z) : leader.follower.s;
    const crumb = !leader.lost && path.count > 1 ? nearestCrumb(path, friend.x, friend.z) : null;
    if (!crumb || crumb.distance > 6) {
      Object.assign(friend, { lost: true, lostAt: time, retry: 0 });
      return;
    }
    const { route, follower } = friend;
    poseAt(route, follower.s - 1.5, 0, pose);
    startRoute(route, [
      [pose.x, pose.z],
      [friend.x, friend.z],
    ]);
    joinRoute(route, path, crumb.s, at);
    addCrumb(route, leader.x, leader.z);
    follower.s = route.s[1];
  }

  /** Stops following and pulls over to one side, out of the way of anyone behind. */
  function stay(friend) {
    const i = party.indexOf(friend);
    if (i < 0) return;
    const next = party[i + 1];
    // Whoever followed it follows on the way it was going.
    if (next && !next.lost && !friend.lost) joinRoute(next.route, friend.route, friend.follower.s);
    else if (next) next.lost = true;
    party.splice(i, 1);
    friend.mode = 'staying';
    friend.side = 0;
    const sin = Math.sin(friend.heading);
    const cos = Math.cos(friend.heading);
    for (const side of [1, -1]) {
      const reach = 3.5 * side;
      if (roomAt(friend.x + cos * reach, friend.z - sin * reach, friend.size.half)) {
        friend.side = side;
        break;
      }
    }
    honk(friend, 0.15, 2);
  }

  /** Drives a staying friend to a stop, easing over to its side of the way. */
  function settle(friend, dt) {
    const { follower, route, size } = friend;
    follower.speed = damp(follower.speed, 0, 2.5, dt);
    follower.s = Math.min(follower.s + follower.speed * dt, routeEnd(route));
    friend.aside = damp(friend.aside, friend.side * 3.5, 1.2, dt);
    poseAt(route, follower.s, size.wheelbase, friend);
    const sin = Math.sin(friend.heading);
    const cos = Math.cos(friend.heading);
    friend.x += cos * friend.aside;
    friend.z -= sin * friend.aside;
    friend.speed = follower.speed;
  }

  function invite(friend) {
    if (friend.mode === 'following') return;
    wake(friend);
    friend.mode = 'following';
    friend.aside = 0;
    friend.side = 0;
    party.push(friend);
    friend.starting = true;
    friend.since = time;
    friend.wait = 1;
    honk(friend, 0.1);
  }

  /** The player bumping into one that follows shoves it aside rather than being stopped by it. */
  function shove(friend, dt) {
    const { shove: offset } = friend;
    let pushed = false;
    if (Math.hypot(friend.x - player.x, friend.z - player.z) < 20) {
      outline(friend);
      for (let k = 0; k < friend.used; k++) {
        const c = friend.circles[k];
        for (let j = 0; j < body.used; j++) {
          const p = body[j];
          const dx = c.x + offset.x - p.x;
          const dz = c.z + offset.z - p.z;
          const distance = Math.hypot(dx, dz);
          const overlap = c.radius + p.radius - distance;
          if (overlap > 0 && distance > 1e-6) {
            offset.x += (dx / distance) * overlap;
            offset.z += (dz / distance) * overlap;
            pushed = true;
          }
        }
      }
    }
    const length = Math.hypot(offset.x, offset.z);
    if (length > 3.5) {
      offset.x *= 3.5 / length;
      offset.z *= 3.5 / length;
    }
    if (!pushed) {
      offset.x = damp(offset.x, 0, 1.2, dt);
      offset.z = damp(offset.z, 0, 1.2, dt);
    }
    friend.x += offset.x;
    friend.z += offset.z;
  }

  // --- Every frame -------------------------------------------------------------------------

  let moving = [];
  /** The ferry's deck while it is tied up (see world/ferry.js), or null. */
  let deck = null;
  let parked = 0;
  let parkedAtDepot = 0;
  let time = 0;
  /** How far behind the player the camera is, easing back down slowly when it closes in. */
  let cameraBack = 0;
  let chasing = false;
  let closeUp = false;

  /**
   * `close` says the player is aboard a ferry, where the friends close up, and `crowded(circles)`,
   * while the player stands aboard, says a friend is partly on the ferry: one that has stopped
   * there with no room for all of it backs off again, and is left ashore. `ferry` is the ferry's
   * deck while it is tied up, { x, z, heading, end, at, aboard, loading }: where it is, which
   * end is at the quay, which dock it is at, whether the player is aboard and whether the player
   * stands there, waiting to go, which is when the friends find their places on it.
   */
  function update(
    dt,
    { state, tail = [], driving, night, camera, dynamic = [], close = false, crowded = null, ferry = null },
  ) {
    time += dt;
    moving = dynamic;
    chasing = driving;
    closeUp = close;
    deck = ferry;
    if (deck) {
      // Brought across: off they go, after the player.
      if (party.some(friend => friend.berth && friend.berth.at !== deck.at)) arrive();
      // The player has driven off again before the ferry left: the friends aboard find their own way.
      if (!deck.aboard) {
        for (const friend of party) {
          if (friend.berth && friend.berth.at === deck.at) {
            Object.assign(friend, { berth: null, lost: true, lostAt: time, retry: 0 });
          }
        }
      }
    }
    for (const friend of party) if (!deck?.loading) friend.ashore = false;
    for (const friend of party) {
      friend.crowded = crowded?.(friend.circles.slice(0, friend.used)) ?? false;
      if (!close) friend.backOff = false;
      else if (friend.crowded && Math.abs(friend.speed) < 0.2) friend.backOff = true;
    }
    const back = Math.hypot(camera.position.x - state.x, camera.position.z - state.z);
    cameraBack = Math.max(back, damp(cameraBack, back, 0.3, dt));
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);
    Object.assign(player, { x: state.x, z: state.z, heading: state.heading, speed: state.speed });
    if (!layCrumbs(trail, player.x, player.z, player.speed)) startRoute(trail, [[player.x, player.z]]);
    forgetBehind(trail, leaderAlong(trail, player.x, player.z) - 60);
    // The player's car as the circles it collides with, and its trailer's.
    const sin = Math.sin(player.heading);
    const cos = Math.cos(player.heading);
    body.used = 0;
    const { radius, offsets } = state.body ?? DEFAULT_BODY;
    for (const offset of offsets) put(body[body.used++], player.x - sin * offset, player.z - cos * offset, radius);
    for (let k = 0; k < Math.min(2, tail.length); k++) put(body[body.used++], tail[k].x, tail[k].z, 1.3);

    // Parked at the depot with friends who have been out, they are home.
    parked = Math.abs(player.speed) < 0.2 ? parked + dt : 0;
    parkedAtDepot = inYard(player.x, player.z) && Math.abs(player.speed) < 0.3 ? parkedAtDepot + dt : 0;
    if (parkedAtDepot > 2.5) {
      for (let i = party.length - 1; i >= 0; i--) {
        const friend = party[i];
        const close = Math.hypot(friend.x - DEPOT.x, friend.z - DEPOT.z) < 45;
        if (friend.away && close && Math.abs(friend.speed) < 0.5) stay(friend);
      }
    }

    for (const friend of party) {
      friend.wait = Math.max(0, friend.wait - dt);
      follow(friend, dt);
      shove(friend, dt);
    }
    for (const friend of friends) {
      if (friend.mode === 'staying') {
        settle(friend, dt);
        // Once nobody is looking, it is back in its bay.
        const distance = Math.hypot(friend.x - player.x, friend.z - player.z);
        bayPose(friend.bay, friend.size.front, pose);
        if (
          friend.honkAt === null &&
          friend.flash <= 0 &&
          distance > 20 &&
          !seen(friend, friend.x, friend.z, friend.heading) &&
          !seen(friend, pose.x, pose.z, pose.heading)
        )
          goHome(friend);
      }
      // Honks, each with a flash of the lamps.
      if (friend.honkAt !== null && (friend.honkAt -= dt) <= 0) {
        onHorn(friend.size.horn, friend.x, friend.z);
        friend.flash = 0.7;
        friend.toots--;
        friend.honkAt = friend.toots > 0 ? 0.4 : null;
      }
      friend.flash = Math.max(0, friend.flash - dt);
      const distance = Math.hypot(friend.x - player.x, friend.z - player.z);
      if (friend.copy) {
        const { car } = friend.copy;
        const visible = distance < DRAW_DISTANCE;
        car.root.visible = car.towed.visible = visible;
        if (visible) {
          // Its wheels only need to find the ground where they can be seen.
          poseCopy(friend.copy, friend, dt, distance < 70 && seen(friend, friend.x, friend.z, friend.heading));
          const lit = friend.flash > 0 && Math.sin(friend.flash * 22) > 0;
          const braking = friend.mode === 'following' && (friend.follower.speed < -0.3 || friend.wait > 0);
          // Coming along, its lamps are on, day and night.
          car.setLights(lit ? 1 : friend.mode === 'following' ? Math.max(night, 0.3) : 0, lit || braking);
          car.animate(time);
        }
      } else {
        friend.statue.visible = distance < DRAW_DISTANCE;
      }

      // The arrow and the ripple over a friend that can be asked along.
      const askable = driving && friend.mode !== 'following' && distance - friend.size.front < NEAR;
      friend.cue = damp(friend.cue, askable ? 1 : 0, 5, dt);
      const show = friend.cue > 0.02;
      friend.arrow.visible = friend.ripple.visible = show;
      if (show) {
        const { size } = friend;
        const sin = Math.sin(friend.heading);
        const cos = Math.cos(friend.heading);
        const along = size.front - Math.min(size.front + size.back, 4.6) / 2;
        const x = friend.x - sin * along;
        const z = friend.z - cos * along;
        const ground = drivingHeight(x, z);
        friend.arrow.position.set(x, ground + size.height + 0.8 + Math.sin(time * 2.6) * 0.25, z);
        friend.arrow.rotation.y = time * 1.1;
        friend.arrow.scale.setScalar(friend.cue);
        const spread = 1 + ((time / 2.2) % 1) * 0.35;
        friend.ripple.position.set(x, ground + 0.08, z);
        friend.ripple.rotation.y = friend.heading;
        friend.ripple.scale.set(
          (size.half + 0.9) * spread * friend.cue,
          1,
          (Math.min(size.front + size.back, 4.6) / 2 + 0.9) * spread * friend.cue,
        );
      }
    }
    rippleMaterial.opacity = 0.7 * (1 - ((time / 2.2) % 1)) ** 1.5;

    // Friends standing still are solid; the ones on the move are for traffic and the train to wait for.
    colliders.length = 0;
    points.length = 0;
    for (const friend of friends) {
      outline(friend);
      const list = friend.mode === 'following' ? points : colliders;
      for (let k = 0; k < friend.used; k++) list.push(friend.circles[k]);
    }
  }

  /** The friend whose body the ray passes closest to, with plenty to spare for small fingers. */
  function pick(ray) {
    let best = null;
    let nearest = Infinity;
    for (const friend of friends) {
      const reach = friend.mode === 'following' ? 45 : TAP_RANGE;
      if (Math.hypot(friend.x - player.x, friend.z - player.z) - friend.size.front > reach) continue;
      const { x, z, heading, size } = friend;
      const sin = Math.sin(heading);
      const cos = Math.cos(heading);
      const y = drivingHeight(x, z) + size.height * 0.45;
      near.set(x - sin * size.front, y, z - cos * size.front);
      far.set(x + sin * size.back, y, z + cos * size.back);
      // How far the ray passes from its body, as a share of how far off a tap may land. When
      // taps could mean one waiting or one already coming along, the one waiting wins.
      const miss =
        (Math.sqrt(ray.distanceSqToSegment(near, far)) / (size.half + 1.4)) * (friend.mode === 'following' ? 1.6 : 1);
      if (miss < 1 && miss < nearest) {
        nearest = miss;
        best = friend;
      }
    }
    return best;
  }

  /** Puts the friends at home in their bays in order. */
  function arrange() {
    const sorted = friends.filter(friend => !friend.apron).sort((a, b) => rank(a) - rank(b));
    sorted.forEach((friend, bay) => {
      friend.bay = bay;
      if (friend.mode === 'home') placeStatue(friend);
    });
  }

  /** Changes what a friend is, or its paint, keeping where it is and what it is doing. */
  function become(friend, vehicle, color) {
    if (friend.vehicle === vehicle && friend.color === color) return;
    friend.vehicle = vehicle;
    friend.color = color;
    friend.size = sizeOf(vehicle);
    friend.statue.geometry = statueOf(vehicle, color);
    if (friend.copy) {
      copies.dress(friend.copy, vehicle, color);
      poseCopy(friend.copy, friend, 0, true);
    }
  }

  return {
    /** Circles round the friends standing still, which the player's car bumps into. */
    colliders,
    /** Points along the friends on the move, for the traffic and the train to stop short of. */
    points,
    update,
    /** A tap on the game: asks a friend along, or lets one stay. */
    tap(ray, state) {
      const friend = pick(ray);
      if (!friend) return;
      if (friend.mode !== 'following') invite(friend);
      // While the player is stopped, a tap lets one stay (though not one that has only just set
      // off); on the move it just honks back.
      else if (Math.abs(state.speed) < 1.5 && time - friend.since > 4) stay(friend);
      else honk(friend, 0.1);
    },
    /** The friends coming along, each as the circles round it, for the ferry to tell which are aboard. */
    outlines: margin => party.map(friend => ({ points: friend.circles.slice(0, friend.used), margin })),
    /**
     * While a ferry takes the player across, the friends on its deck go too: `move` moves a
     * { x, z, heading } the way the ferry moved, `onDeck(x, z)` says what is on its deck and
     * `from` is the dock it has left. They stay in their places until the other side, and the
     * ones left ashore lose whoever they were following and catch up later, as after a jump.
     */
    carry(move, onDeck, from) {
      for (const friend of party) {
        if (!friend.circles.slice(0, friend.used).every(c => onDeck(c.x, c.z))) {
          if (!friend.lost) Object.assign(friend, { lost: true, lostAt: time, retry: 0 });
          Object.assign(friend, { berth: null, leaving: false });
          continue;
        }
        // Aboard, it stays where it is until the other side, even one that was driving off when
        // the player stayed aboard to go back again.
        const { berth } = friend;
        friend.berth = { at: from, across: berth?.across ?? 0, nose: berth?.nose ?? 0, parked: true };
        Object.assign(friend, { leaving: false, speed: 0 });
        friend.follower.speed = 0;
        move(friend);
        if (friend.copy?.trailer.ready) move(friend.copy.trailer);
        moveRoute(friend.route, onDeck, move);
      }
      moveRoute(trail, onDeck, move);
    },
    /**
     * Whether the friends coming along are all ready for the ferry to go: in their places on its
     * deck, or with no room, or nowhere near (lost, to catch up later).
     */
    ready: () => party.every(friend => friend.lost || friend.ashore || friend.berth?.parked),
    /** The keyboard's way to ask along the nearest friend that can come. */
    inviteNearest() {
      let best = null;
      let nearest = NEAR;
      for (const friend of friends) {
        const distance = Math.hypot(friend.x - player.x, friend.z - player.z) - friend.size.front;
        if (friend.mode !== 'following' && distance < nearest) {
          nearest = distance;
          best = friend;
        }
      }
      if (best) invite(best);
    },
    /**
     * How far round the camera should swing to look back past the parked car at the friends
     * waiting behind it, in radians; 0 to stay behind the car. Not at the depot, where the
     * player is busy asking them along.
     */
    lookBack() {
      const first = party[0];
      if (!first || first.lost || !first.away || parked < 3 || Math.abs(first.speed) > 0.3) return 0;
      if (Math.hypot(player.x - DEPOT.x, player.z - DEPOT.z) < 45) return 0;
      return Math.hypot(first.x - player.x, first.z - player.z) < 40 ? LOOK_BACK : 0;
    },
    /** The friends along for the ride honk back, one after the other. */
    hearHorn() {
      party.forEach((friend, i) => {
        if (friend.honkAt === null) honk(friend, 0.55 + i * 0.4);
      });
    },
    /**
     * The player has picked another vehicle or paint in the garage. A friend that was that
     * vehicle becomes the player's old one, as if they had swapped.
     */
    choose(vehicle, color) {
      const previous = { vehicle: playerVehicle, color: playerColor };
      playerVehicle = vehicle;
      playerColor = color;
      player.size = sizeOf(vehicle);
      const chosen = LINEUP.find(entry => fits(entry, vehicle, color));
      const next = friends.map(friend =>
        chosen && fits(chosen, friend.vehicle, friend.color)
          ? { ...previous }
          : { vehicle: friend.vehicle, color: friend.color },
      );
      // The flatbed, put down by the player, goes back to the apron whichever friend was taken
      // in its place: it would not fit a bay.
      const apron = friends.findIndex(friend => friend.apron);
      if (previous.vehicle === APRON && vehicle !== APRON) {
        const swapped = next.findIndex(entry => entry.vehicle === APRON);
        if (swapped >= 0 && swapped !== apron)
          next[swapped] = { vehicle: friends[apron].vehicle, color: friends[apron].color };
        next[apron] = { ...previous };
      }
      const colors = paintAll(next);
      friends.forEach((friend, i) => become(friend, next[i].vehicle, colors[i]));
      arrange();
    },
    /** The friends coming along, with their wheels, for the long grass and the crops they drive through. */
    tramplers: () =>
      party.map(({ x, z, heading, speed, copy }) => ({
        x,
        z,
        y: drivingHeight(x, z),
        heading,
        speed,
        wheels: copy.car.spec.wheels,
      })),
    getState: () =>
      friends.map(friend => ({
        vehicle: friend.vehicle,
        mode: friend.mode,
        bay: friend.bay,
        /** The circles round it that things bump into, a lorry's trailer too. */
        outline: friend.circles.slice(0, friend.used).map(({ x, z, radius }) => ({ x, z, radius })),
        x: friend.x,
        z: friend.z,
        heading: friend.heading,
        speed: friend.speed,
        lost: friend.lost,
        /** On the ferry: its place on the deck, whether it is driving off, or found no room. */
        berth: friend.berth && { ...friend.berth },
        leaving: friend.leaving,
        ashore: friend.ashore,
        height: friend.size.height,
        cue: friend.cue,
      })),
  };
}
