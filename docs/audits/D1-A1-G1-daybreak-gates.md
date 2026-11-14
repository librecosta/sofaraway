# D1-A1-G1 · DAYBREAK cabin-fitted gates

Crystal and Crystal 45° use eight radial slices and a solid regular octagonal hub. The hub apothem is 1.12 units, compared with the ELSEWHERE Iris radius of 1.02. The selectable openings are upper left, upper right, lower right and lower left for Crystal, and top, right, bottom and left for Crystal 45°. Vertical uses a tall cut-corner window with four symmetric seams. Horizontal uses a wide hexagonal window with six seams. Both windows have one fixed, centered opening.

All four gate types use the same octagonal section as the skyglass canopy and lower shell. The set uses the existing optical shader, 0.38-unit thickness and 0.035-unit bevel on cut edges. The perimeter meets the cabin at full size. An opening that reaches the shell continues to the wall without a suspended glass edge across it. The pane geometry and swept collision use the same polygons.

| Chart | Previous | Current |
| --- | ---: | ---: |
| Easy | 44 | 65 |
| Normal and Hard | 65 | 97 |
| Sightseeing | 21 | 32 |

Midpoint gates repeat selected openings to leave time for direction changes. The previous 65 pacing anchors still drive speed and fixed world stations. OPEN and OUTRO are clear. BREEZE stays sparse. Normal and Hard use 24, 18, 6, 31 and 18 gates across GLIDE, LIFT, BREEZE, SUNBURST and RETURN. The score continues at 120 BPM for 144 seconds. Standard has 3/2/1 lives. Sightseeing runs at one-third speed with five lives.

The current ID is `daybreak`. The game normalizes legacy `?vol=drift` links while preserving other URL options and the hash. New results go into `daybreak-crystal` inside `sofaraway.records.v1`. Earlier record buckets stay in storage.

## Verification

- `/debug/#gates-daybreak` previews the ten openings and both complete Crystal patterns. `/debug/#daybreak-cabin` shows the actual walls, canopy and installed gates.
- CPU collision and WebGL readback agree at all ten openings, including near the bevels and 0.2% inside the shell. Each difficulty cleared the full chart at cruise and sustained Boost with actual 60 Hz steering and a 150 ms reaction delay.
- Chrome completed all 1,152 scheduled audio steps in each 144-second run, with all 97 Normal gates and all 32 Sightseeing gates passed. Chrome, Firefox and WebKit passed focused WebGL readback and restoration tests. The desktop and mobile-emulated Windows WebKit tests used the silent fallback for the recovery check.
- Compared with `4fd4b3f`, fixed captures of the other three volumes at 83 seconds are pixel-identical. In the 92-second DAYBREAK sample, draw calls rose from 51 to 53 and triangles from 46,318 to 46,522. Both builds used 24 geometries, 11 textures and 11 programs.
- A six-second High-quality GLIDE sample on Chrome 157 and Radeon ANGLE D3D11 at 960 × 540 and DPR 1 measured CPU frame p95 of 1.20 → 1.30 ms, GPU p50 of 1.99 → 2.27 ms and GPU p95 of 2.30 → 2.63 ms. These timing results describe the sampled desktop GPU.
