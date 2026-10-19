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
  halt: {
    name: 'Railway halt',
    story: 'A platform, a shelter and a timetable.',
    hint: 'Inside the trail loop, west of the lake.',
  },
  train: {
    name: 'Railbus',
    story: 'Up the line to the tunnel and back. Try the horn.',
    hint: 'It runs between the halt and a tunnel in the northern hills.',
  },
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
    '<path d="M5 112q75-26 150 0v6H5z" fill="#8fab83"/><path d="M34 106V82h92v24z" fill="#b8e2cd"/><path d="M38 74V60h84v14zm6-20V40h72v14z" fill="#d6a190"/><path d="M62 8h6v14h-6zm30 4h6v12h-6z" fill="#b04a3a"/><path d="m26 84 10-12h88l10 12zm6-22 10-10h76l10 10zm4-20 20-24h48l20 24z" fill="#4f8466"/><path d="M50 63h7v7h-7zm16 0h7v7h-7zm21 0h7v7h-7zm16 0h7v7h-7zM52 44h7v7h-7zm49 0h7v7h-7z" fill="#e8cf8a" stroke="#a5574a" stroke-width="2"/><path d="M68 43h24v7H68z" fill="#f4f2ea"/><path d="M44 88h9v10h-9zm17 0h9v10h-9zm17 0h9v10h-9zm17 0h9v10h-9z" fill="#e8cf8a" stroke="#f1ede2" stroke-width="2"/><path d="M112 88h8v18h-8z" fill="#3f5f50"/><path d="M18 106V88h7v18z" fill="#8f8b80"/><circle cx="21.5" cy="85" r="3.5" fill="#5b6457"/>',
  bunker:
    '<path d="M5 108q75-20 150 0v10H5z" fill="#8fab83"/><rect x="44" y="56" width="86" height="52" rx="12" fill="#b4b1a3"/><path d="M92 56h26q12 0 12 12v14q-20 6-38-6z" fill="#bcae84"/><path d="M70 108q4-18 26-16 14 2 20 16z" fill="#9ea683"/><rect x="26" y="60" width="28" height="48" rx="13" fill="#a9a697"/><path d="M26 76q14 8 28-2v18q-16 6-28-2z" fill="#a39279"/><rect x="62" y="70" width="22" height="22" fill="#8f8c80"/><rect x="66" y="74" width="14" height="14" fill="#4a4b45"/><rect x="70" y="78" width="6" height="6" fill="#2b2f2c"/><rect x="106" y="50" width="6" height="7" fill="#5d5f58"/><path d="M4 110q4-22 14-24 8 0 12 24z" fill="#98a677"/>',
  halt: '<path d="M5 108h150" stroke="#8fab83" stroke-width="16"/><path d="M8 96h144" stroke="#9a958b" stroke-width="8"/><path d="M8 93h144" stroke="#8a867e" stroke-width="2"/><path d="M60 92h92v-8H60z" fill="#b7b2a6"/><path d="M60 85h92" stroke="#f1ede2" stroke-width="2"/><path d="M96 84V52h40v32z" fill="#b8664a"/><path d="M90 54h52l-4-8H94z" fill="#5d4a3e"/><path d="M102 60h28v24h-28z" fill="#8e5340"/><path d="M104 74h24v3h-24z" fill="#8a6446"/><path d="M120 62h6v8h-6z" fill="#e8c53a"/><path d="M74 84V40" stroke="#4f5a55" stroke-width="3"/><path d="M68 40h12v4H68z" fill="#4f5a55"/><path d="M20 92V70h6v22m-14-4h26" stroke="#5d5f58" stroke-width="3" fill="none"/><path d="M12 70h28v8H12z" fill="#c8302a"/><path d="M19 70h7v8h-7z" fill="#f2efe6"/>',
  train:
    '<path d="M5 108h150" stroke="#8fab83" stroke-width="16"/><path d="M5 101h150" stroke="#9a958b" stroke-width="6"/><path d="M24 98V48h112v50z" fill="#e9ebe6"/><path d="M24 98v-10h112v10z" fill="#2f5d9e"/><path d="M24 60h86v18H24z" fill="#2f5d9e"/><path d="M28 63h12v12H28zm16 0h12v12H44zm16 0h12v12H60zm16 0h12v12H76zm16 0h12v12H92z" fill="#3d5560"/><path d="M110 48h26v50h-26z" fill="#e7b92e"/><path d="M114 54h18v16h-18z" fill="#3d5560"/><circle cx="118" cy="82" r="3" fill="#fff3ce"/><circle cx="128" cy="82" r="3" fill="#fff3ce"/><path d="M26 44h108v6H26z" fill="#c9ccc6"/><circle cx="44" cy="100" r="5" fill="#2a2e2c"/><circle cx="114" cy="100" r="5" fill="#2a2e2c"/>',
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
