# ORBIT — seven cosmic setpieces

**O0-E2-F1 update.** Outer Belt and Drift landmarks and the larger Ringbreak fragments are ordinary asteroid instances, using the same four deterministic icosahedral prototypes and surface material as nearby debris. The larger scales are bounded by the existing route clearance and retain geometry within a quality tier. This replaces the bespoke hero families, attached plates and giant ring slabs described in the historical notes below. Chapter stations and the ring arcs remain authoritative.

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

**O0-E3 update.** Aurora keeps its six planes and shared geometry for the life
of the volume. Scene preparation primes the real nebula material with a small,
transparent draw on the active output before flight. Preview and output changes
can also warm it by world station, with six seconds of lead at the maximum
Impossible Boost speed. The planes join the main scene only inside their
original presence window. The browser performance suite records cold and warm
entries, including the timing of the warmup and first visible submission.

**O0-E4 update.** APHELION samples the shared celestial noise volume through
continuous sphere directions. Uneven zonal belts, directional shear and compact
tangent-plane vortices displace the same cloud deck. Quality changes only the
filtered fine cloud samples. The thin shell uses a grazing optical path with a
sun-weighted fade. Both celestial materials are warmed on the live output path
and kept with the setpiece through Encore and Results.

**O0-E6-A update.** APHELION retains the E4 spherical flow and separates the
high condensate deck from the deeper belts in its lighting. The thin inclined
rings share one radial density profile with their shadow on the globe. Ring
visibility tests against the globe analytically within the shared far depth
band. The companion uses the same stellar direction and adds crater relief in
one draw. The four celestial materials and the ring geometry are warmed on the
active output. The ORBIT preview offers course, planet, and moon cameras.

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

## C3 geological surfaces and optical filtering

Hero vertex positions, fixed quality-level geometry, landmark descriptions and
route clearance remain unchanged. One periodic 64³ RGBA gradient field supplies
seamless object-space geology, shared by heroes, ordinary fragments and celestial
clouds. CPU texels are immutable and reused; each world owns and disposes its GPU
volume texture. Mipmaps and explicit pixel-footprint filtering limit distant
grain. Axis lengths include instance and nonuniform model scale, so a thin slab
does not stretch its surface detail. No external textures or new light sources
are needed.

Monoliths carry broken longitudinal seams, lobes have compressed neck regions,
cliffs have warped strata, scars have radial pit-wall texture, and shards have
long fissures. Surface-gradient normals, sparse mineral roughness and restrained
albedo variation provide detail without displacing accepted hero silhouettes.
Ordinary prototypes add bounded cleavage planes and small impact cuts. Tiny
fragments lose contrast before the existing subpixel rejection threshold.
Low retains broad geology; Auto resolves grain; High adds filtered pores.

Gas fibers follow the existing flow fields. Emissivity and dust extinction use
an integrated homogeneous segment, with a stable small-optical-depth limit.
Spatial fades change optical path length before integration. Output conversion
operates on straight color and then restores premultiplied RGB for blending;
depth testing, back-to-front sorting and separate glass ordering remain intact.
Planet bands use the same filtered volume with latitude turbulence and polar
variation. ECLIPSE's corona is softer; celestial sizes and positions do not change.

