# D0-B3-A1 — ELSEWHERE validation

Compared with `dev@777464c8bbeaa0072c1e6236c04fc045ef667109` (A0). The final lighting direction is the darker, single-color version requested after playtesting.

## Lighting and composition

- The tunnel rims, strips, architectural guide lamps and branch rails use the glass hue and share a continuous four-beat breath. The hue still changes with the original chapter palette. Route labels and small directional markings retain their own colors. Normal play omits the layered rhythm and hero lamps. The neutral fill stays on during the breath and the palette changes.
- ELSEWHERE uses ambient 0.74, hemisphere 0.68 and PMREM intensity 1.56 (A0: 0.66, 0.55 and 1.7). Three points provide neutral fill and one pooled point gives a little spill near a fixture. At most four point lights and two scene lights are active. Models have their own emission, rather than each receiving a separate PointLight. The M0 texture set, glass, global exposure, Bloom and DPR are unchanged.
- Beam undersides have paired light bars; vents have segmented rings; conduits have lit collars; bays and service doors have status strips. These fixtures keep their own colors in the darker live environment without each adding a PointLight.
- The full score is available in Debug only: INTRO steady, A alternating, B dual-color, BUILD staggered chase, DROP beat and partial blackout, BREAK breath, A2 chase, FINALE bounded all-on and symbol. The same real scene and simulation beat source power the preview. **Station** and **Lighting chapter / Pattern** can change independently; lighting playback leaves the camera at the chosen station.
- Scenic plans assign the existing five assemblies to quiet spans, maintenance bays, ventilation walls, conduit galleries, overhead service and portal motifs. Straight runs receive 36–42 unit macro cells. Bends use conservative wall or floor markings; the branch shell stays clear of kit. Counts cover each full plan, including stations reachable only by sustained Boost:

| Mode | Assemblies A0 → A1 | Loose props A0 → A1 | A1 live lamp positions | A1 lamp positions including Debug |
| --- | ---: | ---: | ---: | ---: |
| Standard | 46 → 440 | 29 → 0 | 1,637 | 2,315 |
| Sightseeing | 46 → 134 | 29 → 0 | 526 | 746 |

## Clear flight lane

Playtesting found the floor objects competed with the glass for attention. The final version removes crates, barrels, cargo groups, and their collision and tumble code from both game and Debug. World scenery is now static graphics data with no contact step in Simulation. The five remaining models are mounted to walls or ceiling and stay outside the flight envelope. The three floating pickups and their collision rules are unchanged.

Use `/debug/#lighting` to compare fixed stations and `/debug/#structure` to inspect the five models under light. The Structural Kit cards use the same geometry and fixture materials as the game.

## Measurement method

Windows 10 build 19045, Ryzen 7 5800H with Radeon Graphics, Chrome 157.0.8103.39, native Radeon via ANGLE/D3D11. Same browser, 960×540 at DPR 1 and matched quality/stations on both revisions. The frame benchmark draws 240 samples per scene in reference/candidate/candidate/reference order. CPU time covers scene update and graphics submission. GPU times come from asynchronous WebGL timer queries (10 per pass and build). The pixel check uses encoded screen luminance and does not measure physical light output.

To repeat, build `build/client` at A0 and the current revision. For the A0 test-only harness build, copy the current `tests/harness/stability.ts` into the A0 checkout before `npm run build:harness`, so both harnesses accept the same route, sample length and moving light beat. Point `STABILITY_REFERENCE_DIR` to the A0 `build` directory and run Playwright with `playwright.stability.config.ts`, filtering by `@scenic-` and `@kit-visual`. Set `STABILITY_SCENES=a,b,build,drop` to repeat only those timings with `@scenic-perf`. Screenshots and raw traces are local test outputs.

## Before and after

INTRO / B / BREAK / Sightseeing mean luminance (0–255): **6.99 → 10.51**, **5.50 → 12.15**, **7.80 → 10.01**, **7.63 → 10.66**. Between **75% and 82%** of pixels still fall below 12 in these A1 frames; none reach 210. The lane is clear of cargo, and the retained wall and ceiling lamps are readable. DRIFT, DESCENT and ORBIT captures at 83 s are byte-identical to A0 under matched conditions.

Frame timings in ms (P50 / P95, mean of the two runs on each build). G/T/P = geometries, textures, programs. The last column reports A1 assembly instances / visible fixtures / visible lamp groups.

