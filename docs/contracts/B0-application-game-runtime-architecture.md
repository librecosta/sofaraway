# B0 — Application & Game Runtime Architecture Contract

- **Project** LibreCosta / SoFarAway
- **Status** Frozen
- **Baseline** `dev@88a4adb533e2c5ec6f8e77a166ca11e75794be58`

## 1. Purpose and technology

Migrate the A0 prototype into a React application with an independent game runtime. Preserve the four volumes, three difficulties, charts, collisions, scoring, procedural environment, GLSL, synthesis, post-processing and responsive UI. Use the A0 regression baseline to verify parity.

| Layer | Technology |
| --- | --- |
| Framework | React Router 8 Framework Mode |
| UI | React 19 |
| Language | TypeScript Strict |
| Build | Vite |
| Rendering | SSG |
| Graphics | Three.js r187 / WebGL2 / GLSL |
| Audio | Web Audio API |
| Styling | CSS Modules |
| Testing | Vitest + Playwright |
| Node | Node 24 LTS |
| Deployment output | `build/client` |

Pin compatible stable versions. Scope excludes R3F, other 3D frameworks, WebGPU/TSL/GI, ECS, physics engines, UI redesign, new content or arrangements, backends, accounts, multiplayer, third-party state libraries, and production publication.

The game generates its environment, geometry, textures, and music at runtime. Source, shaders, configuration, seeds, fonts, and documentation or share images are allowed. Baked lighting, pregenerated scenes, models, and recorded audio are excluded from the game runtime.

## 2. Boundaries

- Application owns React Router, UI and static metadata. It consumes immutable snapshots and issues commands.
- Runtime owns the game lifecycle, sessions, RAF, input listeners and coordination of Simulation, Graphics and Audio.
- Simulation owns time consumption, input state, charts, collision, score and transitions. It has no platform or rendering dependencies.
- Graphics owns Three.js, path, scene, gates, streaming geometry, materials, textures and PostFX. It receives configuration explicitly and is independent of React, Router, DOM UI and persistence.
- Audio owns transport, scheduling and synthesis. It receives the volume definition explicitly and never owns HUD, scores or collision.

Volume selection is explicit across all boundaries. Use concrete typed interfaces without a plugin system, service container or global event bus. React is outside the per-frame update.

## 3. Runtime lifecycle and API

```ts
interface GameRuntime {
  initialize(canvas: HTMLCanvasElement, options: GameOptions): Promise<void>;
  start(): Promise<void>;
  pause(reason: PauseReason): void;
  resume(): Promise<void>;
  returnToMenu(): void;
  selectVolume(id: VolumeId): Promise<void>;
  setDifficulty(value: Difficulty): void;
  setQuality(value: QualityTier): Promise<void>;
  setVolume(value: number): void;
  setMuted(value: boolean): void;
  getSnapshot(): GameSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
```

Initialize once through `uninitialized → initializing → menu`. From menu/results, start a ready scene through `starting → playing`. Pause and resume retain the run. Finish or lose the last life through `crash → results`. Return from an active run, pause, crash or results to menu. Initialization or runtime failures use `unsupported` for missing WebGL2 and `error` for recoverable failures. Disposal from any phase is immediate, idempotent and terminal.

Use one RAF per runtime. Validate commands by phase. Cancel or ignore obsolete initialization, volume changes and audio starts via generations or equivalent. Start audio directly from a real gesture. Mount after hydration in a client Effect, with StrictMode-safe cleanup. Preserve usable React fallback content when initialization fails.

## 4. Session ownership

- **Application Runtime** lives from viewport mount to disposal. Owns canvas/renderer, PostFX, RAF, listeners/input, audio context and engine, quality and snapshots. Reuse it on retry and volume switch.
- **Volume Session** owns volume configuration, path, tunnel, gate geometry, scene/environment, procedural textures, materials and arrangement. Stop the old run, dispose volume resources, then load the requested volume. Release partially built resources if loading fails. Volume switches reuse the renderer and page.
- **Run Session** owns charts, cursor, input, time, score, combo, lives, hits, invulnerability, results, playback generation and output bus. Retry starts clean.

Dispose in order. Invalidate commands and async work, cancel RAF and listeners, stop audio scheduling and end the run, release the volume, release PostFX and the renderer, then close AudioContext. Shared resources are released by their owners.

## 5. Time and Simulation

One Game Transport provides authoritative beats. Read the AudioContext clock for audible runs and a monotonic clock for explicit silent runs. Gates, song sections, hue, score and song completion use the same absolute beat axis.

Run Simulation at a fixed 60 Hz independently of render refresh. Graphics may interpolate between states. At 60, 120 and 144 Hz the same inputs and logical time must yield the same charts, crossings, scores, lives, results and logical camera. Order crossings by beat and judge each gate once. Preserve A0 score and completion semantics.

Catch up by at most five fixed steps initially. Pause before applying a backlog beyond the safe window. A background or long GPU stall cannot count as a player failure. Pause for user action, visibility, context loss, audio interruption and unsafe frame gaps. Freeze game and music, preserve progress, and re-anchor both clocks on resume. Deterministic tests use explicit volume, difficulty, seeds, inputs and logical time. Independent visual noise and audio noise cannot affect game rules.

## 6. Audio

Keep the A0 synthesis and arrangements. The runtime owns the AudioEngine and supplies volume BPM/arrangement. Every run has an isolated playback generation and dry/reverb output. Stop disables scheduling, invalidates its generation, and isolates old tails.

