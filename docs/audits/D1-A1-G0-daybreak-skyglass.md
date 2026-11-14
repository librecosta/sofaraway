# D1-A1-G0 · DAYBREAK skyglass and static gates

The gate profiles live in `app/game/core/daybreak-gates.ts`. Funnel uses the first sketch's two angled cuts and always omits the middle pane. Down, Right, Up and Left are the four directions of the narrow end. Fan uses a three-way joint with cuts toward the lower-left corner, top shoulder and right edge. This keeps three panes where tracing the second sketch's closed triangle would yield four. Upper and Return omit the original upper-right pane in two orientations. Side omits the original left pane, and Lower omits the original lower pane.

The same clipped octagonal coordinates drive the CPU opening, the two extruded panes and optical cut highlights. All eight profiles use the existing 0.38-unit thickness, 0.035-unit face bevel and L1/L2/L3 glass shader. The score can change hue and scan phase. Pane positions, openings and orientations are fixed, with the same swept crossing used by the other DAYBREAK chart events. The new local record bucket is `daybreak-skyglass`. Both previous buckets remain readable and preserved.

The original lower shell meets five continuous upper faces. A waist cap covers the panel recess, corner gaskets define the glazing and shallow support hoops repeat every 21 units. Each streamed chunk owns one canopy geometry. The tunnel owns one shared translucent material. The canopy tests depth and renders before the gates. The focus-depth pass sees through the canopy. DAYBREAK retains its existing sky gradient, 120 BPM, 288 beats and 144-second arrangement.

## Verification

- `/debug/#daybreak-cabin` shows three views from the game renderer. `/debug/#gates-drift` shows all eight profiles and lets the viewer change the specimen angle.
- Fixed-step steering tests clear Easy, Normal and Hard at cruise and sustained Boost with a 150 ms response delay. The lives are 3, 2 and 1. Sightseeing keeps five lives, one-third speed and 21 sampled gates. Two full Chrome runs reached beat 288 on live audio with all 1,152 scheduler steps and all gates passed.
- WebGL readback agrees with CPU collision across all eight openings, including both sides of the bevel edges. The first curved chunk boundary has identical canopy vertices on both sides. Radial checks hit the lower shell, waist and upper panes on both sides of the seam. Eviction disposes the chunk geometries, and tunnel teardown disposes the shared material once.

## Rendering cost

Compared with `aec2fb9433b8a6abc01b1c2edc44a9c7bbcba750` on Chrome 157, Radeon integrated graphics via ANGLE D3D11, 960 × 540 at DPR 1. Timing uses six-second High-quality samples and WebGL timer queries. Draw counts use a fixed SUNBURST gameplay frame at 92 s.

| Sample | Baseline | Skyglass |
| --- | ---: | ---: |
| Menu CPU frame p95 | 1.40 ms | 1.50 ms |
| Menu GPU frame p50 / p95 | 2.05 / 2.47 ms | 2.33 / 2.74 ms |
| GLIDE CPU frame p95 | 1.80 ms | 1.40 ms |
| GLIDE GPU frame p50 / p95 | 2.11 / 2.33 ms | 2.29 / 2.75 ms |
| GLIDE frame interval p95 | 12.5 ms | 16.7 ms |
| SUNBURST High draws / triangles | 60 / 42,250 | 51 / 46,318 |
| SUNBURST High geometries / textures / programs | 18 / 11 / 11 | 24 / 11 / 11 |
| SUNBURST Low draws / triangles | 44 / 21,188 | 35 / 24,416 |

The extra geometry covers the canopy and the eight cached gate shapes. Low-end physical devices and the next stage's brighter sky remain outside this rendering sample.
