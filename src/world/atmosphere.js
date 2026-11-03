// Day and night, passing rain (snow, in the snowy places, and now and then a blizzard), stars,
// fireflies and the occasional shooting star.
import * as THREE from 'three';
import { createRandom, smoothstep } from '../core/math.js';
import { terrainHeight } from './terrain.js';
import { lofotenness, winterness } from './layout.js';
import { createAurora } from './aurora.js';
import { HAZE, createSkyDome } from './sky.js';

const SKY_PRESETS = ['auto', 'sunset', 'night', 'rain', 'day', 'blizzard'];
const DAY_LENGTH = 360;

/** Keeps a world-anchored offset within `size` of the car, so effects don't move with it. */
const around = (seed, centre, size) => centre + ((((seed - centre) % size) + size * 1.5) % size) - size / 2;

/** Seconds per radian of the rain's cycle: a spell of rain comes round every `2π × RAIN_PACE` seconds, about three minutes. */
const RAIN_PACE = 31;
/** Every this many rain spells, one of them is a blizzard wherever the snow lies. */
const BLIZZARD_EVERY = 3;

/**
 * How much of a blizzard there is at a moment in the automatic cycle, 0 to 1, where it is
 * cold enough for snow. It rides on every third rain spell, but is wider than the rain: it
 * fades in over about fifteen seconds, stays for a minute or so, and fades out again, so the
 * snow that falls between blizzards is the ordinary light fall.
 */
export function blizzardAt(time) {
  const wave = time / RAIN_PACE - 2.1;
  // Which spell of rain this is: the peak of the wave is the middle of the spell.
  const spell = Math.round((wave - Math.PI / 2) / (Math.PI * 2));
  if (((spell % BLIZZARD_EVERY) + BLIZZARD_EVERY) % BLIZZARD_EVERY !== BLIZZARD_EVERY - 1) return 0;
  return smoothstep(Math.sin(wave), 0, 0.5);
}

/** Target sky for a moment in the automatic cycle, or for a fixed preset. */
export function skyConditions(time, preset = 'auto') {
  const phase = (time / DAY_LENGTH + 0.2) % 1;
  // The sun lingers low in the sky, so mornings and evenings last longer than they would.
  const arc = Math.sin(phase * Math.PI * 2);
  let altitude = Math.sign(arc) * Math.abs(arc) ** 1.8;
  let rain = smoothstep(Math.sin(time / RAIN_PACE - 2.1), 0.6, 0.92) * 0.75;
  let blizzard = blizzardAt(time);
  if (preset === 'sunset') [altitude, rain] = [0.04, 0];
  if (preset === 'night') [altitude, rain] = [-0.8, 0];
  if (preset === 'day') [altitude, rain] = [0.95, 0];
  if (preset === 'rain') [altitude, rain, blizzard] = [0.5, 0.95, 0];
  if (preset === 'blizzard') [altitude, rain, blizzard] = [0.5, 0.2, 1];
  if (preset !== 'auto' && preset !== 'blizzard') blizzard = 0;
  const day = smoothstep(altitude, -0.18, 0.38);
  const sunset = (1 - smoothstep(Math.abs(altitude), 0.04, 0.38)) * (1 - rain);
  return { day, sunset, rain, blizzard };
}

/**
 * The first morning from day `first` on, `hour` (0 to 1) of the way through the day, when it
 * isn't raining and won't start to for `dryFor` seconds.
 */
function dryMorning(first, hour, dryFor = 0) {
  for (let day = first; day < first + 10; day++) {
    const time = (day + hour) * DAY_LENGTH;
    let dry = true;
    for (let t = 0; t <= dryFor && dry; t += 10) {
      const sky = skyConditions(time + t);
      dry = sky.rain < 0.05 && sky.blizzard < 0.05;
    }
    if (dry) return time;
  }
  return (first + hour) * DAY_LENGTH;
}

