// The object viewer: every vehicle, machine, animal and plant on a stage of its own, and every
// landmark where it stands in the world, to look round in 3D. It marks what the geometry
// checks find (see inspect.js), can draw the obstacles the car bumps into, show faces from
// behind, cut buildings open and put a car beside anything for scale. Each object has its own
// address (viewer.html#airfield.hangar), so it can be pointed at.
import './viewer.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createObstacleIndex } from '../core/collision.js';
import { chassisPose, settleWheels } from '../core/suspension.js';
import { createCar } from '../vehicles/car.js';
import { inspect } from './inspect.js';
import { MODELS } from './models.js';
import { PLACES } from './places.js';

const $ = id => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 4000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

function lights(scene) {
  const ambient = new THREE.HemisphereLight('#eef5ee', '#788567', 1.8);
  const sun = new THREE.DirectionalLight('#fff0cc', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0002;
  scene.add(ambient, sun, sun.target);
  return { ambient, sun };
}

// --- The stage, for things made on their own ------------------------------------------------

const stage = new THREE.Scene();
stage.background = new THREE.Color('#d9e3dd');
const stageLights = lights(stage);
{
  const lawn = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: '#b6c497' }),
  );
  lawn.receiveShadow = true;
  const grid = new THREE.GridHelper(40, 40, '#8e9c7c', '#a3b18c');
  grid.position.y = 0.005;
  stage.add(lawn, grid);
}

// --- The world, built the first time a place is looked at ----------------------------------

let world = null;
async function buildWorld() {
  if (world) return world;
  $('loading').hidden = false;
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 30)));
  const [{ buildScenery }, { buildLandmarks }, terrain, { createPlanes }, { createTrain }, helicopters, build] =
    await Promise.all([
      import('../world/scenery.js'),
      import('../world/landmarks/index.js'),
      import('../world/terrain.js'),
      import('../vehicles/plane.js'),
      import('../vehicles/train.js'),
      import('../vehicles/helicopter.js'),
      import('../world/build.js'),
    ]);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dce5da');
  scene.fog = new THREE.FogExp2('#dce5da', 0.0011);
  const own = lights(scene);
  const scenery = buildScenery(scene);
  const obstacles = [...scenery.obstacles];
  const landmarks = buildLandmarks(scene, obstacles);
  const moving = new THREE.Group();
  moving.name = 'moving';
  scene.add(moving);
  const planes = createPlanes(moving, obstacles);
  const train = createTrain(moving);
  const flying = [helicopters.VALLEY_RESCUE, helicopters.AIR_AMBULANCE].map(spec =>
    helicopters.createHelicopter(moving, spec),
  );
  build.separateMeshKinds(scene);
  const index = createObstacleIndex(obstacles);
  const groups = Object.fromEntries(scene.children.filter(c => c.isGroup && c.name).map(c => [c.name, c]));
  let time = 0;
  world = {
    scene,
    ...own,
    terrain,
    groups,
    index,
    scenery,
    update(dt, target, night, running) {
      if (running || time === 0) {
        time += dt;
        const player = { x: target.x, z: target.z, speed: 0, heading: 0 };
        landmarks.update(running ? dt : 0.016, night, { player });
        planes.update(running ? dt : 0.016, { player });
        train.update(running ? dt : 0.016, { player, towed: [] });
        for (const helicopter of flying) helicopter.update(running ? dt : 0.016);
      }
      scenery.update(dt, camera.position, own.sun, target);
    },
  };
  $('loading').hidden = true;
  return world;
}

// --- The list ---------------------------------------------------------------------------------

const ENTRIES = [
  ...PLACES.map(place => ({ ...place, kind: 'place', group: 'Places' })),
  ...MODELS.map(model => ({ ...model, kind: 'model' })),
];
const problems = new Map();

function renderList() {
  const filter = $('search').value.trim().toLowerCase();
  const groups = new Map();
  for (const entry of ENTRIES) {
    if (filter && !`${entry.name} ${entry.id}`.toLowerCase().includes(filter)) continue;
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }
  $('list').innerHTML = [...groups]
    .map(
      ([group, entries]) =>
        `<h3>${group}</h3>` +
        entries
          .map(entry => {
            const count = problems.get(entry.id);
            return `<button data-id="${entry.id}" aria-current="${entry.id === current?.id}"><span>${entry.name}</span>${count ? `<span class="count">${count}</span>` : ''}</button>`;
          })
          .join(''),
    )
    .join('');
}
$('search').addEventListener('input', renderList);
$('list').addEventListener('click', event => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  location.hash = button.dataset.id;
  document.body.classList.remove('panel-open');
});
$('toggle-panel').addEventListener('click', () => document.body.classList.toggle('panel-open'));

// --- Options ----------------------------------------------------------------------------------

