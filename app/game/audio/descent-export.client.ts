import { step } from '../core/descent-score';
import { controlArrangement, DescentSynthesizer } from './descent.client';
import { randomSource } from './daybreak-voices.client';

const rate = 44_100;
const barSeconds = step * 16;
const fadeFrames = Math.round(.025 * rate);

/** Retain the approved master's sample-aligned blocks and preroll. */
export async function renderDescent(arrangement = controlArrangement, seconds = arrangement.duration, signal?: AbortSignal) {
  const duration = Math.min(seconds, arrangement.duration);
  const length = Math.round((duration + arrangement.tail) * rate);
  const buffer = new AudioBuffer({ length, sampleRate: rate, numberOfChannels: 2 });
  for (let bar = 0; bar * barSeconds < duration; bar += 8) {
    signal?.throwIfAborted();
    const start = Math.max(0, bar - 1) * barSeconds;
    const end = Math.min((bar + 8) * barSeconds, duration);
    const offset = Math.round(start * rate);
    const from = Math.round(bar * barSeconds * rate);
    const last = end >= duration;
    const until = last ? length : Math.round(end * rate);
    const context = new OfflineAudioContext(2, (last ? length : Math.round((end + .06) * rate)) - offset, rate);
    const synth = new DescentSynthesizer(context, context.destination, arrangement, start, end + .06);
    let block: AudioBuffer;
    try {
      if (last) synth.finishAt(duration - offset / rate);
      const before = end + (last && duration < arrangement.duration ? 0 : .06);
      for (let i = Math.max(0, bar - 1) * 16; i < Math.ceil(before / step); i++) {
        synth.scheduleStep(i, -offset / rate, start - 1e-9, before);
      }
      signal?.throwIfAborted();
      block = await context.startRendering();
    } finally {
      synth.dispose();
    }
    signal?.throwIfAborted();
    const preroll = from - offset;
    for (let channel = 0; channel < 2; channel++) {
      const samples = block.getChannelData(channel);
      const output = buffer.getChannelData(channel);
      if (bar > 0) for (let i = 0; i < fadeFrames; i++) {
        const target = from - fadeFrames + i;
        const alpha = (i + 1) / fadeFrames;
        output[target] += (samples[preroll - fadeFrames + i] - output[target]) * alpha;
      }
      output.set(samples.subarray(preroll, preroll + until - from), from);
    }
  }
  return buffer;
}

export function encodeDescentWav(buffer: AudioBuffer) {
  const bytes = new ArrayBuffer(44 + buffer.length * 4);
  const view = new DataView(bytes);
  const label = (offset: number, text: string) => {
    for (const [i, char] of [...text].entries()) view.setUint8(offset + i, char.charCodeAt(0));
  };
  const word = (offset: number, value: number) => view.setUint16(offset, value, true);
  const long = (offset: number, value: number) => view.setUint32(offset, value, true);
  label(0, 'RIFF'); long(4, bytes.byteLength - 8); label(8, 'WAVE');
  label(12, 'fmt '); long(16, 16); word(20, 1); word(22, 2);
  long(24, buffer.sampleRate); long(28, buffer.sampleRate * 4); word(32, 4); word(34, 16);
  label(36, 'data'); long(40, bytes.byteLength - 44);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  const random = randomSource(1770);
  let peak = 0, square = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < 2; channel++) {
      const value = channel ? right[i] : left[i];
      if (!Number.isFinite(value) || Math.abs(value) >= 1) throw new Error('The mix contains clipping or invalid samples.');
      peak = Math.max(peak, Math.abs(value));
      square += value * value;
      const dither = Math.min(1, (buffer.length - i - 1) / (rate * .1));
      view.setInt16(44 + i * 4 + channel * 2, Math.round(value * 32767 + (random() - random()) * dither), true);
    }
  }
  return { blob: new Blob([bytes], { type: 'audio/wav' }), duration: buffer.duration,
    peak, rms: Math.sqrt(square / (2 * buffer.length)) };
}
