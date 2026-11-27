# D1-A2-B-F2 · Chromatic daylight validation

F1 baseline `f507edcbf76934f16713436690477624063e72da`.

## Color and light

Fixed F1 frames showed a muted blue sky, narrow warm scatter, cool cloud crests and a dark lower cabin. The sky shader's middle band had modest channel separation, the cabin used an indoor reflection map, and the DAYBREAK fog attenuated the air color to 55%. The renderer uses a linear scene target and the existing ACES-style display shoulder. The new radiance values are authored for that path.

GLIDE establishes clear cyan-blue beneath a deeper zenith. Warm scatter depends on the world ray's sun angle and height. Cirrus shares the same directional tint. The cloud crests are brighter and more ivory where their slopes face the sun. Valleys retain blue shadows. BREEZE retains the least haze. SUNBURST has the strongest warm scatter while the same score interpolation leads into OUTRO.

Fog now takes 82% of the chapter air color at the existing density. The existing hemisphere and ambient fills reveal more panel detail, and canopy highlights gain a small amount of directional warmth at the trim. DAYBREAK's 128×64 procedural reflection input takes the fixed world sun as its bearing. The PMREM is reused on consecutive DAYBREAK loads and released when leaving the volume or graphics surface. The existing indoor reflections still serve the other volumes. The exterior retains one draw and its two existing cloud textures.

## Matched WebGL frames

Chrome captures used identical score times, stations, seed, directions, quality and viewports on both builds. The primary comparison is the running game at 1280×720 Auto, including GLIDE, SUNBURST and Impossible Boost. The same browser viewport was used for High Studio captures of BREEZE’s upward and cloud-sea views, all three RETURN interiors, Menu and Results. Review these through the existing `/debug/#outro` DAYBREAK controls.

| Selected region | F1 → F2 display evidence |
| --- | --- |
| GLIDE entrance, beat 17 | Clear-sky luma 81 → 99. Blue minus red rises from 63 to 88. The first gate's opening remains distinct. |
| GLIDE forward, clear sky | 120 → 163 luma codes. Blue minus red rises from 104 to 124. |
| GLIDE forward, dark metal panel | 12 → 17 luma codes. Panel seams remain visible. |
| SUNBURST forward, sunward air | Mean RGB (185, 198, 207) → (209, 209, 206). |
| BREEZE, cloud crest and valley | 204 / 168 → 230 / 187 luma codes. The valley retains +35 blue minus red. |
| SUNBURST, passable opening's lower rim | Local luma difference 59 → 51. The outer edge against the brightest sky is subtler, with an 11 → 7 code difference in the sampled stripe. |

The glass openings and route colors remained identifiable in the bright normal and Boost frames. The thin upper rims have less contrast against the brightest air. The camera, gate optics and corridor fixtures retain their original settings. Menu and Results show the whole cabin and sky. Matched PNGs for ELSEWHERE, DESCENT and ORBIT were byte-identical. The production synthesizer bundle, cloud and cirrus generators, and gameplay and record files match F1.

## Performance and resource checks

Three alternating F1/F2 pairs per profile used the same Chrome session on AMD Radeon ANGLE D3D11. The values below are medians. Initialization is navigation to a ready DAYBREAK renderer. Frame intervals include CPU work and presentation.

| Viewport and quality | FPS | Frame P95 (ms) | Init (ms) | Draws / programs / textures / geometries on both builds |
| --- | ---: | ---: | ---: | --- |
| 960×540 Low | 240.0 → 240.0 | 4.3 → 4.3 | 582 → 544 | 43 / 13 / 9 / 37 |
| 1280×720 Auto | 191.1 → 186.8 | 8.4 → 8.4 | 546 → 510 | 66 / 15 / 11 / 37 |
| 1920×1080 High | 81.8 → 79.8 | 16.6 → 16.6 | 604 → 582 | 66 / 15 / 11 / 37 |
| 393×720 mobile Auto | 240.0 → 240.0 | 4.3 → 4.3 | 516 → 519 | 66 / 15 / 11 / 37 |

All 24 samples returned WebGL error 0. After three accelerated passes through the 5-, 15- and 30-minute Menu and Results presets, post-GC JS heap measured 11.22 MiB in F1 and 11.17 MiB in F2. Backing storage was 10.45 MiB on both. The passes verify bounded preview traversal and resource reuse. Physical mobile performance and isolated GPU timers remain unmeasured.

The browser checks exercised world-oriented sunlight through roll and wider Boost FOV, warm and cool sky rays, all quality tiers, reflection reuse and disposal, volume switching and WebGL restoration. The 60 Hz Escape White trace captured nine late Encore crossings across all routes. The white signal advanced monotonically, rose by at most 0.0177 per frame, reached 0.99 overlay opacity and then receded into Results. The largest sampled screen-luma step at a crossing was 0.0483 on a normalized scale.

`npm run typecheck`, `npm test` (221 unit and 102 browser tests), `npm run test:release` (six tests), and `npm run test:perf` (six profiles) passed.