const options = { issues: true, obstacles: false, backfaces: false, wireframe: false, surroundings: true };
Object.assign(options, { moving: false, night: false, cut: 1 });
for (const input of document.querySelectorAll('[data-option]')) {
  input.addEventListener('input', () => {
    options[input.dataset.option] = input.type === 'checkbox' ? input.checked : Number(input.value);
    applyOptions();
  });
}

// --- Selection --------------------------------------------------------------------------------

let current = null;
let subject = null; // what is being looked at: the model, or the landmark's group
let overlays = new THREE.Group();
let found = [];
const target = new THREE.Vector3();

async function select(id) {
  const entry = ENTRIES.find(e => e.id === id) ?? ENTRIES.find(e => e.kind === 'model');
  current = entry;
  renderList();
  overlays.removeFromParent();
  overlays = new THREE.Group();
  if (entry.kind === 'model') {
    for (const model of stage.children.filter(child => child.userData.model)) model.removeFromParent();
    subject = entry.create();
    subject.userData.model = true;
    subject.traverse(child => {
      if (child.isMesh) child.castShadow = child.receiveShadow = true;
    });
    stage.add(subject);
    const box = new THREE.Box3().setFromObject(subject);
    const size = box.getSize(new THREE.Vector3());
    target.set(0, size.y * 0.4, 0);
    frame(Math.max(size.x, size.y, size.z) * 1.7 + 2);
    stage.add(overlays);
  } else {
    const built = await buildWorld();
    subject = built.groups[entry.landmark];
    const ground = built.terrain.terrainHeight(entry.x, entry.z);
    target.set(entry.x, ground + Math.min(entry.radius * 0.25, 6), entry.z);
    frame(entry.radius * 2.4);
    built.scene.add(overlays);
  }
  $('title').textContent = entry.name;
  picked = -1;
  check();
  applyOptions();
}

/** Points the camera at the target from `distance` away, from the front left and a little above. */
function frame(distance, yaw = 2.4, pitch = 0.42) {
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  );
  controls.target.copy(target);
  camera.near = Math.max(0.05, distance / 400);
  camera.updateProjectionMatrix();
  controls.update();
}

/** Runs the checks on what is being looked at; for a place, only within its circle. */
function check() {
  if (current.kind === 'model') {
    found = inspect(subject, { anchored: true });
  } else {
    const { terrain } = world;
    const near = subject.userData.obstacles ?? [];
    found = inspect(subject, {
      ground: (x, z) => Math.max(terrain.drivingHeight(x, z), terrain.waterLevel(x, z)),
      drivable: terrain.drivingHeight,
      obstacles: createObstacleIndex(near),
    }).filter(issue => {
      const middle = issue.box.getCenter(new THREE.Vector3());
      const half = issue.box.getSize(new THREE.Vector3()).length() / 2;
      return Math.hypot(middle.x - current.x, middle.z - current.z) < current.radius + half;
    });
  }
  problems.set(current.id, found.length);
  renderList();
  const triangles = countTriangles(subject);
  $('stats').textContent =
    `${triangles.toLocaleString()} triangles · ${found.length ? `${found.length} problem(s)` : 'no problems found'}`;
  $('issues').innerHTML = found
    .map((issue, i) => `<li data-issue="${i}"><strong>${issue.kind}</strong> ${issue.message}</li>`)
    .join('');
}

// Clicking a problem fills in the parts it is about and swings the view round to it.
let picked = -1;
$('issues').addEventListener('click', event => {
  const item = event.target.closest('[data-issue]');
  if (!item) return;
  picked = Number(item.dataset.issue);
  for (const li of $('issues').children) li.setAttribute('aria-current', String(li === item));
  const issue = found[picked];
  issue.box.getCenter(target);
  frame(Math.max(4, issue.box.getSize(new THREE.Vector3()).length() * 1.8));
  applyOptions();
});
$('title').addEventListener('click', () => $('info').classList.toggle('folded'));

function countTriangles(root) {
  let total = 0;
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const { index, attributes, drawRange } = mesh.geometry;
    const count = Math.min(index ? index.count : attributes.position.count, drawRange.count);
    total += (count / 3) * (mesh.isInstancedMesh ? mesh.count : 1);
  });
  return Math.round(total);
}

// --- Overlays ---------------------------------------------------------------------------------

const PROBLEM = '#ff2d8a';
const problemMaterial = new THREE.MeshBasicMaterial({
  color: PROBLEM,
  transparent: true,
  opacity: 0.45,
  depthTest: false,
  side: THREE.DoubleSide,
});
const backMaterial = new THREE.MeshBasicMaterial({ color: '#ff00c8', side: THREE.BackSide });
const wireMaterials = new Set();

