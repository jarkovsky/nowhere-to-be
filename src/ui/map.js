// The full-screen map in the menu: the valley from above, north up, with a picture for each
// place and an arrow for the car pointing the way it faces. It opens on the car and can be
// dragged about and zoomed with a finger, a mouse or the keys. Tapping a place's picture picks
// it as the place to go to, which the minimap then points the way to; tapping it again lets go.
import { clamp } from '../core/math.js';
import { VALLEY_RADIUS } from '../world/layout.js';
import { MAP_EXTENT, MAP_PLACES, PAPER, arrowMarkup, badgeMarkup, drawMapLines } from './mapart.js';

/** How many metres fit across the shorter side of the screen when the map opens. */
const OPENING_SPAN = 600;
/** The closest it zooms in, in CSS pixels to a metre. */
const CLOSEST = 2.6;
/** How far a press of a zoom button or key zooms. */
const ZOOM_STEP = 1.6;
/** How far an arrow key moves the map, in CSS pixels. */
const PAN_STEP = 80;
/** A touch that moves less than this, in CSS pixels, and lifts within `TAP_TIME` ms is a tap. */
const TAP_SLOP = 10;
const TAP_TIME = 500;
/** How close to a picture, in CSS pixels, a tap picks it. */
const TAP_REACH = 30;

/**
 * `page` is the map's page in the menu and `car` the car's live state, read each time the map
 * opens. `target.place` is the place picked to go to, or null; `onPick` is told when it changes.
 */
