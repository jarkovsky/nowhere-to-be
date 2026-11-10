// How each vehicle drives: its weight, power, brakes, tyres, gears and springs. The driving
// (driving.js) and the springs (chassis.js) read these; where the axles are comes from the
// vehicle's own wheels. No Three.js here, so it can be tested on its own.

/**
 * What every vehicle has unless it says otherwise.
 * - `power`: watts per kilogram at the wheels, which sets how fast it gathers speed once moving.
 * - `pull`: the most it can accelerate in its lowest gear, m/s², and so how steep a hill it climbs.
 * - `top`, `reverse`: the fastest it is driven forwards and backwards, m/s.
 * - `brakes`: the hardest it brakes on a dry road, m/s².
 * - `grip`: its tyres, as a share of an ordinary road tyre's grip.
 * - `drive`: the share of the drive that goes to the front wheels (1 front, 0 rear, 0.5 all four).
 * - `traction`: how much of the grip the driven wheels may use before traction control holds them.
 * - `cornering`: how hard the tyres push back for each radian they slide sideways, per unit of
 *   the weight on them, and `understeer` how much softer the front ones are than the back.
 * - `gyration`: how hard it is to turn, as a share of what its axles alone would make it.
 * - `stability`: how firmly stability control stops it turning faster than its grip carries it
 *   round, and `slide`, how far it may slide sideways, as a share of its speed.
 * - `height`: of its weight above the ground, m, which shifts the weight between the axles, and
 *   `balance`, the share of its weight on the front wheels standing still, if not as its axles have it.
 * - `drag`: air drag, per metre.
 * - `engineBrake`: how hard the engine holds it back with the pedals up, m/s², at full revs.
 * - `lock`: how far the front wheels turn, radians, and `rearSteer`, how far the back ones turn
 *   the other way when slow, as a share of that.
 * - `climb`: the tallest rock it can drive over, m, and `crawl` how fast it creeps over one, m/s.
 * - `clearance`: how high its underside is above the ground, m.
 * - `travel`: how far each wheel can rise into its arch and drop below its rest height, m (`up`
 *   and `down`), so how far its axles flex over rocks. The body's limits grow with it.
 * - `springs`: the body's bounce, in times a second, and `damping`, from 0 to 1.
 * - `squat` and `lean`: how far the body pitches and rolls for each m/s² it speeds up, slows
 *   or is thrown sideways, radians.
 * - `gears`: how fast it goes at the top of each gear, m/s, and `shift`, how long a change takes, s.
 */
const BASE = {
  power: 30,
  pull: 6,
  top: 14,
  reverse: 5,
  brakes: 8,
  grip: 1,
  drive: 0.5,
  traction: 0.85,
  cornering: 11,
  understeer: 0.88,
  gyration: 1,
  stability: 1,
  slide: 0.3,
  height: 0.75,
  drag: 0.0004,
  engineBrake: 1,
  lock: 0.58,
  rearSteer: 0,
  climb: 0.3,
  crawl: 1.4,
  clearance: 0.25,
  travel: { up: 0.13, down: 0.24 },
  springs: 1.4,
  damping: 0.3,
  squat: 0.0055,
  lean: 0.007,
  gears: [4, 6.8, 10, 13.5, 17.5],
  shift: 0.25,
};

