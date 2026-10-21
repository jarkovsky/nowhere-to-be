// The DOM side of the game: title screen, pause menu, scrapbook, garage and toasts.
// It knows nothing about Three.js; the game talks to it through callbacks.
import { CAR_COLORS } from '../vehicles/car.js';
import { HORNS } from '../core/audio.js';
import { STICKERS, COLORS, DECORATIONS, VEHICLES } from '../core/journal.js';
import { STICKER_INFO, stickerArt, gnomeArt, gnomeIcon } from './stickers.js';

const $ = id => document.getElementById(id);

const LABELS = {
  vehicles: { offroader: 'Off-roader', pickup: 'Pickup', van: 'Camper van', saloon: 'Saloon', tractor: 'Tractor' },
  colors: { orange: 'Orange', sage: 'Sage', blue: 'Blue', berry: 'Berry', yellow: 'Yellow', rainbow: 'Rainbow' },
  decorations: { flag: 'Flag', teddy: 'Teddy', tent: 'Roof tent', gnome: 'Gnome' },
  horns: { beep: 'Beep', bicycle: 'Bell', quack: 'Quack', twinkle: 'Twinkle' },
  sky: { auto: 'Changes over time', sunset: 'Sunset', night: 'Night', rain: 'Rain', day: 'Clear day' },
  tilt: {
    off: '',
    permission: 'Allow motion access when asked.',
    waiting: 'Hold your device like a steering wheel.',
    centering: 'Hold steady while tilt finds its centre.',
    ready: '',
    upright: 'Lift the screen up a little to steer.',
    insecure: 'Tilt needs the game to be opened over HTTPS.',
    unsupported: "This device doesn't report its tilt.",
    denied: 'Motion access was not allowed.',
    unavailable: 'No motion readings came through. Try again.',
  },
};

