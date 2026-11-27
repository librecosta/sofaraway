# F4-P3 DESCENT facility construction and streaming

## Current baseline

The reference is `5602202`. Measurements use Windows 10 build 19045, Node 24.22.1, headless Chrome 158.0.8127.37 and the AMD Ryzen 7 5800H integrated Radeon (device 1638) with ANGLE D3D11 and hardware WebGL2. Fixed renders use DPR 1, High, PostFX and Dynamic Lighting, with seed 0 and the Impossible path. The game flight uses 1280×720 Auto and the production Showcase pilot, transport and fixed-step collision, with the same seed and Main route.

F4-P0's full flight recorded 28 facility builds with a CPU P95 of 21.2 ms and a maximum of 22.9 ms. The fresh reference flight recorded 28 builds with 16.0 ms median, 22.5 ms P95 and 24.3 ms maximum. Simulation remained a much smaller cost. Both recorded two intervals exceeding 33.34 ms. The fresh timer query for THE WELL reported a whole-frame median of 8.97 ms at 1080p High.

## Construction attribution

The flight instruments the existing `Tunnel._buildChunk`, `DescentFacility.build`, renderer and RAF scopes. A separate mapped Chrome CPU profile repeatedly builds the seven authored chapter chunks on the reference, using their 210-unit grid ranges and the Impossible path. Its 200 µs sampling interval and scope timings are diagnostic. The profiler samples approximately 2.52 s inside `DescentFacility.build`, exclusive of idle time. The table contains inclusive, overlapping CPU scopes. In particular, a beam emits quads and a quad bakes spill.

| Scope | Sampled CPU or measured cost | Interpretation |
| --- | --- | --- |
| Work-light source creation | 69 ms sampled in `buildWorkLights` | Includes fixture meshes and prepared line segments. Source filtering at station changes costs 18 ms sampled. |
| Vertex spill | 1,148 ms sampled inside the per-vertex spill callback | The largest isolated hot path. Projection and distance tests run even when a source contributes zero. |
| Quad generation | 1,944 ms inclusive, 567 ms self | Attribute writes, normal generation, surface coordinates and spill. |
| Beam and conduit calls | 744 ms and 667 ms inclusive | The enclosing structural creation operations, with overlapping quad and spill work. |
| Surface attributes and Float16 | 1,302 ms inclusive in `surfaceVertex`. About 95 ms in the half-float converter. | Spill math dominates the enclosing scope. It is safe to preserve the existing format and conversion. |
| IndustrialGeometry buffer assembly | 223 ms inclusive in the profile. Per batch medians are 0.2–0.3 ms in the construction sweep. | Most construction time is spent before creating the final BufferAttributes. |
| Installation matrices and attributes | 5 ms inclusive in matrix append, 41 ms in batch build. Per batch medians are 0.0–0.2 ms. | The instance setup represents a small part of the build. |
| Path and zone dimensions | About 8 ms in path sampling and 2 ms in dimensions | The density and station sampling are already inexpensive. |
| Submission and disposal | Flight logging records buffer API duration, submitted bytes, chunk lifetime, and complete Graphics Update separately. | Buffer calls measure CPU submission. Their duration does not measure DMA or completion on the GPU. |

One reference build frame aligned with a 54 ms browser Long Task. At station 5657.55, entering the Transfer reconstruction, the 17.6 ms facility batch was part of a 50.8 ms update followed by a 54.1 ms RAF interval. That frame submitted 3,809,952 bytes to GL, including the chamber and other batches. The second Long Task occurred away from any recorded chunk build. Most reference batches above 20 ms were followed by intervals around 21–25 ms. [Architecture](../../app/game/graphics/descent-architecture.ts) · [Facility](../../app/game/graphics/descent-facility.client.ts) · [Harness](../../tests/harness/stability.ts)

## Production changes

