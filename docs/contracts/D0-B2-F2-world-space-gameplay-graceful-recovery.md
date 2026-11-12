# D0-B2-F2 — World-space gameplay and graceful recovery

This decision replaces beat-locked gate collision and pause-on-late-scheduler behavior. The implementation baseline was `9d8d4629bb7c22d1f2480939fb42c37c5403f058`. See the [validation report](../audits/D0-B2-F2-validation-report.md) for the comparison and test evidence.

## Reference trajectory

Song time `t` defines `b = t × BPM / 60`, which drives music, lighting, sections and the ending. The main-path station `u` places world geometry. The player's travelled arc length `s` determines when events occur.

The full Normal chart is the reference, with Main used for the ELSEWHERE branch. A deterministic table integrates speed at 60 Hz from initial speed `24` and station `4200`. For the number `N` of reference gates before a step, use target `24 + min(0.22 × N, 10)` and update speed with response `min(1, 1.6 × dt)` before integrating distance. Interpolate between adjacent entries for any authored beat. Sightseeing uses `4200 + (S_ref(b) − 4200) / 3` and five lives.

For actual travel, the count `N_space(u)` is the number of reference stations passed. The target is `modeScale × [24 + min(0.22 × N_space(u), 10)] × boost`. The scale is `1` in Standard and `1/3` in Sightseeing. Boost uses a `1.45` multiplier and response `4`, with response `1.6` at cruise. Integrate `s ← s + v × dt` after the speed update. Score, successful crossings, additional branch gates and pickups do not determine acceleration. [`reference-track.ts`](../../app/game/core/reference-track.ts) defines the concrete values.

## Spatial events

Fix gate positions at run start. Map authored beat to `worldStation = S_mode(b)` and then to `routeStation = L_route(worldStation)`. Use the same path and station for rendering and collision. For each step, process all crossings in distance order over `s0 < station ≤ s1`. With `α = (station − s0) / (s1 − s0)`, interpolate local steering coordinates and call the existing `canPass`. Real crossing time `t0 + α × dt` anchors the 1.4-second invulnerability window. Preview, fade, culling, auto-align and focus use spatial distance.

The branch's authored beats define fixed preview, split, route and rejoin stations. Lock the route from the interpolated lateral position at the split. The side paths are `P±(u) = P0(u) ± w(u)R0(u)`, with `w = 10.5 × E(a) × [1 − E(c)]` and `E(x) = 6x⁵ − 15x⁴ + 10x³`. Here `a` and `c` are clamped distances normalized across the opening and merge windows. Precompute the arc map at intervals of at most 0.25 world units, invert it for camera travel and retain each side's length offset after the merge. [`BranchPath`](../../app/game/graphics/branch-path.ts) defines the mode-specific windows. The pickup uses the fixed station derived from beat `306.66`, with local center `(0, 1)` and radius `0.7`.

The song duration remains the run's time limit. Early clears can keep flying. Unreached gates yield neither hits nor points. Results distinguish planned, encountered, passed, unreached and neutralized gates, with accuracy `passed / planned`. A technical neutralization carries no reward or penalty and leaves Combo, Shield and Resonance untouched. Sightseeing and Standard runs with a neutralized gate are ineligible to update the Standard best score.

## Timeline and recovery

Use one monotonic run timeline for simulation and audio anchoring. Account for the 60 ms start lead and freeze the timeline during deliberate pause, background suspension and graphics interruption. Keep the scheduling grid `anchor + step × 15 / BPM`. Skip expired events after a stall, continue future events on the same grid and avoid replaying notes that already started. Try to recover interrupted audio at the current offset. If the attempt fails, continue silently and offer a gesture to restore playback.

The simulation can process up to 12 fixed steps per frame and carries the remaining debt forward. It may skip draws while catching up. A confirmed unobservable window around 150 ms or longer can neutralize its affected gates. Longer backlogs still drain in batches. WebGL loss suspends drawing, retains the run and attempts restoration. If graphics recovery fails, surface the error to the player.

Validate fixed world coordinates, earlier arrivals with Boost, all branch layouts and play modes, CPU/GPU opening parity, audio and lifecycle recovery, score isolation and static build. Keep the four soundtracks and the existing gate geometry.
