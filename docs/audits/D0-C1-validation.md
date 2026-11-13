# D0-C1 validation

Reference: `a77d09f272f2517efa72d4cfd09fe8881c899082`. Windows, Node 24.22.1 and Chrome 157.0.8103.78. The interface retains Chakra Petch and Rajdhani and uses the frozen three-line brand. Reviewed the live menu with the real corridor at 960×540, 320×568, 667×375 and 1920×1080, and exercised all six native Studio dimensions.

- The wheel follows a 56 px track step with ζ .85 and ω 15 rad/s; rapid direction reversal, keyboard wrapping, mouse drag, touch drag and reduced motion are covered. Mode and difficulty use interruptible 420 ms transitions. The quality track, volume slider, mute and Dynamic Lights switches retain their native semantics.
- The Studio exposes 60 curated fixtures with production UI and no storage writes. Coverage includes pause and recovery, audio failure and silent continuation, unsupported and failed graphics, runtime errors, all four ranks, Impossible, Encore, Sightseeing, records, settings, credits, music and share. Fixed-size iframe layouts exercise genuine media queries. There is no preview WebGL context unless the real background is enabled; the optional context is reused across fixtures and disposed on close.
- Dynamic Lights defaults off. A matched fixed frame in each of the four volumes produced a byte-identical PNG against the reference. At the same frames, draw calls and shader program counts remained 33/7, 45/9, 45/8 and 31/8 respectively. With the option on, fixed-frame browser checks assert that draw calls, program, texture and geometry counts and world progress are unchanged. Pause and silent continuation keep the same beat source. The pure tests compare all kick, snare and fill steps to the existing arrangement, check section envelopes and confirm reduced motion yields unity gain.
- Node 24 typecheck and 179 unit tests passed. Playwright browser regression passed 76 cases; release checks passed six. The four selected stability checks passed, covering the ending, repeated shader warmup, mixed gate cleanup and the live GPU benchmark. Compatibility smoke passed on Chrome, Firefox and WebKit, including emulated touch profiles, with desktop Canvas hit testing rechecked after the pointer correction.
- The 14 Chrome audio checks passed across the original run and two isolated retries. The first attempts for ORBIT and Impossible hit a missing harness artifact during a concurrent build; both passed on retry. Each original soundtrack completed on the real audio clock. Sustained Boost reached Afterglow at 196.50 s in Normal and 192.55 s in Impossible; both completed at 210 s and 448 beats, with 24 and 36 CLEAN Encore gates respectively. The normal-speed finish fade and the boosted fade also pass fixed visual checks.
- Existing browser checks cover the four volumes, gate openings, mode and difficulty, pickup/route rendering, Encore, the closing fade with and without Boost, WebGL restoration, graphics fallback, audio recovery, local records and static prerendering.

## Performance

Chrome on AMD Radeon graphics via ANGLE D3D11, 960×540, Low, DPR 1. In a short interaction trace the browser's frame interval P95 was approximately 4.2–4.3 ms for the candidate menu, wheel, rapid selectors, acrylic settings, music, results and the Studio. The quick actions in the old and new selectors have different semantics; they are not equivalent scripted workloads. Treat the table as a smoke measurement, not a cross-device frame guarantee. CPU P95 is the timed RAF callback, not a total compositor measurement. GPU P95 is an elapsed WebGL query and does not include browser composition. A near-zero P50 in this short trace includes callback samples with no draw; see the renderer-only benchmark for actual draw-frame percentiles.

| Interaction | CPU callback P95, reference → candidate (ms) | WebGL query P95, reference → candidate (ms) |
| --- | ---: | ---: |
| Menu idle | 0.60 → 0.70 | 1.76 → 1.75 |
| Volume inputs | 0.80 → 0.60 | 1.85 → 1.80 |
| Rapid selectors | 0.70 → 0.40 | 1.79 → 1.91 |
| Settings | 0.90 → 0.50 | 1.76 → 1.82 |
| Music panel | — → 0.50 | — → 1.78 |
| Dynamic Lights enabled | — → 0.50 | — → 1.91 |
| Fixed results | 0.10 → 0.10 | No recurring game draw |
| Studio static / real backdrop | No recurring Studio draw | Not sampled; the real background redraws on fixture volume/size changes |

The renderer-only live benchmark used two 5.4 s captures per build at the same resolution. CPU frame P95 was 0.90–1.00 ms on the reference and 1.00 ms on the candidate; GPU P50 was 0.95–0.99 → 0.98–1.01 ms and P95 was 1.07–1.08 → 1.18–1.29 ms (54 GPU samples per capture). Both used 34 draw calls and 12 programs. This is a modest measured GPU increase on this machine. The separate fixed-frame test verifies the optional layer adds no GPU resources.

The game used one WebGL context throughout the UI trace. The same idle view used 30 draw calls, 12 programs, 16 textures and 17 geometries on both builds. Opening panels and toggling Dynamic Lights create no rendering pipeline. The frozen results view had 28 draw calls and seven programs on both builds. The older Debug preview tools retain their existing renderers; the UI State Studio adds at most one.

Vite gzip output (kB): home entry 9.13 → 6.58, runtime 9.03 → 9.33, shared interface CSS 5.25 → 6.75, Debug entry 7.49 → 12.76. Entry chunks are not total route payloads: the candidate now shares the UI module with Debug.

After five warmups and two batches of 30 cycles, forced-GC JavaScript heap was 8.69 → 9.08 → 9.25 MB in the reference (Settings) and 8.91 → 9.41 → 9.57 MB in the candidate (Settings and Music). This measures retained JS heap on one page, not GPU memory or a long-duration leak limit. Studio tests verified disposal of its optional renderer when the preview closes.

Physical touch feel, low-power/mobile Safari compositor behavior, and accessibility with an actual screen reader still merit manual review.
