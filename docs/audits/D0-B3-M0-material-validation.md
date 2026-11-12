# D0-B3-M0 — Material validation

Compared with `dev@1509250b08c26dc1bb094cb7e03b8d54597fb694`. Only ELSEWHERE adopts the new surface library. Its tunnel ceiling and corners and the junction shell use Satin; side walls use Recessed; the flat floor uses Grip; the existing ribs and braces use Reinforced and Brushed. The old Hull remains on the legacy path for the other volumes. The only lighting adjustment is a 1.7× multiplier on ELSEWHERE's existing environment reflection to compensate for the correctly decoded albedo; the chapter lights, glass and postprocessing keep their existing settings.

| Surface ID | sRGB base | Tile, world units | Metalness / roughness | Height structure |
| --- | --- | --- | --- | --- |
| `alloy-satin-dark` | `#303943` | ~1.20 × 1.20 | 0.80 / 0.60 | Subtle satin microstructure |
| `alloy-brushed-tech` | `#46515B` | 0.80 × 1.60 | 0.85 / 0.42 + variation | Directional shallow brush |
| `panel-recessed` | `#343D46` | 1.75 × 1.50 | 0.65 / 0.64 | 0.017-unit joints, two modules per wall face |
| `panel-reinforced` | `#29333C` | 1.50 × 3.00 | 0.75 / 0.55 | 0.027-unit broad joints plus two shallow channels |
| `floor-grip` | `#29343B` | 5.10/7 × 1.50 | 0.55 / 0.78 | Shallow module joints and 0.0019-unit fine grip |
| `utility-polymer` | `#1B242C` | 0.60 × 0.60 | 0.02 / 0.82 | Very shallow matte microstructure; Debug only |

All six generate 256² RGBA Color and Normal maps and an independent float Height field. Only Brushed generates Roughness: its green channel encodes the final value (roughness multiplier = 1). Metalness is constant. Texture addressing wraps on both axes with trilinear mipmaps and anisotropy 4. Height uses fixed seed `0x6583f7c1`; wrapped central differences are divided by the actual world-unit sample spacings. GPU linear readback decoded Satin's raw sRGB `[47,56,66]` to `[7,10,14]`; normal/roughness maps are not color managed. The game’s output space and global Three.js color settings are unchanged.

Geometry supplies the final UV. Satin fits 20 repeats around the standard octagon. Module slots line up with the fixed 3-unit ring grid and do not restart at Chunk boundaries. The actual three shell groups had identical shared vertices and UVs across station 4410. Branch sweeps use fixed station and the real cross-section perimeter; the expanded junction has its longitudinal wrap seam at a lower corner rather than rescaling the material as it widens. This does not change the route or camera sampling. Tests exercise periodic Color/Height/Roughness, one-sided slope agreement, normal direction/length/encoding, world scale, and the rendered sRGB conversion.

