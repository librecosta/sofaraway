import { inspectorSource } from './source.client';
import { defaultMix } from './track-adapter';
import type { InspectorScore, TrackId } from './track-adapter';

export const peaksPerSecond = 128;
const sampleRate = 22_050;
const blockSeconds = 10;
const prerollSeconds = 3;

export interface Peaks { low: Float32Array; high: Float32Array }
export type Waveforms = Partial<Record<TrackId, Peaks>>;

export function drawWaveform(canvas: HTMLCanvasElement, peaks: Peaks, width: number, height: number, color: string) {
  const dpr = window.devicePixelRatio || 1;
  const pixels = Math.min(16_384, Math.max(1, Math.round(width * dpr)));
  canvas.width = pixels;
  canvas.height = Math.max(1, Math.round(height * dpr));
  const context = canvas.getContext('2d');
  if (!context) return;
  const center = canvas.height / 2;
  let peak = 0;
  for (let i = 0; i < peaks.high.length; i++) peak = Math.max(peak, peaks.high[i], -peaks.low[i]);
  const scale = .89 * center / Math.max(.001, peak);
  context.fillStyle = color;
  for (let x = 0; x < pixels; x++) {
    const from = Math.floor(x * peaks.high.length / pixels);
    const to = Math.ceil((x + 1) * peaks.high.length / pixels);
    let min = 0, max = 0;
    for (let i = from; i < to; i++) {
      min = Math.min(min, peaks.low[i]);
      max = Math.max(max, peaks.high[i]);
    }
    if (min !== 0 || max !== 0) context.fillRect(x, center - max * scale, 1, Math.max(1, (max - min) * scale));
  }
}

// One sequential job bounds memory even if the user switches volumes repeatedly.
let pending: Promise<unknown> = Promise.resolve();

export function renderWaveforms(score: InspectorScore, signal: AbortSignal, progress: (fraction: number, preview?: Waveforms) => void) {
  const job = pending.then(async () => {
    const bins = Math.ceil(score.duration * peaksPerSecond);
    const result: Waveforms = {};
    for (const id of score.tracks) result[id] = { low: new Float32Array(bins), high: new Float32Array(bins) };
    for (let first = 0; first < score.duration; first += blockSeconds) {
      signal.throwIfAborted();
      const end = Math.min(score.duration, first + blockSeconds);
      await renderBlock(score, result, first, end);
      signal.throwIfAborted();
      // Display the opening block promptly and refresh the incomplete canvas at
      // a lower cadence than rendering. Only published peaks are copied.
      const preview: Waveforms = {};
      if (end < score.duration && (first === 0 || end % (blockSeconds * 3) === 0)) {
        for (const id of score.tracks) {
          const { low, high } = result[id]!;
          preview[id] = { low: low.slice(), high: high.slice() };
        }
      }
      progress(end / score.duration, preview.master ? preview : undefined);
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
    return result;
  });
  pending = job.catch(() => {});
  return job;
}

async function renderBlock(score: InspectorScore, peaks: Waveforms, first: number, end: number) {
  const start = Math.max(0, first - prerollSeconds);
  const context = new OfflineAudioContext(2 * score.tracks.length, Math.ceil((end - start) * sampleRate), sampleRate);
  const merger = context.createChannelMerger(2 * score.tracks.length);
  merger.connect(context.destination);
  const source = inspectorSource(context, score, context.createGain(), defaultMix(), null, null, (id, signal) => {
    const channel = score.tracks.indexOf(id) * 2;
    // Force stereo before the splitter so mono signals are copied to both outputs.
    const stereo = context.createGain();
    stereo.channelCountMode = 'explicit';
    stereo.channelCount = 2;
    const splitter = context.createChannelSplitter(2);
    signal.connect(stereo).connect(splitter);
    splitter.connect(merger, 0, channel);
    splitter.connect(merger, 1, channel + 1);
  });
  const firstStep = Math.ceil(start / score.step - 1e-8);
  const endStep = Math.min(score.volume.beats * 4, Math.ceil(end / score.step - 1e-8));
  for (let i = firstStep; i < endStep; i++) source.playStep(i, Math.max(0, i * score.step - start));
  const block = await context.startRendering();
  source.dispose();
  for (const [index, id] of score.tracks.entries()) {
    const left = block.getChannelData(index * 2);
    const right = block.getChannelData(index * 2 + 1);
    const { low, high } = peaks[id]!;
    for (let i = first * peaksPerSecond; i < Math.ceil(end * peaksPerSecond); i++) {
      const from = Math.round((i / peaksPerSecond - start) * sampleRate);
      const to = Math.min(left.length, Math.round(((i + 1) / peaksPerSecond - start) * sampleRate));
      let min = 0, max = 0;
      for (let sample = from; sample < to; sample++) {
        min = Math.min(min, left[sample], right[sample]);
        max = Math.max(max, left[sample], right[sample]);
      }
      low[i] = min;
      high[i] = max;
    }
  }
}
