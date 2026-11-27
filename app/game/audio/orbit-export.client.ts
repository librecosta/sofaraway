import { starwakeTrack } from '../core/orbit-score';
import { randomSource } from './daybreak-voices.client';
import { OrbitSynthesizer } from './orbit.client';

const rate = 44100;

/** One continuous graph preserves the room, delays and compressor history. */
export async function renderStarwake(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const ctx = new OfflineAudioContext(2, (starwakeTrack.duration + starwakeTrack.tail) * rate, rate);
  const synth = new OrbitSynthesizer(ctx, ctx.destination);
  const abort = () => synth.dispose();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for (let i = 0; i < starwakeTrack.bars * 16; i++) synth.scheduleStep(i, 0);
    synth.finishAt(starwakeTrack.duration);
    const buffer = await ctx.startRendering();
    signal?.throwIfAborted();
    return buffer;
  } finally { signal?.removeEventListener('abort', abort); synth.dispose(); }
}

export function encodeStarwakeWav(buffer: AudioBuffer) {
  const bytes = new ArrayBuffer(44 + buffer.length * 4);
  const view = new DataView(bytes);
  const label = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i));
  };
  label(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); label(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  label(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  const random = randomSource(1770);
  let peak = 0, power = 0;
  for (let i = 0; i < buffer.length; i++) for (let channel = 0; channel < 2; channel++) {
    const value = channels[channel][i];
    if (!Number.isFinite(value) || Math.abs(value) >= 1) throw new Error('STARWAKE contains invalid or clipped samples');
    peak = Math.max(peak, Math.abs(value));
    power += value * value;
    const dither = Math.min(1, (buffer.length - i - 1) / (buffer.sampleRate * .1));
    view.setInt16(44 + i * 4 + channel * 2, Math.round(value * 32767 + (random() - random()) * dither), true);
  }
  return { blob: new Blob([bytes], { type: 'audio/wav' }), duration: buffer.duration,
    peak, rms: Math.sqrt(power / (buffer.length * 2)) };
}
