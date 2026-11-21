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

## C2-F1 continuity and secondary structure

Hero meshes now keep one shared surface throughout an approach: high geometry
on Auto/High, medium on Low. Browser captures isolated whole-face normal and
ridge changes at the former 130/550 px replacements, with full presence and no
shader compilation. Only an explicit quality change can replace a hero surface.
Ordinary and macro fragments with radius at least six units also use a fixed
quality-level prototype. Smaller fragments retain projected-size LOD and
hysteresis, now confined to small screen coverage. The near ordinary prototype
uses a cheaper subdivision to bound the cost; chunk streaming remains intact.

Detached hero plates follow parent cleavage frames without moving existing
landmarks. Ring fracture mouths have large torn slabs; local clumping modulates
belt thickness and fragment sizes, with sparse eroded shelves outside the edge.
Spiral streams gain compact knots, ECLIPSE gains a few silhouette fragments, and
APHELION gains a small distant satellite. AURORA adds two local, separated gas
regions: a filament fan and a hollow stellar nursery. They retain premultiplied
emission/extinction, world sorting, edge falloff and the shared depth mapping.
Primary anchors, route clearance, score, audio and gate contracts are unchanged.

Same-device C2/F1 comparison (Chrome 157, AMD Radeon D3D11, 960×540, DPR 1,
two 180-frame samples per scene/tier): High RINGBREAK rises from 69,248 to
217,935 triangles and 185 to 218 calls; GPU P95 averages 2.48/2.52 ms, CPU P95
2.25/2.55 ms. Programs stay at 11, geometries drop from 27 to 24, textures stay
at four. The added geometry and calls have a measured cost; these short samples do not
establish a timing improvement. High AURORA GPU P95 is 4.70/4.65 ms. Fixed Hero surfaces are
affordable on this device; lower tiers retain the same compositions.
