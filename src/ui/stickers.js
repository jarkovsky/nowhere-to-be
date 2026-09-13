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
  farm: { name: 'The Farm', story: 'A red barn, a silo and a paddock.', hint: 'A track leaves the western trail.' },
  tower: { name: 'Fire Tower', story: 'Someone keeps watch from up here.', hint: 'On the hill south of the trail.' },
  windmill: { name: 'Windmill', story: 'Turning slowly, all day long.', hint: 'Up on the flat hill to the west.' },
  jetty: { name: 'The Jetty', story: 'A boathouse and a rowing boat.', hint: 'On the south shore of the lake.' },
  chata: {
    name: 'Masarykova chata',
    story: 'A mountain hut with a warm stove.',
    hint: 'Up a winding track in the northern hills.',
  },
  bunker: { name: 'Řopík', story: 'A little concrete pillbox from 1938.', hint: 'In a line along the northern ridge.' },
  deer: { name: 'Deer', story: 'Out for their afternoon walk.', hint: 'They cross the meadow near the start.' },
  ducks: { name: 'Ducks', story: 'Everybody waits for the ducks.', hint: 'They cross the trail north of the lake.' },
  sheep: { name: 'Sheep', story: 'Grazing, mostly.', hint: 'Near the cabin.' },
  rabbit: { name: 'Rabbit', story: 'Gone in a flash.', hint: 'Its burrow is by the western trail.' },
  cows: { name: 'Cows', story: 'Try the horn. They answer.', hint: 'At the farm.' },
  fox: { name: 'Fox', story: 'Off on its rounds.', hint: 'At the edge of the eastern woods.' },
  fish: { name: 'Fish', story: 'Right out of the water.', hint: 'Wait by the lake for a while.' },
  geese: { name: 'Geese', story: 'Flying in a V over the valley.', hint: 'Look up.' },
  eagle: { name: 'Eagle', story: 'Circling high over the hills.', hint: 'Look up near the mountain hut.' },
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
  farm: '<path d="M5 108h150" stroke="#8fab83" stroke-width="16"/><path d="M28 104V64l27-22 27 22v40z" fill="#b0503a"/><path d="m24 66 31-27 31 27" stroke="#6f6b63" stroke-width="7" fill="none"/><path d="M45 104V82h20v22z" fill="#8e3f2f"/><path d="m45 82 20 22m0-22-20 22" stroke="#eee7d3" stroke-width="3"/><rect x="96" y="40" width="22" height="64" fill="#cfc8b6"/><path d="M96 40a11 11 0 0 1 22 0z" fill="#86938d"/><ellipse cx="136" cy="98" rx="10" ry="8" fill="#d9c071"/>',
  tower:
    '<path d="M5 112q75-30 150 0v6H5z" fill="#8fab83"/><path d="m58 108 12-56m32 56L90 52M62 92h36M66 72h28m-38 30 42-30m2 30L62 72" stroke="#8d6a48" stroke-width="4"/><path d="M64 52h32V36H64z" fill="#596f6c"/><path d="M61 54h38v-5H61zm-1-18 20-14 20 14z" fill="#5d6b62"/><path d="M80 22V8" stroke="#737e73" stroke-width="2"/><path d="M80 8h13l-3 4 3 4H80" fill="#c8432f"/>',
  windmill:
    '<path d="M5 112q75-24 150 0v6H5z" fill="#8fab83"/><path d="m62 110 6-58h24l6 58z" fill="#ece4d0"/><path d="m64 54 16-14 16 14z" fill="#7c5a44"/><path d="M74 92h12v18H74z" fill="#5b6f62"/><path d="M80 46 46 12m34 34 34-34M80 46 46 80m34-34 34 34" stroke="#6a5340" stroke-width="4"/><path d="m56 22 14 14 6-6-14-14zm48 0L90 36l-6-6 14-14zM56 70l14-14 6 6-14 14zm48 0L90 56l-6 6 14 14z" fill="#f1ead8"/><circle cx="80" cy="46" r="4" fill="#5d4a39"/>',
  jetty:
    '<path d="M3 70h154v41q0 16-16 16H19q-16 0-16-16z" fill="#9dcac6"/><path d="M60 64h74v8H60z" fill="#a8875f"/><path d="M70 72v20m30-20v20m28-20v20" stroke="#6f5843" stroke-width="4"/><path d="M18 64V42l16-12 16 12v22z" fill="#93714f"/><path d="m14 44 20-16 20 16" stroke="#5d6b62" stroke-width="6" fill="none"/><path d="M84 94h40l-6 9H90z" fill="#c86338"/>',
  chata:
    '<path d="M5 112q75-26 150 0v6H5z" fill="#8fab83"/><path d="M30 100V76h100v24z" fill="#9d998c"/><path d="M28 78V60h104v18z" fill="#6b4a33"/><path d="m20 62 60-42 60 42z" fill="#4f4844"/><path d="M42 64h10v8H42zm22 0h10v8H64zm22 0h10v8H86zm22 0h10v8h-10zM44 84h8v8h-8zm64 0h8v8h-8z" fill="#e8cf8a" stroke="#f1ede2" stroke-width="2"/><path d="M73 100V86h14v14z" fill="#4c3a2a"/><path d="M146 104V30" stroke="#d9d6cc" stroke-width="2"/><path d="M146 30h-1v8h-15v-8z" fill="#f1ede2"/><path d="M146 38v8h-16v-8z" fill="#c8302a"/><path d="m130 30 8 8-8 8z" fill="#2b5a9c"/>',
  bunker:
    '<path d="M5 108q75-20 150 0v10H5z" fill="#8fab83"/><path d="M42 104V62h76v42z" fill="#a7a596"/><path d="M36 64h88v-9H36z" fill="#b0ae9f"/><path d="M50 74h22v14H50z" fill="#8c9070"/><path d="M92 86h18v12H92z" fill="#9a8f74"/><path d="M60 72h40" stroke="#2f3430" stroke-width="5"/>',
  eagle:
    '<path d="M20 98q30-14 60 0 24-12 52 0z" fill="#f4f6f0"/><path d="M80 52 30 40l-14 8 22 2-16 6 26 2 32 6zm0 0 50-12 14 8-22 2 16 6-26 2-32 6z" fill="#5e4632"/><ellipse cx="80" cy="56" rx="9" ry="16" fill="#5e4632"/><circle cx="80" cy="38" r="7" fill="#b48a4e"/><path d="m80 42 0 6 3-3z" fill="#e0b649"/><path d="m72 70 8 14 8-14z" fill="#5e4632"/>',
  cows: '<path d="M5 108h150" stroke="#8fab83" stroke-width="16"/><path d="M44 84v22m12-22v22m44-22v22m12-22v22" stroke="#e7dfcd" stroke-width="8"/><rect x="38" y="52" width="80" height="36" rx="8" fill="#f1ece0"/><path d="M58 52h22v22H58zm38 18h14v14H96z" fill="#3c3f3a"/><rect x="112" y="42" width="30" height="24" rx="6" fill="#f1ece0"/><rect x="130" y="52" width="14" height="14" rx="4" fill="#e9b3a4"/><path d="m116 42-4-8m20 8 4-8" stroke="#e3d6b4" stroke-width="4"/><circle cx="124" cy="50" r="2.5" fill="#2d3a33"/>',
  fox: '<path d="M5 108h150" stroke="#8fab83" stroke-width="16"/><path d="m52 86-4 20m14-20v20m36-20 2 20m12-20 4 20" stroke="#3a3530" stroke-width="5"/><ellipse cx="80" cy="78" rx="34" ry="14" fill="#d0773b"/><path d="M46 76q-30-6-36 14 18 4 36-6z" fill="#d0773b"/><path d="M14 88q2 4 8 5l-2-9z" fill="#f2e8cd"/><path d="m108 74 20-10 10 10-20 14z" fill="#d0773b"/><path d="m116 66 4-14 6 12m4 2 6-12 2 14" fill="#d0773b"/><path d="m128 78 10-4 4 4-10 6z" fill="#f2e8cd"/><circle cx="126" cy="70" r="2.5" fill="#2d3a33"/>',
  fish: '<path d="M3 80h154v31q0 16-16 16H19q-16 0-16-16z" fill="#9dcac6"/><path d="M40 92q40-80 84 0" stroke="#d7eee0" stroke-width="2" stroke-dasharray="4 5" fill="none"/><g transform="rotate(-25 80 46)"><ellipse cx="80" cy="46" rx="24" ry="10" fill="#9fb2a8"/><path d="m56 46-14-10v20z" fill="#8aa198"/><circle cx="96" cy="44" r="2.5" fill="#2d3a33"/></g><ellipse cx="124" cy="96" rx="14" ry="4" fill="#eef8f4"/>',
  geese:
    '<path d="M24 92q14-14 30 0 10-10 22 0z" fill="#f4f6f0"/><path d="M72 36q8 2 8 6 0-4 8-6M56 50q8 2 8 6 0-4 8-6m16 0q8 2 8 6 0-4 8-6M40 64q8 2 8 6 0-4 8-6m48 0q8 2 8 6 0-4 8-6M24 78q8 2 8 6 0-4 8-6m80 0q8 2 8 6 0-4 8-6" stroke="#4e5650" stroke-width="3" fill="none" stroke-linecap="round"/>',
  yeti: '<path d="M5 112q75-22 150 0v6H5z" fill="#eef1f2"/><path d="M28 112q4-46 26-50 20 0 23 50z" fill="#9aa3a0"/><ellipse cx="104" cy="74" rx="26" ry="34" fill="#f4f6f6"/><rect x="91" y="56" width="26" height="17" rx="6" fill="#8ea2ad"/><circle cx="99" cy="63" r="2.5" fill="#2d3a40"/><circle cx="109" cy="63" r="2.5" fill="#2d3a40"/><path d="M124 64q14-20 10-34" stroke="#f4f6f6" stroke-width="11" stroke-linecap="round" fill="none"/>',
};

export function stickerArt(id) {
  return `<svg viewBox="0 0 160 130" aria-hidden="true"><rect x="3" y="3" width="154" height="124" rx="22" fill="#e3e8d5"/><circle cx="126" cy="30" r="12" fill="#f1d28a"/>${DRAWINGS[id] ?? ''}<path d="M22 116h116" stroke="#819774" stroke-width="2" stroke-linecap="round"/></svg>`;
}

export function gnomeArt() {
  return '<svg viewBox="0 0 160 130" aria-hidden="true"><rect x="3" y="3" width="154" height="124" rx="22" fill="#e3e8d5"/><path d="m80 14 22 46H58z" fill="#c8432f"/><circle cx="80" cy="66" r="13" fill="#f0c9a6"/><path d="m66 70 14 26 14-26z" fill="#f3efe2"/><path d="M60 118q0-30 20-30t20 30z" fill="#3f6aa1"/></svg>';
}
