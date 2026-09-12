# Little Wilds

A small, peaceful browser driving game: one customisable off-roader, a low-poly alpine valley, pine woods, a lake, and a winding trail. Ducks cross the trail, sheep graze, deer wander, and a rabbit retreats to its burrow; a five-minute sky cycle brings sunset, stars, fireflies, and passing rain. Built for grown-ups and little explorers to take turns together.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL Vite prints. For a tablet or phone on the same Wi-Fi, open the **Network** URL printed by Vite. The computer must keep the server running; its firewall must allow the connection.

```sh
npm test
npm run build
npm run preview
```

The `dist/` folder can be served by any static web host. No backend, accounts, API keys, or paid services. The game bundles Three.js locally. Optional Google Fonts fall back to installed fonts without blocking play.

## Controls

- **Arrow keys / WASD:** accelerate, reverse, and steer.
- **Space:** brake.
- **R / Home:** return to the meadow, or to your campsite after your first camp night.
- **H / Beep:** play your friendly horn. Choose a little beep, bicycle bell, quack, or twinkle in **My car**. Playing a horn turns sound on.
- **B / Scrapbook:** browse eight illustrated place and animal stickers, with hints for discoveries still to come.
- **C / My car:** choose from five colours and add a flag or teddy bear.
- **Esc:** pause; press again to resume.
- **Little explorer:** gentle automatic forward driving; only steering is needed. Brake overrides it.
- **Touch:** hold the large arrow buttons; multiple fingers work together. The square button brakes.
- **Sun icon:** preview sunset, night, rain, daylight, or return to the automatic sky cycle. Headlights turn on automatically.
- **Sound icon:** optional soft engine and wind sounds, off initially.

The car stops automatically when you release the accelerator, cannot flip, and stays out of deep water and beyond the valley boundary. Trees and rocks gently block and deflect the car. Leaving the tab pauses the game. There is no timer, damage, objective, or score. Travel distance lasts for the current session. Scrapbook discoveries, car colour, decoration, horn choice, and your campsite starting point save locally in this browser. If browser storage is unavailable, they remain usable for the current outing.

Browser smoke tests use an installed Google Chrome and a running development server:

```sh
npm run test:browser
npm run test:adventures
```

These exercise keyboard input, simultaneous touch controls, pause/resume, sky presets, headlights, wildlife, discoveries, customisation, save/reload, terrain effects, and campsite nights, and save screenshots in `artifacts/`. Mobile layouts and touch are emulated; physical-device performance still needs playtesting.

## Little things to discover

Follow the trail east to a wooden bridge, around the lake to Whispering Falls, and west through Echo Mountain. The whole trail stays on land. A small spur from the meadow leads to the hidden campsite on the southwest shore. Near camp, release the accelerator (or hold brake in Little explorer mode), then choose **Park & watch the stars**. **Start the next outing** brings a fresh morning. Future visits start at that camp.

Drive through the shallow puddles near the southern trail, crunchy autumn leaves in the west, and snow near the mountain. Snow retains the latest 6,000 tire impressions for the current session; marks stay when you drive away and return. Terrain sounds follow the sound toggle. There is no score or requirement to collect every sticker.

## Structure

- `src/main.js` — game loop, follow camera, UI, keyboard and pointer input.
- `src/driving.js` — renderer-independent driving and collision rules.
- `src/terrain.js` — deterministic terrain, shared triangle interpolation, trail and spawn.
- `src/world.js` — procedural landscape, instanced vegetation, lake and cabin.
- `src/car.js` — original procedural off-roader model.
- `src/suspension.js` — four-wheel ground contact, terrain pitch/roll, independent suspension.
- `src/atmosphere.js` — day/night cycle, weather, stars, fireflies, headlights.
- `src/wildlife.js` — occasional deer and rabbit encounters.
- `src/audio.js` — optional Web Audio engine, wind, surface sounds, and four friendly horns.
- `src/discoveries.js` — landmark coordinates, bridge contact surface, and saved journal.
- `src/landmarks.js` — bridge, mountain tunnel, waterfall, signs, camp, and fire.
- `src/surfaces.js` — puddles, leaves, snow, particles, and tire tracks.
- `src/stickers.js` — original illustrated scrapbook stickers.
- `src/style.css` — responsive game interface.
- `tests/driving.test.js` — driving, rescue, collision, boundary and terrain checks.

The supplied `visuals/` images are inspiration only and are not distributed as game assets. All game geometry is generated in code. This is a deliberately small first prototype: one local player, one landscape, arcade driving, and browser-local saved discoveries. WebGL is required; keyboard and touch are supported.
