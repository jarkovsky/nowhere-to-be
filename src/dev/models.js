// Every vehicle, machine, animal and plant in the game that is built on its own and then put
// in the world, each made at the origin on flat ground, front to -Z, for the object viewer
// and the geometry checks.
import * as THREE from 'three';
import { COLORS, VEHICLES } from '../core/journal.js';
import { createCar } from '../vehicles/car.js';
import {
  ambulance,
  armyCar,
  bus,
  camperVan,
  createVehicle,
  deliveryVan,
  fireEngine,
  offRoader,
  pickup,
  policeCar,
  saloon,
  tanker,
} from '../vehicles/traffic.js';
import { buildPlane } from '../vehicles/plane.js';
import { AIR_AMBULANCE, VALLEY_RESCUE, buildHelicopter } from '../vehicles/helicopter.js';
import { railbus } from '../vehicles/train.js';
import { combineHarvester, farmTractor, stalkGeometry } from '../world/landmarks/fields.js';
import { dumpTruck, excavator, grader, roller, skidSteer } from '../world/landmarks/roadworks.js';
import { buildTractor } from '../world/mudhole.js';
import { cow, deer, duck, eagle, fish, fox, rabbit, sheep } from '../world/wildlife.js';
import { wolf } from '../world/wolves.js';
import { KINDS } from '../world/herds.js';
import { chickenGeometry } from '../world/chickens.js';
import {
  birchGeometry,
  bushGeometry,
  logGeometry,
  pineGeometry,
  roundTreeGeometry,
  stumpGeometry,
} from '../world/scenery.js';
import { boulderGeometry } from '../world/rocks.js';
import { PartsBuilder, vertexColorMaterial } from '../world/build.js';
import { foliageMaterial } from '../world/detail.js';

const NAMES = {
  offroader: 'Off-roader',
  pickup: 'Pickup',
  van: 'Camper van',
  saloon: 'Saloon',
  tractor: 'Tractor',
  lorry: 'Lorry',
  hyundai: 'Rally car',
  mercedes: 'Racing car',
  miata: 'Roadster',
};

/** The garage's vehicles as the player drives them, in a paint, with roof items, and the lamps on at `night`. */
function garageVehicle(vehicle, color, decorations = [], night = 0) {
  const car = createCar();
  car.setLights(night, false);
  car.customize(color, decorations, vehicle);
  const root = new THREE.Group();
  root.add(car.root);
  car.root.position.y = -0.06;
  if (car.trailer) {
    root.add(car.towed);
    const [hx, hy, hz] = car.trailer.spec.hitch;
    car.trailer.root.position.set(hx, hy - 0.06, hz);
  }
  return root;
}

/** A plain mesh of a geometry painted by its vertices, or by tints like the foliage. */
function plant(geometry, tint) {
  const mesh = new THREE.InstancedMesh(geometry, tint ? foliageMaterial('trees') : vertexColorMaterial, 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  if (tint) mesh.setColorAt(0, new THREE.Color(tint));
  return mesh;
}

/** One animal from a herd, standing: its body, its head on its neck and a leg at each hip. */
function herdAnimal(kind) {
  const spec = KINDS[kind];
  const root = new THREE.Group();
  const piece = build => new THREE.Mesh(build(new PartsBuilder()).geometry(), vertexColorMaterial);
  root.add(piece(spec.body));
  const head = piece(spec.head);
  head.position.set(spec.neck[0], spec.neck[1], 0);
  root.add(head);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const leg = piece(spec.leg);
      leg.position.set(x * spec.feet[0], spec.hip, z * spec.feet[1]);
      root.add(leg);
    }
  }
  // Herd animals face +X; turn them to face -Z like everything else here.
  root.rotation.y = Math.PI / 2;
  return root;
}

/** Wraps a model built facing +X so it faces -Z. */
const turned = object => {
  const root = new THREE.Group();
  object.rotation.y = Math.PI / 2;
  root.add(object);
  return root;
};

const traffic = model => () => createVehicle(model).root;

/**
 * The models, as { id, name, group, create }: `create()` returns a new Object3D standing on
 * y = 0. `size` is roughly how big it is across, for framing.
 */
