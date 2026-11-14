import { randomSource, rate } from '../../../app/game/audio/daybreak-voices.client.ts';

export function wav(buffer, outputGain) {
  const bytes = new ArrayBuffer(44 + buffer.length * 4);
  const view = new DataView(bytes);
  const label = (offset, text) => {
    for (const [i, char] of [...text].entries()) view.setUint8(offset + i, char.charCodeAt(0));
  };
  const word = (offset, value) => view.setUint16(offset, value, true);
  const long = (offset, value) => view.setUint32(offset, value, true);
  label(0, 'RIFF'); long(4, bytes.byteLength - 8); label(8, 'WAVE');
  label(12, 'fmt '); long(16, 16); word(20, 1); word(22, 2);
  long(24, buffer.sampleRate); long(28, buffer.sampleRate * 4); word(32, 4); word(34, 16);
  label(36, 'data'); long(40, bytes.byteLength - 44);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  const random = randomSource(1770);
  let peak = 0, square = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < 2; channel++) {
      const value = (channel ? right[i] : left[i]) * outputGain;
      if (!Number.isFinite(value) || Math.abs(value) >= 1) throw new Error('The mix contains clipping or invalid samples.');
      peak = Math.max(peak, Math.abs(value));
      square += value * value;
      const dither = Math.min(1, (buffer.length - i - 1) / (rate * .1));
      view.setInt16(44 + i * 4 + channel * 2, Math.round(value * 32767 + (random() - random()) * dither), true);
    }
  }
  return { blob: new Blob([bytes], { type: 'audio/wav' }), peak, rms: Math.sqrt(square / (2 * buffer.length)) };
}