| Scene | CPU A0 → A1 | GPU A0 → A1 | Draws | Triangles | G/T/P | Visible A1 |
| --- | --- | --- | --- | --- | --- | --- |
| INTRO | 1.30/2.00 → 1.45/2.15 | 2.14/2.38 → 2.13/8.37¹ | 77 → 81 | 94,094 → 101,462 | 29/20/18 → 31/20/21 | 8 / 28 / 12 |
| A | 0.85/1.25 → 1.35/1.95 | 2.20/2.54 → 2.03/2.37 | 67 → 83 | 92,478 → 99,006 | 23/20/17 → 31/20/21 | 4 / 29 / 18 |
| B (Low) | 0.90/1.30 → 1.00/1.45 | 0.97/7.22 → 1.03/1.88¹ | 36 → 45 | 36,728 → 41,288 | 25/18/15 → 34/18/17 | 6 / 28 / 16 |
| BUILD | 1.05/1.50 → 1.30/2.05 | 2.09/2.57 → 2.32/2.61 | 73 → 97 | 93,490 → 106,058 | 27/20/18 → 39/20/21 | 7 / 33 / 19 |
| DROP | 0.80/1.25 → 1.30/2.05 | 2.13/2.56 → 2.28/2.58 | 68 → 84 | 92,346 → 99,042 | 26/20/17 → 34/20/21 | 5 / 37 / 23 |
| BREAK | 0.75/1.05 → 1.40/2.10 | 2.26/2.36 → 2.24/2.54 | 65 → 87 | 91,570 → 98,290 | 23/20/17 → 34/20/21 | 3 / 24 / 15 |
| Main | 0.65/1.05 → 0.70/1.05 | 1.86/2.26 → 1.72/1.98 | 29 → 29 | 50,034 → 50,082 | 11/20/17 → 11/20/19 | 0 / 0 / 0 |
| Challenge | 0.70/0.95 → 0.70/1.15 | 2.04/2.34 → 1.96/2.23 | 31 → 31 | 50,698 → 50,746 | 14/20/17 → 14/20/19 | 0 / 0 / 0 |
| Bonus | 0.70/0.95 → 0.70/1.10 | 1.67/1.90 → 1.65/1.89 | 37 → 37 | 50,086 → 50,134 | 10/20/17 → 10/20/19 | 0 / 0 / 0 |
| FINALE | 0.70/0.95 → 1.10/1.60 | 2.16/2.43 → 2.12/2.35 | 68 → 90 | 92,346 → 101,514 | 26/20/17 → 37/20/21 | 6 / 38 / 23 |
| Cruise | 1.20/1.65 → 1.35/2.00 | 2.18/2.42 → 2.13/2.35 | 85 → 99 | 98,006 → 119,246 | 35/20/18 → 42/20/21 | 11 / 41 / 23 |
| Boost | 1.15/1.45 → 1.20/1.75 | 2.25/4.52 → 2.15/2.55¹ | 85 → 99 | 98,006 → 119,246 | 35/20/18 → 42/20/21 | 11 / 41 / 23 |
| Sightseeing | 1.00/1.40 → 1.20/1.80 | 2.25/2.56 → 2.07/2.30 | 56 → 76 | 69,770 → 73,854 | 20/20/18 → 30/20/21 | 4 / 34 / 16 |

¹ One capture at each marked scene had a GPU P95 spike: 14.43 ms in A1 INTRO (other A1 run 2.31), 13.44 ms in A0 B (other A0 run 1.01), 6.41 ms in A0 Boost (other A0 run 2.62). The table retains them.

The focused repeats put GPU P95 at **2.28 → 2.42 ms** in INTRO, **2.09 → 2.35 ms** in A, **1.00 → 1.06 ms** in B Low, **2.14 → 2.20 ms** in BUILD, **2.10 → 2.08 ms** in DROP and **2.40 → 2.69 ms** in Boost. None reproduced a large sustained spike. A and Boost were about 12% slower in those repeats (+0.26 and +0.29 ms); the full sweep was faster in A and had a noisy A0 Boost sample. Additional assembly batches raised CPU P95 by up to 1.05 ms in the sweep. These are sampled render costs, not a device-wide FPS guarantee.

Each sample had zero instance overflow. In this sweep A1 reached 11 visible assemblies, 41 visible lamps and 23 visible lamp groups. Instance capacity is derived per kind from the planned sliding window and rounded up, not from whole-song counts; junctions keep the five original meshes. Texture counts did not rise. Measured ELSEWHERE shell chunk construction (15 samples per run) averaged **5.55/12.90 → 5.65/10.05 ms** (P50/P95); streaming tests observed eviction and disposal rather than retaining off-screen chunks. Debug had two WebGL contexts before opening the optional live scene on both builds; 31 → 29 static previews and roughly **1.00 → 0.82 s** to ready in the single sampled load.

The shader lifecycle test created and deleted 158 handles. Repeated ELSEWHERE/other-volume cycles returned to the same 38 geometries, 22 textures and 16 programs in the mixed-gate sample. Runtime and Debug both rebuilt the fixed scenery after context restoration.

## Regression and remaining checks

- Strict TypeScript and SSG passed. `npm test`: 153 Vitest and 57 Chromium tests, including the four-volume game loops, sightseeing routes, pickups, branch geometry, world-space gate/collision and GPU glass checks. `npm run test:release`: 6 passed.
- Visual, native GPU and resource comparisons: 7 Playwright cases and two focused repeats passed. Compatibility subset: 20 cases across Chromium, Firefox, WebKit and both mobile profiles; includes the shared Debug renderer, gate shader parity, real context loss and restoration, and four-volume startup.
- Audio subset: 16 cases completed. Chromium and Firefox activated sound and exercised recovery. Audible WebKit is **BLOCKED** in this WinCairo build (no AudioContext; silent mode tested); Firefox offline suspend/resume is **BLOCKED** by the available OfflineAudioContext API, with its live path verified.
- Manual checks: judge local lamp brightness and opening readability on the user's display at normal Boost and in Sightseeing; no physical mobile or calibrated-display verdict from these runs.
