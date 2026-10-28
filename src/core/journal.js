// Saved choices: the car's colour and roof items, and settings. The vehicle is chosen
// afresh each visit, always starting in the off-roader. Stored in localStorage when
// available; otherwise it lasts for the visit.

// The key keeps the game's original working title so existing saves survive.
export const SAVE_KEY = 'little-wilds-adventures-v1';

export const COLORS = ['orange', 'sage', 'blue', 'berry', 'yellow', 'rainbow'];
export const DECORATIONS = ['flag', 'teddy', 'tent', 'gnome'];
export const VEHICLES = [
  'offroader',
  'pickup',
  'van',
  'saloon',
  'tractor',
  'lorry',
  'hyundai',
  'mercedes',
  'miata',
  'flatbed',
  'expedition',
];

/**
 * There used to be two lorries in colours of their own, Oliver in blue and Ruda in red. A save
 * with one of them gets the lorry in the paint nearest its colour (for Ruda, the orange).
 */
const OLD_LORRIES = new Map([
  ['oliver', 'blue'],
  ['ruda', 'orange'],
]);

const DEFAULTS = {
  color: 'orange',
  vehicle: 'offroader',
  decorations: [],
  camp: false,
  sound: true,
  rainbow: false,
  minimap: false,
  tiltReverse: false,
};

/** Keeps only values we recognise, so a corrupted or edited save can't break the game. */
export function sanitise(saved) {
  if (!saved || typeof saved !== 'object') return { ...DEFAULTS };
  const list = (value, valid) => (Array.isArray(value) ? [...new Set(value.filter(valid))] : []);
  const rainbow = saved.rainbow === true;
  const lorry = OLD_LORRIES.get(saved.vehicle);
  const vehicle = lorry ? 'lorry' : saved.vehicle;
  const color = lorry ?? saved.color;
  return {
    color: COLORS.includes(color) && (color !== 'rainbow' || rainbow) ? color : DEFAULTS.color,
    vehicle: VEHICLES.includes(vehicle) ? vehicle : DEFAULTS.vehicle,
    // Older saves kept a single `decoration`.
    decorations: list(saved.decorations ?? [saved.decoration], id => DECORATIONS.includes(id)),
    camp: saved.camp === true,
    sound: saved.sound !== false,
    rainbow,
    minimap: saved.minimap === true,
    tiltReverse: saved.tiltReverse === true,
  };
}

export function createJournal(storage) {
  let data;
  try {
    data = sanitise(JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null'));
  } catch {
    data = { ...DEFAULTS };
  }
  // The vehicle isn't remembered: a child who keeps changing cars would otherwise start each
  // visit in a different one, and the first in the garage is the one to find waiting.
  data.vehicle = DEFAULTS.vehicle;
  let persistent = Boolean(storage);

  function save(patch) {
    data = { ...data, ...patch };
    try {
      const { vehicle, ...kept } = data;
      storage?.setItem(SAVE_KEY, JSON.stringify(kept));
      persistent = Boolean(storage);
    } catch {
      persistent = false;
    }
    return persistent;
  }

  return {
    get: () => ({ ...data, decorations: [...data.decorations] }),
    save,
    isPersistent: () => persistent,
  };
}
