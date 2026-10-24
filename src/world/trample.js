// Where a car drives through long grass or a crop, the stalks lie down the way it went: flat in
// a track under each wheel, bent well over under the car and a little beside it. They stand up
// again over a couple of minutes, and at once where the crop is cut. It is all kept in one small
// texture that moves along with the car, so it costs the same wherever the car goes: each texel
// holds how far the stalks there are laid over (R) and which way they lie (G, B). The texture
// wraps round, so each texel stands for every spot a whole texture's width apart, and only the
// one inside the window round the car counts. The grass and crop shaders read it, and bend the
// stalks just ahead of and beside each car as it pushes through them.
import * as THREE from 'three';

/** Texels across the texture, and the width of one in metres. */
const SIZE = 512;
const TEXEL = 0.2;
const SPAN = SIZE * TEXEL;
/** The window moves on once the car is this far from its middle, keeping what is behind the car. */
const SLACK = SPAN / 4;
/** How far the stalks rise again each second, out of 255: a flat track stands up in about two minutes. */
const RISE = 2;
/** How far over the stalks are laid: flat under the wheels, well over under the car, a little beside it. */
const WHEEL = 1;
const BODY = 0.8;
const BRUSH = 0.35;
/** Room beside the car where it brushes the stalks aside. */
const BRUSH_WIDTH = 0.35;
/** Cars that bend the stalks as they push through: the player's and the friends following it. */
export const TRAMPLERS = 3;
/**
 * How often the texture is sent to the graphics card while the stalks are changing. It is sent
 * whole: sending parts of it makes three.js ask the graphics card for its settings, which waits
 * for everything it is drawing to finish.
 */
const SEND = 1 / 20;
/** How often it is sent while the stalks are only rising again, which is too slow to see sooner. */
const RISE_SEND = 0.5;
/** Side of the cells of the grid that says where anything grows tall enough to be laid over. */
const CELL = 8;
const CELLS = 256;
const EMPTY = [0, 128, 128, 255];

const data = new Uint8Array(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE; i++) data.set(EMPTY, i * 4);
const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
texture.magFilter = texture.minFilter = THREE.LinearFilter;
texture.generateMipmaps = false;
texture.needsUpdate = true;

/**
 * The columns along each row that hold stalks laid over, whether any have been laid over, cut
 * or cleared since the texture was last sent, whether any have risen, and how long ago that was.
 */
const low = new Int16Array(SIZE).fill(SIZE);
const high = new Int16Array(SIZE).fill(-1);
let fresh = true;
let rising = false;
let sent = 0;
/** Where tall grass or a crop grows, in cells of the grid. */
const tall = new Uint8Array(CELLS * CELLS);
const middle = { x: Infinity, z: Infinity };
let rows = 0;
let cursor = 0;

/**
 * Shared with the shaders: the texture, the window it covers (its middle and width), and each
 * car pushing through as two vec4: where it is and the way it is going (x, z, way x, way z),
 * then how far its front and back are from there, half its width and its height above the sea.
 */
export const TRAMPLE = {
  map: { value: texture },
  window: { value: new THREE.Vector3(0, 0, SPAN) },
  cars: { value: Array.from({ length: TRAMPLERS * 2 }, (_, i) => new THREE.Vector4(0, 0, 0, i % 2 ? -1e5 : 1)) },
};

const mod = n => ((n % SIZE) + SIZE) % SIZE;

/** The first texel along one side of the window round `centre`, as a step along the ground. */
const first = centre => Math.floor((centre - SPAN / 2) / TEXEL);

function empty(k) {
  data[k] = 0;
  data[k + 1] = data[k + 2] = 128;
}

/**
 * Lays the stalks over by `amount` (0 to 1) the way (wx, wz) goes, in a rectangle facing (fx, fz)
 * from `ahead` metres in front of (x, z) to `behind` behind it and `half` to either side. Stalks
 * already laid over further stay as they are. With `amount` 0 and `force` the stalks there stand
 * up straight again.
 */
function press(x, z, fx, fz, ahead, behind, half, amount, wx, wz, force = false) {
  const value = Math.round(amount * 255);
  const gx = Math.round(wx * 127 + 128);
  const gz = Math.round(wz * 127 + 128);
  const length = Math.max(Math.abs(ahead), Math.abs(behind));
  const reachX = Math.abs(fx) * length + Math.abs(fz) * half;
  const reachZ = Math.abs(fz) * length + Math.abs(fx) * half;
  // Only inside the window: a texel outside it would stand for somewhere inside.
  const [i0, i1] = [Math.max(first(middle.x), Math.floor((x - reachX) / TEXEL)), Math.floor((x + reachX) / TEXEL)];
  const [j0, j1] = [Math.max(first(middle.z), Math.floor((z - reachZ) / TEXEL)), Math.floor((z + reachZ) / TEXEL)];
  for (let j = j0; j <= Math.min(j1, first(middle.z) + SIZE - 1); j++) {
    const dz = (j + 0.5) * TEXEL - z;
    const row = mod(j);
    for (let i = i0; i <= Math.min(i1, first(middle.x) + SIZE - 1); i++) {
      const dx = (i + 0.5) * TEXEL - x;
      const u = dx * fx + dz * fz;
      if (u > ahead || u < -behind || Math.abs(dx * fz - dz * fx) > half) continue;
      const column = mod(i);
      const k = (row * SIZE + column) * 4;
      if (force) {
        if (!data[k]) continue;
        empty(k);
      } else {
        if (value < data[k]) continue;
        data[k] = value;
        data[k + 1] = gx;
        data[k + 2] = gz;
        low[row] = Math.min(low[row], column);
        high[row] = Math.max(high[row], column);
      }
      fresh = true;
    }
  }
}