const COLORS = Object.fromEntries(
  Object.entries({
    // The haze away from the sun, which is also the colour of the sky at the horizon.
    nightHaze: '#22385a',
    dayHaze: '#d6d9cf',
    sunsetHaze: '#e8b4a0',
    rainHaze: '#aebfc0',
    // The sky overhead.
    nightZenith: '#0d1a31',
    dayZenith: '#78b2d6',
    sunsetZenith: '#7f7fae',
    rainZenith: '#8c9da5',
    // The haze and the sky around the sun (or the moon, at night).
    nightGlow: '#3b5781',
    dayGlow: '#f7ead0',
    sunsetGlow: '#ffb067',
    rainGlow: '#c3cdca',
    sunDay: '#ffe4be',
    sunEvening: '#ffb47a',
    sunNight: '#9abadd',
    skyNight: '#9ebbd0',
    skyDay: '#e2e3dc',
    groundNight: '#526477',
    groundDay: '#86704e',
    skyEvening: '#f4c7a0',
    discDay: '#fff4d8',
    discEvening: '#ffcf8e',
    nightCloud: '#2c3d5e',
    dayCloud: '#f6f6f2',
    sunsetCloud: '#f3b9a6',
    rainCloud: '#b9c2c3',
    // In the winter, by day: a cold, pale, hazy blue, and the blue shade the snow lies in.
    winterHaze: '#aecbf0',
    winterZenith: '#8fb3d8',
    winterGlow: '#e6eefb',
    winterSky: '#9dbcf6',
    winterGround: '#5a7cc8',
    winterSun: '#e8f0ff',
    winterCloud: '#e3ecf7',
    // On the Lofoten coast by day the sun stays low: pink haze, peach glow and light, soft blue sky.
    coastHaze: '#e8bfc9',
    coastZenith: '#7f9bd8',
    coastGlow: '#f8c4b4',
    coastSky: '#b4c1f0',
    coastGround: '#8fa3c4',
    coastSun: '#dfe3f0',
    coastCloud: '#f5cdd2',
    // In a blizzard the air is full of snow: a bright, white-grey haze, never dark.
    stormHaze: '#e1e7ee',
    stormGlow: '#eef2f6',
  }).map(([name, hex]) => [name, new THREE.Color(hex)]),
);

/** The sun rises and sets in the same quarter of the sky, behind the valley as seen from the start. */
const SUN_BEARING = new THREE.Vector2(-490, -760).normalize();
const MOON_DIRECTION = new THREE.Vector3(340, 420, -820).normalize();

