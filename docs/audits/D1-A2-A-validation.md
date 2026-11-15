# D1-A2-A · Exterior Sky Foundation validation

Baseline `4cda7d14254acadf874bba7df64664dd37461f4b`. The previous DAYBREAK background used an 8×256 canvas gradient. The new exterior uses a world-aligned sky and cloud surface in a single draw. The sun is fixed at world direction `(0.264, 0.148, −0.953)`. The cloud crests reach at most `y = −14`, leaving 11.05 world units below the main cabin floor and more below the elevated branches.

## Real WebGL review

Chrome captures compared the baseline and replacement at matching course times. The forward view shows a brighter blue sky, a warm offset dawn glow and the original gate openings. BREEZE's side and horizon views show the cloud deck through the canopy. The elevated Cloud Sea view shows blue-grey troughs, warm crests and the fading far shell. The cabin naturally hides much of the low cloud deck at the neutral forward camera height. The gameplay camera and closed hull keep their existing geometry.

ELSEWHERE, DESCENT and ORBIT produced byte-identical PNGs at the same 36 s fixed-time capture in both builds.

The junction checks capture Main, Challenge and Bonus, seeded arrows, narrow viewports and Dynamic Lights on/off. Standard, Boost and Sightseeing at beat 192 produce the same atmosphere while covering different world positions. The exterior test restores the same cloud view after real context loss and checks the recovered frame, volume switches and closure of the preview context. Long-world tests cover the 5, 15 and 30 minute Menu and Results stations. The three late-Encore browser profiles still reach 0.99 overlay opacity and fade back to the cabin. Their highest 60 Hz white increment is 0.0177 and their sampled gate-crossing image change stays below 0.048 on a normalized scale.

Use `/debug/#outro`, select DAYBREAK and open the live view. The DAYBREAK Exterior controls pick seven chapter looks, five views and Low, Auto or High. The existing buttons show the three branches, Escape White, Menu and Results. The Environment section links to this live preview and keeps ORBIT's static starfield sample.

## Cost and follow-up

The sky draw runs after opaque cabin geometry. It is excluded from the focus-depth pass. One mipmapped 256×256 RGBA lookup replaces the old sky texture. The field allocates around 341 KiB of texture payload with mipmaps and one reusable 256 KiB CPU buffer. The volume disposes the texture, mesh and shader material on switch or teardown. Other volume render paths and DAYBREAK's score, gates, flight physics and end timing retain their baseline sources.

Paired production builds ran in the same Chrome session on AMD Radeon via ANGLE D3D11. The table shows median results from three alternating baseline/candidate pairs per profile and seven pairs for High. Frame times are browser animation intervals. Initialization uses the runtime's ready timing. The mobile row is Chrome emulation at device DPR 2 and render DPR 1.25.

| Viewport and quality | FPS before → after | Frame P95 (ms) | Init (ms) | Draw calls | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| 960×540 Low | 239.4 → 239.4 | 4.3 → 4.3 | 282 → 344 | 42 → 42 | 26,020 → 26,020 |
| 1280×720 Auto | 172.9 → 166.5 | 8.4 → 8.4 | 312 → 353 | 66 → 65 | 48,934 → 48,922 |
| 1920×1080 High | 62.3 → 82.7 | 21.0 → 16.6 | 363 → 331 | 66 → 65 | 48,934 → 48,922 |
| 393×720 mobile Auto | 240.0 → 239.4 | 4.3 → 4.3 | 285 → 260 | 66 → 65 | 48,934 → 48,922 |

The first High comparison had a slower candidate median and high run-to-run spread. The retest follows replacement of the sky's per-pixel trigonometric and power terms with smooth polynomial ramps. High P95 still varied between 12.6 and 21.2 ms on the candidate. All profiles held 37 geometries. Low stayed at 8 textures and 13 programs. The other profiles stayed at 10 textures and 15 programs. WebGL reported no errors in the paired runs. These measurements do not isolate GPU time or establish performance on physical phones. The production score, synthesizer and audio-export chunks are byte-identical to the baseline build.

Cloud tops use wide, soft banks in this foundation. The remaining visual review is how much of the cloud deck should read against the horizon in the normal forward view. A2-B reserves finer cloud layering, sparse cirrus and more directional canopy highlights for after that review.

`npm run typecheck`, `npm test` (217 unit and 99 browser tests), `npm run test:release` (6 browser tests) and `npm run test:perf` (6 profiles) passed.
