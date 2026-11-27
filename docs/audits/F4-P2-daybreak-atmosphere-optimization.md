# F4-P2 DAYBREAK atmospheric rendering

## Result

DAYBREAK generates both exterior textures with less CPU work. The cloud generator uses a single periodic wrap for its bounded index range. The cirrus generator skips latitudes where the main ribbon and both branch bodies and fringes have zero density. The two RGBA8 fields match the reference byte for byte. The measured shader candidates were reverted after the paired trials. The Skyglass and Exterior shaders, texture upload policy and shared PostFX are the same rendering paths as `9412529`.

## Environment and method

The comparison uses `9412529` and the candidate on Windows 10 build 19045 with Node 24.22.1, headless Chrome 158.0.8127.37, AMD Ryzen 7 5800H integrated Radeon (device 1638), ANGLE D3D11 and hardware WebGL2. PostFX and Dynamic Lighting are enabled. Fixed runs use seed 0, Standard Impossible, and the Main route. Look Up uses LIFT at beat 104 and station 5850.36. The other timing cameras use SUNBURST at beat 192 and station 7564.97. The seven chapter images use their authored midpoints.

The stability harness rotates disjoint-aware GPU queries across the whole frame, Scene Colour, Exterior, Depth, DOF, Bloom and Composite. Exterior wraps the actual draw call of the depth-tested sky cube within Scene Colour. It does not use CPU submission time as GPU time. Scopes are measured on different frames. Their medians cannot be added. Diagnostic shaders alter one locally owned material before compilation. Visibility probes skip identified Scene Colour submissions. They change colour coverage and can affect later pass work. The paired full-colour runs use Reference → Candidate → Candidate → Reference, with 24 warm-up frames and 280 measured frames per sample.

The F4-P1-B 1080p High SUNBURST measured whole-frame GPU P50 of 6.98 ms and Scene Colour of 4.42 ms. Its 540p High and 720p Auto medians were 1.48 and 3.11 ms. The fresh same-session measurements below supply the comparison for this change. Absolute GPU timings shifted between runs.

## Exterior and glass attribution

Initial three-repeat baseline probes at 1920×1080 High. Each row is the median of three run medians in milliseconds. A dash denotes an absent draw. The middle trial reversed probe order. Each available scope has eight queries per run with zero disjoints and unready queries.

| Camera and probe | Whole GPU P50 | Scene Colour P50 | Exterior P50 |
| --- | ---: | ---: | ---: |
| Forward, full | 5.86 | 3.80 | 0.46 |
| Forward, exterior hidden | 5.87 | 3.63 | — |
| Forward, analytic sky only | 5.60 | 3.49 | 0.38 |
| Forward, canopy hidden | 5.23 | 2.91 | 0.39 |
| Forward, gate glass hidden | 5.74 | 3.73 | 0.44 |
| Look Up, full | 6.12 | 3.85 | 0.74 |
| Look Up, exterior hidden | 5.12 | 3.01 | — |
| Look Up, analytic sky only | 6.03 | 3.77 | 0.71 |
| Look Up, simplified analytic sky | 5.40 | 3.18 | 0.71 |
| Look Up, cirrus masked | 5.42 | 3.24 | 0.57 |
| Look Up, canopy hidden | 5.03 | 2.82 | 0.73 |
| Horizon, full | 5.84 | 3.50 | 0.68 |
| Horizon, exterior hidden | 5.35 | 3.07 | — |
| Horizon, clouds masked | 5.73 | 3.36 | 0.67 |
| Horizon, canopy hidden | 5.26 | 3.01 | 0.36 |
| Cloud Sea, full | 4.08 | 2.32 | 0.75 |
| Cloud Sea, exterior hidden | 2.75 | 1.20 | — |
| Cloud Sea, clouds masked | 3.89 | 2.22 | 0.77 |
| Cloud Sea, relief masked | 4.19 | 2.07 | 0.65 |
| Cloud Sea, near swells masked | 4.39 | 2.29 | 0.83 |

Skyglass is the largest isolated addition in Forward and Look Up. The canopy uses one double-sided draw per visible mesh, with depth test enabled and depth writes disabled. The fixtures, panes and gate glass share screen coverage. Gate glass removal has a smaller effect at this SUNBURST station. Moving the camera above the roof toward Cloud Sea trades that coverage for more Exterior work. At Look Up, the visible ribbon uses one explicit-LOD cirrus sample and uses its main, secondary and fiber channels. The difference between its full and cirrus-masked draws is about 0.17 ms. The isolated analytic-sky reduction is near the spread of draw timings. At Cloud Sea the height lookup, corrected height/slope lookup and distance-limited swell lookup occupy different screen regions. The masking results do not establish a major independent cost for swells. A mask changes what reaches PostFX and is unsuitable as a production change. [Exterior shader](../../app/game/graphics/daybreak-exterior.client.ts) · [Skyglass material](../../app/game/graphics/tunnel.client.ts)

