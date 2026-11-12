export const lightFamilies = ['structural', 'fill', 'rhythm', 'functional', 'hero', 'gate-adjacent'] as const;
export type LightFamily = typeof lightFamilies[number];
export const lightPatterns = ['steady', 'breath', 'beat', 'chase', 'alternate', 'build',
  'sparse', 'all-on', 'partial-blackout', 'dual-color', 'symbol'] as const;
export type LightPattern = typeof lightPatterns[number];
export const palette = {
  softWhite: '#F0F1EC', warmWhite: '#F5E9D2', paleYellow: '#F2D992', amber: '#F0AC6B',
  paleBlue: '#A5D7F5', cyan: '#65DDD6', violet: '#A98AE0', deepBlue: '#456DA6',
} as const;
export type LightColor = keyof typeof palette;
export interface LightCue {
  readonly start: number; readonly end: number; readonly name: string;
  readonly warm: LightColor; readonly cool: LightColor; readonly pattern: LightPattern;
}
export const lightCues = [
  { name: 'INTRO', start: 0, end: 16, warm: 'warmWhite', cool: 'paleBlue', pattern: 'steady' },
  { name: 'A', start: 16, end: 96, warm: 'softWhite', cool: 'paleBlue', pattern: 'alternate' },
  { name: 'B', start: 96, end: 160, warm: 'paleYellow', cool: 'paleBlue', pattern: 'dual-color' },
  { name: 'BUILD', start: 160, end: 192, warm: 'amber', cool: 'paleBlue', pattern: 'build' },
  { name: 'DROP', start: 192, end: 288, warm: 'amber', cool: 'violet', pattern: 'beat' },
  { name: 'BREAK', start: 288, end: 320, warm: 'warmWhite', cool: 'paleBlue', pattern: 'breath' },
  { name: 'A2', start: 320, end: 384, warm: 'warmWhite', cool: 'cyan', pattern: 'chase' },
  { name: 'FINALE', start: 384, end: 448, warm: 'paleYellow', cool: 'paleBlue', pattern: 'all-on' },
] as const satisfies readonly LightCue[];

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const tau = 2 * Math.PI;
const mod = (x: number, n: number) => ((x % n) + n) % n;
export function ease(x: number) {
  const t = clamp(x);
  return t * t * t * (t * (6 * t - 15) + 10);
}
export const lightBeat = (seconds: number, bpm: number) => seconds * bpm / 60;
const wave = (cycles: number) => (1 + Math.cos(tau * cycles)) / 2;
/** Shared by every gameplay ring; a chapter supplies hue, never an angular color offset. */
export const tunnelBreath = (beat: number, reduced = false) => reduced ? .50 : (1 - wave(beat / 4));

/** Strength is normalized before the individual fixture's floor and power budget are applied. */
export function patternStrength(pattern: LightPattern, b: number, station: number, group: number, start = 160) {
  const fraction = mod(b, 1);
  const d = Math.min(fraction, 1 - fraction);
  const p = mod(group, 11) / 11;
  switch (pattern) {
    case 'steady': return .54;
    case 'breath': return 1 - wave(b / 8 + p * .2);
    case 'beat': return Math.exp(-d * d / (2 * .22 ** 2));
    case 'chase': return wave((station - 4200) / 38 - b / 4 + p * .08) ** 2;
    case 'alternate': return wave(b / 4 + mod(group, 2) / 2);
    case 'build': return ease(((b - start) / 32 - p * .74) / .26) * (.30 + .70 * wave(station / 33 - b / 4) ** 2);
    case 'sparse': return mod(group, 3) === 0 ? .56 : .12;
    case 'all-on': return .72;
    case 'partial-blackout': return .02;
    case 'dual-color': return .38 + .53 * wave(b / 8 + p / 4);
    case 'symbol': return .6 + .4 * wave(b / 8);
  }
}

export function lightingState(beat: number, override?: LightPattern) {
  let i = lightCues.length - 1;
  while (i > 0 && lightCues[i].start > beat) i--;
  const next: LightCue = lightCues[Math.max(0, i)];
  const previous: LightCue = lightCues[Math.max(0, i - 1)];
  const mix = i <= 0 ? 1 : ease((beat - next.start) / .84);
  const drop = next.name === 'DROP' ? mod(beat - 192, 32) : -1;
  const blackout = override === 'partial-blackout' ? 1 : override || drop < 0 ? 0
    : ease((drop - .15) / .65) * (1 - ease((drop - 1.2) / .9));
  return { beat, previous, next, mix, blackout, override };
}
export type LightingState = ReturnType<typeof lightingState>;

const budgets = {
  structural: [.33, .25], fill: [.52, .15], rhythm: [.10, .52],
  functional: [.26, .22], hero: [.16, .58], 'gate-adjacent': [.28, .13],
} as const satisfies Record<LightFamily, readonly [number, number]>;

export function fixtureLevel(state: LightingState, family: LightFamily, station: number, group: number, reduced = false) {
  const { beat, previous, next, mix, blackout, override } = state;
  const [floor, amp] = budgets[family];
  const forCue = (cue: LightCue) => {
    const pattern = override ?? (family === 'fill' || family === 'gate-adjacent' ? 'steady'
      : family === 'functional' ? 'breath' : family === 'hero' && cue.name === 'FINALE' ? 'symbol' : cue.pattern);
    return patternStrength(reduced ? 'breath' : pattern, beat, station, group, cue.start);
  };
  const a = forCue(previous), p = a + (forCue(next) - a) * mix;
  const low = !reduced && (family === 'hero' || family === 'rhythm') ? 1 - blackout * .88 : 1;
  return (floor + amp * p * (reduced ? .35 : 1)) * low;
}

export function warmWeight(beat: number, group: number, dual: boolean) {
  const side = mod(group, 2) === 0;
  return dual ? (side ? .63 : .37) + (side ? 1 : -1) * .28 * Math.sin(tau * beat / 8)
    : side ? .88 : .20;
}
