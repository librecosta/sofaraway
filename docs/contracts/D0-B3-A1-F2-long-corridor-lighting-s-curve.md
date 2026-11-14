# D0-B3-A1-F2 — Long corridor lighting atlas and S-curve

Scope is VOL. I / ELSEWHERE. The comparison baseline is `d98cbcaf5d720258f2d6192e71e82ef62acf0929`. This replaces the installations and scenery layout from [A1-F1](D0-B3-A1-F1-architectural-order-rhythmic-color.md) and retains its Color Score, pulse and breath. The game remains under BSD-3-Clause.

## World stations

Build the [composition](../../app/game/core/corridor-composition.ts) and [lighting atlas](../../app/game/core/lighting-atlas.ts) before rendering the run. Each row occupies the half-open interval between `ReferenceTrack.station(startBeat, mode)` and `ReferenceTrack.station(endBeat, mode)`. Gaps use Pure Frame. Boost advances the camera through the fixed intervals sooner. Song time supplies hue and rhythm.

| Reference beats | Installation |
| --- | --- |
| 0–16 | Pure Frame with the existing rims and corner ribbons |
| 24–72 | Helical Wash with three broad, soft ribbons following the octagon |
| 104–152 | Staggered Cells with matching rectangular fixtures on the side faces, opposite diagonals alternating through four phases at 10.5-unit spacing |
| 160–192 | Triple Helix with three strands of 0.91 × 0.098 fixtures every 9 units |
| 208–248 | S-curve with Pure Frame |
| 248–280 | Connected Flow with two 0.077-unit wall lines following a fixed 60-unit sine wave |
| 288–320 | Pure Frame through the approach |
| 320–384 | Existing three-way branch and rejoin with their dedicated visuals |
| 392–432 | Raked Bands with mirrored 4–5.5-unit ribbons on the sidewalls every 10 units, alternating through four inclinations |

The tunnel keeps its octagon, structural ribs, panels, bevels and gussets. The old roof slots, beams, wall pockets and equipment are retired. The atlas uses the same octagon profile as the shell, with a mounting surface at 0.966 of the nominal profile just inside the 0.970 panel skin. Continuous strips share endpoints at each tessellation seam. The installation fades by world station at its ends using a quintic ease over up to 21 units in Standard and 14 in Sightseeing. Fixture dimensions and spacing are shared across modes.

Helical Wash anchors its first strand at the lower-left bevel and spaces the three strands evenly around the perimeter. Each strand follows `l = C × fract(l0 / C + (s - s0) / pitch + j / 3)` for `j = 0, 1, 2`, with a 1.42-unit soft profile and a pitch of 144 in Standard or 108 in Sightseeing. The wash dims across the center of the floor and ceiling. Wall tiles cover the swept footprint on each face. The shared shader evaluates the continuous circumferential falloff and zone envelope across their seams. Raked Bands mirror four inclinations across the sidewalls and fade at each end. Successive pairs arrive about 0.20 seconds apart at full Standard Boost. Motion comes from travel and perspective, with the existing subtle music response.

For a wall coordinate `l`, wrap by the circumference `C = 23.988225…`. Find the face whose cumulative edge interval contains `l`, then interpolate on that face. Its unit edge vector is the local tangent and its perpendicular points inward. Use the current PathFrame to map the mount to world space. For helix strand `j`, use `l = C × fract((s - s0) / pitch + j / 3)` with a pitch of 108 in Standard and 72 in Sightseeing. Split any short lamp that spans a corner at the exact face boundary. Both pieces meet at the vertex.

The main corridor uses one song-driven tone for the rims, glass, fog and installed fixtures. The opening and formerly teal phrases use pale blue. The junction uses route-local palettes that follow route identity when the side routes swap. Main cycles through pale white-blue, periwinkle and mint. Challenge cycles through muted rose and warm red. Bonus cycles through amber, yellow and yellow-green. Each hue and saturation transition takes eight beats. Connected Flow advances a shared brightness phase over four beats. Reduced motion freezes the brightness wave and suppresses the beat pulse while retaining the gradual hue and a steady light level. Debug can apply a muted second hue to one group of Staggered Cells or Connected Flow.

## Path and run ownership

Long installations occupy continuous straights. Shallow 46-radius bends fit in the gaps before the S. The branch uses a rigidly joined copy of the legacy centerline samples from reference beats 310 to 356. Its start, split, merge and per-side arc mapping retain their reference stations and lengths. The rejoined path continues into the final installation. The other volumes use the existing path generator.

The S uses `P(t) = P0 + F0 D t + R0 A f(t)` and `f(t) = sin(2πt) sin²(πt)`. Its lateral offset and its first two derivatives vanish at both endpoints. Solve `L = integral_0^1 hypot(D, A f'(t)) dt` for depth `D` by bisection with Simpson integration. Store a monotonic cumulative table over 1,024 cells and invert it by binary search. Evaluate position and tangent at that parameter and rebuild the orthogonal frame from the tangent and stable up direction. Preserve the exact segment endpoints in the shell sampling while leaving the structural ring grid fixed. The playtest setting uses `A = 101.117` in Standard and `A × Ltour / Lstandard` in Sightseeing. Both modes peak at 47.71°/s of path-induced yaw under sustained Boost. Check that peak in manual play before settling on a comfort target.

Simulation, Tunnel, camera, gate rendering, pickup and BranchPath share the same mode-specific Path. Mode changes prepare a new ELSEWHERE scene before flight. Retry and context restoration reuse the selected path. Gate openings, pickups, charts, score and recovery follow the [world-space gameplay contract](D0-B2-F2-world-space-gameplay-graceful-recovery.md). The S introduces no camera motion beyond the path and the existing player controls.

## Review

Keep the restrained lighting, readable glass and clear flight lane. Review both modes at fixed stations in [Debug](../../app/routes/debug.tsx), including entry, peaks, midpoint and exit of the S. The live previews reuse one renderer and the game scene. Compare GPU and CPU percentiles, draw counts, resource counts and chunk construction against the baseline under the same conditions. Batches use one shared quad and one material. The visibility window has a budget of five enabled batches and 280 instance pieces in either mode. Check the full run, the three routes, mode changes, retry, context recovery and the unaffected volumes before delivery.
