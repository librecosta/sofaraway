# D1-A2-B-F1 · Structured cirrus validation

SoFarAway baseline `6c33c487cba18613dee29d1cbdb1b0b03dcc7828`. The [Website reference](https://github.com/librecosta/website/tree/3caa59a20731dde28a4b20efcf9cfeedf97b8c41/src/components/expanse) is the verified `develop` tip at implementation start.

## Composition

Website's `createSkyField` projects world rays onto a tilted spherical frame, then builds a curved spine, changing width, nearby branch envelopes and outward fringes. Its `flowNoise` preserves continuity at the local meridian. `forSkyDirection` samples height quadratically, and `bakeSkyRadiance` applies bounded optical depth. DAYBREAK adapts those ideas to its existing directional sky shader with a periodic seeded lattice and separate fiber coordinates for each offshoot. Its sky colors, analytic daylight, cabin and fog retain their original inputs.

The main ribbon is centered at an azimuth of −18°, elevation of 27° and tilt of 8°. Two angular harmonics bend the spine by up to 9°. Its nominal half-width is 6.4° and density is 0.94 before longitudinal falloff. Branch offsets are maximum departures from the moving spine. Each branch approaches the spine, pulls away and tapers along the arc.

| Branch | Offset | Half-width | Density | Phase | Outer fringe reach | Fringe strength |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Companion | −10.5° | 4.25° | 0.44 | 0.52 rad | 7.3° | 0.18 |
| Upper offshoot | +14° | 3° | 0.29 | −0.90 rad | 6° | 0.24 |

The old sea-alpha noise produced independent short marks. The new 512×256 RGBA8 direction field carries raw main and secondary masks in R and G. B and A carry their corresponding textured densities. Noise bends each local strand, forks finer strands, and gently modulates their density along the flow. The shader reads one direction sample for cirrus in the existing exterior draw and changes mip precision across quality tiers. The existing 256×256 sea retains bit-identical RGB height and slopes.

## Real WebGL review

The paired screenshots use the same station, score beat, seed, view angle, quality and viewport. The live game captures use a 1280×720 Auto viewport and the Studio captures use High in the same browser viewport. GLIDE Forward and Look Up show the main arc and its open edges. BREEZE Horizon and both side views show the band picking up or dissipating as the view turns. SUNBURST Forward, RETURN Challenge, Menu and Results retain the bright opening around the path. Captures during normal flight and Boost show the same world composition from their respective viewpoints. The cabin's straight structural lines remain visible.

In a 1280×235 upper-sky patch, 62–65% of pixels in matched GLIDE and SUNBURST forward frames and 70–74% in Boost frames differ by at most 10 luma code values from a cirrus-disabled render. These samples count low-opacity fringes within the clear area and describe the selected views. The secondary mask is easier to inspect from Look Up, where both offshoots separate. The dark floor, gate openings, lower BREEZE cloud-deck crop and the matched frames from the other three volumes retained their baseline appearance. The lower cloud-deck crop and other-volume PNGs were byte-identical.

At `/debug/#outro`, open the live preview, select DAYBREAK, switch to Look Up and choose Main Only or Secondary Only from **Cirrus layers**. Composite shows the gameplay result with aligned fibers.

## Rendering cost and regression

The direction texture adds 512 KiB of cached CPU bytes and approximately 683 KiB of texture payload with mips. One production WebGL fixture tracks both exterior texture releases and samples the same sky ray after translation, a 90° roll, a turn and a wider Boost FOV. The Studio regression exercises the layer selector, restores the preview after real WebGL context loss and switches volumes in the same canvas.

On the same Chrome and AMD Radeon ANGLE D3D11 setup, each configuration alternated A2-B and F1 in three pairs, with seven pairs for High. The medians describe each cohort at its own run conditions. Low and Auto frame rates varied between pairs, and the frame intervals include CPU work and presentation.

| Viewport and quality | FPS before → after | Frame P95 (ms) | Init (ms) | Draw calls | Programs | Textures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 960×540 Low | 137.9 → 150.8 | 16.7 → 12.6 | 406 → 473 | 42 → 42 | 13 → 13 | 8 → 9 |
| 1280×720 Auto | 97.3 → 95.8 | 25.0 → 25.0 | 479 → 477 | 65 → 65 | 15 → 15 | 10 → 11 |
| 1920×1080 High | 101.2 → 104.6 | 12.6 → 12.6 | 238 → 276 | 65 → 65 | 15 → 15 | 10 → 11 |
| 393×720 mobile Auto | 240.0 → 239.7 | 4.3 → 4.2 | 222 → 301 | 65 → 65 | 15 → 15 | 10 → 11 |

All 32 samples reported WebGL error 0. The additional field is generated on the first DAYBREAK visit and its CPU bytes are reused. Three accelerated passes through the 5, 15 and 30 minute Menu and Results presets kept the camera in the cabin. Post-GC JS heap ended at about 11.5 MiB on both builds. Chrome backing storage grew by about 0.5 MiB with the cached field. Mobile measurements use device emulation. Physical mobile hardware and isolated GPU timers remain unmeasured.

The 60 Hz Escape White regression covered nine late Encore crossings across three routes and still reached 0.99 peak screen opacity. The maximum single-frame rise in the white signal was 0.0177. The largest sampled screen-luma change at a crossing was 0.048 on a normalized scale.

`npm run typecheck`, `npm test` (221 unit and 101 browser tests), `npm run test:release` (six browser tests) and `npm run test:perf` (six profiles) passed.
