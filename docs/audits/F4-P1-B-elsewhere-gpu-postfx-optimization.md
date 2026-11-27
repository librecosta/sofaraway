# F4-P1-B high-resolution rendering and PostFX

## Scope

The production change removes the single-sample depth resolve from the multisampled scene colour target. Scene occlusion still uses multisampled depth. Depth of field reads a separate linear-depth texture. The scene colour texture is the only output from the multisampled target that a later pass reads. All four volumes use this colour target. ORBIT retains its own preparation and still bypasses the ordinary depth and DOF passes.

The change keeps the High profile's HDR colour format, 4× MSAA on the test adapter, effective DPR, 14 DOF taps and Bloom settings. It preserves the existing composite, colour and lighting shaders, scene geometry, and resources allocated to each quality tier. [PostFX implementation](../../app/game/graphics/post.client.ts) · [Quality selection](../../app/game/graphics/quality.ts)

## Method

The reference is `221f440`, including the F4-P1-A tunnel work. Tests ran on Windows 10 build 19045 with Node 24.22.1, Chrome 158.0.8127.37 headless, AMD Ryzen 7 5800H integrated Radeon Graphics (device 1638), ANGLE D3D11 and hardware WebGL2. The viewport and backing buffer use DPR 1. Desktop Auto selects the same quality path as High on this adapter. PostFX and Dynamic Lighting are on.

The fixed runs use seed 0, Standard mode at Impossible difficulty, a centred Main route camera and the established F4-P0 stations. ELSEWHERE uses the S-Curve under Boost. DAYBREAK uses SUNBURST, DESCENT uses THE WELL, and ORBIT uses AURORA. The paired matrix runs reference, candidate, candidate and reference in that order. A run includes preparation, a first draw, 24 warm-up draws, then 336 measured animation frames. Each reported percentile is the median of the individual run percentiles. The historical F4-P0 and F4-P1-A values provide context. The measured reference in this report supplies the denominator for changes.

The test harness uses `EXT_disjoint_timer_query_webgl2` to rotate non-overlapping scopes. In the attribution mode, whole frame, Scene Colour, Depth, DOF, Bright, Blur and Composite rotate. The Blur query result sums its four sequential draws from the same sampled frame. Whole-frame GPU results come from their own query. Pass percentiles come from separate sampled frames and cannot be added to obtain whole-frame percentiles. RAF intervals include browser scheduling and GPU back pressure. Shader compile and link call durations in the startup trace measure CPU submission.

## GPU attribution and candidates

At 1920×1080 High, the fresh reference S-Curve measures 10.08 ms for whole-frame GPU P50 and 6.91 ms for Scene Colour. The depth prepass is 0.19 ms, DOF 1.59 ms, Bright 0.21 ms, four Blur draws 0.13 ms and Composite 0.96 ms. Each attribution case runs three times with the order reversed on the middle trial. Each available scope has 12 valid queries per run, with no disjoint or unready queries.

| Harness-only probe | Whole GPU P50 / P95, ms | Scene Colour P50 / P95, ms | Finding |
| --- | ---: | ---: | --- |
| Reference | 10.08 / 10.46 | 6.91 / 7.40 | Scene Colour is the largest measured scope. |
| Colour-only resolve | 9.17 / 9.93 | 6.05 / 6.60 | Kept. Each run removes 336 depth resolves and retains 336 colour resolves. |
| Single-sample colour target | 6.28 / 6.84 | 3.29 / 3.49 | MSAA contributes substantial work. Rejected for visible edge changes. |
| RGBA8 colour target | 7.55 / 8.10 | 4.83 / 4.94 | The high-precision target contributes substantial work. Rejected for HDR and colour differences. |
| Hide additive gate glass | 8.36 / 8.62 | 5.43 / 5.63 | Gate glass is a significant component of transparent work at this view. The test changes the picture. |
| Hide additive fixtures | 9.56 / 10.00 | 6.62 / 6.78 | Fixture overlays account for a smaller share in this view. Their lighting remains part of the scene. |
| Hide transparent meshes | 8.15 / 8.48 | 5.26 / 5.62 | Transparency and overdraw matter. This filter overlaps the glass and fixture tests. |
| Hide opaque meshes | 6.39 / 6.82 | 3.63 / 3.88 | Opaque work matters. Removing these meshes also changes the coverage of transparent draws. |
| Force opaque materials to FrontSide | 9.07 / 9.35 | 6.14 / 6.29 | The saving depends on face coverage. Rejected because the scene relies on two-sided surfaces. |
| Skip the redundant clear in the probe | 9.68 / 9.89 | 6.71 / 6.85 | A smaller gain against the baseline. The effect after removal of the depth resolve remains unmeasured. |
| Use an R16F linear-depth target | 9.64 / 9.87 | 6.69 / 7.05 | DOF P50 falls to 1.41 ms. Whole-frame trials overlap the reference and wider format compatibility remains unverified. |

