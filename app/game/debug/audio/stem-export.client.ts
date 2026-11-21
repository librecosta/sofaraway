import type { AudioStem } from '../../audio/stem-routing';
import { encodeWav } from '../audio-export.client';
import { inspectorOffline } from './offline.client';
import { inspectorSource } from './source.client';
import { defaultMix, inspectorPreroll, stemsFor } from './track-adapter';
import type { InspectorScore } from './track-adapter';

/** Unity stem audition through the original shared master processing. */
export async function renderStem(score: InspectorScore, stem: AudioStem, signal?: AbortSignal,
  progress?: (fraction: number) => void) {
  if (!stemsFor(score.volume,score.arrangement).includes(stem)) throw new Error('Stem does not belong to this arrangement.');
  signal?.throwIfAborted();
  const rate = 44_100, frames = Math.ceil(score.length * rate);
  // Only the final stereo PCM is retained. Offline graphs are bounded and serialized with waveforms.
  let result: AudioBuffer | undefined;
  for (let first = 0; first < score.length; first += 10) {
    const end = Math.min(first + 10, score.length);
    await inspectorOffline(signal, async () => {
      // A canceled export waiting behind a waveform must not allocate full-song PCM.
      result ??= new AudioBuffer({ numberOfChannels: 2, length: frames, sampleRate: rate });
      const start = Math.max(0, first - inspectorPreroll(score));
      const ctx = new OfflineAudioContext(2, Math.ceil((end - start) * rate), rate);
      const source = inspectorSource(ctx, score, ctx.destination, defaultMix(), null, stem);
      try {
        const authored = score.volume.music === 'control' || score.volume.music === 'starwake';
        const firstStep = authored ? Math.floor(start / score.step) : Math.ceil(start / score.step - 1e-8);
        for (let i = firstStep; i < Math.min(score.volume.beats * 4, Math.ceil(end / score.step)); i++) {
          const at = i * score.step - start;
          source.playStep(i, authored ? at : Math.max(0, at), start - 1e-8);
        }
        source.finishAt(score.duration - start);
        const block = await ctx.startRendering();
        signal?.throwIfAborted();
        const offset = Math.round(first * rate), skip = Math.round((first - start) * rate);
        const count = Math.min(frames - offset, Math.round((end - first) * rate));
        for (let channel = 0; channel < 2; channel++) {
          result.copyToChannel(block.getChannelData(channel).subarray(skip, skip + count), channel, offset);
        }
      } finally { source.dispose(); }
    });
    signal?.throwIfAborted();
    progress?.(end / score.length);
  }
  const buffer = result!;
  let peak = 0;
  for (let channel = 0; channel < 2; channel++) for (const sample of buffer.getChannelData(channel)) {
    if (!Number.isFinite(sample)) throw new Error('Stem contains invalid audio samples.');
    peak = Math.max(peak, Math.abs(sample));
  }
  // A solo stem can exceed the full mix after nonlinear shared compression.
  // Protect this derived export only; production masters and audition gains are untouched.
  const trim = peak >= 1 ? .98 / peak : 1;
  if (trim !== 1) for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) samples[i] *= trim;
  }
  return { buffer, peak: peak * trim, trim };
}

export async function exportStem(score: InspectorScore, stem: AudioStem, signal?: AbortSignal,
  progress?: (fraction: number) => void) {
  const { buffer, peak, trim } = await renderStem(score, stem, signal, progress);
  signal?.throwIfAborted();
  const title = score.volume.music === 'starwake' ? (score.arrangement === 'm1' ? 'STARWAKE-M1' : 'STARWAKE') : score.volume.music === 'control' ? 'CONTROL'
    : score.volume.music === 'breakbeat' ? 'GLASSHOUSE' : 'ELSEWHERE';
  return { blob: encodeWav(buffer), duration: buffer.duration, peak, trim,
    filename: `${score.volume.id.toUpperCase()}-${title}-${stem.toUpperCase()}.wav` };
}