function applyOptions() {
  overlays.clear();
  if (options.issues) {
    for (const [i, issue] of found.entries()) {
      overlays.add(new THREE.Box3Helper(issue.box, PROBLEM));
      if (i !== picked) continue;
      const pieces = issue.parts.map(part => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
        return geometry;
      });
      if (pieces.length) overlays.add(new THREE.Mesh(mergeGeometries(pieces), problemMaterial));
    }
  }
  if (options.backfaces && subject) {
    subject.traverse(mesh => {
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.back) return;
      const back = new THREE.Mesh(mesh.geometry, backMaterial);
      mesh.updateWorldMatrix(true, false);
      back.matrixAutoUpdate = false;
      back.matrix.copy(mesh.matrixWorld);
      back.userData.back = true;
      overlays.add(back);
    });
  }
  if (options.obstacles && current?.kind === 'place') overlays.add(obstacleLines(subject.userData.obstacles ?? []));
  // Wireframe on everything drawn, put back when turned off.
  const scene = current?.kind === 'place' ? world.scene : stage;
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of [mesh.material].flat()) {
      if (!('wireframe' in material) || material === problemMaterial) continue;
      if (options.wireframe) wireMaterials.add(material);
      material.wireframe = options.wireframe && material !== backMaterial;
    }
  });
  if (current?.kind === 'place') {
    for (const [name, group] of Object.entries(world.groups)) {
      group.visible = options.surroundings || group === subject || name === 'moving';
    }
    const scenery = world.scene.getObjectByName('scenery');
    for (const child of scenery.children) child.visible = options.surroundings || child.name === 'ground';
  }
  // The cut: everything above the target by the chosen share of the view's size is left out.
  const reach = camera.position.distanceTo(target);
  cut.constant = options.cut >= 1 ? 1e6 : target.y - reach * 0.4 + options.cut * reach * 0.8;
  renderer.clippingPlanes = options.cut >= 1 ? [] : [cut];
  for (const { sun, ambient } of [stageLights, world ?? stageLights]) {
    sun.intensity = options.night ? 0.25 : 2.4;
    ambient.intensity = options.night ? 0.5 : 1.8;
  }
}

