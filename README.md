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
  <img src="docs/lorry.jpg" width="49%" alt="Oliver, a blue lorry with a face and a trailer, on the upland road">
  <img src="docs/rally.jpg" width="49%" alt="A rally car with a face on the track up to the summit">
</p>
<p>
  <img src="docs/menu.jpg" width="49%" alt="The pause menu: a play button and picture buttons for the car, sound, cruise control, a night at camp and going back to the start">
  <img src="docs/garage.jpg" width="49%" alt="Choosing a vehicle, a colour and roof items, with the roof tent open on the car">
</p>

## Controls

![Keyboard, touch and tilt controls](docs/controls.svg)

|               | Keyboard and mouse   | Phone or tablet                    |
| ------------- | -------------------- | ---------------------------------- |
| Drive         | `W A S D` or arrows  | Pedals (right) and steering (left) |
| Steer         | `A` `D` or `←` `→`   | Arrows, or tilt the device         |
| Brake         | `Space`              | Down pedal (hold to reverse)       |
| Horn          | `H`                  | Horn button above the pedals       |
| Look          | Drag, scroll to zoom | Drag on the scenery                |
| Cruise        | `E`                  | In the menu                        |
| Pause         | `Esc`                | ❚❚ button, top right               |
| Back to start | `R`                  | Home button in the menu            |

To carry on after pausing, press the big play button or tap the game around the menu. With cruise control on, the car keeps driving by itself, so on touch screens only the pedal for braking and reversing shows.

## Playing on a phone

<img src="docs/phone.jpg" width="200" align="right" alt="The game on a phone, with touch pedals">

The game works on phones and tablets with on-screen pedals. You can also steer by turning the device like a steering wheel:

