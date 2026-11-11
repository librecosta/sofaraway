export const STEP = 1 / 60;
export const MAX_STEPS = 5;

/** Consumes time from the current transport without committing an unsafe backlog. */
export class FixedStepClock {
  private ticks = 0;

  get elapsed() { return this.ticks * STEP; }

  reset() { this.ticks = 0; }

  consume(target: number, step: () => boolean | void): 'ok' | 'stalled' {
    const due = Math.max(0, Math.floor((target - this.elapsed) / STEP + 1e-7));
    if (due > MAX_STEPS) return 'stalled';
    for (let i = 0; i < due; i++) {
      this.ticks++;
      if (step() === false) break;
    }
    return 'ok';
  }
}
