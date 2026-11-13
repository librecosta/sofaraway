# D0-B3-A1-F4 — Impossible and local records validation

Baseline `c116ff02e3c5b63682b830f4c4b34e5b28acb295`. See the [F4 contract](../contracts/D0-B3-A1-F4-impossible-local-records.md).

## Gameplay

| Main section | Hard | Impossible |
| --- | ---: | ---: |
| INTRO | 0 | 0 |
| A | 20 | 23 |
| B | 16 | 20 |
| BUILD | 11 | 16 |
| DROP | 41 | 56 |
| BREAK | 6 | 6 |
| A2 | 19 | 25 |
| FINALE | 28 | 38 |
| Total | 141 | 184 |

Main, Challenge and Bonus contribute 11, 17 and 24 junction gates, yielding full chart totals of 184, 190 and 197. Their all-CLEAN Boost gate ceilings at the combo cap are 25,245, 78,030 and 35,802 points, excluding pickups and flight distance. Difficulty applies one life, a 3.4 base score multiplier, a 10,000-point Lumen and speeds of 27.6 at start, 39.1 at maximum cruise and 56.695 at maximum Boost.

Eighteen real steering-model runs covered the three routes in both side layouts under cruise, sustained Boost and a mixed strategy with 150 ms reaction time. All cleared the main chart with original collisions, then passed every encountered Encore gate. Sustained Boost reached all 36 for 10,800 points. Seed 0 Main placed them at 10,968.82–14,474.37. The first and final Encore gates arrived at 128.13 s and 189.96 s. Afterglow started at 192.08 s and lasted about 17.92 s. The Standard path ends at 16,260.50, with the Main Boost finish at 15,610.50. Cruise encountered 10 Encore gates and the mixed strategy encountered 28. Sightseeing kept five lives, one-third speed and its light-only extension.

The S-curve retains its peak curvature of 0.01688914 units⁻¹. Maximum centerline yaw is 32.90°/s at Normal cruise, 37.84°/s at Impossible cruise and 54.86°/s at Impossible Boost. The higher yaw follows directly from the speed increase. Physical-display comfort during dense steering remains for manual playtest.

## Records and UI

The versioned browser record separates all 13 Standard volume/difficulty pairs and four Sightseeing Last Visits. The old global key remains untouched. The tests cover failed and abandoned runs, score and Encore isolation, recovery eligibility, diagnostic and harness exclusion, refresh, selection changes, malformed data and unavailable storage. The menu shows the selected record at desktop, narrow portrait and short landscape sizes. End Sequence Studio directly previews the dense sections, the three routes, Encore gates 1/18/36, Afterglow and the Impossible results layout.

## Performance and regression

Chrome 157 on Windows, integrated AMD Radeon via ANGLE D3D11, High quality at 960×540 and DPR 1. Each arm captured 240 frames and 10 asynchronous GPU queries per scene in baseline, candidate, candidate, baseline order. Entries show the median of two percentile measurements in milliseconds. The baseline is Hard at matching BUILD, DROP and FINALE stations. The final Encore and Afterglow rows compare the respective plans. Studio flight compares the original gameplay harness with the new inspection adapter and its Impossible speed. Preview counts are staged gates and mesh counts are visible glass at the sample.

| Scene | CPU P95 | GPU P50 / P95 | Draw calls | Triangles | Geometry / texture / programs | Preview / meshes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BUILD | 1.75 → 1.35 | 2.02 / 2.80 → 1.89 / 2.71 | 57 → 60 | 69,114 → 69,630 | 20/18/14 → 21/18/14 | 5/4 → 8/7 |
| DROP | 2.45 → 1.90 | 2.11 / 2.39 → 2.02 / 2.59 | 56 → 58 | 68,814 → 69,478 | 22/18/14 → 22/18/14 | 6/5 → 8/7 |
| FINALE | 2.35 → 1.40 | 2.14 / 2.56 → 2.02 / 2.26 | 56 → 58 | 68,486 → 69,150 | 21/18/14 → 21/18/14 | 6/5 → 8/7 |
| Final Encore | 2.85 → 1.50 | 2.10 / 2.77 → 2.07 / 2.28 | 51 → 50 | 67,378 → 67,310 | 18/18/14 → 17/18/14 | 1/1 → 1/1 |
| Afterglow | 3.15 → 1.50 | 2.03 / 2.78 → 2.01 / 2.44 | 51 → 51 | 67,374 → 67,366 | 17/18/14 → 17/18/14 | 0/0 → 0/0 |
| Studio flight | 3.40 → 1.45 | 2.08 / 2.57 → 2.08 / 2.42 | 51 → 51 | 67,634 → 67,634 | 25/18/14 → 25/18/14 | 2/2 → 2/2 |

The sampled path retains 105,960 bytes of numeric data in both builds. Median path setup was 1.95 → 2.30 ms and median run setup 1.70 → 1.90 ms. Studio inspection setup averaged 1.55 ms. Streaming retained at most four tunnel chunks, two sampled Encore meshes and the shared glass programs. Repeated prewarm released all 138 compiled shader handles. Context restore, menu return, retry and switching volumes passed their lifecycle checks.

TypeScript, 176 unit tests, 67 browser tests, six static release checks and four stability checks passed. The original soundtrack clock completed Normal cruise, Normal Boost and Impossible Boost at 210 s with 1,792 scheduled steps and the white fade. Impossible Boost cleared 184 main gates plus 36 Encore gates with zero missed audio steps. DRIFT, DESCENT and ORBIT matched the baseline fixed-time pixels, and their Easy, Normal and Hard full-run collision and score tests passed.
