# Engineering architecture

Use the [player README](../README.md) for controls and diagnostics, and the [verification guide](verification.md) for executable checks. [`package.json`](../package.json) and its lockfile define the supported toolchain and exact dependency versions.

## Runtime boundaries

- **Application** owns route state, accessible menus, HUD and persistence. `GameViewport` loads the runtime after hydration and consumes read-only snapshots through `useSyncExternalStore`. React issues commands through [`GameRuntime`](../app/game/contracts.ts) and stays outside the fixed-step and drawing loops.
- **Runtime** owns the canvas session, renderer, RAF, input listeners, run lifecycle and audio transport. Retries and volume switches reuse the runtime. Async work must respect the current generation. Context restoration rebuilds GPU resources while retaining the run, including the random layout. BFCache suspends the runtime, and permanent teardown disposes it.
- **Simulation** owns deterministic charts, movement, crossings, lives, scoring and results. It runs without a browser. [`Path`](../app/game/graphics/path.ts) and [`BranchPath`](../app/game/graphics/branch-path.ts) are shared Three.js vector math that can be imported by Node. WebGL, DOM input and audio stay in their client modules.
- **Graphics** owns the visual scene and reads simulation state. Volume-owned materials, textures and reusable templates outlive streamed chunks. Chunks dispose their own geometry. Debug previews use the runtime generators with their own resource owners. ELSEWHERE-specific art belongs in its own paths and presets.
- **Audio** owns Web Audio activation, the per-run output bus, scheduling and synthesis. Runtime aligns its anchor to the same run timeline as simulation. Audio callbacks have no authority over scoring or crossings.

## Time, space and recovery

[`clock.ts`](../app/game/core/clock.ts) defines a monotonic run timeline and 60 Hz simulation. User pauses, background suspension and graphics interruptions freeze the timeline. Ordinary stalls leave bounded catch-up debt. Audio skips expired scheduling steps and resumes on its original grid. A later audio interruption can fall back to silent play and offer a gesture to restore sound at the current offset.

[`reference-track.ts`](../app/game/core/reference-track.ts) converts authored beats into fixed main-path stations. Simulation advances by arc length, interpolates the player's local position at each crossing and judges each event once. Boost changes arrival time. Musical time still drives sections, light and the song end. On branches, the same station maps to route-specific arc length, including the length difference carried through the merge. The [world-space contract](contracts/D0-B2-F2-world-space-gameplay-graceful-recovery.md) records the model and why it replaced beat-locked crossings.

Standard has three base difficulties and an ELSEWHERE-only Impossible chart. Sightseeing uses five lives, one-third forward speed, a sparser chart and the same song duration. The fixed pickup, branch layout and obstacle shapes have separate sources in [`pickups.ts`](../app/game/core/pickups.ts), [`branches.ts`](../app/game/core/branches.ts) and [`collision.ts`](../app/game/core/collision.ts). Branch and pickup randomness use independent streams. Rendering and collision must agree on the opening and spatial station of each gate. Technical recovery can neutralize an unobservable crossing without rewarding or penalizing the player. See [`simulation.ts`](../app/game/core/simulation.ts) for the results semantics.

## Compatibility contracts

| Surface | Authoritative artifact and expected behavior |
| --- | --- |
| Static entry points | [`react-router.config.ts`](../react-router.config.ts) prerenders `/` and `/debug/`. [`app/routes.ts`](../app/routes.ts) declares application routes. `/tools/render-audio.html` is a legacy redirect to the unified Debug soundtrack tool. Keep a real 404 and build to `build/client`. |
| Preferences, diagnostics and records | [`settings.client.ts`](../app/game/runtime/settings.client.ts) parses settings. [`records.client.ts`](../app/game/runtime/records.client.ts) owns the versioned Best and Last records. Storage is optional. Sightseeing and technically neutralized runs are ineligible to update a Standard Best. |
| Visual assets | Generate game geometry, materials and sound at runtime. Fonts, their notices and documentation screenshots are checked-in assets. Keep writable test globals in [`tests/harness/`](../tests/harness/) and its separate output. |
| DAYBREAK | The [production contract](contracts/D1-A0-daybreak-production.md) describes the shared score, world-space chart, rhythm events and separate record namespace for VOL. II. |
| ELSEWHERE glass and scenery | The [glass optics](contracts/D0-B1-procedural-glass-optics.md), [micro-surface](contracts/D0-B1-R2-micro-surface-polish.md), [surface material](contracts/D0-B3-M0-material-surface-dressing.md) and [corridor atlas and S-curve](contracts/D0-B3-A1-F2-long-corridor-lighting-s-curve.md) contracts explain the current design. Simulation and rendering share one path for the selected mode. Theme geometry uses fixed reference stations and Color Score uses song time. |

Record significant new decisions in the relevant contract or in milestone history. Link the affected sources and checks, and record which earlier decisions the change supersedes.
