// The minimap in the corner: the map round the car, turned so the way the car faces is always
// up. Each draw is one turned copy of a piece of the map's picture and a few stamped badges,
// about thirty times a second and only when the car has moved.
import { ARROW, MAP_EXTENT, MAP_PLACES, PAPER, badgeImage } from './mapart.js';

/** How far the map reaches from the car to the minimap's edge, in metres. */
const REACH = 150;
/** The car sits this far below the middle, as a share of the radius, so more shows ahead of it. */
const BEHIND = 0.22;
/** The badges and the arrow, in CSS pixels. */
const BADGE = 20;
const ARROW_SIZE = 24;
/** The least time between draws, in milliseconds. */
const EVERY = 30;

/** `button` holds the minimap's canvas, and `car` is the car's live state. */
export function createMinimap(button, picture, car) {
  const canvas = button.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const arrow = new Path2D(ARROW);
  let shown = false;
  let size = 0;
  let ratio = 1;
  let badges = null;
  let last = null;
  let lastDraw = -Infinity;
  let draws = 0;

  function measure() {
    size = button.clientWidth;
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * ratio);
    badges = new Map(MAP_PLACES.map(place => [place.id, badgeImage(place, BADGE * ratio)]));
    last = null;
  }

  function draw() {
    if (!size) measure();
    if (!size) return;
    const r = size / 2;
    const s = r / REACH;
    const cx = r;
    const cy = r * (1 + BEHIND);
    const { x, z, heading } = car;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, size, size);
    if (picture.canvas) {
      // Turned by the heading, the car's forward, (-sin, -cos), comes out straight up.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(heading);
      ctx.scale(s, s);
      ctx.translate(-x, -z);
      ctx.drawImage(picture.canvas, -MAP_EXTENT, -MAP_EXTENT, 2 * MAP_EXTENT, 2 * MAP_EXTENT);
      ctx.restore();
      // The badges stay upright as the map turns under them.
      for (const place of MAP_PLACES) {
        const dx = place.x - x;
        const dz = place.z - z;
        const px = cx + (dx * cos - dz * sin) * s;
        const py = cy + (dx * sin + dz * cos) * s;
        if (Math.hypot(px - r, py - r) > r + BADGE / 2) continue;
        ctx.drawImage(badges.get(place.id), px - BADGE / 2, py - BADGE / 2, BADGE, BADGE);
      }
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(ARROW_SIZE / 24, ARROW_SIZE / 24);
    ctx.translate(-12, -12);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#fffdf4';
    ctx.fillStyle = '#e8813a';
    ctx.shadowColor = 'rgba(30, 50, 40, 0.35)';
    ctx.shadowBlur = 3 * ratio;
    ctx.stroke(arrow);
    ctx.shadowColor = 'transparent';
    ctx.fill(arrow);
    ctx.restore();
    last = picture.canvas ? { x, z, heading } : null;
    draws++;
  }

  window.addEventListener('resize', () => {
    if (!shown) return;
    measure();
    draw();
  });

  return {
    /** Shows or hides it. The map's picture is painted, a little each frame, the first time it shows. */
    setVisible(on) {
      shown = on;
      button.hidden = !on;
      if (!on) return;
      measure();
      draw();
      if (!picture.canvas) picture.prepare(4).then(() => shown && draw());
    },
    /** Called every frame; it draws when it's due and the car has moved or turned. */
    update(now) {
      if (!shown || now - lastDraw < EVERY) return;
      if (last && last.x === car.x && last.z === car.z && last.heading === car.heading) return;
      lastDraw = now;
      draw();
    },
    getState: () => ({ shown, ready: Boolean(picture.canvas), draws, size }),
  };
}