1. Prepared work-light segments carry an axis-aligned bound extended by their authored reach and a conservative floating-point margin. A point outside the box cannot be in range of any projection on the segment. The station filter, surviving source order, exact closest-point calculation, intensity and strongest-lamp tie rule carry forward. Computing the projection and normal incidence with scalar components keeps the original arithmetic order. The final half-float conversion uses the existing functions.
2. Each IndustrialGeometry batch reuses its own eight beam corners and two vectors for successive beams. A quad submits the four vertices' attributes in the existing order with three array pushes. This preserves the directions and material assignment and applies to the facility and shared Transfer geometry builder.

The changes operate within the same synchronous chunk build. Buffer and shader ownership, streaming windows and rebuild triggers are the same. Scratch storage belongs to one in-progress batch. The segment bounds have the same lifetime as the work lights of that batch.

### Candidate trials

The isolated bounds trial lowered PRESSURE CPU median from 8.4 to 6.85 ms and LOCKDOWN from 13.2 to 11.3 ms. It produced little change in FLIGHT and BREACH. Beam scratch and grouped writes also reduced some chapters, with tail improvements varying by trial. Combining both reduced chapter medians consistently. The follow-up pairing of scalar projection against the previous combined version reduced PRESSURE from 6.45 to 5.55 ms and LOCKDOWN from 11.2 to 9.4 ms. The ship decision uses the full-run and fixed-scene comparisons below.

Installation repacking, a capacity-managed typed-array writer, asynchronous prebuild and enlarged stream windows were left out. The CPU profile puts packing, installation and path work well below spill and quad generation. Layer suppression stayed in the test harness because it changes occlusion or the image.

## Fixed scenes

A separate CPU-only construction sweep uses 32 builds per chapter per trial in the same browser. One untimed pass prepares the seven ranges. Every measured build uses the production path, emits full geometry and releases it after timing. These are medians of the corresponding trial statistics, in milliseconds, ordered Reference → Candidate → Candidate → Reference.

| CONTROL section / facility | Chunk start | Reference P50/P95/max | Candidate P50/P95/max |
| --- | ---: | ---: | ---: |
| ORDER / Control | 2100 | 10.20 / 13.65 / 14.60 | 8.30 / 13.20 / 14.10 |
| LOCK / Control | 5040 | 10.30 / 13.10 / 13.85 | 7.45 / 10.70 / 11.35 |
| FLIGHT / Transit | 6090 | 9.40 / 13.20 / 13.65 | 7.15 / 9.15 / 14.60 |
| PRESSURE / The Well | 7560 | 8.30 / 11.20 / 11.50 | 5.85 / 7.50 / 7.80 |
| HOLD / Core | 8400 | 5.55 / 7.15 / 7.90 | 4.55 / 5.75 / 6.30 |
| LOCKDOWN | 9240 | 13.10 / 15.85 / 17.45 | 9.45 / 11.85 / 12.65 |
| BREACH | 10080 | 2.65 / 3.45 / 3.95 | 2.35 / 3.30 / 3.50 |

The camera-driven test also measures streaming work in the first draw. Values below are the median sum of facility build durations across the two runs of each version. They exclude GPU work and other first-draw preparation. The opening camera uses the playable scene, while the standalone sweep samples the middle of the authored ORDER range.

