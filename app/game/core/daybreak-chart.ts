import type { ChartGate } from './chart';
import type { Difficulty } from '../contracts';
import type { RouteKind } from './branches';
import { rhythmTimeline } from './daybreak-score';

const crystal = 'daybreak-crystal';
const vertical = 'daybreak-vertical';
const horizontal = 'daybreak-horizontal';
const hits = rhythmTimeline().filter(event => event.kind === 'kick' || event.kind === 'snare' || event.kind === 'fill' || event.kind === 'hat');

/** Match evenly distributed phrase slots to real onsets while preserving travel time. */
function phrase(section: string, start: number, end: number, count: number, direction: number,
  shape: 'main' | 'challenge' | 'score' = 'main'): ChartGate[] {
  const gap = shape === 'score' ? .66 : shape === 'challenge' ? 1.14 : 1.26;
  const candidates = hits.filter(hit => hit.section === section && hit.beat >= start && hit.beat <= end
    && (hit.kind !== 'hat' || shape === 'score'));
  let predecessor = -1;
  const before = candidates.map(hit => {
    while (candidates[predecessor + 1]?.beat <= hit.beat - gap) predecessor++;
    return predecessor;
  });
  const choices = Array.from({ length: count }, () => new Int32Array(candidates.length));
  let costs = new Float64Array(candidates.length);
  for (const [index, choice] of choices.entries()) {
    const target = start + (end - start) * (index + .32) / count;
    const best = new Float64Array(candidates.length);
    candidates.forEach((hit, i) => {
      const cost = (index ? costs[before[i]] ?? Infinity : 0) + Math.abs(hit.beat - target)
        + (hit.kind === 'snare' ? .10 : hit.kind === 'fill' ? .16 : hit.kind === 'hat' ? .27 : 0);
      const earlier = best[i - 1] ?? Infinity;
      choice[i] = cost < earlier ? i : choice[i - 1] ?? -1;
      best[i] = Math.min(cost, earlier);
    });
    costs = best;
  }
  if (!Number.isFinite(costs.at(-1))) throw new Error(`DAYBREAK ${section} cannot fit ${count} gates between beats ${start} and ${end}`);
  let last = candidates.length - 1;
  return choices.map((_, index): ChartGate => {
    const hit = choices[count - index - 1][last];
    last = before[hit];
    return { beat: candidates[hit].beat, section, kind: crystal, sector: 0 };
  }).reverse().map((gate, index) => {
    const group = Math.floor(index / 5);
    const slot = index % 5;
    const kind = shape === 'score' || slot === 0 || (slot === 4 && shape === 'main')
      ? ((index + direction) % 2 ? horizontal : vertical) : crystal;
    const sector = kind === crystal ? (direction + group) % 4 : 0;
    return { ...gate, kind, sector };
  });
}

export const daybreakJunctionWindow = { preview: 224, split: 228, open: 232, merge: 256, rejoin: 259 } as const;
export const DAYBREAK_PICKUP_BEAT = 152;

const main = [
  ...phrase('GLIDE', 17, 77, 28, 0),
  ...phrase('LIFT', 81, 125, 22, 1),
  ...phrase('BREEZE', 130, 150, 4, 2),
  ...phrase('BREEZE', 154, 158.9, 3, 2),
  ...phrase('SUNBURST', 160, 222, 38, 3),
  ...phrase('RETURN', 224, 227, 2, 0),
  ...phrase('RETURN', 232.3, 255.8, 15, 0),
  ...phrase('RETURN', 259, 271.95, 8, 3),
];

export function daybreakChart() { return main.map(gate => ({ ...gate })); }

const challenge = phrase('RETURN', 232.1, 255.99, 16, 1, 'challenge');
const bonus = phrase('RETURN', 232.2, 255.8, 26, 0, 'score');

export function daybreakRouteCharts(replaced: readonly ChartGate[], difficulty: Difficulty = 'normal'): Record<RouteKind, ChartGate[]> {
  const keep = (_: ChartGate, index: number) => difficulty !== 'easy' || index % 3 !== 1;
  return {
    main: [...replaced],
    challenge: challenge.filter(keep),
    score: bonus.filter(keep),
  };
}
