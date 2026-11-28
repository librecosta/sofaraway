import type { VolumeId } from '../app/game/contracts';
import { ROUTE_GATE_MULTIPLIERS } from '../app/game/core/branches';
import { SCORING_RULES_VERSION } from '../app/game/core/scoring';
import { totalRunScore } from '../app/game/runtime/records.client';
import type { RunSettlement } from '../app/game/runtime/run-settlement';

export const leaderboardVolumes = ['elsewhere', 'daybreak', 'descent', 'orbit'] as const;
export const boards = { elsewhere: 1, daybreak: 2, descent: 3, orbit: 4 } as const satisfies Record<VolumeId, number>;
export type Board = typeof boards[VolumeId];
export type Period = 'all' | 'week';
// The public SDK caps each board at 100 entries and does not expose pagination.
export const leaderboardLimit = 100;
export function isSdkScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= -(2 ** 24) && value < 2 ** 24;
}

export function competition(run: RunSettlement) {
  const { policy, record, result } = run;
  if (run.scoringVersion !== SCORING_RULES_VERSION) return { reason: 'version' } as const;
  if (policy.mode !== 'standard' || !policy.scoring || policy.showcaseRoute !== null) return { reason: 'mode' } as const;
  if (policy.difficulty !== 'normal') return { reason: 'difficulty' } as const;
  if (result.title !== 'ESCAPED') return { reason: 'finish' } as const;
  if (!result.route || !Object.hasOwn(ROUTE_GATE_MULTIPLIERS, result.route)) return { reason: 'route' } as const;
  if (result.neutralized !== 0 || (result.encore?.neutralized ?? 0) !== 0) return { reason: 'recovery' } as const;
  if (!policy.interactiveRandomRun || policy.allowSimulationDiagnostics) return { reason: 'policy' } as const;
  const score = totalRunScore(record);
  if (!isSdkScore(record.score) || record.score < 0 || !isSdkScore(score) ||
    record.outcome !== result.title || record.recovery || record.encoreBonus !== result.encore?.bonusScore ||
    (record.encoreBonus !== undefined && (!Number.isInteger(record.encoreBonus) || record.encoreBonus < 0))) {
    return { reason: 'score' } as const;
  }
  return { board: boards[policy.volumeId], score } as const;
}

export interface RankEntry {
  readonly rank: number;
  readonly score: number;
  readonly nickname: string;
  readonly avatar: string;
}
export interface MyRank {
  readonly ranked: boolean;
  readonly rank: number;
  readonly score: number;
}
const failures = ['unsupported', 'login', 'permission', 'network', 'limited', 'timeout', 'invalid', 'session'] as const;
export type RankFailure = typeof failures[number];
export class RankError extends Error {
  constructor(readonly kind: RankFailure) { super(kind); }
}

export function rankFailure(error: unknown): RankFailure {
  // Development passes service errors across the console iframe boundary.
  const kind = error && typeof error === 'object' && 'kind' in error ? error.kind : undefined;
  return failures.find(value => value === kind) ?? 'network';
}

export interface ServiceSession {
  session(): number;
  subscribeSession(listener: () => void): () => void;
}

export interface LeaderboardPlatform extends ServiceSession {
  list(board: Board, period: Period, signal: AbortSignal): Promise<readonly RankEntry[]>;
  mine(board: Board, period: Period, signal: AbortSignal): Promise<MyRank>;
  submit(board: Board, score: number, signal: AbortSignal): Promise<number>;
}
