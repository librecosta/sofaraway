# ORBIT — seven cosmic setpieces

The frozen STARWAKE score, aperture course, route selection, records and ending
rules remain unchanged. This extends the B2 world and stable camera policy.

[`orbit-setpieces.ts`](../../app/game/core/orbit-setpieces.ts) derives chapter
ranges from STARWAKE and the active Path's ReferenceTrack. Anchors, local frames,
hero bounds and fragment descriptions are deterministic world data. Playback
time, quality and ordinary chunk loading order are not inputs. Preview stations
precede some anchors so the large silhouettes can be inspected on approach.

| Chapter | Fixed spatial composition |
| --- | --- |
| OUTER BELT | A tall, asymmetrical, ridged monolith and sparse companions |
| DRIFT | Two differently cleaved hero bodies around a short open fracture |
| RINGBREAK | Inclined elliptical debris arcs with three missing sectors, varying width and detached layers |
| MAELSTROM | Three interleaved debris streams sampled along the curved Path, tapering toward the exit |
| ECLIPSE | An opaque moon in front of a larger, distant stellar sphere and a soft corona |
| AURORA | Four separately composed world-space gas structures with ridges, cliffs, pillars, tributaries and absorbing dust |
| APHELION | A distant shaded gas giant, cloud bands and atmosphere; it persists through Encore and Results |

`OrbitClearance.allowsSphere()` checks large bodies against the complete capsule
set rather than the ordinary 42-unit rock index assumption. Every hero LOD fits
its declared unit sphere. Fragment placement uses the existing route hull and
sightline protection, including all three BranchPaths. Landmarks have no gameplay
collision and do not move gates, pickups or route guides.

[`OrbitSetpieces`](../../app/game/graphics/orbit-setpieces.client.ts) owns bounded,
overlapping spatial windows. It shares the ordinary rock prototypes, batches
fragments by shape/LOD and applies screen-size LOD with hysteresis. Five separate
hero shape families have their own LODs. Quality reduces small fragments, body
tessellation and noise octaves without removing any principal scene. Inactive
windows release instance buffers and materials; shared templates outlive them.

The astronomical projection preserves actual world XY/W and therefore angular
size and parallax. Only depths beyond the ordinary 570-unit field are mapped
monotonically into the far depth band below the unchanged 680-unit camera clip.
The same mapping applies to bodies, fragment proxies and gas. Depth testing stays
enabled; the moon occludes the stellar body. No extra fullscreen pass is added.

The sky retains its directional stars and adds a few seeded star clusters. Gas
uses filtered multi-scale noise and domain warping. Dust opacity attenuates the
background, while gas emission is independently colored. ECLIPSE's spatial
envelope also turns the existing key toward the star and reduces fill; no beat
clock, random camera motion or new dynamic lights are introduced.

`/debug/#orbit` exposes all seven inspection stations and continuous flight using
the production renderer. Metrics include submitted macro fragments, active
windows, fixed anchors and scene-object counts. Tests cover bounds, determinism,
modes, quality, GPU rendering, repeated seeks, transitions and context recovery.

## C2 structural enrichment

Five hero families now share a fixed deformation envelope across LODs:
fractured monolith, twin lobes, displaced cliff strata, impact excavation and
elongated shard. Broad fault ribs and cleavage planes are geometry; fine mineral
and crack detail remains future work. Detached fragment fans use the parent
body's rotation and dimensions. Their actual bounds retain the same route checks.

[`orbit-ring.ts`](../../app/game/core/orbit-ring.ts) replaces hard angular deletions
with a continuous gap/density field. A broad eccentric belt, two narrow ringlets,
a displaced sheet and fine debris have different widths, depths, inclinations
and fracture offsets. Tangential fragment fans leave the torn edges. All layers
share the existing instanced rock batches and fixed RINGBREAK anchor.

Nebula descriptors separately position a distant arched ridge, gas cliff, leaning
pillars and foreground tributaries. Each uses a different macro density function
before filtered meso flow and limited fine detail. Dust optical depth, gas density
and emission are separate. Premultiplied radiance blends back-to-front through
the normal world-space transparent sort; layers retain depth testing, disable
depth writes and use the common astronomical projection. Their physical planes
are parallel and separated in depth. Glass retains its existing later render order.
No exposure, bloom, camera, music or gameplay changes are part of C2.
