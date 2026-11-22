import type { StemRouting } from './stem-routing';
import { beatSeconds, seed, starwakeEvents, starwakeSteps, starwakeTrack, step } from '../core/orbit-score';
import type { OrbitEvent } from '../core/orbit-score';
import { OrbitVoices } from './orbit-voices.client';

// The approved B audition's static trim, rounded to a maintainable mix level.
export const starwakeMaster = .65;

export interface OrbitArrangement {
  events: readonly OrbitEvent[];
  steps: readonly (readonly number[])[];
}
export const originalStarwake: OrbitArrangement = { events:starwakeEvents, steps:starwakeSteps };

export class OrbitSynthesizer {
  private readonly voices: OrbitVoices;
  private disposed = false;

  constructor(ctx: BaseAudioContext, destination: AudioNode, route?: StemRouting,
    private readonly arrangement: OrbitArrangement = originalStarwake) {
    this.voices = new OrbitVoices(ctx, destination, 'B', arrangement.events,
      { ...starwakeTrack, beatSeconds, seed }, starwakeMaster, route);
  }

  playStep(index: number, at: number, after = -Infinity) {
    this.scheduleStep(index, at - index * step, after);
  }

  scheduleStep(index: number, anchor: number, after = -Infinity, before = Infinity) {
    if (this.disposed) return;
    for (const eventIndex of this.arrangement.steps[index] ?? []) {
      const event = this.arrangement.events[eventIndex];
      if (event.at <= after || event.at >= before) continue;
      const at = Math.max(0, anchor + event.at);
      if (event.voice === 'kick') this.voices.duckAt(at);
      this.voices.play(event, at);
    }
  }

  finishAt(end: number) { this.voices.finish(end - starwakeTrack.duration); }
  dispose() { this.disposed = true; this.voices.dispose(); }
}
