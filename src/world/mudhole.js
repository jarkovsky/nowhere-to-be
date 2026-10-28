// The mud hole below the farm, where the lane runs out into the meadow, and the farm's red
// tractor that comes to pull cars out of it. What happens is worked out in core/tow.js; this
// builds the hole, the tractor and the rope, and moves them.
import * as THREE from 'three';
import { penetration } from '../core/collision.js';
import { createRandom, valueNoise } from '../core/math.js';
import { createSteering, steer } from '../core/steering.js';
import { chassisPose } from '../core/suspension.js';
import { HITCH, ROPE, createTow, helping, isTowed, stepTow } from '../core/tow.js';
import { vehicleParts } from '../vehicles/car.js';
import { PartsBuilder, flatMaterial } from './build.js';
import { FARM, MUD_HOLE, ROAD, ROAD_HALF_WIDTH, TRACKS } from './layout.js';
import { drivingHeight, isDriveable, terrainHeight } from './terrain.js';

const PAINT = '#c23f2c';
const RUBBER = '#2c302e';
/** Where the tractor keeps away from, in the farm's own frame: the buildings and the bales, and the wheat field (see farm.js). */
const FARMYARD = [
  { x0: -14, x1: 20, z0: -14, z1: 6.5 },
  { x0: 4.5, x1: 27.5, z0: 7.5, z1: 28.5 },
];
/** How high the hitch is, and the rope where it goes on the car. */
const HITCH_HEIGHT = 0.8;
const TOW_HEIGHT = 0.55;
/** Pieces the rope is drawn in. */
const ROPE_PIECES = 16;
const PUFFS = 6;
const BUBBLES = 3;

