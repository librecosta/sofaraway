# SoFaraway

> **A hypnotic browser rhythm runner. Thread the gates, ride the beat.**

Vol. I–IV · zero assets · zero build step · WebGL2

![Menu](shots/menu.png)

---

## What it is

You fly down a corridor at the tempo of a soundtrack that is being synthesised
while you play. Bulkheads rush at you. Each one has exactly one opening. Be in it
when it arrives.

Four volumes. Each is a different corridor, a different kind of glass, and a
different arrangement — but the same engine underneath.

| | World | Glass | Music | Length | Gates |
|---|---|---|---|---|---|
| **I · ELSEWHERE** | closed octagonal conduit | **iris** — one of eight radial panes missing | techno · 128 | 3:30 | 144 |
| **II · DRIFT** | open canal, sky above | **shutter** — one of three slats missing, horizontal or vertical | downtempo · 96 | 2:20 | 40 |
| **III · DESCENT** | vertical shaft | **lattice** — one of eight plates missing, centre always solid | industrial · 110 | 4:10 | 158 |
| **IV · ORBIT** | light only, stars behind | **aperture** — one round hole in a full pane | synthwave · 100 | 3:00 | 91 |

The palette, the pulse and the gates are all driven by the same beat clock, so
the world moves to the music rather than alongside it.

## Play

**Local** — it is a static site. Any file server works:

```bash
python -m http.server 8080
```

Then open <http://localhost:8080>.

No `npm install`. No bundler. No asset pipeline. `three.js` is vendored, everything
else is hand-written ES modules.

> ES modules are subject to CORS — opening `index.html` straight off the filesystem
> will not work. Serve it over HTTP.

### A0 tests

Run `npm ci`, `npx playwright install chromium`, then `npm test` with Python 3
available. `npm run test:perf` samples real-time Chromium frames and WebGL
resources. Set `A0_BROWSER_CHANNEL=chrome` to use installed Chrome. See the
[A0 audit](docs/audits/A0-audit-report.md) for conditions,
the verification matrix, and the baseline comparison.

## Controls

| Input | Action |
| --- | --- |
| Mouse / touch drag | Steer — the reticle follows your hand across the whole window |
| Arrow keys / WASD | Steer |
| Hold left button / `Shift` | Boost |
| `Space` | Start · retry |
| `M` | Mute |
| `Esc` | Back to menu |
| `R` | Flight recorder overlay · `Shift+R` downloads the log |

## How it is built

**Everything is configuration.** `js/volumes.js` holds one record per map: tempo,
length, the section table, corridor topology, glass style, palette, lives. The
chart and the arrangement both read the *same* section table, so gate density and
instrumentation can never drift apart.

**The corridor is a curve.** `js/path.js` integrates frames along a centreline of
straights joined by quarter turns — left, right, up or down. The camera, the
geometry and every bulkhead sample the same curve.

**Geometry streams.** `js/tunnel.js` builds 210-unit chunks that grow ahead *and*
behind the camera, so a turn is fully built long before you can see it, and a
knockback never walks off the edge of the world.

**Glass is a lane abstraction.** `laneOf` / `lanePoint` / `laneCount` hide the fact
that an iris counts eight angles, a shutter counts three heights, a lattice counts
nine cells and an aperture counts... one round hole. Judgement, scoring, the
auto-align bot and the reticle lock all go through those three functions.

**No post-processing library.** A hand-rolled chain: half-res depth pass (linear
view-space distance straight into R) → depth-of-field gather with a golden-angle
kernel → bright-pass at quarter resolution → separable Gaussian ×2 → composite with
bloom, radial chromatic aberration, vignette, grain, scanlines, flash and an ACES
shoulder.

**The music is synthesized, not loaded.** Drums, bass, pad and arp are scheduled
with a 120 ms lookahead against `AudioContext.currentTime`, and the game clock reads
back from the audio clock so visuals cannot drift. Section changes fire risers and
impacts; the last two bars drop the drums and let the piece ring out as the screen
washes to white.

