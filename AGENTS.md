# Working on SoFarAway

SoFarAway is a static browser rhythm runner with four procedurally generated volumes. The soundtrack drives the visual score and gate spacing. Player travel determines when crossings occur.

| Change | Start here |
| --- | --- |
| Menu, HUD, settings, route navigation | [`app/routes/`](app/routes/) and [`app/components/`](app/components/) |
| Run lifecycle, input, pause, recovery and records | [`app/game/runtime/`](app/game/runtime/) and [`app/game/contracts.ts`](app/game/contracts.ts) |
| Charts, scoring, modes and crossings | [`app/game/core/`](app/game/core/) and [`tests/core/`](tests/core/) |
| Glass, scenery, lighting and GPU ownership | [`app/game/graphics/`](app/game/graphics/) |
| Soundtrack, scheduling, playback recovery | [`app/game/audio/`](app/game/audio/) and [`tests/sync/`](tests/sync/) |
| Technical Explorer and capture fixtures | [`app/components/explorer/`](app/components/explorer/), [`app/game/debug/`](app/game/debug/) and [`tests/harness/`](tests/harness/) |
| Prerendering, regional assets and static hosting | [`react-router.config.ts`](react-router.config.ts), [`tools/build-static.mjs`](tools/build-static.mjs) and [`tests/release/`](tests/release/) |
| Bilibili Toy entry, development and packaging | [`toy/`](toy/), [`vite.toy.config.ts`](vite.toy.config.ts) and [Toy development](docs/toy-development.md) |

- Use the [collaboration playbook](.agents/playbook.md) for taking over, sharing a workspace and handing off. Read [architecture and contracts](docs/engineering.md) for the affected subsystem and [verification](docs/verification.md) for commands.
- Treat code, tests and configuration as authoritative for concrete behavior. Use [milestone history](docs/history.md) to recover the reason for a decision or find a proposal. Call out discrepancies before changing established behavior.
- Keep production static and browser APIs out of prerender and simulation code. Preserve fixed world positions, shared CPU/GPU gate openings and runtime-generated game assets. Keep volume-specific changes local to their intended volume.
- Write repository documentation, code comments and user-facing copy in English. Keep BSD-3-Clause and third-party notices intact.
- Develop against `dev`. Check the worktree first, preserve existing edits and keep diffs scoped. Follow the task's authorization for commits, pushes and releases. Protect `main` and avoid force pushes.
- On Node 24, the default verification is `npm run typecheck && npm test`. Choose the affected suites and documentation-only checks with the [verification guide](docs/verification.md).
- Keep local captures and logs in ignored directories. Report security issues through [the private contact](SECURITY.md).
