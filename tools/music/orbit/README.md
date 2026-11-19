# ORBIT — STARWAKE

The selected **B — STARWAKE** audition is expanded into the authoritative
**Melodic Cosmic Electronica** score: **128 BPM, 4/4, 96 bars / 384 beats**,
a **180-second body** and **four-second release**. GRAVITY remains historical.

The playable ORBIT course still uses ELSEWHERE's temporary **448-beat**
soundtrack and chart. This task does not activate STARWAKE in gameplay.
Music, sections, gates, reference stations, branches, Encore and records must
switch together in the later integration.

## Full arrangement

| Section | Bars, zero based | Seconds | Development |
| --- | --- | --- | --- |
| OUTER BELT | 0–8 | 0–15 | Exposed Fadd9 space; crystal notes, pulse and a partial theme enter separately. |
| DRIFT | 8–24 | 15–45 | Four related phrases: invitation, answer, travelling melody and dominant question; bass and arpeggio layouts change. |
| RINGBREAK | 24–40 | 45–75 | Original rising-fifth theme, its answer and a broader variant; inversions connect the harmony. |
| MAELSTROM | 40–56 | 75–105 | Displaced kick responses, ghost snares, moving bass and borrowed E-flat / half-diminished harmony. |
| ECLIPSE | 56–64 | 105–120 | Backbeat withdraws; sustained harmony, isolated melody and low pulses prepare A7. |
| AURORA | 64–80 | 120–150 | Recognizable theme with longer articulations, rising answer, melodic summit and descending release; plucks leave more space. |
| APHELION | 80–96 | 150–180 | Eight driving bars, theme recollection, thinning drums and a final Fadd9 coda; room decays after the body. |

The 24 authored four-bar phrases develop harmony, groove, bass, arpeggiation
and motif. They are not two copies of the 48-bar audition. The approved
triangle/sine lead, restrained FM pluck, warm bass, drum voices, three dark
stereo delay taps and 2.9-second procedural room retain B's sound identity.
The full score uses a fixed 0.65 master trim and the original gentle compressor;
there is no per-section loudness normalization.

## Sources and event contract

- `app/game/core/orbit-score.ts`: `starwakeTrack`, `starwakePhrases`,
  `starwakeEvents` and `starwakeSteps`; the only full score.
- `app/game/audio/orbit-voices.client.ts`: shared instruments, mix and effects.
- `app/game/audio/orbit.client.ts`: `OrbitSynthesizer`, compatible with shared
  transport step scheduling, fractional attacks, elapsed-event filtering and disposal.
- `app/game/audio/orbit-export.client.ts`: `renderStarwake()` and
  `encodeStarwakeWav()`, using that same production synthesizer.

Events expose stable numeric ID and string identity, bar, beat, seconds,
voice, velocity, section, accent, fill and transition flags. Pitched events
also carry pitches and durations. Voices are kick, snare, hat, percussion,
bass, pad/chord, pluck/arpeggio, lead/motif and sweep. Fractional positions are
retained rather than snapped to the scheduling grid. These are the future
gate and lighting cue source; no second audio clock is introduced.

All notes, noise and convolution impulses are generated at runtime. Common
gain/filter/frequency/random primitives come from the existing audio layer.
No external samples or dependencies are added.

## Export and verification

Use Node 24 and installed Playwright Chromium; set
`PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome.

```sh
node tools/music/orbit/export.mjs --verify
node tools/music/orbit/verify.mjs
npm run typecheck && npm test
node --test tools/music/orbit/score.test.mjs
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

The checked Chrome 157 master runs **184 seconds**, including its release.
Independent BS.1770 integrated measurement (pyloudnorm) is **-19.04 LUFS**;
full-file RMS is **-20.46 dBFS**, sample peak **-3.57 dBFS**, and estimated
four-times polyphase true peak **-3.43 dBTP**. It is 0.23 LU above the selected
B audition. The full PCM contains zero clipped/non-finite samples, with no
sustained body silence; the final sample is zero. Independent full renders
differ by **0.3605 PCM codes RMS / 10 codes peak**. The 5.75 dB ECLIPSE-to-AURORA
contrast comes from the arrangement and individual articulations.

| Section | RMS dBFS |
| --- | ---: |
| OUTER BELT | -24.21 |
| DRIFT | -20.15 |
| RINGBREAK | -19.81 |
| MAELSTROM | -19.86 |
| ECLIPSE | -24.92 |
| AURORA | -19.16 |
| APHELION | -20.39 |

Exact measurements, the WAV hash and repeat-render results are retained locally
in `starwake-validation.json` and `starwake-master-analysis.json` beside the WAV.

## Historical auditions

The original 48-bar scores remain in `score.mjs`, unchanged. Their historical
`voices.mjs` adapter uses the promoted instrument implementation with the
original profiles, event IDs, timing and mix. `render.mjs` retains the original
static audition loudness trim. Export them explicitly with:

```sh
node tools/music/orbit/export.mjs --prototypes --verify
node tools/music/orbit/verify.mjs --prototypes
```

These write `ORBIT-M0-A-GRAVITY.wav`, `ORBIT-M0-B-STARWAKE.wav` and
`audio-validation.json` in the same ignored export directory. The existing
reference auditions are retained for comparison. Both are 94 seconds,
including a four-second release. Their measured integrated loudness is
-19.07 LUFS / -19.26 LUFS respectively. Historical score tests remain runnable
independently of the new full score.
