# D0-B3-A1-F2 — ELSEWHERE validation

The comparison baseline is `d98cbcaf5d720258f2d6192e71e82ef62acf0929`. The [contract](../contracts/D0-B3-A1-F2-long-corridor-lighting-s-curve.md) defines the station mapping and mounting rules.

## Composition and geometry

| Installation | Reference beats | Standard length | Sightseeing length |
| --- | ---: | ---: | ---: |
| Pure Frame, opening | 0–16 | 180.00 | 60.00 |
| Helical Wash | 24–72 | 580.46 | 193.49 |
| Staggered Cells | 104–152 | 679.46 | 226.49 |
| Triple Helix | 160–192 | 496.31 | 165.44 |
| Pure Frame, S-curve | 208–248 | 637.50 | 212.50 |
| Connected Flow | 248–280 | 510.00 | 170.00 |
| Pure Frame, approach | 288–320 | 510.00 | 170.00 |
| Branch and rejoin chapter | 320–384 | 1,020.00 | 340.00 |
| Raked Bands | 392–432 | 637.50 | 212.50 |

Five installations occupy uninterrupted straights. The branch approach retains its original centerline shape from reference beats 310–356, transformed as a rigid piece to meet the new approach. The split and rejoin stations and all three route arc mappings match the baseline. The tunnel samples the exact S endpoints while preserving the global structural ring grid.

| Mode | S-curve stations | Amplitude | Solved depth | Peak lateral displacement | Peak curvature | Max cruise / Boost yaw |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Standard | 7021.191667–7658.691667 | 101.1170 | 558.7485 | ±65.6774 | 0.01688914 | 32.90°/s / 47.71°/s |
| Sightseeing | 5140.397222–5352.897222 | 33.7057 | 186.2495 | ±21.8925 | 0.05066741 | 32.90°/s / 47.71°/s |

The curve lengths were checked independently with an 8,192-chord measurement. The final amplitude adds 12.00°/s to the preceding Boost yaw and brings the heading to 48.67° from the entry tangent. Minimum radius is 59.21 units in Standard and 19.74 in Sightseeing. The 60, 120 and 144 Hz runs converged on the same stations and results. The fixed-step simulation and live renderer use the same path for each mode. The browser checked position and normal alignment through the S for all three gate types. CPU/GPU opening checks, all three pickups, boosted and unboosted crossings, all three branches and the original song duration passed in the gameplay suite.

The runtime and Debug now omit the overhead kit, wall equipment, placement plans and shell cutbacks. The M0 shell still uses its existing panel, brace and floor maps. Utility Polymer remains available in the material lab and no longer loads in the game scene. The new lenses reuse one quad and a shared material. Their fixed batches move through the visibility window and dispose with the scene.

## Regression

Node 24.22.1 passed `npm run typecheck`, `npm test` with 161 unit and 57 browser tests, and `npm run test:release` with six release tests. The browser suite covers shader and CPU openings, both run modes, retry, switching volumes, WebGL context restoration, and the live Debug preview.

Twenty focused compatibility checks covered Chromium, Firefox and WebKit, including the mobile profiles, before the final amplitude adjustment. The Windows WebKit profiles exercised explicit silent transport because their builds did not expose `AudioContext`.

The real-audio ELSEWHERE run finished at beat 448 after 210 seconds. It passed 141 of 141 gates on Main with a score of 105,326. The scheduler delivered all 1,792 steps with zero missed steps, audio resumes or silent fallbacks.

## Performance

The comparison used Windows 10, a Ryzen 7 5800H, Chrome 157.0.8103.39 and the integrated AMD Radeon GPU through ANGLE D3D11. Baseline and candidate used 960 × 540 at DPR 1, High quality and the same fixed seed. The order was baseline, candidate, candidate, baseline. Each arm drew 240 frames per scene and collected ten asynchronous GPU samples. The Boost cases used the same reference stations with Boost held from the start. Both harnesses included matching path construction and chunk warmup probes. The reference production bundle came directly from the baseline commit.

Percentiles below average the two arms per build. Times are in milliseconds. Fixture counts are enabled instance pieces in the visibility window, including upcoming installations and pieces that the frustum or fog can hide.