| 1080p High view | First-draw builds, reference → candidate (ms) | Warm whole-frame GPU P50/P95, reference → candidate (ms) | Warm Scene Colour P50/P95, reference → candidate (ms) |
| --- | ---: | ---: | ---: |
| ORDER | 55.85 → 46.65 | 7.50/8.02 → 7.37/7.73 | 4.56/4.82 → 4.57/4.71 |
| LOCK | 44.75 → 32.60 | 7.77/8.14 → 7.54/7.98 | 4.82/5.16 → 4.58/5.13 |
| TRANSFER Main | 13.65 → 13.15 | 7.32/7.66 → 7.07/7.44 | 4.75/5.07 → 4.61/4.89 |
| TRANSFER Challenge | 14.20 → 10.05 | 7.07/7.47 → 6.99/7.34 | 4.59/4.96 → 4.52/4.94 |
| TRANSFER Bonus | 13.20 → 12.00 | 7.28/7.67 → 7.32/7.77 | 4.61/4.93 → 4.62/4.95 |
| THE WELL | 34.60 → 32.20 | 9.41/9.66 → 9.37/9.86 | 6.62/6.95 → 6.50/7.35 |
| CORE | 62.75 → 52.00 | 7.30/7.82 → 7.38/8.15 | 4.89/5.17 → 4.68/5.03 |
| LOCKDOWN | 70.65 → 52.35 | 7.84/8.21 → 8.18/8.44 | 5.31/5.85 → 5.39/5.72 |
| BREACH | 14.50 → 11.80 | 6.68/7.25 → 6.72/7.08 | 4.16/4.58 → 4.11/4.58 |
| Encore | 10.95 → 7.95 | 6.27/6.47 → 6.04/6.33 | 3.54/3.72 → 3.55/3.73 |
| Afterglow | 7.45 → 3.65 | 5.30/5.59 → 5.27/5.65 | 2.74/2.89 → 2.73/3.04 |

The warmed camera test returned nine independent whole-frame GPU queries per trial and zero disjoint or unready samples. GPU deltas vary in both directions with unchanged draw counts. The optimization reduces CPU build cost. Representative warmed RAF P95/P99 also varied, from 20.85/22.95 to 22.85/24.95 ms in THE WELL, and from 18.85/27.05 to 18.75/20.85 ms in BREACH.

## Full-flight CPU and RAF

The 720p Auto flights used trusted Start and Resume clicks, real CONTROL audio, an Impossible Main Showcase at seed 0 and an unchanged flight pilot. Each flight completed in about 171 seconds. Values use the harness's per-run percentiles, in milliseconds. Initialization and the first start are reported separately from the traced flight.

| Trial | Facility builds | Facility P50/P95/max | Build sum | Graphics Update P95/max | RAF P95/P99/max | RAF >33.34 ms | Browser Long Tasks | Whole GPU P50/P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Reference 0 | 28 | 16.0/22.5/24.3 | 424.4 | 0.2/50.8 | 8.4/12.5/54.1 | 2 | 2 | 3.59/4.47 |
| Candidate 1 | 29 | 12.4/23.7/25.1 | 382.6 | 0.2/39.5 | 8.4/12.6/54.2 | 4 | 1 | 3.58/4.48 |
| Candidate 2 | 28 | 10.0/23.2/25.9 | 302.6 | 0.2/41.4 | 4.3/4.5/41.6 | 1 | 0 | 2.75/3.52 |
| Reference 3 | 28 | 13.7/22.7/25.6 | 369.0 | 0.2/44.4 | 4.3/8.3/50.0 | 1 | 0 | 2.71/3.54 |

The 28 matching chunk ranges consumed 396.7 ms across the median reference flight and 337.4 ms across the median candidate flight, a 15% reduction. The median of each run's build P50 fell from 14.85 to 11.20 ms. The per-run P95 and maximum varied around 23 ms and 25 ms and showed no reliable improvement. Candidate 1 traced one extra rear chunk at launch, covering 3990–4200. Its 10.5 ms assembly and 13.8 ms update preceded a 54.2 ms interval. That interval includes time outside Graphics Update.

The same Transfer rebuild at station 5657.55 produced the clearest frame improvement. Its facility batch held 19,096 vertices and 308 installation instances. The two references measured 17.6 and 15.5 ms for that batch, 50.8 and 44.4 ms for the complete update, and 54.1 and 50.0 ms to the next RAF. The candidates measured 10.4 and 10.1 ms, 39.5 and 41.4 ms, and 41.7 and 41.6 ms respectively. The worst single candidate interval came from the separate launch frame. Whole-run P95 was unchanged within each adjacent pair, and intervals above 33.34 ms totalled three on reference and five on candidate. Evidence supports a smaller Transfer spike with mixed whole-flight tails. GPU samples ranged from 1,371 to 1,694 per run with zero disjoint or unready queries. Simulation step P95 stayed at 0.1 ms.

