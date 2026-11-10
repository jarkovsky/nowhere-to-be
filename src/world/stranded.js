// A traveller stranded in a muddy ditch beside a side track, with its hazard lights blinking,
// and the player's car pulling it out. What happens is worked out in core/rescue.js; this
// builds the traveller, the ditch and the rope, and moves them. Only one is stranded at a time,
// and rarely: the first a few minutes into the drive, the next some minutes after each rescue.
import * as THREE from 'three';
import { createRescue, ditchDepth, pickSpot, stepRescue, towEye, waiting } from '../core/rescue.js';
import { createRandom } from '../core/math.js';
import { createSteering, steer } from '../core/steering.js';
import { chassisPose } from '../core/suspension.js';
import { camperVan, createVehicle, pickup, saloon } from '../vehicles/traffic.js';
import { PartsBuilder } from './build.js';
import { OUTER_ROAD, RING_ROAD, ROAD, STRANDED, STRANDED_SPOTS, TRACKS } from './layout.js';
import { bodyOf, createRope, mudGeometry, wet } from './mudhole.js';
import { createPath } from './path.js';
import { drivingHeight, terrainHeight } from './terrain.js';

/** The vehicles that get stranded, a different one each time round: a camper van, a hatchback and a pickup with a canoe. */
const KINDS = [camperVan, saloon, pickup];
/** How long after the start the first appears, and how long after each rescue the next, in seconds. */
export const FIRST = 180;
export const BETWEEN = [300, 600];
/** Further than this from the player, it isn't drawn. */
const DRAW_DISTANCE = 450;
/** How far it lies below the ground in the ditch and nose-down, with the colour of the hazard lights and the mud. */
const SINK = 0.32;
const NOSE_DOWN = 0.16;
const ORANGE = '#ff9a1f';
const MUD = '#4a3828';
/** Where the rope goes on it, and on the car. */
const EYE_HEIGHT = 0.55;
const HOOK_HEIGHT = 0.55;
/** How fast the hazard lights blink, per second. */
const BLINK = 0.7;
/** The lane the road's traffic drives in, which it joins when it drives off. */
const LANE = 2.3;

/** The way it drives off: along the side track to the nearer end, which is on a road, and on along that road. */
export function routeOff(spot) {
  const { path } = TRACKS.find(track => track.id === spot.track);
  const toStart = spot.s < path.length - spot.s;
  const points = [];
  for (let s = 0; s <= path.length; s += 3) {
    const p = path.at(toStart ? path.length - s : s);
    points.push([p.x, p.z]);
  }
  const end = path.at(toStart ? 0 : path.length);
  points.push([end.x, end.z]);
  // Out onto the nearest road, in its lane, in the direction it was already heading.
  const [back, here] = points.slice(-2);
  const travel = { x: here[0] - back[0], z: here[1] - back[1] };
  const road = [ROAD, RING_ROAD, OUTER_ROAD].reduce((best, r) =>
    r.nearest(end.x, end.z).distance < best.nearest(end.x, end.z).distance ? r : best,
  );
  const near = road.nearest(end.x, end.z);
  const way = Math.sign(travel.x * near.sample.dx + travel.z * near.sample.dz) || 1;
  for (let k = 1; k <= 30; k++) {
    const s = near.s + way * k * 3;
    if (!road.closed && (s < 0 || s > road.length)) break;
    const side = near.side + (way * LANE - near.side) * Math.min(1, k / 5);
    const p = road.offset(s, side);
    points.push([p.x, p.z]);
  }
  return createPath(points);
}

/** The circles round a vehicle's body for collisions, `along` being how far from its middle each stands. Only as big as it is. */
export function circlesOf(x, z, heading, along) {
  return along.map(offset => ({ x: x - Math.sin(heading) * offset, z: z - Math.cos(heading) * offset, radius: 1.05 }));
}

