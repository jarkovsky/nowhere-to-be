// Calm lo-fi music under the game: a handful of tracks (public/music, CC0, see the README)
// played in a shuffled order, with a quiet spell between one and the next. Each is streamed
// through one <audio> element rather than decoded whole, which would take tens of megabytes
// a track. The files are already matched in loudness and fade in and out.

export const TRACKS = ['autumn', 'letting-go-of-the-past', 'clouds', 'dream-pop', 'old-age', 'poor-but-happy'];

/** Seconds of quiet between one track and the next. */
const GAP = [10, 25];
/** How loud the music is, before the master volume. */
const LEVEL = 0.3;

/**
 * The order to play `count` tracks in, as indices: shuffled, and never starting with `last`,
 * the one that has just played, so no track plays twice in a row.
 */
export function shuffleOrder(count, last = -1, random = Math.random) {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (count > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/** Plays the tracks into `destination`. Call `start()` from a click, so the browser lets it play. */
export function createMusic(context, destination, { random = Math.random } = {}) {
  const element = new Audio();
  element.preload = 'auto';
  // Hi-hats a touch softer, so it stays in the background.
  const soften = context.createBiquadFilter();
  soften.type = 'highshelf';
  soften.frequency.value = 5000;
  soften.gain.value = -4;
  const gain = context.createGain();
  gain.gain.value = LEVEL;
  context.createMediaElementSource(element).connect(soften).connect(gain).connect(destination);

  let queue = [];
  let last = -1;
  let loaded = false;
  let wanted = false;
  let nextAt = 0;
  let failures = 0;

  const seconds = () => performance.now() / 1000;

  function load() {
    if (!queue.length) queue = shuffleOrder(TRACKS.length, last, random);
    last = queue.shift();
    element.src = `music/${TRACKS[last]}.mp3`;
    loaded = true;
  }

  function resume() {
    element.play().catch(() => {});
  }

  element.addEventListener('ended', () => {
    loaded = false;
    failures = 0;
    nextAt = seconds() + GAP[0] + random() * (GAP[1] - GAP[0]);
  });
  // A track that won't load is skipped; if none will, the music stops trying.
  element.addEventListener('error', () => {
    loaded = false;
    failures++;
    nextAt = failures < TRACKS.length ? seconds() + 1 : Infinity;
  });

  return {
    /**
     * From a click: the first track starts at once, and the browser lets the element play from
     * then on. Later, it carries on with the track, or waits out the quiet between tracks.
     */
    start() {
      wanted = true;
      if (!loaded && seconds() >= nextAt) load();
      if (loaded) resume();
    },
    /** Every frame: whether the music should be heard (sound on, game running and in view). */
    update(on) {
      if (on !== wanted) {
        wanted = on;
        if (!on) element.pause();
        else if (loaded) resume();
      }
      if (wanted && !loaded && seconds() >= nextAt) {
        load();
        resume();
      }
    },
  };
}
