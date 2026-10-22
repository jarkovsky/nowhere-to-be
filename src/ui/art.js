// Small drawings for the toasts, the gnome row and the garage.

/** The gnome in the toast when the last one is found. */
export function gnomeArt() {
  return '<svg viewBox="0 0 160 130" aria-hidden="true"><rect x="3" y="3" width="154" height="124" rx="22" fill="#e3e8d5"/><path d="m80 14 22 46H58z" fill="#c8432f"/><circle cx="80" cy="66" r="13" fill="#f0c9a6"/><path d="m66 70 14 26 14-26z" fill="#f3efe2"/><path d="M60 118q0-30 20-30t20 30z" fill="#3f6aa1"/></svg>';
}

/** A small standing gnome for the progress row. Unfound gnomes are greyed out with CSS. */
export function gnomeIcon() {
  return '<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M4.5 33q0-11 7.5-11t7.5 11z" fill="#3f6aa1"/><circle cx="12" cy="16.5" r="4.4" fill="#f0c9a6"/><path d="m7.4 17.6 4.6 8.6 4.6-8.6z" fill="#f3efe2"/><circle cx="12" cy="17.8" r="1.4" fill="#e3a98c"/><path d="M12 1 19.5 15h-15z" fill="#c8432f"/></svg>';
}

const TYRE = '#303a35';
const HUB = '#eee4c8';
const GLASS = '#4f6f73';
const CREAM = '#eee4c8';
const DARK = '#2a2e33';
const CHROME = '#c9cdc6';

const wheel = (x, y, r, hub = HUB) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${TYRE}"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${hub}"/>`;

/** A cartoon eye looking ahead (to the left), and a smile, for the characters. */
const eye = (x, y, r, iris) =>
  `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.1}" fill="#f6f3ea"/><circle cx="${x - r * 0.35}" cy="${y + r * 0.1}" r="${r * 0.58}" fill="${iris}"/><circle cx="${x - r * 0.42}" cy="${y + r * 0.12}" r="${r * 0.3}" fill="#1c1f22"/><circle cx="${x - r * 0.2}" cy="${y - r * 0.2}" r="${r * 0.14}" fill="#f6f3ea"/>`;
const smile = (x, y, width) =>
  `<path d="M${x} ${y}q${width / 2} ${width * 0.75} ${width} 0z" fill="#4b1f20"/><path d="M${x + width * 0.14} ${y + width * 0.07}q${width * 0.36} ${width * 0.12} ${width * 0.72} 0" stroke="#f6f3ea" stroke-width="${width * 0.12}" fill="none"/>`;

/** A lorry and its trailer, all in one colour. */
const lorry = paint => `
    <rect x="24" y="4" width="54" height="25" rx="1" fill="${paint}"/>
    <path d="M30 6v21M36 6v21M42 6v21M48 6v21M54 6v21M60 6v21M66 6v21M72 6v21" stroke="#00000026" stroke-width="1"/>
    <rect x="24" y="27.5" width="54" height="3" fill="${DARK}"/>
    <rect x="4" y="27" width="40" height="3.5" fill="${DARK}"/>
    <rect x="4" y="7" width="18" height="24" rx="2" fill="${paint}"/>
    <rect x="3" y="6" width="7" height="2.5" rx="1" fill="${DARK}"/>
    <rect x="6.5" y="10" width="11" height="9" rx="1.5" fill="${GLASS}"/>
    ${eye(11.5, 14.5, 3.6, '#8a5a2c')}
    ${smile(5, 22.5, 10)}
    ${wheel(12, 34, 5.5, CHROME)}${wheel(30, 34, 5.5, CHROME)}${wheel(62, 34, 5, CHROME)}${wheel(72.5, 34, 5, CHROME)}`;

/**
 * Side views of the garage's vehicles, facing left, for the car picker. Parts with
 * class "paint" take the chosen colour from CSS; the characters keep their own.
 */