export const MODELS = [
  ...VEHICLES.flatMap(vehicle =>
    COLORS.filter(color => color !== 'rainbow').map(color => ({
      id: `garage.${vehicle}.${color}`,
      name: `${NAMES[vehicle] ?? vehicle} (${color})`,
      group: 'Garage',
      size: vehicle === 'lorry' ? 18 : 5,
      create: () => garageVehicle(vehicle, color),
    })),
  ),
  {
    id: 'garage.offroader.tent',
    name: 'Off-roader with the roof tent, flag, teddy and gnome',
    group: 'Garage',
    size: 5,
    create: () => garageVehicle('offroader', 'orange', ['tent', 'flag', 'teddy', 'gnome']),
  },
  {
    id: 'garage.miata.lamps',
    name: 'Roadster with its lamps up, the tent packed on the boot, flag, teddy and gnome',
    group: 'Garage',
    size: 5,
    create: () => garageVehicle('miata', 'orange', ['tent', 'flag', 'teddy', 'gnome'], 1),
  },
  ...[
    ['camper', 'Camper van', camperVan],
    ['pickup', 'Pickup', pickup],
    ['saloon', 'Saloon', saloon],
    ['bus', 'Bus', bus],
    ['tanker', 'Fuel tanker', tanker],
    ['delivery', 'Delivery van', deliveryVan],
    ['ambulance', 'Ambulance', ambulance],
    ['fire', 'Fire engine', fireEngine],
    ['police', 'Police car', policeCar],
    ['army', 'Army off-roader', armyCar],
  ].map(([id, name, model]) => ({
    id: `traffic.${id}`,
    name,
    group: 'Traffic',
    size: 8,
    create: traffic(model()),
  })),
  ...[
    ['kayaks', '#d2a540'],
    ['cans', '#3f6e5a'],
  ].map(([load, paint]) => ({
    id: `traffic.convoy.${load}`,
    name: `Convoy off-roader (${load})`,
    group: 'Traffic',
    size: 6,
    create: traffic(offRoader(paint, load)()),
  })),
  {
    id: 'air.plane',
    name: 'Plane (white)',
    group: 'Aircraft and trains',
    size: 12,
    create: () => buildPlane({ body: '#f4f2ea', trim: '#c8402f', stripe: '#2f5d8a' }).root,
  },
  {
    id: 'air.plane.yellow',
    name: 'Plane (yellow)',
    group: 'Aircraft and trains',
    size: 12,
    create: () => buildPlane({ body: '#f2d64b', trim: '#2f5d8a', stripe: '#2f5d8a' }).root,
  },
  {
    id: 'air.helicopter',
    name: 'Rescue helicopter',
    group: 'Aircraft and trains',
    size: 12,
    create: () => buildHelicopter(VALLEY_RESCUE.livery).root,
  },
  {
    id: 'air.krystof',
    name: 'Kryštof air ambulance',
    group: 'Aircraft and trains',
    size: 12,
    create: () => buildHelicopter(AIR_AMBULANCE.livery).root,
  },
  { id: 'rail.railbus', name: 'Railbus', group: 'Aircraft and trains', size: 16, create: () => railbus() },
  {
    id: 'farm.plough',
    name: 'Tractor with plough',
    group: 'Machines',
    size: 8,
    create: () => farmTractor('#b5402f', 'plough').root,
  },
  {
    id: 'farm.mower',
    name: 'Tractor with mower',
    group: 'Machines',
    size: 8,
    create: () => farmTractor('#4f8a4b', 'mower').root,
  },
  { id: 'farm.combine', name: 'Combine harvester', group: 'Machines', size: 10, create: () => combineHarvester().root },
  { id: 'farm.tow', name: 'Tractor from the mud hole', group: 'Machines', size: 6, create: () => buildTractor().root },
  {
    id: 'works.excavator',
    name: 'Excavator',
    group: 'Machines',
    size: 10,
    create: () => {
      const digger = excavator();
      digger.update?.(0);
      return digger.root;
    },
  },
  { id: 'works.truck', name: 'Dump truck', group: 'Machines', size: 9, create: () => dumpTruck() },
  { id: 'works.roller', name: 'Road roller', group: 'Machines', size: 6, create: () => roller().root },
  { id: 'works.grader', name: 'Grader', group: 'Machines', size: 9, create: () => grader().root },
  { id: 'works.loader', name: 'Skid steer loader', group: 'Machines', size: 5, create: () => skidSteer().root },
  ...[
    ['deer', 'Deer', () => turned(deer().root)],
    ['sheep', 'Sheep', () => turned(sheep().root)],
    ['cow', 'Cow', () => turned(cow().root)],
    ['fox', 'Fox', () => turned(fox().root)],
    ['rabbit', 'Rabbit', () => turned(rabbit().root)],
    ['duck', 'Duck', () => turned(duck(1).root)],
    ['eagle', 'Eagle', () => turned(eagle())],
    ['fish', 'Fish', () => turned(fish())],
    ['wolf', 'Wolf', () => turned(wolf(1).root)],
    ['hen', 'Hen', () => turned(new THREE.Mesh(chickenGeometry('#f1ece0', false), vertexColorMaterial))],
    ['rooster', 'Rooster', () => turned(new THREE.Mesh(chickenGeometry('#b5653a', true), vertexColorMaterial))],
    ...Object.keys(KINDS).map(kind => [kind, kind[0].toUpperCase() + kind.slice(1), () => herdAnimal(kind)]),
  ].map(([id, name, create]) => ({ id: `animal.${id}`, name, group: 'Animals', size: 3, create })),
  ...[
    ['pine', 'Spruce', () => plant(pineGeometry(true), '#4d6b42')],
    ['pine.far', 'Spruce (far off)', () => plant(pineGeometry(false), '#4d6b42')],
    ['round', 'Broadleaf tree', () => plant(roundTreeGeometry(), '#6b8a45')],
    ['birch', 'Birch', () => plant(birchGeometry(), '#8aa556')],
    ['bush', 'Bush', () => plant(bushGeometry(), '#5f7d45')],
    ['stump', 'Stump', () => plant(stumpGeometry())],
    ['log', 'Fallen log', () => plant(logGeometry())],
    ['boulder', 'Boulder', () => plant(boulderGeometry(1))],
    ['stalk', 'Wheat stalk', () => plant(stalkGeometry(), '#ffffff')],
  ].map(([id, name, create]) => ({
    id: `nature.${id}`,
    name,
    group: 'Nature',
    size: id === 'stalk' ? 1.2 : 6,
    create,
  })),
];
