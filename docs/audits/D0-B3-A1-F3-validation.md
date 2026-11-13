# D0-B3-A1-F3 — Encore and Afterglow validation

Comparison baseline is `a6f78f4820d85c57021aa27045cb6d211e0064a7`. See the [implementation contract](../contracts/D0-B3-A1-F3-encore-afterglow.md) for geometry, scoring and ownership.

## Gameplay and space

Normal Main with seed 0 ends its main chart at station 10,828.82. The 24 Encore gates start at 10,968.82 and end at 13,269.64. Each shape appears eight times. Sustained Boost reaches the last main gate at 144.49 s, the first Encore gate at 147.33 s and the final Encore gate at 193.99 s. The 120-unit exit interval leads into Afterglow at station 13,389.64, reached at 196.43 s. That leaves 13.57 s of Afterglow before the 210-second song ends in Closing. Standard's light range ends at station 14,130.70, with the Main route ending the song at 14,058.70 under sustained Boost.

At cruise, Main reaches its last main gate at 209.49 s and sees the closing light cue. With Boost from beat 205, it reaches 17 Encore gates and can earn 5,100 bonus points. Sustained Boost can earn 7,200 for 24 CLEAN passes. Tests covered both branch permutations, the exact arc conversion, all eight Iris directions with a 150 ms keyboard reaction delay, multi-gate sweeps, fatal main hits, and mixed pass, miss and recovery outcomes. The original main score, grade and Best Score basis are independent of the bonus. Sightseeing reaches the light-only extension at station 6,442.23 under sustained Boost at about 146.48 s. Its five lives and one-third speed remain in force.

The two Chrome audio-clock runs each processed all 1,792 soundtrack steps and ended at 210.00 s. Cruise kept the reference 105,326 main points and 141/141 main gates. Holding Shift reached Afterglow at the 196.62 s HUD update, earned 7,200 bonus points and saved 141,030 as the main Best Score. The audio scheduler reported zero missed steps in the Boost run.

## Performance

Chrome 157, ANGLE D3D11 on integrated AMD Radeon graphics, High quality at 960×540 and DPR 1. `@outro-perf` alternated baseline, candidate, candidate, baseline at the same world stations. Each arm sampled 240 CPU frames and 10 asynchronous GPU frame queries per scene. The table uses the median of each pair of percentile measurements in milliseconds. The detached reference harness accepted the same station and motion inputs using its existing game scene. Studio rows compare the new inspection adapter with that scene, including the normal render work. The Studio flight begins with its independently selected music beat.

| Scene | CPU P95 | GPU P50 / P95 | Draws | Triangles | Geometry / texture / programs | Visible gate meshes | Atlas instances |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Main last | 0.85 → 0.80 | 1.80 / 1.91 → 1.71 / 2.15 | 50 → 51 | 67,538 → 67,878 | 17/18/14 → 18/18/14 | 1 → 2 | 0 |
| Encore entry | 0.80 → 0.75 | 1.72 / 2.08 → 1.67 / 1.83 | 49 → 51 | 67,214 → 67,650 | 16/18/14 → 18/18/14 | 0 → 2 | 0 |
| Encore middle | 0.65 → 0.65 | 1.70 / 2.20 → 1.71 / 2.19 | 49 → 51 | 67,214 → 67,650 | 16/18/14 → 18/18/14 | 0 → 2 | 0 |
| Encore final | 0.80 → 0.65 | 1.72 / 2.22 → 1.76 / 2.60 | 49 → 51 | 67,214 → 67,378 | 16/18/14 → 18/18/14 | 0 → 1 | 34 |
| Afterglow | 0.70 → 0.85 | 1.70 / 2.54 → 1.66 / 2.21 | 49 → 51 | 67,214 → 67,374 | 16/18/14 → 17/18/14 | 0 → 0 | 80 |
| Sustained Boost | 0.60 → 0.70 | 1.66 / 2.52 → 1.73 / 1.98 | 49 → 51 | 67,214 → 67,406 | 21/18/14 → 24/18/14 | 0 → 2 | 0 |
| Sightseeing | 0.60 → 0.60 | 1.70 / 2.58 → 1.69 / 2.51 | 49 → 52 | 67,214 → 67,410 | 16/18/14 → 17/18/14 | 0 → 0 | 98 |
| Studio seek | 0.50 → 0.60 | 1.63 / 2.43 → 1.69 / 2.09 | 49 → 51 | 67,214 → 67,378 | 16/18/14 → 18/18/14 | 0 → 1 | 34 |
| Studio flight | 0.60 → 0.60 | 1.64 / 2.43 → 1.66 / 1.76 | 49 → 51 | 67,214 → 67,634 | 21/18/14 → 25/18/14 | 0 → 2 | 0 |

The path retained 105,960 bytes of numeric data in both builds. Median path construction was 1.30 → 1.20 ms. Run setup was 0.90 → 0.95 ms, with a warm Encore plan taking 0.005 ms and a Studio inspection 0.90 ms. Tunnel streaming held four chunks. The median per-scene chunk P95 was 4.35 ms in both builds, with a highest observed P95 of 7.40 → 7.90 ms. Retry reproduced the initial resource counts after context recovery, switching volumes removed Encore meshes, and closing Studio released its context. Repeated warmup released all 138 compiled shader handles.

## Visual review and follow-up

The live ending at `/debug/#outro` exposes the last main gate, Transition, Encore gates 1, 12 and 24, Afterglow entry and peak, and Music End. The same page previews all four results layouts. Browser checks exercise independent position and beat, seed round trips, both speeds, one-context recovery, release on close, and the results fallback without WebGL2.

Type checking, 168 unit tests, 60 main browser tests, six static release checks, four stability checks and 15 focused compatibility checks passed. The compatibility checks exercised actual GPU openings and context restoration in Chrome, Firefox and WebKit, including two emulated mobile profiles. The Windows WebKit builds exercised the explicit silent audio fallback. Fixed-time frames for DRIFT, DESCENT and ORBIT matched the reference pixel for pixel. Their real audio-clock runs also matched the original durations, gate totals and main scores. DRIFT Sightseeing completed its original track with five lives.

Check the perceived speed of the soft light transitions and the readability of the last Iris on a dark physical display. The browser captures and timing probes measure rendered frames and the software audio clock.
