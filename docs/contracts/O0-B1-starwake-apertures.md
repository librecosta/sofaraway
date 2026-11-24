# ORBIT — STARWAKE and aperture course

This supersedes the A4 temporary ELSEWHERE music, chart and gate template.
The frozen [STARWAKE score](../../app/game/core/orbit-score.ts), voices and mix
are unchanged: 128 BPM, 384 beats, 180 seconds plus a four-second release.
The Volume derives all seven section boundaries from `starwakeTrack`.
Runtime, Audio Inspector and WAV export use the same synthesizer and events.

## Openings and geometry

[`orbit-gates.ts`](../../app/game/core/orbit-gates.ts) owns 24 finite presets:
12 Single, six Dual and six Triple. All holes are traversable. Circle uses
Euclidean clearance, Square uses max-axis clearance and Diamond uses normalized
Manhattan clearance. Nine anchors derive from `SECTION`; three finite sizes
are independent of difficulty. `axis` chooses a suggested target, never removes
an opening or changes geometry.

The existing glass builder triangulates the octagonal plate with actual holes,
front/back bevels and throat walls. Thickness remains 0.38. A volume-owned cache
shares one indexed geometry per preset; the ORBIT shader measures up to three
analytic rims without cutting holes in the fragment shader. Other volumes keep
their original geometry and optics. The CPU boundary is the narrow throat;
circumscribed circle facets differ by less than 0.0014 world units.

## Chart, routes and ending

[`orbit-chart.ts`](../../app/game/core/orbit-chart.ts) selects actual Kick,
Snare, Percussion and accented Lead events. The opening and ECLIPSE stay sparse;
MAELSTROM and AURORA develop denser multi-aperture motion. Impossible retains
every Hard anchor, central resets and authored multi-hole phrase responses.
The C4-A density pass preserves all 2ec9709 gate beats and openings and supplements
Normal/Hard from 81 to 92 gates (+13.58%), Impossible from 114 to 135 (+18.42%).
F0 adopts the same 92-gate chart for Easy, including the standard Challenge
route. Lives and score multipliers still distinguish the three difficulties.
Section counts in score order are:

| Difficulty | OUTER | DRIFT | RINGBREAK | MAELSTROM | ECLIPSE | AURORA | APHELION |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Easy / Normal / Hard | 3 | 19 | 12 | 22 | 2 | 22 | 12 |
| Impossible | 3 | 33 | 19 | 29 | 2 | 30 | 19 |

The original 81-gate skeleton remains the motion reference, so added crossings
do not accelerate cruise or relocate existing gates, branch bounds, setpieces
or Encore. New rows use existing openings and actual STARWAKE accent beats.
Fixed-step checks include continuous keyboard pursuit and every incoming
aperture with 150 ms reaction at maximum Boost.

RINGBREAK uses preview 108, choice 120, route entry 128, merge 148 and rejoin
156. Ordinary gates are absent from 108–128 and 147–158. Bonus cargo is at 145.
Main, Challenge and Bonus retain the shared seeded route system. OrbitWorld
protects the actual three BranchPaths and their 450-unit gate observation spans.
Natural S-curves remain outside the selection window.
The standard run totals are 92 on Main, 93 on Challenge and 89 on Bonus.

Encore uses the same three aperture families and shared bounded world-space
planner, reserving eight seconds at maximum Boost for open-space Afterglow.
Sightseeing retains its shared sparse chart and has no reward gates. Impossible
uses its 1.15× reference for gates, paths, belts, branch clearance and bounds.
Results use the shared transition; audio continues its four-second release.

Density-rebalanced runs use `orbit-starwake-density-v2`. Historical `orbit`,
`orbit-astral-playable-v1` and `orbit-starwake-aperture-v1` Standard, Impossible
and Sightseeing data remain readable and are never overwritten.

## Verification surfaces

`/?vol=orbit` is the production Runtime. `/debug/#gates-orbit` selects every
preset with full, close and side views. `/debug/audio/?vol=orbit` renders the
production master and supports seek and resume. Core checks include every
hole's geometry, nondegenerate triangles, keyboard damping with 150 ms reaction,
all outgoing aperture choices, branch permutations and full-Boost Encore.
Browser checks render actual GPU openings, steer the complete junction and run
the real transport for the full song and release.