## Candidates

| Isolated candidate | 1080p fixed measurements | Decision |
| --- | --- | --- |
| Skip the first height sample beyond the 540-unit relief transition | Cloud Sea whole GPU 5.08 → 4.72 ms, Exterior 0.82 → 0.67 ms. Forward whole GPU 6.17 → 6.27 ms, Exterior 0.38 → 0.50 ms. The trial ranges overlap. | Reverted. Horizon and Cloud Sea differ by one RGB level in 11 and 49 pixels. |
| Reuse the first sample and sample again only in the relief range | Cloud Sea Exterior 0.96 → 1.00 ms. Forward whole GPU 6.60 → 6.51 ms. | Reverted. The lower branch cost did not reproduce. |
| Replace canopy grazing power with a cubic product and reuse reflection dot products | Forward whole GPU 6.45 → 6.33 ms, Look Up 5.75 → 5.81 ms and Horizon 6.10 → 5.91 ms. The four comparison images match exactly. | Reverted. The result varies by view and repeat. |
| Wrap cloud grid indices with bounded checks | The warp can offset a coordinate by at most .026 tiles. The slope pass addresses at most one adjacent texel. One addition or subtraction reproduces the periodic index for either pass. | Kept. Exact data with reduced CPU time. |
| Bound cirrus latitude by the widest possible ribbon and branch support | Bend, branch separation, maximum profile width and fringe reach bound the nonzero texels. A small margin keeps the bound conservative. Earlier rejection omits angular profile and density evaluation where output channels are already zero. | Kept. Exact data with reduced CPU time. |

## Final performance and startup

Isolated CPU generation uses six bakes per browser page in each of the four paired runs. The first timed bake follows the page's real scene setup, so the function has been called once already. The warm samples use each page's last three bakes. This isolates the generator from GL and captures both first-repeat and V8-warmed costs.

| Bake | First repeat, range in ms | Warm median, ms | Raw RGBA data |
| --- | ---: | ---: | --- |
| Cloud height and slope | 13.8–18.4 → 11.5–12.1 | 9.75 → 8.25 | Identical `2b5f1ee9bbd475310…` |
| Structured cirrus | 34.1–34.7 → 28.8–29.5 | 27.20 → 22.50 | Identical `cc8ea99010f9b61c…` |

The warm CPU savings are about 15% for the cloud generator and 17% for cirrus. This cost occurs on the first exterior bake in a fresh page. Re-entry within the same JavaScript context uses the existing raw pixel cache. The cloud RGB and slope guards and a new full cirrus RGBA digest protect those unchanged bytes. [Cloud generator](../../app/game/graphics/daybreak-cloud-field.ts) · [Cirrus generator](../../app/game/graphics/daybreak-cirrus.ts)

### 1080p High GPU

Values are ref → candidate in milliseconds. P95 and P99 are the same observed whole-frame sample in the 10-query windows. Timings are separate scope distributions.

| View | Whole GPU P50/P95/P99 | Scene Colour P50/P95 | Exterior P50/P95 | RAF P95/P99 |
| --- | ---: | ---: | ---: | ---: |
| Forward | 6.53/6.80/6.80 → 6.31/6.62/6.62 | 4.11/4.22 → 3.96/4.07 | 0.49/0.51 → 0.47/0.50 | 12.50/12.55 → 10.40/12.50 |
| Look Up | 5.64/5.77/5.77 → 5.71/5.96/5.96 | 3.28/3.63 → 3.51/3.62 | 0.75/0.81 → 0.74/0.81 | 8.40/12.50 → 8.40/12.55 |
| Horizon | 5.86/6.20/6.20 → 6.02/6.29/6.29 | 3.45/3.76 → 3.66/4.04 | 0.70/0.74 → 0.70/0.78 | 10.45/12.50 → 10.40/10.55 |
| Cloud Sea | 4.62/5.06/5.06 → 4.77/5.08/5.08 | 2.39/2.61 → 2.47/2.84 | 0.89/1.00 → 0.98/1.11 | 8.40/8.45 → 8.40/8.45 |

Forward sampled 3.4% lower GPU P50 while the other cameras sample changes in both directions across individual trials. The shipped changes affect CPU generation only. Shader work, GPU data and draw counts match the reference, so the observed timing deltas are not a steady-state GPU gain. Graphics update CPU P95 was 0.20 ms for every 1080p view on both builds.

### Quality and DPR

All numbers are paired whole-frame GPU P50 in milliseconds. The backing resolution describes what the GPU actually drew.

