import * as THREE from 'three';
import { createFixedStep } from './core/clock.js';
import { angleDelta, clamp, damp, lerp } from './core/math.js';
import { createAudio } from './core/audio.js';
import { createChaseCamera } from './core/camera.js';
import { createObstacleIndex } from './core/collision.js';
import { stepDirt } from './core/dirt.js';
import { bodyOf, createCarState, placeCar, steerAngle, stepDriving } from './core/driving.js';
import { createJournal } from './core/journal.js';
import { chassisPose, layoutOf, settleWheels } from './core/suspension.js';
import { createTrailerState, hangTrailer, swingOf } from './core/trailer.js';
import { createControls } from './input/controls.js';
import { createLook } from './input/look.js';
import { createTap } from './input/tap.js';
import { createTiltSteering } from './input/tilt.js';
import { createMapView } from './ui/map.js';
import { createMapPicture } from './ui/mapart.js';
import { createMinimap } from './ui/minimap.js';
import { createVehiclePictures } from './ui/pictures.js';
import { createUI } from './ui/ui.js';
import { createCar } from './vehicles/car.js';
import { createFriends } from './vehicles/friends.js';
import { OUTER, RING, createTraffic } from './vehicles/traffic.js';
import { createTrain } from './vehicles/train.js';
import { AIR_AMBULANCE, VALLEY_RESCUE, createHelicopter } from './vehicles/helicopter.js';
import { createPlanes } from './vehicles/plane.js';
import { createAtmosphere } from './world/atmosphere.js';
import { separateMeshKinds } from './world/build.js';
import { buildLandmarks, insideTunnel } from './world/landmarks/index.js';
import { OUTLINE, createFerry } from './world/ferry.js';
import { createMudHole } from './world/mudhole.js';
import {
  CAMP,
  CAMP_TRAIL,
  DEPOT,
  ROAD,
  ROAD_HALF_WIDTH,
  SPAWN,
  TRACKS,
  GRAVEL_HALF_WIDTH,
  onAirfield,
  onPaved,
  onDriveway,
  onForecourt,
  onGravel,
  rockiness,
  surfaceAt,
} from './world/layout.js';
import { SHADOW_LAYER } from './world/scatter.js';
import { buildScenery } from './world/scenery.js';
import { createSecrets } from './world/secrets.js';
import { createSurfaces } from './world/surfaces.js';
import { updateTrample } from './world/trample.js';
import {
  drivingHeight,
  isDriveable,
  onDeck,
  onFin,
  snowCover,
  terrainHeight,
  wadingDepth,
  waterDepth,
  waterLevel,
} from './world/terrain.js';
import { createWake } from './world/wake.js';
import { createWildlife } from './world/wildlife.js';

const MAX_PIXEL_RATIO = 1.5;
// Development builds can measure raw rendering cost with ?uncapped (no frame cap, fixed resolution).
const UNCAPPED = import.meta.env.DEV && new URLSearchParams(location.search).has('uncapped');
/** How long each step of the driving is: one frame at the 60 a second the game is drawn at. */
const STEP = 1 / 60;

function readStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // Private browsing: progress lasts for the visit.
  }
}

/** What the tyres are on, for grip and top speed. */
function surfaceUnder(x, z) {
  if (onDeck(x, z)) return 'road';
  if (waterDepth(x, z) > 0.15) return 'water';
  const patch = surfaceAt(x, z);
  if (patch === 'snow' || patch === 'leaves' || patch === 'mud') return patch;
  if (snowCover(x, z) > 0.5) return 'snow';
  if (ROAD.isNear(x, z, ROAD_HALF_WIDTH + 0.6) || CAMP_TRAIL.isNear(x, z, 2.6)) return 'road';
  if (onPaved(x, z, ROAD_HALF_WIDTH + 0.6) || onAirfield(x, z)) return 'road';
  if (onDriveway(x, z, 0.4) || onForecourt(x, z)) return 'road';
  if (onGravel(x, z, GRAVEL_HALF_WIDTH + 0.4)) return 'track';
  if (rockiness(x, z) > 0.5) return 'rock';
  if (TRACKS.some(track => track.path.isNear(x, z, 2))) return 'track';
  return patch === 'sand' ? 'sand' : 'grass';
}

/** Rise over run along `heading` on the surface `height(x, z)`; positive means uphill. */
function slopeAlong(height, x, z, heading) {
  const dx = -Math.sin(heading) * 1.5;
  const dz = -Math.cos(heading) * 1.5;
  return (height(x + dx, z + dz) - height(x - dx, z - dz)) / 3;
}

function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

