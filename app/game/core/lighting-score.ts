import { volumeById } from './volumes';
import { SPLIT_BEAT } from './branches';
import type { RouteKind } from './branches';

export const lightPatterns = ['single-color', 'dual-color'] as const;
export type LightPattern = typeof lightPatterns[number];

const chapters = volumeById('elsewhere').sections;
export const lightCues = chapters.map((section, i) => {
  const start = chapters.slice(0, i).reduce((sum, previous) => sum + previous.beats, 0);
  return { name: section.name, start, end: start + section.beats, energy: section.energy };
});

export interface LightTone {
  readonly hue: number;
  readonly saturation: number;
}

export interface ColorCue extends LightTone {
  readonly beat: number;
  readonly transitionBeats: number;
}

// The quiet stretches use pale blue while the larger phrase changes retain their original timing.
const phrases = [
  [0, .595, 0, .55], [16, .585, 12, .62],
  [32, .57, 9], [48, .66, 9], [64, .78, 10], [80, .72, 9], [96, .66, 9],
  [112, .57, 8], [128, .585, 8, .57], [144, .605, 9, .61], [160, .57, 10],
  [172, .66, 7], [184, .78, 7], [192, .92, 6],
  [204, .04, 8], [216, .09, 8], [228, .98, 8], [240, .92, 8],
  [252, .78, 8], [264, .66, 8], [276, .57, 8], [288, .595, 12, .53],
  [312, .61, 16, .59], [320, .57, 8], [336, .66, 9], [352, .78, 9],
  [368, .92, 9], [384, .09, 10], [396, .045, 7], [408, .94, 8],
  [420, .78, 8], [432, .66, 8], [444, .595, 10, .52],
] as const;
export const colorScore: readonly ColorCue[] = phrases.map(([beat, hue, transitionBeats, saturation = 1]) =>
  ({ beat, hue, transitionBeats, saturation }));

export const routeSwatches = { main: '#DCEAFF', challenge: '#F2A7AA', score: '#FFD587' } satisfies Record<RouteKind, string>;
const routePhrases = {
  main: [[.59, .38], [.65, .24], [.47, .27]],
  challenge: [[.985, .63], [.025, .58], [.953, .60]],
  score: [[.083, .75], [.132, .74], [.206, .64]],
} as const satisfies Record<RouteKind, readonly (readonly [number, number])[]>;

const tau = 2 * Math.PI;
const mod = (x: number, n: number) => ((x % n) + n) % n;
export function ease(x: number) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (6 * t - 15) + 10);
}
export const lightBeat = (seconds: number, bpm: number) => seconds * bpm / 60;
export const beatPulse = (beat: number) => Math.exp(-5 * (1 - Math.cos(tau * beat)));
export const breath = (beat: number, period: 4 | 8) => .5 - .5 * Math.cos(tau * beat / period);
export const hueDistance = (from: number, to: number) => mod(to - from + 1.5, 1) - .5;
export const mixHue = (from: number, to: number, fraction: number) => mod(from + hueDistance(from, to) * fraction, 1);

export function scoreTone(beat: number): LightTone {
  let i = colorScore.length - 1;
  while (i > 0 && beat < colorScore[i].beat) i--;
  const current = colorScore[i], next = colorScore[i + 1];
  if (!next) return current;
  const start = Math.max(current.beat, next.beat - next.transitionBeats);
  if (beat <= start) return current;
  const blend = ease((beat - start) / (next.beat - start));
  return { hue: mixHue(current.hue, next.hue, blend),
    saturation: current.saturation + (next.saturation - current.saturation) * blend };
}
export const scoreHue = (beat: number) => scoreTone(beat).hue;

export function routeTone(route: RouteKind, beat: number): LightTone {
  const phrases = routePhrases[route];
  const phase = mod((beat - SPLIT_BEAT) / 8, phrases.length);
  const i = Math.floor(phase);
  const [h0, s0] = phrases[i], [h1, s1] = phrases[(i + 1) % phrases.length];
  const blend = ease(phase - i);
  return { hue: mixHue(h0, h1, blend), saturation: s0 + (s1 - s0) * blend };
}

export function lightingState(beat: number, reduced = false, closing = false) {
  let i = lightCues.length - 1;
  while (i > 0 && beat < lightCues[i].start) i--;
  const cue = lightCues[i], previous = lightCues[Math.max(0, i - 1)];
  const mix = ease((beat - cue.start) / 2);
  const energy = previous.energy + (cue.energy - previous.energy) * mix;
  const quiet = (name: string) => name === 'INTRO' || name === 'BREAK' ? 1 : 0;
  const slow = quiet(previous.name) + (quiet(cue.name) - quiet(previous.name)) * mix;
  const pulse = reduced ? 0 : beatPulse(beat);
  const breathing = reduced ? .5 : breath(beat, 4) * (1 - slow) + breath(beat, 8) * slow;
  const { hue, saturation } = scoreTone(beat);
  const close = closing ? ease((beat - 432) / 16) : 0;
  const level = 1 - .28 * close;
  return { beat, hue, saturation, pulse, breathing, energy,
    level,
    rim: .47 * (1 + .22 * energy * pulse + .12 * breathing) * level,
    strip: .79 * (1 + .16 * energy * pulse + .08 * breathing) * level,
    branch: .78 * (1 + .18 * energy * pulse + .10 * breathing) * level,
    reduced };
}
export type LightingState = ReturnType<typeof lightingState>;