The MSAA and format probes show sensitivity to sample count, resolve work and target bandwidth. Their effects overlap. They do not isolate a memory-bandwidth counter or identify a single fragment shader as the cause. The visibility probes change early-depth behaviour and overdraw. They establish where work occurs and cannot estimate independent savings by subtraction. The existing gate glass and corridor fixtures already use a single draw per double-sided transparent mesh. [Gate glass](../../app/game/graphics/gates.client.ts) · [Corridor fixtures](../../app/game/graphics/corridor-lights.client.ts)

Three.js includes both colour and depth in its explicit WebGL framebuffer blit when the target's default `resolveDepthBuffer` is true. The measured probe changes only that flag and yields the same PNG at 1080p. The production target now sets the flag when constructed. Its depth attachment continues to participate in rasterization and depth testing. There is no extra target or draw. ORBIT also benefits on the tested explicit-blit path.

A second three-repeat sweep after the browser suite measured 8.15 → 7.03 ms whole-frame P50 and 5.55 → 4.55 ms Scene Colour P50 for the resolve probe. All three repeats retained the colour blit and omitted the depth blit. The first repeat captured identical reference and colour-only PNGs. The absolute reference times moved between sessions. The within-session deltas and the paired production builds verify the same cost reduction.

DOF is the largest full-screen effect. The dedicated Depth pass is small in this fixture. The R16F diagnostic changes the colour attachment of that pass without reducing its precision per component. Its whole-frame evidence does not justify extending the change to a second target. DOF offsets and weights, Bloom thresholds and four blur draws, and all Composite effects retain their existing implementations. Benchmarks did not establish a benefit from rewriting their shader arithmetic.

## Paired results

Whole-frame timings use GPU queries. Values are reference → candidate in milliseconds. The last column is the reduction in whole-frame GPU P50. With 12 GPU samples per scope and run, P95 and P99 fall on the same observed value. All 48 runs reported GPU timing available, with zero disjoint or unready queries. Every reference run made 336 colour and 336 depth resolves. Every candidate run made 336 colour and zero depth resolves.

