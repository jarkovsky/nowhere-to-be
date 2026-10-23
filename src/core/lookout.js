// The viewpoints at the ends of the marked trails. Arriving at one swings the camera out wide to
// take in the view for a few seconds, then lets it come back behind the car. Each does this once
// a visit: the car has to leave before it does it again.

/** How long the camera stays out on the view, in seconds. */
export const LOOK_TIME = 6;

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * `views` are { x, z, heading }: where each viewpoint is and the way it looks out. It starts once
 * the car is within `reach` of one, and stops early if the car goes further than `away`.
 */
export function createLookout(views, { reach = 13, away = 28 } = {}) {
  let current = null;
  let time = 0;
  // Viewpoints already looked out from, until the car leaves them.
  const visited = new Set();

  return {
    step(car, dt) {
      for (const view of visited) if (distance(car, view) > away) visited.delete(view);
      if (current) {
        time += dt;
        if (time >= LOOK_TIME || distance(car, current) > away) current = null;
        return;
      }
      current = views.find(view => !visited.has(view) && distance(car, view) < reach) ?? null;
      if (current) {
        time = 0;
        visited.add(current);
      }
    },
    /**
     * Where the camera should look out to past the car, and how wide, or null. The point sweeps
     * slowly across the view, so the camera pans along it.
     */
    watch() {
      if (!current) return null;
      const t = time / LOOK_TIME;
      const sweep = 45 * (1 - 2 * t);
      const ahead = { x: -Math.sin(current.heading), z: -Math.cos(current.heading) };
      return {
        x: current.x + ahead.x * 120 - ahead.z * sweep,
        z: current.z + ahead.z * 120 + ahead.x * sweep,
        zoom: 1.7,
        pitch: 0.15,
        toward: 0.3,
        // As far round as it takes, even if the car came up facing away from the view.
        turn: Infinity,
        past: true,
        ease: 0.45,
      };
    },
    getState: () => ({ view: views.indexOf(current), time: current ? time : 0 }),
  };
}
