# Nowhere to Be

A relaxed low-poly driving game that runs in the browser. Take a little off-roader around a mountain valley and up into the hills around it at your own pace. There are no timers, no score and nothing to win. I made it for my son and me to explore together, so the menus are pictures rather than words.

Play it at [nowhere-to-be.jarkovsky.com](https://nowhere-to-be.jarkovsky.com).

![Title screen over the valley](docs/title.jpg)

<p>
  <img src="docs/bridge.jpg" width="49%" alt="Crossing the timber bridge at sunset, with the waterfall upstream">
  <img src="docs/farm.jpg" width="49%" alt="The farm, with cows in the paddock and a wheat field">
</p>
<p>
  <img src="docs/tunnel.jpg" width="49%" alt="Tyre tracks in the snow on the way into the mountain tunnel">
  <img src="docs/camp.jpg" width="49%" alt="A night at the lakeside campsite">
</p>
<p>
  <img src="docs/hut.jpg" width="49%" alt="Masarykova chata, the mountain hut in the northern hills">
  <img src="docs/jetty.jpg" width="49%" alt="Driving out along the jetty on the lake">
</p>
<p>
  <img src="docs/railway.jpg" width="49%" alt="The railbus waiting at the halt, with the level crossing behind it">
  <img src="docs/roadworks.jpg" width="49%" alt="Roadworks on the new road: a roller, a grader, an excavator and a dump truck">
</p>
<p>
  <img src="docs/summit.jpg" width="49%" alt="Parked in the snow below the lookout tower on the summit">
  <img src="docs/fields.jpg" width="49%" alt="The upland farm: a tractor ploughing with gulls behind it, next to a rapeseed field">
</p>
<p>
  <img src="docs/wolves.jpg" width="49%" alt="A pack of three wolves stopping to watch the car">
  <img src="docs/ambulance.jpg" width="49%" alt="An ambulance with its blue lights on, coming along the trail">
</p>
<p>
  <img src="docs/airfield.jpg" width="49%" alt="The plane taking off from the airfield, past the hangar and the control tower">
  <img src="docs/police.jpg" width="49%" alt="A police car with its blue lights on, on the upland road">
</p>
<p>
  <img src="docs/army.jpg" width="49%" alt="An army off-roader driving the upland road">
  <img src="docs/combine.jpg" width="49%" alt="A combine harvester cutting the wheat at the upland farm">
</p>
<p>
  <img src="docs/ford.jpg" width="49%" alt="Wading through the deep ford in the hollow, with a bow wave and a wake">
  <img src="docs/tow.jpg" width="49%" alt="Stuck in the mud hole below the farm while the red tractor pulls the car out on a rope">
</p>
<p>
  <img src="docs/depot.jpg" width="49%" alt="The depot, with an arrow over each vehicle that can come along">
  <img src="docs/arch.jpg" width="49%" alt="The rock arch over the outer road, with a causeway along a fin of rock up onto its top">
</p>
<p>
  <img src="docs/desert.jpg" width="98%" alt="The oasis in the desert: palms round a pool, two mud-brick houses, a wind pump and cacti in the sand">
</p>
<p>
  <img src="docs/lorry.jpg" width="49%" alt="The lorry with its trailer on the upland road">
  <img src="docs/rally.jpg" width="49%" alt="A rally car on the track up to the summit">
</p>
<p>
  <img src="docs/menu.jpg" width="49%" alt="The pause menu: a play button and picture buttons for the car, the map, sound, cruise control, the minimap, a night at camp and going back to the start">
  <img src="docs/garage.jpg" width="49%" alt="Choosing a vehicle, a colour and roof items, with the roof tent open on the car">
</p>
<p>
  <img src="docs/map.jpg" width="98%" alt="The map of the valley from the pause menu, with a picture for each place and an arrow for the car">
</p>

## Controls

![Keyboard, touch and tilt controls](docs/controls.svg)

|                | Keyboard and mouse   | Phone or tablet                    |
| -------------- | -------------------- | ---------------------------------- |
| Drive          | `W A S D` or arrows  | Pedals (right) and steering (left) |
| Steer          | `A` `D` or `←` `→`   | Arrows, or tilt the device         |
| Brake          | `Space`              | Down pedal (hold to reverse)       |
| Horn           | `H`                  | Horn button above the pedals       |
| Look           | Drag, scroll to zoom | Drag on the scenery                |
| Cruise         | `E`                  | In the menu                        |
| Map            | In the menu          | In the menu, or tap the minimap    |
| Bring a friend | `F` by the depot     | Tap the friend at the depot        |
| Pause          | `Esc`                | ❚❚ button, top right               |
| Back to start  | `R`                  | Home button in the menu            |

To carry on after pausing, press the big play button or tap the game around the menu. With cruise control on, the car keeps driving by itself, so on touch screens only the pedal for braking and reversing shows. On a tablet held sideways the steering buttons and the pedals sit halfway up each side, under the thumbs.

## Playing on a phone

<img src="docs/phone.jpg" width="200" align="right" alt="The game on a phone, with touch pedals">

The game works on phones and tablets with on-screen pedals. You can also steer by turning the device like a steering wheel:

1. Open [nowhere-to-be.jarkovsky.com](https://nowhere-to-be.jarkovsky.com) on your phone.
2. Tap ❚❚, then the button with the tilted phone on it, and allow motion access.
3. Hold the phone like a wheel and turn it. The button with the target on it resets the straight-ahead position.

Lying the device flat stops the car. With the reverse button in the menu switched on (it only shows while tilt steering is on), leaning the device back past the way you hold it for a moment reverses, and the reverse pedal is hidden.

Browsers only allow motion sensors on secure (HTTPS) pages. The hosted game is served over HTTPS, but a local `http://192.168…` address supports the touch pedals only.

To play on your phone from your own computer, run `npm run dev` and open the **Network** address it prints, with both devices on the same Wi-Fi.

## Things to find

- **Places.** A waterfall, a farm, a fire tower, a windmill, a jetty you can drive onto, a mountain hut, a line of old concrete bunkers, a chapel, a railway halt, roadworks, a helipad and a small airfield.
- **The uplands.** Past the valley rim the land levels out into uplands. To the north-west a track climbs round three hairpins to a snowy summit with a lookout tower, the north is rocky, and in a pass to the south-east there is a small farm with fields.
- **The roads.** A paved road runs all the way round the uplands. Two roads climb up to it from the valley trail, one on each side, and blue signs with a plane on them show the way to the airfield. Beyond it, three gravel roads lead out to a longer gravel road round the outlands.
- **The outlands.** Out past the uplands, before the mountains:
  - A river with two shallow fords that the gravel road dips through.
  - A hill of bare rock with a track winding up to its top over rocks and scree, which is slow, bumpy going.
  - A natural rock arch over the road. A fin of the same rock runs out to it from the rocky hill and on down the other side, and a rough causeway along its top leads from the track up the hill, over the top of the arch and down across the meadow to the gravel road, while the road still runs underneath.
  - In the north-west, a fjord: deep water between steep walls with waterfalls down them. Hairpins lead down to a village at its head with grass-roofed houses, red boathouses, a stave church and a ferry quay. A sign at the top of the road warns of trolls.
  - A village in the west with a pond and a fire station, where the fire engine waits outside on a driveway down to the road.
  - In the south, a desert either side of the gravel road, where the grass gives way to sand and low dunes with cacti, dry bushes and tumbleweed blowing across. A track leads off the road through a canyon between two red sandstone buttes to an oasis with palms round a pool, two mud-brick houses and a wind pump. By the road there is a petrol station, where a camper van is filling up.
  - A horse farm and a farm with goats and pigs.
- **Fences.** Drive into a paddock fence at more than a walk and the stretch you hit tips over flat, posts and all, and the car goes through. The animals stay in their paddock. The fence stands up again a while after you have driven away.
- **The ferry.** A car ferry comes in along the fjord to the quay below the village, lowers its ramp, and the cars on it drive off and away up the hairpins. Then it waits, with an arrow over its deck. Drive aboard and stop, and the ramp goes up and the ferry takes you out for a short trip of about half a minute: out, round in a loop and back in the other end first, so you can drive straight off when the ramp at that end comes down. Friends following you come aboard too if there is room for them. Stay aboard and it goes round again. With nobody about, it sails off along the fjord and comes back a while later with more cars.
- **The airfield.** On a plateau to the east: a runway, a hangar you can drive into, a control tower with a beacon that turns at night, and two little planes. Every few minutes one of them taxis out, takes off, flies a loop round the uplands and lands again. It waits while you are on the runway, and goes round again if you are on it when it comes in to land.
- **Animals.** Deer, sheep, cows, chickens, a rabbit, foxes (one hunts mice by the fields), ducks, geese, an eagle, fish that jump in the lake, a pack of wolves below the summit and an owl that only comes out at night. Out in the outlands there are horses, goats and pigs at the farms, sheep above the fjord, moose, wild boar, red deer and mouflon on the rocky hill, and camels in the desert. They graze and now and then break into a run. They let a car come close, run out of its way at the last moment, and wander back once it has gone.
- **Things on the move.** A railbus runs between the halt and a tunnel in the hills, and the level crossing closes while it passes. At the roadworks an excavator loads a dump truck while a roller, a grader and a skid steer loader work on the new road. Two tractors plough and mow the upland fields and a combine harvester cuts the wheat, taking turns where their fields meet, with the furrows, the short grass and the stubble spreading out right behind them. A camper van, a pickup, a saloon and a bus drive the trail, and a fuel tanker and a delivery van drive the upland road. Now and then an ambulance, a fire engine or a police car comes by with its blue lights on while the others pull over, and sometimes an army off-roader drives through. A convoy of three off-roaders with kayaks and jerrycans on their roofs drives the outer road, and another comes the other way. Kryštof, a yellow air ambulance, is based at the airfield: every few minutes it flies low along the outer road and under the rock arch, round the north and in along the fjord.
- **Side tracks.** Narrow dirt tracks lead off the main trail to the farm, the tower, the windmill, the summit, the upland farm and up a hairpin to the hut, and a path follows the lake shore.
- **Roadworks.** A new road is being built off the upland road, a little south of where the west road comes up: fresh asphalt from the junction, then gravel, then bare earth where the machines are working.
- **Mud and water.** The car gets dusty off the trail, dustier in the desert's sand, and caked in mud in the puddles and the muddy stretches of the side tracks, and water and rain wash it clean. Wheat and long grass lie down in its tracks and stand up again over a couple of minutes. A brook runs from a spring at the foot of the northern hills, across the trail at a shallow ford and into the lake, and a track up its bank climbs over rocks that rock the car from side to side. In a hollow south of the trail, just past the start, a track goes through a deep ford where the water comes up to the doors: the car slows to a crawl, pushes a bow wave ahead of it, leaves a wake and comes out dripping.
- **The mud hole.** Below the farm, where the lane between the paddock and the wheat field runs out into the meadow, there is a deep mud hole. Drive into it and the car sinks in and gets stuck, its wheels spinning and throwing up mud. After a few seconds the farm's red tractor comes over, stops in front of the car, and pulls it out on a rope onto firm ground, then toots and drives home. The car can also creep back out in reverse before the tractor gets there.
- **The garage.** Pick an off-roader, a pickup, a camper van, a saloon, a tractor, a lorry that pulls a trailer, a rally car, a racing car or a little roadster by its picture, then a colour and roof items. Every one comes in the same colours. The lorry has a deep air horn. The roadster's lamps pop up out of the bonnet after dark and flip up and back down when it honks, and it winks once it has been parked for a moment. The roof tent opens when the car has been parked for a moment: the lid folds out as an awning on two poles and a ladder comes down beside the car. The roadster has no roof, so it carries the tent rolled up on a rack on its boot.
- **The depot.** A little way along the trail from the start, some of the vehicles you aren't driving wait at a depot, each in a colour of its own. Drive up and an arrow bobs over each one. Tap one (or press `F`) and it honks, flashes its lamps, pulls out and follows you a little way behind, stopping when you stop and honking back when you honk. All four can come along at once, one behind the other. Tap one while you are stopped, or park at the depot with them, and they stay and go back to their bays.
- **The map.** The map in the pause menu shows the whole valley, with a picture for each place and an arrow for the car pointing the way it faces. Drag it, pinch or scroll to zoom, and the button with the arrow on it brings it back to the car. Tap a place's picture to pick it as the place to go to. A small round minimap that turns with the car can be switched on in the menu: places a little beyond its edge sit on its rim the way they lie, and the picked place always does, so it shows which way to drive. Tap it to open the map.
- **Garden gnomes.** Ten are hidden around the valley, some of them far off the trail. Each one you find fills in a row of gnomes on screen, so you can see how many are left without reading. The same row is in the pause menu. Finding them all unlocks something for the car.
- **A few secrets.** Try the horn in the tunnel, near the animals, at passing cars and the train, at the helipads, at the fire station and next to the planes. Keep an eye on the snow, too.

Progress is saved in your browser.

## How it's made

Everything you see is generated in code with [Three.js](https://threejs.org), and every sound apart from the music is made with Web Audio. There are no model or texture files.

- **Terrain:** a height field built from layered noise and a few hand-placed landforms: knolls, a flat-topped hill, rocky ridges, a summit, flattened farmland and a ledge for the waterfall. Grass gives way to stony ground and then snow with height. It is fine everywhere you can drive and coarse under the distant peaks. The trails are levelled across their width, the paved and gravel roads climb no steeper than a set grade through cuttings and on banks, the railway climbs at an even grade on embankments and through a cutting, the creek, the river and the fjord are carved into the ground, and buildings sit on flattened pads, so nothing floats or sinks. Wherever a road crosses a river, it dips into the water at a ford on its own grade. Rivers, rocky ground, farms, herds and ponds are each kept in a list, so adding another is a matter of adding an entry. A test checks there are no cliffs on the valley floor.
- **Driving:** an arcade model with real velocity, tyre grip per surface, slowdown on hills and in deep water, and soft collisions. It runs in fixed steps of a sixtieth of a second, so the car drives the same at any frame rate, and is drawn between its last two steps. Each vehicle bumps into things with a row of circles from its nose to its tail, as wide as it is. Obstacles are circles, capsules and turned boxes, the boxes for buildings, so a wall stops the car where the wall is. The ferry's deck is a surface that moves: the car drives onto it like any other, and while it is parked aboard on a trip, it is carried along with the deck instead of being driven. Each tyre is settled onto the terrain triangle beneath it, within the travel its suspension allows. Tests drive the car at random among obstacles and check it never ends a step inside one, never speeds up past its top speed and never passes through a thin fence.
- **Camera:** a spring arm that pulls in when rock comes between it and the car, so the tunnel and cliffs never swallow the view, and tips with the slope ahead so it looks up a hill rather than into it. Drag to swing it round; it drifts back behind the car when you let go.
- **Buildings:** gabled houses are built from one kit (`src/world/landmarks/house.js`): walls up to where the roof meets them, a closed attic under the roof, and a box obstacle round the walls.
- **Checking the models:** `viewer.html` (open `/viewer.html` with `npm run dev`) shows every vehicle, machine, animal, plant and place on its own, with checks that point out parts left floating, gaps under buildings on slopes, gaps between a wall and the roof over it, walls the car can drive into before anything stops it, surfaces that can be seen through from behind, faces that flicker against each other and floors the car would sink into. A part only counts as held up where its surface comes within ten centimetres of another, a gap under a corner only where nothing else (a footing, the ballast) holds that corner up, faces only flicker where they lie within 2 mm of each other, and two meshes that meet along their open edges count as one closed surface. The viewer's address follows the camera, so a link opens the same view, and the Note button saves a note about what is in view to `artifacts/viewer-notes.md`. `npm run check -- hut lorry` runs the checks on whatever matches the words and says which faults are new. A test holds every model and landmark to the faults listed in `tests/geometry-baseline.json`, each by its kind and place with the reason it is allowed, so a new one can't creep in, and another checks that every parked vehicle (the friends at the depot, the fire engine, the planes) can drive out to the roads over paved ground (`src/world/access.js`).
- **Performance:** cheap Lambert materials, merged and instanced meshes, one shadow-casting light, a 60 fps cap, no rendering while paused, and a resolution that adapts to the device. The ground is split into tiles, and tiles far from the camera are drawn with fewer, larger triangles. Trees and rocks are grouped by area so whatever is out of view is skipped, distant rocks take a simpler shape, flowers, grass and bushes are only drawn near the camera, and only what stands near the car casts shadows. The tracks through the wheat and the long grass are kept in one small texture that moves along with the car. So the cost of a frame depends on what is around the camera rather than on the size of the map.

```
src/
  core/       driving physics, collisions, suspension, camera, audio, save data
  input/      keyboard, touch and tilt steering
  world/      layout, terrain, scenery, landmarks, wildlife, weather, secrets
  vehicles/   the player's vehicles, the friends, the other travellers, the train, the helicopters and the planes
  ui/         title screen, pause menu, garage, styles
```

## Music

The music is six lo-fi tracks by HoliznaCC0, who released them into the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): "Autumn", "Dream Pop" and "Old Age" from [Chill Beats](https://opengameart.org/content/chill-beats-collection), and "Clouds", "Letting Go Of The Past" and "Poor, But Happy" from [Happy Lo-Fi](https://opengameart.org/content/happy-lo-fi-lofi-collection). They play in a shuffled order with a quiet spell between them. The copies in `public/music/` are re-encoded to the same loudness, with a short fade in and out.

## Development

Requires Node.js 20.19 or newer.

```sh
npm install
npm run dev            # start the game locally
npm test               # unit tests: physics, terrain, scenery, saves, tilt, a full lap of the trail
npm run test:browser   # end-to-end smoke test in Chrome
npm run perf           # start-up time and frame cost around the map (add -- --phone for a slow phone)
npm run screenshots    # regenerate the images in docs/
npm run catalogue      # photograph every model and place from several sides into artifacts/catalogue/
npm run check          # run the geometry checks and list new faults (add words to check only some things)
npm run geometry       # record the geometry checks' findings as the new baseline, keeping the reasons given
npm run build          # static build in dist/, ready for any static host
```

CI runs the formatting check, the unit tests and a build on every push. If you use [Solo](https://soloterm.com), `solo.yml` defines the dev server and a production preview.