| CSS viewport and quality | Device → effective DPR | Backing resolution | Forward | Look Up | Cloud Sea |
| --- | ---: | --- | ---: | ---: | ---: |
| 960×540 High | 1 → 1 | 960×540 | 1.62 → 1.94 | 1.50 → 1.64 | 1.35 → 1.31 |
| 1280×720 Auto | 1 → 1 | 1280×720 | 2.83 → 2.83 | 2.57 → 2.68 | 2.50 → 2.34 |
| 960×540 High | 2 → 1.6 | 1536×864 | 3.90 → 4.00 | 3.66 → 3.79 | 3.07 → 3.00 |
| 390×844 touch Auto | 2 → 1.25 | 487×1055 | 1.19 → 1.18 | 1.00 → 0.99 | 1.20 → 1.13 |
| 960×540 Low | 1 → 1 | 960×540 | 1.19 → 1.24 | 0.87 → 0.87 | 1.23 → 0.81 |

The larger backing buffer increases cost in both builds. Desktop High and Auto use the existing HDR, DOF and four-sample scene target on this adapter. Low turns off DOF and scene multisampling. Touch Auto uses the existing mobile cap and detail. RAF P95/P99 stays around 4.3 ms in the 540p desktop rows. At 720p Auto Forward it is 4.30/4.30 → 6.25/6.35 ms with the same median GPU time. This small set of independently sampled runs exposes browser cadence and driver variance.

### Startup and uploads

| Runtime startup signal | Reference, ms | Candidate, ms |
| --- | ---: | ---: |
| Cold menu ready, two observations | 231–248 | 231–234 |
| Cold scene load, two observations | 105–125 | 101–103 |
| Cold PMREM CPU scope | 18.1–24.7 | 19.9–20.0 |
| Warm re-entry menu ready | 69–74 | 69–74 |
| Warm re-entry scene load | 12.9–13.5 | 12.6–12.7 |
| Warm re-entry PMREM CPU scope | 7.8–8.1 | 7.2–7.9 |

A new renderer constructs both textures and their mip chains from a total of 786,432 base-level bytes. The harness tags GL uploads by the backing arrays and mip generation by the bound GL texture. The cloud and cirrus each submit one upload and one mip-generation call in the full-shader run. These CPU-side WebGL calls are separate from the JavaScript field bake. They do not measure transfer completion on the GPU. A cold runtime records 54 2D texture API calls and warm re-entry 48, on each build. The cold calls take 0.3–0.7 ms in total on the CPU. PMREM and the first scene setup are larger startup contributors. Scene load also includes other work, and the menu-ready samples overlap. The isolated bake comparison shows the reliable savings.

## Visual and runtime verification

The 30 DAYBREAK PNG pairs match `9412529` byte for byte. They cover all seven chapter palettes, Forward, Look Up, Horizon, Cloud Sea, White Escape start and peak, Encore, and Afterglow. The 38 inherited High fixtures also match byte for byte, including ELSEWHERE S-Curve and glass, DESCENT facility views and ORBIT celestial setpieces. A contact sheet was reviewed for cloud relief, cirrus fibers, glass edges and colour continuity. The comparison uses fixed cameras, authored beats and stations, seed 0, and the same quality, effective DPR and lighting per image.

At 1080p High, the fixed Forward view reports 85 draw calls, 48 geometries, 14 textures and 15 programs on both builds. Look Up reports 74, 42, 11 and 15. Cloud Sea reports 88, 50, 14 and 15. Both builds use a 1920×1080 four-sample scene target, a 1920×1080 DOF target, a 960×540 depth target and two 480×270 bloom targets. The baked pixel cache retains the same 768 KiB of raw field data per page.

### Audio-led Showcase flights

Three 720p Auto flights start audio from a trusted click and run the production Runtime, with seed 0 and the Impossible chart at Showcase cruise speed. All reach Escaped after approximately 145 seconds with zero collisions and zero score. No forced boost or alignment is used.

| Route | Gates passed / total | GPU P50/P95/P99, ms | RAF P95/P99, ms | Frames >33.34 ms |
| --- | ---: | ---: | ---: | ---: |
| Main | 147 / 147 | 2.90/3.79/4.59 | 4.30/8.40 | 1 |
| Challenge | 148 / 148 | 2.39/3.19/3.53 | 4.30/4.30 | 0 |
| Bonus | 156 / 156 | 2.50/3.39/4.10 | 4.30/4.40 | 0 |

Each flight recorded over 1,390 valid whole-frame GPU queries, with zero disjoints and no outstanding queries at capture end. Playback logged zero late scheduler callbacks, missed steps and silent fallbacks. At results the scheduler and run bus stop. On disposal the AudioContext closes, RAF stops and input/listeners release. The listed crossings are the gates reachable at cruise. Ending presets also inspect the formal Encore and Afterglow independently of flight reachability.

