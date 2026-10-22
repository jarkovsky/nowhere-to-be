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

const wheel = (x, y, r) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${TYRE}"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${HUB}"/>`;

/**
 * Side views of the garage's vehicles, facing left, for the car picker. Parts with
 * class "paint" take the chosen colour from CSS.
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