Start is available when graphics are ready. Unlock or resume the context directly in the start gesture. Denied, unavailable or stalled activation provides an understandable recovery message, retry, and an explicit silent start. A silent run uses its own monotonic clock. Volume and mute are independent and do not rebuild the runtime.

## 7. Graphics

Use the managed Three.js r187 package. Remove the vendored copy after verified replacement. Preserve A0 paths, topology, shaders, textures, chunks, synchronized colors, camera, menus and Bloom/DOF/color effects. Use a common capability and quality profile for high, auto and low. Detect WebGL2, HalfFloat and MSAA and use supported targets/samples. Size all targets and the canvas from one effective DPR. Runtime resolution degradation and settings changes work without reload. Low skips DOF.

On context loss, stop rendering and pause the run. On recovery, revalidate capabilities and recreate GPU-only data. Expose a recoverable UI on failure. Handle visibility and BFCache as suspension and real unload as disposal.

## 8. React integration

Migrate GameViewport, MainMenu, GameHUD, SettingsPanel, ResultsScreen and GameFallback in the original visual style. Control the runtime with commands. Subscribe with `useSyncExternalStore`. React owns UI state and appearance, while a narrow view adapter may update the pointer and other high-frequency presentation values.

A readonly snapshot includes phase, volumeId, difficulty, score, lives, gate counts, combo/maxCombo, progress, section, quality, volume, muted and a reportable error. It contains no live graphics or audio objects. Keep the same reference while fields are unchanged. Publish transitions immediately and ordinary HUD updates around 10–15 Hz. Hydration starts with the same stable snapshot as the prerender. Read URL, devices and storage after hydration.

## 9. URL, storage and diagnostics

`VolumeId` is `elsewhere | drift | descent | orbit`. React Router owns `/?vol=<id>` and history, Runtime owns volume loading. Back/forward stays synchronized and switches do not reload the document. Prerendering does not depend on search params.

Persist difficulty, quality, volume, mute and best score using compatible A0 keys where possible. Protect every storage access and keep playing if storage fails. Preserve `vol`, `t`, `god`, `q`, `rec`, `dbg`, `align` and other effective A0 diagnostics. Keep fixed-time captures available. Any test-only controls must be absent from the production bundle.

## 10. Static build

React Router config uses `ssr: false`, `prerender: ['/']`, and `routeDiscovery: { mode: 'initial' }`. Build-time HTML includes title, description, intro, a menu/loading entry, OG/Twitter metadata and LibreCosta branding. Browser-only initialization is isolated in client modules loaded after hydration. Pure data and rules are Node-importable.

Serve `build/client` from a static HTTP server. No Node SSR at request time, server actions, dynamic loaders, Workers business logic or EdgeOne Functions. Verify Cloudflare Workers Static Assets and EdgeOne Pages compatibility without publication.

## 11. Organization

Use `app/root.tsx`, `app/routes.ts`, `app/routes/home.tsx`, `app/components/`, `app/styles/` and `app/game/` with contracts, runtime, core, graphics, audio and debug modules. Keep tests, docs and public files at repository level. Choose file granularity by responsibility. The engine is an internal boundary within one repository and deployment.

## 12. Testing

- Vitest covers charts, sections, seeds, difficulties, all four collision types, state and scoring, fixed-step time, pause/resume, and long-frame behavior without a browser.
- Playwright covers all 12 volume/difficulty combinations, shader/collision agreement, input, menu and results, audio lifecycle, navigation without reload, StrictMode mount/cleanup, context loss, quality/DPR/resize, static HTML and hydration.
- Repeated menu → start → return → restart → switch → restart → dispose loops verify one RAF, listener cleanup, audio isolation, bounded GPU resources and no rendering after disposal.
- Compare FPS, P50/P95, draw calls, triangles, resource counts, chunks, target sizes, and init/switch timing under A0-comparable conditions. Explain meaningful regressions. Fixed-time images and offline signals support fidelity review. Random synthesis is not a byte-for-byte guarantee.

Keep A0 independently reproducible. Port baseline assertions to pure logic and controlled test-only diagnostics. Retire HTTP source injection for the new runtime.

## 13. Stages and repository governance

| Stage | Acceptance |
| --- | --- |
| B0-A Application Foundation | Typecheck, SSG build, hydration, browser-only canvas and StrictMode cleanup. A0 remains runnable. |
| B0-B Engine Extraction | Typed Runtime/Simulation/Graphics/Audio, four sessions on one renderer, one time axis, tested rules and resource ownership. |
| B0-C React UI Migration | Preserved interactions and visual structure, Commands/Snapshots, immediate transitions and bounded HUD publication. |
| B0-D Regression & Static Build | Browser/resource/fidelity/performance regression, independent static hosting, deployment compatibility, commands and documentation. |

Use `dev` and separate commits per stage. Preserve the A0 base. Avoid main, force push, platform-specific new scripts, and unnecessary abstractions or relaxed type safety. Retain legacy entry/vendor until equivalent behavior is verified. Changes to frozen constraints require explicit discussion.

## 14. Final acceptance

All stages pass. The independent Runtime supports all 12 combinations, robust lifecycle, error recovery, and an authoritative transport. Preserve A0 visuals, audio and zero pregenerated assets. Static production output hydrates on plain HTTP and has no legacy singleton entry dependency. Document executable parity checks, performance comparison, and remaining coverage. C0 addresses broader device and engine stability. D0 addresses final visual, musical and gameplay polish.
