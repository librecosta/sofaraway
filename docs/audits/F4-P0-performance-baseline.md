# F4-P0 Four-Volume Performance Baseline

## Executive summary

This is the optimization baseline for production revision `961e60d`. The benchmark uses the production scene, material, simulation, and soundtrack code through the existing browser stability harness. Browser startup is measured separately against the uninstrumented static build.

- In the selected 1080p High scenes, GPU P50 is 8.14–10.26 ms, versus 1.67–2.13 ms at 540p High. The scene-colour pass explains most of the measured increase. Shared offscreen passes account for an additional portion. The strongest one-off CPU costs are DESCENT facility streaming and ORBIT initialization.
- Four audio-led Showcase runs finished at 720p Auto with every Main gate passed, zero recorded hits and zero score. The largest continuous RAF gap was 45.8 ms in DESCENT. The audio scheduler recorded zero late callbacks, missed steps and silent fallbacks across the four runs.
- Desktop Auto and High use the same profile at 540p on this device. Low reduces median GPU time across the four focus scenes. Touch Auto rendered at effective DPR 1.25, with 1.10–1.36 ms GPU P50 and 4.3 ms RAF P95 on the desktop adapter.

## Test environment and reproduction

- Windows 10 Home build 19045, AMD Ryzen 7 5800H (8 cores, 16 threads), approximately 32 GiB system RAM, Node 24.22.1.
- Installed Chrome 158.0.8127.37, headless, one Playwright worker. The measured adapter is the integrated AMD Radeon Graphics (device 1638, Windows driver 31.0.21921.1000), through ANGLE D3D11 and WebGL 2. The installed RTX 3070 Laptop GPU was outside this measurement.
- Desktop at 960×540, 1280×720, and 1920×1080 at device DPR 1. Mobile emulation is 390×844, device DPR 2, touch and coarse pointer, on the same desktop GPU. The fixed samples record actual render dimensions, DPR, samples and DOF selection. Both High and desktop Auto choose the high profile on this device.
- Fixed frames use Standard spatial rules, Impossible difficulty and run seed 0. ORBIT uses its authored world seed 77345 independently of that route seed. The default is the centered course, with Dynamic Lights and PostFX on. The Challenge fixtures use their seed-selected side. ELSEWHERE S-Curve uses sustained Boost to match its existing scenic preset. The Encore inspector keeps its first-gate station fixed and advances music by one 60 Hz step per submitted frame from the listed starting beat.
- Fixed frame intervals are the median of two measurements per scene and three per profile or controlled toggle. Each repeat discards 24 warm-up frames, then measures 120 or 192 frames. Reported P95 ranges are between repeats. The scene tables report the simulated station at capture, which can differ from the preset's reference station by up to a simulation step. The test logs retain the exact numbers.
- The cold navigation uses a new browser context. The warm navigation reuses its HTTP cache in the same context. Both use a static loopback server. The start-enabled timestamp and runtime initialization measure app readiness after graphics setup and its initial submission. Physical display presentation and internet latency require a separate measurement.
- Live samples run the production Runtime and AudioTransport using a trusted Start click, production Showcase pilot, seed 0, Main, Impossible Cruise, 1280×720 Auto and Dynamic Lights on. A pause/resume is exercised before the soak. The sample runs at actual music speed through Results and checks real gates, score, and disposal.

Run PowerShell from the repository root. Keep other GPU and CPU workloads idle while recording. Use the same physical GPU, driver, Chrome revision and input matrix for P1–P4 comparisons.

```powershell
npm run typecheck
npm run build
npm run build:harness
$env:STABILITY_CHROMIUM_CHANNEL = 'chrome'
$env:RELEASE_CHROMIUM_CHANNEL = 'chrome'
npx playwright test --config playwright.stability.config.ts --grep '@f4-p0' --reporter=line --output=playwright-report/f4-p0-artifacts *> playwright-report/f4-p0-primary.log
$env:A0_BROWSER_CHANNEL = 'chrome'
npx playwright test --config playwright.b0.config.ts tests/browser/perf.spec.ts tests/browser/orbit-aurora.spec.ts tests/browser/orbit-aphelion.spec.ts --reporter=list
npm test
npm run test:release
```

The `STABILITY` lines contain JSON records. Keep raw logs and screenshots under the ignored `playwright-report/` directory. Use a separate worktree for a prior build as described in [verification](../verification.md). Historical F4-A samples used different profiles and inputs and serve as context. [F4-A audit](F4-A-cross-volume-architecture-audit.md)

For the optional ORBIT V8 attribution, build the harness with source maps (`npm run build:harness -- --sourcemap`) and start a Chrome DevTools CPU profile on the idle harness page before calling `window.stability.mount('orbit', 'auto', true)` at 1280×720. Stop after mount resolves. Dispose and repeat the mount in the same document to separate first-use CPU work from work repeated on a warm mount. Collect this profile independently of the timing matrix.

## Comparable performance matrix

Fixed focus fixtures are ELSEWHERE S-Curve, DAYBREAK SUNBURST, DESCENT THE WELL and ORBIT AURORA. Times are in milliseconds. `390-touch-auto` emulates touch at device DPR 2.

