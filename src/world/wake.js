// What deep water does round the car as it wades through: a wave pushed up ahead of the
// bumper, two lines of ripples spreading out behind it in a V, and rings of ripples round it
// while it stands or creeps. It bobs and rocks a little on its springs, more the deeper it is.
// Out of the water, it drips for a few seconds and its tyres leave wet marks on the ground. A
// lorry's trailer makes its own wake and rings. All of it is drawn just above the water, or
// the ground.
import * as THREE from 'three';
import { clamp, createRandom, damp, smoothstep } from '../core/math.js';
import { drivingHeight, wadingDepth, waterLevel } from './terrain.js';

const FOAM = '#eef7f3';
const WET = '#3d3a30';

/** Water shallower than this makes no wake at all, and from the deeper of the two it makes the most. */
const SHALLOWS = [0.15, 0.55];
/** How often a streak of foam is left at each back corner, in seconds. */
const STREAK_EVERY = 0.12;
/** How far apart the wet marks are laid. Each reaches back to the one before, so they join up. */
const MARK_EVERY = 0.6;

/**
 * A see-through material whose instances each fade by their own `fade` attribute, from 0
 * (gone) to 1. `opacity` is how strong a fresh one is.
 */
function fadingMaterial(color, opacity, options = {}) {
  const material = new THREE.MeshLambertMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity,
    depthWrite: false,
    ...options,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = fade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  return material;
}

/**
 * A pool of short-lived marks drawn as one instanced mesh. Each has an age and a life, and
 * whatever else `shape(mark, dummy, dt)` needs to move it on, place `dummy` where it is now
 * and return how strong it still is (0 when it has gone).
 */
function createPool(scene, geometry, material, capacity, shape) {
  const fades = new Float32Array(capacity);
  geometry.setAttribute('fade', new THREE.InstancedBufferAttribute(fades, 1));
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);
  const marks = Array.from({ length: capacity }, () => ({ age: 0, life: 0 }));
  const dummy = new THREE.Object3D();
  let cursor = 0;
  let used = 0;
  return {
    add(mark) {
      Object.assign(marks[cursor], { age: 0, ...mark });
      cursor = (cursor + 1) % capacity;
      used = Math.min(capacity, used + 1);
    },
    update(dt) {
      let alive = 0;
      for (let i = 0; i < used; i++) {
        const mark = marks[i];
        mark.age += dt;
        const fade = mark.age < mark.life ? shape(mark, dummy, dt) : 0;
        if (fade <= 0) dummy.scale.setScalar(0);
        else alive++;
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        fades[i] = fade;
      }
      mesh.count = used;
      mesh.visible = alive > 0;
      mesh.instanceMatrix.needsUpdate = true;
      geometry.attributes.fade.needsUpdate = true;
    },
  };
}

