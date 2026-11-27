# D0-B3-A1-F1 — ELSEWHERE validation

Baseline: `371ee4d079ccfaa39fb0add8bd62e60f55672562`.

At B / beat 113.67, renderer isolation identified two distinct sources. Disabling the `elsewhere-scenic-lamps` batch removed the blue ceiling strips (28 instances in the view); disabling `overhead-assembly:kit-lens` removed the bright transverse light and its colored ends. Hiding all overhead batches (three beam instances) removed the small hanger boxes as well. A bright pool persisted after hiding both groups; this revision also removes A1's pooled fixture light. The retained beams are unlit metal with one inset underside; there are no individual fittings on the beam.

The wall mesh now provides a **0.34-unit deep pocket** with beveled sides and a back plane. Each fitted model uses a flattened opaque profile and a backing flange seated on that plane. Fans, pipes, bays, and the inactive service door are no longer emissive, while the M0 hologram is still previewable as a material. Pairs repeat on the same 36-unit grid in alternating modules and share the same equipment family throughout each chapter. No structural or gameplay items are scattered on the floor.

| Spatial program | Zones per mode | Additional fixtures | Rule |
| --- | ---: | ---: | --- |
| Structural-only | 2 | 0 | INTRO and BREAK; no extra lamps |
| Continuous-edge | 8 | 0 | Original octagonal rims and longitudinal corner ribbons |
| Ceiling-pair | 1 | 10 | A, 60 units, one group |
| Ordered-rhythm | 1 | 8 | BUILD, 48 units, two phase-offset groups |

Both installations have identical symmetrical slots every 12 world units. Standard slots span **4674–4734** and **6453–6501**, Sightseeing **4305–4365** and **4929–4977**. Slots recess 0.135 units into the actual shell. Ring boundaries use absolute world phase and the shell retains the same UVs across a streamed split. No new textures; three neutral moving fill points, down from four in the previous rig, plus the existing ambient and hemisphere.

The full Standard plan went from 440 to 331 assemblies; Sightseeing from 134 to 109. The count falls because fittings are concentrated at real mounting bays and quiet spans are left clear. The Standard plan contains 175 beams, 24 conduit mounts, 44 ventilation mounts, 6 service bays and 82 inactive service doors. Separate lamp instances drop from 1,637 / 526 to **18 per mode**. One bounded lens batch owns its geometry and material; tunnel chunks own their cutback geometry and continue to share the M0 material library.

The **33 hue anchors / 32 transitions** replace the old 32-beat dwell/transition cycle. Most authored phrase gaps are 12–16 beats; the longest is 24 in BREAK. Hue wraps via the shortest quintic arc. The main ring uses pulse/breath amplitudes **0.22/0.12**, the corner strip **0.16/0.08**, and branch rails **0.18/0.10**. Pulse shape is `exp(-5(1-cos(2πb)))`; chapter energy gates the response. Most chapters use four-beat breath, INTRO/BREAK eight. The two BUILD groups use a 48-unit, four-beat chase; Debug-only dual color adds at most 0.0594 turns of hue to one group and does not move the slots. The game remains single-color.

`/debug/#lighting` opens with the same beat and lighting as the game capture for each station. It also provides fixed-time scrubbing, play/pause, a view angle and a single/dual comparison in BUILD. `/debug/#structure` shows the five opaque models. The retained game camera, path, score, glass optics, pickup and music follow the existing runtime.

## Fixed frames and costs

Windows 10 (19045), Ryzen 7 5800H, Chrome 157.0.8103.39, AMD Radeon integrated GPU via ANGLE D3D11, 960×540 at DPR 1, fixed seed and matched viewport/quality. Production SSG frames and the stability harness use separate static servers for the two builds. `@scenic-perf` runs baseline → candidate → candidate → baseline; each trial draws 240 frames and uses 10 asynchronous GPU frame queries. Table values average the two trial percentiles; CPU and GPU times are milliseconds. High unless specified.

