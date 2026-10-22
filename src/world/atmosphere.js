// Day and night, passing rain, stars, fireflies and the occasional shooting star.
import * as THREE from 'three';
import { createRandom, smoothstep } from '../core/math.js';
import { terrainHeight } from './terrain.js';

const SKY_PRESETS = ['auto', 'sunset', 'night', 'rain', 'day'];
const DAY_LENGTH = 360;

/** Keeps a world-anchored offset within `size` of the car, so effects don't move with it. */
const around = (seed, centre, size) => centre + ((((seed - centre) % size) + size * 1.5) % size) - size / 2;

/** Target sky for a moment in the automatic cycle, or for a fixed preset. */
export function skyConditions(time, preset = 'auto') {
  const phase = (time / DAY_LENGTH + 0.2) % 1;
  let altitude = Math.sin(phase * Math.PI * 2);
  let rain = smoothstep(Math.sin(time / 31 - 2.1), 0.6, 0.92) * 0.75;
  if (preset === 'sunset') [altitude, rain] = [0.04, 0];
  if (preset === 'night') [altitude, rain] = [-0.8, 0];
  if (preset === 'day') [altitude, rain] = [0.95, 0];
  if (preset === 'rain') [altitude, rain] = [0.5, 0.95];
  const day = smoothstep(altitude, -0.18, 0.38);
  const sunset = (1 - smoothstep(Math.abs(altitude), 0.04, 0.38)) * (1 - rain);
  return { day, sunset, rain };
}

const COLORS = {
  nightSky: new THREE.Color('#233a55'),
  daySky: new THREE.Color('#dce5da'),
  sunsetSky: new THREE.Color('#efb38c'),
  rainSky: new THREE.Color('#aebfc0'),
  sunDay: new THREE.Color('#fff0cc'),
  sunEvening: new THREE.Color('#ffc087'),
  sunNight: new THREE.Color('#9abadd'),
  skyNight: new THREE.Color('#9ebbd0'),
  skyDay: new THREE.Color('#eef5ee'),
  groundNight: new THREE.Color('#526477'),
  groundDay: new THREE.Color('#788567'),
  skyEvening: new THREE.Color('#f4c7a0'),
};

export function createAtmosphere(scene, sun, ambient) {
  const random = createRandom(1538);
  let preset = 'auto';
  let time = 0;
  let day = 1;
  let sunset = 0;
  let rain = 0;

  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const sunDisc = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: '#fff0c2', fog: false }));
  sunDisc.scale.setScalar(18);
  const moon = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: '#f3efcf', fog: false }));
  moon.scale.setScalar(11);
  scene.add(sunDisc, moon);

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
      for (let day = 1; day < 10; day++) {
        const morning = (day + 0.83) * DAY_LENGTH;
        if (skyConditions(morning).rain < 0.05) {
          time = morning;
          break;
        }
      }
    },
    /** `centre` is where the car is: the sun, rain and fireflies are centred on it. */
    update(dt, centre, running) {
      if (running) time += dt;
      const target = skyConditions(time, preset);
      const blend = 1 - Math.exp(-dt * 0.8);
      day += (target.day - day) * blend;
      sunset += (target.sunset - sunset) * blend;
      rain += (target.rain - rain) * blend;

      scene.background
        .copy(COLORS.nightSky)
        .lerp(COLORS.daySky, day)
        .lerp(COLORS.sunsetSky, sunset * 0.8)
        .lerp(COLORS.rainSky, rain * 0.65);
      scene.fog.color.copy(scene.background);
      scene.fog.density = 0.0013 + rain * 0.003;
      ambient.intensity = 0.85 + day * 0.95 + sunset * 0.35;
      ambient.color
        .copy(COLORS.skyNight)
        .lerp(COLORS.skyDay, day)
        .lerp(COLORS.skyEvening, sunset * 0.55);
      ambient.groundColor.copy(COLORS.groundNight).lerp(COLORS.groundDay, day);
      sun.intensity = Math.max(0.25, 0.4 + day * 2 + sunset * 1.1 - rain * 1.3);
      sun.color.copy(COLORS.sunNight).lerp(COLORS.sunDay, day).lerp(COLORS.sunEvening, sunset);
      sun.position.set(centre.x - 90, 80 + day * 80 - sunset * 35, centre.z - 85);
      sun.target.position.set(centre.x, 0, centre.z);
      sun.target.updateMatrixWorld();

      sunDisc.position.set(centre.x - 490, 120 + day * 340 - sunset * 70, centre.z - 760);
      sunDisc.visible = day > 0.35 && rain < 0.5;
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