/** Outlines of the obstacles: yellow on the ground, orange where they only stop things below their top, blue up at a level. */
function obstacleLines(obstacles) {
  const { terrainHeight } = world.terrain;
  const points = [];
  const colors = [];
  const tint = new THREE.Color();
  const ring = (cx, cz, radius, from, to, y) => {
    const steps = Math.max(8, Math.round(radius * 4));
    for (let k = 0; k < steps; k++) {
      const a0 = from + ((to - from) * k) / steps;
      const a1 = from + ((to - from) * (k + 1)) / steps;
      for (const a of [a0, a1]) {
        const x = cx + Math.cos(a) * radius;
        const z = cz + Math.sin(a) * radius;
        points.push(x, y ?? terrainHeight(x, z) + 0.15, z);
        colors.push(tint.r, tint.g, tint.b);
      }
    }
  };
  for (const o of obstacles) {
    tint.set(o.top !== undefined ? '#ff8a1f' : o.base !== undefined ? '#2a8cff' : '#ffd21f');
    const y = o.base !== undefined ? o.base + 1.3 : undefined;
    if ('ax' in o) {
      const angle = Math.atan2(o.bz - o.az, o.bx - o.ax);
      ring(o.ax, o.az, o.radius, angle + Math.PI / 2, angle + (Math.PI * 3) / 2, y);
      ring(o.bx, o.bz, o.radius, angle - Math.PI / 2, angle + Math.PI / 2, y);
      for (const side of [-1, 1]) {
        const [dx, dz] = [-Math.sin(angle) * o.radius * side, Math.cos(angle) * o.radius * side];
        for (const [x, z] of [
          [o.ax + dx, o.az + dz],
          [o.bx + dx, o.bz + dz],
        ]) {
          points.push(x, y ?? terrainHeight(x, z) + 0.15, z);
          colors.push(tint.r, tint.g, tint.b);
        }
      }
    } else if ('halfX' in o) {
      // The box's outline, its corners rounded by its radius, worked out in its own frame.
      const [cos, sin] = [Math.cos(o.rotation), Math.sin(o.rotation)];
      const outline = [];
      for (const [sx, sz, start] of [
        [1, 1, 0],
        [-1, 1, Math.PI / 2],
        [-1, -1, Math.PI],
        [1, -1, Math.PI * 1.5],
      ]) {
        for (let k = 0; k <= 6; k++) {
          const a = start + (k / 6) * (Math.PI / 2);
          outline.push([sx * o.halfX + Math.cos(a) * o.radius, sz * o.halfZ + Math.sin(a) * o.radius]);
        }
      }
      outline.forEach((p, i) => {
        for (const [lx, lz] of [p, outline[(i + 1) % outline.length]]) {
          const [x, z] = [o.x + lx * cos + lz * sin, o.z - lx * sin + lz * cos];
          points.push(x, y ?? terrainHeight(x, z) + 0.15, z);
          colors.push(tint.r, tint.g, tint.b);
        }
      });
    } else {
      ring(o.x, o.z, o.radius, 0, Math.PI * 2, y);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
}

// --- A car for scale --------------------------------------------------------------------------

const scaleCar = createCar();
scaleCar.customize('orange', [], 'offroader');
let placing = false;
$('place-car').addEventListener('click', () => {
  placing = !placing;
  $('place-car').setAttribute('aria-pressed', String(placing));
  if (!placing) {
    scaleCar.root.removeFromParent();
    scaleCar.towed.removeFromParent();
  }
});

const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pressed = null;
canvas.addEventListener('pointerdown', event => (pressed = { x: event.clientX, y: event.clientY }));
canvas.addEventListener('pointerup', event => {
  if (!placing || !pressed || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 6) return;
  const box = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  const scene = current.kind === 'place' ? world.scene : stage;
  const hit = ray.intersectObjects(scene.children, true).find(h => h.object.isMesh && !h.object.userData.back);
  if (!hit) return;
  const heading = Math.atan2(camera.position.x - hit.point.x, camera.position.z - hit.point.z) + Math.PI / 2;
  const height = current.kind === 'place' ? world.terrain.drivingHeight : () => 0;
  const pose = chassisPose(hit.point.x, hit.point.z, heading, height);
  scaleCar.root.position.set(hit.point.x, pose.height, hit.point.z);
  scaleCar.root.rotation.set(pose.pitch, heading, pose.roll, 'YXZ');
  settleWheels(scaleCar, height);
  scene.add(scaleCar.root);
});

// --- Drawing ----------------------------------------------------------------------------------

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

const clock = new THREE.Clock();
function draw() {
  requestAnimationFrame(draw);
  const dt = Math.min(clock.getDelta(), 0.05);
  controls.update();
  const place = current?.kind === 'place' && world;
  const scene = place ? world.scene : stage;
  const { sun } = place ? world : stageLights;
  // The sun's shadows cover what is being looked at.
  const reach = Math.max(20, camera.position.distanceTo(controls.target));
  sun.position.set(controls.target.x - reach * 0.6, controls.target.y + reach * 1.2, controls.target.z - reach * 0.4);
  sun.target.position.copy(controls.target);
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: reach * 4 });
  sun.shadow.camera.updateProjectionMatrix();
  if (place) world.update(dt, controls.target, options.night ? 1 : 0, options.moving);
  renderer.render(scene, camera);
}

addEventListener('hashchange', () => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id !== current?.id) select(id);
});
resize();
renderList();
select(decodeURIComponent(location.hash.slice(1)) || MODELS[0].id).then(() => (window.__viewer.ready = true));
draw();

// For scripts that take pictures of everything (scripts/catalogue.mjs).
window.__viewer = {
  ready: false,
  entries: () => ENTRIES.map(({ id, name, group, kind }) => ({ id, name, group, kind })),
  async select(id) {
    await select(id);
    location.hash = id;
    // Let the scenery near the camera fill in and the shadows settle.
    await new Promise(resolve => setTimeout(resolve, 300));
  },
  frame: ({ yaw, pitch, distance, at }) => {
    if (at) target.set(at.x, at.y ?? world.terrain.drivingHeight(at.x, at.z) + (at.lift ?? 0), at.z);
    frame(distance ?? camera.position.distanceTo(target), yaw, pitch);
  },
  problems: () => found.map(({ kind, message }) => ({ kind, message })),
  /** What a line straight down through (x, z) passes through, top first. */
  pick(x, z) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 1000, z), new THREE.Vector3(0, -1, 0));
    const path = object => {
      const names = [];
      for (let o = object; o; o = o.parent) if (o.name) names.unshift(o.name);
      return names.join('/');
    };
    const hits = [];
    (current?.kind === 'place' ? world.scene : stage).traverse(object => {
      // Some meshes keep their geometry only on the graphics card; they can't be picked.
      if (object.isMesh && object.geometry.index?.array !== null) hits.push(...ray.intersectObject(object, false));
    });
    return hits
      .sort((a, b) => a.distance - b.distance)
      .map(hit => ({
        y: Number(hit.point.y.toFixed(3)),
        path: path(hit.object),
        type: hit.object.type,
        material: hit.object.material?.type,
        triangles: (hit.object.geometry.index?.count ?? hit.object.geometry.attributes.position.count) / 3,
      }));
  },
  set: patch => {
    Object.assign(options, patch);
    applyOptions();
  },
};
