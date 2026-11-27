# D1-B1 Daybreak gate choreography and branch readability

Baseline `8964bfcafdabb9724386d8733abec9bfc3056fe8`.

## Gate score

| Standard route | Easy, Normal and Hard gates | Junction gates |
| --- | ---: | ---: |
| Main | 120 | 15 |
| Challenge | 121 | 16 |
| Bonus | 131 | 26 |

The 120 Main onset beats match B0 exactly. The shared reference integrator supplies world spacing for a steering filter at the maximum Boost speed. The filter allows 150 ms for reaction and checks the actual opening after camera damping, with a 0.13-unit margin on each coordinate. Kick steps carry the contour, snare responses turn it back and fills may span two neighboring sectors when the spacing allows. BREEZE has one Crystal and six center gates. SUNBURST visits all eight sectors. No two adjacent Crystal gates repeat a sector on the Standard charts. The 60 Hz tests use steering input with collision enabled and cover all Standard difficulties, two seeded branch layouts, every route, pickup, partial and full Encore, and the music-timed white ending. Sightseeing keeps its 39 Main gates, five lives and one-third speed.

At seed 0, sustained Boost on Hard with steering input produced 177,956 Main points on Main, 205,496 on Challenge and 181,034 on Bonus. Each run also earned 6,300 separate Encore points.

Crystal retains its shared octagonal hub and radial cuts. Eight selectable pane removals come from the same polygon data as collision. Crystal 45° was deliberately retired at the user's request in B0. The same fixed Crystal now includes its four cardinal opening positions. Vertical and Horizontal retain their existing center windows. The new DAYBREAK record ID is `daybreak-choreography`. Older IDs, including `daybreak-gameplay`, survive a read, update and reload.

## Junction review

`/debug/#outro` → **Open live ending** → **World** → **DAYBREAK**. Use **Branch Preview**, **Branch Entrance**, the three **Junction interiors** buttons and **Branch Rejoin**. The in-game hologram shares ELSEWHERE's glyphs, shader and after-post render stage. The selected route determines the left or right label from the run seed. The arrows sit below the playable opening and clear when the existing guide window ends. The production portrait capture and the desktop previews show the same label order.

The existing junction mesh batches carry cyan Main, rose Challenge and amber Bonus waist, floor and frame markers. The existing light rig adds a smoothly localized wall fill. The structural rails stay present with Dynamic Lights Off and respond to the production beat envelope when enabled. The canopy retains its clear panels. The junction reuses the existing light count, exposure and bloom.

At 1280×720 and High quality, fixed real-scene captures show the guide at beats 225 and 230, the three interiors at beat 240, and the merge at beat 258. Mean encoded RGB luma in the same lower-left wall region changed from 0.021 to 0.046 on Main, 0.020 to 0.029 on Challenge and 0.021 to 0.048 on Bonus. This screen-space sample includes nearby structural lighting. The fixed ELSEWHERE junction, DESCENT and ORBIT reference captures were pixel-identical to B0. Mobile visual review uses a 390 px browser viewport. Physical display and touch-device play remain for hands-on QA.

## Regression

Typecheck passed. `npm test` passed 205 unit and 93 browser tests. Release verification passed six tests. The seven focused Chromium Web Audio cases covered both full DAYBREAK modes, the live drum-to-light timing and all four volumes' offline scores. The six GLASSHOUSE stem sources, synth and timing files match B0. The audio inspector's existing mix comparison passed.

## Performance

Chrome 157, AMD Radeon via ANGLE D3D11, 960×540 at DPR 1 and Low quality. Times are milliseconds. The 180-frame junction samples each produced seven GPU timer results, so GPU percentiles describe the sample on this device.

| Scene | CPU P95 B0 → B1 | GPU P95 B0 → B1 | Draw calls B0 → B1 | Triangles B0 → B1 |
| --- | ---: | ---: | ---: | ---: |
| Opening | 0.90 → 1.00 | 1.63 → 1.82 | 38 → 38 | 25,652 → 25,652 |
| Branch entrance | 0.90 → 1.10 | 2.03 → 1.23 | 39 → 45 | 17,948 → 23,148 |
| Main interior | 0.90 → 1.10 | 2.07 → 2.16 | 42 → 42 | 26,042 → 28,758 |
| Challenge interior | 0.80 → 0.90 | 2.47 → 2.09 | 42 → 42 | 26,042 → 28,758 |
| Bonus interior | 1.00 → 0.90 | 2.68 → 1.92 | 42 → 42 | 26,042 → 28,758 |

The hologram program is already resident at Opening. Shader programs stay at 13 through the junction, up from 12 in B0. Textures are unchanged at eight in the interiors and eleven at the entrance. The six extra entrance draws are the three arrows and three labels. Interior rails share the existing mesh batch. The focused checks passed with stable chunk limits and zero WebGL errors. The existing six-profile browser performance and restart check also passed.
