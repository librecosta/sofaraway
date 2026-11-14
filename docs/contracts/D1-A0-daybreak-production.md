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

[The score](../../app/game/core/daybreak-score.ts) holds the approved 120 BPM Groove-No-Chime backing. Drums, bass, short chord strokes and the quiet atmosphere share the original voicing and timing. [The live synthesizer](../../app/game/audio/daybreak.client.ts) and [offline renderer](../../app/game/audio/daybreak-export.client.ts) schedule the same events and voice code. The live output bus applies the player’s volume setting after the approved mix. The active audio clock drives the DAYBREAK run, with a monotonic fallback for silent play. Resume preserves the run position and skips individual onsets already rendered, including onsets that fall after a sixteenth-note grid tick.

The run ends after 144 seconds of song time. The WAV export includes a two-second tail. Against the local approved WAV at 44.1 kHz, the production render had a residual RMS of −98.76 dBFS. The exported mix measured −16.6 LUFS integrated, −3.34 dBFS sample peak and −17.90 dBFS RMS.

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
