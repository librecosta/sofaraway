# Working on SoFaraway

SoFaraway is a static browser rhythm runner with four procedurally generated volumes. The soundtrack drives the visual score and gate spacing. Player travel determines when crossings occur.

| Change | Start here |
| --- | --- |
| Menu, HUD, settings, route navigation | [`app/routes/`](app/routes/) and [`app/components/`](app/components/) |
| Run lifecycle, input, pause and recovery | [`app/game/runtime/`](app/game/runtime/) and [`app/game/contracts.ts`](app/game/contracts.ts) |
| Charts, scoring, modes, crossings | [`app/game/core/`](app/game/core/) and [`tests/core/`](tests/core/) |
| Glass, scenery, lighting, GPU ownership | [`app/game/graphics/`](app/game/graphics/) and [`app/game/debug/`](app/game/debug/) |
| Soundtrack, scheduling, playback recovery | [`app/game/audio/`](app/game/audio/) and [`tests/sync/`](tests/sync/) |

- Read [Engineering architecture](docs/engineering.md) for the current boundaries and domain contracts. Use the [verification guide](docs/verification.md) to choose tests and reproduce results.
- Treat code, tests and configuration as the sources of truth for concrete behavior. Preserve the intent of relevant contracts. Call out discrepancies before changing established behavior. See [milestone history](docs/history.md) for original decisions and evidence.
- Keep production static and browser APIs out of prerender and simulation code. Preserve fixed world positions, shared CPU/GPU gate openings and runtime-generated game assets. Keep volume-specific changes local to their intended volume.
- Write repository documentation, code comments and user-facing copy in English. Keep BSD-3-Clause and third-party notices intact.
- Develop against `dev`. Check the worktree first, preserve existing edits and keep diffs scoped. Follow the task's authorization for commits, pushes and releases. Protect `main` and avoid force pushes.
- On Node 24, the default verification is `npm run typecheck && npm test`. Add focused checks for the affected systems. In a handoff, name the touched areas, the checks actually run, and any remaining validation or environment limits.
