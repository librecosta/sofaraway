# D1-A2-B · Cloudscape & Atmospheric Polish validation

Baseline `9d14e35a10350ae7341c30123b0a44471b4d936f`.

## Real WebGL review

Chrome captured both builds with the same station, score beat, seed, viewport and quality. The 1280×720 production GLIDE and SUNBURST views show sparse, curved cirrus through the canopy. The sun stays offset from the flight axis. BREEZE's horizon view shows a wider, softer cloud transition. Its elevated Cloud Sea view shows a warm near crest across cooler valleys, with a luma spread of 46 code values across seven patches compared with 34 in A2-A. The solid lower hull still occludes most of the low deck in level forward flight.

Isolating the A2-A horizon in WebGL identified the cloud surface projection as the main source of the narrow bands. Disabling the mirrored low-angle mist left the bands visible. Disabling the projected deck removed them and left a thin canopy structural line above the horizon. In a fixed sky-only band of the BREEZE screenshot, the mean absolute second difference between row-averaged luma values sampled two pixels apart fell from 3.43 to 1.36 with the new surface filtering. One broad low-contrast transition and the architectural sightlines remain visible.

The world-fixed cloud field uses warped banks, secondary rises and a bounded height correction. The shader gradually filters the projected footprint and blends the surface into the horizon. Sun-facing cloud slopes warm up, and the canopy computes a restrained trim and grazing reflection with its normal and sun both in view space. In the production canopy shader fixture, rolling the camera by 90° kept the same RGB sample. Reversing the world sun reduced its red channel by 25 code values. The shared directional fill uses the existing hemisphere. The branch overlays, route colors and gate openings remained legible in the entrance and Main, Challenge and Bonus captures.

The original escape scalar feeds the exterior and canopy after the chapter palette, and the main overlay still controls peak white. Three 60 Hz browser traces included nine late Encore crossings. The white signal advanced monotonically while playing. Its maximum per-frame rise was 0.0177 and the largest sampled frame luminance change at a crossing was 0.048 on a normalized scale. The overlay reached 0.99 opacity before receding into Results.

Use `/debug/#outro`, open the live preview and choose DAYBREAK. Compare BREEZE at Horizon, Cloud Sea and Look Up, then SUNBURST and the branch, white, Menu and Results presets. The three quality profiles retain the same bank and valley at a fixed BREEZE station. ELSEWHERE, DESCENT and ORBIT produced byte-identical PNGs at a matched 36 s capture.

## Rendering cost and regression

The exterior uses the existing background draw and one mipmapped 256×256 RGBA texture. The immutable field payload remains 256 KiB on the CPU and about 341 KiB with GPU mips. The preview tests verify image recovery after real context loss and context release on close. The chapter, clearance, long-world, junction and late-Encore tests exercise the existing paths and escape transition.

Paired production builds used Chrome on the same AMD Radeon with ANGLE D3D11. The table reports medians from three alternating A2-A/A2-B pairs per profile, with seven pairs for High. Frame P95 uses browser animation intervals. Mobile is Chrome emulation at device DPR 2 and render DPR 1.25.

| Viewport and quality | FPS before → after | Frame P95 (ms) | Init (ms) | Draw calls | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| 960×540 Low | 240.0 → 240.0 | 4.3 → 4.3 | 333 → 244 | 42 | 26,020 |
| 1280×720 Auto | 204.5 → 206.7 | 8.3 → 8.4 | 253 → 243 | 65 | 48,922 |
| 1920×1080 High | 86.0 → 85.1 | 12.6 → 12.6 | 349 → 332 | 65 | 48,922 |
| 393×720 mobile Auto | 240.0 → 240.0 | 4.3 → 4.3 | 247 → 246 | 65 | 48,922 |

Both builds held 37 geometries. Low held 8 textures and 13 shader programs. The other profiles held 10 textures and 15 programs. All 32 samples returned WebGL error 0. High P95 ranged from 12.6 to 16.6 ms on A2-A and from 12.6 to 16.7 ms on A2-B. The frame intervals include presentation and CPU work. Physical mobile hardware and isolated GPU timing remain unmeasured.

Three sweeps of the accelerated 5, 15 and 30 minute Menu and Results presets kept the camera in the cabin. Post-GC JavaScript heap after the last sweep was 11.46 MiB in A2-A and 11.50 MiB in A2-B. Each build grew by less than 0.4 MiB over the three sweeps. These snapshots cover the preview process and exclude native GPU memory. The synthesizer and audio export chunks were byte-identical across the paired builds.

`npm run typecheck`, `npm test` (218 unit and 99 browser tests), `npm run test:release` (6 browser tests) and `npm run test:perf` (6 profiles) passed. A focused exterior run passed all three browser checks, including the added canopy roll fixture.
