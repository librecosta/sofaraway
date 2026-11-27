# D0-B3-A1-F4 — Impossible Difficulty & Local Records

Impossible is the fourth Standard difficulty in ELSEWHERE. DRIFT, DESCENT and ORBIT accept Easy, Normal and Hard. Unsupported selections resolve to Normal on volume changes and in diagnostic captures. Sightseeing retains its own chart and Normal reference, and switching back to Standard restores the eligible difficulty selection.

## Speed and chart

The run starts at `24 × 1.15 = 27.6` units/s. The target is `1.15 × (24 + min(0.22 × N_ref, 10)) × B`, where `B` is 1 at cruise and 1.45 during Boost. The existing damping and fixed-step reference counter still apply. The maximum targets are 39.1 and 56.695 units/s. The soundtrack ends at 448 beats, 128 BPM and 210 seconds.

The [authored insertion table](../../app/game/core/impossible-chart.ts) adds beat midpoints between existing Hard anchors. Station conversion still uses the original `ReferenceTrack`. Hard beats, stations, types, sectors and axes are preserved, including on Main and Challenge. The inserts use fixed authored openings and leave the Hard random sequence alone. Pickup, branch layout and Encore retain their independent run-seed streams. INTRO and BREAK retain their original density. The keyboard regression tests use the live steering, damping and swept collision with 150 ms of reaction time.

Inside the junction, Main uses 11 gates, Challenge 17 and Bonus 24. Main remains centered. The side assignments use the existing run seed, and each selected route judges crossings with its real branch arc length. Gate, CLEAN, combo, route, Boost and Resonance bonuses still use the shared formula, with base multiplier 3.4. Impossible starts with one life and Lumen awards 10,000 points. Shield and Resonance retain their original behavior.

## Encore and Afterglow

Impossible extends the existing indexed Encore plan to 36 gates, with 12 of each of the three glass shapes. The first 24 are identical for the same seed. The initial 140-unit gap, [95, 105) spacing and 120-unit exit interval still apply. Encore misses preserve lives. Bonus remains independent of the main score and caps at 10,800. The fixed-step full-Boost prediction uses the Impossible speed factor. The shared Standard path extends its final straight to the resulting finish station plus 650 units. The original corridor geometry, branch, other mode-specific bounds and Standard 24-gate plans keep their stations. Afterglow keeps the four F3 light stages, and the white fade follows the final 12 beats at every speed.

## Local records

`sofaraway.records.v1` stores `version: 1`, `standard[volume][difficulty] = {best, last}` and `sightseeing[volume] = {last}`. Last includes the main `score`, outcome and optional Encore bonus and recovery flag. A completed live run updates Last once on entering Results, including TERMINATED runs. The menu displays Standard Last as main score plus Encore bonus. Standard Best compares that same total and excludes recoveries that neutralize a main or Encore crossing. Existing best values remain valid as a floor. The stored Last run can raise that floor when it contains an eligible Encore bonus. Bonuses from older runs whose details were overwritten are unavailable. Sightseeing saves Last Visit. Exiting early, diagnostic settings and test/Studio previews leave records untouched. The legacy global `sofaraway.best` key stays in storage with its original meaning and supplies no new score. Parsing validates version, record keys, nonnegative safe integer scores and outcomes. Browser storage failures leave the game playable, with session records held in memory.

The menu shows Best and Last for the current selection. Results displays the Impossible label and a New Best cue on eligible improvements. End Sequence Studio previews Normal and Impossible at the same authored geometry, with BUILD, DROP, FINALE and each route accessible directly. Encore presets select the first, middle and last gate from the active plan. The Studio uses the production results component and owns a single live preview context.
