import { volumeById } from './volumes';

export const lightPatterns = ['single-color', 'dual-color'] as const;
export type LightPattern = typeof lightPatterns[number];

const chapters = volumeById('elsewhere').sections;
export const lightCues = chapters.map((section, i) => {
  const start = chapters.slice(0, i).reduce((sum, previous) => sum + previous.beats, 0);
  return { name: section.name, start, end: start + section.beats, energy: section.energy };
});

export interface ColorCue {
  readonly beat: number;
  readonly hue: number;
  readonly transitionBeats: number;
}

// The six original anchors remain; the added hues connect specific musical phrases.
const phrases = [
  [0, .44, 0], [16, .49, 12],
  [32, .57, 9], [48, .66, 9], [64, .78, 10], [80, .72, 9], [96, .66, 9],
  [112, .57, 8], [128, .50, 8], [144, .44, 9], [160, .57, 10],
  [172, .66, 7], [184, .78, 7], [192, .92, 6],
  [204, .04, 8], [216, .09, 8], [228, .98, 8], [240, .92, 8],
  [252, .78, 8], [264, .66, 8], [276, .57, 8], [288, .44, 12],
  [312, .50, 16], [320, .57, 8], [336, .66, 9], [352, .78, 9],
  [368, .92, 9], [384, .09, 10], [396, .045, 7], [408, .94, 8],
  [420, .78, 8], [432, .66, 8], [444, .44, 10],
] as const;
export const colorScore: readonly ColorCue[] = phrases.map(([beat, hue, transitionBeats]) => ({ beat, hue, transitionBeats }));

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

export function scoreHue(beat: number) {
  let i = colorScore.length - 1;
  while (i > 0 && beat < colorScore[i].beat) i--;
  const current = colorScore[i], next = colorScore[i + 1];
  if (!next) return current.hue;
  const start = Math.max(current.beat, next.beat - next.transitionBeats);
  return beat <= start ? current.hue : mixHue(current.hue, next.hue, ease((beat - start) / (next.beat - start)));
}

export function lightingState(beat: number, reduced = false) {
  let i = lightCues.length - 1;
  while (i > 0 && beat < lightCues[i].start) i--;
  const cue = lightCues[i], previous = lightCues[Math.max(0, i - 1)];
  const mix = ease((beat - cue.start) / 2);
  const energy = previous.energy + (cue.energy - previous.energy) * mix;
  const quiet = (name: string) => name === 'INTRO' || name === 'BREAK' ? 1 : 0;
  const slow = quiet(previous.name) + (quiet(cue.name) - quiet(previous.name)) * mix;
  const pulse = reduced ? 0 : beatPulse(beat);
  const breathing = reduced ? .5 : breath(beat, 4) * (1 - slow) + breath(beat, 8) * slow;
  return { beat, hue: scoreHue(beat), pulse, breathing, energy,
    rim: .47 * (1 + .22 * energy * pulse + .12 * breathing),
    strip: .79 * (1 + .16 * energy * pulse + .08 * breathing),
    branch: .78 * (1 + .18 * energy * pulse + .10 * breathing),
    reduced };
}
export type LightingState = ReturnType<typeof lightingState>;

/** Only the installed ordered zone has two groups. The color alternative is a Debug override. */
export function ceilingLight(state: LightingState, station: number, group: 0 | 1, ordered: boolean, dual = false) {
  const { beat, energy, pulse, breathing, reduced, hue } = state;
  const traveling = ordered && !reduced ? (.5 + .5 * Math.cos(tau * (station / 48 - beat / 4 - group * .5))) ** 2 : .5;
  const experiment = ordered && dual && group === 1 && !reduced ? .22 * (.5 + .5 * breath(beat, 8)) : 0;
  return { hue: mixHue(hue, hue + .27, experiment),
    level: .24 + .045 * breathing + .07 * energy * pulse + (ordered ? .17 : 0) * traveling };
}
