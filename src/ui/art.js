// Small drawings for the garage's roof items.

/** A small standing gnome. */
function gnomeIcon() {
  return '<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M4.5 33q0-11 7.5-11t7.5 11z" fill="#3f6aa1"/><circle cx="12" cy="16.5" r="4.4" fill="#f0c9a6"/><path d="m7.4 17.6 4.6 8.6 4.6-8.6z" fill="#f3efe2"/><circle cx="12" cy="17.8" r="1.4" fill="#e3a98c"/><path d="M12 1 19.5 15h-15z" fill="#c8432f"/></svg>';
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
