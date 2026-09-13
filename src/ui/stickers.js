// Scrapbook stickers: a name, a line for when you've found it, a hint for when
// you haven't, and a small SVG illustration.
export const STICKER_INFO = {
  waterfall: {
    name: 'Whispering Falls',
    story: 'Cold water tumbling into a clear pool.',
    hint: 'Follow the creek upstream from the bridge.',
  },
  bridge: { name: 'The Bridge', story: 'Timber planks over the creek.', hint: 'On the trail, east of the meadow.' },
  tunnel: {
    name: 'Echo Mountain',
    story: 'Try the horn in there.',
    hint: 'The trail goes straight through a mountain.',
  },
  campsite: {
    name: 'Lakeside Camp',
    story: 'A tent, a fire and a view of the lake.',
    hint: 'A side path leaves the trail near the start.',
  },
  lookout: { name: 'The Lookout', story: 'The best view in the valley.', hint: 'High ground, inside the trail loop.' },
  deer: { name: 'Deer', story: 'Out for their afternoon walk.', hint: 'They cross the meadow near the start.' },
  ducks: { name: 'Ducks', story: 'Everybody waits for the ducks.', hint: 'They cross the trail north of the lake.' },
  sheep: { name: 'Sheep', story: 'Grazing, mostly.', hint: 'Near the cabin.' },
  rabbit: { name: 'Rabbit', story: 'Gone in a flash.', hint: 'Its burrow is by the western trail.' },
  yeti: {
    name: 'Yeti',
    story: 'Definitely just a rock. Probably.',
    hint: 'Something lives up in the snow.',
    secret: true,
  },
};

