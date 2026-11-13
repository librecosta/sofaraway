import type { PlayMode } from '../contracts';
import { BRANCH_PREVIEW_BEAT, REJOIN_BEAT } from './branches';
import { IMPOSSIBLE_SPEED_FACTOR } from './difficulty';
import { BOOST_MULTIPLIER, cruiseTarget, modeScale, referenceFor, START_DISTANCE } from './reference-track';
import type { VolumeDefinition } from './volumes';

export const lightingWindows = [
  ['pure-frame', 0, 16],
  ['helical-wash', 24, 72],
  ['staggered-cells', 104, 152],
  ['triple-helix', 160, 192],
  ['pure-frame', 208, 248],
  ['connected-flow', 248, 280],
  ['pure-frame', 288, 320],
  ['pure-frame', 320, 384],
  ['raked-bands', 392, 432],
] as const;

export const curveStartBeat = 208;
export const curveEndBeat = 248;
export const curveAmplitude = 101.117;
const tau = 2 * Math.PI;

export function curveOffset(t: number) {
  return .5 * Math.sin(tau * t) - .25 * Math.sin(2 * tau * t);
}

export function curveSlope(t: number) {
  return .5 * tau * (Math.cos(tau * t) - Math.cos(2 * tau * t));
}

export function curveCurvature(t: number, depth: number, amplitude: number) {
  const second = tau ** 2 * (-.5 * Math.sin(tau * t) + Math.sin(2 * tau * t));
  return Math.abs(amplitude * depth * second) / Math.hypot(depth, amplitude * curveSlope(t)) ** 3;
}

const ARC_STEPS = 1024;

/** Simpson integration over each parameter cell also produces the inverse lookup table. */
export function fitCurve(length: number, amplitude: number) {
  const lateralSquared = Float64Array.from({ length: 2 * ARC_STEPS + 1 },
    (_, i) => (amplitude * curveSlope(i / (2 * ARC_STEPS))) ** 2);
  const integrate = (depth: number, table?: Float64Array) => {
    const longitudinalSquared = depth * depth;
    let sum = 0, previous = depth;
    for (let i = 1; i <= ARC_STEPS; i++) {
      const middle = Math.sqrt(longitudinalSquared + lateralSquared[2 * i - 1]);
      const end = Math.sqrt(longitudinalSquared + lateralSquared[2 * i]);
      sum += (previous + 4 * middle + end) / (6 * ARC_STEPS);
      if (table) table[i] = sum;
      previous = end;
    }
    return sum;
  };
  let lo = 0, hi = length;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (integrate(mid) < length) lo = mid;
    else hi = mid;
  }
  const depth = (lo + hi) / 2;
  const arc = new Float64Array(ARC_STEPS + 1);
  integrate(depth, arc);
  return { depth, amplitude, arc };
}

export type CorridorSegment =
  | { type: 'straight'; s0: number; s1: number }
  | { type: 'bend'; s0: number; s1: number; angle: number }
  | { type: 'junction'; s0: number; s1: number }
  | ({ type: 's-curve'; s0: number; s1: number } & ReturnType<typeof fitCurve>);

export function corridorLength(volume: VolumeDefinition, mode: PlayMode = 'standard') {
  const original = START_DISTANCE + volume.beats * 60 / volume.bpm
    * cruiseTarget(Infinity) * BOOST_MULTIPLIER * modeScale(mode) + 650;
  return volume.id === 'elsewhere' && mode === 'standard'
    ? Math.max(original, referenceFor(volume).boostFinish(mode, IMPOSSIBLE_SPEED_FACTOR) + 650) : original;
}

export function composeElsewhere(volume: VolumeDefinition, mode: PlayMode): CorridorSegment[] {
  const reference = referenceFor(volume);
  const station = (beat: number) => reference.station(beat, mode);
  const segments: CorridorSegment[] = [];
  let from = 0;
  const straightTo = (s1: number) => {
    segments.push({ type: 'straight', s0: from, s1 });
    from = s1;
  };
  // Shallow horizontal turns in the gaps keep the route progressing in the same direction.
  for (const [beat0, beat1, turn] of [[16, 24, 1], [72, 104, -1], [152, 160, -1], [192, 208, 1]] as const) {
    const a = station(beat0), b = station(beat1);
    const arc = Math.min(46 * Math.PI / 6, (b - a) * .74);
    const s0 = (a + b - arc) / 2, s1 = s0 + arc;
    straightTo(s0);
    segments.push({ type: 'bend', s0, s1, angle: turn * arc / 46 });
    from = s1;
  }
  const s0 = station(curveStartBeat), s1 = station(curveEndBeat);
  const length = s1 - s0;
  const standardLength = reference.station(curveEndBeat, 'standard') - reference.station(curveStartBeat, 'standard');
  straightTo(s0);
  segments.push({ type: 's-curve', s0, s1, ...fitCurve(length, curveAmplitude * length / standardLength) });
  from = s1;
  // Preserve the legacy centerline through the branch and give the final installation its own straight.
  const junctionStart = station(BRANCH_PREVIEW_BEAT - 5), junctionEnd = station(REJOIN_BEAT + 4);
  straightTo(junctionStart);
  segments.push({ type: 'junction', s0: junctionStart, s1: junctionEnd });
  from = junctionEnd;
  straightTo(corridorLength(volume, mode));
  return segments;
}
