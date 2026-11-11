# SoFaraway

> **A hypnotic browser rhythm runner. Thread the gates, ride the beat.**

Vol. I–IV · runtime procedural graphics and music · WebGL2

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

Use Node 24 LTS and run:

```sh
npm ci
npm run dev
```

For a production preview, run `npm run build` and `npm start`, then open
<http://127.0.0.1:8080>. Any ordinary HTTP static server can serve `build/client`.

### Tests

```sh
npx playwright install chromium
npm run typecheck
npm test
npm run test:perf
```

Set `A0_BROWSER_CHANNEL=chrome` to use installed Chrome for a comparable GPU
sample. To rerun the original suite against the A0 baseline, run
`git worktree add --detach ../sofaraway-a0 88a4adb`, set `A0_APP_ROOT` to the
baseline worktree's absolute path, then run `npm run test:a0` and
`npm run test:a0:perf`. See the [A0 audit](docs/audits/A0-audit-report.md) and the
[B0 regression report](docs/audits/B0-regression-report.md).

## Controls

| Input | Action |
| --- | --- |
| Mouse / touch drag | Steer — the reticle follows your hand across the whole window |
| Arrow keys / WASD | Steer |
| Hold left button / `Shift` | Boost on desktop |
| `Space` | Start · retry |
| `M` | Mute |
| `P` | Pause or resume |
| `Esc` | Back to menu |
| `R` | Flight recorder overlay · `Shift+R` downloads the log |

## How it is built

React Router Framework Mode prerenders the menu. After hydration, React sends
commands to the runtime and subscribes to immutable snapshots for the UI. Three.js
and Web Audio are initialized in the browser.

The runtime drives a 60 Hz simulation from the audio clock or a monotonic silent
clock. Charts, collision, scoring and camera motion share the same simulation.
Chart and synthesis read the same section and tempo definitions. Render frames
can arrive at a different rate from simulation ticks.

The graphics session samples a shared path for the camera, procedural tunnel
chunks and GLSL gates. PostFX renders bloom, chromatic aberration, vignette and
grain. High and supported auto profiles add depth of field. The soundtrack is
synthesized in real time. The production preview also serves
`/tools/render-audio.html?vol=orbit` for optional offline WAV export.

```text
app/components/    React menu, HUD, settings and results
app/game/runtime/  renderer and audio ownership, sessions, RAF, input
app/game/core/     portable clock, simulation, collision, charts and volumes
app/game/graphics/ procedural scene, tunnel, gates, textures and PostFX
app/game/audio/    Web Audio transport and synthesizer
tests/             Vitest, Playwright and isolated browser harness
build/client/      generated static deployment directory
```

See the [B0 architecture contract](docs/contracts/B0-application-game-runtime-architecture.md).

## Debug parameters

| Param | Effect |
| --- | --- |
| `?vol=drift` | Load a volume (`elsewhere` · `drift` · `descent` · `orbit`) |
| `?t=24.4` | Deterministic — simulate to 24.4 s, then render one frame |
| `?god=1` | Disable collision (on by default in fixed captures, set `god=0` to judge gates) |
| `?align=1` | Steer toward gate openings |
| `?q=low` | Low quality, DPR at most 1, depth of field disabled |
| `?rec=1` | Open the flight recorder |
| `?ui=0` | Hide the UI |
| `?dbg=1` | Read-only timing, draw-call, target and resource diagnostics |

Fixed captures also accept `diff`, `boost`, and `cur`. The game accepts the
existing `post`, `dof`, `panel`, `auto`, and `q=mobile` diagnostics.

## Status

Four volumes are playable end to end. Art pass 1 geometry remains in place.
C0 covers cross-device engine stability, compatibility and real-device
performance. D0 covers art, music and gameplay polish. The game generates
environment geometry, textures and music at runtime. Screenshots in `shots/`
are for documentation.

## Credits

Made by **[librecosta](https://github.com/librecosta)**.

Built with [three.js](https://threejs.org). The game generates its materials,
geometry, textures and notes at runtime.

**Inspiration.** The mechanic is inspired by **HelloRun** (HelloEnjoy, 2013), a
browser game that proved WebGL could be this hypnotic. No code, assets or audio from
it are used here. SoFaraway is an independent work that borrows a design idea and
takes it somewhere else.

## License

[MIT](LICENSE)