const DRAWINGS = {
  waterfall:
    '<path d="M15 100 40 34 87 22 130 49 149 104" fill="#91a599"/><path d="m70 30-9 67h32L85 29" fill="#b5e1db"/><path d="m74 40-5 48m13-52-2 60" stroke="#f4f9e9" stroke-width="5"/><ellipse cx="78" cy="101" rx="47" ry="12" fill="#82b8b1"/><path d="m40 102 72 1" stroke="#d7eee0" stroke-width="3"/>',
  bridge:
    '<path d="M5 105q60-38 145-5" stroke="#9dcac6" stroke-width="24" fill="none"/><path d="M18 85q55-48 126-9" stroke="#9c7451" stroke-width="15" fill="none"/><path d="M19 65q56-44 125-9M22 90V60m28 15V43m32 27V37m32 37V40m27 49V52" stroke="#71583e" stroke-width="5" fill="none"/>',
  tunnel:
    '<path d="M7 113 44 45 63 52 93 13 153 113" fill="#90a094"/><path d="m76 43 17-30 23 39-22-11-8 7" fill="#eaf0df"/><path d="M56 113V86a23 23 0 0 1 46 0v27" fill="#455b50"/><path d="m64 116 10-27h12l10 27" fill="#c5b391"/>',
  campsite:
    '<path d="M5 105h150" stroke="#8fab83" stroke-width="17"/><path d="m17 96 36-67 43 67" fill="#d49a64"/><path d="m43 96 13-45 24 45" fill="#725e47"/><path d="m105 105 26-7m-27 0 26 8" stroke="#795840" stroke-width="5"/><path d="M118 99q-20-13-4-30 0 12 8 8 0-10 2-18 21 31-6 40" fill="#e99b3f"/><path d="m122 20 2 5 6 1-5 4 1 6-5-3-5 3 2-6-5-4 6-1z" fill="#d8b65e"/>',
  lookout:
    '<path d="M3 112 60 70l40 18 57-30v55z" fill="#8fab83"/><ellipse cx="118" cy="98" rx="30" ry="7" fill="#82b8b1"/><path d="M34 84h38M38 84v14m30-14v14M34 76h38" stroke="#8a6446" stroke-width="5"/><path d="M95 50v38" stroke="#4e5b55" stroke-width="5"/><path d="m86 52 24-12" stroke="#3d4a45" stroke-width="9" stroke-linecap="round"/>',
  deer: '<path d="m49 84-4 28m22-28 1 28m25-29 8 29" stroke="#987149" stroke-width="7"/><ellipse cx="71" cy="72" rx="34" ry="18" fill="#b68e61"/><path d="m95 75 6-30 15 2-8 34" fill="#b68e61"/><ellipse cx="119" cy="42" rx="20" ry="10" fill="#b68e61"/><path d="m110 37-7-16m13 15 9-17" stroke="#b68e61" stroke-width="7"/><circle cx="126" cy="40" r="3" fill="#344c3d"/>',
  ducks:
    '<ellipse cx="60" cy="77" rx="32" ry="21" fill="#eadabb"/><circle cx="84" cy="51" r="17" fill="#58856b"/><path d="m98 50 19 6-20 6" fill="#dca745"/><circle cx="88" cy="47" r="3" fill="#2d493b"/><path d="M45 98h12m8 0h12" stroke="#c19543" stroke-width="5"/><ellipse cx="126" cy="91" rx="16" ry="12" fill="#e0bd58"/><circle cx="137" cy="77" r="10" fill="#e0bd58"/><circle cx="140" cy="75" r="2" fill="#2d493b"/>',
  sheep:
    '<path d="M48 84v23m25-22v22m23-23v23" stroke="#5b6555" stroke-width="7"/><path d="M34 73a16 16 0 0 1 6-27 16 16 0 0 1 26-9 18 18 0 0 1 27 2 18 18 0 0 1 25 23 18 18 0 0 1-17 28H52a18 18 0 0 1-18-17" fill="#eee9d7"/><ellipse cx="113" cy="69" rx="16" ry="21" fill="#66715d"/><path d="m101 55-14-5m36 4 14-5" stroke="#66715d" stroke-width="9"/><circle cx="118" cy="64" r="3" fill="#f5f0da"/>',
  rabbit:
    '<ellipse cx="114" cy="102" rx="29" ry="10" fill="#6e6d51"/><ellipse cx="64" cy="83" rx="26" ry="20" fill="#d6c4a1"/><circle cx="85" cy="63" r="16" fill="#d6c4a1"/><path d="m77 50-6-27m16 26 7-28" stroke="#d6c4a1" stroke-width="11" stroke-linecap="round"/><circle cx="91" cy="60" r="3" fill="#40503c"/><circle cx="38" cy="82" r="9" fill="#f2e8cd"/>',
  yeti: '<path d="M5 112q75-22 150 0v6H5z" fill="#eef1f2"/><path d="M28 112q4-46 26-50 20 0 23 50z" fill="#9aa3a0"/><ellipse cx="104" cy="74" rx="26" ry="34" fill="#f4f6f6"/><rect x="91" y="56" width="26" height="17" rx="6" fill="#8ea2ad"/><circle cx="99" cy="63" r="2.5" fill="#2d3a40"/><circle cx="109" cy="63" r="2.5" fill="#2d3a40"/><path d="M124 64q14-20 10-34" stroke="#f4f6f6" stroke-width="11" stroke-linecap="round" fill="none"/>',
};

export function stickerArt(id) {
  return `<svg viewBox="0 0 160 130" aria-hidden="true"><rect x="3" y="3" width="154" height="124" rx="22" fill="#e3e8d5"/><circle cx="126" cy="30" r="12" fill="#f1d28a"/>${DRAWINGS[id] ?? ''}<path d="M22 116h116" stroke="#819774" stroke-width="2" stroke-linecap="round"/></svg>`;
}

export function gnomeArt() {
  return '<svg viewBox="0 0 160 130" aria-hidden="true"><rect x="3" y="3" width="154" height="124" rx="22" fill="#e3e8d5"/><path d="m80 14 22 46H58z" fill="#c8432f"/><circle cx="80" cy="66" r="13" fill="#f0c9a6"/><path d="m66 70 14 26 14-26z" fill="#f3efe2"/><path d="M60 118q0-30 20-30t20 30z" fill="#3f6aa1"/></svg>';
}
