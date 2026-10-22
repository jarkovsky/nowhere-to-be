// The DOM side of the game: title screen, pause menu, garage and toasts. It is made
// for a small child who can't read yet, so everything is a picture to tap; the words
// are labels for screen readers. It knows nothing about Three.js; the game talks to
// it through callbacks.
import { CAR_COLORS } from '../vehicles/car.js';
import { COLORS, DECORATIONS, VEHICLES } from '../core/journal.js';
import { gnomeArt, gnomeIcon, roofArt, vehicleArt } from './art.js';

const $ = id => document.getElementById(id);

const LABELS = {
  vehicles: { offroader: 'Off-roader', pickup: 'Pickup', van: 'Camper van', saloon: 'Saloon', tractor: 'Tractor' },
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

export function createUI({ journal, gnomeCount, on }) {
  const menu = $('menu');
  let toastTimer = null;
  let gnomeTimer = null;
  let showroom = false;
  const toastQueue = [];

  // --- Title screen and HUD -------------------------------------------------------

  $('play').addEventListener('click', () => on.play());
  $('pause').addEventListener('click', () => on.pause());
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

  function showPage(name) {
    for (const page of menu.querySelectorAll('.menu-page')) page.hidden = page.dataset.page !== name;
    setShowroom(name === 'garage');
    if (name === 'garage') renderGarage();
    menu.scrollTop = 0;
    menu.querySelector(`[data-page="${name}"] h2`)?.focus({ preventScroll: true });
  }
  for (const button of menu.querySelectorAll('[data-open]')) {
    button.addEventListener('click', () => showPage(button.dataset.open));
  }

  $('sound').addEventListener('click', () => on.sound());
  $('cruise').addEventListener('click', () => on.cruise());
  $('tilt').addEventListener('click', () => on.tilt());
  $('tilt-center').addEventListener('click', () => on.tiltCenter());
  $('camp').addEventListener('click', () => on.camp());

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

  function renderGarage() {
    const choices = journal.get();
    const vehicles = $('vehicle-options');
    vehicles.style.setProperty('--paint', CAR_COLORS[choices.color] ?? CAR_COLORS.orange);
    vehicles.classList.toggle('rainbow', choices.color === 'rainbow');
    choiceButtons(vehicles, VEHICLES, {
      label: v => LABELS.vehicles[v],
      art: vehicleArt,
      isPressed: v => v === choices.vehicle,
      choose: v => ({ vehicle: v }),
    });
    choiceButtons(
      $('color-options'),
      COLORS.filter(c => c !== 'rainbow' || choices.rainbow),
      {
        label: c => LABELS.colors[c],
        art: () => '',
        isPressed: c => c === choices.color,
        choose: c => ({ color: c }),
        style: c => `--swatch:${CAR_COLORS[c] ?? 'transparent'}`,
      },
    );
    // Roof items can be combined, so each button toggles its own item.
    choiceButtons(
      $('decoration-options'),
      DECORATIONS.filter(d => d !== 'gnome' || choices.gnomes.length === gnomeCount),
      {
        label: d => LABELS.decorations[d],
        art: roofArt,
        isPressed: d => choices.decorations.includes(d),
        choose: d => ({
          decorations: choices.decorations.includes(d)
            ? choices.decorations.filter(item => item !== d)
            : [...choices.decorations, d],
        }),
      },
    );
  }

  /** The gnomes found so far, and a note if progress can't be saved. */
  function refreshMenu() {
    const { gnomes } = journal.get();
    $('gnome-tally-row').innerHTML = gnomeRow(gnomes.length);
    $('gnome-count').textContent = `${gnomes.length} of ${gnomeCount} garden gnomes found`;
    $('save-note').hidden = journal.isPersistent();
  }
  refreshMenu();

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
      refreshMenu();
      $('camp').hidden = !nearCamp || camping;
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
    gnomeFound(count) {
      showGnomeProgress(count);
      if (count === gnomeCount)
        this.toast({ art: gnomeArt(), title: 'All garden gnomes found', detail: 'A new roof option is waiting.' });
    },
    setSwitch(id, on) {
      $(id).setAttribute('aria-checked', String(on));
      // With cruise control on, the car drives itself: the pedal for going forward isn't needed.
      if (id === 'cruise') document.body.classList.toggle('cruising', on);
    },
    setTilt(state) {
      $('tilt').setAttribute('aria-checked', String(state.enabled || state.pending));
      $('tilt-center').hidden = !state.enabled;
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
