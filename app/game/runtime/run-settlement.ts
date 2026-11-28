import type { LastRun, RunResult } from '../contracts';
import type { RunPolicy } from '../core/run-policy';

export interface RunSettlement {
  readonly id: number;
  readonly policy: Readonly<RunPolicy>;
  readonly result: RunResult;
  readonly record: LastRun;
}
