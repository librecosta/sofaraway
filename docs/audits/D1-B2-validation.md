# D1-B2 · DAYBREAK Impossible

Compared with `a94c1658d95a2487de96f37a7f66385cf9b201f8`.

## Chart and scoring

| Section | Hard | Impossible | Added |
| --- | ---: | ---: | ---: |
| OPEN | 0 | 0 | 0 |
| GLIDE | 28 | 33 | 5 |
| LIFT | 22 | 28 | 6 |
| BREEZE | 7 | 7 | 0 |
| SUNBURST | 38 | 50 | 12 |
| RETURN | 25 | 29 | 4 |
| OUTRO | 0 | 0 | 0 |
| Main total | 120 | 147 | 27 |

Each addition uses a scheduled Kick, Snare or Fill from the production score. All Hard gates retain their beat, shape, opening and world station on every route. The added gates leave the reference progress and steering unchanged. The existing difficulty rules give Impossible one life, a 1.15× speed factor, a 3.4× gate-scoring multiplier and 10,000 points for Lumen. Initial speed is 27.6 and the cruise and Boost targets cap at 39.1 and 56.695.

| Route | Hard total | Impossible total | Impossible junction only |
| --- | ---: | ---: | ---: |
| Main | 120 | 147 | 17 |
| Challenge | 121 | 148 | 18 |
| Bonus | 131 | 156 | 26 |

The 60 Hz tests completed 36 runs using digital steering and a 150 ms reaction delay after each crossing. They cover four seeds, both side layouts, all three routes, cruise, continuous Boost and intermittent Boost. Every run cleared the full main chart with zero hits and an S rank. Tests check the arc mapping for every active gate, Lumen scoring and recovery-neutralized Encore. Center windows allow players to line up the next Crystal within the existing opening. Sightseeing remains a 39-gate Main tour at one-third speed with five lives and no Encore.

## Ending and continuity

The existing Encore planner budgets against the shortest station reached at the 10-second reserve across the three route arcs. Hard has 21 Encore gates in seeds 0 and 1, and Impossible has 34 for both. Continuous Boost reached the first Impossible Encore gate at 86.60–86.65 s and cleared the last at 133.14–133.24 s. Afterglow began at 133.88–133.98 s, leaving 10.02–10.12 s of the 144-second song. The tested last gate cleared before the Escape White cue at 138 s. Main accuracy and rank remain separate from Encore points.

The Standard corridor extends from 11,970 to 12,810 units using the shared maximum-distance bound. The longest simulated run reaches station 12,024.47, leaving 785.53 units of path. The existing Far Shell covers the full horizon and near chunks continue streaming. The End Sequence Studio at `/debug/#outro` previews the density, all routes, final Main gate, Encore, Afterglow, Escape White and Impossible results. Live browser snapshots check the extended ending and the normal route and world tests still run.

## Compatibility

`sofaraway.records.v1` adds `standard.daybreak-choreography.impossible`. The existing difficulty entries and earlier DAYBREAK namespaces remain readable. Recovery and total-score comparison retain their existing semantics. The menu keeps Impossible selected when switching between ELSEWHERE and DAYBREAK and falls back to Normal on DESCENT and ORBIT.

The DAYBREAK score, synthesizer, Dynamic Lights, cabin materials, Crystal openings and branch geometry are unchanged from baseline. The initial gameplay state, spatial gates, routes, pickup and Encore data matched baseline in 17 existing volume and mode combinations, including ELSEWHERE Impossible and its 36-gate Encore.

The browser exported 146 seconds of 44.1 kHz, 16-bit stereo from both builds, including the same two-second audio tail. The score, synthesizer and export build artifacts matched. The PCM comparison measured a maximum difference of two sample counts and 0.257 LSB RMS, within the baseline browser's own rerender variation. The Audio Inspector's production-mix null test and nine Chrome audio signal and lifecycle tests passed.

## Performance and verification

Chrome on AMD Radeon Direct3D 11, Low quality, 960×540 at DPR 1. Each SUNBURST sample starts at the same station and advances for 180 frames at its own Boost speed. Seven GPU timer samples were available per row. Resource counts come from the last frame.

| Sample | CPU P95 | GPU P95 | Draws | Triangles | Geometry / Texture / Shader programs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline Normal SUNBURST | 0.70 ms | 1.79 ms | 49 | 35,732 | 44 / 11 / 13 |
| Candidate Normal SUNBURST | 0.70 ms | 1.90 ms | 49 | 35,732 | 44 / 11 / 13 |
| Candidate Impossible SUNBURST | 0.80 ms | 1.79 ms | 47 | 28,128 | 45 / 11 / 13 |
| Candidate Impossible ending | 0.60 ms | 1.73 ms | 29 | 24,724 | 26 / 8 / 13 |

The dense sample starts with nine preview gates versus seven for Normal. The extended Far Shell grows from 38 to 42 chunks and from 291,320 to 324,280 bytes. The numeric path representation remains 26,216 bytes. Near streaming stayed within four chunks and all samples returned WebGL error zero.

`npm run typecheck`, `npm test` (210 unit and 94 browser tests), `npm run test:release` (six tests), `npm run test:perf` (six profiles) and the targeted DAYBREAK baseline stability comparison passed. User playtesting for the gameplay freeze is pending.
