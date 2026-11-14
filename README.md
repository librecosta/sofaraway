# SoFaraway

> **A hypnotic browser rhythm runner. Thread the gates, ride the beat.**

Vol. I–IV · runtime procedural graphics and music · WebGL2

![Menu](shots/menu.png)

---

## What it is

You fly down a corridor while the game synthesises its soundtrack. Each glass
gate has exactly one opening. Find it before you reach the gate. Hold Shift to
reach the next gate sooner, or choose Sightseeing for one-third forward speed
and the same soundtrack.

Four volumes. Each is a different corridor, a different kind of glass, and a
different arrangement — but the same engine underneath.

| | World | Glass | Music | Length | Gates (Normal) |
|---|---|---|---|---|---|
| **I · ELSEWHERE** | closed octagonal conduit | **iris** — one of eight radial panes missing · **square** and **diamond** — fixed central openings | techno · 128 | 3:30 | 141 / 145 / 157 (Main / Challenge / Bonus) |
| **II · DAYBREAK** | open canal, sky above | **shutter** — one of three slats missing, horizontal or vertical | breakbeat · 120 | 2:24 | 65 |
| **III · DESCENT** | vertical shaft | **lattice** — one of eight plates missing, centre always solid | industrial · 110 | 3:38 | 158 |
| **IV · ORBIT** | light only, stars behind | **aperture** — one round hole in a full pane | synthwave · 100 | 3:12 | 91 |

The soundtrack sets the palette, the light pulses and the spacing of gates.
Your flight speed determines when you cross each gate.

## Play

Use Node 24 LTS and run:

```sh
npm ci
npm run dev
```

For a production preview, run `npm run build` and `npm start`, then open
<http://127.0.0.1:8080>. Any ordinary HTTP static server can serve `build/client`.
Configure the host to return `404.html` with status 404 for unknown paths.
See the [verification and hosting guide](docs/verification.md) for the static
artifact and hosting requirements.

ELSEWHERE Standard also offers Impossible. The menu keeps Best and Last by
volume and difficulty in this browser, including Encore bonuses in both totals.
Sightseeing shows Last Visit per volume.

### Tests

```sh
npx playwright install chromium
npm run typecheck && npm test
```

The [verification guide](docs/verification.md) covers the release smoke tests,
browser matrix, audio, benchmarks and original A0 baseline.

## Controls

| Input | Action |
| --- | --- |
| Mouse / touch drag | Steer — the reticle follows your hand across the whole window |
| Arrow keys / WASD | Steer |
| Hold left button / `Shift` | Boost on desktop |
| `X` | Start · retry |
| Click or tap START | Start |
| `M` | Mute |
| `P` / touch Pause button | Pause or resume |
| `Esc` | Back to menu |
| `R` | Flight recorder overlay · `Shift+R` downloads the log |

## How it is built

React Router prerenders the site. The browser loads a Three.js runtime and
synthesizes the soundtrack with Web Audio. Start with the [contributor guide](AGENTS.md)
or read the [engineering architecture](docs/engineering.md) for runtime boundaries,
timing, spatial crossings and resource ownership.

## Debug overview

Open `/debug/` directly or follow **Debug overview** from **Credits**.
The page renders all four worlds, every gate type and the floating pickups.
**Surface Materials** shows six lit ELSEWHERE samples and their raw channels;
**Effect Materials** shows the cyan light channel and hologram film.
**Lighting & Scenic Composition** previews six installed corridors in Standard
or Sightseeing. Choose a fixed station or one of the five S-curve views, then
scrub or play the in-game lighting score. Staggered Cells and Connected Flow
include a two-color comparison.
**End Sequence Studio** at `/debug/#outro` previews Normal and Impossible courses,
Encore, Afterglow and results. Seek by world station or fly a ten-second segment.
**UI State Studio** at `/debug/#ui-states` opens production menus, overlays,
results and recovery states in six viewport sizes without touching records or settings.
**Soundtrack** exports a WAV for the selected
volume from the same synthesizer. Use `/debug/?vol=orbit#audio` to preselect ORBIT.

### In-game debug parameters

| Param | Effect |
| --- | --- |
| `?vol=drift` | Load a volume (`elsewhere` · `daybreak` · `descent` · `orbit`). Legacy `drift` links still work. |
| `?t=24.4` | Deterministic — simulate to 24.4 s, then render one frame |
| `?god=1` | Disable collision (on by default in fixed captures, set `god=0` to judge gates) |
| `?align=1` | Steer toward gate openings |
| `?q=low` | Low quality, DPR at most 1, depth of field disabled |
| `?rec=1` | Open the flight recorder |
| `?ui=0` | Hide the UI |
| `?lights=true` | Enable Dynamic Lights for a fixed-time capture without changing settings |
| `?dbg=1` | Read-only timing, draw-call, target and resource diagnostics |

Fixed captures also accept `diff`, `mode`, and `route` for difficulty, play
mode and ELSEWHERE branch side. The game also accepts `boost`, `cur`, `post`,
`dof`, `panel`, `auto`, and `q=mobile` diagnostics.

## Status

`dev` is the development branch. Milestone decisions, superseded contracts
and previous validation reports are indexed in [milestone history](docs/history.md).
Screenshots in `shots/` are for documentation.

## Credits

Made by **[librecosta](https://github.com/librecosta)**.

Built with [three.js](https://threejs.org). The game generates its materials,
geometry, textures and notes at runtime.

**Inspiration.** The mechanic is inspired by **HelloRun** (HelloEnjoy, 2013), a
browser game that proved WebGL could be this hypnotic. No code, assets or audio from
it are used here. SoFaraway is an independent work that borrows a design idea and
takes it somewhere else.

## License

SoFarAway is licensed under the [BSD 3-Clause License](LICENSE).
The static build includes the project license, the fonts' SIL Open Font
License notices, and the bundled dependencies' third-party notices.