/** A point in the farm's own frame, from the world. */
function inFarm(x, z) {
  const dx = x - FARM.x;
  const dz = z - FARM.z;
  const cos = Math.cos(FARM.rotation);
  const sin = Math.sin(FARM.rotation);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

/**
 * A patch of wet mud lying on the ground: dark mud with a ragged edge, smooth so that it
 * shines softly, with lumps on it that catch the light and water lying in the hollows.
 * `seed` picks the pattern, `lift` how far it lies above the ground.
 */
export function mudGeometry({ x: cx, z: cz, radius, seed = 43, lift = 0.08, colors: palette = {} }) {
  const RINGS = 7;
  const SIDES = 30;
  const positions = [cx, terrainHeight(cx, cz) + lift, cz];
  const colors = [];
  const color = new THREE.Color();
  const { mud = '#3f2f22', dark: deep = '#2a2019', churned: trodden = '#5a4431' } = palette;
  const water = new THREE.Color('#6d7773');
  const dark = new THREE.Color(deep);
  const churned = new THREE.Color(trodden);
  const tint = (x, z, out) => {
    const hollow = valueNoise(x / 1.6, z / 1.6, seed);
    color.set(mud).lerp(dark, 0.6 * (1 - out));
    if (hollow < 0.38 && out < 0.85) color.lerp(water, (0.38 - hollow) * 3.5);
    return color.lerp(churned, Math.max(0, out - 0.75) * 3).toArray();
  };
  colors.push(...tint(cx, cz, 0));
  for (let ring = 1; ring <= RINGS; ring++) {
    for (let side = 0; side < SIDES; side++) {
      const a = (side / SIDES) * Math.PI * 2;
      const edge = 0.82 + valueNoise(Math.cos(a) * 1.7 + 3, Math.sin(a) * 1.7, seed - 2) * 0.3;
      const out = ring / RINGS;
      const x = cx + Math.cos(a) * radius * out * edge;
      const z = cz + Math.sin(a) * radius * out * edge;
      // Lumps of mud stand up out of the wet, and water lies in the hollows between them.
      const lump = ring < RINGS ? Math.max(0, valueNoise(x / 1.6, z / 1.6, seed) - 0.38) * 0.12 : 0;
      positions.push(x, terrainHeight(x, z) + lift + lump, z);
      colors.push(...tint(x, z, out));
    }
  }
  const index = [];
  const at = (ring, side) => (ring === 0 ? 0 : 1 + (ring - 1) * SIDES + (side % SIDES));
  for (let ring = 0; ring < RINGS; ring++) {
    for (let side = 0; side < SIDES; side++) {
      if (ring === 0) {
        index.push(0, at(1, side + 1), at(1, side));
        continue;
      }
      const [a, b, c, d] = [at(ring, side), at(ring + 1, side), at(ring + 1, side + 1), at(ring, side + 1)];
      index.push(a, c, b, a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Wet mud: smooth, and drawn over the ground it lies on. */
export const wet = new THREE.MeshLambertMaterial({
  vertexColors: true,
  polygonOffset: true,
  polygonOffsetFactor: -6,
  polygonOffsetUnits: -6,
});

/** The lane's two ruts carrying on through the mud with water in them, and mud thrown out over the grass. */
function splashGeometry() {
  const random = createRandom(733);
  const { x: cx, z: cz, radius } = MUD_HOLE;
  const { path } = TRACKS.find(track => track.id === 'lane');
  const lane = path.at(path.length);
  const parts = new PartsBuilder();
  for (const offset of [-0.85, 0.85]) {
    for (let k = 0, s = -radius * 0.9; s < radius + 2.6; k++, s += 0.6) {
      // Out on the grass they break up into the last muddy tyre prints.
      const out = s > radius * 0.9;
      if (out && k % 2) continue;
      const along = (t, across) => ({
        x: cx + lane.dx * t - lane.dz * (offset + across),
        z: cz + lane.dz * t + lane.dx * (offset + across),
      });
      const width = out ? 0.16 : 0.22;
      const quad = [along(s, -width), along(s, width), along(s + 0.6, width), along(s + 0.6, -width)];
      const lift = quad.map(p => terrainHeight(p.x, p.z) + 0.13);
      const triangles = [0, 1, 2, 0, 2, 3].flatMap(k => [quad[k].x, lift[k], quad[k].z]);
      const rut = new THREE.BufferGeometry();
      rut.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
      rut.computeVertexNormals();
      parts.add(rut, s + 0.3 < radius * 0.8 ? '#4d524f' : '#4a3828');
    }
  }
  // Splashes thrown out from the middle, drawn out the way they flew.
  for (let i = 0; i < 20; i++) {
    const a = random() * Math.PI * 2;
    const r = radius * (1 + random() * 0.45);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    parts.add(new THREE.CircleGeometry(0.1 + random() * 0.22, 6), random() < 0.5 ? '#3f3022' : '#54402d', {
      x,
      y: terrainHeight(x, z) + 0.11,
      z,
      rx: -Math.PI / 2,
      ry: -a,
      sx: 1.2 + random() * 0.7,
    });
  }
  return parts.geometry();
}

/** The tractor's wheels on one axle, which turn together, or one wheel on its own. */
function axle(wheels) {
  const parts = new PartsBuilder();
  for (const { x, radius, width = 0.4 } of wheels) {
    parts.add(new THREE.CylinderGeometry(radius, radius, width, 12), RUBBER, { x, rz: Math.PI / 2 });
    parts.add(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 10), '#e8e2d2', {
      x,
      rz: Math.PI / 2,
    });
    // Tread blocks, so the turning shows.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      parts.box(width + 0.04, 0.1, 0.16, RUBBER, {
        x,
        y: Math.cos(a) * radius,
        z: Math.sin(a) * radius,
        rx: a,
      });
    }
  }
  const mesh = parts.mesh();
  mesh.position.set(0, wheels[0].radius + 0.06, wheels[0].z);
  return { mesh, radius: wheels[0].radius };
}

/** The farm's tractor: the garage's tractor in red, with a drawbar for the rope behind. */
export function buildTractor() {
  const { painted, trim, spec } = vehicleParts('tractor');
  trim.box(0.2, 0.15, 1.18, '#6b706b', { y: HITCH_HEIGHT - 0.05, z: HITCH - 0.51 }); // drawbar, its end in the hook
  trim.box(0.34, 0.2, 0.2, '#3a3f3a', { y: HITCH_HEIGHT, z: HITCH }); // the hook
  const root = new THREE.Group();
  root.add(painted.mesh({ material: flatMaterial(PAINT) }), trim.mesh());
  const axles = [];
  const steered = [];
  for (const z of new Set(spec.wheels.map(wheel => wheel.z))) {
    const wheels = spec.wheels.filter(wheel => wheel.z === z);
    if (z > 0) {
      const pair = axle(wheels);
      root.add(pair.mesh);
      axles.push(pair);
      continue;
    }
    // The front wheels steer, so each turns on a pivot of its own.
    for (const wheel of wheels) {
      const one = axle([{ ...wheel, x: 0 }]);
      const pivot = new THREE.Group();
      pivot.position.set(wheel.x, one.mesh.position.y, z);
      one.mesh.position.set(0, 0, 0);
      pivot.add(one.mesh);
      root.add(pivot);
      axles.push(one);
      steered.push(pivot);
    }
  }
  const along = spec.wheels.map(wheel => wheel.z);
  const steering = createSteering(Math.max(...along) - Math.min(...along));
  return { root, axles, steered, steering, exhaust: new THREE.Vector3(0.28, 2.95, -1.35) };
}

/**
 * `obstacles` is the index of things the car bumps into, which the tractor drives round too.
 * `onToot` plays the tractor's horn.
 */
export function createMudHole(scene, { obstacles, onToot }) {
  const tow = createTow({
    hole: MUD_HOLE,
    home: MUD_HOLE.tractor,
    clear(x, z) {
      const p = inFarm(x, z);
      if (FARMYARD.some(r => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1)) return false;
      // It keeps off the trail, out of the traffic's way.
      if (ROAD.isNear(x, z, ROAD_HALF_WIDTH + 3.5)) return false;
      for (const obstacle of obstacles.near(x, z, 2)) if (penetration(x, z, 1.6, obstacle)) return false;
      return isDriveable(x, z);
    },
  });

  for (const geometry of [mudGeometry(MUD_HOLE), splashGeometry()]) {
    const mesh = new THREE.Mesh(geometry, wet);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Now and then a bubble swells on the mud and pops.
  const bubbles = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: '#4a3a2c', flatShading: true }),
    BUBBLES,
  );
  // Culled round the hole: worked out from where the bubbles first stand, it would stay there.
  bubbles.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(MUD_HOLE.x, terrainHeight(MUD_HOLE.x, MUD_HOLE.z), MUD_HOLE.z),
    MUD_HOLE.radius,
  );
  const bubbleRandom = createRandom(91);
  const bubbleSpots = Array.from({ length: BUBBLES }, () => ({ t: bubbleRandom() * 4, x: MUD_HOLE.x, z: MUD_HOLE.z }));
  scene.add(bubbles);

  const tractor = buildTractor();
  scene.add(tractor.root);

  const rope = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.13, 0.13, 1),
    new THREE.MeshLambertMaterial({ color: '#f2b233' }),
    ROPE_PIECES,
  );
  rope.castShadow = true;
  rope.frustumCulled = false;
  rope.visible = false;
  scene.add(rope);

  const puffs = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.22, 0),
    new THREE.MeshLambertMaterial({ color: '#9a9d98', flatShading: true, transparent: true, opacity: 0.7 }),
    PUFFS,
  );
  puffs.frustumCulled = false;
  const puffList = Array.from({ length: PUFFS }, () => ({ life: 0, x: 0, y: 0, z: 0, size: 1 }));
  scene.add(puffs);

  const dummy = new THREE.Object3D();
  const point = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const knot = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const colliders = [];
  let time = 0;
  let nextPuff = 0;
  let puffCursor = 0;

  function placeTractor(dt) {
    const { x, z, heading, speed } = tow.tractor;
    const pose = chassisPose(x, z, heading, terrainHeight);
    tractor.root.position.set(x, pose.height, z);
    tractor.root.rotation.set(pose.pitch, heading, pose.roll, 'YXZ');
    const angle = steer(tractor.steering, heading, speed, dt);
    for (const pivot of tractor.steered) pivot.rotation.y = angle;
    tractor.root.updateMatrixWorld();
    for (const pair of tractor.axles) pair.mesh.rotation.x -= (speed * dt) / pair.radius;
    colliders.length = 0;
    for (const [behind, radius] of [
      [-1.1, 1.25],
      [1.1, 1.3],
    ]) {
      colliders.push({ x: x + Math.sin(heading) * behind, z: z + Math.cos(heading) * behind, radius });
    }
  }

  function puff(size) {
    const p = puffList[puffCursor++ % PUFFS];
    tractor.root.localToWorld(point.copy(tractor.exhaust));
    Object.assign(p, { life: 1, x: point.x, y: point.y, z: point.z, size });
  }

  function updatePuffs(dt) {
    puffList.forEach((p, i) => {
      p.life = Math.max(0, p.life - dt * 0.9);
      p.y += dt * 1.1;
      p.x += dt * 0.3;
      const t = 1 - p.life;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(t * 2, i, 0);
      dummy.scale.setScalar(p.life > 0 ? p.size * (0.6 + t * 1.6) * Math.min(1, p.life * 3) : 0);
      dummy.updateMatrix();
      puffs.setMatrixAt(i, dummy.matrix);
    });
    puffs.instanceMatrix.needsUpdate = true;
    // Not drawn at all while there are none.
    puffs.visible = puffList.some(p => p.life > 0);
  }

  function updateBubbles(dt) {
    bubbleSpots.forEach((b, i) => {
      b.t += dt;
      if (b.t > 4) {
        const a = bubbleRandom() * Math.PI * 2;
        const r = Math.sqrt(bubbleRandom()) * MUD_HOLE.radius * 0.6;
        Object.assign(b, { t: bubbleRandom() * -2, x: MUD_HOLE.x + Math.cos(a) * r, z: MUD_HOLE.z + Math.sin(a) * r });
      }
      const grow = b.t > 0 ? Math.min(1, b.t / 1.6) : 0;
      dummy.position.set(b.x, terrainHeight(b.x, b.z) + 0.08, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(grow, grow * 0.7, grow);
      if (b.t > 1.8) dummy.scale.setScalar(0);
      dummy.updateMatrix();
      bubbles.setMatrixAt(i, dummy.matrix);
    });
    bubbles.instanceMatrix.needsUpdate = true;
  }

  /** The rope from the hitch to the car, sagging between them, or lying on the ground behind the tractor once it is off. */
  function updateRope() {
    const { shown, attached, thrown, end } = tow.rope;
    rope.visible = shown;
    if (!shown) return;
    tractor.root.localToWorld(from.set(0, HITCH_HEIGHT, HITCH));
    const ground = terrainHeight(end.x, end.z) + 0.04;
    to.set(end.x, attached ? drivingHeight(end.x, end.z) - tow.sink + TOW_HEIGHT : ground, end.z);
    // While it is being thrown, the end flies out from the hitch to the car.
    if (attached && thrown < 1) to.lerpVectors(from, to, thrown).setY(to.y + Math.sin(thrown * Math.PI) * 1.2);
    const span = from.distanceTo(to);
    const sag = span < ROPE ? Math.sqrt((3 * span * (ROPE - span)) / 8) : 0.03;
    for (let i = 0; i <= ROPE_PIECES; i++) {
      const t = i / ROPE_PIECES;
      knot.lerpVectors(from, to, t);
      knot.y = Math.max(knot.y - sag * 4 * t * (1 - t), terrainHeight(knot.x, knot.z) + 0.04);
      if (i > 0) {
        dummy.position.lerpVectors(previous, knot, 0.5);
        dummy.scale.set(1, 1, previous.distanceTo(knot) + 0.02);
        dummy.lookAt(knot);
        dummy.updateMatrix();
        rope.setMatrixAt(i - 1, dummy.matrix);
      }
      previous.copy(knot);
    }
    rope.instanceMatrix.needsUpdate = true;
  }

  placeTractor(0);
  updatePuffs(0);
  updateBubbles(0);

  return {
    /** Circles round the tractor, for collisions. */
    colliders,
    /** How much faster than the car its wheels are turning, as metres a second at the tyre. */
    get slip() {
      return tow.slip;
    },
    /** How far the car has sunk into the mud. */
    get sink() {
      return tow.sink;
    },
    /** True while the car is on the rope, when the controls do nothing. */
    holding: () => isTowed(tow),
    /** True from when the car bogs down in the hole until the tractor lets it go. */
    gripping: () => tow.phase !== 'free',
    /** Where the tractor is while it is out to help, for the camera to keep in view. */
    watch: () => helping(tow),
    getState: () => ({
      phase: tow.phase,
      stuck: tow.stuck,
      tractor: { mode: tow.tractor.mode, x: tow.tractor.x, z: tow.tractor.z, heading: tow.tractor.heading },
      rope: tow.rope.shown,
      sink: tow.sink,
      slip: tow.slip,
    }),
    /**
     * Moves the tow on after the car has been driven for the step. `state` is the car's driving
     * state, which it may change; `car` the car (for its size) and `trailer` its trailer's state.
     */
    update(dt, state, input, car, trailer) {
      time += dt;
      const near = Math.hypot(state.x - MUD_HOLE.x, state.z - MUD_HOLE.z) < 300;
      tractor.root.visible = bubbles.visible = near;
      if (!near) puffs.visible = false;
      const body = bodyOf(car, trailer);
      stepTow(tow, state, input, dt, body);
      // Pulled out backwards, the trailer goes where the rope takes it.
      if (body.trailer) Object.assign(trailer, { x: body.trailer.x, z: body.trailer.z, heading: body.trailer.heading });
      for (const event of tow.events) {
        if (event !== 'toot') continue;
        onToot?.();
        puff(2.2);
      }
      if (!near) {
        tractor.steering.heading = null;
        return;
      }
      placeTractor(dt);
      // Puffs from the exhaust while it works.
      const working = tow.tractor.mode !== 'home' && tow.tractor.speed > 0.2;
      if (working && time > nextPuff) {
        nextPuff = time + (tow.tractor.mode === 'pull' ? 0.22 : 0.4);
        puff(tow.tractor.mode === 'pull' ? 1.4 : 1);
      }
      updatePuffs(dt);
      updateBubbles(dt);
      updateRope();
    },
  };
}

/** The car's size for the tow: how far its front and back are from its middle, and its trailer. */
function bodyOf(car, trailer) {
  const { spec } = car;
  const front = -(spec.headlamps?.z ?? -2.1) + 0.05;
  const rear = (spec.brakeLights?.z ?? 2) + 0.05;
  if (!car.trailer) return { front, rear, back: rear, trailer: null };
  const towed = car.trailer.spec;
  const length = Math.max(...towed.lamps.map(lamp => lamp[2])) + 0.1;
  return {
    front,
    rear,
    back: towed.hitch[2] + length,
    hitch: towed.hitch[2],
    trailer: { x: trailer.x, z: trailer.z, heading: trailer.heading, length },
  };
}