| View | CPU P95 | GPU P50 / P95 | Draws | Triangles | Geometries / Textures / Programs | Fixtures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Pure Frame | 1.85 → 1.45 | 1.94 / 2.36 → 1.84 / 2.10 | 55 → 53 | 69,342 → 68,462 | 20/20/17 → 19/18/14 | 0 → 36 |
| Helical Wash | 1.45 → 1.40 | 2.01 / 2.42 → 2.02 / 2.29 | 55 → 57 | 69,638 → 69,270 | 20/20/17 → 20/18/14 | 10 → 108 |
| Helical Wash, Boost | 1.85 → 1.10 | 1.80 / 1.99 → 1.77 / 2.03 | 65 → 56 | 74,006 → 68,958 | 24/20/17 → 19/18/14 | 10 → 80 |
| Staggered Cells | 1.60 → 1.15 | 1.90 / 4.19 → 1.82 / 2.08 | 50 → 56 | 51,734 → 68,150 | 19/20/17 → 19/18/14 | 0 → 80 |
| Triple Helix | 1.60 → 1.05 | 1.83 / 2.12 → 1.79 / 1.98 | 45 → 57 | 47,130 → 69,186 | 17/20/17 → 20/18/14 | 8 → 188 |
| Connected Flow | 1.60 → 0.95 | 2.32 / 2.69 → 2.05 / 2.38 | 67 → 58 | 80,342 → 69,170 | 28/20/17 → 23/18/14 | 0 → 210 |
| Raked Bands | 1.60 → 1.00 | 2.01 / 2.46 → 1.78 / 2.00 | 66 → 57 | 71,482 → 68,534 | 27/20/17 → 22/18/14 | 0 → 84 |
| Raked Bands, Boost | 1.60 → 0.95 | 2.04 / 2.14 → 1.76 / 1.91 | 67 → 59 | 71,822 → 68,918 | 27/20/17 → 22/18/14 | 0 → 84 |
| S-curve, entry | 1.50 → 0.90 | 2.32 / 2.49 → 2.01 / 2.28 | 52 → 54 | 52,138 → 68,650 | 21/20/17 → 20/18/14 | 0 → 0 |
| S-curve, midpoint | 1.55 → 1.00 | 2.06 / 2.14 → 1.76 / 6.37 | 81 → 55 | 102,926 → 68,974 | 33/20/17 → 22/18/14 | 0 → 0 |
| S-curve, Boost | 1.70 → 0.95 | 1.95 / 2.16 → 1.82 / 1.90 | 81 → 55 | 102,926 → 68,974 | 33/20/17 → 22/18/14 | 0 → 0 |
| Sightseeing, wash | 1.30 → 0.95 | 1.75 / 2.10 → 1.96 / 2.10 | 48 → 52 | 50,458 → 68,686 | 18/20/17 → 18/18/14 | 8 → 54 |
| Sightseeing, helix | 1.50 → 1.00 | 1.89 / 2.40 → 1.83 / 2.54 | 63 → 54 | 75,142 → 69,532 | 23/20/17 → 18/18/14 | 8 → 67 |
| Sightseeing, S-curve | 1.80 → 1.05 | 1.90 / 2.20 → 1.83 / 2.08 | 63 → 54 | 78,690 → 68,902 | 24/20/17 → 19/18/14 | 0 → 114 |
| Branch, approach | 1.10 → 1.30 | 1.54 / 1.87 → 1.55 / 1.84 | 26 → 26 | 28,942 → 28,942 | 15/23/15 → 15/21/13 | 0 → 0 |
| Branch, Main | 1.10 → 1.05 | 1.58 / 1.80 → 1.55 / 1.71 | 29 → 29 | 49,282 → 49,170 | 11/20/16 → 11/18/14 | 0 → 0 |
| Branch, Challenge | 0.85 → 0.85 | 1.81 / 2.17 → 1.73 / 1.93 | 17 → 17 | 27,434 → 27,434 | 9/20/15 → 9/18/13 | 0 → 0 |
| Branch, Bonus | 1.05 → 1.15 | 1.51 / 1.68 → 1.53 / 1.66 | 37 → 37 | 49,334 → 49,222 | 10/20/16 → 10/18/14 | 0 → 0 |

The S under Boost reduced CPU P95 from 1.70 to 0.95 ms and GPU P95 from 2.16 to 1.90 ms. Helical Wash under Boost added 0.04 ms at GPU P95. Raked Bands under Boost reduced GPU P95 by 0.23 ms.

The initial Staggered Cells baseline included a 6.34 ms full-frame GPU sample. The initial S midpoint candidate included a 10.84 ms sample, with 1.91 ms in its other arm. A focused repeat at 720 frames and 30 GPU samples per arm measured GPU P95 at 2.31 → 2.53 ms for Staggered Cells and 2.66 → 2.72 ms for the S midpoint. All samples in the repeat were below 3 ms.

Median path construction on the first capture went from 11.60 to 7.65 ms. Subsequent captures went from 1.85 to 1.60 ms. The baseline held 15,319 frames for either mode. The candidate retains 926 Standard or 335 Sightseeing frames, including the preserved branch range. The estimated payload of retained frame samples and the S-curve table went from 1,595,384 bytes to 105,960 or 44,496 bytes. This probe times path construction separately from lighting and renderer setup.

Each build constructed 110 chunks across the captures. Median per-capture chunk P95 was 6.40 → 6.95 ms, with a worst observation of 12.90 → 13.40 ms. Captures held three to four chunks. The candidate enabled up to four batches and 210 fixture pieces in these views. A station sweep checked the five-batch and 280-piece ceiling in both modes. Repeated volume prewarming released all 138 compiled shader handles, and the mixed-gate volume switch kept geometry, texture and program counts stable.

The Low-quality Sightseeing wash at beat 42 used 19 geometries, 16 textures, 12 programs, three chunks and 74 fixture pieces. A WebGL context restore and a retry returned to those same counts. Switching to the DRIFT menu left 12 geometries, nine textures, ten programs and four chunks.

## Visual review

Fixed captures were checked across the atlas, S, sustained Boost, both modes and the three branch routes. Helical Wash wraps the octagon as two broad ribbons. Raked Bands alternates short strips on both sidewalls. Connected Flow reads as a continuous line on each wall. Cells and Triple Helix use narrow cores with soft edges. Mean luma on the 0–255 scale was 12.28 → 19.49 for Helical Wash and 9.25 → 10.68 for Raked Bands. Under Boost it was 11.54 → 10.98 and 9.69 → 9.51 respectively, with zero pixels at luma 210 or above in either candidate frame. The S midpoint's mean luma was 33.71 → 33.36. The DRIFT, DESCENT and ORBIT canvas captures were byte-identical to the baseline.

On a dim display, review whether the narrow Triple Helix strands remain distinct behind approaching glass. Play the sharper S in Standard and Sightseeing, both at cruise and with sustained Boost. The 47.71°/s Boost peak exceeds the original comfort review threshold of 15°/s. Geometry and gate alignment passed, and comfort during active steering remains a manual playtest decision.
