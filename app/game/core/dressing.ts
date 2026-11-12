export const structureKinds = ['overhead-assembly', 'ventilation-assembly', 'utility-conduits',
  'service-bay', 'holographic-service-door'] as const;
export type StructureKind = typeof structureKinds[number];
export type Mount = 'ceiling' | 'left' | 'right';
export interface Placement {
  readonly id: number;
  readonly kind: StructureKind;
  readonly station: number;
  readonly mount: Mount;
  readonly x: number;
  readonly y: number;
}
export function placementIndex<T extends Placement>(placements: readonly T[], station: number) {
  let lo = 0, hi = placements.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (placements[mid].station < station) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