/** Each vehicle in the garage, as it differs from the base. */
export const HANDLING = {
  // An off-road estate on big tyres, four-wheel drive, soft and tall.
  offroader: {
    climb: 0.75,
    crawl: 1.8,
    clearance: 0.36,
    travel: { up: 0.17, down: 0.36 },
    springs: 1.25,
    damping: 0.28,
    lean: 0.0085,
  },
  // A pickup, a little heavier and stiffer at the back.
  pickup: {
    power: 27,
    climb: 0.65,
    crawl: 1.6,
    clearance: 0.34,
    travel: { up: 0.17, down: 0.34 },
    springs: 1.35,
    height: 0.8,
  },
  // A tall front-wheel-drive van, slow to pick up speed and leaning in the bends.
  van: {
    power: 20,
    pull: 5,
    balance: 0.56,
    top: 13,
    drive: 1,
    grip: 0.95,
    height: 0.95,
    climb: 0.3,
    clearance: 0.2,
    springs: 1.3,
    lean: 0.0095,
    gears: [4.2, 7.5, 11.5, 16],
  },
  // An old rear-wheel-drive saloon on small wheels, low and soft.
  saloon: {
    power: 28,
    pull: 5,
    drive: 0,
    height: 0.55,
    climb: 0.22,
    clearance: 0.16,
    springs: 1.2,
    damping: 0.26,
    lean: 0.0085,
    gears: [5, 9, 13.5, 18],
  },
  // A farm tractor: heavy, slow and geared low, with big back wheels that climb anything.
  tractor: {
    power: 12,
    pull: 6,
    balance: 0.4,
    top: 10,
    reverse: 4,
    drive: 0.3,
    grip: 0.85,
    height: 1.05,
    climb: 0.85,
    crawl: 1.8,
    clearance: 0.45,
    travel: { up: 0.13, down: 0.34 },
    springs: 1.6,
    damping: 0.35,
    engineBrake: 1.6,
    gears: [2.4, 3.8, 5.8, 8.2, 11.5],
    shift: 0.35,
  },
  // A lorry pulling a loaded trailer: very heavy, slow to get going and to stop, on many gears.
  lorry: {
    power: 9,
    pull: 5,
    balance: 0.35,
    top: 12.5,
    reverse: 3.5,
    brakes: 5.5,
    drive: 0,
    grip: 0.85,
    cornering: 8,
    gyration: 1.15,
    height: 1.25,
    drag: 0.00015,
    engineBrake: 0.8,
    lock: 0.78,
    climb: 0.42,
    crawl: 1.1,
    clearance: 0.32,
    springs: 1.15,
    damping: 0.3,
    squat: 0.004,
    lean: 0.0075,
    gears: [2.2, 3.1, 4.3, 5.8, 7.6, 9.8, 12.5, 16],
    shift: 0.45,
  },
  // A rigid lorry carrying a digger: as slow as the lorry, on a longer wheelbase, with its last
  // axle steering so it can still get round a hairpin.
  flatbed: {
    power: 10,
    pull: 5,
    balance: 0.4,
    top: 12.5,
    reverse: 3.5,
    brakes: 5.8,
    drive: 0,
    grip: 0.85,
    cornering: 8,
    gyration: 1.1,
    height: 1.3,
    drag: 0.0002,
    engineBrake: 0.9,
    lock: 0.78,
    rearSteer: 0.6,
    climb: 0.42,
    crawl: 1.1,
    clearance: 0.32,
    springs: 1.2,
    damping: 0.3,
    squat: 0.004,
    lean: 0.0075,
    gears: [2.2, 3.1, 4.3, 5.8, 7.6, 9.8, 12.5, 16],
    shift: 0.45,
  },
  // An expedition truck on a Unimog: portal axles and huge tyres, the best of all over rocks.
  expedition: {
    power: 15,
    pull: 6,
    top: 12.5,
    reverse: 4,
    brakes: 6.5,
    grip: 0.95,
    cornering: 9,
    gyration: 1.05,
    height: 1.2,
    drag: 0.0003,
    lock: 0.62,
    climb: 0.95,
    crawl: 2.2,
    clearance: 0.5,
    travel: { up: 0.17, down: 0.38 },
    springs: 1.15,
    damping: 0.3,
    lean: 0.008,
    gears: [2.6, 4, 6, 8.6, 11.6, 15],
    shift: 0.35,
  },
  // A rally car: light, quick and four-wheel drive, the traction control loose so it can slide.
  hyundai: {
    power: 55,
    pull: 7.5,
    top: 16,
    brakes: 9,
    grip: 1.05,
    drive: 0.42,
    traction: 0.97,
    cornering: 13,
    understeer: 0.95,
    gyration: 0.9,
    stability: 0.45,
    slide: 0.6,
    height: 0.5,
    climb: 0.3,
    clearance: 0.22,
    springs: 1.6,
    damping: 0.36,
    squat: 0.004,
    lean: 0.005,
    gears: [4.6, 7.2, 10, 13, 16.5, 21],
    shift: 0.12,
  },
  // A racing car on slicks: very light at the front, stiff, low and quick to turn in.
  mercedes: {
    power: 70,
    pull: 8,
    top: 17,
    brakes: 10,
    grip: 1.2,
    drive: 0,
    traction: 0.9,
    cornering: 16,
    understeer: 0.94,
    gyration: 0.9,
    stability: 0.8,
    slide: 0.4,
    height: 0.42,
    drag: 0.0003,
    climb: 0.12,
    clearance: 0.1,
    springs: 2.3,
    damping: 0.42,
    squat: 0.0022,
    lean: 0.0025,
    gears: [6, 9, 12.5, 16, 20, 25],
    shift: 0.1,
  },
  // A little roadster: light and nimble, rear-wheel drive, low to the ground.
  miata: {
    power: 40,
    pull: 6.5,
    top: 15,
    brakes: 9,
    drive: 0,
    traction: 0.9,
    cornering: 13,
    understeer: 0.92,
    gyration: 0.92,
    stability: 0.7,
    slide: 0.45,
    height: 0.45,
    drag: 0.00035,
    climb: 0.18,
    clearance: 0.13,
    springs: 1.7,
    damping: 0.36,
    squat: 0.004,
    lean: 0.0055,
    gears: [4.6, 7.6, 11, 14.5, 19],
    shift: 0.18,
  },
};

/** The off-roader's wheels, where they are when no vehicle is given. */
const OFFROADER_WHEELS = [-1.08, 1.08].flatMap(x => [-1.2, 1.24].map(z => ({ x, z })));

/**
 * The handling of the vehicle called `name`, with its axles from its `wheels` ({ x, z } each, the
 * front ones ahead of its middle, at negative z): `front` and `rear`, how far its front and back
 * axles are from its middle (a pair of back axles counting as one between them), `wheelbase`
 * and `track`, how far apart its wheels are across.
 */
export function handlingOf(name = 'offroader', wheels = OFFROADER_WHEELS) {
  const mean = list => list.reduce((sum, z) => sum + z, 0) / list.length;
  const zs = wheels.map(wheel => wheel.z);
  const front = -mean(zs.filter(z => z < 0));
  const rear = mean(zs.filter(z => z >= 0));
  const track = 2 * Math.max(...wheels.map(wheel => Math.abs(wheel.x)));
  return { name, ...BASE, ...HANDLING[name], front, rear, wheelbase: front + rear, track };
}

/** The off-roader, the vehicle every game starts in and the one a car without its own handling drives like. */
export const DEFAULT_HANDLING = handlingOf();