All four runs reached Results with the same 189/189 gates and zero hits. Audio reported one resume and zero late callbacks, missed steps or silent fallbacks in every run. Disposal closed the audio transport and cleared the scheduler, run bus, RAF, input and listeners. The authored 136 BPM, 384-beat score and lighting policy are shared by both builds. [Showcase benchmark](../../tests/stability/stability.spec.ts)

## GPU review

Reference 1080p High median of three trials. Each cell lists whole-frame / Scene Colour GPU time in ms. The harness rotates hardware timer queries across the passes. Pass samples use different frames. Their medians should be interpreted independently.

| View | Full | Hide structural mesh | Hide fixture and installation optics | Hide laser panes |
| --- | ---: | ---: | ---: | ---: |
| Transfer Main | 7.41 / 4.72 | 4.60 / 2.06 | 6.84 / 4.18 | 7.55 / 4.72 |
| THE WELL | 8.97 / 6.57 | 4.99 / 2.73 | 8.53 / 5.75 | 8.82 / 6.12 |
| CORE | 6.90 / 4.68 | 4.08 / 1.74 | 6.77 / 4.35 | 7.03 / 4.66 |
| LOCKDOWN | 7.97 / 5.26 | 5.04 / 2.47 | 7.71 / 4.85 | 7.72 / 5.01 |

Rendering the structural layer accounts for the largest isolated difference. It includes the large opaque PBR surfaces and their visible industrial finish and spill. Changing visibility also changes overdraw and the later colour buffer, so these differences describe layers under the diagnostic conditions. The fixed probes gave no evidence of an equivalent draw that could be removed. This change keeps the existing materials, colour-only MSAA resolve, lens effects and target sizes.

## Geometry and visual equivalence

The geometry test freezes 16 SHA-256 fingerprints captured before the change, across all seven Impossible chapters, Normal and Sightseeing paths, seed 0 and 1 Transfer chambers, Encore and the Afterglow boundary. Mesh order and names, indices, typed vertex attributes, normalized flags, geometry groups, float-rounded bounding radii, instance matrices and cues are included. Both sets of bytes use the existing Three.js builders and conversion formats. [Geometry regression](../../tests/core/descent-facility-geometry.test.ts)

All 11 new DESCENT 1080p High camera fixtures matched the reference PNG byte for byte, including three Transfer routes, THE WELL, CORE, LOCKDOWN and both ending views. Visual inspection checked the lit beams, platforms, gate openings and the enclosure transition across the ending. The additional 38 production High fixture pairs also matched byte for byte across ELSEWHERE, DAYBREAK, DESCENT and ORBIT, including AURORA and APHELION. The existing moving Encore and Afterglow probes also passed at Low, Auto and High with Boost input. [Fixed scene test](../../tests/stability/descent.spec.ts) · [Cross-volume fixtures](../../tests/stability/stability.spec.ts)

## Startup and resource lifecycle

The 960×540 High harness measured first DESCENT menu readiness at 231.4 → 198.85 ms, the median of two fresh page runs per version. The assembly portion was 66.7 → 43.45 ms. Repeat DESCENT selection was 66.95 → 66.35 ms, with overlapping 60.3–81.7 and 49.5–84.0 ms ranges. Menu readiness includes runtime and scene preparation. The difference in repeated selection did not resolve beyond run-to-run variation.

The full-flight launches ranged from 175.8 to 1,256.4 ms before the menu was ready. The PMREM scope alone ranged from 18.8 to 549.2 ms across those launches. First trusted click to playing ranged from 87.1 to 286.8 ms across the two versions. These measurements show large browser and renderer startup variance. They support no general claim about cold-start savings beyond the separately measured facility construction scope.