export function createMapView(page, picture, car, target = { place: null }, onPick = () => {}) {
  const view = page.querySelector('.map-view');
  const canvas = view.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const layer = view.querySelector('.map-places');
  const you = view.querySelector('.map-you');
  const camera = { x: 0, z: 0, scale: 1 };
  const player = { x: 0, z: 0, heading: 0 };
  let markers = null;
  let open = false;
  let box = { left: 0, top: 0, width: 1, height: 1 };
  let ratio = 1;
  let queued = false;
  let tidiedAt = 0;
  /** While a finger or the wheel is moving the map, only the picture is drawn, which is quick. */
  let moving = false;
  let wheeling = 0;

  /** The badges for the places and the car's arrow, made the first time the map opens. */
  function build() {
    markers = MAP_PLACES.map(place => {
      const marker = document.createElement('span');
      marker.className = 'map-place';
      marker.setAttribute('role', 'img');
      marker.setAttribute('aria-label', place.name);
      marker.title = place.name;
      marker.style.setProperty('--badge', place.color);
      marker.innerHTML = badgeMarkup(place);
      marker.classList.toggle('chosen', target.place?.id === place.id);
      layer.append(marker);
      return { place, marker };
    });
    you.innerHTML = arrowMarkup();
  }

  function measure() {
    const rect = view.getBoundingClientRect();
    box = { left: rect.left, top: rect.top, width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    ratio = Math.min(devicePixelRatio || 1, 2);
    // Setting a canvas's size wipes it, so only when it has changed.
    const [width, height] = [Math.round(box.width * ratio), Math.round(box.height * ratio)];
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      redraw();
    }
  }

  /** The whole valley fits on the screen at the farthest zoom. */
  const farthest = () => Math.min(box.width, box.height) / (2 * VALLEY_RADIUS + 80);
  const opening = () => Math.min(box.width, box.height) / OPENING_SPAN;

  /** Keeps the zoom in range and the middle of the screen inside the fence. */
  function settle() {
    camera.scale = clamp(camera.scale, farthest(), CLOSEST);
    const reach = Math.hypot(camera.x, camera.z);
    if (reach > VALLEY_RADIUS) {
      camera.x *= VALLEY_RADIUS / reach;
      camera.z *= VALLEY_RADIUS / reach;
    }
  }

  function panBy(dx, dy) {
    camera.x -= dx / camera.scale;
    camera.z -= dy / camera.scale;
    settle();
    redraw();
  }

  /** Zooms by `factor`, keeping the spot under (sx, sy) on the screen where it is. */
  function zoomAt(factor, sx = box.width / 2, sy = box.height / 2) {
    const before = camera.scale;
    const x = camera.x + (sx - box.width / 2) / before;
    const z = camera.z + (sy - box.height / 2) / before;
    camera.scale = clamp(before * factor, farthest(), CLOSEST);
    camera.x = x - (sx - box.width / 2) / camera.scale;
    camera.z = z - (sy - box.height / 2) / camera.scale;
    settle();
    redraw();
  }

  /** Back to the car, and close enough to see what's round it. */
  function centreOnCar() {
    camera.x = player.x;
    camera.z = player.z;
    camera.scale = Math.max(camera.scale, opening());
    settle();
    redraw();
  }

  /**
   * Hides the badges that would crowd a more important one at this zoom. Only needed when the
   * zoom changes: moving the map doesn't change how close they are to each other.
   */
  function tidy() {
    const size = markers[0].marker.offsetWidth || 34;
    const kept = [];
    for (const { place, marker } of markers) {
      const x = place.x * camera.scale;
      const y = place.z * camera.scale;
      // The place picked to go to always shows.
      const clear = target.place?.id === place.id || kept.every(other => Math.hypot(other.x - x, other.y - y) > size);
      marker.classList.toggle('tucked', !clear);
      if (clear) kept.push({ x, y });
    }
    tidiedAt = camera.scale;
  }

  function draw() {
    queued = false;
    if (!open) return;
    const { width, height } = box;
    const s = camera.scale;
    const ox = width / 2 - camera.x * s;
    const oy = height / 2 - camera.z * s;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);
    view.classList.toggle('waiting', !picture.canvas);
    if (picture.canvas) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(picture.canvas, ox - MAP_EXTENT * s, oy - MAP_EXTENT * s, 2 * MAP_EXTENT * s, 2 * MAP_EXTENT * s);
      // The lines again on top, sharp at any zoom and never thinner than they show from afar;
      // once the map stops moving, as there are a lot of them.
      if (!moving && !wheeling) {
        ctx.setTransform(ratio * s, 0, 0, ratio * s, ratio * ox, ratio * oy);
        drawMapLines(ctx, s);
      }
    }
    if (Math.abs(s / tidiedAt - 1) > 0.01) tidy();
    for (const { place, marker } of markers) {
      marker.style.transform = `translate(${ox + place.x * s}px, ${oy + place.z * s}px) translate(-50%, -50%)`;
    }
    // Forward is -Z at heading 0 and turns anticlockwise as the heading grows; the arrow points up.
    you.style.transform = `translate(${ox + player.x * s}px, ${oy + player.z * s}px) translate(-50%, -50%) rotate(${-player.heading}rad)`;
  }

  function redraw() {
    if (queued || !open) return;
    queued = true;
    requestAnimationFrame(draw);
  }

  // --- Dragging, pinching, the wheel and the keys ---------------------------------------

  const pointers = new Map();
  const local = event => ({ x: event.clientX - box.left, y: event.clientY - box.top });
  /** The finger or button that went down on its own, while it might still be a tap. */
  let tap = null;

  /** Picks the place whose picture is nearest (sx, sy), or lets go of it if it was already picked. */
  function pickAt(sx, sy) {
    const s = camera.scale;
    let best = null;
    let nearest = TAP_REACH;
    for (const { place, marker } of markers) {
      if (marker.classList.contains('tucked')) continue;
      const px = box.width / 2 + (place.x - camera.x) * s;
      const py = box.height / 2 + (place.z - camera.z) * s;
      const distance = Math.hypot(px - sx, py - sy);
      if (distance < nearest) [best, nearest] = [place, distance];
    }
    if (!best) return;
    target.place = target.place?.id === best.id ? null : best;
    for (const { place, marker } of markers) marker.classList.toggle('chosen', target.place?.id === place.id);
    onPick(target.place);
  }

  view.addEventListener('pointerdown', event => {
    if (!open) return;
    event.preventDefault();
    if (!pointers.size) measure();
    view.setPointerCapture(event.pointerId);
    const point = local(event);
    tap = pointers.size ? null : { id: event.pointerId, ...point, at: event.timeStamp };
    pointers.set(event.pointerId, point);
    moving = true;
    view.classList.add('dragging');
  });
  view.addEventListener('pointermove', event => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const point = local(event);
    if (tap && Math.hypot(point.x - tap.x, point.y - tap.y) > TAP_SLOP) tap = null;
    const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
    if (!other) panBy(point.x - last.x, point.y - last.y);
    else {
      // Two fingers: zoom by how far they spread, about the point between them, and follow it.
      const spread =
        Math.hypot(point.x - other.x, point.y - other.y) / (Math.hypot(last.x - other.x, last.y - other.y) || 1);
      const before = { x: (last.x + other.x) / 2, y: (last.y + other.y) / 2 };
      zoomAt(spread, before.x, before.y);
      panBy((point.x - last.x) / 2, (point.y - last.y) / 2);
    }
    pointers.set(event.pointerId, point);
  });
  const release = event => {
    if (!pointers.delete(event.pointerId)) return;
    if (tap?.id === event.pointerId && event.type === 'pointerup' && event.timeStamp - tap.at < TAP_TIME) {
      pickAt(tap.x, tap.y);
    }
    tap = null;
    if (pointers.size) return;
    view.classList.remove('dragging');
    moving = false;
    redraw();
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) view.addEventListener(type, release);
  view.addEventListener(
    'wheel',
    event => {
      if (!open) return;
      event.preventDefault();
      // A trackpad pinch comes as a wheel with Ctrl held, in smaller steps.
      const amount = event.deltaY * (event.deltaMode === 1 ? 16 : 1) * (event.ctrlKey ? 0.01 : 0.0015);
      const { x, y } = local(event);
      clearTimeout(wheeling);
      wheeling = setTimeout(() => {
        wheeling = 0;
        redraw();
      }, 150);
      zoomAt(Math.exp(-clamp(amount, -1, 1)), x, y);
    },
    { passive: false },
  );
  view.addEventListener('dblclick', event => {
    const { x, y } = local(event);
    zoomAt(ZOOM_STEP, x, y);
  });

  const buttons = {
    in: () => zoomAt(ZOOM_STEP),
    out: () => zoomAt(1 / ZOOM_STEP),
    me: centreOnCar,
  };
  for (const button of page.querySelectorAll('[data-zoom]')) {
    button.addEventListener('click', () => buttons[button.dataset.zoom]());
  }
  const KEYS = {
    ArrowLeft: () => panBy(PAN_STEP, 0),
    ArrowRight: () => panBy(-PAN_STEP, 0),
    ArrowUp: () => panBy(0, PAN_STEP),
    ArrowDown: () => panBy(0, -PAN_STEP),
    Equal: buttons.in,
    NumpadAdd: buttons.in,
    Minus: buttons.out,
    NumpadSubtract: buttons.out,
  };
  page.addEventListener('keydown', event => {
    if (!open || !KEYS[event.code] || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    KEYS[event.code]();
  });

  new ResizeObserver(() => {
    if (!open) return;
    measure();
    settle();
    draw();
  }).observe(view);

  return {
    /** Opens on the car, at a zoom that shows the places round it. */
    open() {
      if (!markers) build();
      open = true;
      Object.assign(player, { x: car.x, z: car.z, heading: car.heading });
      measure();
      Object.assign(camera, { x: player.x, z: player.z, scale: opening() });
      settle();
      draw();
      if (!picture.canvas) picture.prepare(40).then(() => open && draw());
    },
    close() {
      open = false;
      pointers.clear();
      tap = null;
      moving = false;
      view.classList.remove('dragging');
    },
    getState: () => ({
      open,
      ready: Boolean(picture.canvas),
      camera: { ...camera },
      arrow: you.style.transform,
      shown: markers ? markers.filter(({ marker }) => !marker.classList.contains('tucked')).length : 0,
      picked: target.place?.id ?? null,
    }),
  };
}
