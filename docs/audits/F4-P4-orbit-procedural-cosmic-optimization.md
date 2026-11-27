# F4-P4 ORBIT procedural baking and cosmic rendering

## Reference and environment

Reference `d02d57f` was built in a detached worktree with the locked dependencies. Reference and candidate use the same stability instrumentation. Tests run sequentially in headless Chrome 158.0.8127.37 on Windows 10 build 19045 and the Ryzen 7 5800H integrated Radeon (1638), with ANGLE D3D11 hardware WebGL2 and Node 24.22.1. The paired comparisons alternate reference, candidate, candidate and reference. The static site, harness and Explorer use the production generators.

Fixed ORBIT captures use the production world seed 77345 and flight density, run seed 0, Impossible Standard, fixed camera and Dynamic Lighting. They cover the seven landmarks, both seeded side routes and the ending. The mobile profile uses touch emulation and the same desktop GPU. GPU timings use rotated hardware timer queries. Scene Colour and whole-frame percentiles have separate sample populations.

## Cold preparation attribution

A source-mapped Chrome CPU profile from the reference captures a fresh 540p High menu mount with a 200 µs sample interval. Times below are inclusive sampled time. Rendering scopes overlap the operations they invoke.

| Reference scope | Sampled CPU |
| --- | ---: |
| Celestial noise, `stoneVolume(64)` | 256.9 ms |
| Asteroid surface, `asteroidSurfaceVolume(64)` | 414.0 ms |
| ORBIT rock geometry factory | 10.1 ms |
| Cosmic setpiece placement, including layout clearance queries | 54.9 ms |
| Initial rock stream | 3.7 ms wall-clock in the instrumented mount |
| AURORA structural field, `bakeAuroraField` | 17.0 ms |
| AURORA warmup, including its field generation | 63.5 ms |
| APHELION warmup, including target priming | 239.8 ms |

Repeated periodic hashes and interpolation dominate celestial noise. The asteroid loop spends most of its own time selecting distances before sampling grain and weathering. The first two field bakes account for about 671 ms on this trace. ORBIT world creation accounts for 761 ms inclusive and shader preparation accounts for 381 ms inclusive. The first draw took 309 ms wall-clock in that fresh-browser trace. First-use driver work varies with browser and shader-cache state. CPU allocation and submission counters recorded two 3D-volume uploads totaling 0.8 ms of API time and one AURORA array upload below 0.1 ms. Those counters measure CPU submission. GPU transfer completion and compiler latency are outside their scope. [Field generators](../../app/game/graphics/orbit-surface-field.ts) · [Warmup and target priming](../../app/game/graphics/orbit-setpieces.client.ts)

## Accepted baking changes

The volume baker precomputes wrapped gradient codes, fractional coordinates and interpolation weights once per grid. It evaluates the same corner gradients and blends them in the original order. The asteroid baker prepares the periodic feature offsets and neighborhoods once and starts each search in the current cell. A conservative squared-distance comparison skips candidates that cannot enter the nearest two. Contenders still use the original `Math.hypot`, offsets, channel formulas and rounding. The separate finalists experiment tracked three squared distances and added a slow path for near ties. Its isolated times were mixed and its additional selection logic stayed out.

Both production fields keep all four channels and one mebibyte of CPU texels each. The existing world-independent cache retains only those two base arrays. Coordinate and neighborhood tables are local to a bake. Production and Explorer still allocate their own disposable textures and generate mipmaps in the same world preparation paths. There is no scheduling or loading change for the other volumes.

Six fresh module-worker trials returned both exact arrays with transferable buffers. Worker CPU time was 143.3 ms median (137.7–161.8 ms) and creation through receipt took 150.5 ms (144.5–169.1 ms). The test page recorded zero main-thread Long Tasks during those trials. The experiment measured the isolated bake and transfer. An integrated readiness improvement would require overlapping this work with the remaining preparation and coordinating cancellation across production and Explorer mounts. The production path keeps the synchronous bake and existing cache.

## CPU and startup results

