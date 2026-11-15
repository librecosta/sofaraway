# D1-A0 · DAYBREAK production integration

VOL. II is DAYBREAK. The game keeps the `drift` ID and accepts both `?vol=drift` and `?vol=daybreak`. The existing canal, sky, shutter geometry, movement and scoring rules carry forward.

| Section | Beats | Seconds | Easy gates | Normal / Hard gates |
| --- | --- | --- | ---: | ---: |
| OPEN | 0–16 | 0–8 | 0 | 0 |
| GLIDE | 16–80 | 8–40 | 11 | 16 |
| LIFT | 80–128 | 40–64 | 8 | 12 |
| BREEZE | 128–160 | 64–80 | 3 | 4 |
| SUNBURST | 160–224 | 80–112 | 14 | 21 |
| RETURN | 224–272 | 112–136 | 8 | 12 |
| OUTRO | 272–288 | 136–144 | 0 | 0 |

## Score and playback

[The score](../../app/game/core/daybreak-score.ts) carries the locked 120 BPM percussion and the GLASSHOUSE completion. [The live synthesizer](../../app/game/audio/daybreak.client.ts) and [offline renderer](../../app/game/audio/daybreak-export.client.ts) schedule the same events and voice code. The live output bus applies the player’s volume setting after the mix. The active audio clock drives the DAYBREAK run, with a monotonic fallback for silent play. Resume preserves the run position and skips individual onsets already rendered, including onsets that fall after a sixteenth-note grid tick.

The run ends after 144 seconds of song time. The WAV export includes a two-second tail.

### GLASSHOUSE completion

The completion is a 120 BPM breakbeat in D major. Keys, Lead and Atmos accompany the established Kick, Snare and Hats.

- **Keys** — a two-octave pad plus syncopated glass chord plucks and an 8th/16th glass arpeggio. The low pad and its octave-up layer share a 0.95-width stereo image; the arp sits in the 400 Hz–4 kHz band so it does not fight the hats. The pad filter opens across the song (1.4 kHz in OPEN, 2.4 kHz in GLIDE, 4.4 kHz in LIFT, 8 kHz in SUNBURST, 4 kHz in RETURN).
- **Lead** — sparse long-note Sunlit Mallet phrases from OPEN through OUTRO. The phrases leave the drum fills and BREEZE’s first four bars open.
- **Atmos** — a filtered high shimmer in OPEN, BREEZE and OUTRO, one-bar noise risers into LIFT, BREEZE, SUNBURST and RETURN, and a soft impact at SUNBURST.

The production graph uses six stems. Keys, Lead and Atmos use room sends of .32, .19 and .50, respectively. The drums use .055. The Audio Inspector uses the same voices and sends as the production synth. The master stage is 1.90.

Before the Bass was removed, the 144-second GLASSHOUSE render at 44.1 kHz measured −18.07 dBFS RMS and −1.70 dBFS sample peak, with zero clipped samples.

The outro carries the pad and the final mallet note through the last bar. `verify.mjs` checks that the last bar has content and that the export tail closes at zero, replacing the old percussion-only silent-last-bar assertion.

The final mix removes the auditioned Bass stem and its Kick ducking. Score regression checks compare every remaining event with the auditioned arrangement.

## Gates and lighting

The chart can shift a nominal gate by up to half a beat toward an authored kick. A 2.5-beat minimum gap takes precedence over kick alignment. `ReferenceTrack` resolves gate beats to fixed stations and the existing swept crossing judges them. At cruise the first and last Standard crossings are at about 8 and 134 seconds. Sightseeing keeps 21 authored gates with five lives and one-third speed.

DAYBREAK uses the shared Dynamic Light Envelope. On samples actual kick, snare and fill onsets, with the score’s swing and offsets. A 16 ms eased approach leads into a fourth-power decay over half a second. The strongest accents drive structural lighting. BREEZE uses a narrower range than SUNBURST. Off and Reduced Motion keep the base rail lighting. The boost and speed lens effects remain separate from lighting. The other volumes retain their established lighting and audio profiles.

## Records and Debug

`sofaraway.records.v1` preserves the original `drift` entries. DAYBREAK stores Standard and Sightseeing results under `daybreak` in the same record object. Older scores are excluded from DAYBREAK comparisons.

- `/debug/?vol=daybreak#audio` plays the live soundtrack or exports it as WAV. The local CLI is `node tools/music/daybreak/export.mjs --ffmpeg <path>`, followed by `node tools/music/daybreak/verify.mjs`.
- `/debug/#beat-inspection` previews real lighting at Kick, Snare and Fill peaks and between hits. Select DAYBREAK and SUNBURST for the strongest response.
- The DAYBREAK world card lists the chart by section and difficulty, with stations and a link to the end result. The preview leaves local records alone.

## Reference comparison

At 960×540, Low, in Chrome on AMD Radeon, the VOL. II menu used 12 draw calls, 10 shader programs and 9 textures in both builds. At 84.016 seconds the authored chart increased the fixed-scene count from 31 to 44 draw calls and 14,152 to 21,188 triangles. The sample includes an extra streamed chunk and more shutter previews. Dynamic On and Off had identical resource counts at that station. An early live-flight sample measured GPU P95 of 1.74 ms before and 1.65 ms after. CPU P95 in that sample was 0.9 ms before and 3.7 ms after while other checks were running. These short samples do not establish a sustained performance trend.

Fixed-frame renders of ELSEWHERE, DESCENT and ORBIT matched the reference pixels in the sampled scenes. The separate score digests cover their full unchanged voice-event sequences.
