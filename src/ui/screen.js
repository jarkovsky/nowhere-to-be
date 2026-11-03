// The page as a game screen on a phone or a tablet: it never zooms, and it can fill the whole
// screen.
//
// Safari on the iPad lets a pinch zoom the page in whatever the page asks, and once zoomed in
// a page that takes every touch on its canvas can't be pinched back out: the buttons are off
// the edges of the screen and the game can't be played. So pinches and double taps are stopped
// before the browser zooms, and if the page is zoomed in all the same, pinching is let through
// again until it is back out, and the browser is asked to put the zoom back.

/** The viewport as it should be: the page's own width, never zoomed. */
const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

const fullscreenElement = doc => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;

export function createScreen({ host = window, onChange = () => {} } = {}) {
  const doc = host.document;
  const root = doc.documentElement;
  const meta = doc.querySelector('meta[name="viewport"]');
  const viewport = host.visualViewport;
  const zoomedIn = () => (viewport?.scale ?? 1) > 1.01;
  let zoomed = false;

  /** Stops the browser zooming the page while it isn't zoomed; zoomed in, lets a pinch take it back out. */
  const stop = event => {
    if (!zoomed && event.cancelable) event.preventDefault();
  };
  // Safari's own pinch events, two fingers moving, and a quick second tap.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    doc.addEventListener(type, stop, { passive: false });
  }
  doc.addEventListener(
    'touchmove',
    event => {
      if (event.touches.length > 1) stop(event);
    },
    { passive: false },
  );
  doc.addEventListener('dblclick', stop, { passive: false });

  function zoomChanged() {
    const now = zoomedIn();
    if (now === zoomed) return;
    zoomed = now;
    // Zoomed in, pinches are let through so it can be pinched back out.
    root.classList.toggle('zoomed', zoomed);
    if (zoomed && meta) {
      // Setting the viewport again asks the browser to put the zoom back.
      meta.setAttribute('content', VIEWPORT.replace('initial-scale=1', 'initial-scale=1.0001'));
      host.requestAnimationFrame(() => meta.setAttribute('content', VIEWPORT));
    }
  }
  meta?.setAttribute('content', VIEWPORT);
  viewport?.addEventListener('resize', zoomChanged);

  const canFill = Boolean(
    doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? (root.requestFullscreen || root.webkitRequestFullscreen),
  );
  const isFull = () => fullscreenElement(doc) !== null;
  for (const type of ['fullscreenchange', 'webkitfullscreenchange'])
    doc.addEventListener(type, () => onChange(isFull()));

  return {
    /** Whether the browser lets the page fill the screen (Safari on an iPhone doesn't). */
    canFill,
    isFull,
    /** Fills the screen, or stops filling it. Called from a tap, as browsers require. */
    toggleFull() {
      if (!canFill) return;
      try {
        const asked = isFull()
          ? (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc)
          : (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root, { navigationUI: 'hide' });
        asked?.catch?.(() => {});
      } catch {
        // Refused (not from a tap, say): the page stays as it is.
      }
    },
  };
}
