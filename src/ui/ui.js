// The DOM side of the game: title screen, pause menu, garage, map and toasts. It is made
// for a small child who can't read yet, so everything is a picture to tap; the words
// are labels for screen readers. It knows nothing about Three.js; the game talks to
// it through callbacks.
import { CAR_COLORS } from '../vehicles/car.js';
import { COLORS, DECORATIONS, VEHICLES } from '../core/journal.js';
import { roofArt } from './art.js';

const $ = id => document.getElementById(id);

const LABELS = {
  vehicles: {
    offroader: 'Off-roader',
    pickup: 'Pickup',
    van: 'Camper van',
    saloon: 'Saloon',
    tractor: 'Tractor',
    lorry: 'Lorry',
    hyundai: 'Hyundai',
    mercedes: 'Mercedes',
    miata: 'Miata',
  },
  colors: { orange: 'Orange', sage: 'Sage', blue: 'Blue', berry: 'Berry', yellow: 'Yellow', rainbow: 'Rainbow' },
  decorations: { flag: 'Flag', teddy: 'Teddy', tent: 'Roof tent', gnome: 'Gnome' },
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

/** `pictures` has the garage's pictures of the vehicles (see pictures.js). */
export function createUI({ journal, pictures, on }) {
  const menu = $('menu');
  let toastTimer = null;
  let showroom = false;
  let mapOpen = false;
  const toastQueue = [];

  // --- Title screen and HUD -------------------------------------------------------

  $('play').addEventListener('click', () => on.play());
  $('pause').addEventListener('click', () => on.pause());
  $('corner-map').addEventListener('click', () => on.openMap());
  for (const button of menu.querySelectorAll('[data-resume]')) button.addEventListener('click', () => on.resume());
  $('wake').addEventListener('click', () => on.wake());
  menu.addEventListener('cancel', event => {
    event.preventDefault();
    if (!menu.querySelector('[data-page="main"]').hidden) on.resume();
    else showPage('main');
  });
  // Browsers may close a dialog on their own (e.g. a quick double Escape).
  menu.addEventListener('close', () => on.resume());
  // A tap on the game around the menu goes back to it. In the garage a drag there turns
  // the car instead, so only a tap that stays put counts.
  let pressedAt = null;
  const outside = event => {
    const box = menu.getBoundingClientRect();
    return (
      event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
    );
  };
  menu.addEventListener('pointerdown', event => {
    pressedAt = event.target === menu && outside(event) ? { x: event.clientX, y: event.clientY } : null;
  });
  menu.addEventListener('click', event => {
    if (event.target !== menu || !outside(event) || !pressedAt) return;
    if (Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) < 10) on.resume();
  });

  // --- Menu pages -----------------------------------------------------------------

  /** The garage shows the real car beside the menu panel. */
  function setShowroom(enabled) {
    if (enabled === showroom) return;
    showroom = enabled;
    menu.classList.toggle('showroom', enabled);
    on.showroom(enabled);
  }

  /** The map fills nearly the whole screen. */
  function setMapOpen(enabled) {
    if (enabled === mapOpen) return;
    mapOpen = enabled;
    menu.classList.toggle('map-open', enabled);
    on.map(enabled);
  }

  function showPage(name) {
    for (const page of menu.querySelectorAll('.menu-page')) page.hidden = page.dataset.page !== name;
    setShowroom(name === 'garage');
    setMapOpen(name === 'map');
    if (name === 'garage') renderGarage();
    menu.scrollTop = 0;
    menu.querySelector(`[data-page="${name}"] h2`)?.focus({ preventScroll: true });
  }
  for (const button of menu.querySelectorAll('[data-open]')) {
    button.addEventListener('click', () => showPage(button.dataset.open));
  }

  $('sound').addEventListener('click', () => on.sound());
  $('cruise').addEventListener('click', () => on.cruise());
  $('minimap').addEventListener('click', () => on.minimap());
  $('tilt').addEventListener('click', () => on.tilt());
  $('tilt-center').addEventListener('click', () => on.tiltCenter());
  $('tilt-reverse').addEventListener('click', () => on.tiltReverse());
  $('camp').addEventListener('click', () => on.camp());
  $('home').addEventListener('click', () => on.home());

  /**
   * A row of picture buttons. `art(value)` draws each one, `isPressed(value)` marks the
   * chosen ones and `choose(value)` returns the change to save.
   */
  function choiceButtons(container, values, { label, art, isPressed, choose, style = () => '' }) {
    container.innerHTML = values
      .map(
        value =>
          `<button data-value="${value}" aria-label="${label(value)}" aria-pressed="${isPressed(value)}" style="${style(value)}">${art(value)}</button>`,
      )
      .join('');
    for (const button of container.querySelectorAll('button')) {
      button.addEventListener('click', () => {
        on.choose(choose(button.dataset.value));
        renderGarage();
      });
    }
  }

  /** A vehicle's picture for its tile, or a soft shape in its place while it's being drawn. */
  function vehiclePicture(vehicle, color) {
    const url = pictures.get(vehicle, color);
    if (!url) return '<span class="waiting"></span>';
    // The rainbow pictures change colour as the car does.
    return `<img src="${url}" alt=""${color === 'rainbow' ? ' class="rainbow"' : ''}>`;
  }

  const offeredColors = choices => COLORS.filter(c => c !== 'rainbow' || choices.rainbow);

  /** Asks for the garage's pictures in every paint on offer, the chosen one first. */
  function preparePictures() {
    const choices = journal.get();
    pictures.prepare(VEHICLES, [choices.color, ...offeredColors(choices)]);
  }

  function renderGarage() {
    const choices = journal.get();
    preparePictures();
    choiceButtons($('vehicle-options'), VEHICLES, {
      label: v => LABELS.vehicles[v],
      art: v => vehiclePicture(v, choices.color),
      isPressed: v => v === choices.vehicle,
      choose: v => ({ vehicle: v }),
    });
    choiceButtons($('color-options'), offeredColors(choices), {
      label: c => LABELS.colors[c],
      art: () => '',
      isPressed: c => c === choices.color,
      choose: c => ({ color: c }),
      style: c => `--swatch:${CAR_COLORS[c] ?? 'transparent'}`,
    });
    // Roof items can be combined, so each button toggles its own item.
    choiceButtons($('decoration-options'), DECORATIONS, {
      label: d => LABELS.decorations[d],
      art: roofArt,
      isPressed: d => choices.decorations.includes(d),
      choose: d => ({
        decorations: choices.decorations.includes(d)
          ? choices.decorations.filter(item => item !== d)
          : [...choices.decorations, d],
      }),
    });
  }

  /** A note if the car choices can't be saved. */
  function refreshMenu() {
    $('save-note').hidden = journal.isPersistent();
  }
  refreshMenu();

  // --- Toasts ---------------------------------------------------------------------

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
      document.body.classList.toggle('touch', touch);
      if (touch) $('title-hint').textContent = 'Tilt to steer. The car drives itself; the pedal brakes and reverses.';
    },
    startPlaying() {
      document.body.classList.add('playing');
      $('title-screen').hidden = true;
      $('hud').hidden = false;
      $('touch-controls').hidden = false;
    },
    openMenu({ nearCamp, camping }) {
      refreshMenu();
      preparePictures();
      $('camp').hidden = !nearCamp || camping;
      showPage('main');
      if (!menu.open) menu.showModal();
    },
    openPage(name) {
      if (!menu.open) menu.showModal();
      showPage(name);
    },
    /** Puts the vehicles' pictures in the garage as they are drawn, in place of the shapes waiting for them. */
    showPictures() {
      const { color } = journal.get();
      for (const waiting of $('vehicle-options').querySelectorAll('.waiting')) {
        const vehicle = waiting.parentElement.dataset.value;
        if (pictures.get(vehicle, color)) waiting.outerHTML = vehiclePicture(vehicle, color);
      }
    },
    closeMenu() {
      setShowroom(false);
      setMapOpen(false);
      if (menu.open) menu.close();
    },
    isMenuOpen: () => menu.open,
    toast(entry) {
      toastQueue.push(entry);
      if (!toastTimer) showNextToast();
    },
    setSwitch(id, on) {
      $(id).setAttribute('aria-checked', String(on));
      // With cruise control on, the car drives itself: the pedal for going forward isn't needed.
      if (id === 'cruise') document.body.classList.toggle('cruising', on);
      // Leaning the screen back reverses while tilt steers: the reverse pedal isn't needed then.
      if (id === 'tilt-reverse') document.body.classList.toggle('lean-reverse', on);
    },
    setTilt(state) {
      $('tilt').setAttribute('aria-checked', String(state.enabled || state.pending));
      $('tilt-center').hidden = !state.enabled;
      $('tilt-reverse').hidden = !state.enabled;
      const message = LABELS.tilt[state.status];
      $('tilt-status').textContent = message;
      $('tilt-status').hidden = !message;
      document.body.classList.toggle('tilting', state.enabled);
    },
    setCamping(camping) {
      document.body.classList.toggle('camping', camping);
      $('wake').hidden = !camping;
      refreshMenu();
    },
  };
}
