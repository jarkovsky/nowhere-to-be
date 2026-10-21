// Small drawings for the toasts and the gnome row.

/** The gnome in the toast when the last one is found. */
export function gnomeArt() {
  return '<svg viewBox="0 0 160 130" aria-hidden="true"><rect x="3" y="3" width="154" height="124" rx="22" fill="#e3e8d5"/><path d="m80 14 22 46H58z" fill="#c8432f"/><circle cx="80" cy="66" r="13" fill="#f0c9a6"/><path d="m66 70 14 26 14-26z" fill="#f3efe2"/><path d="M60 118q0-30 20-30t20 30z" fill="#3f6aa1"/></svg>';
}

/** A small standing gnome for the progress row. Unfound gnomes are greyed out with CSS. */
export function gnomeIcon() {
  return '<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M4.5 33q0-11 7.5-11t7.5 11z" fill="#3f6aa1"/><circle cx="12" cy="16.5" r="4.4" fill="#f0c9a6"/><path d="m7.4 17.6 4.6 8.6 4.6-8.6z" fill="#f3efe2"/><circle cx="12" cy="17.8" r="1.4" fill="#e3a98c"/><path d="M12 1 19.5 15h-15z" fill="#c8432f"/></svg>';
}
