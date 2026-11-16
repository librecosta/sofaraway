# DESCENT · D2-M0 listening prototypes

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
