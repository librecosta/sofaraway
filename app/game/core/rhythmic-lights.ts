import { sectionAt } from './volumes';
import type { VolumeDefinition } from './volumes';

export function drumStrengths(volume: VolumeDefinition, step: number, energy: number) {
  const s = step % 16;
  const industrial = volume.music === 'industrial';
  const ending = step / 4 > volume.beats - 8;
  const kick = !ending && (industrial ? s === 0 || s === 10 : s % 4 === 0 && energy > .2)
    ? .55 + energy * .45 : 0;
  const snare = !ending && energy > .42 && (industrial ? s === 8 : s === 4 || s === 12)
    ? .5 + energy * .5 : 0;
  const fill = Math.floor(step / 16) % 4 === 3 && s >= 12 && energy > .6 ? .35 + (s - 12) * .14 : 0;
  return { kick, snare, fill };
}

const pulses = new WeakMap<VolumeDefinition, Float64Array>();

function pulseScore(volume: VolumeDefinition) {
  let score = pulses.get(volume);
  if (score) return score;
  score = new Float64Array(volume.beats * 4);
  for (let step = 0; step < score.length; step++) {
    const { kick, snare, fill } = drumStrengths(volume, step, sectionAt(volume, step / 4)?.energy ?? .15);
    score[step] = kick * 1.7 + snare * .62 + fill * .24;
  }
  pulses.set(volume, score);
  return score;
}

// Only the kick and snare drive the architecture. Hats remain audio-only.
export function rhythmicLightGain(volume: VolumeDefinition, beat: number, amount: number, reduced = false) {
  if (!amount || reduced || beat < 0 || beat >= volume.beats) return 1;
  const current = sectionAt(volume, beat);
  const energy = current?.energy ?? .15;
  const secondsPerBeat = 60 / volume.bpm;
  const step = Math.floor(beat * 4);
  const oldest = Math.max(0, Math.ceil((beat - .8 / secondsPerBeat) * 4));
  const score = pulseScore(volume);
  let pulse = 0;
  for (let i = step; i >= oldest; i--) {
    if (!score[i]) continue;
    const age = (beat - i / 4) * secondsPerBeat;
    pulse += score[i] * -Math.expm1(-age / .045) * Math.exp(-age / .205);
  }
  const build = current?.name === 'BUILD' ? .55 + .45 * (beat - current.start) / (current.end - current.start) : 1;
  const closing = Math.min(1, (volume.beats - beat) / 12);
  return 1 + amount * .65 * energy * build * closing * Math.min(1, pulse);
}