export function createUI({ journal, gnomeCount, on }) {
  const menu = $('menu');
  let toastTimer = null;
  let gnomeTimer = null;
  let showroom = false;
  const toastQueue = [];

  // --- Title screen and HUD -------------------------------------------------------

  $('play').addEventListener('click', () => on.play());
  $('pause').addEventListener('click', () => on.pause());
  $('resume').addEventListener('click', () => on.resume());
  $('wake').addEventListener('click', () => on.wake());
  menu.addEventListener('cancel', event => {
    event.preventDefault();
    if (!menu.querySelector('[data-page="main"]').hidden) on.resume();
    else showPage('main');
  });
  // Browsers may close a dialog on their own (e.g. a quick double Escape).
  menu.addEventListener('close', () => on.resume());
  // Clicking the dimmed backdrop beside the panel resumes the game.
  menu.addEventListener('click', event => {
    // In the garage, the space beside the panel is for turning the car instead.
    if (event.target !== menu || showroom) return;
    const box = menu.getBoundingClientRect();
    if (event.clientX > box.right) on.resume();
  });

  // --- Menu pages -----------------------------------------------------------------

  /** The garage shows the real car beside the menu panel. */
  function setShowroom(enabled) {
    if (enabled === showroom) return;
    showroom = enabled;
    menu.classList.toggle('showroom', enabled);
    on.showroom(enabled);
  }

  function showPage(name) {
    for (const page of menu.querySelectorAll('.menu-page')) page.hidden = page.dataset.page !== name;
    setShowroom(name === 'garage');
    if (name === 'scrapbook') renderScrapbook();
    if (name === 'garage') renderGarage();
    menu.scrollTop = 0;
    menu.querySelector(`[data-page="${name}"] h2`)?.focus({ preventScroll: true });
  }
  for (const button of menu.querySelectorAll('[data-open]')) {
    button.addEventListener('click', () => showPage(button.dataset.open));
  }

  $('sky').addEventListener('click', () => on.sky());
  $('sound').addEventListener('click', () => on.sound());
  $('cruise').addEventListener('click', () => on.cruise());
  $('tilt').addEventListener('click', () => on.tilt());
  $('tilt-center').addEventListener('click', () => on.tiltCenter());
  $('home').addEventListener('click', () => on.home());
  $('camp').addEventListener('click', () => on.camp());

  function renderScrapbook() {
    const { found, gnomes } = journal.get();
    $('sticker-grid').innerHTML = STICKERS.map(id => {
      const info = STICKER_INFO[id];
      if (!found.includes(id)) {
        const name = info.secret ? '???' : info.name;
        return `<article class="sticker locked"><div class="blank">?</div><strong>${name}</strong><p>${info.hint}</p></article>`;
      }
      return `<article class="sticker">${stickerArt(id)}<strong>${info.name}</strong><p>${info.story}</p></article>`;
    }).join('');
    $('gnome-tally-row').innerHTML = gnomeRow(gnomes.length);
    $('gnome-count').textContent =
      gnomes.length === gnomeCount
        ? `All ${gnomeCount} garden gnomes found. Check the roof options!`
        : `${gnomes.length} of ${gnomeCount} garden gnomes found`;
    $('save-note').textContent = journal.isPersistent()
      ? 'Saved in this browser.'
      : 'Saving is unavailable here, so progress lasts for this visit.';
  }

  /** A row of buttons. `isPressed(value)` marks the chosen ones; `choose(value)` returns the change to save. */
  function choiceButtons(container, values, labels, isPressed, choose) {
    container.innerHTML = values
      .map(value => `<button data-value="${value}" aria-pressed="${isPressed(value)}">${labels[value]}</button>`)
      .join('');
    for (const button of container.querySelectorAll('button')) {
      button.addEventListener('click', () => {
        on.choose(choose(button.dataset.value));
        renderGarage();
      });
    }
  }

  function renderGarage() {
    const choices = journal.get();
    choiceButtons(
      $('vehicle-options'),
      VEHICLES,
      LABELS.vehicles,
      v => v === choices.vehicle,
      v => ({ vehicle: v }),
    );
    const colors = COLORS.filter(c => c !== 'rainbow' || choices.rainbow);
    $('color-options').innerHTML = colors
      .map(
        c =>
          `<button data-value="${c}" style="--swatch:${CAR_COLORS[c] ?? 'transparent'}" aria-label="${LABELS.colors[c]}" aria-pressed="${c === choices.color}"></button>`,
      )
      .join('');
    for (const button of $('color-options').querySelectorAll('button')) {
      button.addEventListener('click', () => {
        on.choose({ color: button.dataset.value });
        renderGarage();
      });
    }
    const decorations = DECORATIONS.filter(d => d !== 'gnome' || choices.gnomes.length === gnomeCount);
    // Roof items can be combined, so each button toggles its own item.
    choiceButtons(
      $('decoration-options'),
      decorations,
      LABELS.decorations,
      d => choices.decorations.includes(d),
      d => ({
        decorations: choices.decorations.includes(d)
          ? choices.decorations.filter(item => item !== d)
          : [...choices.decorations, d],
      }),
    );
    choiceButtons(
      $('horn-options'),
      HORNS,
      LABELS.horns,
      h => h === choices.horn,
      h => ({ horn: h }),
    );
  }

  function refreshCounts() {
    const { found, camp } = journal.get();
    $('sticker-count').textContent = `${found.length} / ${STICKERS.length}`;
    $('home-label').textContent = camp ? 'Back to camp' : 'Back to the start';
  }
  refreshCounts();

  // --- Toasts ---------------------------------------------------------------------

  /** One gnome per hiding place, coloured in from the left as they are found. `fresh` pops in. */
  function gnomeRow(count, fresh = -1) {
    return Array.from(
      { length: gnomeCount },
      (_, i) =>
        `<span class="${i < count ? 'found' : ''}${i === fresh ? ' fresh' : ''}" style="--i:${i}">${gnomeIcon()}</span>`,
    ).join('');
  }

  function showGnomeProgress(count) {
    const panel = $('gnome-progress');
    const complete = count === gnomeCount;
    $('gnome-row').innerHTML = gnomeRow(count, complete ? -1 : count - 1);
    $('gnome-number').textContent = `${count} / ${gnomeCount}`;
    $('gnome-status').textContent = `${count} of ${gnomeCount} garden gnomes found`;
    panel.classList.toggle('complete', complete);
    panel.classList.remove('leaving');
    panel.hidden = false;
    clearTimeout(gnomeTimer);
    gnomeTimer = setTimeout(
      () => {
        panel.classList.add('leaving');
        gnomeTimer = setTimeout(() => (panel.hidden = true), 400);
      },
      complete ? 7000 : 5000,
    );
  }

  function showNextToast() {
    const toast = $('toast');
    const next = toastQueue.shift();
    if (!next) {
      toast.hidden = true;
      toastTimer = null;
      return;
    }
    toast.classList.remove('leaving');
    toast.innerHTML = `${next.art ?? ''}<span><strong>${next.title}</strong><small>${next.detail}</small></span>`;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.classList.add('leaving');
      toastTimer = setTimeout(showNextToast, 300);
    }, 2800);
  }

  return {
    ready(touch) {
      $('play').disabled = false;
      $('play').textContent = 'Play';
      document.body.classList.toggle('touch', touch);
      if (touch) $('title-hint').textContent = 'Drive with the on-screen pedals. Tilt steering is in the menu.';
    },
    startPlaying() {
      document.body.classList.add('playing');
      $('title-screen').hidden = true;
      $('hud').hidden = false;
      $('touch-controls').hidden = false;
    },
    openMenu({ nearCamp, camping }) {
      refreshCounts();
      $('camp-row').hidden = !nearCamp || camping;
      showPage('main');
      if (!menu.open) menu.showModal();
    },
    openPage(name) {
      if (!menu.open) menu.showModal();
      showPage(name);
    },
    closeMenu() {
      setShowroom(false);
      if (menu.open) menu.close();
    },
    isMenuOpen: () => menu.open,
    toast(entry) {
      toastQueue.push(entry);
      if (!toastTimer) showNextToast();
    },
    stickerToast(id) {
      this.toast({ art: stickerArt(id), title: STICKER_INFO[id].name, detail: 'Added to your scrapbook' });
    },
    gnomeFound(count) {
      showGnomeProgress(count);
      if (count === gnomeCount)
        this.toast({ art: gnomeArt(), title: 'All garden gnomes found', detail: 'A new roof option is waiting.' });
    },
    setSky(preset) {
      $('sky-value').textContent = LABELS.sky[preset];
    },
    setSwitch(id, on) {
      $(id).setAttribute('aria-checked', String(on));
    },
    setTilt(state) {
      $('tilt').setAttribute('aria-checked', String(state.enabled || state.pending));
      $('tilt-center-row').hidden = !state.enabled;
      const message = LABELS.tilt[state.status];
      $('tilt-status').textContent = message;
      $('tilt-status').hidden = !message;
      document.body.classList.toggle('tilting', state.enabled);
    },
    setCamping(camping) {
      document.body.classList.toggle('camping', camping);
      $('wake').hidden = !camping;
      refreshCounts();
    },
    refresh: refreshCounts,
  };
}
