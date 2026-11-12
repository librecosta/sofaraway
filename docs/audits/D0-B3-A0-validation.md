# D0-B3-A0 — Structural kit validation

Baseline: `dev@113b34106f0f6a500c84e0b17633ef0bfce9f36c` (M0). The baseline build comes from a clean Git archive of that commit. The comparison uses local static production and test-harness builds; the performance probe is test-only.

| Model | Construction and mounting |
|---|---|
| Overhead Assembly | Beveled beam and lower spine, angled connector plates and hangers; ceiling. |
| Ventilation Assembly | Framed fan with six blades, axle, guard, outlet collar and curved duct; wall. |
| Utility Conduits | Continuous bent tubes, branch pipe, brackets and cable tray; wall. |
| Service Bay | Backplate recessed behind a deep frame, removable panel and three interfaces; wall. |
| Holographic Service Door | Thick frame, small cyan light and translucent M0 film over an opaque backplate; wall. Decorative only. |
| Tech Crate | Beveled shell, polymer reinforcement, face panels and metal fittings; floor edge. |
| Utility Barrel | Cylindrical shell, polymer bumpers, metal collars, cap and axial details; floor edge. |

An independent fixed seed chooses mounting sides and offsets within the authored straight segments. Segment motifs mix quiet and serviced runs. The geometry is placed using the same fixed F2 Path frame as the tunnel. Fixtures remain inside the octagon but outside the central flight lane; the branch approach, junctions, pickup and bends are left clear. Props are inset at `x = ±2.02`, at least 18 world units from gate stations across the three Standard charts and the actual Sightseeing chart. Branch and pickup exclusion bands cover both modes. No placement is driven by music time, the current speed or Run Seed.

Contact checks the swept segment between two actual camera positions in the 60 Hz simulation. The first contact launches the prop forward and away from the player with speed-based force and seeded spin. Gravity is `9.8` world units/s², floor restitution is `0.32`, and the floor support height follows the tilted box or cylinder. Motion settles or stops simulating behind the view. It never feeds back into player motion, damage, score, combo or gate/pickup adjudication. Retry clears contact state; WebGL rebuild takes the current pose from Simulation. Cases at cruise and Boost in Standard and Sightseeing compare the player's trajectory and gameplay counters against a run without props.

The kit merges template geometry by finish (20 batches total) and uses bounded instance buffers in a 128-unit lookahead / 19-unit trailing window with frustum culling. The tunnel continues to own and stream its own chunks. The kit owns the instance buffers and template geometries; the M0 library owns the shared maps and materials. Meshes are not created per placement, contact or frame. Neutral instance color gives props and fixtures some local reflectance separation from the shell without changing the M0 maps, their color space or global exposure. The previously unused in-game polymer preset adds one Color and one Normal map to ELSEWHERE.

Light calibration is local to ELSEWHERE. Corner strips use `0.79×` their old intensity and ordinary rims use `0.84×`, including at the same beat-pulse peaks. A less saturated ambient fill (`0.45 → 0.66` intensity) and a cooler hemisphere ground fill recover dark midtones. Moving the nearest point light forward to `+5` units was tried and reverted because it darkened too much of the shell. The original point lights and environment intensity of `1.7` remain in place. Glass shaders, the beat-pulse curve, renderer exposure, Bloom and DPR are unchanged.

The unified `/debug/#structure` and `/debug/#props` sections show the same lit meshes as the tunnel, with a viewing-angle slider and a repeatable hit for each prop. The impact preview uses the same fixed-step update, with a static struck pose under reduced motion. No independent WebGL context is created per card. The no-WebGL fallback leaves descriptive content available and disables interactive model controls.

## Visual and resource evidence

Fixed High-quality frames cover INTRO, the installed beam, A, B, BUILD with Boost, DROP, BREAK, branch entry and Sightseeing. The shell stays dark, while the fan and conduit silhouettes read at their mounting surfaces. The branch view has no added geometry in its approach. At 960 × 540 the count of brightly saturated pixels (peak channel above 165 and RGB spread above 65) decreased from **2,866 to 1,188** in INTRO and **2,337 to 1,206** in B. Pixels in the sampled shadow-to-midtone band (luma 12–54) increased from **33,885 to 34,208** and **19,784 to 22,085**. These are whole-frame checks, not measurements of individual luminaires. At a fixed 83 seconds, DRIFT, DESCENT and ORBIT PNGs matched M0 byte for byte. CPU/GPU opening parity still passes.

Performance: Windows 10 build 19045, Ryzen 7 5800H, Chrome 157.0.8103.39, WebGL 2 via ANGLE / native AMD Radeon D3D11, 960 × 540 at DPR 1. Reference → candidate values below average the two samples per build in A–B–B–A order. Each sample measured 480 CPU draw/update iterations and 20 asynchronous WebGL GPU timer queries, with Simulation held at the named fixed frame. CPU is application work measured inside the frame, not the RAF interval. GPU resources are counts, not VRAM.

