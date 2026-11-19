# ORBIT original soundtrack auditions

Two original **Cosmic Progressive Electronica** arrangements for ASTRAL BELT.
Both use **128 BPM, 4/4, 48 bars / 192 beats**, with a 90-second musical body
and a four-second release. These auditions are independent of the playable
ORBIT course, which continues to use the temporary ELSEWHERE soundtrack.

## Musical directions

**A — GRAVITY** uses displaced kicks, ghost snares, syncopated low bass and
filtered harmonic FM plucks. A falling D-minor cell moves through Dm9,
B-flat major seven and suspended C, with E-flat and A7 adding pressure.
Short lead answers leave room for the broken rhythm and stereo echoes.
AURORA stretches the original motif over broader harmony.

**B — STARWAKE** uses a steadier pulse, longer bass articulations and a warm
triangle/sine melody. Its rising fifth begins over Fadd9, passes through
D minor and suspended dominants, and returns as a fuller melodic response.
AURORA opens the harmony before the ending settles on Fadd9. The lead stays
in a restrained middle register, with filtered delays and a dark stereo room.

| Section | Bars, zero based | Seconds | Development |
| --- | --- | --- | --- |
| OUTER BELT | 0–4 | 0–7.5 | Exposed harmonic space and plucks; drums enter gradually. |
| DRIFT | 4–12 | 7.5–22.5 | Core groove and a partial theme, followed by a cadence. |
| RINGBREAK | 12–20 | 22.5–37.5 | Full theme and contrasting answer with active bass. |
| MAELSTROM | 20–28 | 37.5–52.5 | Borrowed harmony, displaced accents and selected fills. |
| ECLIPSE | 28–32 | 52.5–60 | Bass and backbeat recede; isolated notes sustain the question. |
| AURORA | 32–40 | 60–75 | Expanded theme, answering phrase and strongest ensemble. |
| APHELION | 40–48 | 75–90 | Theme recollection, thinning drums and a resolved coda. |

## Export

Use Node 24 and the repository's installed Playwright Chromium. Select installed
Chrome with `PLAYWRIGHT_CHANNEL=chrome` when needed.

```sh
node --test tools/music/orbit/score.test.mjs
node tools/music/orbit/export.mjs --verify
node tools/music/orbit/verify.mjs
```

The exporter writes these local, ignored files.

- `scratch/orbit-m0/exports/ORBIT-M0-A-GRAVITY.wav`
- `scratch/orbit-m0/exports/ORBIT-M0-B-STARWAKE.wav`
- `scratch/orbit-m0/exports/audio-validation.json`

Each WAV is 44.1 kHz, 16-bit stereo PCM with deterministic TPDF dither.
The browser decodes the delivered WAV before accepting it. A single continuous
OfflineAudioContext retains all compressor, delay and convolution history.
Each master receives a static gain trim toward -20.5 dBFS musical-body RMS,
with a 0.76 sample-peak ceiling. Musical dynamics remain in the score.
`--verify` renders both tracks twice and checks PCM differences within
32 codes peak and one code RMS to accommodate Web Audio summing roundoff.

The validation JSON scans the complete PCM, reports section and half-second
levels, stereo correlation, sample steps and a four-times oversampled,
32-tap windowed-sinc true-peak estimate. It checks peak headroom, the ECLIPSE
contrast, body continuity and the final zero sample.

The checked Chrome 157 exports both run 94 seconds, including the release.
Independent full-file measurements used pyloudnorm's BS.1770 meter and
SciPy four-times polyphase resampling for the true-peak estimate.

| Audition | Integrated LUFS | RMS dBFS, including tail | Sample peak dBFS | Estimated dBTP |
| --- | ---: | ---: | ---: | ---: |
| GRAVITY | -19.07 | -20.69 | -5.18 | -5.18 |
| STARWAKE | -19.26 | -20.69 | -2.86 | -2.81 |

The loudness difference is 0.19 LU. Both files decoded to 44.1 kHz stereo,
contained zero clipped samples and reached zero at the last sample. ECLIPSE
is 7.03 dB below AURORA in GRAVITY and 6.72 dB below it in STARWAKE.
Repeat-render error was 0.334 / 0.356 PCM codes RMS and 2 / 10 codes peak.
Exact export hashes and per-section levels are in the local validation JSON.

## Reusable source

`score.mjs` owns the authored harmony, motifs and event timeline. Each event
has stable ID, section, bar, beat, seconds, voice, velocity, accent and fill
metadata. Pitched events include note or chord pitches and duration. The
`eventSteps()` index retains fractional onset times for future transport,
gate and lighting integration.

`voices.mjs` owns `OrbitSynthesizer`, its instruments, room, filtered delay
taps and score-driven low-frequency ducking. `schedule(anchor, after, before)`
filters elapsed attacks without changing absolute event identities. The only
borrowed synthesis functions are shared frequency, random, gain and filter
primitives. `render.mjs` reuses the existing DAYBREAK PCM encoder. All notes,
noise and convolution impulses are generated from code. Production integration
and expansion to 96 bars follow audition selection.
