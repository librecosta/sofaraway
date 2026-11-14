import { ease } from './lighting-score';
import { drums as daybreakDrums } from './daybreak-score';
import { sectionAt } from './volumes';
import type { VolumeDefinition } from './volumes';

export const musicStepSeconds = (bpm: number) => 15 / bpm;

export function drumStrengths(volume: VolumeDefinition, step: number, energy: number) {
  if (volume.music === 'breakbeat') {
    const hits = daybreakDrums[Math.floor(step / 16)]?.filter(hit => hit.at === step % 16) ?? [];
    return { kick: hits.find(hit => hit.kind === 'kick')?.strength ?? 0,
      snare: hits.find(hit => hit.kind === 'snare')?.strength ?? 0,
      fill: hits.find(hit => hit.kind === 'fill')?.strength ?? 0 };
  }
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

type Drums = ReturnType<typeof drumStrengths>;
const scores = new WeakMap<VolumeDefinition, readonly Drums[]>();

export function drumScore(volume: VolumeDefinition) {
  let score = scores.get(volume);
  if (score) return score;
  score = Array.from({ length: volume.beats * 4 }, (_, step) =>
    drumStrengths(volume, step, sectionAt(volume, step / 4)?.energy ?? .15));
  scores.set(volume, score);
  return score;
}

export interface DynamicLightEnvelope {
  fixtureGain: number;
  rimGain: number;
  physicalGain: number;
  pulse: number;
  amount: number;
}

export const steadyLights: Readonly<DynamicLightEnvelope> = Object.freeze({
  fixtureGain: 1, rimGain: 1, physicalGain: 1, pulse: 0, amount: 0,
});

const elsewhereLevels: Readonly<Record<string, readonly [number, number]>> = {
  INTRO: [.85, 1.15], A: [.50, 1.70], B: [.50, 1.70], BUILD: [.40, 1.90],
  DROP: [.30, 2.25], BREAK: [.80, 1.20], A2: [.50, 1.75], FINALE: [.35, 2.20],
};
const ATTACK = .016;
const DECAY = .14;
const lerp = (a: number, b: number, mix: number) => a + (b - a) * mix;

const daybreakLevels: Readonly<Record<string, readonly [number, number]>> = {
  OPEN: [.85, 1.15], GLIDE: [.56, 1.67], LIFT: [.48, 1.80], BREEZE: [.78, 1.30],
  SUNBURST: [.40, 1.98], RETURN: [.52, 1.72], OUTRO: [.80, 1.25],
};
const daybreakOnsets = daybreakDrums.map(events => events.flatMap(hit => {
  const weight = hit.kind === 'kick' ? (hit.at === 0 ? 1 : .57) * hit.strength / (hit.at === 0 ? .224 : .224 * .84)
    : hit.kind === 'snare' ? .65 * hit.strength / .19
    : hit.kind === 'fill' ? .28 * hit.strength / .11 : 0;
  return weight ? [{ time: hit.time, kind: hit.kind as 'kick' | 'snare' | 'fill', weight: Math.min(1, weight) }] : [];
}));

export type DrumOnset = { time: number; kind: 'kick' | 'snare' | 'fill' };
const onsets = new WeakMap<VolumeDefinition, readonly DrumOnset[]>();
export function drumOnsets(volume: VolumeDefinition): readonly DrumOnset[] {
  let result = onsets.get(volume);
  if (!result) {
    const stepSeconds = musicStepSeconds(volume.bpm);
    result = volume.music === 'breakbeat' ? daybreakOnsets.flat().sort((a, b) => a.time - b.time)
      : drumScore(volume).flatMap((drums, step) =>
        (['kick', 'snare', 'fill'] as const).filter(kind => drums[kind]).map(kind => ({ time: step * stepSeconds, kind })));
    onsets.set(volume, result);
  }
  return result;
}

export function drumPulse(volume: VolumeDefinition, time: number) {
  if (volume.music === 'breakbeat') {
    let pulse = 0;
    for (let bar = Math.max(0, Math.floor((time - .5) / 2)); bar <= Math.floor((time + ATTACK) / 2); bar++) {
      for (const { time: hitTime, weight } of daybreakOnsets[bar] ?? []) {
        const age = time - hitTime;
        if (age < -ATTACK || age > .5) continue;
        const envelope = age < 0 ? ease(1 + age / ATTACK) : (1 - age / .5) ** 4;
        pulse = Math.max(pulse, weight * envelope);
      }
    }
    return pulse;
  }
  const stepSeconds = musicStepSeconds(volume.bpm);
  const score = drumScore(volume);
  const first = Math.max(0, Math.ceil((time - .84) / stepSeconds));
  const last = Math.min(score.length - 1, Math.floor((time + ATTACK) / stepSeconds + 1e-10));
  let pulse = 0;
  for (let step = first; step <= last; step++) {
    const { kick, snare, fill } = score[step];
    if (!(kick || snare || fill)) continue;
    // An industrial offbeat kick and sixteenth-note fills can accent the walls lightly.
    const weight = kick && step % 4 === 0 ? Math.min(1, .78 + .22 * kick + .06 * snare)
      : Math.max(.26 * kick, .63 * snare, .17 * fill);
    const age = time - step * stepSeconds;
    const envelope = age < 0 ? ease(1 + age / ATTACK) : Math.exp(-age / DECAY) * ease((.84 - age) / .14);
    pulse = Math.max(pulse, weight * envelope);
  }
  return pulse;
}

export function dynamicLightEnvelope(volume: VolumeDefinition, time: number, amount: number, reduced = false,
  out: DynamicLightEnvelope = { ...steadyLights }): DynamicLightEnvelope {
  const beat = time * volume.bpm / 60;
  const pulse = drumPulse(volume, time);
  const section = sectionAt(volume, beat);
  const mix = reduced || !section || beat < 0 ? 0 : Math.min(1, Math.max(0, amount));
  let delta = 0;
  if (mix && section) {
    const prior = volume.sections[Math.max(0, section.i - 1)];
    const levels = volume.music === 'breakbeat' ? daybreakLevels : elsewhereLevels;
    const from = levels[prior.name], to = levels[section.name];
    const transition = ease((beat - section.start) / 1.5);
    const energy = lerp(prior.energy, section.energy, transition);
    const minimum = from && to ? lerp(from[0], to[0], transition) : 1 - .55 * energy;
    const maximum = from && to ? lerp(from[1], to[1], transition) : 1 + .95 * energy;
    const build = section.name === 'BUILD' ? lerp(.62, 1, (beat - section.start) / section.beats) : 1;
    const depth = lerp(1, build, transition) * ease((volume.beats - beat) / 16);
    delta = mix * depth * (lerp(minimum, maximum, pulse) - 1);
  }
  out.fixtureGain = 1 + delta;
  out.rimGain = 1 + delta * (delta < 0 ? .78 : .64);
  out.physicalGain = 1 + delta * (delta < 0 ? .15 / .70 : .28);
  out.pulse = pulse;
  out.amount = mix;
  return out;
}

export function approachDynamicLights(amount: number, enabled: boolean, milliseconds: number) {
  const change = Math.max(0, milliseconds) / 280;
  return enabled ? Math.min(1, amount + change) : Math.max(0, amount - change);
}