| Volume | Profile | Output / effective DPR | RAF P50 / P95 / P99 | P95 across trials | GPU P50 / P95 | >33 / >50 ms |
| --- | --- | --- | --- | --- | --- | --- |
| ELSEWHERE | 540-low | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.2–4.3 | 1.42 / 2.73 | 0 / 0 |
| ELSEWHERE | 540-auto | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.3–4.3 | 2.14 / 2.30 | 0 / 0 |
| ELSEWHERE | 540-high | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.2–4.3 | 2.13 / 2.31 | 0 / 0 |
| ELSEWHERE | 720-auto | 1280×720 / 1 | 4.2 / 8.3 / 8.4 | 8.3–8.3 | 3.83 / 3.94 | 0 / 0 |
| ELSEWHERE | 1080-high | 1920×1080 / 1 | 12.5 / 12.6 / 16.6 | 12.6–16.6 | 10.26 / 10.62 | 0 / 0 |
| ELSEWHERE | 390-touch-auto | 487×1055 / 1.25 | 4.2 / 4.3 / 4.3 | 4.2–4.3 | 1.25 / 2.13 | 0 / 0 |
| DAYBREAK | 540-low | 960×540 / 1 | 4.2 / 4.2 / 4.3 | 4.2–4.3 | 0.91 / 2.44 | 0 / 0 |
| DAYBREAK | 540-auto | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.2–4.3 | 1.71 / 2.54 | 0 / 0 |
| DAYBREAK | 540-high | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.2–4.3 | 1.67 / 1.81 | 0 / 0 |
| DAYBREAK | 720-auto | 1280×720 / 1 | 4.2 / 4.3 / 8.3 | 4.3–4.3 | 3.45 / 3.63 | 0 / 0 |
| DAYBREAK | 1080-high | 1920×1080 / 1 | 8.4 / 12.6 / 12.6 | 12.6–12.6 | 8.14 / 8.44 | 0 / 0 |
| DAYBREAK | 390-touch-auto | 487×1055 / 1.25 | 4.2 / 4.3 / 4.3 | 4.2–4.3 | 1.10 / 1.89 | 0 / 0 |
| DESCENT | 540-low | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.3–4.3 | 1.21 / 1.92 | 0 / 0 |
| DESCENT | 540-auto | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.3–4.3 | 2.26 / 2.54 | 0 / 0 |
| DESCENT | 540-high | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.3–4.3 | 2.08 / 2.60 | 0 / 0 |
| DESCENT | 720-auto | 1280×720 / 1 | 4.2 / 8.3 / 8.4 | 4.3–8.3 | 3.61 / 3.85 | 0 / 0 |
| DESCENT | 1080-high | 1920×1080 / 1 | 12.5 / 12.6 / 16.6 | 12.6–16.7 | 10.24 / 10.28 | 0 / 0 |
| DESCENT | 390-touch-auto | 487×1055 / 1.25 | 4.2 / 4.3 / 4.3 | 4.2–4.3 | 1.36 / 2.30 | 0 / 0 |
| ORBIT | 540-low | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.3–4.3 | 1.18 / 2.09 | 0 / 0 |
| ORBIT | 540-auto | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.2–4.3 | 1.79 / 2.82 | 0 / 0 |
| ORBIT | 540-high | 960×540 / 1 | 4.2 / 4.3 / 4.3 | 4.2–4.3 | 1.89 / 2.05 | 0 / 0 |
| ORBIT | 720-auto | 1280×720 / 1 | 4.2 / 4.3 / 8.3 | 4.3–4.3 | 3.54 / 3.69 | 0 / 0 |
| ORBIT | 1080-high | 1920×1080 / 1 | 12.5 / 12.6 / 12.6 | 12.6–12.6 | 9.79 / 10.00 | 0 / 0 |
| ORBIT | 390-touch-auto | 487×1055 / 1.25 | 4.2 / 4.3 / 4.3 | 4.2–4.3 | 1.27 / 2.23 | 0 / 0 |

### Full audio-led Showcase

Times are in milliseconds except sampled duration. CPU columns are Simulation.step, scene update, Three submission and Graphics.draw P95. ORBIT has additional scene update work inside Graphics.draw.

| Volume | Seconds | RAF samples | RAF P50 / P95 / P99 / max | >33 / >50 / long tasks | GPU P50 / P95 / P99 | CPU P95 step / update / submit / draw |
| --- | --- | --- | --- | --- | --- | --- |
| ELSEWHERE | 210.8 | 50360 | 4.2 / 4.3 / 4.3 / 25.0 | 0 / 0 / 0 | 3.00 / 3.69 / 4.16 | 0.1 / 0.1 / 0.6 / 0.8 |
| DAYBREAK | 145.4 | 34372 | 4.2 / 4.3 / 8.3 / 16.7 | 0 / 0 / 0 | 3.17 / 4.14 / 4.58 | 0.1 / 0.2 / 0.9 / 1.1 |
| DESCENT | 171.1 | 40604 | 4.2 / 4.3 / 8.1 / 45.8 | 2 / 0 / 0 | 2.97 / 3.74 / 4.02 | 0.1 / 0.2 / 0.6 / 0.8 |
| ORBIT | 184.1 | 42158 | 4.2 / 4.3 / 8.4 / 16.7 | 0 / 0 / 0 | 2.99 / 4.49 / 4.87 | 0.1 / 0.1 / 1.8 / 2.4 |