1. Open [nowhere-to-be.jarkovsky.com](https://nowhere-to-be.jarkovsky.com) on your phone.
2. Tap ❚❚, then the button with the tilted phone on it, and allow motion access.
3. Hold the phone like a wheel and turn it. The button with the target on it resets the straight-ahead position.

Browsers only allow motion sensors on secure (HTTPS) pages. The hosted game is served over HTTPS, but a local `http://192.168…` address supports the touch pedals only.

To play on your phone from your own computer, run `npm run dev` and open the **Network** address it prints, with both devices on the same Wi-Fi.

## Things to find

- **Places.** A waterfall, a farm, a fire tower, a windmill, a jetty you can drive onto, a mountain hut, a line of old concrete bunkers, a chapel, a railway halt, roadworks, a helipad and a small airfield.
- **The uplands.** Past the valley rim the land levels out into uplands. To the north-west a track climbs round three hairpins to a snowy summit with a lookout tower, the north is rocky, and in a pass to the south-east there is a small farm with fields.
- **The roads.** A paved road runs all the way round the uplands. Two roads climb up to it from the valley trail, one on each side, and blue signs with a plane on them show the way to the airfield. Beyond it, three gravel roads lead out to a longer gravel road round the outlands.
- **The outlands.** Out past the uplands, before the mountains:
  - A river with two shallow fords that the gravel road dips through.
  - A hill of bare rock with a track winding up to its top over rocks and scree, which is slow, bumpy going.
  - A natural rock arch over the road.
- **The airfield.** On a plateau to the east: a runway, a hangar you can drive into, a control tower with a beacon that turns at night, and two little planes. Every few minutes one of them taxis out, takes off, flies a loop round the uplands and lands again. It waits while you are on the runway, and goes round again if you are on it when it comes in to land.
- **Animals.** Deer, sheep, cows, chickens, a rabbit, foxes (one hunts mice by the fields), ducks, geese, an eagle, fish that jump in the lake, a pack of wolves below the summit and an owl that only comes out at night.
- **Things on the move.** A railbus runs between the halt and a tunnel in the hills, and the level crossing closes while it passes. At the roadworks an excavator loads a dump truck while a roller, a grader and a skid steer loader work on the new road. Two tractors plough and mow the upland fields, and a combine harvester cuts the wheat. A camper van, a pickup, a saloon and a bus drive the trail, and a fuel tanker and a delivery van drive the upland road. Now and then an ambulance, a fire engine or a police car comes by with its blue lights on while the others pull over, and sometimes an army off-roader drives through.
- **Side tracks.** Narrow dirt tracks lead off the main trail to the farm, the tower, the windmill, the summit, the upland farm and up a hairpin to the hut, a path follows the lake shore, and a new road is being built to the south.
- **The garage.** Pick an off-roader, a pickup, a camper van, a saloon or a tractor by its picture, then a colour and roof items. There are also four characters with faces and colours of their own: Oliver and Ruda, a blue and a red lorry that each pull a trailer, a rally car and a racing car. Their eyes follow the steering, and the lorries have a deep air horn. The roof tent opens when the car has been parked for a moment: the lid folds out as an awning on two poles and a ladder comes down beside the car.
- **Garden gnomes.** Ten are hidden around the valley, some of them far off the trail. Each one you find fills in a row of gnomes on screen, so you can see how many are left without reading. The same row is in the pause menu. Finding them all unlocks something for the car.
- **A few secrets.** Try the horn in the tunnel, near the animals, at passing cars and the train, at the helipad and next to the planes. Keep an eye on the snow, too.

Progress is saved in your browser.

## How it's made

Everything is generated in code with [Three.js](https://threejs.org) and Web Audio. There are no model, texture or sound files.

- **Terrain:** a height field built from layered noise and a few hand-placed landforms: knolls, a flat-topped hill, rocky ridges, a summit, flattened farmland and a ledge for the waterfall. Grass gives way to stony ground and then snow with height. It is fine everywhere you can drive and coarse under the distant peaks. The trails are levelled across their width, the paved and gravel roads climb no steeper than a set grade through cuttings and on banks, the railway climbs at an even grade on embankments and through a cutting, the creek and the river are carved into the ground, and buildings sit on flattened pads, so nothing floats or sinks. Wherever a road crosses a river, it dips into the water at a ford on its own grade. Rivers and rocky ground are each kept in a list, so adding another is a matter of adding an entry. A test checks there are no cliffs on the valley floor.
- **Driving:** an arcade model with real velocity, tyre grip per surface, hill slowdown and soft collisions. Each tyre is settled onto the terrain triangle beneath it, within the travel its suspension allows.
- **Camera:** a spring arm that pulls in when rock comes between it and the car, so the tunnel and cliffs never swallow the view. Drag to swing it round; it drifts back behind the car when you let go.
- **Performance:** cheap Lambert materials, merged and instanced meshes, one shadow-casting light, a 60 fps cap, no rendering while paused, and a resolution that adapts to the device. The ground is split into tiles, and tiles far from the camera are drawn with fewer, larger triangles. Trees and rocks are grouped by area so whatever is out of view is skipped, distant rocks take a simpler shape, flowers, grass and bushes are only drawn near the camera, and only what stands near the car casts shadows. So the cost of a frame depends on what is around the camera rather than on the size of the map.

```
src/
  core/       driving physics, collisions, suspension, camera, audio, save data
  input/      keyboard, touch and tilt steering
  world/      layout, terrain, scenery, landmarks, wildlife, weather, secrets
  vehicles/   the player's vehicles, the other travellers, the train, the helicopter and the planes
  ui/         title screen, pause menu, garage, styles
```

## Development

Requires Node.js 20.19 or newer.

```sh
npm install
npm run dev            # start the game locally
npm test               # unit tests: physics, terrain, scenery, saves, tilt, a full lap of the trail
npm run test:browser   # end-to-end smoke test in Chrome
npm run perf           # start-up time and frame cost around the map (add -- --phone for a slow phone)
npm run screenshots    # regenerate the images in docs/
npm run build          # static build in dist/, ready for any static host
```

CI runs the formatting check, the unit tests and a build on every push. If you use [Solo](https://soloterm.com), `solo.yml` defines the dev server and a production preview.
