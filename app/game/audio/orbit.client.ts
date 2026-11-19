import { beatSeconds, seed, starwakeEvents, starwakeSteps, starwakeTrack, step } from '../core/orbit-score';
import { OrbitVoices } from './orbit-voices.client';

// The approved B audition's static trim, rounded to a maintainable mix level.
export const starwakeMaster = .65;

export class OrbitSynthesizer {
  private readonly voices: OrbitVoices;
  private disposed = false;

  constructor(ctx: BaseAudioContext, destination: AudioNode) {
    this.voices = new OrbitVoices(ctx, destination, 'B', starwakeEvents,
      { ...starwakeTrack, beatSeconds, seed }, starwakeMaster);
  }

  playStep(index: number, at: number, after = -Infinity) {
    this.scheduleStep(index, at - index * step, after);
  }

  scheduleStep(index: number, anchor: number, after = -Infinity, before = Infinity) {
    if (this.disposed) return;
    for (const eventIndex of starwakeSteps[index] ?? []) {
      const event = starwakeEvents[eventIndex];
      if (event.at <= after || event.at >= before) continue;
      const at = Math.max(0, anchor + event.at);
      if (event.voice === 'kick') this.voices.duckAt(at);
      this.voices.play(event, at);
    }
  }

  finishAt(end: number) { this.voices.finish(end - starwakeTrack.duration); }
  dispose() { this.disposed = true; this.voices.dispose(); }
}