## Four-volume scene benchmarks

High at 960×540, PostFX and Dynamic Lights on. Calls include post passes. Geometry, texture and program counts are live Three renderer counts. Encore fixtures use production spatial plans, so their beat can be earlier than the corresponding world position suggests.

| Volume | Scene | Beat / station | RAF P95 / P99 / max | GPU P50 / P95 | Calls / geometry / textures / programs |
| --- | --- | --- | --- | --- | --- |
| ELSEWHERE | open | 5.00 / 4256.58 | 4.2 / 4.3 / 4.4 | 1.84 / 2.51 | 53 / 19 / 18 / 14 |
| ELSEWHERE | ordinary | 112.00 / 5581.01 | 4.3 / 4.3 / 4.3 | 1.86 / 1.94 | 57 / 20 / 18 / 14 |
| ELSEWHERE | scenic-lighting | 393.00 / 9970.18 | 4.3 / 4.3 / 4.3 | 1.99 / 2.52 | 60 / 22 / 18 / 14 |
| ELSEWHERE | s-curve | 228.00 / 7340.59 | 4.3 / 4.3 / 4.3 | 2.13 / 2.31 | 71 / 27 / 18 / 14 |
| ELSEWHERE | dense | 256.00 / 7786.44 | 4.3 / 4.3 / 4.3 | 1.87 / 2.03 | 58 / 22 / 18 / 14 |
| ELSEWHERE | challenge | 336.38 / 9067.49 | 4.3 / 4.3 / 4.3 | 1.75 / 2.17 | 47 / 19 / 18 / 14 |
| ELSEWHERE | encore | 436.00 / 10946.82 | 4.3 / 4.3 / 4.3 | 1.81 / 1.95 | 51 / 18 / 18 / 14 |
| DAYBREAK | open | 12.00 / 4365.60 | 4.2 / 4.3 / 4.3 | 1.63 / 1.65 | 67 / 38 / 11 / 15 |
| DAYBREAK | ordinary | 48.00 / 4889.27 | 4.3 / 4.3 / 4.4 | 1.67 / 1.90 | 65 / 36 / 11 / 15 |
| DAYBREAK | cirrus | 104.00 / 5850.36 | 4.3 / 4.3 / 4.4 | 1.81 / 2.20 | 71 / 40 / 11 / 15 |
| DAYBREAK | sunburst | 192.00 / 7564.97 | 4.3 / 4.3 / 4.3 | 1.67 / 1.81 | 85 / 48 / 14 / 15 |
| DAYBREAK | return | 248.00 / 8659.77 | 4.2 / 4.3 / 4.3 | 1.80 / 1.98 | 61 / 36 / 11 / 15 |
| DAYBREAK | challenge | 244.00 / 8581.65 | 4.3 / 4.3 / 4.3 | 1.74 / 1.83 | 56 / 32 / 11 / 15 |
| DAYBREAK | encore | 198.29 / 9431.77 | 4.2 / 4.3 / 4.3 | 1.71 / 1.82 | 65 / 37 / 11 / 15 |
| DESCENT | open | 16.00 / 4396.63 | 4.3 / 4.3 / 4.3 | 1.80 / 2.29 | 41 / 22 / 7 / 10 |
| DESCENT | ordinary | 70.00 / 5131.19 | 4.3 / 4.3 / 4.3 | 1.79 / 2.12 | 44 / 25 / 7 / 10 |
| DESCENT | transfer | 151.00 / 6474.55 | 4.3 / 4.3 / 4.3 | 1.70 / 1.75 | 29 / 16 / 7 / 10 |
| DESCENT | well | 201.00 / 7336.70 | 4.3 / 4.3 / 4.3 | 2.08 / 2.60 | 40 / 23 / 7 / 10 |
| DESCENT | core | 278.00 / 8664.80 | 4.3 / 4.3 / 4.3 | 1.67 / 2.48 | 43 / 26 / 7 / 10 |
| DESCENT | lockdown | 314.00 / 9285.84 | 4.3 / 4.3 / 4.6 | 1.82 / 2.23 | 47 / 26 / 7 / 10 |
| DESCENT | breach | 366.00 / 10183.18 | 4.3 / 4.3 / 4.8 | 1.45 / 1.87 | 30 / 16 / 7 / 10 |
| DESCENT | challenge | 153.00 / 6508.51 | 4.2 / 4.3 / 4.3 | 1.62 / 3.05 | 38 / 22 / 7 / 10 |
| DESCENT | encore | 264.45 / 10483.19 | 4.3 / 4.3 / 4.4 | 1.36 / 1.79 | 26 / 14 / 7 / 10 |
| ORBIT | open | 8.00 / 4303.50 | 4.3 / 4.3 / 4.3 | 1.48 / 1.66 | 90 / 25 / 7 / 13 |
| ORBIT | ordinary | 42.00 / 4752.80 | 4.3 / 4.3 / 4.3 | 1.67 / 1.78 | 116 / 28 / 7 / 13 |
| ORBIT | ringbreak | 140.00 / 6214.01 | 4.3 / 4.3 / 4.3 | 1.34 / 1.98 | 190 / 23 / 7 / 13 |
| ORBIT | maelstrom | 190.00 / 7044.48 | 4.3 / 4.3 / 4.3 | 2.13 / 2.58 | 231 / 27 / 7 / 13 |
| ORBIT | eclipse | 237.00 / 7896.29 | 4.2 / 4.3 / 4.3 | 1.22 / 1.52 | 55 / 24 / 7 / 16 |
| ORBIT | aurora | 279.00 / 8665.91 | 4.3 / 4.3 / 4.3 | 1.89 / 2.05 | 118 / 28 / 7 / 12 |
| ORBIT | aphelion | 346.00 / 9894.30 | 4.3 / 4.3 / 4.3 | 1.51 / 1.93 | 83 / 23 / 7 / 13 |
| ORBIT | challenge | 138.00 / 6182.35 | 4.2 / 4.3 / 4.3 | 1.44 / 2.07 | 200 / 25 / 7 / 13 |
| ORBIT | encore | 264.47 / 10580.28 | 4.2 / 4.3 / 4.3 | 1.70 / 1.93 | 82 / 20 / 7 / 13 |