The implementation draws on [GPU Gems terrain mapping](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu),
[periodic gradient noise](https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-26-implementing-improved-perlin-noise),
[pixel-footprint filtering](https://developer.nvidia.com/gpugems/gpugems/part-iv-image-processing/chapter-25-fast-filter-width-estimates-texture-maps),
[Bennu surface observations](https://science.nasa.gov/missions/osiris-rex/asteroid-bennus-rugged-surface-baffled-nasa-we-finally-know-why/)
and the [Three.js material blend contract](https://threejs.org/docs/pages/Material.html).
These are engineering references, not a claim of physically simulated geology
or volumetric scattering.

Against 955674c on Chrome 157 / AMD Radeon D3D11, 960×540, DPR 1, four
180-frame samples per version/tier give median AURORA GPU P95 of 2.67→2.86 ms
(Low), 3.73→3.88 ms (Auto), and 4.23→4.35 ms (High). CPU P95 medians remain
1.20 / 1.50 / 1.45 ms. At the device's 240 Hz refresh, High frame-interval P95
changes from 4.30 to 8.25 ms; this is a measured scheduling cost, not a claim of
zero regression. AURORA calls/triangles/programs stay 141 / 17,036 / 8 on High;
textures rise from four to five (one 1 MiB base volume plus mipmaps). Tests
observe three GPU volume allocations and three releases across tier reloads.
Fixed-seed before/after frames and continuous player-camera clips are kept in
the ignored `scratch/orbit-c3/` directory, alongside raw interleaved samples.

## C4-B hero surface authenticity

At C4-B, heroes used a separate `OrbitHeroSurface` (superseded by E1 below); ordinary debris, celestial clouds
and their existing volume field are unchanged. The hero path has no sinusoidal
contour bands. Sparse finite fracture planes, local exfoliation patches and
shallow spalls are evaluated on the undeformed body. Three unequal cliff shelves
replace periodic strata. Bounded inward relief, creased face normals and removal
of collapsed triangles give these structures actual lighting and depth without
moving landmarks or increasing their safety envelopes. Geometry stays fixed per
quality tier and is shared by family; no distance-based material variant exists.

A shared, baked 64³ RGBA cellular/grain field supplies UV-free secondary joints
and micro relief. Physical object-axis lengths compensate nonuniform scaling.
Mipmaps, pixel-footprint attenuation and bounded derivative normals limit distant
shimmer. Fresh faces are slightly lighter and less rough; weathered patches are
rougher, with restrained gray/brown variation and very sparse mineral response.
Each world owns one additional volume texture (1 MiB base, about 1.14 MiB with
mips) and releases it with the setpieces. The ten shared hero geometries use
2,399,184 bytes of attributes/indices versus 1,319,520 before (+1.03 MiB for
the complete two-tier cache); this is bounded family data, not per-body copies.

Against 7c92556, two interleaved 240-frame samples per version/scene/tier on
Chrome 157 / AMD Radeon D3D11, 960×540, DPR 1 retain 4.25–4.30 ms frame-interval
P95 across OUTER BELT, DRIFT and boosted RINGBREAK. High OUTER BELT/DRIFT GPU
P95 averages 1.92→1.94 / 1.83→1.86 ms; calls and nine programs are unchanged.
GPU timings vary between samples; these short runs do not establish a speedup.
Fixed-seed angle captures, player-camera approaches and raw measurements are in
the ignored `scratch/orbit-m1/hero-geology/` directory. Tests cover finite normals,
nondegenerate faces, bounded local masks, stable geometry/material identity and
six volume allocations matched by six releases across the three quality tiers.

## E1 shared asteroid surface language

`OrbitRockSurface` now supplies all ordinary, supporting, ring, spiral and hero
rocks. The old phase/sine contour bands were removed from bump, albedo and
roughness; ordinary vertex colors no longer reuse periodic displacement phases.
Geometry positions, fixed hero LOD, world descriptions and music light hooks are
unchanged. Deeper hero relief remains outside this surface-only change.

Four finite artistic lithologies control localized polygonal joints, clasts,
shallow pits, grain and roughness. They draw on the differences described in the
[Bennu boulder classification](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2023JE008019),
without claiming measured physical reconstruction. Existing finite hero face,
fault, exfoliation and weather masks feed the same PBR shader. Fresh faces stay
broad and quiet; secondary detail is patchy rather than all-over wallpaper.

A deterministic mipmapped 64-cubed cellular field is shared across the world.
Bounded object coordinates avoid UV seams; instance/model axis lengths keep micro
grain in physical units under nonuniform scaling. Derivatives and projected
coverage attenuate unresolved features; tiny debris avoids optional grain/micro
samples. Quality changes detail weights, not lithology, geometry or positions.
Normals have bounded slopes in the existing Standard material pipeline.

The independent hero surface owner was removed. Worlds dispose their common
asteroid texture and the unchanged legacy noise texture still used by celestial
clouds. Early rock-only windows upload just the former; celestial windows can
upload both. Nebula optics, celestial shaders and their noise bytes are unchanged.

Fixed-seed before/after captures, real-camera approaches and interleaved scenic
samples are kept in ignored `scratch/orbit-m1/surface-language/`. The test harness
inspects actual supporting instances and all five hero families with production
materials; it does not maintain a separate debug rock shader.

Against e5db83d, Chrome 157 / AMD Radeon D3D11 at 960x540, DPR 1, two
interleaved 180-frame samples per scene/version/tier across beats 20, 116, 192,
240, 280 and 360 give mean scene GPU P95 of 1.83 to 1.79 ms (Low), 3.00 to
3.05 ms (Auto), and 2.80 to 2.93 ms (High). These short samples do not establish
a speedup; High MAELSTROM rises from 2.62 to 3.20 ms. CPU P95 averages remain
1.48 to 1.48, 2.12 to 2.07 and 1.71 to 1.79 ms respectively. Calls, triangles,
geometry and program counts match at every paired station. Texture counts fall
by one in early hero/ring windows and rise by one in celestial windows; ownership
is bounded. Shared ordinary attributes add 94,080 bytes across all prototypes,
not per instance. No distance-driven hero geometry/material switching was added.

Mean scene frame-interval P95 is 4.28 to 4.27 ms (Low), 5.63 to 4.98 ms
(Auto), and 4.26 to 4.63 ms (High). These are scheduling intervals, distinct
from GPU timer results; the small High increase is retained in the evidence.

Verification: typecheck and 329 unit tests passed. The full browser run passed
169/170: DAYBREAK's unrelated full-stem download exceeded 280 seconds; its
isolated rerun passed (1.5 minutes of export). All seven performance cases passed.
Four recorded runtime flights cover Normal mixed Boost, Impossible cruise,
Sightseeing and keyboard-held Impossible Boost, including all three routes and
open-space endings. Menu, near-surface and continuous-frame captures were reviewed;
no new geometry/material switching or WebGL errors were observed.
