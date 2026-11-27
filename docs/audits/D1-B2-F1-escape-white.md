# D1-B2-F1 · DAYBREAK Escape White

The original fade dimmed the whole frame as the next Encore gate approached and restored the white level as soon as the crossing advanced the gate cursor. This affected the overlay, vignette and scene daylight together. At 60 Hz on baseline `284ec280`, second-half Boost on Hard Challenge crossed four gates between 138.32 and 143.26 s and raised the white signal by as much as 0.825 in a single tick. Repeated Boost on Impossible Bonus reached a 0.856 jump.

The cue still begins at beat 276. DAYBREAK caps the ambient rise at 0.12 while the next active gate is reachable before the cutoff, using the same maximum speed bound regardless of current Boost input. The simulation releases the final rise once, after the gate is crossed or the remaining distance makes a crossing impossible. The remaining rise has a 1.25 s minimum and can finish during the existing pre-Results transition. The song and scoring stop at beat 288. A gate at 143.99 s therefore remains readable through its crossing, and the visual peak can arrive after the song. The same progression drives the white overlay and vignette and feeds the sky, canopy and fog alongside the existing Afterglow lighting. Successful runs fade back to the cabin. Terminated runs skip Escape White.

| Chrome viewport and quality | Difficulty and route | Input | Gates during cue | Largest Playing white increase per tick |
| --- | --- | --- | ---: | ---: |
| 1920×1080 High, Dynamic Lights on | Impossible Bonus | Repeated Boost | 4 | 0.0104 |
| 1280×720 Auto, Dynamic Lights off | Hard Challenge | Boost from 72 s | 4 | 0.0176 |
| 960×540 Low, Dynamic Lights on | Normal Main | Boost from 138 s | 1 | 0.0146 |

The browser test renders each tick through the actual Runtime and samples the WebGL backbuffer, the sky uniform, CSS white opacity and the next gate distance. The largest crossing change was 0.050 of normalized sampled brightness after estimating the overlay's screen blend. Full viewport captures of the Hard Challenge run measured a maximum frame-to-frame change of 0.042 when crossing gates, a peak mean of 0.991 during white and a mean of 0.160 with the cabin visible in Results. Playing white and sky daylight never decreased. Gate approach kept opacity at or below 0.119 with the glass loaded. The transition reached 0.99 opacity and then faded through Results. Fixed-step steering tests also cover all four difficulties, cruise, continuous Boost, both late Boost strategies and repeated switching. The existing End Sequence Studio exposes the sky daylight alongside white opacity.

ELSEWHERE retains the original fade and Encore. No soundtrack, chart, collision rules, Encore plan, postprocessing settings or glass materials changed. The Audio Inspector regression compares PCM against the production synthesizer.

`npm run typecheck`, `npm test` (215 unit tests and 97 Chrome tests) and `npm run test:release` (6 Chrome tests) passed. Browser regressions include WebGL recovery, replay, and Sightseeing in all four volumes.