## CPU and GPU attribution

- RAF intervals include scheduling and compositor backpressure. A repeating 4.2 ms interval on this host is browser cadence. It does not quantify how much of that interval the application used. The raw logs include P50, P95, P99, maximum, and counts above 33.34 and 50 ms.
- CPU scopes overlap. `simulationStep` times the production method. `simulation` includes fixed-step consumption and its Runtime callbacks. `graphicsUpdate` measures the volume scene update. ORBIT's astral update and warming also run inside `graphicsDraw`, which includes renderer submission. `renderer` sums CPU time spent in Three render calls per draw. None of those figures represents GPU execution.
- The harness rotates WebGL timer queries across whole draws and individual passes. Pass medians have separate sample populations and should not be added. Long Tasks measure the main thread and need not coincide with long RAF intervals. `GPU_TIMING_UNAVAILABLE` applies when the extension cannot yield a valid frame sample. Disjoint and undrained samples are counted in the raw log.
- Shader submission counters cover JavaScript calls to `compileShader` and `linkProgram`. `shaderPrepare` also includes Three's preparation and uniform checks. Buffer, texture and renderbuffer counters measure calls after renderer instrumentation, including uploads or reallocations. Neither call timing nor Three's object counts disclose driver allocation bytes or isolated shader compilation latency.
- Main-scene timer queries include gate draws, volume meshes and material work. Resolution and PostFX toggles isolate broad cost classes. The current benchmark does not instrument coverage, opaque/transparent pass separation or individual shaders.

All 152 primary fixed trials returned valid GPU frame queries, with zero disjoint or undrained queries. A 192-frame trial yields eight whole-frame GPU queries. P95 at that sample count is a tail observation. The complete flights provide 1,432–2,098 whole-frame GPU samples each.

| Volume | High profile | Colour / depth / DOF / bloom / composite GPU P50 | Update / submit / draw CPU P95 |
| --- | --- | --- | --- |
| ELSEWHERE | 540p | 1.56 / 0.07 / 0.20 / 0.13 / 0.19 | 0.2 / 0.7 / 0.9 |
| ELSEWHERE | 1080p | 7.11 / 0.18 / 1.58 / 0.33 / 0.96 | 0.2 / 0.8 / 1.1 |
| DAYBREAK | 540p | 1.09 / 0.06 / 0.21 / 0.13 / 0.19 | 0.2 / 0.8 / 1.0 |
| DAYBREAK | 1080p | 5.49 / 0.13 / 1.22 / 0.34 / 0.91 | 0.2 / 1.2 / 1.5 |
| DESCENT | 540p | 1.58 / 0.08 / 0.19 / 0.11 / 0.17 | 0.2 / 0.7 / 1.0 |
| DESCENT | 1080p | 7.57 / 0.28 / 1.21 / 0.30 / 0.89 | 0.2 / 0.6 / 0.8 |
| ORBIT | 540p | 1.56 / — / — / 0.16 / 0.18 | 0.1 / 0.7 / 1.1 |
| ORBIT | 1080p | 8.29 / — / — / 0.50 / 0.91 | 0.1 / 0.8 / 1.2 |

All times are milliseconds. ORBIT skips the depth and DOF passes. At 540p High, the matched PostFX-on → direct-output GPU P50 pairs are 2.13 → 1.04 (ELSEWHERE), 1.67 → 0.63 (DAYBREAK), 2.08 → 0.94 (DESCENT), and 1.89 → 1.07 (ORBIT). Turning Dynamic Lights off changes the corresponding medians by 0.04 ms or less across those fixed views.

DAYBREAK's separate SUNBURST camera test holds CSS dimensions at 960×540 and changes device DPR from 1 to 2. The High profile caps the second render at 1536×864 (effective DPR 1.6). Both views submit 88 calls. Look Up changes overall GPU P50 from 1.76 to 5.34 ms and scene colour from 0.95 to 3.61 ms. Cloud Sea changes overall GPU P50 from 1.47 to 4.49 ms and scene colour from 0.72 to 2.81 ms. RAF P95 moves from 4.3 to 8.4 ms in both views. The camera changes which surfaces cover pixels, so the difference between the views does not isolate an individual shader.

