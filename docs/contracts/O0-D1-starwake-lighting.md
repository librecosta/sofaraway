# STARWAKE cosmic lighting

This replaces ORBIT's fixed-only lighting policy from `da94ee4`. It preserves the
world layouts, stable lens, hero surfaces, gates, music and gameplay contracts.

[`orbit-lighting.ts`](../../app/game/core/orbit-lighting.ts) indexes the frozen
STARWAKE events by overlapping envelope intervals. Its output is a pure function
of music beat, intensity and Reduced Motion; seeking never replays an attack.
Section targets crossfade over 16 beats. LEAD and PAD have sustained envelopes,
SWEEP prepares local transitions, and drum accents never reach the global rig.

The existing key, fill and ambient lights supply a readable base everywhere.
First Light reveals rock faces; Twin Shadows separates warm and cool surfaces;
Shattered Resonance follows the natural ring arc; Cosmic Turbulence staggers
accents along the spiral; Silent Occultation suppresses activity while revealing
the corona; Celestial Bloom unfolds six gas structures in separate phases;
Long Farewell settles to the neutral rig before the audio tail and Results.

[`OrbitSurfaceLights`](../../app/game/graphics/orbit-light-rig.ts) adds bounded
spatial masks to existing PBR radiance. Nebula uniforms modulate emissivity and
color, preserving optical depth, dust extinction, premultiplied alpha and depth
ordering. The sky only emphasizes an existing stellar cluster. No new light,
geometry, texture, render pass or per-frame instance upload is introduced.

World station alone still controls scene presence and streaming. Early Boost
and late Sightseeing arrivals retain base illumination. Dynamic Lights off uses
the original neutral rig; Reduced Motion keeps slow chapter and bloom changes
with no transient or traveling highlights. The production audio-output position
drives the score through the existing Runtime. `/debug/#orbit` uses the same
score and shaders with independent world station and music controls, using the
shared AudioTransport for auditioning.

The [core tests](../../tests/core/orbit-lighting.test.ts) cover indexed authority,
sustain, deterministic seeks, continuity and accessibility. The [browser tests](../../tests/browser/orbit-lighting.spec.ts)
check real shaders, geometry identity, disposal, preview recovery and bounded
climax resources. The full ORBIT run and route tests enable the score and check
the existing audio clock, stable lens, crossings and ending.
