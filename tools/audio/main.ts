import { createBuffers, createMaster, Synthesizer } from '../../app/game/audio/synthesizer.client';
import { volumeById } from '../../app/game/core/volumes';

const button = document.querySelector<HTMLButtonElement>('#go')!;
const log = document.querySelector<HTMLElement>('#log')!;
const params = new URLSearchParams(location.search);
const volume = volumeById(params.get('vol'));

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

async function render() {
  button.disabled = true;
  try {
    const sampleRate = 44_100;
    const songDuration = volume.beats * 60 / volume.bpm;
    const clip = Number(params.get('secs'));
    const duration = Number.isFinite(clip) && clip > 0 ? Math.min(clip, songDuration) : songDuration;
    const tail = duration < songDuration ? 2 : 4;
    const context = new OfflineAudioContext(2, Math.ceil(sampleRate * (duration + tail)), sampleRate);
    const synth = new Synthesizer(context, volume, createMaster(context, 0.8), createBuffers(context));
    const stepTime = 15 / volume.bpm;
    const steps = duration === songDuration ? volume.beats * 4 : Math.ceil(duration / stepTime);
    for (let step = 0; step < steps; step++) synth.playStep(step, 0.12 + step * stepTime);
    log.textContent = `Rendering ${volume.name}…`;
    const buffer = await context.startRendering();
    const blob = encodeWav(buffer);
    if (params.get('nodownload') !== '1') {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sofaraway-${volume.id}.wav`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
    log.textContent = `Done · ${(blob.size / 1048576).toFixed(1)} MB · ${buffer.duration.toFixed(1)} s`;
    button.textContent = 'RENDER AGAIN';
  } catch (error) {
    log.textContent = error instanceof Error ? error.message : 'Soundtrack render failed.';
  } finally {
    button.disabled = false;
  }
}

button.addEventListener('click', render);
if (params.get('auto') === '1') void render();