Three additional real-time runs used the game page at 960×540 Low with seed 0, the Main route and the existing alignment diagnostic. Standard Normal finished with 120/120 gates, Standard Impossible with 147/147, and Sightseeing with 39/39. All reached beat 288 and Escaped with zero hits, GL errors, late callbacks, missed audio steps or silent fallbacks. These were functional checks while the main regression suite was running. The isolated Showcase samples above supply the live performance baseline.

### Resource lifetime

Both builds completed two passes of ELSEWHERE → DAYBREAK → DESCENT → DAYBREAK → ORBIT → DAYBREAK. Each DAYBREAK visit exercised Low, Auto, High, Start and Return to Menu. The second pass also resized and restored the context. DAYBREAK retained 34 geometries and 15 programs at each menu sample, with 12 textures before the restores and 11 after, identically in both builds. One canvas remained during the run. Disposal released its context, RAF, input and runtime listeners.

The first cycle test found the harness polling a stale disjoint timer extension after a context restore. It produced `INVALID_ENUM` on both builds. The harness now drops pending query bookkeeping on loss and reacquires the extension on restore. The paired cycle checks and the existing four-volume transition test then passed with zero GL errors.

### Test results

- Strict TypeScript and all 361 unit tests passed, including the authored chart and spatial fingerprints, DAYBREAK atmosphere and cirrus, deterministic routes and Showcase.
- `npm test` built the static site and browser harness and completed 217 of 218 browser cases successfully. DAYBREAK exterior, gameplay, White Escape at all three profiles, all four volumes' menu-driven Showcase, Explorer, audio and recovery cases passed. The one failure was the ELSEWHERE image check described below.
- The attribution sweeps, fixed quality/DPR comparisons, all chapter/ending captures, cold/warm probes, three live Showcase flights and corrected lifecycle scenarios passed. The eight focused browser performance and ORBIT cases passed against the built client and harness, including AURORA first-visible warmup and APHELION inspection.
- Production and harness builds succeeded. The initial production attempt and the `test:release` wrapper hit the previously observed React Router prerender timeout on `/debug/interface/`. The wrapper retry hit the timeout on `/debug/lighting/`. All six release checks passed when run directly against the successfully built static artifact.
- The unchanged ELSEWHERE high-DPR DROP case passed once and failed once in two targeted repeats on each build. The mismatched frame comparisons differ by five pixels, with a maximum single-channel difference of 4/255. The candidate repeat failed on the DROP comparison, while the full suite and the reference repeat found the same size variation in the DPR 2 reduced-motion comparison. The PNG pairs for fixed DAYBREAK and four-volume scenes remain exact. [F4-P0 baseline](F4-P0-performance-baseline.md)

### Limits

GPU and visual comparisons cover the tested AMD D3D11 adapter and Chrome build. Touch emulation uses the same GPU. A physical mobile GPU, other browser engines and physical audio/display latency were outside the measurement. Startup samples time the runtime and scene, and GL calls time CPU submission. Asynchronous texture transfer, driver mipmap completion and physical frame presentation are outside those scopes.

## Reproduction

Build `9412529` in a separate checkout. Copy the current `tests/harness/stability.ts` into that checkout and build its harness. Keep the reference `client` and `harness` outputs together under the ignored `playwright-report/` directory. Build production before the harness in each checkout. Use the same adapter and browser for both.

```powershell
$env:STABILITY_CHROMIUM_CHANNEL = 'chrome'
$env:STABILITY_REFERENCE_DIR = (Resolve-Path 'playwright-report/f4-p2-reference').Path
npm run build
npm run build:harness
node node_modules/@playwright/test/cli.js test --config playwright.stability.config.ts --grep '@p2-paired|@p2-visual|@p2-startup|@p2-lifecycle|@p2-attribution|@daybreak-perf|@p1b High visual fixtures|repeats cross-volume'
Remove-Item Env:STABILITY_REFERENCE_DIR
node node_modules/@playwright/test/cli.js test --config playwright.stability.config.ts --grep '@p2-flight'
$env:A0_BROWSER_CHANNEL = 'chrome'
$env:RELEASE_CHROMIUM_CHANNEL = 'chrome'
npm run typecheck
npm test
node node_modules/@playwright/test/cli.js test --config playwright.b0.config.ts tests/browser/perf.spec.ts tests/browser/orbit-aurora.spec.ts tests/browser/orbit-aphelion.spec.ts
npm run test:release
```

The harness reports `GPU_TIMING_UNAVAILABLE` when valid whole-frame queries are unavailable. Keep raw JSON rows, PNGs, temporary patches and timing logs under `playwright-report/`. Mobile emulation uses the same desktop adapter.
