// A car's whole physics, a step at a time, as the game runs it: the driving (driving.js), which
// moves it over the ground, then its body on its springs (chassis.js), which says how it stands
// there and whether its wheels are on the ground for the next step. The game, the tests and the
// probes all step a car through here, so they drive the same car.
import { createChassis, springLayout, stepChassis, unsettle } from './chassis.js';
import { bodyOf, createCarState, placeCar, stepDriving } from './driving.js';
import { handlingOf } from './handling.js';

/** The off-roader's wheels and size, for a ride that is not fitted to a vehicle. */
const WHEELS = [-1.08, 1.08].flatMap(x => [-1.2, 1.24].map(z => ({ x, z, radius: 0.59 })));

/**
 * A car standing at `spawn` ({ x, z, heading }): its `state` (see driving.js), the `chassis` its
 * body rides on, and its wheels' `layout` for the springs. It drives as the off-roader until it
 * is fitted to another vehicle.
 */
export function createRide(spawn) {
  const ride = { state: createCarState(spawn), chassis: createChassis(), layout: null };
  return fitRide(ride, 'offroader', WHEELS);
}

/**
 * Fits the ride to the vehicle called `name` (see handling.js) with its `wheels` ({ x, z, radius }
 * each) and, if given, its `size` ({ front, back, half }, for what it bumps into). Its body starts
 * at rest where it stands.
 */
export function fitRide(ride, name, wheels, size) {
  ride.state.handling = handlingOf(name, wheels);
  if (size) ride.state.body = bodyOf(size);
  ride.layout = springLayout(wheels);
  unsettle(ride.chassis);
  return ride;
}

/** Puts the car at `place` ({ x, z, heading }), standing still, its body at rest there. */
export function placeRide(ride, place) {
  placeCar(ride.state, place);
  unsettle(ride.chassis);
  return ride;
}

/**
 * Moves the car on by `dt` seconds in `world` (see stepDriving, whose `height` is needed here)
 * with the driver's `input`. A car that is `held`, carried on a ferry or pulled on a rope, is
 * not driven: it goes where it is taken, and only its body moves on its springs.
 */
export function stepRide(ride, input, dt, world, { held = false } = {}) {
  const { state, chassis, layout } = ride;
  if (held) Object.assign(state, { yawRate: 0, throttle: 0, ahead: 0, aside: 0, vy: 0 });
  else stepDriving(state, input, dt, world);
  stepChassis(chassis, state, state.handling, layout, dt, world.height);
  return ride;
}
