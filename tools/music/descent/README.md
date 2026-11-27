# DESCENT — CONTROL

## Frozen soundtrack

The approved D2-M0-A1-F1 master defines the official DESCENT soundtrack. CONTROL runs at **136 BPM**, in **4/4**, for **96 bars / 384 beats**. The score lasts **169.412 seconds**. The WAV includes another **1.6 seconds** for the release.

The `controlTrack` export in [descent-score.ts](../../../app/game/core/descent-score.ts) supplies the title, meter, BPM, duration and zero-based section beats to the game. The playhead and game timeline end at beat 384. The audio release is heard after that boundary. See the [facility and laser contract](../../../docs/contracts/D2-A0-descent-facility.md) for the current game chart.

| Section | Beat range, end exclusive | Start | Arrangement |
| --- | --- | --- | --- |
| ORDER | 0–32 | 0:00.00 | Original short signal, spaced kick and gradual bass entrance. |
| LOCK | 32–96 | 0:14.12 | Piston-like bass, backbeat responses and clipped cadences. |
| FLIGHT | 96–176 | 0:42.35 | Pickup doubles, running low notes and staggered stabs. |
| PRESSURE | 176–256 | 1:17.65 | F♯ minor rubs against G major. Short backbeats and uneven fills tighten the phrase. |
| HOLD | 256–288 | 1:52.94 | Inverted signal, dark taps and isolated pulses. |
| LOCKDOWN | 288–352 | 2:07.06 | Quarter kicks, extra doubles and alternating syncopated stabs. |
| BREACH | 352–384 | 2:35.29 | Drums pare back as the signal turns downward over a final F♯ minor add-nine chord. |

The score, [voices](../../../app/game/audio/descent-voices.client.ts) and [synthesizer](../../../app/game/audio/descent.client.ts) generate CONTROL in Web Audio. Gameplay and the [Audio Inspector](/debug/audio/?vol=descent) use this synthesizer through the shared production interface. The dynamic lights read the same kick, snare and ghost onsets. The frozen F1 Signal uses a softer attack, shallower harmonic FM and a darker stereo send from FLIGHT through LOCKDOWN. HOLD keeps its pitches, timing and stereo decay.

## Export and verification

```sh
node --test tools/music/descent/score.test.mjs tools/music/descent/control-full-score.test.mjs
node tools/music/descent/export.mjs --verify
```

The default export writes `scratch/descent-m0/exports/DESCENT-CONTROL.wav`. The ignored output directory keeps the reference and newly rendered masters as separate files. The exporter uses the installed Playwright Chromium and produces 44.1 kHz, 16-bit stereo PCM. `PLAYWRIGHT_CHANNEL=chrome` selects installed Chrome when needed. The CLI and Debug WAV download share the same [offline renderer and PCM encoder](../../../app/game/audio/descent-export.client.ts). Eight-bar render blocks use one bar of preroll and a 25 ms crossfade. `--verify` compares two renders with a small tolerance for Web Audio summing and dynamics.

The approved reference is `DESCENT-M0-A1-F1-CONTROL-FULL.wav` with SHA-256 `65a59e36a2eca5e4e8e748cd898dcff5a60e2425b8a6fde6885f8b14e80351d9`. It is 171.012 seconds long and measures −18.53 LUFS integrated and −2.16 dBTP (4× oversampling). The freeze render matched it within 0.344 16-bit PCM codes RMS and 10 codes peak. Fresh Web Audio renders can differ by small rounding amounts.

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

The voices synthesize pitch-swept kick, resonant snare, shaped hats, harmonically reinforced low bass, a dark FM signal, short chord stabs, inharmonic percussion and filtered transitions. A pair of dark stereo delay taps gives the signal and selected accents a sense of space. The prototype scores retain their original voice profiles and use the same Web Audio synthesis code as the official soundtrack.

```sh
node tools/music/descent/export.mjs --prototypes --verify
```

The A and B exporters remain available for historical comparison.

| File | Render length | Integrated loudness | True peak estimate |
| --- | ---: | ---: | ---: |
| `DESCENT-M0-A-CONTROL.wav` | 86.106 s | −18.54 LUFS | −2.12 dBTP |
| `DESCENT-M0-B-BREACH.wav` | 86.106 s | −18.12 LUFS | −4.53 dBTP |

Both PCM files decoded without clipped samples. Loudness uses the BS.1770 meter in pyloudnorm and peak uses 4× oversampling.