The isolated browser bake samples each field six times per trial, with twelve unprofiled samples per version. Every sample has the frozen hash. The P95 is the highest sample at this count.

| 64³ field | Reference P50 / P95 / max | Candidate P50 / P95 / max | Median savings |
| --- | ---: | ---: | ---: |
| Celestial | 239.65 / 246.20 / 246.20 ms | 39.00 / 40.10 / 40.10 ms | 83.7% |
| Asteroid | 373.15 / 386.90 / 386.90 ms | 84.30 / 94.10 / 94.10 ms | 77.4% |

The sum of bake medians fell from 612.8 to 123.3 ms. The separate cold CPU profile places the candidate bakes at 53.3 and 101.3 ms sampled, down from 256.9 and 414.0 ms. It places AURORA generation at 15.3 ms and APHELION warmup at 242.3 ms. The warmup code is identical and can still incur driver-dependent first-use cost.

Two fresh harness mounts per version reached menu in 836.8–1,613.4 ms reference and 362.3–386.4 ms candidate. The median time inside scene load decreased from 726.95 to 233.25 ms. The wide menu-readiness range also reflects first-use draw and shader preparation variation. Six warm ORBIT revisits per version had overlapping ranges of 139.3–159.8 and 132.3–156.3 ms, with medians of 142.55 and 145.50 ms. Those visits reuse the original two CPU arrays and still allocate and upload the textures for the new world.

Two paired cold and warm navigations to the production ORBIT menu confirm the startup effect. A warm navigation reuses the HTTP cache and starts a new JavaScript context. This differs from switching volumes within an existing page. The longest main-thread tasks reflect the existing synchronous production preparation path.

| Static startup at 540p High | Cold reference → candidate | HTTP-warm reference → candidate |
| --- | ---: | ---: |
| Menu ready, in-page median | 1,266.95 → 587.80 ms | 1,022.10 → 421.75 ms |
| CDP main-thread TaskDuration, median | 1,325.55 → 652.65 ms | 1,076.54 → 471.23 ms |
| Runtime initialization, median | 1,030.85 → 367.85 ms | 921.55 → 331.10 ms |
| Long Task durations | 963–1,121 → 371–383 ms | 847–1,007 → 335–337 ms |

Cold main-thread time decreased by 50.8%. The two code versions experience different first-use driver costs across launches, so the field and scene-load scopes are the more specific measures of work removed.

Both cold profiles called `compileShader` 26 times and `linkProgram` 13 times. Those CPU API submissions totalled at most 0.4 ms in each profile. Preparation including first-use synchronization and target priming took 383.5 ms in the reference profile and 385.6 ms in the candidate profile. Wide variation across the paired menu sequence is visible in the otherwise equivalent preparation scope (367.6, 42.8, 41.7 and 40.3 ms in trial order). The reference's 367.6 ms outlier is part of its reported menu timing range.

## GPU attribution and candidate

The mask trials use 540px projected geometry LOD at both 540p and 1080p. The shader still receives actual screen dimensions for coverage and derivatives. This holds visible asteroid LOD counts and draw counts constant for the full rendering comparison. The masks hide one render category during Scene Colour, preserving the rest of the draw and its target. Masked timings quantify the contribution under that coverage and occlusion state.

| High fixed view | 540p full | 1080p full | 1080p without ordinary debris | Without setpiece rocks | Without AURORA layers | Without celestial optics |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| DRIFT | 0.62 / 1.35 | 3.28 / 4.64 | 2.92 / 4.27 | 3.01 / 4.47 | 3.40 / 4.79 | 3.36 / 4.72 |
| AURORA | 1.48 / 2.05 | 7.30 / 8.69 | 7.02 / 8.46 | 7.29 / 8.71 | 3.33 / 4.74 | 7.30 / 8.75 |
| APHELION | 1.15 / 1.66 | 3.62 / 4.82 | 3.26 / 4.41 | 3.65 / 4.92 | 4.01 / 5.29 | 3.16 / 4.58 |

