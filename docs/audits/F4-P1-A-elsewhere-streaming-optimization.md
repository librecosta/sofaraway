# F4-P1-A ELSEWHERE tunnel streaming optimization

## Scope and attribution

Paired against `b7749a5` on the F4-P0 Windows 10 system, using Node 24.22.1 and Chrome 158.0.8127.37 headless on the integrated AMD Radeon Graphics (1638), ANGLE D3D11 and hardware WebGL2. The focused browser profile warms the existing stability harness once, then samples twelve forward and reverse streaming passes. Each pass builds fifteen real tunnel chunks. This separates geometry creation from measured renderer submission. The run still constructs its material library, so the profile reports those samples separately.

The original builder sampled one path frame per ring and two for each chamfered bay. A 210-unit grid chunk normally has 70 bays with 40 panel quads each. An authored path boundary or a junction cut can add a partial bay. Ribs, rims, strips and braces build their own buffers. Existing streaming uses 430 units ahead and 90 behind, with ring spacing of 3 and chunk length of 210. A forward update extends the front, a reverse update restores missing rear chunks, and a cold seek can cover several intervals in one update. Junction changes replace intersecting intervals around the cut. The Afterglow atlas rebuilds existing intervals that overlap the change. Each removed chunk releases its own mesh geometry. [Tunnel](../../app/game/graphics/tunnel.client.ts)

A source-mapped Chrome CPU profile of the reference sampled 74.8 ms self time in the shared vertex writer, 47.8 ms in shell quad emission, 42.8 ms in shell UV dispatch, 51.8 ms in rib/rim emission and 45.6 ms in brace emission over 180 builds. Three's typed attribute construction and index-width scan also register, while `Path.sample` accounts for about 1 ms of sampled self time. The profile excludes WebGL submission. The paired fixed and live traces cover the update, renderer submission, GL buffer calls, rebuilt intervals, station, lookahead and the following RAF interval.

## Change

The ELSEWHERE panels reuse a fixed octagonal cross-section for the five quads on each face. The template holds each quad's local coordinates, material group and transverse UV. At build time, the generator projects each bay with the same endpoint and chamfer samples and computes longitudinal UVs from actual world station. It writes positions, normals and UVs directly into their final Float32 buffers. Precomputed group counts give each material a contiguous index range, with the original vertex and triangle order. This removes per-quad coordinate and UV arrays, number-array growth, index flattening and the final conversion for the panel buffers. The only reusable new data is the small local cross-section. Buffer storage belongs to its chunk. [Panel generator](../../app/game/graphics/tunnel-panels.ts)

Rib, rim, strip and brace generation retain their existing code. Construction stays synchronous, with the same visibility window, mesh/material ownership, lighting, rebuild triggers and disposal. DAYBREAK keeps the separate canal shell and canopy path. DESCENT takes its facility path and ORBIT supplies its own world.

## Fixed-scene measurements

In the isolated streaming profile, the median of twelve per-pass chunk medians falls from 2.40 to 1.30 ms. The median per-pass P95 falls from 3.40 to 1.90 ms. The largest individual build in the profiled batch falls from 8.50 to 5.70 ms. The profiler adds overhead to both versions. The table below is from the separate rendering benchmark without the V8 profiler.

First-draw chunk time is the sum of two to four builds in that draw. Values are medians in milliseconds. F4-P0's original 540p High S-Curve first draw was 12.0 ms.

| Scene | Samples per build | Chunk time before → after | Full update before → after | Draw calls / geometries / programs |
| --- | ---: | ---: | ---: | ---: |
| 540p High opening | 2 | 19.05 → 20.20 | 20.25 → 21.50 | 53 / 19 / 14 |
| 540p High ordinary | 2 | 8.20 → 7.05 | 8.75 → 7.60 | 57 / 20 / 14 |
| 540p High scenic lighting | 2 | 8.90 → 7.25 | 9.55 → 7.95 | 60 / 22 / 14 |
| 540p High S-Curve, Boost | 3 | 12.80 → 9.60 | 13.40 → 10.40 | 71 / 27 / 14 |
| 540p High dense | 2 | 12.85 → 7.35 | 13.35 → 7.90 | 58 / 22 / 14 |
| 540p High Challenge | 2 | 6.85 → 4.60 | 20.80 → 19.20 | 47 / 19 / 14 |
| 540p High Encore | 2 | 15.05 → 6.80 | 15.45 → 7.10 | 51 / 18 / 14 |
| 1080p High S-Curve, Boost | 3 | 28.20 → 13.10 | 29.40 → 14.20 | 71 / 27 / 14 |