Each of four pages performed two cycles of ELSEWHERE → DESCENT → DAYBREAK → DESCENT → ORBIT → DESCENT. Each DESCENT revisit exercised Low, Auto, High, play and return to menu. The second cycle on each page also lost and restored the real WebGL context on each DESCENT revisit. One canvas remained active, GL reported no errors, and the menu returned to three chunks, 21 geometries, seven or nine textures and ten programs. Final disposal removed the canvas, lost its context and released the scheduler, RAF, input and listeners. At 1080p fixed High both versions retained the same five targets (1920×1080 HDR colour with 4× MSAA, full-resolution depth, 960×540 DOF and two 480×270 bloom targets).

Across the full flights the sampled peaks stayed at 46 geometries, seven textures, 12 programs and 50 draw calls. On the three comparable 28-build flights, build frames generated 29,750,724 bytes of geometry data and submitted 16,085,452 buffer bytes to GL in aggregate. These are cumulative submissions in the traced build frames. Retained GPU bytes and asynchronous transfer time require driver telemetry. Minimum front lookahead at build frames remained 432.45 world units in all trials. Sampled peak JS heap ranged from 32.5 to 45.4 MB, with the usual garbage-collection variation.

## Verification and limits

- `npm run typecheck && npm test` passed. The default pipeline built the production artifact and browser harness and passed all 364 unit tests and 218 browser tests. Coverage includes the 16 geometry fixtures, the four-volume authored/spatial fingerprints, cross-tab records, Showcase and the Explorer laboratories.
- Chrome stability checks passed for the CPU profile and GPU attribution (2), fixed scenes and lifecycle (8, including cross-volume fixtures and moving Encore/Afterglow), and the four audio-led Showcase runs.
- The focused browser run passed all 8 performance and ORBIT warmup checks. `npm run test:release` passed all six static production checks.
- The DESCENT browser cases passed manual Main, Challenge and Bonus traversal across seeded Standard and Sightseeing runs, Normal through Impossible gate visibility, sustained Boost through escape, ending results, WebGL restoration and CONTROL export. The unchanged ELSEWHERE high-DPR DROP assertion passed in this run.
- Two preliminary production builds hit the known intermittent prerender timeouts on `/debug/gameplay/` and `/debug/interface/`. The third build, release build and default test build succeeded with the same implementation.
- Performance values describe one hardware GPU and browser configuration. RAF measures browser callbacks and the coarse task observer measures tasks of at least 50 ms. Physical display cadence, hardware GPU memory and driver transfer timing remain unmeasured. The measurements support keeping the CPU optimization and leaving the current GPU path in place.

## Reproduction

Build the production artifact from `5602202` in a separate checkout and copy the current `tests/harness/stability.ts` into that checkout. Build the reference harness with source maps using the same locked dependencies. Put both outputs under the ignored reference directory.

```powershell
$env:STABILITY_CHROMIUM_CHANNEL = 'chrome'
$env:STABILITY_REFERENCE_DIR = (Resolve-Path 'playwright-report/f4-p3-reference').Path
$env:A0_BROWSER_CHANNEL = 'chrome'
$env:RELEASE_CHROMIUM_CHANNEL = 'chrome'
npm run build
npm run build:harness -- --sourcemap
node node_modules/@playwright/test/cli.js test --config playwright.stability.config.ts --grep '@p3-profile|@p3-attribution'
node node_modules/@playwright/test/cli.js test --config playwright.stability.config.ts --grep '@p3-cpu|@p3-fixed|@p3-lifecycle|@p1b High visual fixtures|@descent-outro-perf'
node node_modules/@playwright/test/cli.js test --config playwright.stability.config.ts --grep 'audio-led complete Showcase.*descent'
npm run typecheck
npm test
npm run test:release
```

Keep the CPU profile, raw timings and PNGs under ignored `playwright-report/`. Use the same hardware, viewport, browser channel and background workload for the four trials. The GPU timer reports `GPU_TIMING_UNAVAILABLE` on a device without valid queries. RAF is the callback cadence observed by Chrome.