| Scenario | CPU P95 ms | GPU P50 / P95 ms | Draw calls | Triangles | Geometry / Texture / Program |
|---|---:|---:|---:|---:|---:|
| INTRO High | 0.85 → 1.30 | 2.00 / 2.48 → 2.03 / 2.75 | 65 → 81 | 91,814 → 94,814 | 23 / 18 / 13 → 31 / 20 / 18 |
| B Low | 0.65 → 0.80 | 1.01 / 1.78 → 1.17 / 1.82 | 30 → 36 | 34,964 → 36,728 | 19 / 16 / 11 → 25 / 18 / 15 |
| Boost High | 0.85 → 1.35 | 2.10 / 2.56 → 2.21 / 2.42 | 69 → 85 | 92,654 → 98,006 | 27 / 18 / 13 → 35 / 20 / 18 |
| Sightseeing High | 0.90 → 1.25 | 2.16 / 2.35 → 2.07 / 2.52 | 50 → 56 | 68,690 → 69,770 | 17 / 18 / 13 → 20 / 20 / 18 |
| BONUS High | 0.75 → 0.80 | 1.84 / 2.00 → 1.72 / 2.07 | 37 → 37 | 50,086 → 50,086 | 10 / 18 / 13 → 10 / 20 / 17 |

The fixed views held 0–3 dressing placements. The extra depth and scene submissions are visible in the INTRO and Boost CPU results. BONUS keeps its original draw and triangle counts; shared warmed resources remain available. ELSEWHERE streamed the same `4 → 3 → 3 → 3 → 4 → 4` chunks with all eviction checks passing; chunk CPU P95 ranges overlap (7.3–9.0 ms M0, 8.2–8.4 ms candidate). Four mixed-gate switch/run samples plateaued at 23 geometries, 20 textures and 10 programs, with 150 of 150 temporary shader handles released. Debug went from 24 to 31 ready previews at the same two total contexts (one shared model renderer and one temporary world renderer); single-run timings were 742 and 606 ms and do not establish a speedup. Warm menu ready ranged 342–385 ms at baseline and 350–364 ms on candidate; cold runs varied too much for a conclusion.

The world placement plan contains 46 fixtures and 29 props; only the nearby placements are drawn. In a browser-driven Boost fixture the first crate was struck at station 4297.88, at 34.80 units/s. One active prop survived context loss with its pose unchanged and reset on retry. A batch of 4,096 identical fixed updates measured about 0.20 µs per active pose on this CPU; this microbenchmark excludes rendering, sweeps and frame scheduling.

## Regression and follow-up

Strict TypeScript and the static SSG build passed. `npm test` passed 154 Vitest and 55 Playwright cases; `npm run test:release` passed 6. Selected stability, compatibility and audio regressions passed 6, 20 and 16 cases respectively. These cover resource eviction, real shader parity, repeated preview creation, context recovery, all-volume play, audio activation and late scheduling recovery. The compatibility runs used Chromium, Firefox, WebKit, mobile Chromium emulation and mobile WebKit emulation. The WinCairo WebKit build has no AudioContext: audible playback is blocked in that environment and the explicit silent path was tested. No physical device results are inferred from mobile emulation.

These are the foundation models. The exhaust rotor is static. Per-chapter compositions, final detailing and further object variants are deferred. Manual play should check how quickly the floor props read on a dark display at Boost, the strength of a near-miss versus a clean hit, and whether the quiet/serviced rhythm feels appropriate on a complete Sightseeing run.

## Reproduction

Run `npm run typecheck`, `npm test` and `npm run test:release`. For an A/B comparison, build the archived baseline with `npm run build` and `npm run build:harness`, then build both targets from the candidate and set `STABILITY_REFERENCE_DIR` to the archive's `build` directory. Run:

```sh
npx playwright test --config playwright.stability.config.ts --grep '@kit-|benchmark production load|releases every compiled|keeps GPU resource counts bounded|fixed ELSEWHERE frames'
npx playwright test --config playwright.compat.config.ts --grep 'material lab|actual gate shader|WebGL context loss|prerender, four volumes'
npx playwright test --config playwright.sync.config.ts --grep 'offline section|offline stop|real activation|scheduler starvation'
```

Use the same browser and GPU for both builds. On this machine the Chromium channel was installed Chrome; the `A0_BROWSER_CHANNEL`, `RELEASE_CHROMIUM_CHANNEL`, `STABILITY_CHROMIUM_CHANNEL`, `COMPAT_CHROMIUM_CHANNEL` and `SYNC_CHROMIUM_CHANNEL` overrides were set to `chrome` for the corresponding runs. Screenshots, measurements and browser artifacts remain outside the repository.