Each cell reports Scene Colour / whole-frame GPU P50 in milliseconds, from three trials. Setpiece rock batches include landmarks and their smaller companions. APHELION optics include the planet, rings, shell and moon. AURORA's six layers account for the largest observed 1080p difference. With fixed LOD, its full Scene Colour grows from 1.48 to 7.30 ms while draw count remains 118. Drawing transparent filtered gas across more pixels is the clearest rendering hotspot. Small changes in masks with no matching visible object also show measurement variance.

The experimental shader evaluated split-domain derivatives before the conditional and used `textureGrad` only where both filter weights were positive. All four output configurations produced matching PNGs across the four trials. At AURORA beat 279, 1080p Scene Colour P50 was 7.22/7.17 ms on reference and 7.28/7.25 ms on the variant. At beat 270 it was 7.17/7.07 versus 6.68/7.28 ms. The direct high-DPR path also had overlapping samples and a higher candidate tail in one run. Each trial had 14 whole-frame queries, zero disjoint samples and zero unready queries. The candidate did not yield a repeatable benefit. Production retains the original shader and render path. Per-fragment rejection earlier in the gas evaluation would also need to preserve neighboring lanes' derivatives. The evidence supports leaving that path intact.

### Installed rendering path

The paired fixed production fixtures use normal projected rock LOD. Times are median per-run P50 values in ms, shown as reference → candidate. Resource and draw counts match for each fixed input. The shader and uploaded texture contents are identical on the two versions.

| 1080p High scene | Scene Colour | Whole frame | Draw calls |
| --- | ---: | ---: | ---: |
| OUTER BELT | 2.29 → 3.12 | 3.63 → 4.51 | 144 |
| DRIFT | 1.73 → 2.86 | 2.99 → 4.36 | 98 |
| RINGBREAK | 2.63 → 3.14 | 3.95 → 4.57 | 203 |
| MAELSTROM | 4.00 → 4.86 | 5.23 → 6.73 | 246 |
| ECLIPSE | 2.69 → 3.41 | 4.06 → 4.81 | 58 |
| AURORA | 6.20 → 5.87 | 7.45 → 7.21 | 134 |
| APHELION | 2.47 → 3.25 | 3.79 → 4.69 | 88 |
| Challenge | 2.36 → 3.08 | 3.67 → 4.50 | 206 |
| Bonus | 3.02 → 2.94 | 4.38 → 4.37 | 198 |
| Encore | 2.64 → 3.34 | 4.12 → 4.78 | 34 |
| Afterglow | 2.87 → 2.96 | 4.43 → 4.42 | 46 |

| AURORA profile | Effective DPR | Framebuffer | Scene Colour P50/P95 | Whole-frame GPU P50/P95 |
| --- | ---: | --- | ---: | ---: |
| 540p High | 1.00 | 960×540 | 1.43/1.53 → 1.63/1.86 | 1.83/2.63 → 2.08/2.43 |
| 720p Auto | 1.00 | 1280×720 | 2.26/2.53 → 2.93/3.07 | 2.93/3.10 → 3.50/3.91 |
| 1080p High | 1.00 | 1920×1080 | 6.20/6.48 → 5.87/6.17 | 7.45/7.87 → 7.21/7.48 |
| 540p High at device DPR 2 | 1.60 | 1536×864 | 4.03/4.48 → 4.17/4.27 | 4.92/5.19 → 4.93/5.15 |
| 390×844 touch Auto | 1.25 | 487×1055 | 1.08/1.23 → 1.05/1.22 | 1.33/2.14 → 1.31/2.10 |
| 540p Low direct | 1.00 | 960×540 | 0.86/2.27 → 1.12/1.77 | 1.34/1.76 → 0.88/1.69 |

All 84 fixed runs returned valid whole-frame queries with zero disjoint or unready queries. For example, 1080p AURORA RAF P95/P99 was 12.55/14.65 → 12.55/14.70 ms, with 1.60 ms draw CPU P95 in both groups. The initial long batches show timing spread in both directions with unchanged draw and triangle counts.

A second 1080p High comparison interleaved fresh contexts within each scene. Three trials per build and scene drew 336 frames each and returned 14 valid queries per scope per trial, with zero disjoint or unready queries. Median run P50 and run-to-run P50 ranges are in milliseconds.