function createLights(scene) {
  const ambient = new THREE.HemisphereLight('#eef5ee', '#788567', 1.8);
  const sun = new THREE.DirectionalLight('#fff0cc', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 420 });
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0002;
  // The trees and rocks cast their shadows from copies that only the sun's shadow camera sees.
  sun.shadow.camera.layers.enable(SHADOW_LAYER);
  scene.add(ambient, sun, sun.target);
  return { ambient, sun };
}

export function createGame(canvas) {
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  // The scene itself never moves. Left to update, it would make the renderer work out again
  // where everything in it is every frame, even the scenery that is frozen in place.
  scene.matrixAutoUpdate = false;
  scene.background = new THREE.Color('#dce5da');
  scene.fog = new THREE.FogExp2('#dce5da', 0.0016);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 1900);
  const { ambient, sun } = createLights(scene);

  const journal = createJournal(readStorage());
  const sound = createAudio();
  sound.setEnabled(journal.get().sound);

  // --- World ------------------------------------------------------------------------

  const scenery = buildScenery(scene);
  const obstacles = [...scenery.obstacles];
  const landmarks = buildLandmarks(scene, obstacles);
  const atmosphere = createAtmosphere(scene, sun, ambient);
  const surfaces = createSurfaces(scene, sound);
  const wading = createWake(scene);
  obstacles.push(...surfaces.obstacles);
  const traffic = createTraffic(scene);
  const ringTraffic = createTraffic(scene, RING);
  const outerTraffic = createTraffic(scene, OUTER);
  const roads = [traffic, ringTraffic, outerTraffic];
  // The roads where nothing else needs to be waited for.
  const openRoads = roads.slice(1);
  const train = createTrain(scene, { onHorn: distance => sound.trainHorn(distance) });
  const car = createCar();
  scene.add(car.root, car.towed);

  const state = createCarState(SPAWN);
  if (journal.get().camp) placeCar(state, CAMP);

  let mode = 'title'; // 'title' | 'driving' | 'paused' | 'camping'
  let pausedFrom = 'driving';

  const pictures = createVehiclePictures(renderer, { onReady: () => ui.showPictures() });
  // The map's picture is only painted once the map or the minimap is first wanted.
  const mapPicture = createMapPicture();
  // The place picked on the map to go to, which the minimap points the way to.
  const target = { place: null };
  const mapView = createMapView(document.querySelector('[data-page="map"]'), mapPicture, state, target, () =>
    minimap.refresh(),
  );
  const minimap = createMinimap(document.getElementById('corner-map'), mapPicture, state, target);
  const ui = createUI({
    journal,
    pictures,
    on: {
      play,
      pause: () => pause(),
      resume,
      wake,
      camp: stayTheNight,
      home: homeFromMenu,
      sound: toggleSound,
      cruise: toggleCruise,
      minimap: toggleMinimap,
      tilt: () => {
        controls.clear();
        if (tilt.getState().enabled || tilt.getState().pending) tilt.disable();
        else tilt.enable();
      },
      tiltCenter: () => tilt.center(),
      tiltReverse: toggleTiltReverse,
      showroom: setShowroom,
      map: open => (open ? mapView.open() : mapView.close()),
      openMap: () => pause('map'),
      choose: patch => {
        journal.save(patch);
        applyChoices();
        needsRender = true;
      },
    },
  });

  const wildlife = createWildlife(scene, { onCall: kind => sound.animal(kind) });
  const secrets = createSecrets(scene, { onCall: kind => sound.animal(kind) });
  obstacles.push(...secrets.obstacles);
  const helicopters = [VALLEY_RESCUE, AIR_AMBULANCE].map(spec => createHelicopter(scene, spec));
  const planes = createPlanes(scene, obstacles);

  // Everything that moves and can be bumped into: the other travellers, the train and the crossing barriers.
  const moving = [];
  // What the traffic and the train wait for besides the car: its trailer, and friends coming along.
  const towed = [];
  // What the traffic on the trail waits for besides the car.
  const blockers = [];
  // The car as the long grass and the crops see it: where it is, how it is going and its wheels.
  const trampler = { x: 0, z: 0, y: 0, heading: 0, speed: 0, wheels: [] };
  // The surface under the car: up on the top of the rock fin and the arch once it has driven onto it.
  const surfaceHeight = (x, z) => drivingHeight(x, z, state.y);
  // The surface last worked out. The driving asks where the car is at the start of a frame,
  // which is just where the dirt asked at the end of the frame before.
  const lastSurface = { x: NaN, z: NaN, y: NaN, kind: 'grass' };
  const world = {
    obstacles: createObstacleIndex(obstacles),
    dynamic: moving,
    surface(x, z) {
      if (x !== lastSurface.x || z !== lastSurface.z || state.y !== lastSurface.y) {
        lastSurface.kind = onFin(x, z, state.y) ? 'track' : surfaceUnder(x, z);
        lastSurface.x = x;
        lastSurface.z = z;
        lastSurface.y = state.y;
      }
      return lastSurface.kind;
    },
    slope: (x, z, heading) => slopeAlong(surfaceHeight, x, z, heading),
    isDriveable,
    waterDepth: wadingDepth,
  };
  const mudHole = createMudHole(scene, { obstacles: world.obstacles, onToot: () => sound.otherHorn() });
  const ferry = createFerry(scene, { onHorn: (distance, blasts) => sound.shipHorn(distance, blasts) });

  // Friends wait at the depot to come along for the ride.
  const friends = createFriends(scene, {
    obstacles: world.obstacles,
    vehicle: journal.get().vehicle,
    color: journal.get().color,
    onHorn: (kind, x, z) => (kind === 'air' ? sound.horn(insideTunnel(x, z), 'air') : sound.otherHorn()),
  });

  const tilt = createTiltSteering(window, info => ui.setTilt(info));
  const controls = createControls({
    touchRoot: document.getElementById('touch-controls'),
    tilt,
    isDriving: () => mode === 'driving',
    onAction: handleAction,
  });

  // The camera keeps above the water as well as the ground.
  const aboveGround = (x, z) => Math.max(terrainHeight(x, z), waterLevel(x, z));
  const chase = createChaseCamera(camera, { occluders: landmarks.occluders, groundHeight: aboveGround });

  // Drag to look around: on the scenery while driving, and beside the menu in the garage.
  const menu = document.getElementById('menu');
  const swing = {
    onDrag: (dx, dy) => chase.drag(dx, dy),
    onRelease: () => chase.release(),
    onZoom: amount => chase.zoom(amount),
  };
  createLook(canvas, { accepts: () => mode === 'driving', ...swing });
  // A tap on a friend at the depot asks it along.
  const tapRay = new THREE.Raycaster();
  const tapPoint = new THREE.Vector2();
  createTap(canvas, {
    accepts: () => mode === 'driving',
    onTap(x, y) {
      tapPoint.set((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2);
      tapRay.setFromCamera(tapPoint, camera);
      friends.tap(tapRay.ray, state);
    },
  });
  createLook(menu, {
    accepts: event => {
      if (!showroom || event.target !== menu) return false;
      const box = menu.getBoundingClientRect();
      return event.clientX > box.right || event.clientY < box.top;
    },
    ...swing,
  });

  // --- Actions -------------------------------------------------------------------------

  /** Keyboard shortcuts. Returning true stops the browser's default for the key. */
  function handleAction(action, event) {
    if (action === 'konami') return unlockRainbow();
    if (mode === 'title') {
      if (action === 'start') play();
      return action === 'start';
    }
    if (mode === 'paused') {
      // The menu handles Escape itself (back, then close); P resumes directly.
      if (action === 'pause' && event?.code !== 'Escape') resume();
      return false;
    }
    if (action === 'pause') pause();
    if (action === 'horn') honk();
    if (action === 'sound') toggleSound();
    if (mode !== 'driving') return true;
    if (action === 'home') goHome();
    if (action === 'garage') pause('garage');
    if (action === 'cruise') toggleCruise();
    if (action === 'invite') friends.inviteNearest();
    return true;
  }

  function toggleSound() {
    const on = !sound.isEnabled();
    sound.setEnabled(on);
    journal.save({ sound: on });
    ui.setSwitch('sound', on);
  }

  function toggleCruise() {
    controls.cruise = !controls.cruise;
    ui.setSwitch('cruise', controls.cruise);
  }

  function toggleMinimap() {
    const on = !journal.get().minimap;
    journal.save({ minimap: on });
    ui.setSwitch('minimap', on);
    minimap.setVisible(on);
  }

  /** Leaning the screen back to reverse, while tilt steers. */
  function toggleTiltReverse() {
    const on = !journal.get().tiltReverse;
    journal.save({ tiltReverse: on });
    ui.setSwitch('tilt-reverse', on);
    tilt.setLeanBack(on);
  }

  function play() {
    sound.start();
    mode = 'driving';
    ui.startPlaying();
    minimap.setVisible(journal.get().minimap);
    chase.setMode('chase');
    controls.clear();
  }

  function pause(page = 'main') {
    if (mode !== 'driving' && mode !== 'camping') return;
    pausedFrom = mode;
    mode = 'paused';
    controls.clear();
    const nearCamp = Math.hypot(state.x - CAMP.x, state.z - CAMP.z) < 20;
    ui.openMenu({ nearCamp, camping: pausedFrom === 'camping' });
    if (page !== 'main') ui.openPage(page);
    needsRender = true;
  }

  function resume() {
    if (mode !== 'paused') return;
    // From a tap: wakes the sound if the device stopped it while the game was in the background.
    sound.start();
    ui.closeMenu();
    mode = pausedFrom;
    controls.clear();
  }

  function goHome() {
    placeCar(state, journal.get().camp ? CAMP : SPAWN);
    controls.clear();
    updateCarModel(0);
    chase.snap(carView(), cameraOptions());
  }

  /** The menu's home button: back to the start, driving, even from a night at camp. */
  function homeFromMenu() {
    if (mode !== 'paused') return;
    ui.closeMenu();
    if (pausedFrom === 'camping') leaveCamp();
    mode = 'driving';
    goHome();
  }

  function stayTheNight() {
    if (Math.hypot(state.x - CAMP.x, state.z - CAMP.z) > 20) return;
    placeCar(state, CAMP);
    updateCarModel(0);
    journal.save({ camp: true });
    atmosphere.setPreset('night');
    ui.closeMenu();
    mode = 'camping';
    chase.setMode('camp');
    ui.setCamping(true);
  }

  function wake() {
    mode = 'driving';
    leaveCamp();
    controls.clear();
  }

  function leaveCamp() {
    atmosphere.wakeUp();
    ui.setCamping(false);
    chase.setMode('chase');
  }

  let lastHonk = -1;
  function honk() {
    if (clock - lastHonk < 0.5) return;
    lastHonk = clock;
    sound.horn(insideTunnel(state.x, state.z), car.spec.voice?.horn);
    // Pop-up lamps flip up and back down with it.
    car.wink();
    wildlife.hearHorn(state.x, state.z);
    secrets.hearHorn(state.x, state.z);
    for (const road of roads) road.answerHonk(state.x, state.z, () => sound.otherHorn());
    train.answerHonk(state);
    for (const helicopter of helicopters) helicopter.hearHorn(state);
    landmarks.hearHorn(state.x, state.z);
    ferry.hearHorn(state.x, state.z);
    planes.hearHorn(state);
    friends.hearHorn();
  }

  function unlockRainbow() {
    if (journal.get().rainbow) return;
    journal.save({ rainbow: true, color: 'rainbow' });
    applyChoices();
    ui.toast({ title: 'Rainbow paint', detail: 'Unlocked. Find it under Car in the menu.' });
  }

  function applyChoices() {
    const { color, decorations, vehicle } = journal.get();
    car.customize(color, decorations, vehicle);
    state.body = bodyOf(car.size);
    wheelLayout = layoutOf(car.spec.wheels);
    hasTent = decorations.includes('tent');
    sound.setEngine(car.spec.voice?.engine);
    friends.choose(vehicle, color);
    trailer.ready = false;
    if (car.trailer) placeTrailer();
  }

  // --- Roof tent -----------------------------------------------------------------------

  // It folds away while the car is moving and opens once it has stood still for a moment.
  let hasTent = false;
  let tentOpen = 0;
  let parkedFor = 0;
  function updateTent(dt, night) {
    if (!hasTent) return;
    const target = mode !== 'driving' || parkedFor > 2.5 ? 1 : 0;
    tentOpen = target ? Math.min(1, tentOpen + dt * 0.6) : Math.max(0, tentOpen - dt * 1.6);
    car.setTent(tentOpen, night);
  }

  // --- Garage view -------------------------------------------------------------------------

  let showroom = false;
  function setShowroom(on) {
    showroom = on;
    chase.setMode(on ? 'showroom' : pausedFrom === 'camping' ? 'camp' : 'chase');
    frameShowroom();
    needsRender = true;
  }

  /** Centres the car in the part of the screen the menu doesn't cover. */
  function frameShowroom() {
    if (!showroom) {
      camera.clearViewOffset();
      return;
    }
    const panel = menu.getBoundingClientRect();
    const beside = panel.right < innerWidth * 0.75;
    const cx = beside ? (panel.right + innerWidth) / 2 : innerWidth / 2;
    const cy = beside ? innerHeight / 2 : panel.top / 2;
    camera.setViewOffset(innerWidth, innerHeight, innerWidth / 2 - cx, innerHeight / 2 - cy, innerWidth, innerHeight);
  }

  // --- Car model -------------------------------------------------------------------------

  const body = { pitch: 0, roll: 0, lastSpeed: 0, lastHeading: state.heading };
  /** Where the current vehicle's wheels are, for fitting it to the ground. */
  let wheelLayout;

  // The driving is worked out in steps of a fixed length (see core/clock.js). The car is drawn,
  // and the camera follows it, between where it was before the last step and where it is now,
  // as far on as the time left over: smooth whether or not the frames line up with the steps.
  const steps = createFixedStep(STEP);
  const before = { x: state.x, z: state.z, heading: state.heading, speed: 0 };
  const after = { ...before };
  const drawn = { x: 0, z: 0, heading: 0, speed: 0 };
  /**
   * Where the car is drawn. Moved since the last step (a jump home, to camp or to the depot, or
   * pulled on the tractor's rope), it is drawn just where it is.
   */
  function shown() {
    const moved = state.x !== after.x || state.z !== after.z || state.heading !== after.heading;
    const t = moved ? 1 : steps.alpha;
    drawn.x = lerp(before.x, state.x, t);
    drawn.z = lerp(before.z, state.z, t);
    drawn.heading = before.heading + angleDelta(before.heading, state.heading) * t;
    drawn.speed = lerp(before.speed, state.speed, t);
    return drawn;
  }

  function updateCarModel(dt) {
    state.y = drivingHeight(state.x, state.z, state.y);
    const { x, z, heading, speed } = shown();
    const pose = chassisPose(x, z, heading, surfaceHeight, wheelLayout);
    car.root.position.set(x, pose.height, z);
    car.root.rotation.order = 'YXZ';
    car.root.rotation.y = heading;
    car.root.rotation.x = dt ? damp(car.root.rotation.x, pose.pitch, 14, dt) : pose.pitch;
    car.root.rotation.z = dt ? damp(car.root.rotation.z, pose.roll, 14, dt) : pose.roll;

    // Weight transfer: the body squats when accelerating, dives when braking and leans in turns.
    if (dt > 0) {
      const accel = (speed - body.lastSpeed) / dt;
      const yawRate = angleDelta(body.lastHeading, heading) / dt;
      body.pitch = damp(body.pitch, clamp(accel * 0.006, -0.05, 0.04), 6, dt);
      body.roll = damp(body.roll, clamp(-yawRate * speed * 0.0045, -0.06, 0.06), 6, dt);
    }
    body.lastSpeed = speed;
    body.lastHeading = heading;
    // In deep water the body also rides up a little on its springs and rocks.
    car.body.position.y = wading.float.lift;
    car.body.rotation.set(body.pitch + wading.float.pitch, 0, body.roll + wading.float.roll);

    const wheelAngle = steerAngle(state.steering, state.speed);
    for (const wheel of car.wheels) {
      wheel.pivot.rotation.y = wheel.front ? wheelAngle : 0;
      // In the mud hole the wheels can spin faster than the car goes.
      wheel.spin.rotation.x -= ((state.speed + mudHole.slip) * dt) / wheel.radius;
    }
    settleWheels(car, surfaceHeight);
    // Sunk into the mud, wheels and all.
    car.root.position.y -= mudHole.sink;
    car.root.updateMatrixWorld();
    if (car.trailer) placeTrailer();
  }

  // --- The lorry's trailer -----------------------------------------------------------------

  const trailer = createTrailerState();
  const hitch = new THREE.Vector3();
  const point = new THREE.Vector3();

  /** Hangs the trailer from the lorry's hitch, lets it follow on behind and rests its wheels on the ground. */
  function placeTrailer() {
    hangTrailer(
      { car, trailer, hitch, point, obstacles: world.obstacles, level: state.y },
      state.heading,
      state.speed,
      surfaceHeight,
    );
  }

  /** The corners of the car's outline and its trailer's, for the ferry to tell when it is all aboard. */
  const corners = Array.from({ length: 8 }, () => ({ x: 0, z: 0 }));
  function footprint() {
    const { front, back, half } = car.size;
    const sin = Math.sin(state.heading);
    const cos = Math.cos(state.heading);
    let n = 0;
    const put = (x, z, along, side, s, c) =>
      Object.assign(corners[n++], { x: x - s * along + c * side, z: z - c * along - s * side });
    for (const along of [front, -back]) for (const side of [-half, half]) put(state.x, state.z, along, side, sin, cos);
    if (car.trailer && trailer.ready) {
      // The back of the trailer, behind its hitch.
      const ts = Math.sin(trailer.heading);
      const tc = Math.cos(trailer.heading);
      for (const side of [-1.27, 1.27]) put(trailer.x, trailer.z, -8.8, side, ts, tc);
    }
    return corners.slice(0, n);
  }

  /** Points along the trailer, for the other traffic and the train to stop short of. */
  function trailerPoints() {
    if (!car.trailer) return [];
    return [3, 7].map(d => ({
      x: trailer.x + Math.sin(trailer.heading) * d,
      z: trailer.z + Math.cos(trailer.heading) * d,
    }));
  }

  /** How steeply the ground climbs over the next stretch the car is heading for (negative downhill). */
  function gradeAhead() {
    const reach = 12 * (car.spec.camera ?? 1);
    const ahead = surfaceHeight(state.x - Math.sin(state.heading) * reach, state.z - Math.cos(state.heading) * reach);
    return clamp((ahead - surfaceHeight(state.x, state.z)) / reach, -0.8, 0.9);
  }

  const carView = () => ({
    x: shown().x,
    y: car.root.position.y,
    z: shown().z,
    heading: shown().heading,
    speed: state.speed,
    grade: gradeAhead(),
    scale: car.spec.camera ?? 1,
    turn: ferry.holding() ? 0 : friends.lookBack(),
  });
  const compactScreen = () => innerWidth < 700 || innerHeight > innerWidth;
  const cameraOptions = () => ({
    compact: compactScreen(),
    intro: introShot,
    camp: campShot,
    shot: debugShot,
    watch: mudHole.watch() ?? ferry.watch(state),
  });

  // --- Camera framing for the title screen and the night at camp -----------------------

  const introShot = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  const debugShot = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  function updateIntroShot(time) {
    // A slow sway around a view over the car, the meadow and the far side of the valley.
    const y = terrainHeight(state.x, state.z);
    const portrait = innerHeight > innerWidth;
    const target = portrait ? { x: state.x - 8, z: state.z - 30 } : { x: state.x + 10, z: state.z - 46 };
    const angle = Math.atan2(-34 - 10, 38 + 46) + Math.sin(time * 0.06) * 0.12;
    const distance = Math.hypot(44, 84);
    introShot.position.set(target.x + Math.sin(angle) * distance, y + 21, target.z + Math.cos(angle) * distance);
    introShot.target.set(target.x, y + 5, target.z);
  }
  const campShot = (() => {
    const cos = Math.cos(CAMP.heading);
    const sin = Math.sin(CAMP.heading);
    const local = (lx, lz) => ({ x: CAMP.x + lx * cos + lz * sin, z: CAMP.z - lx * sin + lz * cos });
    // From beside the tent: the fire in the middle, the car behind, the lake beyond.
    const eye = local(-20, -2);
    const target = local(-2, -8);
    return {
      position: new THREE.Vector3(eye.x, terrainHeight(eye.x, eye.z) + 4.5, eye.z),
      target: new THREE.Vector3(target.x, terrainHeight(target.x, target.z) + 1.2, target.z),
    };
  })();

  // --- Rendering and performance ---------------------------------------------------------

  let pixelRatio = Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
  let needsRender = true;
  function resize() {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = compactScreen() ? 62 : 50;
    camera.updateProjectionMatrix();
    frameShowroom();
    needsRender = true;
  }
  window.addEventListener('resize', resize);

  // Drop the resolution if frames are consistently slower than the frame cap allows, and
  // raise it again when they recover. Only while driving: the title screen and the night
  // at camp run at a deliberately lower rate, which must not be mistaken for slowness
  // (resizing the canvas there made the title screen flicker).
  const perf = { average: 16, slow: 0, fast: 0 };
  function adaptResolution(frameMs, dt, targetFps) {
    if (mode !== 'driving') {
      Object.assign(perf, { average: 1000 / targetFps, slow: 0, fast: 0 });
      return;
    }
    const budget = 1000 / targetFps;
    perf.average += (frameMs - perf.average) * 0.05;
    perf.slow = perf.average > budget * 1.45 ? perf.slow + dt : 0;
    perf.fast = perf.average < budget * 1.1 ? perf.fast + dt : 0;
    const best = Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
    if (perf.slow > 2 && pixelRatio > 0.75) {
      pixelRatio = Math.max(0.75, pixelRatio - 0.25);
      perf.slow = 0;
      resize();
    } else if (perf.fast > 8 && pixelRatio < best) {
      pixelRatio = Math.min(best, pixelRatio + 0.25);
      perf.fast = 0;
      resize();
    }
  }

  document.addEventListener('visibilitychange', () => {
    controls.clear();
    if (document.hidden) {
      tilt.suspend();
      pause();
      // No frames are drawn in a hidden page, so the sound is told now: the music stops with it.
      sound.update({ speed: 0, engineOn: false, active: false, rain: 0 });
    }
  });
  window.addEventListener('blur', () => controls.clear());
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    document.getElementById('error').hidden = false;
  });

  let lastFrame = 0;
  let clock = 0;
  let dirt = 0;
  let wasBraking = false;
  let throttle = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const frameMs = now - lastFrame;
    // 60 fps is plenty; idle scenes run at 30. High refresh screens skip frames.
    const targetFps = mode === 'driving' ? 60 : 30;
    if (!UNCAPPED && frameMs < 1000 / targetFps - 4) return;
    lastFrame = now;
    const dt = Math.min(frameMs / 1000, 0.05);

    if (mode === 'paused') {
      // The garage's pictures are drawn one a frame while the game stands still. Drawing
      // one clears the mud, which all the cars share, so the car's own is put back.
      if (pictures.drawNext()) car.setMud(dirt);
      if (showroom) {
        car.animate(now / 1000);
        updateTent(dt, 1 - atmosphere.getState().day);
        chase.update(dt, carView(), cameraOptions());
        renderer.render(scene, camera);
      } else if (needsRender) {
        renderer.render(scene, camera);
      }
      needsRender = false;
      // Paused, the world stands still: no rotors carrying on at their last level.
      sound.update({ speed: 0, engineOn: false, active: !document.hidden, rain: 0 });
      sound.rotor(0, 0);
      return;
    }
    clock += dt;
    const driving = mode === 'driving';
    tilt.update(dt, driving);
    // The ferry sails before the car is driven, so a car aboard goes along with it this frame.
    ferry.update(dt, {
      player: driving ? state : null,
      corners: driving ? footprint() : [],
      others: driving ? friends.outlines(OUTLINE) : [],
      blockers: towed,
      listener: camera.position,
    });
    if (driving && ferry.holding()) {
      if (car.trailer && trailer.ready) ferry.carry(trailer);
      friends.carry(ferry.carry, ferry.onDeck);
    }

    if (driving) {
      const input = controls.read();
      moving.length = 0;
      moving.push(
        ...traffic.colliders,
        ...openRoads.flatMap(road => road.colliders),
        ...train.colliders,
        ...helicopters.flatMap(helicopter => helicopter.colliders),
        ...planes.colliders,
        ...landmarks.crossing.colliders(),
        ...landmarks.machines,
        ...mudHole.colliders,
        ...ferry.colliders,
        ...friends.colliders,
      );
      // The driving goes on in steps of a fixed length, the car drawn between the last two.
      let impact = 0;
      steps.advance(dt, step => {
        Object.assign(before, { x: state.x, z: state.z, heading: state.heading, speed: state.speed });
        // A paddock fence driven into fast enough goes over.
        if (landmarks.knockFences(state, step)) sound.knock();
        // On the tractor's rope, the car goes where it is pulled, and on the ferry where it is taken.
        if (!mudHole.holding() && !ferry.holding()) stepDriving(state, input, step, world);
        Object.assign(after, { x: state.x, z: state.z, heading: state.heading, speed: state.speed });
        impact = Math.max(impact, state.impact);
      });
      state.impact = impact;
      mudHole.update(dt, state, input, car, trailer);
      if (state.impact > 2.5) sound.bump(state.impact);
      updateCarModel(dt);
      wasBraking = input.brake || (input.backward && state.speed > 0.5) || (input.forward && state.speed < -0.5);
      throttle = !input.brake && !ferry.holding() && (input.forward || input.backward || input.cruise) ? 1 : 0;
      parkedFor = Math.abs(state.speed) < 0.3 && !throttle ? parkedFor + dt : 0;
    }

    const sky = atmosphere.getState();
    const night = 1 - sky.day;
    atmosphere.update(dt, state, mode !== 'title');
    car.setLights(night, driving && wasBraking);
    car.animate(clock);
    updateTent(dt, night);
    const tail = trailerPoints();
    friends.update(dt, {
      state,
      tail,
      driving,
      night,
      camera,
      dynamic: moving,
      close: driving && ferry.aboard(),
      crowded: driving ? ferry.crowded() : null,
    });
    towed.length = 0;
    towed.push(...tail, ...friends.points, ...ferry.points);
    train.update(dt, { player: state, towed });
    for (const helicopter of helicopters) helicopter.update(dt);
    planes.update(dt, { player: state });
    const crossingClosed = train.crossingClosed();
    landmarks.update(dt, night, { crossingClosed, player: state });
    wildlife.update(dt, state, night);
    secrets.update(dt, state, night);
    // Stuck in the mud hole and pulled out of it, the car makes no sound in the mud.
    surfaces.update(dt, state, driving, mudHole.slip, mudHole.gripping());
    if (driving) wading.update(dt, state, car, car.trailer ? trailer : null);
    if (driving) {
      // Puddles lie on the trail, so the tyres find them rather than the driving surface.
      const surface = surfaces.getState().surface === 'puddle' ? 'puddle' : world.surface(state.x, state.z);
      dirt = stepDirt(dirt, { surface, speed: state.speed + mudHole.slip, rain: sky.rain }, dt);
    }
    car.setMud(dirt);
    blockers.length = 0;
    // The tractor from the mud hole comes out along the trail to tow, so the traffic waits for it too.
    blockers.push(...wildlife.crossingDucks(), ...landmarks.crossing.blockers(), ...towed, ...mudHole.colliders);
    traffic.update(dt, { player: state, blockers, night });
    for (const road of openRoads) road.update(dt, { player: state, blockers: towed, night });
    // The car and the friends following it lay the long grass and the crops over where they drive through.
    trampler.x = state.x;
    trampler.z = state.z;
    trampler.y = state.y;
    trampler.heading = state.heading;
    trampler.speed = state.speed;
    trampler.wheels = car.spec.wheels;
    updateTrample(dt, [trampler, ...friends.tramplers()]);

    if (mode === 'title') updateIntroShot(clock);
    chase.update(dt, carView(), cameraOptions());
    minimap.update(now);
    // After the camera has moved, so the scenery around it is filled in for where it is now.
    scenery.update(dt, camera, sun);

    sound.update({
      speed: driving ? state.speed : 0,
      throttle: driving ? throttle : 0,
      engineOn: driving,
      active: mode !== 'title' && !document.hidden,
      rain: sky.rain,
    });
    // The helicopters and the plane share one engine sound: whichever is loudest.
    const rotor = [
      ...helicopters.map(helicopter => helicopter.rotorSound(camera.position)),
      planes.engineSound(camera.position),
    ].reduce((a, b) => (b.level > a.level ? b : a));
    sound.rotor(mode === 'title' ? 0 : rotor.level, rotor.rate);
    renderer.render(scene, camera);
    if (!UNCAPPED) adaptResolution(frameMs, dt, targetFps);
  }

  // --- Start -------------------------------------------------------------------------------

  applyChoices();
  separateMeshKinds(scene);
  ui.setSwitch('sound', journal.get().sound);
  ui.setSwitch('minimap', journal.get().minimap);
  ui.setSwitch('tilt-reverse', journal.get().tiltReverse);
  tilt.setLeanBack(journal.get().tiltReverse);
  updateCarModel(0);
  updateIntroShot(0);
  chase.snap(carView(), cameraOptions());
  resize();
  // The shaders are compiled before the first frame, side by side where the browser allows,
  // so the game doesn't freeze for a moment just as it can be played. Any left over are
  // compiled when they are first drawn.
  renderer
    .compileAsync(scene, camera)
    .catch(() => {})
    .then(() => {
      ui.ready(matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
      requestAnimationFrame(frame);
    });

  // Hooks for the browser tests and the screenshot script (development builds only).
  if (import.meta.env.DEV) {
    window.__game = {
      getState: () => ({
        mode,
        car: { ...state },
        carHeight: car.root.position.y,
        journal: journal.get(),
        sky: atmosphere.getState(),
        surface: surfaces.getState(),
        traffic: traffic.getState(),
        emergency: traffic.emergency(),
        visitors: roads.map(road => road.visitor()),
        train: train.getState(),
        helicopter: helicopters[0].getState(),
        krystof: helicopters[1].getState(),
        plane: planes.getState(),
        friends: friends.getState(),
        fields: landmarks.fields.getState(),
        mudHole: mudHole.getState(),
        ferry: ferry.getState(),
        map: mapView.getState(),
        minimap: minimap.getState(),
        tilt: tilt.getState(),
        wildlife: wildlife.getState(),
        cameraBlocked: chase.isBlocked(),
        cameraMode: chase.getMode(),
        wheels: car.wheels.map(wheel => +wheel.pivot.position.y.toFixed(3)),
        camera: camera.position.toArray(),
        pixelRatio,
        input: controls.read(),
        tentOpen,
        dirt,
        trailer: car.trailer ? { ...trailer, swing: swingOf(trailer, state.heading) } : null,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      }),
      teleport(x, z, heading = state.heading) {
        placeCar(state, { x, z, heading });
        updateCarModel(0);
        chase.snap(carView(), cameraOptions());
      },
      setSky: preset => atmosphere.setPreset(preset),
      callOut: kind => roads.some(road => road.callOut(state, kind)),
      setClock: seconds => atmosphere.setTime(seconds),
      setDirt: amount => (dirt = amount),
      shot(position, target) {
        chase.setMode('shot');
        debugShot.position.set(...position);
        debugShot.target.set(...target);
        chase.snap(carView(), cameraOptions());
      },
      followCar: () => chase.setMode('chase'),
      /** Ties the ferry up at the quay at once, empty and waiting; or brings it in now with cars aboard. */
      dockFerry: () => ferry.dock(),
      callFerry: () => ferry.callIn(),
      /** Puts the car in the depot's yard, `lx` along the doors and `lz` out from them, facing them. */
      toDepot(lx, lz) {
        const cos = Math.cos(DEPOT.rotation);
        const sin = Math.sin(DEPOT.rotation);
        this.teleport(DEPOT.x + lx * cos + lz * sin, DEPOT.z - lx * sin + lz * cos, DEPOT.rotation);
      },
      /** For measuring what is drawn. */
      debug: { scene, camera, renderer, sun },
    };
  }
}