/** Moves the window to keep (x, z) well inside it, clearing what it no longer covers. */
function follow(x, z) {
  if (Math.max(Math.abs(x - middle.x), Math.abs(z - middle.z)) < SLACK) return;
  const next = { x: Math.round(x / TEXEL) * TEXEL, z: Math.round(z / TEXEL) * TEXEL };
  if (Number.isFinite(middle.x)) {
    // A texel stands for the spot `first + mod(i - first)` steps along: those whose spot changes are cleared.
    const [ax, bx, az, bz] = [first(middle.x), first(next.x), first(middle.z), first(next.z)];
    for (let row = 0; row < SIZE; row++) {
      const gone = az + mod(row - az) !== bz + mod(row - bz);
      for (let column = gone ? 0 : low[row]; column <= (gone ? SIZE - 1 : high[row]); column++) {
        if (gone || ax + mod(column - ax) !== bx + mod(column - bx)) empty((row * SIZE + column) * 4);
      }
      if (gone) [low[row], high[row]] = [SIZE, -1];
    }
  }
  Object.assign(middle, next);
  TRAMPLE.window.value.set(next.x, next.z, SPAN);
  fresh = true;
  sent = SEND;
}

/** The stalks rise a little, a few rows at a time so the whole texture is gone over once a second. */
function rise(dt) {
  rows += SIZE * dt;
  for (; rows >= 1; rows--) {
    const row = cursor;
    cursor = (cursor + 1) % SIZE;
    if (high[row] < 0) continue;
    let [lo, hi] = [SIZE, -1];
    for (let column = low[row]; column <= high[row]; column++) {
      const k = (row * SIZE + column) * 4;
      if (!data[k]) continue;
      data[k] = Math.max(0, data[k] - RISE);
      if (data[k]) [lo, hi] = [Math.min(lo, column), Math.max(hi, column)];
      else empty(k);
    }
    rising = true;
    [low[row], high[row]] = [lo, hi];
  }
}

const cellOf = (x, z) => {
  const cx = Math.floor(x / CELL) + CELLS / 2;
  const cz = Math.floor(z / CELL) + CELLS / 2;
  return cx >= 0 && cx < CELLS && cz >= 0 && cz < CELLS ? cz * CELLS + cx : -1;
};

/** Says that something tall enough to be laid over grows within `radius` of (x, z). */
export function growsTall(x, z, radius = 0) {
  // A car anywhere over it is in a marked cell.
  const reach = radius + 5;
  for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
    for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
      const cell = cellOf(cx * CELL, cz * CELL);
      if (cell >= 0) tall[cell] = 1;
    }
  }
}

/** Stands the stalks up straight again where they are cut: a rectangle as in `press`. */
export function cutTrample(x, z, fx, fz, ahead, behind, half) {
  if (Number.isFinite(middle.x)) press(x, z, fx, fz, ahead, behind, half, 0, 0, 0, true);
}

/**
 * Lays the stalks over under a car going `speed` (negative in reverse) where it is, if anything
 * grows tall enough there. A car is { x, z, heading, speed, wheels }, its wheels { x, z, radius }
 * in its own frame (front to -z).
 */
export function pressTrample({ x, z, heading, speed, wheels }) {
  if (Math.abs(speed) < 0.2 || !tall[cellOf(x, z)] || !Number.isFinite(middle.x)) return;
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  const way = Math.sign(speed);
  const [front, back, half] = extent(wheels);
  // Facing the way the car faces, laid the way it goes.
  press(x, z, -sin, -cos, front + BRUSH_WIDTH, back, half + BRUSH_WIDTH, BRUSH, -sin * way, -cos * way);
  press(x, z, -sin, -cos, front, back, half, BODY, -sin * way, -cos * way);
  for (const wheel of wheels) {
    const wx = x + wheel.x * cos + wheel.z * sin;
    const wz = z - wheel.x * sin + wheel.z * cos;
    press(wx, wz, -sin, -cos, wheel.radius * 0.45, wheel.radius * 0.45, 0.2, WHEEL, -sin * way, -cos * way);
  }
}

