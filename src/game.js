import * as THREE from 'three';
import { angleDelta, clamp, damp } from './core/math.js';
import { createAudio } from './core/audio.js';
import { createChaseCamera } from './core/camera.js';
import { createObstacleIndex } from './core/collision.js';
import { createCarState, placeCar, steerAngle, stepDriving } from './core/driving.js';
import { createJournal } from './core/journal.js';
import { chassisPose, settleWheels } from './core/suspension.js';
import { createControls } from './input/controls.js';
import { createTiltSteering } from './input/tilt.js';
import { createUI } from './ui/ui.js';
import { createCar, WHEEL_RADIUS } from './vehicles/car.js';
import { createTraffic } from './vehicles/traffic.js';
import { createAtmosphere } from './world/atmosphere.js';
import { createGnomes } from './world/collectibles.js';
import { buildLandmarks, insideTunnel } from './world/landmarks/index.js';
import { CAMP, CAMP_TRAIL, GNOMES, PLACES, ROAD, ROAD_HALF_WIDTH, SPAWN, surfaceAt } from './world/layout.js';
import { buildScenery } from './world/scenery.js';
import { createSecrets } from './world/secrets.js';
import { createSurfaces } from './world/surfaces.js';
import { bridgeHeight, drivingHeight, isDriveable, terrainHeight, waterDepth } from './world/terrain.js';
import { createWildlife } from './world/wildlife.js';

const MAX_PIXEL_RATIO = 1.5;
// Development builds can measure raw rendering cost with ?uncapped (no frame cap, fixed resolution).
const UNCAPPED = import.meta.env.DEV && new URLSearchParams(location.search).has('uncapped');

function readStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // Private browsing: progress lasts for the visit.
  }
}

/** What the tyres are on, for grip and top speed. */
function surfaceUnder(x, z) {
  if (waterDepth(x, z) > 0.15) return 'water';
  const patch = surfaceAt(x, z);
  if (patch === 'snow' || patch === 'leaves') return patch;
  if (bridgeHeight(x, z) !== null) return 'road';
  if (ROAD.nearest(x, z).distance < ROAD_HALF_WIDTH + 0.6) return 'road';
  if (CAMP_TRAIL.nearest(x, z).distance < 2.6) return 'road';
  return 'grass';
}

/** Rise over run along the car's heading; positive means uphill. */
function slopeAlong(x, z, heading) {
  const dx = -Math.sin(heading) * 1.5;
  const dz = -Math.cos(heading) * 1.5;
  return (drivingHeight(x + dx, z + dz) - drivingHeight(x - dx, z - dz)) / 3;
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
  scene.add(ambient, sun, sun.target);
  return { ambient, sun };
}

