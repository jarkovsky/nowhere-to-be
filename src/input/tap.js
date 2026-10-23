// A quick tap on the game, with a finger or the mouse, as opposed to a drag to look around.

/** Calls `onTap(x, y)` with the screen position of a press that is let go soon, near where it began. */
export function createTap(element, { accepts = () => true, onTap }) {
  const presses = new Map();
  element.addEventListener('pointerdown', event => {
    if (event.button === 0 && accepts()) presses.set(event.pointerId, event);
  });
  const end = event => {
    const start = presses.get(event.pointerId);
    presses.delete(event.pointerId);
    if (!start || event.type !== 'pointerup' || !accepts()) return;
    const moved = Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY);
    if (moved < 14 && event.timeStamp - start.timeStamp < 700) onTap(event.clientX, event.clientY);
  };
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
}