const VEHICLE_ART = {
  offroader: `
    <rect x="8" y="19" width="60" height="13" rx="3" class="paint"/>
    <path d="M8 21h18v-5H11z" class="paint"/>
    <path d="M27 19.5 29 8h36v11.5z" class="paint"/>
    <path d="M31 17.5 32.4 11H45v6.5zM48 11h14v6.5H48z" fill="${GLASS}"/>
    <rect x="29" y="5.5" width="35" height="2.5" rx="1" fill="${CREAM}"/>
    <rect x="5" y="29" width="8" height="3" rx="1" fill="${CREAM}"/>
    ${wheel(71, 24, 5.5)}${wheel(19, 33, 7)}${wheel(56, 33, 7)}`,
  pickup: `
    <rect x="5" y="21" width="69" height="11" rx="3" class="paint"/>
    <path d="M5 23h20v-5H8z" class="paint"/>
    <path d="M25 21.5 28 10h17v11.5z" class="paint"/>
    <path d="M30 19.5 31.8 12.5H42v7z" fill="${GLASS}"/>
    <rect x="47" y="16" width="27" height="5.5" class="paint"/>
    <rect x="50" y="13" width="20" height="4" rx="2" fill="#8a6446"/>
    ${wheel(18, 33, 7)}${wheel(60, 33, 7)}`,
  van: `
    <rect x="7" y="18" width="66" height="15" rx="4" class="paint"/>
    <path d="M7 19 13 8h60v11z" fill="${CREAM}"/>
    <rect x="24" y="3.5" width="42" height="5" rx="2" fill="#e2d7b8"/>
    <path d="M10 18 14.5 10H21v8z" fill="${GLASS}"/>
    <rect x="26" y="10.5" width="40" height="6.5" rx="1" fill="${GLASS}"/>
    ${wheel(20, 34, 6.5)}${wheel(60, 34, 6.5)}`,
  saloon: `
    <rect x="3" y="22" width="74" height="10" rx="3" class="paint"/>
    <path d="M21 22.5 28 12h25l8 10.5z" class="paint"/>
    <path d="M26 21.5 30.5 14.5H39v7zM42 14.5h10l5 7H42z" fill="${GLASS}"/>
    <rect x="1" y="29" width="78" height="2.5" rx="1" fill="#c9cdc6"/>
    ${wheel(17, 33, 6)}${wheel(63, 33, 6)}`,
  tractor: `
    <rect x="8" y="25" width="52" height="5" fill="#3a3f3a"/>
    <rect x="9" y="16" width="31" height="11" rx="2" class="paint"/>
    <rect x="29" y="6" width="2.5" height="11" fill="#2f3430"/>
    <rect x="43" y="7" width="20" height="17" fill="${GLASS}"/>
    <path d="M42 7h2v17h-2zM62 7h2v17h-2z" fill="#3a3f3a"/>
    <rect x="40" y="3" width="26" height="4" rx="1" class="paint"/>
    ${wheel(17, 35, 6)}${wheel(57, 30, 12)}`,
  oliver: lorry('#2f6cb3'),
  ruda: lorry('#c43b2e'),
  hyundai: `
    <path d="M3 32v-8q1-3 6-4l17-1.5L60 18l14 1 2 5v8z" fill="#1f2b4b"/>
    <path d="M8 21 26 19.2 60 18.7l13 1 .6 3.8L8 25z" fill="#c6cdd8"/>
    <path d="M26 19.5 35 9.5h29l9 9z" fill="#1f2b4b"/>
    <path d="M29.5 18.5 36.2 11H47v7.5zM50 11h13l6.5 7.5H50z" fill="${GLASS}"/>
    <rect x="62" y="5" width="15" height="2.4" rx="1" fill="#1f2b4b"/><rect x="66" y="7" width="2" height="3" fill="${DARK}"/>
    <rect x="44" y="6.5" width="6" height="3" rx="1" fill="#d0392f"/>
    <path d="M29 24.5 50 21.3v2L29 26.4z" fill="#d0392f"/>
    <rect x="53" y="20" width="8" height="6" rx="1" fill="#f4f1e8"/>
    <path d="M55 21.5v3h1.6v-3zM58.6 21.5v3" stroke="#1d2024" stroke-width="0.9" fill="none"/>
    ${eye(32.5, 14, 3, '#3f8fd0')}
    ${smile(3.5, 26.5, 7)}
    ${wheel(17, 32, 6.5, '#d6a537')}${wheel(62, 32, 6.5, '#d6a537')}`,
  mercedes: `
    <path d="M3 31v-6q1-3 7-3.5l18-2.5 9-6q4-2 10-1l15 6.5 12 1.5 3 3v8z" fill="#ced2d4"/>
    <path d="M30.5 19.3 37.5 14.4q3.5-1.6 8.5-1l8.5 5.6z" fill="${GLASS}"/>
    <rect x="65" y="9" width="14" height="2.4" rx="1" fill="${DARK}"/><rect x="69" y="11" width="2" height="8" fill="${DARK}"/>
    <rect x="1" y="30.5" width="13" height="1.6" fill="${DARK}"/>
    <rect x="23" y="29.5" width="33" height="1.8" fill="${DARK}"/>
    <rect x="41" y="21" width="8" height="6" rx="1" fill="#f4f1e8"/>
    <path d="M43 22.5v3h1.6v-3zM46.6 22.5v3" stroke="#1d2024" stroke-width="0.9" fill="none"/>
    ${eye(37.5, 16.6, 2.6, '#3f8fd0')}
    ${smile(3.5, 26, 7)}
    ${wheel(15, 31, 6.5, '#45494e')}${wheel(63, 31, 6.5, '#45494e')}`,
};

/** A vehicle for the car picker, painted with the colour in the CSS variable --paint. */
export function vehicleArt(name) {
  return `<svg viewBox="0 0 80 44" aria-hidden="true">${VEHICLE_ART[name]}</svg>`;
}

/** Pictures of the roof items. */
const ROOF_ART = {
  flag: '<path d="M15 6v36" stroke="#737e73" stroke-width="3" stroke-linecap="round"/><path d="M17 7 40 14 17 21z" fill="#e5bb56"/>',
  teddy:
    '<circle cx="14" cy="14" r="6" fill="#bd9368"/><circle cx="34" cy="14" r="6" fill="#bd9368"/><circle cx="24" cy="26" r="14" fill="#bd9368"/><ellipse cx="24" cy="31" rx="6.5" ry="5" fill="#dcbb93"/><circle cx="18.5" cy="22.5" r="2" fill="#343c32"/><circle cx="29.5" cy="22.5" r="2" fill="#343c32"/><ellipse cx="24" cy="29" rx="2.4" ry="1.8" fill="#343c32"/>',
  tent: '<rect x="5" y="34" width="38" height="6" rx="1.5" fill="#3f4541"/><path d="M8 34 24 11l16 23z" fill="#d9893b"/><path d="M19 34l5-9 5 9z" fill="#5b4632"/><path d="M24 11v-3" stroke="#6b5a45" stroke-width="2.5" stroke-linecap="round"/>',
};

export function roofArt(name) {
  if (name === 'gnome') return gnomeIcon();
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${ROOF_ART[name]}</svg>`;
}