| Volume / fixed scene | Profile | Whole GPU P50 / P95 / P99 | RAF P95 / P99 | GPU P50 reduction |
| --- | --- | ---: | ---: | ---: |
| ELSEWHERE S-Curve | 540p High | 2.42 / 3.56 / 3.56 → 2.15 / 3.13 / 3.13 | 4.30 / 4.30 → 4.30 / 4.30 | 11.2% |
| ELSEWHERE S-Curve | 720p Auto | 4.40 / 4.87 / 4.87 → 3.69 / 3.98 / 3.98 | 8.40 / 8.55 → 6.30 / 6.40 | 16.1% |
| ELSEWHERE S-Curve | 1080p High | 10.48 / 11.08 / 11.08 → 8.72 / 9.12 / 9.12 | 14.65 / 16.70 → 12.60 / 12.60 | 16.8% |
| DAYBREAK SUNBURST | 540p High | 1.76 / 3.17 / 3.17 → 1.48 / 2.20 / 2.20 | 4.25 / 4.30 → 4.30 / 4.30 | 16.0% |
| DAYBREAK SUNBURST | 720p Auto | 3.22 / 4.44 / 4.44 → 3.11 / 3.40 / 3.40 | 4.30 / 8.30 → 6.30 / 6.35 | 3.5% |
| DAYBREAK SUNBURST | 1080p High | 8.39 / 8.88 / 8.88 → 6.98 / 7.57 / 7.57 | 12.60 / 12.60 → 12.50 / 12.60 | 16.8% |
| DESCENT THE WELL | 540p High | 2.23 / 2.62 / 2.62 → 1.91 / 2.17 / 2.17 | 4.25 / 4.30 → 4.25 / 4.30 | 14.7% |
| DESCENT THE WELL | 720p Auto | 3.98 / 4.65 / 4.65 → 3.70 / 4.02 / 4.02 | 8.30 / 8.40 → 6.25 / 6.35 | 7.0% |
| DESCENT THE WELL | 1080p High | 10.31 / 10.78 / 10.78 → 9.26 / 10.25 / 10.25 | 14.65 / 16.70 → 12.60 / 14.70 | 10.2% |
| ORBIT AURORA | 540p High | 2.12 / 2.74 / 2.74 → 1.97 / 2.82 / 2.82 | 4.25 / 4.30 → 4.25 / 4.30 | 7.3% |
| ORBIT AURORA | 720p Auto | 3.81 / 4.30 / 4.30 → 3.40 / 3.91 / 3.91 | 8.30 / 8.45 → 4.30 / 6.35 | 10.8% |
| ORBIT AURORA | 1080p High | 9.81 / 10.61 / 10.61 → 7.88 / 8.38 / 8.38 | 12.60 / 14.70 → 12.50 / 12.60 | 19.7% |

At 1080p, both ELSEWHERE candidate whole-frame P50 values lie between 8.71 and 8.72 ms. The reference values lie between 10.44 and 10.52 ms. The higher 720p DAYBREAK RAF P95 and 540p ORBIT GPU tail are small-sample reversals. DAYBREAK's 720p GPU P95 and RAF P99 improve. ORBIT's 540p RAF percentiles are identical. The fixed 1080p runs record no RAF intervals over 33.34 ms.

### 1080p High GPU passes

Each cell shows P50 / P95 in milliseconds. The four scenes use beat and station pairs 228 / 7340.59074, 192 / 7564.96517, 201 / 7336.70358 and 279 / 8665.90693, respectively.

| Volume | Scene Colour | Depth | DOF | Bright | Blur | Composite |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ELSEWHERE | 7.42 / 7.93 → 5.77 / 5.94 | 0.19 / 0.23 → 0.18 / 0.21 | 1.56 / 1.81 → 1.51 / 1.59 | 0.21 / 0.28 → 0.21 / 0.24 | 0.13 / 1.16 → 0.13 / 0.72 | 0.91 / 1.01 → 0.94 / 0.96 |
| DAYBREAK | 5.88 / 6.27 → 4.42 / 4.62 | 0.13 / 0.16 → 0.13 / 0.16 | 1.17 / 1.24 → 1.16 / 1.21 | 0.21 / 0.24 → 0.21 / 0.24 | 0.13 / 0.87 → 0.13 / 0.65 | 0.86 / 0.89 → 0.86 / 0.89 |
| DESCENT | 7.62 / 8.43 → 6.54 / 6.92 | 0.29 / 0.36 → 0.30 / 0.34 | 1.20 / 1.26 → 1.19 / 1.33 | 0.17 / 0.20 → 0.18 / 0.20 | 0.11 / 0.39 → 0.12 / 0.80 | 0.86 / 0.89 → 0.87 / 0.98 |
| ORBIT | 8.46 / 9.16 → 6.47 / 6.83 | Inactive | Inactive | 0.41 / 0.55 → 0.38 / 0.48 | 0.12 / 0.75 → 0.12 / 0.52 | 0.93 / 0.99 → 0.84 / 0.94 |