export function createGame(canvas) {
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
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
  const traffic = createTraffic(scene);
  const car = createCar();
  scene.add(car.root);

  const state = createCarState(SPAWN);
  if (journal.get().camp) placeCar(state, CAMP);

  let mode = 'title'; // 'title' | 'driving' | 'paused' | 'camping'
  let pausedFrom = 'driving';

  const ui = createUI({
    journal,
    gnomeCount: GNOMES.length,
    on: {
      play,
      pause: () => pause(),
      resume,
      wake,
      home: () => {
        if (pausedFrom === 'camping') {
          pausedFrom = 'driving';
          leaveCamp();
        }
        goHome();
        resume();
      },
      camp: stayTheNight,
      sky: () => ui.setSky(atmosphere.cycle()),
      sound: toggleSound,
      cruise: toggleCruise,
      tilt: () => {
        controls.clear();
        if (tilt.getState().enabled || tilt.getState().pending) tilt.disable();
        else tilt.enable();
      },
      tiltCenter: () => tilt.center(),
      choose: patch => {
        journal.save(patch);
        applyChoices();
        needsRender = true;
        if (patch.horn) honk();
      },
    },
  });

  const discovered = id => {
    if (!journal.discover(id)) return;
    ui.stickerToast(id);
    ui.refresh();
    sound.sticker();
  };
  const wildlife = createWildlife(scene, { onSpotted: discovered, onCall: kind => sound.animal(kind) });
  const secrets = createSecrets(scene, { onSpotted: discovered });
  obstacles.push(...secrets.obstacles);
  const gnomes = createGnomes(scene, {
    found: journal.get().gnomes,
    onFound: index => {
      if (!journal.collectGnome(index)) return;
      sound.chime();
      ui.gnomeToast(journal.get().gnomes.length);
    },
  });

  const world = {
    obstacles: createObstacleIndex(obstacles),
    dynamic: traffic.colliders,
    surface: surfaceUnder,
    slope: slopeAlong,
    isDriveable,
  };

  const tilt = createTiltSteering(window, info => ui.setTilt(info));
  const controls = createControls({
    touchRoot: document.getElementById('touch-controls'),
    tilt,
    isDriving: () => mode === 'driving',
    onAction: handleAction,
  });

  const chase = createChaseCamera(camera, { occluders: landmarks.occluders, groundHeight: terrainHeight });

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
    if (action === 'scrapbook') pause('scrapbook');
    if (action === 'garage') pause('garage');
    if (action === 'cruise') toggleCruise();
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

  function play() {
    sound.start();
    mode = 'driving';
    ui.startPlaying();
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

  function stayTheNight() {
    if (Math.hypot(state.x - CAMP.x, state.z - CAMP.z) > 20) return;
    placeCar(state, CAMP);
    updateCarModel(0);
    discovered('campsite');
    journal.save({ camp: true });
    atmosphere.setPreset('night');
    ui.setSky('night');
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
    ui.setSky('auto');
    ui.setCamping(false);
    chase.setMode('chase');
  }

  let lastHonk = -1;
  function honk() {
    if (clock - lastHonk < 0.5) return;
    lastHonk = clock;
    sound.horn(journal.get().horn, insideTunnel(state.x, state.z));
    wildlife.hearHorn(state.x, state.z);
    secrets.hearHorn(state.x, state.z);
    traffic.answerHonk(state.x, state.z, () => sound.otherHorn());
  }

  function unlockRainbow() {
    if (journal.get().rainbow) return;
    journal.save({ rainbow: true, color: 'rainbow' });
    applyChoices();
    ui.toast({ title: 'Rainbow paint', detail: 'Unlocked. Find it under Car in the menu.' });
  }

  function applyChoices() {
    const { color, decoration } = journal.get();
    car.customize(color, decoration);
  }

  // --- Car model -------------------------------------------------------------------------

  const body = { pitch: 0, roll: 0, lastSpeed: 0, lastHeading: state.heading };

  function updateCarModel(dt) {
    const pose = chassisPose(state.x, state.z, state.heading, drivingHeight);
    car.root.position.set(state.x, pose.height, state.z);
    car.root.rotation.order = 'YXZ';
    car.root.rotation.y = state.heading;
    car.root.rotation.x = dt ? damp(car.root.rotation.x, pose.pitch, 14, dt) : pose.pitch;
    car.root.rotation.z = dt ? damp(car.root.rotation.z, pose.roll, 14, dt) : pose.roll;

    // Weight transfer: the body squats when accelerating, dives when braking and leans in turns.
    if (dt > 0) {
      const accel = (state.speed - body.lastSpeed) / dt;
      const yawRate = angleDelta(body.lastHeading, state.heading) / dt;
      body.pitch = damp(body.pitch, clamp(accel * 0.006, -0.05, 0.04), 6, dt);
      body.roll = damp(body.roll, clamp(-yawRate * state.speed * 0.0045, -0.06, 0.06), 6, dt);
    }
    body.lastSpeed = state.speed;
    body.lastHeading = state.heading;
    car.body.rotation.set(body.pitch, 0, body.roll);

    const wheelAngle = steerAngle(state.steering, state.speed);
    for (const wheel of car.wheels) {
      wheel.pivot.rotation.y = wheel.front ? wheelAngle : 0;
      wheel.spin.rotation.x -= (state.speed * dt) / WHEEL_RADIUS;
    }
    settleWheels(car, drivingHeight);
  }

  const carView = () => ({
    x: state.x,
    y: car.root.position.y,
    z: state.z,
    heading: state.heading,
    speed: state.speed,
  });
  const compactScreen = () => innerWidth < 700 || innerHeight > innerWidth;
  const cameraOptions = () => ({ compact: compactScreen(), intro: introShot, camp: campShot, shot: debugShot });

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
    needsRender = true;
  }
  window.addEventListener('resize', resize);

  // Drop the resolution if frames are consistently slow, and raise it again when they recover.
  const perf = { average: 16, slow: 0, fast: 0 };
  function adaptResolution(frameMs, dt) {
    perf.average += (frameMs - perf.average) * 0.05;
    perf.slow = perf.average > 24 ? perf.slow + dt : 0;
    perf.fast = perf.average < 18 ? perf.fast + dt : 0;
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
    }
  });
  window.addEventListener('blur', () => controls.clear());
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    document.getElementById('error').hidden = false;
  });

  let lastFrame = 0;
  let clock = 0;
  let wasBraking = false;

  function frame(now) {
    requestAnimationFrame(frame);
    const frameMs = now - lastFrame;
    // 60 fps is plenty; idle scenes run at 30. High refresh screens skip frames.
    const targetFps = mode === 'driving' ? 60 : 30;
    if (!UNCAPPED && frameMs < 1000 / targetFps - 4) return;
    lastFrame = now;
    const dt = Math.min(frameMs / 1000, 0.05);

    if (mode === 'paused') {
      if (needsRender) renderer.render(scene, camera);
      needsRender = false;
      sound.update({ speed: 0, running: !document.hidden, rain: 0 });
      return;
    }
    clock += dt;
    const driving = mode === 'driving';
    tilt.update(dt, driving);

    if (driving) {
      const input = controls.read();
      stepDriving(state, input, dt, world);
      if (state.impact > 2.5) sound.bump(state.impact);
      updateCarModel(dt);
      wasBraking = input.brake || (input.backward && state.speed > 0.5) || (input.forward && state.speed < -0.5);
      for (const place of PLACES) {
        if (Math.hypot(state.x - place.x, state.z - place.z) < place.radius) discovered(place.id);
      }
    }

    const sky = atmosphere.getState();
    const night = 1 - sky.day;
    atmosphere.update(dt, state, mode !== 'title');
    car.setLights(night, driving && wasBraking);
    car.animate(clock);
    scenery.update(dt);
    landmarks.update(dt, night);
    wildlife.update(dt, state, true);
    secrets.update(dt, state, true);
    gnomes.update(dt, state, driving);
    surfaces.update(dt, state, driving);
    traffic.update(dt, { player: state, blockers: wildlife.crossingDucks(), night });

    if (mode === 'title') updateIntroShot(clock);
    chase.update(dt, carView(), cameraOptions());

    sound.update({ speed: driving ? state.speed : 0, running: mode !== 'title' && !document.hidden, rain: sky.rain });
    renderer.render(scene, camera);
    if (!UNCAPPED) adaptResolution(frameMs, dt);
  }

  // --- Start -------------------------------------------------------------------------------

  applyChoices();
  ui.setSwitch('sound', journal.get().sound);
  updateCarModel(0);
  updateIntroShot(0);
  chase.snap(carView(), cameraOptions());
  resize();
  ui.ready(matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
  requestAnimationFrame(frame);

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
        gnomes: gnomes.getState(),
        cameraBlocked: chase.isBlocked(),
        camera: camera.position.toArray(),
        pixelRatio,
        input: controls.read(),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      }),
      teleport(x, z, heading = state.heading) {
        placeCar(state, { x, z, heading });
        updateCarModel(0);
        chase.snap(carView(), cameraOptions());
      },
      setSky: preset => atmosphere.setPreset(preset),
      setClock: seconds => atmosphere.setTime(seconds),
      shot(position, target) {
        chase.setMode('shot');
        debugShot.position.set(...position);
        debugShot.target.set(...target);
        chase.snap(carView(), cameraOptions());
      },
      followCar: () => chase.setMode('chase'),
    };
  }
}
