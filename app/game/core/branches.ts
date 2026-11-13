import type { ChartGate } from './chart';
import { clamp } from './collision';
import { runRandomWord } from './run-seed';
import { impossibleRoutes } from './impossible-chart';
import type { Difficulty } from '../contracts';

export const BRANCH_PREVIEW_BEAT = 315;
export const SPLIT_BEAT = 320;
export const BRANCH_OPEN_BEAT = 323.25;
export const BRANCH_GUIDANCE_END = 323;
export const ROUTE_BEAT = 326;
export const MERGE_BEAT = 349.5;
export const REJOIN_BEAT = 352;
export const SIGHTSEEING_OPEN_BEAT = 325.25;
export const SIGHTSEEING_MERGE_BEAT = 347.25;
export const BRANCH_SPACING = 10.5;
export const BRANCH_SIDE_THRESHOLD = 2.4;
export const ROUTE_STREAM = 0x524f5554;
export const ROUTE_GATE_MULTIPLIERS = { main: 1, challenge: 2, score: 0.65 } as const;
export type RouteKind = keyof typeof ROUTE_GATE_MULTIPLIERS;
export const ROUTE_LABELS = { main: 'MAIN', challenge: 'CHALLENGE', score: 'BONUS' } satisfies Record<RouteKind, string>;
export type RouteSide = 'left' | 'center' | 'right';
export type BranchLayout = Readonly<Record<RouteSide, RouteKind>>;
export const routeSides = ['left', 'center', 'right'] as const;

export function branchLayout(seed: number): BranchLayout {
  return runRandomWord(seed, ROUTE_STREAM) % 2 === 0
    ? { left: 'challenge', center: 'main', right: 'score' }
    : { left: 'score', center: 'main', right: 'challenge' };
}

export function selectSide(x: number): RouteSide {
  return x <= -BRANCH_SIDE_THRESHOLD ? 'left' : x >= BRANCH_SIDE_THRESHOLD ? 'right' : 'center';
}

function ease(t: number) {
  const u = clamp(t, 0, 1);
  return u * u * u * (10 + u * (-15 + 6 * u));
}

export function branchSpread(station: number, start: number, open: number, merge: number, end: number) {
  return BRANCH_SPACING * ease((station - start) / (open - start)) * (1 - ease((station - merge) / (end - merge)));
}

export function branchSteeringWidth(station: number, start: number, split: number, open: number) {
  if (station <= start || station >= open) return 0;
  return Math.min(6, BRANCH_SPACING * ease((station - start) / (open - start)) * 0.7)
    * (1 - ease((station - split) / (open - split)));
}

export interface BranchRun {
  readonly layout: BranchLayout;
  readonly side: RouteSide | null;
}

export function routeCharts(replaced: readonly ChartGate[], difficulty: Difficulty = 'normal'): Record<RouteKind, ChartGate[]> {
  const challengeKinds = ['iris', 'iris', 'iris', 'square', 'iris', 'iris',
    'iris', 'diamond', 'iris', 'iris', 'iris', 'iris'] as const;
  const directions = [0, 1, 2, 0, 4, 5, 6, 0, 7, 0, 1, 2];
  const routes: Record<RouteKind, ChartGate[]> = {
    main: replaced.slice(0, 8).map((gate, i) => ({ ...gate, beat: ROUTE_BEAT + i * 3 })),
    challenge: challengeKinds.map((kind, i) => ({ beat: ROUTE_BEAT + i * 2, kind, sector: directions[i], section: 'A2' })),
    score: Array.from({ length: 24 }, (_, i) => ({
      beat: ROUTE_BEAT + i, kind: i % 2 === 0 ? 'square' : 'diamond', sector: 0, section: 'A2',
    })),
  };
  return difficulty === 'impossible' ? impossibleRoutes(routes) : routes;
}
