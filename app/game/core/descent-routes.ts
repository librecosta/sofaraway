import type { ChartGate } from './chart';
import type { BranchSpec } from './branches';

export const descentJunction = {
  preview: 128, split: 138.92, guideEnd: 141, sideThreshold: 2.13,
  open: { standard: 145, sightseeing: 145 },
  merge: { standard: 161, sightseeing: 161 }, rejoin: 167,
  spacing: 11.6, rise: 0, spiral: true, sightseeingPattern: 'preserve-main',
  charts: descentRouteCharts,
} satisfies BranchSpec;

export const descentCargo = { beat: 161, preview: 153, x: 0, y: 0, radius: .95, route: 'score' } as const;

function routeGate(beat: number, kind: ChartGate['kind'], sector: number, axis: 0 | 1 = 0): ChartGate {
  return { beat, kind, sector, axis, section: 'FLIGHT' };
}

function descentRouteCharts(main: readonly ChartGate[]) {
  return {
    main: [...main],
    challenge: [
      routeGate(145, 'laser-slice', 0), routeGate(147, 'laser-matrix', 1),
      routeGate(149, 'laser-weave', 2), routeGate(151, 'laser-matrix', 3),
      routeGate(153, 'laser-slice', 4), routeGate(155, 'laser-weave', 4, 1),
      routeGate(157, 'laser-matrix', 5), routeGate(159, 'laser-slice', 6, 1),
    ],
    score: [
      routeGate(146, 'laser-slice', 2), routeGate(149, 'laser-slice', 0, 1),
      routeGate(152, 'laser-weave', 1), routeGate(155, 'laser-slice', 2),
      routeGate(158, 'laser-slice', 0, 1),
    ],
  };
}