/** The glow round the hazard lights, so that they show from far off: a soft round spot of light. */
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 170, 60, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 140, 30, 0.45)');
  gradient.addColorStop(1, 'rgba(255, 120, 20, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * `onToot` plays the traveller's horn. The car's rope point and size come from `update`'s
 * arguments, as the mud hole's do.
 */
export function createStranded(scene, { onToot, random = createRandom(5151) } = {}) {
  const hazard = new THREE.MeshLambertMaterial({ color: '#c9761a', emissive: ORANGE, emissiveIntensity: 0 });
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      transparent: true,
      opacity: 0,
    }),
  );
  glow.visible = false;
  scene.add(glow);
  const rope = createRope(scene);
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  const kinds = new Map();
  const patches = new Map();
  /** The traveller's vehicle: built the first time it is needed, with its hazard lights and the mud up its wheels. */
  function vehicleOf(index) {
    if (!kinds.has(index)) {
      const model = KINDS[index]();
      const vehicle = createVehicle(model);
      const lights = new PartsBuilder();
      const mud = new PartsBuilder();
      const y = model.lampY ?? 1.0;
      for (const z of [-1, 1]) {
        for (const x of [-0.78, 0.78]) {
          lights.box(0.26, 0.17, 0.07, ORANGE, { x, y: y - 0.02, z: z * (model.length / 2 + 0.02) });
        }
      }
      for (const wheel of vehicle.wheels) {
        const { x, z } = wheel.pivot.position;
        const side = Math.sign(x);
        mud.box(0.5, model.wheelRadius * 0.5, model.wheelRadius * 1.5, MUD, {
          x: x + side * 0.04,
          y: model.wheelRadius * 0.22,
          z,
        });
      }
      vehicle.clods = mud.mesh();
      vehicle.root.add(lights.mesh({ material: hazard }), vehicle.clods);
      kinds.set(index, vehicle);
    }
    return kinds.get(index);
  }

  /** The ditch's mud: a ragged patch of it round the traveller, made the first time it is needed. */
  function patchOf(spot) {
    if (!patches.has(spot.index)) {
      const mesh = new THREE.Mesh(
        mudGeometry({
          x: spot.x,
          z: spot.z,
          radius: 3,
          seed: 60 + spot.index,
          lift: 0.07,
          sides: 56,
          rough: 0.14,
          colors: { water: '#2f2a24' },
        }),
        wet,
      );
      mesh.receiveShadow = true;
      patches.set(spot.index, mesh);
    }
    return patches.get(spot.index);
  }

  const colliders = [];
  const mark = { shown: false, x: 0, z: 0 };
  /** The traveller out now: { spot, rescue, vehicle, patch }. */
  let active = null;
  let last = -1;
  let count = 0;
  let timer = FIRST;
  let clock = 0;
  /** How much of the mud is still on its wheels, 1 to 0: it falls away once it is out of the ditch. */
  let clods = 1;

  function begin(spot) {
    const vehicle = vehicleOf(count++ % KINDS.length);
    const { path } = TRACKS.find(track => track.id === spot.track);
    const rescue = createRescue({
      spot,
      length: vehicle.length,
      lateral: (x, z) => path.nearest(x, z).distance,
      route: () => routeOff(spot),
    });
    const patch = patchOf(spot);
    vehicle.steering.heading = null;
    vehicle.clods.visible = true;
    clods = 1;
    scene.add(vehicle.root, patch);
    active = { spot, rescue, vehicle, patch };
    last = spot.index;
  }

  function end() {
    const { vehicle, patch } = active;
    scene.remove(vehicle.root, patch);
    glow.visible = rope.mesh.visible = false;
    active = null;
    colliders.length = 0;
    timer = BETWEEN[0] + random() * (BETWEEN[1] - BETWEEN[0]);
  }

  /** Where the rope goes on the car: the middle of its back, or the end of its trailer. */
  function hookOf(state, body) {
    const f = { x: -Math.sin(state.heading), z: -Math.cos(state.heading) };
    const { trailer } = body;
    if (trailer) {
      const back = { x: -Math.sin(trailer.heading), z: -Math.cos(trailer.heading) };
      return { x: trailer.x - back.x * trailer.length, z: trailer.z - back.z * trailer.length };
    }
    return { x: state.x - f.x * body.rear, z: state.z - f.z * body.rear };
  }

  function place(dt, player) {
    const { rescue: r, vehicle, spot } = active;
    const distance = Math.hypot(r.x - player.x, r.z - player.z);
    const near = distance < DRAW_DISTANCE;
    vehicle.root.visible = near;
    active.patch.visible = near;
    const depth = ditchDepth(r);
    const pose = chassisPose(r.x, r.z, r.heading, drivingHeight);
    vehicle.root.position.set(r.x, pose.height + 0.06 - SINK * depth, r.z);
    vehicle.root.rotation.set(pose.pitch - NOSE_DOWN * depth, r.heading, pose.roll - 0.06 * depth * spot.side, 'YXZ');
    clods = r.phase === 'leaving' || r.phase === 'out' ? Math.max(0, clods - dt * 0.35) : 1;
    vehicle.clods.visible = clods > 0.02;
    vehicle.clods.scale.y = clods;
    const angle = r.phase === 'leaving' ? steer(vehicle.steering, r.heading, r.speed, dt) : 0;
    for (const wheel of vehicle.wheels) {
      if (wheel.front) wheel.pivot.rotation.y = angle;
      wheel.spin.rotation.x -= (r.speed * dt) / vehicle.radius;
    }
    // Round the body, only as big as it is.
    colliders.length = 0;
    glow.visible = false;
    if (!near) return;
    colliders.push(...circlesOf(r.x, r.z, r.heading, vehicle.along));

    // The hazard lights blink slowly while it waits, and flash twice to say thank you.
    const phase = (clock * BLINK) % 1;
    const slow = THREE.MathUtils.smoothstep(Math.sin(phase * Math.PI * 2), -0.25, 0.4);
    const flash = r.phase === 'out' ? (r.wait % 1 < 0.5 ? 1 : 0) : 0;
    const level = r.phase === 'leaving' ? 0 : r.phase === 'out' ? flash : slow;
    hazard.emissiveIntensity = 0.1 + level * 2.2;
    // A soft glow over them shows from afar.
    if (r.phase !== 'leaving') {
      glow.visible = true;
      glow.position.set(r.x, vehicle.root.position.y + 2.7, r.z);
      glow.scale.setScalar(THREE.MathUtils.clamp(distance * 0.035, 2.5, 16));
      // Close by, the lamps themselves are enough.
      glow.material.opacity = (0.15 + level * 0.65) * THREE.MathUtils.smoothstep(distance, 25, 90);
    }
  }

  function placeRope(player, body) {
    const { rescue: r } = active;
    rope.mesh.visible = r.rope.shown;
    if (!r.rope.shown) return;
    const eye = r.rope.attached ? towEye(r) : r.rope.end;
    const hook = r.rope.hook;
    const hookY = r.rope.attached ? drivingHeight(hook.x, hook.z) + HOOK_HEIGHT : terrainHeight(hook.x, hook.z) + 0.04;
    const eyeY = r.rope.attached ? active.vehicle.root.position.y + EYE_HEIGHT : terrainHeight(eye.x, eye.z) + 0.04;
    // Falling, both ends come down to the ground.
    const k = r.rope.fall;
    from.set(hook.x, hookY + (terrainHeight(hook.x, hook.z) + 0.04 - hookY) * k, hook.z);
    to.set(eye.x, eyeY + (terrainHeight(eye.x, eye.z) + 0.04 - eyeY) * k, eye.z);
    rope.lay(from, to, r.rope.length);
  }

  return {
    /** Circles round the traveller, for collisions. */
    colliders,
    /** The traveller's place for the maps, while it waits in the ditch: { shown, x, z }. */
    mark,
    /** Brings a traveller out at `index` now, whatever the clock says (for the screenshots and the browser tests). */
    force(index) {
      if (active) end();
      begin(STRANDED_SPOTS[index]);
    },
    getState: () =>
      active
        ? {
            phase: active.rescue.phase,
            spot: active.spot.index,
            track: active.spot.track,
            x: active.rescue.x,
            z: active.rescue.z,
            heading: active.rescue.heading,
            speed: active.rescue.speed,
            cap: active.rescue.cap,
            rope: active.rescue.rope.attached,
            taut: +active.rescue.taut.toFixed(2),
            idle: +active.rescue.idle.toFixed(2),
            ropeLength: +active.rescue.rope.length.toFixed(1),
            hook: active.rescue.rope.hook,
            depth: ditchDepth(active.rescue),
            colliders: colliders.length,
            glow: glow.visible ? +glow.material.opacity.toFixed(2) : 0,
          }
        : { phase: 'none', timer },
    /**
     * Moves things on after the car has been driven for the step. `state` is the car's driving
     * state, which it may slow while it pulls; `car` the car (for its size) and `trailer` its
     * trailer's state. `others` are the friends' circles and `busy` is true while something else
     * has hold of the car.
     */
    update(dt, state, car, trailer, { others = [], busy = false } = {}) {
      clock += dt;
      if (!active) {
        mark.shown = false;
        timer -= dt;
        if (timer > 0) return;
        const spot = pickSpot(STRANDED_SPOTS, state, { last, random });
        if (!spot) return;
        begin(spot);
      }
      const body = bodyOf(car, trailer);
      const hook = hookOf(state, body);
      const { rescue: r } = active;
      stepRescue(r, state, hook, dt, { handling: state.handling, others, busy });
      // Pulling, the car is held to a crawl.
      if (r.cap !== null && Math.abs(state.speed) > r.cap) {
        const k = r.cap / Math.abs(state.speed);
        state.speed *= k;
        state.vx *= k;
        state.vz *= k;
      }
      for (const event of r.events) if (event === 'toot') onToot?.();
      if (r.phase === 'gone') {
        end();
        return;
      }
      mark.shown = waiting(r);
      mark.x = r.spot.x;
      mark.z = r.spot.z;
      place(dt, state);
      placeRope(state, body);
    },
  };
}