| Scene | Scene Colour reference → candidate | Whole frame reference → candidate |
| --- | ---: | ---: |
| DRIFT | 2.44 (2.18–3.29) → 3.17 (2.38–3.30) | 3.81 (3.64–4.73) → 4.48 (3.73–4.72) |
| MAELSTROM | 5.13 (4.49–5.54) → 4.75 (4.71–4.77) | 6.87 (5.94–7.25) → 6.28 (6.25–6.34) |
| AURORA | 6.99 (6.28–7.05) → 6.50 (6.24–7.14) | 8.46 (7.67–8.49) → 7.83 (7.51–8.55) |
| APHELION | 3.94 (3.26–3.97) → 3.63 (3.43–3.92) | 5.46 (4.64–5.47) → 5.06 (4.87–5.33) |

DRIFT's median was higher in both series and its interleaved ranges overlap substantially. MAELSTROM and APHELION changed direction on recheck. AURORA's ranges also overlap. These results establish no repeatable rendering gain attributable to the CPU bake change.

## Texture and visual equivalence

The 64³ SHA-256 fingerprints were captured before changing production code. The test also fixes the complete outputs at sizes 1, 9, 32, 63 and 65 and retains the existing deterministic and periodicity checks. [Texture fixtures](../../tests/core/orbit-surface.test.ts)

| Field | Exact SHA-256 |
| --- | --- |
| Celestial noise | `43a31b8b3a8d4630801c1c04126f4748f9cdd8e6e12ea4e4602a8b1f7198a93d` |
| Asteroid surface | `b647a4a0404c7116730d3c6a09ddb65484e345e75a6d4165ca72b5f5a7e1cd0f` |

The 21 ORBIT PNG pairs and 38 shared High fixture pairs across the four volumes are byte-identical. The captures include both side routes, Encore and Afterglow. Visual inspection covered rock silhouettes, ECLIPSE's emission ring, AURORA's cavities and filaments, and APHELION's clouds, ring and moon. [ORBIT fixtures](../../tests/stability/orbit.spec.ts) · [Shared High fixtures](../../tests/stability/stability.spec.ts)

## Warmup, lifecycle and complete flight

The paired world lifecycle repeatedly entered ORBIT from each of the other volumes, switched through Low, Auto and High, lost and restored the active WebGL context during play, and disposed the world after returning to the menu. The initial ORBIT menu used 98 calls, 18 geometries, seven textures and 13 programs in each build. A warm ORBIT revisit used the same calls, geometry and program counts. Its eight or ten textures include resources retained by the shared renderer after visiting another volume. The switch test observed one active canvas. Disposal removed it, released its context, stopped the scheduler and RAF, and released input and listeners.

The paired first-visible check covered Low direct and Auto/High PostFX. Every cold and warm AURORA entry drew all six layers with zero field builds and zero new shader programs on that frame. APHELION retained the sphere identity and all four prepared celestial programs. Renderer program counts immediately before, at and after first visibility were 8/9/9 on Low direct and 11/12/12 on Auto and High in each build. The existing transition adds one renderer program in the measured path. Both builds released four celestial materials and the ring resource on disposal. All probes reported `gl.getError() === 0`.

Both static builds also passed rapid game menu switching and the Explorer Worlds sequence ORBIT → DAYBREAK → DESCENT → ORBIT. The final ORBIT preview opened with one active WebGL2 context. Navigating from the preview to Overview released it, leaving zero live contexts and zero page errors.

The complete audio-led paired flights used 1280×720 Auto, Main, seed 0 and the real Impossible Showcase pilot. Each used trusted Start and Resume clicks and ran for 184.1 s of captured frames. All four reached `ESCAPED` with 135/135 gates, S rank, zero hits, zero neutralized events and score zero. STARWAKE reported one resume, zero late callbacks or missed steps and zero silent fallbacks. Audio and RAF were closed on disposal. No flight recorded a Long Task or an RAF interval above 33.34 ms.