/** A flat lozenge one unit long and wide, pointed at both ends, for a streak of foam. */
function streakGeometry() {
  const geometry = new THREE.BufferGeometry();
  const corners = [0, 0, -0.5, -0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 0, 0, 0, 0.5];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The wave ahead of the bumper, one unit wide and deep before it is scaled: a crest a little
 * ahead of the bumper that curls back round the corners, fading out at its front edge.
 */
function bowGeometry() {
  const columns = 10;
  const rows = [
    // [how far ahead, how high, how strong]
    u => [0.35 * u * u, 0.35, 0.6],
    u => [-0.4 + 0.8 * u * u, 1, 0.95],
    u => [-1 + 1.25 * u * u, 0, 0],
  ];
  const corner = (row, j) => {
    const u = (j / columns) * 2 - 1;
    const [ahead, high, strong] = rows[row](u);
    return { position: [u * (1 + 0.25 * u * u), high * (1 - 0.6 * u * u), ahead], alpha: strong * (1 - u * u) ** 0.5 };
  };
  const positions = [];
  const colors = [];
  const color = new THREE.Color(FOAM);
  for (let row = 0; row < rows.length - 1; row++) {
    for (let j = 0; j < columns; j++) {
      const quad = [corner(row, j), corner(row + 1, j), corner(row, j + 1), corner(row + 1, j + 1)];
      for (const k of [0, 2, 1, 2, 3, 1]) {
        positions.push(...quad[k].position);
        colors.push(color.r, color.g, color.b, quad[k].alpha);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  return geometry;
}

const box = new THREE.Box3();
const part = new THREE.Box3();
const toLocal = new THREE.Matrix4();
const point = new THREE.Vector3();

/** How far the visible body of `object` reaches in its own frame: { front, back, halfWidth, bottom }. */
function footprintOf(object) {
  object.updateWorldMatrix(true, true);
  toLocal.copy(object.matrixWorld).invert();
  box.makeEmpty();
  object.traverseVisible(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh) return;
    mesh.geometry.boundingBox ?? mesh.geometry.computeBoundingBox();
    part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld).applyMatrix4(toLocal);
    box.union(part);
  });
  return { front: -box.min.z, back: box.max.z, halfWidth: Math.max(-box.min.x, box.max.x), bottom: box.min.y };
}

export function createWake(scene) {
  const random = createRandom(913);

  const bow = new THREE.Mesh(
    bowGeometry(),
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      emissive: FOAM,
      emissiveIntensity: 0.2,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  bow.renderOrder = 2;
  bow.visible = false;
  scene.add(bow);

  // The V: short streaks of foam left behind at the back corners, drifting outwards as they fade.
  const streaks = createPool(scene, streakGeometry(), fadingMaterial(FOAM, 0.34), 160, (mark, dummy, dt) => {
    mark.x += mark.vx * dt;
    mark.z += mark.vz * dt;
    const t = mark.age / mark.life;
    dummy.position.set(mark.x, mark.y, mark.z);
    dummy.rotation.set(0, mark.heading, 0);
    dummy.scale.set(mark.width * (1 + t * 1.5), 1, mark.length * (1 + t));
    return mark.strength * (1 - t) ** 1.6;
  });

  // Rings of ripples, shaped like the car and growing outwards from it.
  const rings = createPool(
    scene,
    new THREE.RingGeometry(0.96, 1, 36).rotateX(-Math.PI / 2),
    fadingMaterial(FOAM, 0.3),
    24,
    (mark, dummy) => {
      const t = mark.age / mark.life;
      const grow = 2.6 * Math.sqrt(t);
      dummy.position.set(mark.x, mark.y, mark.z);
      dummy.rotation.set(0, mark.heading, 0);
      dummy.scale.set(mark.halfWidth + grow, 1, mark.halfLength + grow);
      return mark.strength * (1 - t) * Math.min(1, t * 6);
    },
  );

  // Drops falling from under the body once it is out of the water.
  const drops = createPool(
    scene,
    new THREE.IcosahedronGeometry(0.045, 0),
    fadingMaterial('#d4f2f2', 0.9),
    48,
    (mark, dummy, dt) => {
      mark.vy -= 9 * dt;
      mark.y += mark.vy * dt;
      dummy.position.set(mark.x, mark.y, mark.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1.7, 1);
      return mark.y > mark.ground ? 1 : 0;
    },
  );

  // Wet marks from the tyres for a little way out of the water, drying as they fade.
  const marks = createPool(
    scene,
    new THREE.PlaneGeometry(0.36, 1).rotateX(-Math.PI / 2),
    fadingMaterial(WET, 0.26, { emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -4 }),
    160,
    (mark, dummy) => {
      dummy.position.set(mark.x, mark.y, mark.z);
      dummy.rotation.set(mark.pitch, mark.heading, 0, 'YXZ');
      dummy.scale.set(1, 1, mark.length);
      return mark.strength * (1 - mark.age / mark.life);
    },
  );

  const float = { lift: 0, pitch: 0, roll: 0 };
  const hulls = new Map();
  let time = 0;
  let depth = 0;
  let wetness = 0;
  let lastStreak = 0;
  let lastDrop = 0;
  let lastMark = null;
  const lastRing = new Map();

  /** The footprint of whatever `object` is showing now, measured again whenever `key` changes. */
  function hull(object, key) {
    if (hulls.get(object)?.key !== key) hulls.set(object, { key, ...footprintOf(object) });
    return hulls.get(object);
  }

  /** A point `side` metres to the right of the middle and `along` metres back from it, facing `heading`. */
  const behind = (x, z, heading, side, along) => ({
    x: x + Math.cos(heading) * side + Math.sin(heading) * along,
    z: z - Math.sin(heading) * side + Math.cos(heading) * along,
  });

  /** Streaks from the back corners (when `streaking`) and rings, for anything in the water. */
  function stir(key, x, z, heading, speed, streaking, { back, halfWidth, halfLength, middle = 0 }) {
    const level = waterLevel(x, z);
    const strength = smoothstep(wadingDepth(x, z), ...SHALLOWS);
    if (strength <= 0) return;
    const moving = smoothstep(Math.abs(speed), 0.4, 2.5);
    const direction = Math.sign(speed || 1);
    if (moving > 0 && streaking) {
      for (const side of [-1, 1]) {
        // Off the corner at the back (the front, when reversing). They drift out so that the line
        // of them opens at about the angle a boat's wake does, each one turned out a little more.
        const p = behind(x, z, heading, side * halfWidth * 0.92, direction * back + (random() - 0.5) * 0.3);
        const out = 0.28 * Math.abs(speed) + 0.05;
        streaks.add({
          x: p.x,
          y: level + 0.03,
          z: p.z,
          vx: Math.cos(heading) * side * out,
          vz: -Math.sin(heading) * side * out,
          heading: heading + side * direction * (0.6 + (random() - 0.5) * 0.2),
          width: 0.22,
          length: 0.6 + Math.abs(speed) * 0.08,
          life: 2 + random() * 0.6,
          strength: strength * moving,
        });
      }
    }
    // Rings spread from a car standing or creeping in the water; once it is under way the V takes over.
    if (time - (lastRing.get(key) ?? -Infinity) > 0.9) {
      lastRing.set(key, time);
      const p = behind(x, z, heading, 0, middle);
      rings.add({
        x: p.x,
        y: level + 0.02,
        z: p.z,
        heading,
        halfWidth: halfWidth + 0.25,
        halfLength: halfLength + 0.25,
        life: 2.6,
        strength: strength * (1 - 0.75 * moving),
      });
    }
  }

  return {
    /** How the body sits on its springs in the water: added to its height, pitch and roll. */
    float,
    /**
     * `car` is the car's state, `model` the car (its root, body, wheels and any trailer) and
     * `trailer` the trailer's state when there is one.
     */
    update(dt, car, model, trailer) {
      time += dt;
      const { x, z, heading, speed } = car;
      const here = wadingDepth(x, z);
      depth = damp(depth, here, 4, dt);

      // Afloat: the body rides up on its springs a little and rocks gently.
      const afloat = smoothstep(depth, 0.3, 0.75);
      float.lift = afloat * (0.04 + 0.025 * Math.sin(time * 1.9) + 0.01 * Math.sin(time * 3.3 + 1));
      float.roll = afloat * 0.02 * Math.sin(time * 1.4 + 0.5);
      float.pitch = afloat * 0.012 * Math.sin(time * 1.1 + 2);

      const body = hull(model.body, model.spec);
      const halfLength = (body.front + body.back) / 2;
      const middle = (body.back - body.front) / 2;
      // The bumper that leads: the back one when reversing.
      const front = behind(x, z, heading, 0, speed < 0 ? body.back : -body.front);
      const ahead = smoothstep(wadingDepth(front.x, front.z), ...SHALLOWS) * smoothstep(Math.abs(speed), 0.4, 3);
      bow.visible = ahead > 0.01;
      if (bow.visible) {
        const pace = clamp(Math.abs(speed) / 6, 0, 1);
        const swell = 1 + Math.sin(time * 8) * 0.08;
        bow.position.set(front.x, waterLevel(front.x, front.z) + 0.02, front.z);
        bow.rotation.set(0, heading + (speed < 0 ? Math.PI : 0), 0);
        bow.scale.set(body.halfWidth * 1.08, (0.08 + 0.2 * pace) * ahead * swell, 0.6 + 1.1 * pace);
        bow.material.opacity = 0.35 + 0.5 * ahead;
      }

      const streaking = time - lastStreak > STREAK_EVERY;
      if (streaking) lastStreak = time;
      stir('car', x, z, heading, speed, streaking, { back: body.back, halfWidth: body.halfWidth, halfLength, middle });
      if (model.trailer && trailer) {
        // The trailer hangs from its hitch: its middle is some way back from it.
        const box = hull(model.trailer.root, model.spec);
        const length = (box.front + box.back) / 2;
        const p = behind(trailer.x, trailer.z, trailer.heading, 0, (box.back - box.front) / 2);
        stir('trailer', p.x, p.z, trailer.heading, speed, streaking, {
          back: length,
          halfWidth: box.halfWidth,
          halfLength: length,
        });
      }

      // Dripping for a few seconds after coming out, and leaving wet marks.
      if (here > 0.3) wetness = 1;
      else if (here < 0.05) wetness = Math.max(0, wetness - dt / 5);
      if (wetness > 0 && here < 0.05) {
        if (time - lastDrop > 0.06 / wetness) {
          lastDrop = time;
          const p = behind(
            x,
            z,
            heading,
            (random() * 2 - 1) * body.halfWidth,
            -body.front + random() * (body.front + body.back),
          );
          model.root.updateWorldMatrix(false, false);
          point.set(0, body.bottom + 0.15, 0).applyMatrix4(model.root.matrixWorld);
          drops.add({ x: p.x, y: point.y, z: p.z, vy: 0, ground: drivingHeight(p.x, p.z), life: 1.2 });
        }
        const step = lastMark ? Math.hypot(x - lastMark.x, z - lastMark.z) : Infinity;
        if (Math.abs(speed) > 0.5 && step > MARK_EVERY) {
          lastMark = { x, z };
          // Back from each wheel to where the last marks were, or a short one to start with.
          const length = step < 2 ? step : MARK_EVERY;
          const back = Math.sign(speed) * (length / 2);
          for (const wheel of model.wheels) {
            if (wheel.front) continue;
            wheel.pivot.getWorldPosition(point);
            const p = { x: point.x + Math.sin(heading) * back, z: point.z + Math.cos(heading) * back };
            // Tilted to lie along the slope, so neither end sinks into the ground.
            const rise =
              drivingHeight(p.x + Math.sin(heading) * back, p.z + Math.cos(heading) * back) -
              drivingHeight(point.x, point.z);
            marks.add({
              ...p,
              y: drivingHeight(p.x, p.z) + 0.07,
              heading,
              pitch: -Math.atan(rise / (2 * back)),
              length: length + 0.02,
              life: 9,
              strength: wetness,
            });
          }
        }
      }

      streaks.update(dt);
      rings.update(dt);
      drops.update(dt);
      marks.update(dt);
    },
  };
}