The reduction concentrates in Scene Colour. ELSEWHERE's Scene Colour P50 falls 22.2%. The later passes retain the same shaders and draw sequence. Their observed timing variation includes driver scheduling and hardware contention.

### Allocation and startup

ELSEWHERE's fixed 1080p scene holds at 71 draw calls, 27 geometries, 18 textures and 14 programs. The corresponding DAYBREAK counts are 85 / 48 / 14 / 15, DESCENT 40 / 23 / 7 / 10 and ORBIT 134 / 28 / 7 / 12, all identical within each pair. DOF volumes use five targets at 1920×1080 with 4 samples for Scene Colour, 1920×1080 single-sample DOF, 960×540 single-sample Depth and two 480×270 single-sample Bloom targets. ORBIT uses Scene Colour and the two Bloom targets. Its unused DOF and Depth descriptors remain at their initial 2×2 size.

On ELSEWHERE 1080p, the call counts are 22 shader compiles and 11 links during preparation, then 12 compiles and six links in the first draw, on each build. The steady trace includes zero compile or link calls. Individual trace phases spend at most 0.1 ms in the compile calls and 0.3 ms in the link calls on the CPU. The first draw takes 70.4–92.0 ms reference and 73.2–88.2 ms candidate. This includes streaming and driver setup. The overlapping ranges do not establish a startup or compile-time improvement.

## Visual equivalence

All 42 PNG pairs have identical SHA-256 digests. There are four 1080p High pairs of the timing fixtures and 38 additional 540p High pairs. All 32 captures with corresponding archived inputs also match the F4-P0 or F4-P1-A images. The test repeats the same camera, quality, seed, difficulty, route, station, music beat and lighting for each pair. It covers the ELSEWHERE opening, ordinary and dense gates, scenic fixtures, Boost S-Curve, Challenge, Encore and Afterglow. It includes DAYBREAK Skyglass, Cloud Sea, cirrus and SUNBURST, DESCENT Transfer, THE WELL, CORE and LOCKDOWN, and all seven ORBIT scene anchors through APHELION.

Visual review covered the gate apertures and layered glass, fixture lighting, focal falloff and bloom in the S-Curve, DAYBREAK's exterior and the ORBIT celestial composition. Existing visual tolerances, tunnel geometry fingerprints and authored and spatial fingerprints were kept.

## Running game and resource lifecycle

The 720p Auto ELSEWHERE Showcase runs for 210.8 seconds with the original audio-led clock, at Impossible cruise on Main with seed 0. A trusted start and one pause/resume lead to a normal result, with 184 Main and 10 Encore gates passed, zero hits and zero score. The scheduler records zero late callbacks, missed steps or silent fallbacks. Its CPU P95 is 0.40 ms over 8,402 calls. The run bus stops at results and the AudioContext closes at disposal.

The live trace has 2,106 valid whole-frame GPU queries, zero disjoints and zero unready queries. It measures GPU P50/P95/P99 of 2.53/3.17/3.48 ms and RAF P95/P99 of 4.30/4.30 ms. The longest frame interval is 29.20 ms and there are zero intervals over 33.34 ms. The two historical F4-P1-A flights of the reference build had GPU P50 of 2.99–3.09 ms and P95 of 3.77–3.94 ms. These flights were collected in different sessions. The paired fixed matrix is the controlled comparison.

The tunnel still builds 37 chunks across 37 draws, with 185 meshes and exactly 29,190,720 bytes of attributes and indices. Minimum build lookahead remains 622.03 units. Chunk median/P95/max are 2.70/6.20/6.80 ms versus the F4-P1-A reference flights' 3.30–3.70/8.10–8.50/8.60–8.90 ms. The longest interval following a build is 29.20 ms, compared with 20.80 ms in those flights. The CPU builder is unchanged. These samples verify the chunk counts, payload and visible coverage without attributing CPU timing differences to the resolve change. Flight resources remain at 31–72 draws, 18–38 geometries, 18–21 textures and 14 programs, the same ranges as the reference flights.