| Station | CPU P50 / P95, old → new | GPU P50 / P95, old → new | Draw calls | Triangles | Geom. / Tex. / Programs |
| --- | --- | --- | --- | --- | --- |
| INTRO | .95 / 1.50 → .70 / 1.10 | 1.97 / 2.20 → 1.79 / 2.32 | 81 → 55 | 101,462 → 69,342 | 31 / 20 / 21 → 20 / 20 / 17 |
| A | .95 / 1.40 → .75 / 1.20 | 1.93 / 2.23 → 1.77 / 2.20 | 83 → 63 | 99,006 → 77,574 | 31 / 20 / 21 → 23 / 20 / 17 |
| A paired slots | 1.05 / 1.40 → .85 / 1.30 | 1.94 / 2.12 → 1.89 / 2.68 | 107 → 65 | 108,634 → 78,374 | 43 / 20 / 21 → 24 / 20 / 17 |
| B Low | .60 / .85 → .50 / .65 | 1.08 / 1.95 → 1.50 / 1.77 | 45 → 36 | 41,288 → 40,084 | 34 / 18 / 17 → 25 / 18 / 14 |
| BUILD ordered | .95 / 1.40 → .75 / 1.10 | 2.06 / 2.74 → 1.82 / 2.56 | 97 → 65 | 109,514 → 72,746 | 39 / 20 / 21 → 25 / 20 / 17 |
| DROP cruise | .90 / 1.35 → .85 / 1.35 | 2.02 / 2.52 → 1.88 / 2.00 | 99 → 81 | 119,246 → 102,926 | 42 / 20 / 21 → 33 / 20 / 17 |
| DROP Boost | .85 / 1.30 → .90 / 1.55 | 2.03 / 2.15 → 2.03 / 2.47 | 99 → 81 | 119,246 → 102,926 | 42 / 20 / 21 → 33 / 20 / 17 |
| BREAK | .90 / 1.35 → .55 / .85 | 1.98 / 2.50 → 1.82 / 2.71 | 87 → 55 | 98,290 → 68,354 | 34 / 20 / 21 → 20 / 20 / 17 |
| Branch Main | .45 / .75 → .40 / .65 | 1.66 / 1.82 → 1.56 / 1.62 | 29 → 29 | 50,082 → 49,282 | 11 / 20 / 19 → 11 / 20 / 16 |
| Branch Challenge | .40 / .65 → .35 / .70 | 1.79 / 1.83 → 1.68 / 1.83 | 31 → 17 | 50,746 → 27,434 | 14 / 20 / 19 → 9 / 20 / 15 |
| Branch Bonus | .45 / .75 → .45 / .85 | 1.62 / 2.03 → 1.56 / 1.71 | 37 → 37 | 50,134 → 49,334 | 10 / 20 / 19 → 10 / 20 / 16 |
| FINALE | .85 / 1.20 → .75 / 1.15 | 1.98 / 2.43 → 1.84 / 2.24 | 90 → 66 | 101,514 → 71,482 | 37 / 20 / 21 → 27 / 20 / 17 |
| Sightseeing | .90 / 1.45 → .70 / 1.15 | 1.86 / 2.76 → 1.97 / 2.39 | 76 → 48 | 73,854 → 54,618 | 30 / 20 / 21 → 18 / 20 / 17 |

A focused ABBA repeat drew 720 frames with 30 GPU frame queries per trial. For the paired slots, CPU P95 was 1.60 → 1.50 ms and GPU P50 was 2.30 → 2.29 ms. Total GPU P95 remained higher (2.58 → 2.88 ms, +0.30 ms); the separately sampled scene pass P95 was 1.85 → 1.77 ms. These measurements do not identify a single pass responsible for the higher frame tail. On Boost, CPU P95 was 1.70 → 1.40 ms and GPU P95 was 2.60 → 2.73 ms. INTRO, B Low, BUILD ordered and BREAK GPU P95 were 2.83 → 2.41, 1.91 → 1.83, 2.61 → 2.56 and 2.67 → 2.39 ms. The paired slot tail is the main remaining performance item to watch on slower GPUs.

Fixed image luma (0–255) at INTRO went 10.51 → 9.43; B Low 12.15 → 8.97, with pixels at luma 210 or higher down from 294 to 4; BREAK 10.01 → 10.03. The paired slot capture went 11.46 → 11.95. Matched DRIFT, DESCENT and ORBIT fixed canvas captures were byte-for-byte identical. The visual suite also covered Bonus with Boost and Sightseeing at Low/DPR 1 and High/DPR 2. The local review confirmed the continuous dark roof, the absence of scattered fittings, and the paired slots at the installed positions. The angled B and Sightseeing Debug captures show both fan assemblies mounted inside the opposing walls, with their metal faces visible under the neutral fill.

ELSEWHERE kept 3–4 resident tunnel chunks. In 15 builds per trial, the chunk CPU P50 was 4.2 → 4.0 ms; P95 was 7.4–7.9 → 7.5–10.8 ms. The 10.8 ms tail occurred in one trial and did not recur in the other; cutback geometry adds occasional construction work. Candidate fixed views contained 0–8 rendered assemblies and 0–10 lenses, with no instance overflow. BUILD had two visible ordered groups. Debug stayed at two WebGL contexts and all 29 expected previews loaded (one readiness observation: 726 → 582 ms). All 146 compiled shader handles were released in the cycle test. Four repeated mixed-gate readings returned to 29 geometries, 22 textures, 14 programs.

Run the comparisons with `STABILITY_REFERENCE_DIR` pointing to a separate build of the baseline; use `npm run test:stability -- --grep @scenic-`. `STABILITY_SCENES` accepts comma-separated station IDs and `STABILITY_SCENIC_FRAMES` increases the sample window for a repeat.

## Verification and remaining review

`npm run typecheck`, `npm test` (154 Vitest, 57 Playwright), and `npm run test:release` (6 Playwright including the SSG artifact) passed. Relevant stability/visual checks (7 plus the focused repeat), compatibility checks across Chromium, Firefox, WebKit and mobile emulation (20), and audio checks (16) passed. Full songs with real collision and all Sightseeing routes, CPU/GPU opening parity, pause/resume, fixed spatial gates and pickup/branch rules, no modal for recoverable stalls, and WebGL context recovery are covered by the existing regression suite. The Debug browser test compares the actual game and default preview on the same station, then changes the hue/dual override at that same spatial coordinate and restores the context without changing the beat. Windows WebKit lacks AudioContext; audible coverage there remains blocked. Firefox does not support the offline suspend/resume probe used by the test.

Manual judgement is still required for comfort during extended high-speed play, especially the warm-to-magenta and indigo transitions in DROP and FINALE, and for how readable the wall recesses are on a darker display. The dual-color experiment is available for comparison in Debug only. No physical device validation was performed for this change.