| 720p Auto flight | RAF P50/P95/P99/max | Stream CPU P50/P95/max | Scene Colour GPU P50/P95 | Whole-frame GPU P50/P95 |
| --- | ---: | ---: | ---: | ---: |
| Reference 0 | 4.2/4.3/8.4/25.1 | 0.5/1.1/2.0 | 2.10/3.65 | 2.89/4.27 |
| Candidate 1 | 4.2/4.3/8.4/25.1 | 0.4/1.1/1.9 | 2.10/3.71 | 2.82/4.31 |
| Candidate 2 | 4.2/4.3/8.2/16.6 | 0.4/1.2/2.0 | 1.60/3.14 | 2.42/3.78 |
| Reference 3 | 4.2/8.2/8.4/16.7 | 0.5/1.4/2.9 | 1.85/3.61 | 2.63/4.49 |

Times are milliseconds. There were 349 stream updates in every run and 1,747–1,820 valid whole-frame GPU queries per run with zero disjoint or unready queries. The broad CPU draw P95 ranged from 2.7 to 4.7 ms and the simulation step P95 was 0.1 ms in all cases. The highest sampled resource counts were 237 calls, 46 geometries, seven textures and 17 programs in both groups. The baked fields are already present before the measured flight.

## Verification and limitations

- `npm run typecheck` and `npm test` passed, including all 370 unit tests and 218 browser regressions. This covers the complete texture arrays, four-volume authored chart and spatial fingerprints, real collision, STARWAKE and the other soundtracks, records, seeded routes and the Explorer laboratories. The historical high-DPR ELSEWHERE DROP assertion passed unchanged.
- Seven paired Chrome stability cases passed for the bake and lifecycle samples, production startup, fixed ORBIT profiles and four cross-volume visual fixtures. The reference profile and diagnostic masks, candidate profile and four audio-led flights also passed.
- Four supplemental Chrome probes passed for cold/warm visibility at all three quality levels, worker transfer and byte equality, rapid switching, and interleaved 1080p timing.
- All 17 focused browser cases passed, including AURORA first-visible warmup, APHELION identity and recovery, rock retention, real Explorer scenes, and the browser performance checks. `npm run test:release` passed all six static smoke tests.
- Two preliminary candidate prerenders timed out on separate Explorer routes. The third build, release build and default pipeline built the static client with the same implementation.
- Measurements use one hardware browser and GPU. Touch emulation checks mobile layout, profile selection and rendering on that desktop GPU. Physical mobile hardware, compositor presentation latency and driver transfer time remain unmeasured.

## Reproduction

Build `d02d57f` in a separate worktree and copy in the current `tests/harness/stability.ts` for matching instrumentation. Build its production output with `npm run build` and use source maps in both harness builds. Keep the reference artifact and raw browser output under the ignored `playwright-report/` directory.

```powershell
$env:STABILITY_REFERENCE_DIR = (Resolve-Path 'playwright-report/f4-p4-reference/build').Path
$env:STABILITY_CHROMIUM_CHANNEL = 'chrome'
$env:A0_BROWSER_CHANNEL = 'chrome'
$env:RELEASE_CHROMIUM_CHANNEL = 'chrome'
npm run build
npm run build:harness -- --sourcemap
node node_modules/@playwright/test/cli.js test --config playwright.stability.config.ts --grep '@p4-|cold and warm production startup.*orbit|audio-led complete Showcase.*orbit|@p1b High visual fixtures'
npm run typecheck
npm test
npm run test:release
```

Run the `@p4-profile` case with `STABILITY_REFERENCE_DIR` unset to capture the installed candidate's cold profile. The focused browser files are `perf.spec.ts`, `orbit-aurora.spec.ts`, `orbit-aphelion.spec.ts`, `orbit-cosmic.spec.ts`, `orbit-lighting.spec.ts` and `orbit-rocks.spec.ts`.

For the supplemental interleaved check, use the same `fixedGlass` call as `@p4-fixed` with 336 frames at 1920×1080 High and standard Impossible, with beats 66, 190, 279 and 346. Within each scene alternate fresh reference, candidate, candidate, reference, reference and candidate contexts.
