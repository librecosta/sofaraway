import { createBuffers, createMaster, Synthesizer } from '../audio/synthesizer.client';
import type { VolumeDefinition } from '../core/volumes';

function encodeWav(buffer: AudioBuffer) {
  const { numberOfChannels: channels, length, sampleRate } = buffer;
  const dataBytes = length * channels * 2;
  const bytes = new ArrayBuffer(44 + dataBytes);
  const header = new DataView(bytes);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) header.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  header.setUint32(4, bytes.byteLength - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, channels, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * channels * 2, true);
  header.setUint16(32, channels * 2, true);
  header.setUint16(34, 16, true);
  writeText(36, 'data');
  header.setUint32(40, dataBytes, true);
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (const channel of samples) {
      const value = Math.max(-1, Math.min(1, channel[i]));
      header.setInt16(offset, value * (value < 0 ? 0x8000 : 0x7fff), true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

export async function exportSoundtrack(volume: VolumeDefinition, seconds?: number) {
  if (typeof OfflineAudioContext !== 'function') throw new Error('Offline audio is unavailable in this browser.');
  const sampleRate = 44_100;
  const songDuration = volume.beats * 60 / volume.bpm;
  const duration = seconds !== undefined && Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds, songDuration) : songDuration;
  const tail = duration < songDuration ? 2 : 4;
  const context = new OfflineAudioContext(2, Math.ceil(sampleRate * (duration + tail)), sampleRate);
  const synth = new Synthesizer(context, volume, createMaster(context, 0.8), createBuffers(context));
  const stepTime = 15 / volume.bpm;
  const steps = duration === songDuration ? volume.beats * 4 : Math.ceil(duration / stepTime);
  for (let step = 0; step < steps; step++) synth.playStep(step, 0.12 + step * stepTime);
  const buffer = await context.startRendering();
  return { blob: encodeWav(buffer), duration: buffer.duration };
}
