export const STEP = 1 / 60;
export const MAX_STEPS = 12;
export const RECOVERY_GAP = 0.15;

export class RunTimeline {
  private origin = 0;
  private offset = 0;

  anchor(origin: number, offset: number) {
    this.origin = origin;
    this.offset = offset;
  }

  at(now: number) { return Math.max(this.offset, now - this.origin); }
}

/** Carries unprocessed debt into the next frame, keeping all spatial events in order. */
export class FixedStepClock {
  private ticks = 0;

  get elapsed() { return this.ticks * STEP; }

  reset() { this.ticks = 0; }

  consume(target: number, step: () => boolean | void): 'ok' | 'catching-up' {
    const due = Math.max(0, Math.floor((target - this.elapsed) / STEP + 1e-7));
    for (let i = 0; i < Math.min(due, MAX_STEPS); i++) {
      this.ticks++;
      if (step() === false) return 'ok';
    }
    return due > MAX_STEPS ? 'catching-up' : 'ok';
  }
}