## Cold and warm startup

Three static cold/warm pairs per volume at High 960×540. Times are milliseconds. Start-ready is measured from navigation inside the page. CPU TaskDuration comes from Chrome CDP.

| Volume | Cold ready median (range) | Warm ready median (range) | Runtime initialize cold / warm | CDP TaskDuration cold / warm |
| --- | --- | --- | --- | --- |
| ELSEWHERE | 412.9 (407.4–563.7) | 276.4 (263.4–278.9) | 213.0 / 192.2 | 437.0 / 300.7 |
| DAYBREAK | 428.4 (418.0–438.1) | 278.2 (277.3–282.7) | 218.1 / 194.3 | 482.6 / 319.1 |
| DESCENT | 362.2 (354.2–363.9) | 220.9 (215.2–232.6) | 157.5 / 136.5 | 418.3 / 258.4 |
| ORBIT | 1055.6 (1033.2–1207.0) | 890.4 (890.0–948.3) | 846.8 / 803.4 | 1124.2 / 940.6 |

All cold navigations transfer 1,391,090 bytes of JavaScript including response headers. Warm navigations transfer zero JS bytes and reuse the same 1,380,290 bytes of JS payload. This is a loopback cache result. Runtime graphics work remains visible in the warm numbers.

The fixed focus fixture exposes the initialization phases separately. It creates a new Graphics instance after earlier trials in the same page warmed the module caches. First draw includes the harness’s existing GPU completion barrier. Counts are WebGL API calls, including allocations or uploads, and are ordered as preparation → first draw. The table's texture column covers 2D calls.

| Volume | Create / scene load / prepare / first draw / run setup | Shader compile / link calls | Texture / buffer / renderbuffer calls |
| --- | --- | --- | --- |
| ELSEWHERE | 12.1 / 48.9 / 31.0 / 27.3 / 1.1 | 22 / 11 → 12 / 6 | 71 / 4 / 4 → 2 / 102 / 0 |
| DAYBREAK | 11.4 / 36.2 / 8.4 / 62.9 / 1.0 | 18 / 9 → 18 / 9 | 49 / 4 / 4 → 16 / 170 / 0 |
| DESCENT | 10.6 / 10.7 / 4.1 / 66.7 / 1.2 | 10 / 5 → 16 / 8 | 49 / 4 / 4 → 2 / 106 / 0 |
| ORBIT | 10.2 / 51.2 / 30.1 / 28.5 / 1.2 | 16 / 8 → 8 / 4 | 8 / 12 / 7 → 2 / 324 / 0 |

### ORBIT first-visible protection

At 960×540, Aurora's cold and warm entries both draw all six gas slices on first visibility with zero new programs and zero field builds on that frame. The High and Auto variants prebuild the field during preparation. Low direct builds it at station 4937.29 before first visibility at 5279.11. These are individual first-visible frame samples from the existing entry harness.

| AURORA case | First visible CPU draw cold / warm (ms) | First visible GPU cold / warm (ms) |
| --- | --- | --- |
| High, Impossible Boost, PostFX | 3.00 / 2.00 | 2.71 / 2.53 |
| Auto, Normal cruise, PostFX | 1.10 / 1.00 | 2.34 / 2.38 |
| Low, Sightseeing Boost, direct | 1.10 / 1.20 | 0.94 / 1.27 |

APHELION preserves the identity of its sphere and the four prepared celestial programs across first visibility in Low, Auto and High. Its first-visible CPU draw in the probe ranges from 9.6 to 11.1 ms. Total renderer programs increase by one at visibility in each tier even though all four celestial programs are already prepared. The probe does not isolate the extra program. The same production tests verify the companion, rings, depth semantics, and resource release. [AURORA entry test](../../tests/browser/orbit-aurora.spec.ts) · [APHELION test](../../tests/browser/orbit-aphelion.spec.ts)

## Resource lifecycle

At 540p High, the measured main colour target is RGBA16F with 4× MSAA. ELSEWHERE, DAYBREAK and DESCENT declare five targets with dimensions 960×540, 960×540, 480×270, 240×135 and 240×135. ORBIT's unused DOF/depth slots stay at 2×2. These are logical target counts. They do not include separate MSAA backing buffers or quantify GPU memory.

The audio-led flights were sampled every 12 seconds. These ranges include normal changes in streamed geometry, gate visibility and materials.

| Volume | Draw calls | Geometries | Textures | Programs | JS heap range (MiB) |
| --- | --- | --- | --- | --- | --- |
| ELSEWHERE | 31–72 | 18–38 | 18–21 | 14 | 9.7–31.5 |
| DAYBREAK | 55–78 | 34–108 | 11–14 | 15–16 | 14.8–26.7 |
| DESCENT | 21–49 | 22–46 | 7 | 10–12 | 11.7–32.4 |
| ORBIT | 60–234 | 23–46 | 7 | 13–17 | 15.0–52.5 |

The live test waits for the last audio bus to finish, disposes the runtime and verifies the AudioContext is closed, the scheduler is removed, RAF is canceled and the input/Runtime listener groups are aborted.