The first case in each 540p High context is the opening. Its raw ranges overlap at 15.9–22.2 ms before and 12.4–28.0 ms after. The 1080p first-draw ranges also overlap at 22.6–30.3 and 9.3–24.5 ms. Treat cold gains as variable. At steady 1080p High on the S-Curve, GPU P50 is 9.81 → 9.98 ms. RAF P95/P99 is 16.7/16.8 → 12.6/16.7 ms in this three-repeat sample. The fixed RAF change varies with GPU and browser cadence and is outside the measured chunk-build scope.

## Complete flight and resources

Four audio-led runs at 1280×720 Auto, seed 0 and Impossible Cruise on Main. Each uses a trusted Start click, one pause/resume and the original Showcase input. Timing values are milliseconds.

| Run | Chunk median / P95 / max | Total chunk CPU | Graphics update P95 / max | RAF P95 / P99 / max | RAF intervals >33.34 ms | Longest interval after a build |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Reference 1 | 4.70 / 9.70 / 10.40 | 203.50 | 0.20 / 23.80 | 4.30 / 8.40 / 25.00 | 0 | 25.00 |
| Candidate 1 | 3.70 / 8.10 / 8.90 | 147.30 | 0.20 / 21.70 | 4.30 / 8.30 / 29.30 | 0 | 20.80 |
| Candidate 2 | 3.30 / 8.50 / 8.60 | 148.60 | 0.20 / 21.40 | 4.30 / 8.30 / 20.80 | 0 | 20.80 |
| Reference 2 | 6.90 / 14.10 / 16.20 | 255.60 | 0.20 / 46.40 | 8.30 / 8.40 / 54.10 | 1 | 54.10 |

Each run builds 37 chunks in 37 draws. Chunk P95 and max improve in both candidate runs compared with both reference runs. Total build time drops 27–42% across the observed runs. Tunnel update P95 is 0.10 ms in all four runs, and its maxima are 10.50/16.20 ms reference versus 9.00/8.60 ms candidate. The longest post-build interval occurs at station 8617.97 in all four runs as the junction appears. The same partial chunk takes 3.30–3.50 ms before and 1.10–1.40 ms after. The larger RAF interval covers the whole draw and browser scheduling. Reference 2 also records one 55 ms Long Task. Reference 1 and both candidates record none. One candidate's longest interval overall occurs on a draw without a build. Whole-flight RAF P95/P99 remains within the measured browser cadence.

Every run records the same 29,190,720 bytes of final attributes and indices across 185 built meshes. The minimum front coverage just after a build is 622.03 units each time. There are 885 GL buffer submissions per run, with 8.1–11.1 ms total CPU in those calls across the four runs. Draw calls remain 31–72, geometries 18–38, textures 18–21 and programs 14. Sampled JavaScript heap peaks are 26.3–34.0 MiB reference and 25.9–30.1 MiB candidate. These are 12-second samples subject to GC, so they do not establish a peak-memory saving. Menu readiness in the flight harness is 227.5–235.6 ms reference and 235.3–239.4 ms candidate. The three initial chunks take 20.1–20.7 ms reference and 22.2–23.0 ms candidate. The measured improvement applies to streaming after startup.

All flights passed 184 of 184 Main gates and 10 Encore gates with zero hits, score, audio misses or silent fallback. The 12-switch lifecycle test recovered each of the four volumes after context loss, released the final canvas, scheduler and listeners, and kept program and geometry counts bounded. Backing storage after forced GC is 10,052,106 → 10,052,541 → 10,052,640 bytes over three cycles. JS heap is 10.9 → 11.8 → 11.9 MiB. Repeated prewarming releases all 204 shader handles. The small heap and DOM increases over three cycles need longer retention sampling for leak attribution. [Stability harness](../../tests/harness/stability.ts)

