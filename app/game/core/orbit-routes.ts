import type { BranchSpec } from './branches';
import { orbitRouteCharts } from './orbit-chart';

export const orbitRouteSwatches = { main: '#66DDEC', challenge: '#C78BF3', score: '#F2C575' } as const;

export const orbitJunction = {
  preview: 108, split: 120, guideEnd: 122, open: { standard: 128, sightseeing: 128 },
  merge: { standard: 148, sightseeing: 148 }, rejoin: 156, spacing: 22, rise: 0,
  sightseeingPattern: 'preserve-main', charts: orbitRouteCharts,
} satisfies BranchSpec;
export const orbitCargo = { beat: 145, preview: 137, x: 0, y: 0, radius: .95, route: 'score' } as const;