The cross-volume lifecycle test completes 12 switches in three cycles, exercises Low, Auto and High on each switch, and resizes from 960×540 to 1280×720 before simulated context loss and restore in each volume during the middle cycle. The restored canvas has the requested dimensions. After disposal there is no canvas, live context, RAF, scheduler or run bus. Input and runtime listeners were released. No WebGL errors occurred. Repeated prewarming releases all 204 traced shader handles. Four mixed-gate returns hold at 23 geometries, 20 textures and 10 programs.

Menu samples span 18–34 geometries, 7–20 textures and 10–15 programs. The per-volume counts return to their original levels after the third cycle. Post-GC backing storage is 10,053,679 → 10,053,992 → 10,054,091 bytes across those cycles, and JS heap is 10.9 → 11.7 → 12.0 MiB. These short samples show bounded renderer resources. A small heap and DOM rise also occurred in F4-P1-A and requires longer sampling for heap attribution.

## Verification and limits

- Both three-repeat GPU attribution sweeps, all 13 paired and lifecycle stability cases, and the full audio-led ELSEWHERE Showcase passed on installed Chrome.
- Eight focused browser cases passed. These cover performance and resource budgets, AURORA's first-visible draw with warm shader programs, and APHELION's optical and preview recovery checks.
- `npm test` passed with 361 unit tests, the production and harness builds, and 218 browser cases. These include tunnel geometry and spatial fingerprints, seeded route and Impossible Boost play, the high-DPR DROP image, White Escape, recovery, records and audio.
- `npm run typecheck` and `npm run test:release` passed, including the production build and all six static-site smoke tests.

Timing gains apply to the tested D3D11 adapter using explicit multisample resolves. GPU timing is hardware-specific, and this round does not measure other drivers, browsers or physical mobile devices. The lower-resolution tails and startup ranges have limited statistical resolution. No change to the tunnel builder or any quality setting is needed for the measured benefit.

Keep the colour-only resolve. The measured gain comes from skipping GPU depth-copy work while retaining multisample occlusion and colour resolution. The remaining probes stay in the benchmark for attribution.

## Reproduction

Build the unmodified `221f440` production app in a separate checkout. Copy the current `tests/harness/stability.ts` into that checkout before building its harness so both use the same attribution probes. Preserve its built `client` and `harness` directories together under the ignored `playwright-report/` directory. Build the current production app before building its harness. The stability server uses the reference only when `STABILITY_REFERENCE_DIR` is set.

```powershell
$env:STABILITY_CHROMIUM_CHANNEL = 'chrome'
$env:STABILITY_REFERENCE_DIR = (Resolve-Path 'playwright-report/f4-p1-b-reference').Path
npm run build
npm run build:harness
npx playwright test --config playwright.stability.config.ts --grep '@p1b|repeats cross-volume|@outro-perf|@impossible-perf|repeated volume prewarming|switching away from mixed gates' --output=playwright-report/f4-p1-b-paired-artifacts
Remove-Item Env:STABILITY_REFERENCE_DIR
npx playwright test --config playwright.stability.config.ts --grep 'audio-led complete Showcase.*elsewhere' --output=playwright-report/f4-p1-b-live-artifacts
$env:A0_BROWSER_CHANNEL = 'chrome'
npx playwright test --config playwright.b0.config.ts tests/browser/perf.spec.ts tests/browser/orbit-aurora.spec.ts tests/browser/orbit-aphelion.spec.ts
$env:RELEASE_CHROMIUM_CHANNEL = 'chrome'
npm run test:release
npm test
```

Run sequentially on the same adapter and browser. The `STABILITY` rows include scene inputs, samples, timer status, disjoint count, blit masks and captured PNG digests. On a device without GPU timer queries, the harness reports `GPU_TIMING_UNAVAILABLE`. Keep raw captures and logs outside the tracked tree under `playwright-report/`.
