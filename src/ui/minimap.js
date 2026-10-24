// The minimap in the corner: the map round the car, turned so the way the car faces is always
// up. Places a little beyond its edge are pinned to the rim the way they lie, and the place
// picked on the big map always is, so it shows which way to drive. Each draw is one turned copy
// of a piece of the map's picture and a few stamped badges, about thirty times a second and
// only when the car has moved.
import { ARROW, MAP_EXTENT, MAP_PLACES, PAPER, badgeImage } from './mapart.js';

/** How far the map reaches from the car to the minimap's edge, in metres. */
const REACH = 320;
/** Places beyond the edge but closer than this, in metres, are pinned to the rim. */
const AROUND = 900;
/** The car sits this far below the middle, as a share of the radius, so more shows ahead of it. */
const BEHIND = 0.22;
/** The badges and the arrow, in CSS pixels. */
const BADGE = 20;
const PIN = 15;
const PICKED = 24;
const ARROW_SIZE = 24;
/** The least time between draws, in milliseconds. */
const EVERY = 30;

/**
 * `button` holds the minimap's canvas, `car` is the car's live state and `target.place` the
 * place picked on the big map, or null.
 */
export function createMinimap(button, picture, car, target = { place: null }) {
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
    badges = new Map(MAP_PLACES.map(place => [place.id, badgeImage(place, PICKED * ratio)]));
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
      // The badges stay upright as the map turns under them. Where they would crowd each
      // other, the more important ones show (the picked place first), and it goes on top.
      const picked = target.place?.id;
      const shown = [];
      for (const place of [...MAP_PLACES.filter(p => p.id === picked), ...MAP_PLACES.filter(p => p.id !== picked)]) {
        const dx = place.x - x;
        const dz = place.z - z;
        let px = cx + (dx * cos - dz * sin) * s;
        let py = cy + (dx * sin + dz * cos) * s;
        const chosen = place.id === picked;
        let badge = chosen ? PICKED : BADGE;
        if (Math.hypot(px - r, py - r) > r - badge / 2) {
          if (!chosen && Math.hypot(dx, dz) > AROUND) continue;
          // Out of reach: on the rim, where the line from the car towards it crosses it.
          badge = chosen ? PICKED : PIN;
          const length = Math.hypot(px - cx, py - cy) || 1;
          const [ux, uy] = [(px - cx) / length, (py - cy) / length];
          const [ox, oy] = [cx - r, cy - r];
          const along = ox * ux + oy * uy;
          const rim = r - badge / 2 - 1;
          const t = -along + Math.sqrt(Math.max(0, along * along - (ox * ox + oy * oy) + rim * rim));
          [px, py] = [cx + ux * t, cy + uy * t];
        }
        if (shown.some(other => Math.hypot(other.px - px, other.py - py) < (other.badge + badge) * 0.45)) continue;
        shown.push({ place, px, py, badge, chosen });
      }
      for (const { place, px, py, badge, chosen } of shown.reverse()) {
        if (chosen) {
          ctx.beginPath();
          ctx.arc(px, py, badge / 2 + 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#e8813a';
          ctx.fill();
        }
        ctx.drawImage(badges.get(place.id), px - badge / 2, py - badge / 2, badge, badge);
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
    /** Draws it again next time round, after the picked place has changed. */
    refresh() {
      last = null;
    },
    getState: () => ({ shown, ready: Boolean(picture.canvas), draws, size }),
  };
}
