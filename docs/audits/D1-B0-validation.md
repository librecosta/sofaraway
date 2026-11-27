# D1-B0 validation

Baseline `caa3f9307c1ae71ca2693628331f8b6c8b6721ba`. The GLASSHOUSE soundtrack, mix, transport and Dynamic Lights event source are unchanged. DAYBREAK remains 120 BPM, 288 beats and 144 seconds.

## Gameplay

| Standard route | Normal / Hard gates | Junction gates | Per-gate route multiplier |
| --- | ---: | ---: | ---: |
| Main | 120 | 15 | 1.00× |
| Challenge | 121 | 16 | 2.00× |
| Bonus | 131 | 26 | 0.65× |

The Main counts by chapter are 0 / 28 / 22 / 7 / 38 / 25 / 0. All 120 are anchored to a real kick, snare or fill onset. The canonical last station is 8469.87. On Main it crosses at 135.52 s at cruise and 93.47 s with sustained Boost. Keyboard-axis tests include a 150 ms response window and cover all three difficulties, two seeded side layouts, both off-center routes, late intermittent Boost and Sightseeing. The six gate openings use the same collision outlines and optical glass implementation.

The pickup is centered at beat 152. Tests collected Shield, Resonance and Lumen and exercised the shared pickup and recovery rules. Sightseeing retains five lives and one-third speed and clears 39 Main gates. The new `daybreak-gameplay` namespace round-trips alongside older entries.

For seeds 0 and 1, sustained Boost crosses 21 Encore gates on all three routes. The first station is 8770.06 and the final stations are 10372.99 and 10358.74. Main reaches Afterglow at 132.93 and 132.65 s, leaving 11.07 and 11.35 s. The planner reserves at least 10 s with route arc length accounted for. Cruise encounters no Encore in these cases, and intermittent Boost encounters a subset. Both cruise and sustained Boost reach full daylight at 144 s.

## World and preview

The Standard path covers 11970 units. Its Far Shell spans the playable course, from station 3990 through the safe buffer. The 210-unit Near and Far chunks share boundaries. The junction takes over both representations through the split and merge and keeps each cabin enclosed. Menu and Results were advanced to 5, 15 and 30 minutes. Results settles approximately nine units ahead of the ending or failure position. Restart and volume selection keep the same renderer lifecycle.

Open **End Sequence Studio** under `/debug/#outro`, open the live ending and choose DAYBREAK. The studio covers the authored sections, route choices and rejoin, pickup, reward gates, Afterglow, white cue and Results camera. World Continuity shows the retained Near/Far coverage and the results of the three accelerated time samples.

## Performance

Chrome 157, ANGLE AMD Radeon D3D11, 960×540 at DPR 1, Low quality. Frame times are milliseconds. The stability harness captures CPU callbacks and GPU timer queries. The branch and ending samples use 60 frames of local flight.

| Scene | CPU P95 | GPU P50 / P95 | Draw calls | Triangles | Geometry / texture / program |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline opening | 0.80 | 1.24 / 1.95 | 27 | 24280 | 21 / 9 / 10 |
| Candidate opening | 1.20 | 1.36 / 1.96 | 38 | 25652 | 35 / 8 / 12 |
| Branch entry | 1.10 | 1.29 / 1.31 | 37 | 17966 | 32 / 11 / 12 |
| Encore entry | 1.20 | 1.78 / 1.83 | 45 | 33812 | 43 / 8 / 12 |
| Afterglow | 1.00 | 1.16 / 1.28 | 31 | 24924 | 26 / 8 / 12 |

Menu CPU P95 was 0.90 ms on the baseline and 1.20 ms on the candidate. The Standard path's numeric storage changed from approximately 1.20 MiB to 25.6 KiB, excluding branch tables and JavaScript object overhead. The Far Shell retained 38 chunks and 284.5 KiB of geometry. The Encore flight sample built one detailed chunk, while the branch and Afterglow samples reused their initial detail. A direct world jump retired the old near geometry while preserving the Far Shell count. The comparison can be repeated with `STABILITY_REFERENCE_DIR` and the `@daybreak-perf` scenario.

## Verification

Typecheck passed. The main suite passed 204 unit tests and 92 browser tests, and release verification passed six tests. The browser suite includes rendered gate and cabin checks, the daylight ending at cruise and sustained Boost, world switches, context restoration and record isolation. The full DAYBREAK Web Audio run scheduled all 1152 steps with zero missed steps and passed all 120 gates. The real-audio Sightseeing and Dynamic Lights synchronization cases also passed. Performance was checked with the six-profile A0 suite and the DAYBREAK stability comparison above.

The detailed baseline comparison covers one desktop GPU. Visual comfort and scene readability on other hardware and touch devices remain for hands-on QA.
