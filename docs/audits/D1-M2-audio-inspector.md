# D1-M2 Audio Inspector

Open `/debug/audio/`. DAYBREAK shows the Master mix and six stems from the production synthesizer and score. Snare also contains clap, ghost snare and the paired snare/hat fill. Other volumes use their existing Master chains. The Soundtrack entry in Debug and the legacy WAV URL lead to the Inspector.

## Monitoring

- The time ruler seeks globally. A waveform drag sets that lane's cue without moving global playback. Play on a lane auditions it from its cue, or from the current position if no cue was set. Rewind returns to zero. Stop and pause retain position. Reset Mix leaves cues and position in place.
- Play All sums the stems once. Mute takes priority over Solo in Play All. Each stem's gain controls both dry and room levels. Bass ducking is bypassed when the Kick is excluded or its gain is zero. Lane audition overrides Solo and Mute and uses the lane's own gain. Master audition uses the default stem mix at the current Master gain.
- A single AudioContext provides the playback clock. Seek reconstructs the remaining envelopes of DAYBREAK's Bass, Keys and Atmos notes, fades in and skips elapsed drum attacks. It restarts oscillator phase and room history at the seek point. Other volumes resume on their next scheduled notes. The timeline ends at the authored duration. WAV export includes the original tail.

## Evidence

- A 44.1 kHz stereo render at 78–82 s measured a default-mix peak difference of `0.0000332` and residual RMS of `0.00000634` against the production graph in Chrome. The residual is 86 dB below signal RMS. The all-muted render measured zero. Bass Solo and audition matched within `0.000001` peak, as did audition versus the isolated Bass tap with Kick muted. The seek test resumed an in-progress Atmos note and skipped a past Kick.
- Full 146 s WAV exports from `a1218928971080cd560faf0741463bddbc4ee25c` and the candidate differed by at most three 16-bit PCM counts, with the residual 80.75 dB below signal RMS. Two independent exports of the baseline differed by up to two counts and measured −80.70 dB relative residual on the same machine.
- Waveforms progressively publish real stereo peaks from sequential 22.05 kHz offline blocks. DAYBREAK retains about 0.99 MiB of peak data at 128 bins/s. The largest raw block is 15.3 MiB before audio graph overhead. Offline rendering took about 24 s end to end in the initial Chrome measurement. Playwright observed one live context through playback, seek and audition, one offline block active at a time, and context closure on route exit. Leaving or switching volumes discards pending waveform work after the current offline block finishes.
- Playwright checked 1920×1080, 1280×720, 960×540 and 390×844 at DPR 2. Firefox completed direct waveform and playback checks. The Windows Playwright WebKit build did not expose Web Audio, so audible Safari hardware behavior remains unverified.