The two effects are `emissive-channel-cyan` (unlit shared insert) and `hologram-panel-cyan` (transparent analytic scan lines and a soft rim). Neither allocates a texture or an additional post pass. The [Debug overview](/debug/#materials) renders the same six materials on beveled samples under common lighting, offers one raw channel inspector, and shows both real effects. Canal Sky and Starfield are under Environment. The same page retains volumes, gates, pickups and soundtrack export; it offers fixed tunnel and junction views. A no-WebGL run verified labeled raw previews, and simulated context loss/restoration redrew the lit samples.

### Performance and visual comparison

Windows 10 22H2 (19045), Ryzen 7 5800H, Chrome 157.0.8103.39, hardware ANGLE D3D11 on AMD Radeon Graphics, 960×540 at DPR 1, headless. GPU values use asynchronous WebGL timer queries, not RAF. Two fixed-frame A–B–B–A runs hold equal seed, station and rendering profile; each sample captures 480 CPU frames and 20 valid GPU queries. The table reports the median of four per-build samples. Streaming, startup and repeated return-to-menu/volume switches are separate runs.

| Scenario | CPU P95, ms | GPU P50, ms | GPU P95, ms | Draw calls | Triangles | Geometry / texture / program |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Cruise High | 0.85 → 1.05 | 1.92 → 1.96 | 2.43 → 2.10 | 50 → 66 | 90,858 → 92,138 | 23/9/13 → 23/18/13 |
| Cruise Low | 0.60 → 0.70 | 0.99 → 1.05 | 1.78 → 1.82 | 29 → 37 | 45,928 → 46,568 | 23/7/11 → 23/16/11 |
| Held Boost High | 0.80 → 1.05 | 1.85 → 1.92 | 2.26 → 2.32 | 41 → 53 | 68,490 → 69,450 | 19/9/13 → 19/18/13 |
| Sightseeing High | 0.80 → 0.85 | 1.82 → 1.92 | 2.43 → 2.12 | 28 → 36 | 45,282 → 45,922 | 12/9/13 → 12/18/13 |
| Bonus junction High | 0.85 → 0.85 | 1.76 → 1.64 | 2.12 → 1.81 | 33 → 37 | 49,766 → 50,086 | 10/9/13 → 10/18/13 |

The extra draw submissions come from splitting the existing shell into three material groups; no per-panel mesh is added. High counts include the depth pass. Slight triangle differences reflect fixed ring alignment where a streamed segment begins off-grid. The fixed scenes used four streamed chunks. Median GPU P95 changes are within the +10% budget; Low reference P95 ranged from 1.03 to 2.07 ms, so small deltas are not evidence of a speedup or regression on other GPUs. CPU submission cost increased by up to 0.25 ms in these scenarios.

One startup comparison generated the legacy pair in 24.9 ms median and the five new sets in 39.4 ms (all six for Debug: 47.5 ms). CPU generation excludes upload and shader prewarm. Production menu readiness in the two warm-cache samples rose from 201–263 ms to 278–313 ms; cold samples were noisier (449–1,077 ms vs. 498–684 ms). Debug's legacy raw cards appeared at 145–433 ms; the six lit cards plus channel inspection were ready in 668–816 ms. The views and startup paths do different work. In the Chunk probe the active window stayed at 3–4 chunks. Chunk build P50 rose from 2.90–3.00 ms to 3.60–3.70 ms; P95 was 8.00–8.50 ms before and 7.50–7.80 ms after (15 samples per run).

### Resource ownership

Five runtime presets hold 11 maps (2.75 MiB CPU RGBA buffers; about 3.67 MiB GPU payload with mipmaps). The legacy hull's two 512² canvases represent about 2.00 MiB of CPU pixel backing and 2.67 MiB mipmapped GPU payload. Debug's six presets hold 13 maps (3.25 MiB CPU, ~4.33 MiB GPU) plus 1.50 MiB of Height fields for inspection; its visible preview canvases are additional. These are payload estimates; browser backing, temporary allocations, render targets and driver overhead are excluded. The main library retains no height or Canvas buffers. Chunk disposal freed geometry with zero shared map disposals; releasing the volume library freed all 11 exactly once. Branch and Debug have separate ownership of their own resources. Three return-to-menu and switch cycles held at 23 geometries, 20 textures and 10 programs after warming both volumes. Repeated prewarm freed all 134 temporary shader handles.

### Scope and remaining review

Matched fixed views of DRIFT, DESCENT and ORBIT at 83 s were pixel-identical to the baseline. ELSEWHERE fixed views cover the main tunnel, Sightseeing floor, split and dense Bonus route. The new surfaces remove irregular rectangles, stripes and rivets; shallow texture is easiest to see from the Debug cards or at grazing angles. Before dressing A0, check wall readability during the darkest color changes and floor/rib shimmer while flying on the target display. Native mobile GPU performance and subjective display calibration were not measured.

Strict TypeScript, SSG release checks (6), unit tests (146), the main browser suite (54) and eight selected stability cases passed. The 45 selected compatibility cases covered Chromium, Firefox and WebKit plus both mobile profiles. All five profiles rendered six lit surfaces and two effects, with normal inspection intact. The 20 audio cases included full, real AudioContext runs for the four standard tracks and offline score/section verification. WinCairo does not expose audible Web Audio here, so those lifecycle cases verified the explicit silent path. World-space travel, Boost, sightseeing results, junction restores, pickups, and CPU/GPU gate openings remain covered by the existing tests.

Reproduce with `npm run typecheck`, `npm test` and `npm run test:release`. After `npm run build:harness`, run the compatibility suite filtered to `material lab|actual gate shader|WebGL context loss|prerender, four volumes|graphics survives`. For the old/new comparison, build the baseline client and harness in a separate directory. Copy the current `tests/harness/stability.ts` into that checkout before building the reference harness so both harnesses sample the same mode/station, leaving the reference game code untouched. Point `STABILITY_REFERENCE_DIR` at that checkout's `build`, then run `npx playwright test --config playwright.stability.config.ts --grep "@m0|@glass|benchmark production load|releases every compiled|keeps GPU resource counts bounded"`. Comparison screenshots go to the Playwright output directory.