## Geometry and verification fixtures

The core characterization freezes SHA-256 checksums from `b7749a5` for Standard and Sightseeing with seed 0. It hashes all near chunk ranges, mesh and material order, index type and contents, material groups, attribute metadata and raw positions, normals, UVs and colors. Bounds are computed on each mesh and hashed with the data. The test includes the original S-Curve boundaries, reverse streaming, the three physical junction sides, junction removal, and the Afterglow rebuild. The existing seam test separately compares position and UV coordinates on both sides of fractional S-Curve cuts. [Corridor characterization](../../tests/core/corridor.test.ts)

The browser fixtures reuse the F4-P0 fixed stations, beat, seed and camera. The seven 540p High PNGs for opening, ordinary, scenic lighting, S-Curve, dense, Challenge and Encore match both the paired reference and the original F4-P0 captures byte for byte. The S-Curve digest still begins with `c617f5723742`. The Encore, Afterglow and sustained Boost checks use the existing stability matrix.

## Verification

- Typecheck and all 361 unit tests passed, including the F4-B authored chart and spatial fingerprints.
- The 12-case paired stability suite passed. Its production streaming, Encore, Afterglow and Impossible cases cover both reference and candidate. The separate cross-volume navigation and WebGL recovery test covers ELSEWHERE, DAYBREAK, DESCENT and ORBIT.
- The default `npm test` run passed both builds and all 218 browser cases. This includes the high-DPR DROP digest assertion, four-volume fidelity, material ownership, seeded routes, records and audio tests.
- Both focused browser performance cases passed against the same builds. They cover cross-volume frame, resource and restart samples and DESCENT's Hard and Impossible glass budgets.
- The standalone production build and initial release wrapper encountered the previously observed React Router prerender timeout on different Explorer routes. The successful default build ran with `NODE_OPTIONS=--dns-result-order=ipv4first`. All six Playwright release smoke tests passed against that complete static artifact without rebuilding it.

## Conclusion

Keep direct panel construction for the measured reduction in repeated chunk work. The common full-flight P95/P99 and the startup samples leave room for browser timing variation. The geometry, visible coverage and live resource counts give no basis to change ring density, lookahead, eviction or rendering quality. High-resolution GPU work can be evaluated independently.

## Reproduction

Build the unmodified `b7749a5` production app in a separate checkout. For the added trace fields, copy the candidate's `tests/harness/stability.ts` into that reference checkout before building its harness. Build the candidate production app and harness in that order. Point `STABILITY_REFERENCE_DIR` at the reference's absolute build directory, or copy both completed reference outputs under the ignored `playwright-report/` directory. Run against the same physical GPU and browser.

```powershell
$env:A0_BROWSER_CHANNEL = 'chrome'
$env:RELEASE_CHROMIUM_CHANNEL = 'chrome'
npm run typecheck
npm test
npx playwright test --config playwright.b0.config.ts tests/browser/perf.spec.ts --grep '@perf'
$env:STABILITY_CHROMIUM_CHANNEL = 'chrome'
$env:STABILITY_REFERENCE_DIR = (Resolve-Path 'playwright-report/f4-p1-a-reference').Path
npx playwright test --config playwright.stability.config.ts --grep 'fixed rendering.*elsewhere|audio-led complete Showcase.*elsewhere|repeats cross-volume|@outro-perf|@impossible-perf|repeated volume prewarming|switching away from mixed gates|benchmark.*chunk' --output=playwright-report/f4-p1-a-stability-artifacts
npm run test:release
```

The paired full flights alternate reference, candidate, candidate and reference. Preserve the raw `STABILITY` rows and PNGs under `playwright-report/` for further comparisons. To isolate generator CPU, build the harness with `npm run build:harness -- --sourcemap`, open the existing stability harness and sample twelve calls to `window.stability.stream('elsewhere')` in the Chrome DevTools CPU profiler after one warmup.
