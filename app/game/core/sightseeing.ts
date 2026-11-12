import { SIGHTSEEING_MERGE_BEAT } from './branches';
import type { RouteKind } from './branches';

export const SIGHTSEEING_SPEED = 1 / 3;
export const SIGHTSEEING_LIVES = 5;

/** Take the gate nearest the midpoint of each equally sized bin. */
function sample<T>(gates: readonly T[], count = gates.length ? Math.max(1, Math.round(gates.length / 3)) : 0): T[] {
  return Array.from({ length: count }, (_, i) => gates[Math.floor((i + 0.5) * gates.length / count)]);
}

export function sightseeingChart<T extends { beat: number }>(gates: readonly T[], sections: readonly { beats: number }[]) {
  let start = 0;
  return sections.flatMap(({ beats }) => {
    const end = start + beats;
    const selected = sample(gates.filter(gate => gate.beat >= start && gate.beat < end));
    start = end;
    return selected;
  });
}

export function sightseeingRoute<T extends { beat: number }>(gates: readonly T[], route: RouteKind) {
  const open = gates.filter(gate => gate.beat < SIGHTSEEING_MERGE_BEAT);
  if (route === 'main') return open.filter((_, i) => i === 2 || i === 4 || i === 6); // Square, Diamond, Iris.
  if (route === 'score') return open.filter((_, i) => i % 3 === 0); // Keep alternating central openings.
  return sample(open, 4);
}
