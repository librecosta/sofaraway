# ORBIT — STARWAKE

## Final production soundtrack

The approved M1-F1 from `984175b` is the production STARWAKE. Its 128 BPM score
runs 384 beats over 180 seconds, followed by a four-second release.
Gameplay, the Inspector and `renderStarwake()` share [the production score](../../../app/game/core/orbit-score.ts).
The arrangement retains the original Lead, Pad and rhythm events, with five
quiet Lead quotations added for M1-F1. Original event IDs remain in the
identity table to preserve noise seeds. The [score tests](../../../tests/core/orbit-score.test.ts)
and [gameplay tests](../../../tests/core/orbit-playable.test.ts) freeze the
final event checksum, charts and `orbitCueBeats`.

## Full arrangement

| Section | Bars, zero based | Seconds | Development |
| --- | --- | --- | --- |
| OUTER BELT | 0–8 | 0–15 | Exposed Fadd9 space; quiet theme quotations, pulse and a partial theme enter separately. |
| DRIFT | 8–24 | 15–45 | Four related phrases: invitation, answer, travelling melody and dominant question; Pad supports the unchanged Lead. |
| RINGBREAK | 24–40 | 45–75 | Original rising-fifth theme, its answer and a broader variant; inversions connect the harmony. |
| MAELSTROM | 40–56 | 75–105 | Displaced kick responses, ghost snares, drum movement and borrowed E-flat / half-diminished harmony. |
| ECLIPSE | 56–64 | 105–120 | Backbeat withdraws; sustained harmony, isolated melody and sustained Pad prepare A7. |
| AURORA | 64–80 | 120–150 | Recognizable theme with longer articulations, rising answer, melodic summit and descending release; the Lead remains exposed. |
| APHELION | 80–96 | 150–180 | Eight driving bars, theme recollection, thinning drums and a final Fadd9 coda; room decays after the body. |

The 24 authored four-bar phrases develop harmony, groove and motif. Listen
for the triangle/sine Lead, sustained Pad, drum voices, three dark stereo
delay taps and 2.9-second procedural room. The master uses a fixed 0.65 trim
and the original gentle compressor across all sections.

## Sources and event contract

- [Score](../../../app/game/core/orbit-score.ts) exports `starwakeTrack`,
  `starwakePhrases`, `starwakeEvents` and `starwakeSteps`.
- [Voices](../../../app/game/audio/orbit-voices.client.ts) implements the shared instruments, mix and effects.
- [`OrbitSynthesizer`](../../../app/game/audio/orbit.client.ts) uses shared
  transport step scheduling, fractional attacks, elapsed-event filtering and disposal.
- [WAV export](../../../app/game/audio/orbit-export.client.ts) uses `renderStarwake()` and
  `encodeStarwakeWav()`, using that same production synthesizer.

Events expose stable numeric ID and string identity, bar, beat, seconds,
voice, velocity, section, accent, fill and transition flags. Pitched events
also carry pitches and durations. Production events use kick, snare, hat,
percussion, Pad, Lead and sweep. Fractional positions survive transport
scheduling. [Gate cue selection](../../../app/game/core/orbit-chart.ts) and
the [lighting score](../../../app/game/core/orbit-lighting.ts) read these same events.

All notes, noise and convolution impulses are generated at runtime. Common
gain/filter/frequency/random primitives come from the existing audio layer.
No external samples or dependencies are added.

## Export and verification

Use Node 24 and installed Playwright Chromium; set
`PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome.

```sh
node tools/music/orbit/export.mjs --verify
node tools/music/orbit/verify.mjs
npm run test:unit -- tests/core/orbit-score.test.ts tests/core/orbit-playable.test.ts
```

The full exporter writes only `scratch/orbit-m0/exports/ORBIT-STARWAKE-FULL.wav`
and `starwake-validation.json`. Both are local and ignored. The WAV is
**44.1 kHz, 16-bit stereo PCM** with deterministic TPDF dither. One continuous
OfflineAudioContext retains compressor, delay and convolution history;
there are no rendered blocks or joins. The last 0.4 seconds gently reach zero.
The browser decodes the delivered WAV, and `--verify` renders it twice,
allowing at most 32 PCM codes peak and one code RMS of numerical error.
The PCM scanner checks every sample, section levels, half-second dynamics,
true-peak headroom, body continuity and the final zero sample.

The browser test additionally compares direct voice scheduling with production
step scheduling, checks stereo WAV decoding, source disposal and abort behavior,
and rejects clipped/non-finite buffers. Core tests cover section boundaries,
identity, fractional resume, theme preservation, phrase development and ending.

The production promotion recorded a Chrome 157 export of **184 seconds**, with **-20.85 LUFS**, **-23.11
dBFS RMS**, **-4.09 dBFS sample peak** and approximately **-4.02 dBTP** (4x
estimate). No clipped or non-finite samples occur; the tail reaches zero.
Independent full renders differed by 0.261 PCM codes RMS / 2 codes peak. The
promotion compared the full export against the approved F1 WAV within Web Audio rounding error.
Exact PCM and section measurements remain beside the ignored WAV.

## Historical auditions

The archived [pre-M1 arrangement](history/original-score.ts) included Bass and
Pluck. The rejected rewrite and earlier comparisons are available in Git history.

The original 48-bar scores remain in `score.mjs`, unchanged. Their historical
`voices.mjs` adapter uses the promoted instrument implementation with the
original profiles, event IDs, timing and mix. `render.mjs` retains the original
static audition loudness trim. Export them explicitly with:

```sh
node tools/music/orbit/export.mjs --prototypes --verify
node tools/music/orbit/verify.mjs --prototypes
node --test tools/music/orbit/score.test.mjs
```

These write `ORBIT-M0-A-GRAVITY.wav`, `ORBIT-M0-B-STARWAKE.wav` and
`audio-validation.json` in the same ignored export directory. The existing
reference auditions are retained for comparison. Both are 94 seconds,
including a four-second release. Their measured integrated loudness is
-19.07 LUFS / -19.26 LUFS respectively. Historical score tests remain runnable
independently of the new full score.
