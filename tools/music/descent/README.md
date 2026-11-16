# DESCENT · Listening prototypes

## CONTROL full arrangement

D2-M0-A1 uses 136 BPM, 4/4 and 96 bars. The score runs 169.412 seconds with a 1.6-second release. It starts with the original CONTROL events and shares the original A voices, seed, taps and mix. The full score uses 322 of its 413 kicks on the quarter-note grid. All 22 four-bar drum phrases after ORDER have distinct event patterns.

| Section | Bars, zero-based | Start | Arrangement |
| --- | --- | --- | --- |
| ORDER | 0–8 | 0:00.00 | Original short signal, spaced kick and gradual bass entrance. |
| LOCK | 8–24 | 0:14.12 | CONTROL's piston-like bass and backbeat. An answering bass pattern and two clipped cadences develop the groove. |
| FLIGHT | 24–44 | 0:42.35 | Pickup doubles, running low notes and staggered stabs increase forward motion. |
| PRESSURE | 44–64 | 1:17.65 | F♯ minor rubs against G major. Shortened backbeats and uneven fills tighten the phrase. |
| HOLD | 64–72 | 1:52.94 | Inverted signal, dark taps and isolated pulses. Bass returns once in the count into LOCKDOWN. |
| LOCKDOWN | 72–88 | 2:07.06 | Quarter kicks return with extra doubles. Compressed signals, alternating syncopated stabs and drum answers shape the climax. |
| BREACH | 88–96 | 2:35.29 | Drums pare back as the signal turns downward over a final F♯ minor add-nine chord. |

```sh
node --test tools/music/descent/score.test.mjs tools/music/descent/control-full-score.test.mjs
node tools/music/descent/export.mjs --full --verify
```

`--full` writes only `DESCENT-M0-A1-CONTROL-FULL.wav` in the existing ignored output directory. The 44.1 kHz, 16-bit stereo PCM measures 171.012 s, −18.51 LUFS integrated and −2.16 dBTP estimated by 4× oversampling. HOLD measures −30.12 dBFS RMS, followed by −17.75 dBFS in LOCKDOWN. The longest quiet rest in the body is about one second inside HOLD. The maximum sample-to-sample step at the 11 block joins is 0.00037 full scale. Each join falls below the local 99th-percentile step. The first 14.088 seconds differ from the original A by about 0.25 PCM codes RMS. The full repeat-render residual is about −99 dBFS RMS.

The original A and B masters retain their baseline hashes. In-memory playback renders of those scores match the baseline renderer within Chromium's repeat variation. Six score checks, typecheck, 221 game unit tests and 102 browser tests passed.

## Original D2-M0 prototypes

Both scores are in 4/4 at 136 BPM. The 48-bar body runs 84.706 seconds, followed by a short release. The shared harmonic route grows out of an F♯ minor pedal, opens through D, E and A, borrows G major for the pressure section, and resolves through C♯7. The three-note signal returns at different rhythmic positions and inverts its order at the pullback before the last surge.

| Section | Bars | Time | Arrangement |
| --- | --- | --- | --- |
| ORDER | 1–8 | 0:00–0:14.12 | Exposed signal, clipped chords and sparse kicks. Bass and backbeat enter in stages. |
| LOCK | 9–16 | 0:14.12–0:28.24 | Full groove and a four-bar drum response. |
| FLIGHT | 17–28 | 0:28.24–0:49.41 | Bass phrases answer a moving chord progression. Offbeats and turnover breaks build momentum. |
| PRESSURE | 29–40 | 0:49.41–1:10.59 | F♯/G tension, tighter drums, a low-end pullback and the densest return. |
| BREAKTHROUGH | 41–48 | 1:10.59–1:24.71 | Brief harmonic lift, reduced drums and a final F♯ minor add-nine chord. |

**CONTROL** uses a quarter-note machine pulse interrupted by extra sixteenths, short filtered bass, a tight snare and hard-edged rhythmic stabs. **BREACH** puts most kicks between the quarter notes, moves selected backbeats, and uses ghost snares, split hats and longer bass replies to keep the stride elastic. CONTROL has 157 of 197 kicks on the quarter grid and 25 ghost snares. BREACH has 57 of 184 on that grid and 69 ghost snares.

The voices synthesize pitch-swept kick, resonant snare, shaped hats, harmonically reinforced low bass, a dark FM signal, short chord stabs, inharmonic percussion and filtered transitions. A pair of dark stereo delay taps gives the signal and selected accents a sense of space. The seeded noise and score generate entirely in Web Audio. The production game keeps its own score and synthesis.

## Export and verification

```sh
node --test tools/music/descent/score.test.mjs
node tools/music/descent/export.mjs --verify
```

The exporter uses the installed Playwright Chromium and writes 44.1 kHz, 16-bit stereo WAV files into the ignored `scratch/descent-m0/exports/` directory. `PLAYWRIGHT_CHANNEL=chrome` selects installed Chrome when needed. The offline graph renders in eight-bar sections with one bar of preroll to settle the stereo taps and gentle bus compression. A 25 ms overlap blends the joins. `--verify` checks a second render against the exported PCM within the precision of Web Audio summing and dynamics.

| File | Render length | Integrated loudness | True peak estimate |
| --- | ---: | ---: | ---: |
| `DESCENT-M0-A-CONTROL.wav` | 86.106 s | −18.54 LUFS | −2.12 dBTP |
| `DESCENT-M0-B-BREACH.wav` | 86.106 s | −18.12 LUFS | −4.53 dBTP |

Both PCM files decoded without clipped samples. Loudness uses the BS.1770 meter in pyloudnorm and peak uses 4× oversampling. Repeat-render residuals were about −100 and −98 dBFS RMS. The three score tests, typecheck, 221 unit tests and 102 browser tests passed.
