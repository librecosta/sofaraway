# D0-B3-A1-F3 — Encore & Afterglow Continuation

ELSEWHERE retains the original 128 BPM, 448 beats and 210-second soundtrack. [F2 world-space gameplay](D0-B2-F2-world-space-gameplay-graceful-recovery.md) and the [lighting atlas](D0-B3-A1-F2-long-corridor-lighting-s-curve.md) remain the basis of the run. The original comparison commit is `a6f78f4820d85c57021aa27045cb6d211e0064a7`. The project uses BSD-3-Clause.

## World stations and crossings

The [outro plan](../../app/game/core/encore.ts) starts at the highest world station in the run's active main chart. The common suffix supplies this station before the branch is selected. Standard generates 24 gates. The first is 140 units beyond the main gate, and each next gate is 95 units plus up to 10 units of deterministic spacing. Each of eight groups starts with an Iris and continues with a Square and a Diamond in seed-selected order. Iris sectors, spacing and group ordering use separate indexed draws derived from `ENCORE_STREAM`. Main chart, pickup and branch draws keep their own streams.

The plan's world stations are fixed for the run. At branch selection `BranchPath.arcAt` maps each gate onto the chosen route's travel distance. Rendering mounts the glass with the shared base `Path` after rejoin. Simulation consumes the last main event before Encore can be judged. Its independent cursor uses the same swept crossing interpolation, `canPass`, `lanePoint` and CLEAN radius. Recovery neutralizes an unobservable crossing, and the last audio tick caps the travel available for crossings. Future gates remain unjudged. The four spatial phases are Main, Transition, Encore and Afterglow. A fatal main hit still ends the run immediately.

## Bonus and results

An Encore pass awards 200 bonus points, with another 100 for CLEAN. A miss resets the Encore combo. A recovery crossing increments the separate neutralized count and preserves that combo. Both preserve the main streak, lives, Shield and Resonance. Main distance points continue to accrue. The result stores Encore alongside main accuracy, rank and gate totals. Best Score still compares only main points under the existing eligibility rules. The results panel shows Main Score, Encore Bonus, the display total and passed/encountered when the run actually encountered Encore gates.

## Light and streaming

Afterglow begins 120 units after the final Encore gate, or 45 units after the final main gate in Sightseeing. Sightseeing generates zero bonus gates. The reference full-Boost finish and 72 units of headroom set the bounded visual range. The existing path provides more than 430 units of additional streamed sightline. Release softens the structural rims, Flow uses Connected Flow, Luminous Passage uses Triple Helix, and Closing returns to the quiet octagon. The boundaries are at 14%, 45% and 74% of the Afterglow range. Standard fades use 21 units and Sightseeing fades use 14. The mode changes spacing and coverage while fixtures keep their physical dimensions.

The final 16 music beats ease the scenic intensity down to 72% on whichever stretch the player occupies. This replaces the ELSEWHERE finish flash. The hue score, breath, pulse, camera lens and soundtrack remain in place. The other volumes retain their finish behavior. The renderer stages only gates in the original visibility window and reuses `GateVisual`, `GateGeometries` and the glass shader. Near Afterglow it mounts bounded `CorridorLights` batches with the existing shader and shell. Retry, menu and volume changes release run-owned effects. A context restore redraws the same plan and progress.

## End Sequence Studio

`/debug/#outro` opens a live scene on demand. Select a world position by preset or relative distance from the last main gate, then independently choose a music beat. Seed, route, mode, view angle and quality are adjustable. `OutroInspection.state` supplies the same render-state fields as the live run, with the real plan, route arc and shared `Graphics`. Its neutral steering and chosen preview speed let the user isolate the space. Encore preset cameras start 22 units before the real gate. Music End starts at the reference full-Boost finish. Play 10s moves the camera along the selected route at cruise or Boost speed, advances the light score, and can reset to the start position. It runs without sound and without touching player state.

The four results previews use the production `ResultsScreen` with snapshots from isolated fixed-step runs. They stay accessible if WebGL2 is unavailable. Live presets share one context, restore the selected view and release the canvas resources on close or unmount.