export function createAtmosphere(scene, sun, ambient) {
  const random = createRandom(1538);
  let preset = 'auto';
  // The game starts early on a dry morning, with the sun still low.
  let time = dryMorning(0, 0.86, 100);
  let day = 1;
  let sunset = 0;
  let rain = 0;
  // How much of a blizzard there is in the sky, wherever the car is; and how much of one the car is in.
  let blizzard = 0;
  let storm = 0;
  // The rain that is falling as rain, which is none in the snowy places.
  let rainfall = 0;
  // How far into the winter the car is, a little behind where it is, so a jump takes a moment.
  let winter = 0;
  // And how far into the Lofoten coast, the same way.
  let coast = 0;

  const dome = createSkyDome(scene.fog.color);
  scene.add(dome);
  const sky = dome.material.uniforms;
  const glow = new THREE.Color();
  const glowDirection = new THREE.Vector3();

  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const moon = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: '#f3efcf', fog: false }));
  moon.scale.setScalar(11);
  scene.add(moon);

  const starPositions = [];
  for (let i = 0; i < 450; i++) {
    const angle = random() * Math.PI * 2;
    const y = 0.1 + random() * 0.9;
    const r = Math.sqrt(1 - y * y);
    starPositions.push(Math.sin(angle) * r * 1100, y * 1100, Math.cos(angle) * r * 1100);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3)),
    new THREE.PointsMaterial({
      color: '#fff3d2',
      size: 2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    }),
  );
  scene.add(stars);

  const shootingStar = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
    new THREE.LineBasicMaterial({ color: '#fff8e0', transparent: true, opacity: 0, fog: false }),
  );
  shootingStar.frustumCulled = false;
  scene.add(shootingStar);
  const meteor = { life: 0, next: 6, from: new THREE.Vector3(), velocity: new THREE.Vector3() };

  const RAIN_COUNT = 900;
  const rainPositions = new Float32Array(RAIN_COUNT * 6);
  const rainSeeds = Array.from({ length: RAIN_COUNT }, () => ({
    x: (random() - 0.5) * 75,
    z: (random() - 0.5) * 75,
    y: random() * 35,
    speed: 9 + random() * 8,
  }));
  const rainGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainLines = new THREE.LineSegments(
    rainGeometry,
    new THREE.LineBasicMaterial({ color: '#d5e1df', transparent: true, opacity: 0, depthWrite: false }),
  );
  rainLines.frustumCulled = false;
  scene.add(rainLines);

  const FLY_COUNT = 55;
  const flyPositions = new Float32Array(FLY_COUNT * 3);
  const flySeeds = Array.from({ length: FLY_COUNT }, () => ({
    x: (random() - 0.5) * 100,
    z: (random() - 0.5) * 100,
    y: 1 + random() * 3,
    phase: random() * 7,
  }));
  const flyGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(flyPositions, 3));
  const flies = new THREE.Points(
    flyGeometry,
    new THREE.PointsMaterial({ color: '#f5e5a2', size: 0.15, transparent: true, opacity: 0, depthWrite: false }),
  );
  flies.frustumCulled = false;
  scene.add(flies);

  // A light fall of snow round the camera, a few flakes in the air at a time.
  const SNOW_COUNT = 260;
  const snowPositions = new Float32Array(SNOW_COUNT * 3);
  const snowSeeds = Array.from({ length: SNOW_COUNT }, () => ({
    x: (random() - 0.5) * 70,
    z: (random() - 0.5) * 70,
    y: random() * 24,
    speed: 0.8 + random() * 0.9,
    phase: random() * 7,
  }));
  const snowGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  const snowfall = new THREE.Points(
    snowGeometry,
    new THREE.PointsMaterial({
      color: '#ffffff',
      size: 3,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  snowfall.frustumCulled = false;
  scene.add(snowfall);

  // The flakes of a blizzard: many more, bigger and driven at a slant by a wind that rises and falls, so
  // they swirl past the car. Not drawn at all when there is no storm.
  const BLIZZARD_COUNT = 3600;
  const BLIZZARD_SIZE = 44;
  const BLIZZARD_HEIGHT = 16;
  const blizzardPositions = new Float32Array(BLIZZARD_COUNT * 3);
  const blizzardSeeds = Array.from({ length: BLIZZARD_COUNT }, () => ({
    x: (random() - 0.5) * BLIZZARD_SIZE,
    z: (random() - 0.5) * BLIZZARD_SIZE,
    y: random() * BLIZZARD_HEIGHT,
    speed: 2 + random() * 1.8,
    phase: random() * 7,
  }));
  const blizzardGeometry = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.BufferAttribute(blizzardPositions, 3),
  );
  const blizzardFlakes = new THREE.Points(
    blizzardGeometry,
    new THREE.PointsMaterial({
      color: '#ffffff',
      size: 5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  blizzardFlakes.frustumCulled = false;
  scene.add(blizzardFlakes);

  const aurora = createAurora(scene);

  function updateShootingStar(dt, centre) {
    meteor.next -= dt;
    if (meteor.life <= 0 && meteor.next <= 0 && day < 0.25 && rain < 0.2 && storm < 0.2) {
      const angle = random() * Math.PI * 2;
      meteor.from.set(centre.x + Math.sin(angle) * 600, 380 + random() * 200, centre.z + Math.cos(angle) * 600);
      meteor.velocity.set(-Math.sin(angle + 1.2) * 260, -70, -Math.cos(angle + 1.2) * 260);
      meteor.life = 0.9;
      meteor.next = 8 + random() * 14;
    }
    if (meteor.life > 0) {
      meteor.life -= dt;
      meteor.from.addScaledVector(meteor.velocity, dt);
      const p = shootingStar.geometry.attributes.position;
      p.setXYZ(0, meteor.from.x, meteor.from.y, meteor.from.z);
      p.setXYZ(
        1,
        meteor.from.x - meteor.velocity.x * 0.18,
        meteor.from.y - meteor.velocity.y * 0.18,
        meteor.from.z - meteor.velocity.z * 0.18,
      );
      p.needsUpdate = true;
    }
    shootingStar.material.opacity = Math.max(0, Math.sin((Math.max(0, meteor.life) / 0.9) * Math.PI)) * (1 - day);
    shootingStar.visible = meteor.life > 0;
  }

  return {
    setPreset(value) {
      if (SKY_PRESETS.includes(value)) preset = value;
    },
    getState: () => ({ preset, time, day, sunset, rain, rainfall, blizzard: storm }),
    setTime(seconds) {
      time = seconds;
    },
    /** Back to the automatic cycle, on a dry morning. */
    wakeUp() {
      preset = 'auto';
      time = dryMorning(1, 0.83);
    },
    /** `centre` is where the car is: the sun, rain and fireflies are centred on it. */
    update(dt, centre, running) {
      if (running) time += dt;
      const target = skyConditions(time, preset);
      const blend = 1 - Math.exp(-dt * 0.8);
      day += (target.day - day) * blend;
      sunset += (target.sunset - sunset) * blend;
      rain += (target.rain - rain) * blend;
      blizzard += (target.blizzard - blizzard) * blend;
      winter += (winterness(centre.x, centre.z) - winter) * (1 - Math.exp(-dt * 2));
      // In the snowy places the rain falls as snow, so its streaks and its sound fade out as the car goes in.
      const snowy = Math.min(1, winter * 1.4);
      rainfall = rain * (1 - snowy);
      // And a blizzard blows only there, as far in as the snow lies.
      storm = blizzard * snowy;
      // The grey of a wet sky, which a blizzard brings too, only a little paler.
      const grey = Math.max(rain, storm * 0.6);
      coast += (lofotenness(centre.x, centre.z) - coast) * (1 - Math.exp(-dt * 2));
      // By day only: at night the snow is lit by the moon and stars, and the sky stays dark.
      const cold = winter * day;
      // The pink and peach of the low sun, by day, over the cold blue.
      const low = coast * day;

      const haze = scene.fog.color
        .copy(COLORS.nightHaze)
        .lerp(COLORS.dayHaze, day)
        .lerp(COLORS.sunsetHaze, sunset * 0.8)
        .lerp(COLORS.rainHaze, grey * 0.65)
        .lerp(COLORS.winterHaze, cold * 0.8)
        .lerp(COLORS.coastHaze, low * 0.7 * (1 - storm * 0.6))
        .lerp(COLORS.stormHaze, storm * 0.9 * (0.3 + 0.7 * day));
      scene.background.copy(haze);
      // A blizzard thickens the air more than rain does, but the road stays clear some 60 m ahead. The coast's
      // low sun lights the haze round it, so there the haze is kept thin: the mountains stay dark grey in it.
      scene.fog.density = (0.0011 + winter * 0.0007 + Math.max(rain * 0.0035, storm * 0.0042)) * (1 - low * 0.3);
      sky.zenith.value
        .copy(COLORS.nightZenith)
        .lerp(COLORS.dayZenith, day)
        .lerp(COLORS.sunsetZenith, sunset * 0.7)
        .lerp(COLORS.rainZenith, grey * 0.7)
        .lerp(COLORS.winterZenith, cold * 0.7)
        .lerp(COLORS.coastZenith, low * 0.65);
      glow
        .copy(COLORS.nightGlow)
        .lerp(COLORS.dayGlow, day)
        .lerp(COLORS.sunsetGlow, sunset)
        .lerp(COLORS.rainGlow, grey * 0.8)
        .lerp(COLORS.winterGlow, cold * 0.7)
        .lerp(COLORS.coastGlow, low * 0.6)
        .lerp(COLORS.stormGlow, storm * 0.5 * day)
        .toArray(HAZE.sunColor);
      // Never so dark that nothing can be seen: the snow gives back a little of the stars at night.
      ambient.intensity = 0.85 + day * 0.4 + sunset * 0.3 + cold * 0.15 + coast * (1 - day) * 0.15;
      ambient.color
        .copy(COLORS.skyNight)
        .lerp(COLORS.skyDay, day)
        .lerp(COLORS.skyEvening, sunset * 0.55)
        .lerp(COLORS.winterSky, winter * 0.75 * (0.4 + 0.6 * day))
        .lerp(COLORS.coastSky, low * 0.6);
      ambient.groundColor
        .copy(COLORS.groundNight)
        .lerp(COLORS.groundDay, day)
        .lerp(COLORS.winterGround, winter * 0.8 * day)
        .lerp(COLORS.coastGround, low * 0.6);

      // The sun is never high, and low on the horizon in the evening, where the haze glows round it.
      const elevation = 0.03 + day * 0.42 * (1 - 0.65 * coast) - sunset * 0.06;
      const sunDirection = sky.sunDirection.value.set(
        SUN_BEARING.x * Math.cos(elevation),
        Math.sin(elevation),
        SUN_BEARING.y * Math.cos(elevation),
      );
      glowDirection
        .copy(MOON_DIRECTION)
        .lerp(sunDirection, smoothstep(day, 0.12, 0.4))
        .normalize()
        .toArray(HAZE.sunDirection);
      sky.sunColor.value
        .copy(COLORS.discDay)
        .lerp(COLORS.discEvening, sunset)
        .multiplyScalar(smoothstep(day, 0.08, 0.2) * (1 - smoothstep(grey, 0.3, 0.6)));
      sky.cloudColor.value
        .copy(COLORS.nightCloud)
        .lerp(COLORS.dayCloud, day)
        .lerp(COLORS.sunsetCloud, sunset * 0.8)
        .lerp(COLORS.rainCloud, grey)
        .lerp(COLORS.winterCloud, cold * 0.6)
        .lerp(COLORS.coastCloud, low * 0.7);
      sky.cloudCover.value = 0.3 + grey * 0.7;
      sky.time.value = time;

      // The light comes from the same side, a little higher, so the evening shadows are long.
      const ground = terrainHeight(centre.x, centre.z);
      const light = 0.32 + day * 0.58 * (1 - 0.5 * coast) - sunset * 0.22;
      sun.intensity = Math.max(0.25, 0.4 + day * 2.7 + sunset * 1.1 - grey * 1.6);
      sun.color
        .copy(COLORS.sunNight)
        .lerp(COLORS.sunDay, day)
        .lerp(COLORS.sunEvening, sunset)
        .lerp(COLORS.winterSun, cold * 0.7)
        .lerp(COLORS.coastSun, low * 0.8);
      sun.target.position.set(centre.x, ground, centre.z);
      sun.position.set(
        centre.x + SUN_BEARING.x * Math.cos(light) * 200,
        ground + Math.sin(light) * 200,
        centre.z + SUN_BEARING.y * Math.cos(light) * 200,
      );
      sun.target.updateMatrixWorld();

      moon.position.set(centre.x + 340, 420, centre.z - 820);
      moon.visible = day < 0.45;
      stars.position.set(centre.x, 0, centre.z);
      stars.material.opacity = (1 - day) * 0.85 * (1 - grey);
      stars.visible = day < 0.9;
      updateShootingStar(running ? dt : 0, centre);
      // The northern lights, on clear nights on the coast.
      aurora.update(time, centre, coast * smoothstep(1 - day, 0.45, 0.8) * (1 - grey));

      rainLines.visible = rainfall > 0.02;
      rainLines.material.opacity = rainfall * 0.55;
      if (rainLines.visible) {
        for (let i = 0, k = 0; i < RAIN_COUNT; i++, k += 6) {
          const seed = rainSeeds[i];
          const x = around(seed.x, centre.x, 75);
          const z = around(seed.z, centre.z, 75);
          const y = ground + ((((seed.y - time * seed.speed) % 35) + 35) % 35);
          rainPositions[k] = x;
          rainPositions[k + 1] = y;
          rainPositions[k + 2] = z;
          rainPositions[k + 3] = x - 0.18;
          rainPositions[k + 4] = y + 1.3;
          rainPositions[k + 5] = z + 0.08;
        }
        rainGeometry.attributes.position.needsUpdate = true;
      }

      snowfall.visible = winter > 0.02;
      snowfall.material.opacity = Math.min(1, winter * 1.4) * 0.8;
      if (snowfall.visible) {
        snowSeeds.forEach((flake, i) => {
          const x = around(flake.x, centre.x, 70) + Math.sin(time * 0.5 + flake.phase) * 1.2;
          const z = around(flake.z, centre.z, 70) + Math.cos(time * 0.4 + flake.phase) * 1.2;
          snowPositions[i * 3] = x;
          snowPositions[i * 3 + 1] = ground + ((((flake.y - time * flake.speed) % 24) + 24) % 24);
          snowPositions[i * 3 + 2] = z;
        });
        snowGeometry.attributes.position.needsUpdate = true;
      }

      blizzardFlakes.visible = storm > 0.02;
      blizzardFlakes.material.opacity = Math.min(1, storm * 1.5) * 0.95;
      if (blizzardFlakes.visible) {
        // How far the wind has carried the air by now: it gusts, so it is the sum of its speeds.
        const carried = 6 * time - 5 * Math.cos(time * 0.5);
        blizzardSeeds.forEach((flake, i) => {
          const swirl = time * 0.9 + flake.phase;
          const x = around(flake.x + carried * 0.94 + Math.sin(swirl) * 2.5, centre.x, BLIZZARD_SIZE);
          const z = around(flake.z + carried * 0.34 + Math.cos(swirl * 0.8) * 2.5, centre.z, BLIZZARD_SIZE);
          blizzardPositions[i * 3] = x;
          blizzardPositions[i * 3 + 1] =
            ground + ((((flake.y - time * flake.speed) % BLIZZARD_HEIGHT) + BLIZZARD_HEIGHT) % BLIZZARD_HEIGHT);
          blizzardPositions[i * 3 + 2] = z;
        });
        blizzardGeometry.attributes.position.needsUpdate = true;
      }

      flies.visible = day < 0.5;
      flies.material.opacity = (1 - day) * (1 - grey) * 0.85;
      if (flies.visible) {
        flySeeds.forEach((fly, i) => {
          const x = around(fly.x, centre.x, 100) + Math.sin(time * 0.3 + fly.phase) * 1.4;
          const z = around(fly.z, centre.z, 100);
          flyPositions[i * 3] = x;
          flyPositions[i * 3 + 1] = terrainHeight(x, z) + fly.y + Math.sin(time + fly.phase) * 0.5;
          flyPositions[i * 3 + 2] = z;
        });
        flyGeometry.attributes.position.needsUpdate = true;
      }
    },
  };
}
