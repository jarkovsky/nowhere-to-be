# Nowhere to Be

A relaxed low-poly driving game that runs in the browser. Take a little off-roader around a mountain valley at your own pace. There are no timers, no score and nothing to win. I made it for my son and me to explore together.

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
  <img src="docs/garage.jpg" width="49%" alt="Choosing a colour and roof items, with the car shown beside the menu">
  <img src="docs/scrapbook.jpg" width="49%" alt="The pause menu's scrapbook of places and animals">
</p>

## Controls

![Keyboard, touch and tilt controls](docs/controls.svg)

|        | Keyboard and mouse   | Phone or tablet                    |
| ------ | -------------------- | ---------------------------------- |
| Drive  | `W A S D` or arrows  | Pedals (right) and steering (left) |
| Steer  | `A` `D` or `←` `→`   | Arrows, or tilt the device         |
| Brake  | `Space`              | Down pedal (hold to reverse)       |
| Horn   | `H`                  | Horn button above the pedals       |
| Look   | Drag, scroll to zoom | Drag on the scenery                |
| Cruise | `E`                  | In the menu                        |
| Pause  | `Esc`                | ❚❚ button, top right               |

## Playing on a phone

<img src="docs/phone.jpg" width="200" align="right" alt="The game on a phone, with touch pedals">

The game works on phones and tablets with on-screen pedals. You can also steer by turning the device like a steering wheel:

1. Open the game on your phone (see below).
2. Tap ❚❚, turn on **Tilt to steer**, and allow motion access.
3. Hold the phone like a wheel and turn it. **Re-centre tilt** resets the straight-ahead position.

Browsers only allow motion sensors on secure (HTTPS) pages, so tilt needs the game served over HTTPS (any static host works). A local `http://192.168…` address supports the touch pedals only.

To play on your phone from your own computer, run `npm run dev` and open the **Network** address it prints, with both devices on the same Wi-Fi.

## Things to find

- **Places and animals.** A waterfall, a farm, a fire tower, a windmill, a jetty you can drive onto, a mountain hut and a line of old concrete bunkers, plus deer, cows, a fox, geese, an eagle and fish that jump in the lake. Driving past them adds stickers to your scrapbook, which you'll find in the pause menu.
- **Side tracks.** Narrow dirt tracks lead off the main trail to the farm, the tower, the windmill and up a hairpin to the hut, and a path follows the lake shore.
- **Garden gnomes.** Ten are hidden around the valley, some of them far off the trail. Finding them all unlocks something for the car.
- **A few secrets.** Try the horn in the tunnel, near the animals and at passing cars. Keep an eye on the snow, too.

Progress is saved in your browser.

## How it's made

Everything is generated in code with [Three.js](https://threejs.org) and Web Audio. There are no model, texture or sound files.

- **Terrain:** a height field built from layered noise and a few hand-placed landforms: knolls, a flat-topped hill, rocky ridges and a ledge for the waterfall. It is fine on the valley floor and coarse under the distant peaks. The trails are levelled across their width, the creek is carved into it, and buildings sit on flattened pads, so nothing floats or sinks. A test checks there are no cliffs on the valley floor.
- **Driving:** an arcade model with real velocity, tyre grip per surface, hill slowdown and soft collisions. Each tyre is settled onto the terrain triangle beneath it, within the travel its suspension allows.
- **Camera:** a spring arm that pulls in when rock comes between it and the car, so the tunnel and cliffs never swallow the view. Drag to swing it round; it drifts back behind the car when you let go.
- **Performance:** cheap Lambert materials, merged and instanced meshes, one shadow-casting light, a 60 fps cap, no rendering while paused, and a resolution that adapts to the device.

```
src/
  core/       driving physics, collisions, suspension, camera, audio, save data
  input/      keyboard, touch and tilt steering
  world/      layout, terrain, scenery, landmarks, wildlife, weather, secrets
  vehicles/   the player's car and the other travellers
  ui/         title screen, pause menu, scrapbook, styles
```

## Development

Requires Node.js 20.19 or newer.

```sh
npm install
npm run dev            # start the game locally
npm test               # unit tests: physics, terrain, saves, tilt, a full lap of the trail
npm run test:browser   # end-to-end smoke test in Chrome
npm run screenshots    # regenerate the images in docs/
npm run build          # static build in dist/, ready for any static host
```

CI runs the formatting check, the unit tests and a build on every push. If you use [Solo](https://soloterm.com), `solo.yml` defines the dev server and a production preview.