/** How far a car reaches in front of the middle of it and behind, and half its width, from its wheels. */
function extent(wheels) {
  let [front, back, half] = [0, 0, 0];
  for (const wheel of wheels) {
    front = Math.max(front, -wheel.z + wheel.radius + 0.35);
    back = Math.max(back, wheel.z + wheel.radius + 0.35);
    half = Math.max(half, Math.abs(wheel.x) + 0.2);
  }
  return [front, back, half];
}

/** How far over the stalks at (x, z) are laid, from 0 to 1 (0 outside the window). */
export function trampledAt(x, z) {
  if (Math.max(Math.abs(x - middle.x), Math.abs(z - middle.z)) > SPAN / 2) return 0;
  return data[(mod(Math.floor(z / TEXEL)) * SIZE + mod(Math.floor(x / TEXEL))) * 4] / 255;
}

/**
 * Presses the stalks down under the cars (see `pressTrample`), the first of them the player's,
 * which the window follows, and lets them rise again. Each car also has its height `y`, for
 * the shaders to bend the stalks ahead of it.
 */
export function updateTrample(dt, cars) {
  if (cars[0]) follow(cars[0].x, cars[0].z);
  rise(dt);
  for (let n = 0; n < TRAMPLERS; n++) {
    const [where, size] = [TRAMPLE.cars.value[n * 2], TRAMPLE.cars.value[n * 2 + 1]];
    const car = cars[n];
    if (!car) {
      size.w = -1e5;
      continue;
    }
    // The way it is going, and the end it leads with. Standing still, it keeps the way it last went.
    const [sin, cos] = [Math.sin(car.heading), Math.cos(car.heading)];
    const way = Math.abs(car.speed) > 0.2 ? Math.sign(car.speed) : Math.sign(-where.z * sin - where.w * cos) || 1;
    const [front, back, half] = extent(car.wheels);
    where.set(car.x, car.z, -sin * way, -cos * way);
    size.set(way > 0 ? front : back, way > 0 ? back : front, half, car.y);
    pressTrample(car);
  }
  // Sent a little behind the car is enough, and right away once the window has moved.
  sent += dt;
  if ((fresh && sent >= SEND) || (rising && sent >= RISE_SEND)) {
    texture.needsUpdate = true;
    fresh = rising = false;
    sent = 0;
  }
}

/**
 * For the shaders: `trampledMap(p)` is how far the stalks at p (in the world, along the
 * ground) are laid over and which way, as ( amount, way x, way z ); `trampled(p)` adds the cars
 * pushing through them now, bent forward ahead of each car's leading end and aside along its
 * sides, for stalks standing at p (a point in the world).
 */
export const TRAMPLE_PARS = /* glsl */ `
  uniform sampler2D trampleMap;
  uniform vec3 trampleWindow;
  uniform vec4 trampleCars[ ${TRAMPLERS * 2} ];
  vec3 trampledMap( vec2 p ) {
    vec2 off = abs( p - trampleWindow.xy ) / ( 0.5 * trampleWindow.z );
    vec4 map = texture2D( trampleMap, p / trampleWindow.z );
    vec2 way = map.gb * 2.0 - 1.0;
    return vec3( map.r * ( 1.0 - smoothstep( 0.86, 0.98, max( off.x, off.y ) ) ), way / max( length( way ), 0.01 ) );
  }
  vec3 trampled( vec3 p ) {
    vec3 lay = trampledMap( p.xz );
    for ( int i = 0; i < ${TRAMPLERS}; i++ ) {
      vec4 car = trampleCars[ i * 2 ];
      vec4 size = trampleCars[ i * 2 + 1 ];
      vec2 to = p.xz - car.xy;
      float u = dot( to, car.zw );
      float v = dot( to, vec2( car.w, -car.z ) );
      float reach = step( abs( p.y - size.w ), 3.0 ) * step( -size.y, u );
      float ahead = 1.0 - smoothstep( size.x, size.x + 1.4, u );
      float aside = smoothstep( size.z - 0.4, size.z + 0.2, abs( v ) );
      float bend = reach * ahead * ( 1.0 - smoothstep( size.z, size.z + 0.7, abs( v ) ) ) * mix( 0.7, 0.45, aside );
      if ( bend > lay.x ) {
        // Forward ahead of the car, and outward along its sides.
        vec2 way = car.zw * ( 1.0 - aside * step( u, size.x ) ) + vec2( car.w, -car.z ) * sign( v ) * ( 0.35 + aside );
        lay = vec3( bend, normalize( way ) );
      }
    }
    return lay;
  }
`;

/** The uniforms the shaders that read it need. */
export const trampleUniforms = () => ({
  trampleMap: TRAMPLE.map,
  trampleWindow: TRAMPLE.window,
  trampleCars: TRAMPLE.cars,
});
