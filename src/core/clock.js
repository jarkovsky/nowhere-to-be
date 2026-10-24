// A fixed step for the driving. However long a frame takes, the car is moved on in steps of the
// same length, so it drives the same at any frame rate and on any device. The time a frame
// leaves over is carried on to the next, and says how far between its last two steps the car is
// to be drawn, so it still moves smoothly when the frames and the steps don't line up.

/** Floating-point slack, so a frame exactly a whole number of steps long runs all of them. */
const SLACK = 1e-9;

/** Moves on in steps of `step` seconds, at most `most` of them in a frame (a long stall is let go). */
export function createFixedStep(step, most = 6) {
  let left = 0;
  return {
    step,
    /** How far on from the last step towards the next the time left over is, from 0 to 1. */
    get alpha() {
      return Math.min(1, Math.max(0, left / step));
    },
    /** Runs `run(step)` once for each whole step in `dt` seconds and what was left over. Returns how many. */
    advance(dt, run) {
      left = Math.min(left + Math.max(0, dt), step * most + SLACK);
      let count = 0;
      while (left >= step - SLACK) {
        run(step);
        left -= step;
        count++;
      }
      left = Math.max(0, left);
      return count;
    },
  };
}
