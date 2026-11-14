import { duration, score, step, tail } from '../core/daybreak-score';
import { DaybreakSynthesizer } from './daybreak.client';

/** Render the live scheduler in short blocks to bound the offline graph size. */
export async function renderDaybreak(seconds = duration): Promise<AudioBuffer> {
  const rate = 44_100, barSeconds = step * 16, overlap = Math.round(rate * .020);
  const song = Math.min(duration, seconds);
  const length = Math.ceil(rate * (song + tail));
  const result = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: rate });
  const lastStep = Math.min(score.length * 16, Math.ceil(song / step));
  for (let first = 0; first < lastStep;) {
    const end = Math.min(lastStep, first + (first === 0 ? 12 : 6) * 16);
    const start = Math.max(0, first - 16);
    const offset = Math.round(start * step * rate);
    const frames = (end === lastStep ? length : Math.round(end * step * rate)) - offset;
    const context = new OfflineAudioContext(2, frames, rate);
    const output = context.createGain();
    output.connect(context.destination);
    if (end === lastStep) {
      output.gain.setValueAtTime(1, song + 1.06 - start * step);
      output.gain.linearRampToValueAtTime(0, song + tail - .005 - start * step);
    }
    const synth = new DaybreakSynthesizer(context, output);
    for (let i = start; i < end; i++) synth.playStep(i, (i - start) * step);
    const block = await context.startRendering();
    const preroll = first ? Math.round(barSeconds * rate) : 0;
    const from = offset + preroll;
    for (let channel = 0; channel < 2; channel++) {
      const samples = block.getChannelData(channel);
      const destination = result.getChannelData(channel);
      if (first) {
        for (let i = 0; i < overlap; i++) {
          const index = from - overlap + i;
          destination[index] += ((i + 1) / overlap) * (samples[preroll - overlap + i] - destination[index]);
        }
      }
      destination.set(samples.subarray(preroll), from);
    }
    first = end;
  }
  return result;
}
