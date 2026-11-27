# F3-D Public Explorer acceptance

Baseline `7c93bca`. Verified against the local prerendered Explorer with Node 24.22.1 on Windows. Browser captures and timing logs are excluded from source control.

| Page | Verification |
| --- | --- |
| Overview | Opened volume cards and lab links and checked active navigation. No WebGL or live AudioContext was created. |
| Worlds | Opened all four production previews and exercised chapter, position, camera, quality and flight controls. Checked the 16:9 canvas and saved view links. |
| Gates | Inspected each volume’s specimens with opening and rotation controls. Compared legal targets and blocked samples with production collision, including ORBIT’s multiple openings. |
| Lighting | Checked the four production lighting implementations. Changed beat at a fixed station, then moved in space at a fixed beat. Verified lighting toggles and saved views. |
| Materials | Reviewed the six corridor surface samples, supported raw channels and effect controls. Checked the WebGL fallback and reduced-motion scan behavior. |
| Gameplay | Compared production chart totals, route swaps, seeded branch sides and Encore data across the four volumes. ORBIT retained the 92/92/92/135 main-course counts. The chart and route controls ran without a renderer. |
| Endings | Checked each volume’s live stage presets and Results preview. Replayed the DAYBREAK Impossible and no-WebGL Results regressions. |
| Audio | Tested volume switches, transport, gain and audition controls, stem and soundtrack WAV downloads, failure, retry, cancellation and disposal. |
| Interface | Changed iframe scenarios and preview sizes. Checked real game components, including Showcase and recovery, and verified that preview actions leave game settings and records untouched. |

The fixes restore legacy anchors after lazy mount, preserve lighting settings in saved views, reveal the active Audio tab at narrow widths and move keyboard focus into the new page after navigation. An Ending Studio difficulty change now waits for an opening WebGL preview while remaining available in the Results fallback. ORBIT reports loading and audio failures outside the canvas. The Audio Inspector only schedules playhead frames during playback, cancels pending exports on volume changes and releases download URLs after handoff or on exit.

Chrome 157 covered all nine pages at 1920×1080, 1440×900, 1280×720, 960×540, 390×844 and 360×760. Audio and chart scrolling stayed inside their workspaces. Firefox 151 exercised all nine pages at 1440×900 and 360×760. All 24 published source targets resolved to tracked files. The observed requests stayed on the local static origin.

Playwright WebKit 26.5 on Windows exercised the nine routes at 960×540 using the ELSEWHERE flight for Worlds. The DAYBREAK flight crashed the WinCairo process on both the baseline and the candidate. The Audio route displayed “Audio unavailable” after a user attempt to start playback. Native Safari and device-level GPU and audio output remain unverified.

Two full browser navigation circuits released each live renderer, removed the Interface iframe and closed playback on exit. The tests counted zero active WebGL or live audio contexts back at Overview and observed zero idle Audio playhead frames. Native offline renders already running can finish inside the browser after a cancellation. Canceled jobs cannot publish a download. In all three warmup scenarios, AURORA's first visible frame drew six layers with no new program or build. Toggling ORBIT lighting preserved draw calls, triangles, programs, geometries and textures across all quality tiers.

The local release checks cover direct access, trailing-slash redirects with query strings, `noindex` and real 404 responses. Legacy links from both old entry points resolve to the corresponding production lab anchors. F4 retains any broader renderer consolidation. F5 owns target-host deployment, indexing, canonical URLs and device-level verification.

## Test results

- Type checking, the production build and the browser harness build completed. Vitest passed all 343 tests on an isolated retry after a concurrent run hit the existing ORBIT geometry timeout.
- The Chrome Explorer regression passed 38 tests against the final static build. The wider non-audio browser run passed 184 of 187. The three affected cases passed individually on retry, including the two updated Ending Studio assertions and the unchanged live DESCENT branch check.
- Audio was verified across separate runs. The baseline passed all four complete stem PCM and seam checks against the unchanged synthesizers. On the candidate, the full soundtrack cancellation and retry test, the four-volume DPR 2 waveform test, and the serial tests for playback, mix fidelity and the complete 171-second DESCENT Signal download passed. Concurrent offline rendering hit several timeouts before the serial retries.
- `npm run test:release` passed six tests using the installed Chrome channel. The four focused ORBIT warmup and lighting performance cases passed. Frame timing on a dedicated GPU was outside this local run.
- The initial `npm test` run began on the baseline. Its single-worker browser phase was stopped after the audio subset to free resources for the candidate. The final verification used separate browser, audio and release runs.