## Project layout

```
.
├── index.html              entry point + import map
├── css/style.css           menu / HUD / game-over UI
├── vendor/
│   ├── three.module.js     three.js r187
│   └── three.core.js
├── tools/render-audio.html offline render → WAV
└── js/
    ├── main.js             state machine, loop, input, camera, collision
    ├── volumes.js          the four volumes, as data
    ├── path.js             centreline, frames, straights and quarter turns
    ├── tunnel.js           chunked corridor: shell, ribs, light strips, rig
    ├── gates.js            bulkheads: iris / shutter / lattice / aperture
    ├── chart.js            gate chart from the section table
    ├── audio.js            procedural soundtrack (Web Audio)
    ├── post.js             depth, bloom, chromatic aberration, grain
    ├── textures.js         procedural canvas textures
    └── recorder.js         camera flight recorder + live trace overlay
```

## Debug parameters

| Param | Effect |
| --- | --- |
| `?vol=drift` | Load a volume (`elsewhere` · `drift` · `descent` · `orbit`) |
| `?t=24.4` | Deterministic — simulate to 24.4 s, then render one frame |
| `?god=1` | Disable collision |
| `?q=low` | Lock pixel ratio to 1 |
| `?rec=1` | Open the flight recorder |
| `?ui=0` | Hide the UI |
| `?dbg=1` | Draw-call / triangle readout |

## Status

Four volumes are playable end to end. Art pass 1 is done.

### Done

- [x] **Art pass 1 — geometry.** Ribs every 3 units, instanced bolts at every
      profile corner, recessed panels with chamfered edges, a raised seam rib
      splitting each bay in two, corner gussets welded into each vertex, and
      plating UVs that repeat exactly once per bay.

### Art pass 2 — baked lighting (next)

The corridor is lit entirely by its own edge glow. That is why bolts had to be
made to catch the rim light before they were visible at all, and why recessed
details only read where a chamfer turns the normal. Baking is what turns this
from "shapes that happen to catch a highlight" into actual volume.

This is an architectural change, not a texture swap, and should be planned
before it is written:

- [ ] **2a — UV atlas.** The corridor streams in 210-unit chunks, each built
      independently. A bake needs globally continuous UVs across the whole
      corridor, so either the layout must be computed upfront, or chunk
      generation must be made atlas-aware. Decide this first.
- [ ] **2b — ambient occlusion.** Cast rays against the corridor geometry
      offline (Node, no browser), store one PNG per chunk.
- [ ] **2c — irradiance.** Low-resolution per-chunk maps for indirect fill.
- [ ] **2d — material sampling.** Feed both into the shell material; corner
      gussets and recesses should darken on their own.

### Art pass 3 — WebGPU GI

Depends on 2's output. Real-time global illumination via SSGI or light probes,
with the WebGL2 path kept as a fallback.

### Open design questions

- [ ] **What does boost change?** It currently raises speed, score and field of
      view at once. Speed and beat-locked gates pull against each other; this
      has never been resolved.
- [ ] **A second verb?** Converge/spread would make "fast and risky" versus
      "slow and safe" a live choice. The alternative is one verb, pushed hard.
- [ ] **Mobile** — touch steering is relative now, boost is off on coarse
      pointers and the HUD has a portrait layout, but none of it has been on a
      real device.

### Worth verifying before building further

Audio has been written six times in this project and never heard in a finished
state; touch input has never been tried on a phone. Listen to the four
arrangements, play one run of each volume, and open settings, before starting
pass 2.

## Credits

Made by **[librecosta](https://github.com/librecosta)**.

Built with [three.js](https://threejs.org). Every material, shader, texture and note
in this repository is generated at runtime — the project ships no image files and no
audio files.

**Inspiration.** The mechanic is inspired by **HelloRun** (HelloEnjoy, 2013), a
browser game that proved WebGL could be this hypnotic. No code, assets or audio from
it are used here. SoFaraway is an independent work that borrows a design idea and
takes it somewhere else.

## License

[MIT](LICENSE)
