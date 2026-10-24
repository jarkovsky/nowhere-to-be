// Day and night, passing rain, stars, fireflies and the occasional shooting star.
import * as THREE from 'three';
import { createRandom, smoothstep } from '../core/math.js';
import { terrainHeight } from './terrain.js';
import { HAZE, createSkyDome } from './sky.js';

const SKY_PRESETS = ['auto', 'sunset', 'night', 'rain', 'day'];
const DAY_LENGTH = 360;

/** Keeps a world-anchored offset within `size` of the car, so effects don't move with it. */
const around = (seed, centre, size) => centre + ((((seed - centre) % size) + size * 1.5) % size) - size / 2;

/** Target sky for a moment in the automatic cycle, or for a fixed preset. */
export function skyConditions(time, preset = 'auto') {
  const phase = (time / DAY_LENGTH + 0.2) % 1;
  // The sun lingers low in the sky, so mornings and evenings last longer than they would.
  const arc = Math.sin(phase * Math.PI * 2);
  let altitude = Math.sign(arc) * Math.abs(arc) ** 1.8;
  let rain = smoothstep(Math.sin(time / 31 - 2.1), 0.6, 0.92) * 0.75;
  if (preset === 'sunset') [altitude, rain] = [0.04, 0];
  if (preset === 'night') [altitude, rain] = [-0.8, 0];
  if (preset === 'day') [altitude, rain] = [0.95, 0];
  if (preset === 'rain') [altitude, rain] = [0.5, 0.95];
  const day = smoothstep(altitude, -0.18, 0.38);
  const sunset = (1 - smoothstep(Math.abs(altitude), 0.04, 0.38)) * (1 - rain);
  return { day, sunset, rain };
}

/**
 * The first morning from day `first` on, `hour` (0 to 1) of the way through the day, when it
 * isn't raining and won't start to for `dryFor` seconds.
 */
function dryMorning(first, hour, dryFor = 0) {
  for (let day = first; day < first + 10; day++) {
    const time = (day + hour) * DAY_LENGTH;
    let dry = true;
    for (let t = 0; t <= dryFor && dry; t += 10) dry = skyConditions(time + t).rain < 0.05;
    if (dry) return time;
  }
  return (first + hour) * DAY_LENGTH;
}

const COLORS = Object.fromEntries(
  Object.entries({
    // The haze away from the sun, which is also the colour of the sky at the horizon.
    nightHaze: '#22385a',
    dayHaze: '#c8dcdf',
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
    sunDay: '#ffefcc',
    sunEvening: '#ffb47a',
    sunNight: '#9abadd',
    skyNight: '#9ebbd0',
    skyDay: '#dce8f0',
    groundNight: '#526477',
    groundDay: '#7c735a',
    skyEvening: '#f4c7a0',
    discDay: '#fff4d8',
    discEvening: '#ffcf8e',
    nightCloud: '#2c3d5e',
    dayCloud: '#f6f6f2',
    sunsetCloud: '#f3b9a6',
    rainCloud: '#b9c2c3',
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

  function updateShootingStar(dt, centre) {
    meteor.next -= dt;
    if (meteor.life <= 0 && meteor.next <= 0 && day < 0.25 && rain < 0.2) {
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
    getState: () => ({ preset, time, day, sunset, rain }),
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

      const haze = scene.fog.color
        .copy(COLORS.nightHaze)
        .lerp(COLORS.dayHaze, day)
        .lerp(COLORS.sunsetHaze, sunset * 0.8)
        .lerp(COLORS.rainHaze, rain * 0.65);
      scene.background.copy(haze);
      scene.fog.density = 0.0011 + rain * 0.0035;
      sky.zenith.value
        .copy(COLORS.nightZenith)
        .lerp(COLORS.dayZenith, day)
        .lerp(COLORS.sunsetZenith, sunset * 0.7)
        .lerp(COLORS.rainZenith, rain * 0.7);
      glow
        .copy(COLORS.nightGlow)
        .lerp(COLORS.dayGlow, day)
        .lerp(COLORS.sunsetGlow, sunset)
        .lerp(COLORS.rainGlow, rain * 0.8)
        .toArray(HAZE.sunColor);
      ambient.intensity = 0.85 + day * 0.4 + sunset * 0.3;
      ambient.color
        .copy(COLORS.skyNight)
        .lerp(COLORS.skyDay, day)
        .lerp(COLORS.skyEvening, sunset * 0.55);
      ambient.groundColor.copy(COLORS.groundNight).lerp(COLORS.groundDay, day);

      // The sun is never high, and low on the horizon in the evening, where the haze glows round it.
      const elevation = 0.03 + day * 0.42 - sunset * 0.06;
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
        .multiplyScalar(smoothstep(day, 0.08, 0.2) * (1 - smoothstep(rain, 0.3, 0.6)));
      sky.cloudColor.value
        .copy(COLORS.nightCloud)
        .lerp(COLORS.dayCloud, day)
        .lerp(COLORS.sunsetCloud, sunset * 0.8)
        .lerp(COLORS.rainCloud, rain);
      sky.cloudCover.value = 0.3 + rain * 0.7;
      sky.time.value = time;

      // The light comes from the same side, a little higher, so the evening shadows are long.
      const ground = terrainHeight(centre.x, centre.z);
      const light = 0.32 + day * 0.58 - sunset * 0.22;
      sun.intensity = Math.max(0.25, 0.4 + day * 2.7 + sunset * 1.1 - rain * 1.6);
      sun.color.copy(COLORS.sunNight).lerp(COLORS.sunDay, day).lerp(COLORS.sunEvening, sunset);
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
      stars.material.opacity = (1 - day) * 0.85 * (1 - rain);
      stars.visible = day < 0.9;
      updateShootingStar(running ? dt : 0, centre);

      rainLines.visible = rain > 0.02;
      rainLines.material.opacity = rain * 0.55;
      if (rainLines.visible) {
        const ground = terrainHeight(centre.x, centre.z);
        rainSeeds.forEach((seed, i) => {
          const x = around(seed.x, centre.x, 75);
          const z = around(seed.z, centre.z, 75);
          const y = ground + ((((seed.y - time * seed.speed) % 35) + 35) % 35);
          rainPositions.set([x, y, z, x - 0.18, y + 1.3, z + 0.08], i * 6);
        });
        rainGeometry.attributes.position.needsUpdate = true;
      }

      flies.visible = day < 0.5;
      flies.material.opacity = (1 - day) * (1 - rain) * 0.85;
      if (flies.visible) {
        flySeeds.forEach((fly, i) => {
          const x = around(fly.x, centre.x, 100) + Math.sin(time * 0.3 + fly.phase) * 1.4;
          const z = around(fly.z, centre.z, 100);
          flyPositions.set([x, terrainHeight(x, z) + fly.y + Math.sin(time + fly.phase) * 0.5, z], i * 3);
        });
        flyGeometry.attributes.position.needsUpdate = true;
      }
    },
  };
}