Live shader compile/link call counts are 2/1, 2/1, 4/2 and 10/5 in volume order. ORBIT submits 58,648 buffer operations during flight versus 734–885 for the corridor volumes. This combines allocation and subrange updates. Its measured main-thread time in those calls is 191.6 ms over the whole song, so the count alone supplies little evidence for a CPU fix. GPU upload bandwidth was outside the scope of these GL API timings.

The repeated lifecycle test performs 12 switches in one document at 960×540 with menu rendering, three quality tiers, starts and returns to menu. The middle round loses and restores the WebGL context during flight in all four volumes. Switch time ends at the first RAF that confirms the selected volume has been loaded and drawn. The first ELSEWHERE return follows an earlier ELSEWHERE mount in the same document.

| Volume | First switch (ms) | Two revisits (ms) | High menu geometries / textures / programs |
| --- | ---: | --- | --- |
| ELSEWHERE | 130.3 | 131.6 / 120.1 | 18 / 18–20 / 14 |
| DAYBREAK | 631.5 | 79.7 / 98.8 | 34 / 11–12 / 15 |
| DESCENT | 285.7 | 83.3 / 63.0 | 21 / 7–9 / 10 |
| ORBIT | 1,313.0 | 193.3 / 158.2 | 23 / 7–10 / 13 |

There is one game canvas through the switches and zero after disposal. The final context is lost and the final RAF, run bus and listener groups are released. Programs and geometries match on subsequent menus. After forced JS GC, heap is 10.9 → 11.7 → 11.8 MiB, with one document and 49 JS listeners per cycle. CDP DOM nodes rise from 32 to 36. The sample establishes bounded renderer counters across the tested cycles. A longer retention test or detached-node inspection is needed to characterize the small DOM trend.

## Audio scheduling

The test times the existing AudioTransport timer callback after its handle is registered. It also reads the transport diagnostics, checks that pause removes the scheduler, resumes at the current run offset, and waits for the ending bus to finish. Click-to-playing includes Playwright input dispatch and audio activation. Callback timings measure work on the browser main thread.

| Volume | Start to Playing (ms) | Scheduler calls | Callback P95 / P99 / max (ms) | Late / missed / fallback | Main / Encore passed |
| --- | ---: | ---: | --- | --- | --- |
| ELSEWHERE | 121.8 | 8,402 | 0.30 / 0.50 / 1.50 | 0 / 0 / 0 | 184 / 10 |
| DAYBREAK | 116.4 | 5,762 | 0.40 / 1.50 / 2.40 | 0 / 0 / 0 | 147 / 0 |
| DESCENT | 88.8 | 6,777 | 0.40 / 0.50 / 1.80 | 0 / 0 / 0 | 189 / 0 |
| ORBIT | 102.5 | 7,203 | 0.30 / 0.50 / 0.80 | 0 / 0 / 0 | 135 / 0 |

Every flight reports one resume and ends at `ESCAPED`. Zero Encore here means the flight reached the original ending without passing a separate Encore gate at its authored Cruise station. The fixed Encore views inspect the actual planned gates at explicit stations. Audio diagnostics establish scheduling health for these flights. Speaker output latency and behavior under genuinely starved audio scheduling need separate measurements. [AudioTransport](../../app/game/audio/transport.client.ts)

## Confirmed bottlenecks and candidates

**P0-E1 · ELSEWHERE S-Curve · confirmed pixel cost.** At High on the measured Radeon, moving from 960×540 to 1920×1080 takes whole-frame GPU median from 2.13 to 10.26 ms with the same 71 calls. Scene colour rises from 1.56 to 7.11 ms and DOF from 0.20 to 1.58 ms. At 540p, switching to direct output changes GPU median from 2.13 to 1.04 ms. The toggle includes render-target format, sampling and post passes, so its delta cannot be attributed to DOF alone. Compare colour, depth and DOF queries after isolating each offscreen pass in the harness. Any optimization must retain the High colour response, lens focus, gate glass and S-Curve composition. This is a medium-risk change with the largest expected gain at high pixel counts. [PostFX](../../app/game/graphics/post.client.ts) · [Quality](../../app/game/graphics/quality.ts)

**P0-E2 · ELSEWHERE streaming · confirmed CPU burst.** The 720p Auto Showcase records 37 tunnel chunk builds at 9.10 ms P95 and 9.60 ms max, while Simulation.step is 0.10 ms P95. The first focused draw spends 12.00 ms median in chunk construction. These are timed calls to the chunk builder, whose peaks exceed the normal RAF interval on this device. Verify burst spacing and streaming lookahead before attempting to reuse immutable geometry or stage CPU builds earlier. Preserve chunk visibility, branch release and gate ordering. Risk is medium because preparation can trade latency for resident memory. [Tunnel._buildChunk](../../app/game/graphics/tunnel.client.ts) · [Graphics](../../app/game/graphics/scene.client.ts)

