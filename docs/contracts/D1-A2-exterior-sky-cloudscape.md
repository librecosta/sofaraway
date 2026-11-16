# D1-A2 · DAYBREAK Exterior Sky & Cloudscape

DAYBREAK is a closed observation cabin above a continuous sea of clouds. Clear blue at the zenith and through the middle sky gives way to warm white and pale gold at the horizon. The cloud deck has large soft ridges, broad blue-grey shadows and warm sunward crests.

## Sky, cloud surface and cabin light

[`DaybreakExterior`](../../app/game/graphics/daybreak-exterior.client.ts) draws the sky and an analytic cloud sheet in one opaque background draw, behind solid cabin geometry and before transparent canopy and gate passes. The sky cube uses camera rotation to recover world rays. Sparse cirrus follows world direction, using elongated, warped strands in the alpha channel of the cloud texture.

The sea lies 22 world units below the lowest authored centerline and has up to ±8 units of relief. Warped primary banks and correlated secondary rises form a deterministic, mipmapped 256×256 RGBA field that repeats every 12,288 world units in XZ. A bounded height correction projects world rays onto the surface. A second spatial scale adds nearby billows. At grazing angles the sampler uses the projected pixel footprint to select a mip level and the deck blends into the same air as the horizon.

The sun direction comes from the final path tangent, turned 0.27 rad toward the right and raised about 8.5°. Cloud slopes facing it catch warm light. The cabin's existing hemisphere tilts toward the sun's bearing over a cooler ambient fill. The architectural canopy transforms the world sun direction into view space before calculating trim and grazing reflections. Its opacity remains low through the pane centers. The far cabin uses daylight haze at the existing camera far plane. Holographic gate optics and route lights keep their original materials.

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

Low, Auto and High share the macro cloud field, height correction and main cirrus strands. Profile differences come from the finer cloud and cirrus sampling and their contrast. The cloud lookup belongs to the volume's GPU lifetime. Its immutable CPU backing is shared across switches and restorations. The atmosphere uses the current scene, fog and PostFX, adding no render target or fullscreen post pass.
