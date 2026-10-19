// Saved progress: scrapbook stickers, gnomes, car choices and settings.
// Stored in localStorage when available; otherwise it lasts for the visit.
import { HORNS } from './audio.js';

// The key keeps the game's original working title so existing saves survive.
export const SAVE_KEY = 'little-wilds-adventures-v1';

export const STICKERS = [
  'waterfall',
  'bridge',
  'tunnel',
  'campsite',
  'lookout',
  'farm',
  'tower',
  'windmill',
  'jetty',
  'chata',
  'bunker',
  'halt',
  'train',
  'roadworks',
  'helipad',
  'helicopter',
  'chapel',
  'deer',
  'ducks',
  'sheep',
  'rabbit',
  'cows',
  'fox',
  'fish',
  'geese',
  'eagle',
  'owl',
  'yeti',
];
export const COLORS = ['orange', 'sage', 'blue', 'berry', 'yellow', 'rainbow'];
export const DECORATIONS = ['flag', 'teddy', 'gnome'];
export const VEHICLES = ['offroader', 'pickup', 'van', 'saloon', 'tractor'];

const DEFAULTS = {
  found: [],
  gnomes: [],
  color: 'orange',
  vehicle: 'offroader',
  decorations: [],
  horn: 'beep',
  camp: false,
  sound: true,
  rainbow: false,
};

/** Keeps only values we recognise, so a corrupted or edited save can't break the game. */
export function sanitise(saved) {
  if (!saved || typeof saved !== 'object') return { ...DEFAULTS };
  const list = (value, valid) => (Array.isArray(value) ? [...new Set(value.filter(valid))] : []);
  const rainbow = saved.rainbow === true;
  const color = COLORS.includes(saved.color) && (saved.color !== 'rainbow' || rainbow) ? saved.color : DEFAULTS.color;
  return {
    found: list(saved.found, id => STICKERS.includes(id)),
    gnomes: list(saved.gnomes, i => Number.isInteger(i) && i >= 0 && i < 64),
    color,
    vehicle: VEHICLES.includes(saved.vehicle) ? saved.vehicle : DEFAULTS.vehicle,
    // Older saves kept a single `decoration`.
    decorations: list(saved.decorations ?? [saved.decoration], id => DECORATIONS.includes(id)),
    horn: HORNS.includes(saved.horn) ? saved.horn : DEFAULTS.horn,
    camp: saved.camp === true,
    sound: saved.sound !== false,
    rainbow,
  };
}

export function createJournal(storage) {
  let data;
  try {
    data = sanitise(JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null'));
  } catch {
    data = { ...DEFAULTS };
  }
  let persistent = Boolean(storage);

  function save(patch) {
    data = { ...data, ...patch };
    try {
      storage?.setItem(SAVE_KEY, JSON.stringify(data));
      persistent = Boolean(storage);
    } catch {
      persistent = false;
    }
    return persistent;
  }

  return {
    get: () => ({ ...data, found: [...data.found], gnomes: [...data.gnomes], decorations: [...data.decorations] }),
    save,
    /** Records a sticker. Returns true the first time only. */
    discover(id) {
      if (data.found.includes(id) || !STICKERS.includes(id)) return false;
      save({ found: [...data.found, id] });
      return true;
    },
    collectGnome(index) {
      if (data.gnomes.includes(index)) return false;
      save({ gnomes: [...data.gnomes, index] });
      return true;
    },
    isPersistent: () => persistent,
  };
}