**P0-D1 · DAYBREAK SUNBURST · confirmed pixel cost, likely exterior contribution.** At High, 960×540 to 1920×1080 raises the same 85-call frame from 1.67 to 8.14 ms GPU median. Scene colour rises from 1.09 to 5.49 ms, while DOF rises from 0.21 to 1.22 ms. Direct output at 540p costs 0.63 ms. The Daybreak exterior update is 0.10 ms P95 CPU at 1080p. The sky, clouds, cabin glass and other fragments all share the colour pass. Separate queries around the exterior and glass draws are needed before a shader-specific attribution. Preserve the cloud contour, cirrus flow, sun and cabin glass. Profile the renderer integration first to avoid unnecessary cloud or material changes. Risk is medium and expected gains concentrate at high output resolution. [Daybreak exterior](../../app/game/graphics/daybreak-exterior.client.ts) · [Cirrus field](../../app/game/graphics/daybreak-cirrus.ts) · [PostFX](../../app/game/graphics/post.client.ts)

**P0-S1 · DESCENT streamed architecture · confirmed CPU burst.** THE WELL's first 540p High draw spends 31.2 ms median in facility builds. The 720p Auto flight records 28 calls to the builder, with P95 21.2 ms and max 22.9 ms. The flight has two RAF gaps above 33.34 ms, and the hook does not map those gaps to an individual build. Prioritize the architecture accumulation and mesh upload boundary. Capture per-chunk CPU, allocation counts and time-to-visible while crossing the same Transfer and Well stations. Caching or amortizing immutable batches could reduce tail latency. Risk is medium-high for chunk disposal, material ownership, and exact facility or junction layout. [DescentFacility.build](../../app/game/graphics/descent-facility.client.ts) · [Facility architecture](../../app/game/graphics/descent-architecture.ts)

**P0-S2 · DESCENT THE WELL · confirmed pixel cost.** At High, the same 40-call frame goes from 2.08 ms GPU median at 540p to 10.24 ms at 1080p. At 540p, disabling Dynamic Lights changes the median to 2.05 ms. The 1080p scene-colour query is 7.57 ms median. This supports treating fill as an independent issue from architecture builds. Verify surface coverage and shared PostFX cost before changing Control fixtures or laser glass. Any volume-level work must preserve the lighting phrases and glass. Risk is medium with likely gains at higher pixel counts. [Facility lighting](../../app/game/graphics/descent-facility.client.ts) · [PostFX](../../app/game/graphics/post.client.ts)

**P0-O1 · ORBIT AURORA · confirmed scene pixel cost, likely translucent coverage contribution.** At High, whole-frame GPU median is 1.89 ms at 540p and 9.79 ms at 1080p. Scene colour rises from 1.56 to 8.29 ms. The higher resolution also changes projected asteroid LOD and increases calls from 118 to 134. At 540p, Maelstrom makes 231 calls and costs 2.13 ms median. Draw count alone is insufficient to explain high-resolution cost. Split GPU scopes for asteroid batches and nebula surfaces, then compare identical camera, output and rock LOD with a diagnostic layer mask. Preserve density, silhouetted rocks, nebula branches and dark cavity. Changes to screen bounds or fragment rejection are medium-high risk to composition and transparency. [OrbitWorld.update](../../app/game/graphics/orbit-world.client.ts) · [Cosmic shaders](../../app/game/graphics/orbit-cosmic-shaders.ts)

**P0-O2 · ORBIT menu startup · confirmed procedural CPU bake.** Warm HTTP navigation is ready at 890.4 ms median, of which Runtime initialize accounts for 803.4 ms. The independent 720p Auto Showcase mount takes 842.3 ms. Its timed scopes include 717.9 ms in Graphics.load, 39.9 ms in prepare (32.5 ms in astral warmup across preparation and draw), and 49.9 ms in the first draw. A separate source-mapped Chrome V8 profile of a fresh Auto mount samples 678.0 ms of self time in the stone and asteroid volume-generation source. A second mount in that document drops Graphics.load from 798.2 to 73.4 ms while still issuing six 3D texture calls. Three's program `onFirstUse` also accounts for 634.5 ms of sampled time in that colder profiled process and is a separate initialization cost. These instrumented times have different cache conditions from the main matrix. Repeat the same-realm comparison, validate the baked texel bytes and driver first-use gates, and evaluate moving or caching the deterministic CPU bake. Preserve AURORA and APHELION warmup. Risk is high if startup work moves into their visible entry frames. The expected gain is shorter first-entry and volume-switch waits. [Rock surface cache](../../app/game/graphics/orbit-rock-surface.ts) · [Field generators](../../app/game/graphics/orbit-surface-field.ts) · [Graphics.load](../../app/game/graphics/scene.client.ts)

**P0-N1 · shared Simulation and audio · measured low priority.** Simulation.step has 0.10 ms P95 on all four flights. Scheduled audio callbacks have 0.30–0.40 ms P95, with zero misses. ORBIT's rock streaming makes 349 calls at 1.00 ms P95 and 2.20 ms max, while its full astral update has 0.60 ms P95. Changes to gate projection, pilot input, audio scheduling, and rock streaming are lower priority for the sampled cases. A dense high-DPR streaming trace could change the ORBIT order. [Simulation.step](../../app/game/core/simulation.ts) · [AudioTransport.start](../../app/game/audio/transport.client.ts) · [OrbitWorld](../../app/game/graphics/orbit-world.client.ts)

