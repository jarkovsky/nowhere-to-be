// Drag with the mouse, or a finger on the scenery, to look around the car.
// The mouse wheel (or a pinch on a trackpad) zooms.

/**
 * Listens on `element`. `accepts(event)` decides whether a press starts a drag;
 * the callbacks receive pixel deltas.
 */
export function createLook(element, { accepts = () => true, onDrag, onRelease, onZoom }) {
  let active = null;
  let last = { x: 0, y: 0 };

  element.addEventListener('pointerdown', event => {
    if (active !== null || event.button !== 0 || !accepts(event)) return;
    event.preventDefault(); // no text selection while dragging
    active = event.pointerId;
    last = { x: event.clientX, y: event.clientY };
    element.setPointerCapture?.(event.pointerId);
  });
  element.addEventListener('pointermove', event => {
    if (event.pointerId !== active) return;
    onDrag(event.clientX - last.x, event.clientY - last.y);
    last = { x: event.clientX, y: event.clientY };
  });
  const end = event => {
    if (event.pointerId !== active) return;
    active = null;
    onRelease();
  };
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
  element.addEventListener(
    'wheel',
    event => {
      if (!accepts(event)) return;
      event.preventDefault();
      onZoom(event.deltaY);
    },
    { passive: false },
  );

  return {
    get dragging() {
      return active !== null;
    },
  };
}
