import { ease } from './lighting-score';
import { sectionAt } from './volumes';
import type { VolumeDefinition } from './volumes';

export const musicStepSeconds = (bpm: number) => 15 / bpm;

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

export function drumPulse(volume: VolumeDefinition, time: number) {
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
    const from = elsewhereLevels[prior.name], to = elsewhereLevels[section.name];
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