## Visual fidelity baseline

The High, 960×540, DPR 1 fixtures use the same production output path as the baseline matrix. A PNG is recorded after the measurement window from the original canvas in the same render callback. Keep aperture shapes, spatial layouts, cues, motion, and endings as semantic checks when comparing later screenshots. Manual side-by-side review is needed if a deliberate render scheduling change affects visual comparison. The chart, collision, and audio event tests remain the authority for gameplay invariants.

| Volume | Primary visual anchor | PNG SHA-256 prefix | Review target |
| --- | --- | --- | --- |
| ELSEWHERE | S-Curve · 228 / 7340.59 | `c617f5723742` | Gate shape, corridor bend, red fixtures and motion under sustained Boost |
| DAYBREAK | SUNBURST · 192 / 7564.97 | `9958875e6e5f` | Glass, sun and sky colour. Look Up and Cloud Sea give independent cloud coverage views |
| DESCENT | THE WELL · 201 / 7336.70 | `c8101747a379` | Facility silhouettes, CONTROL fixture emphasis and laser-glass opening |
| ORBIT | AURORA · 279 / 8665.91 | `4cf760593f1b` | Nebula structure, dark cavity, texture and rock silhouettes |
| ORBIT | APHELION · 346 / 9894.30 | `bf5b946794d0` | Planet limb, rings, moon and gate composition |

The raw logs identify 36 PNGs by scene and full digest, including route and ending references. PNG hashes identify the baseline files. A driver or renderer change can alter pixels while retaining visual fidelity.

## Recommended P1–P4 actions

| Stage | First change to evaluate | Confirmation and guardrails |
| --- | --- | --- |
| F4-P1 ELSEWHERE | Measure colour and DOF at the shared Graphics/PostFX boundary before changing materials. Separately schedule or reuse immutable tunnel build work at the observed burst points. | Repeat 540p and 1080p S-Curve plus lighting-zone and dense-gate captures. Check chunk build P95/max, target dimensions, High screenshots and live crossing order. |
| F4-P2 DAYBREAK | Isolate exterior colour and glass coverage at the same output size before changing any cloud code. Investigate repeated first-use and texture work if confirmed costly. | Repeat SUNBURST, cirrus, Cloud Sea and the two-DPR comparison. Check silhouette and lighting at the same Beat/Station, then run the full audible flight and ending tests. |
| F4-P3 DESCENT | Profile and amortize facility architecture assembly or buffer uploads. Take the shared pixel improvements from P1 if verified at THE WELL. | Trace Transfer, Well and Lockdown streaming, track geometry lifetime and longest RAF gaps, and keep exact glass, opening, lamps, junction and Encore. |
| F4-P4 ORBIT | Reduce synchronous rock-field baking on initial load while retaining the existing texels. Then isolate high-resolution nebula colour time from rock rendering. | Compare cold and warm switches, texture bytes, and high-resolution colour queries. Hold seed, density and LOD for GPU comparisons. Repeat AURORA first-visible cold/warm and APHELION identity/program checks. |

Implement shared output or render-pass changes once in Graphics/PostFX, then validate all four volumes. Advance the volume-specific items only when the corresponding timing scope improves on the same device and the High references still match their scene and optical contracts.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed on Node 24.22.1. |
| Tagged stability benchmarks | 13 primary cases and the separate DAYBREAK exterior DPR case passed. The cross-volume lifecycle case also passed on repeat. |
| Existing renderer stability regression cases | Both passed. The shader handle test matched 204 creates to 204 deletes, and mixed-gate geometry, texture and program counts matched across four visits. |
| Focused browser performance, AURORA and APHELION | All eight passed against the production and harness static servers. The initial attempt timed out while waiting for the separate dev server. These tests use the static servers. |
| `npm run test:release` | All six static release smoke tests passed in Chrome. |
| `npm test` | All 359 unit tests passed. Both production and harness builds passed. The Chrome suite passed 217 of 218 cases. |

The browser failure is the existing high-DPR ELSEWHERE DROP screenshot digest assertion. Inspection of the 1984×1116 images found five changed pixels within the compared RGB crop, with a maximum channel delta of 4/255. An isolated run on the same build reproduced the mismatch with the two digests reversed. A further static-only run passed, as did both isolated runs against a pristine `961e60d` static build. The relevant scene renderer, scenic preview, Explorer scene and lab style bundles are byte-identical between the builds. The assertion remains unchanged. [Beat inspection test](../../tests/browser/beat-inspection.spec.ts)

## Risks and limitations

- The hardware results describe one Windows laptop adapter and Chrome build. Mobile emulation measures viewport, DPR and touch configuration without a mobile GPU, driver, thermal envelope or native mobile audio stack.
- The fixed phase is deliberately static and aligned. Real flight, route timing, streaming and audio contention are represented by the Showcase samples. Showcase exercises Main in the continuous soak. The fixed Challenge fixtures and the existing route suites cover the alternate geometry and decisions.
- GPU queries do not provide wall-clock display latency or GPU memory residency. Browser JS heap includes transient allocations and CDP visibility stops at the JS heap. Cross-volume GC samples and renderer/API disposal are stronger evidence for resource lifetime than a single heap value.
