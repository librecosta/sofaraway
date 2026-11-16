import { wav } from '../daybreak/voices.mjs';
import { filter } from '../../../app/game/audio/daybreak-voices.client.ts';
import { bars, duration, makeScore, seed, step, tail } from './score.mjs';
import { fullBars, fullDuration, fullTail, makeFullScore } from './control-full-score.mjs';
import { descentVoices } from './voices.mjs';

const rate = 44_100;
const barSeconds = step * 16;
const fadeFrames = Math.round(.025 * rate);

function renderBlock(version, events, firstBar, lastBar, arrangement) {
  const { bars, duration, tail, length } = arrangement;
  const start = firstBar * barSeconds;
  const offset = Math.round(start * rate) / rate;
  const last = lastBar === bars;
  const end = lastBar * barSeconds;
  const frames = last ? length : Math.round((end + .06) * rate);
  const context = new OfflineAudioContext(2, frames - Math.round(offset * rate), rate);
  const output = context.createGain();
  output.connect(context.destination);
  const trim = version === 'B' ? .77 : .85;
  output.gain.value = trim;
  if (last) {
    output.gain.setValueAtTime(trim, duration + .28 - offset);
    output.gain.linearRampToValueAtTime(0, duration + tail - .02 - offset);
  }
  const compression = context.createDynamicsCompressor();
  compression.threshold.value = -15;
  compression.knee.value = 9;
  compression.ratio.value = 2;
  compression.attack.value = .003;
  compression.release.value = .085;
  compression.connect(output);
  const mixer = filter(context, compression, 'highpass', 27, .68);
  const play = descentVoices(context, mixer, version, seed, step);
  events.forEach((event, index) => {
    if (event.at >= start - 1e-9 && event.at < end + .06) play({ ...event, at: Math.max(0, event.at - offset) }, index);
  });
  return context.startRendering();
}

export async function render(version) {
  const full = version === 'full';
  const arrangement = full
    ? { bars: fullBars, duration: fullDuration, tail: fullTail }
    : { bars, duration, tail };
  const length = Math.round((arrangement.duration + arrangement.tail) * rate);
  const events = full ? makeFullScore() : makeScore(version);
  const buffer = new AudioBuffer({ length, sampleRate: rate, numberOfChannels: 2 });
  for (let bar = 0; bar < arrangement.bars; bar += 8) {
    const first = Math.max(0, bar - 1);
    const last = Math.min(arrangement.bars, bar + 8);
    const from = Math.round(bar * barSeconds * rate);
    const until = last === arrangement.bars ? length : Math.round(last * barSeconds * rate);
    const preroll = from - Math.round(first * barSeconds * rate);
    const block = await renderBlock(full ? 'A' : version, events, first, last, { ...arrangement, length });
    for (let channel = 0; channel < 2; channel++) {
      const samples = block.getChannelData(channel);
      const output = buffer.getChannelData(channel);
      // One prior bar settles the room taps and compressor before the seam.
      if (bar > 0) for (let i = 0; i < fadeFrames; i++) {
        const target = from - fadeFrames + i;
        const alpha = (i + 1) / fadeFrames;
        output[target] += (samples[preroll - fadeFrames + i] - output[target]) * alpha;
      }
      output.set(samples.subarray(preroll, preroll + until - from), from);
    }
  }
  return { ...wav(buffer, 1), duration: buffer.duration };
}
