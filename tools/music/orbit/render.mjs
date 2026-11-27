import { wav } from '../daybreak/voices.mjs';
import { duration, makeScore, tail } from './score.mjs';
import { OrbitSynthesizer } from './voices.mjs';

export const sampleRate = 44100;
export const targetRmsDb = -20.5;

/** A continuous context retains the full compressor, room and delay history. */
export async function render(version) {
  const events = makeScore(version);
  const context = new OfflineAudioContext(2, Math.round((duration + tail) * sampleRate), sampleRate);
  const synth = new OrbitSynthesizer(context, context.destination, version, events);
  synth.duck();
  synth.schedule();
  synth.finish();
  const audio = await context.startRendering();
  synth.dispose();
  let peak = 0, power = 0;
  const bodyFrames = Math.round(duration * sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = audio.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) {
      const value = samples[i];
      if (!Number.isFinite(value)) throw new Error('Non-finite ORBIT sample');
      peak = Math.max(peak, Math.abs(value));
      if (i < bodyFrames) power += value * value;
    }
  }
  const rawRms = Math.sqrt(power / (bodyFrames * 2));
  if (rawRms < .001 || peak < .01) throw new Error('ORBIT render is silent');
  // One static trim matches audition loudness while retaining phrase dynamics.
  // The peak ceiling applies to the full tail as well as the musical body.
  const outputGain = Math.min(10 ** (targetRmsDb / 20) / rawRms, .76 / peak);
  return { ...wav(audio, outputGain), duration: audio.duration, outputGain, events: events.length,
    bodyRmsDb: 20 * Math.log10(rawRms * outputGain) };
}
