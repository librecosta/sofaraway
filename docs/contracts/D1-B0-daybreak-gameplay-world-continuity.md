# D1-B0 — DAYBREAK Gameplay Integration & World Continuity

DAYBREAK uses the existing GLASSHOUSE score at 120 BPM, 288 beats and 144 seconds. The score, synth, mix, transport and lighting event source retain their baseline behavior.

## World-space gameplay

`gameplayFor` supplies the branch, pickup, Encore, ending and world requirements for each volume. The fixed-step simulation, swept crossings, route scoring, pickup deck, recovery and results use the shared systems.

The Normal and Hard Main chart has 120 gates. The OPEN / GLIDE / LIFT / BREEZE / SUNBURST / RETURN / OUTRO split is 0 / 28 / 22 / 7 / 38 / 25 / 0, including the 15 Main gates inside the junction. Easy reduces the Main chart to 81. Sightseeing samples the Normal chart and uses five lives at one-third speed. Crystal 45° was removed from the active gate catalog. Crystal retains its four fixed openings, and Vertical and Horizontal retain their center openings and shared optical glass.

The chart matcher assigns phrase slots to the actual Kick, Snare and Fill onsets. Bonus can also use a Hat onset. The canonical Main chart is the input to `ReferenceTrack` and the speed ramp, and each crossing uses its fixed world station. Boost changes the arrival time. Branch gates replace the canonical run segment at route selection, and each route carries its measured 3D arc length through the merge.

Impossible Standard uses stations at 1.15× the normal distance from the runway start for the centerline curves, gates, pickup and junction. Gate beats and profiles carry forward. The same reference supplies the cruise finish and full-Boost reach for Encore. `daybreak-impossible-timing` holds results from this layout, and `daybreak-choreography` retains the earlier Impossible results.

| Junction cue | Beat |
| --- | --- |
| Preview | 224 |
| Choice | 228 |
| Separate cabins | 232–256 |
| Rejoin | 259 |

Main stays at the centerline. The side routes are 11.2 units outward and 3.2 units above Main when fully separated. A quintic offset eases the position and tangent into and out of each branch. Seeded left/right placement and the existing 1.00×, 2.00× and 0.65× route multipliers apply to the Main, Challenge and Bonus groups of 15, 16 and 26 gates before difficulty and mode trims.

The pickup appears on the centerline at beat 152 with an eight-beat reference preview and the shared 0.7-unit collection radius. Shield, Resonance and Lumen share the production deck and scoring.

## Encore and daylight

The first Encore starts beyond the nominal 144-second cruise finish. Seeded 75–85 unit spacing and the farthest safe crossing set the gate count. The planner evaluates fixed-step full Boost travel for every route and reserves at least 10 seconds after the 42-unit exit from the final reward gate. Sightseeing has the light-only continuation. Encore retains its isolated performance counters and shared bonus scoring.

Afterglow brightens the existing sky gradient toward a warm horizon and introduces warmer reflections on the canopy and distant haze. The sky remains one background draw. The existing white overlay reaches 99% over music beats 276–288. A nearby reachable gate limits the white buildup while the player needs to judge its opening. The successful crash-to-results interval lets the white clear onto the cabin. Terminated runs use the existing failure feedback.

## World ownership and inspection

DAYBREAK's centerline uses long straights and three shallow authored S-curves. The Far Shell uses the same cabin cross-section and path as the detailed 210-unit chunks. Each station has one active shell owner. Both representations defer the junction interval to its shared shell, which includes the three raised cabins and the widened entry and rejoin sections. Far panels share the existing canopy and lower-shell materials. The renderer extends and retires menu-only geometry, and Results eases to a stop over approximately nine units inside the available corridor.

From `/debug/#outro`, choose **World → DAYBREAK** and open the live ending. The studio exposes the actual junction, pickup, last main gate, Encore, Afterglow, white fade and Results camera, with separate spatial and music controls. **World Continuity** runs the 5-, 15- and 30-minute Menu and Results previews and shows near and far coverage. The new results use the `daybreak-gameplay` records namespace. Legacy DAYBREAK and DRIFT entries remain in storage.
