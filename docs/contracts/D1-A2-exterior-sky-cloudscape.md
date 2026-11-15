# D1-A2 · DAYBREAK Exterior Sky & Cloudscape

DAYBREAK is a closed observation cabin above a continuous sea of clouds. Clear blue at the zenith and through the middle sky gives way to warm white and pale gold at the horizon. The cloud deck has large soft ridges, broad blue-grey shadows and warm sunward crests.

## Sky, cloud surface and cabin light

[`DaybreakExterior`](../../app/game/graphics/daybreak-exterior.client.ts) draws the sky and an analytic cloud sheet in one opaque background draw, behind solid cabin geometry and before transparent canopy and gate passes. The sky cube uses camera rotation to recover world rays. Its position has no effect on the sky direction or horizon. The cloud sheet intersects the same rays in absolute XZ coordinates and begins 22 world units below the lowest authored centerline. Surface relief is bounded to ±8 units. The field uses one deterministic, mipmapped 256×256 RGBA texture with height and slope, sampled at two world scales. Cloud shading uses the slope directed toward the sun. Distance and low-angle scattering blend the surface into the sky. A slow drift follows the existing run time.

The sun direction comes from the final path tangent, turned 0.27 rad toward the right and raised about 8.5°. The daylit hemisphere and ambient fill use the same palette as the exterior. The shared architectural canopy takes its subtle edge tint from the sky. The far cabin uses daylight haze at the existing camera far plane. Holographic gate optics and route lights keep their original materials.

| Chapter | Beats | Light and sky |
| --- | --- | --- |
| OPEN | 0–16 | Cooler blue, soft cloud shadows and a low dawn glow |
| GLIDE | 16–80 | Brighter mid-sky and a clearer horizon |
| LIFT | 80–128 | Warmer light on the cloud crests |
| BREEZE | 128–160 | Clearest sky and the longest view of the cloud deck |
| SUNBURST | 160–224 | Brightest and warmest sunlight |
| RETURN | 224–272 | Stable clear blue as the sun softens |
| OUTRO | 272–288 | Warm horizon leading into the existing white cue |

The atmosphere samples the seven chapter midpoints from the production score and blends adjacent looks with the existing quintic ease. Menu samples the stable GLIDE look. Results holds the finished or failed score beat. The shared Escape White scalar and existing Afterglow lift supply a bounded warm blend on top of the atmosphere. The overlay retains exclusive control of the near-white screen peak and Results retreat.

## Preview and cost

Open [End Sequence Studio](../../app/components/EndSequenceStudio.tsx) at `/debug/#outro`, select DAYBREAK and open the live view. The exterior controls show all seven chapter looks and the forward, upward, side, horizon and cloud-sea views. Cloud Sea lifts the inspection camera above the roof. The normal course camera stays inside the closed cabin. Existing presets show junctions, Escape White, Menu and Results.

Low retains the shared sky and surface silhouettes. Auto and High enable one relief re-projection and progressively stronger detail. The cloud lookup belongs to the volume's GPU lifetime. Its immutable CPU backing is shared across switches and restorations. The atmosphere uses the current scene, fog and PostFX, adding no render target or fullscreen post pass.

A2-B follows visual acceptance of this foundation and will refine cloud top layering, sparse cirrus, atmospheric texture and the sun's directional response on canopy and metal.
