import { controlEvents, controlSignalWindow, controlSteps, controlTrack, seed, step } from '../core/descent-score';
import type { DescentEvent } from '../core/descent-score';
import { filter, gain } from './daybreak-voices.client';
import { descentVoices } from './descent-voices.client';

export interface DescentArrangement {
  bars: number;
  duration: number;
  tail: number;
  events: readonly DescentEvent[];
  steps: readonly (readonly number[])[];
  voiceProfile: 'A' | 'B';
  signalWindow?: readonly number[];
}

export const controlArrangement: DescentArrangement = {
  ...controlTrack, events: controlEvents, steps: controlSteps, voiceProfile: 'A', signalWindow: controlSignalWindow,
};

export class DescentSynthesizer {
  private readonly runBus: GainNode;
  private readonly trim: number;
  private readonly play: ReturnType<typeof descentVoices>;

  constructor(ctx: BaseAudioContext, output: AudioNode, private readonly arrangement = controlArrangement,
    start = 0, end = arrangement.duration) {
    this.trim = arrangement.voiceProfile === 'B' ? .77 : .85;
    this.runBus = gain(ctx, output, this.trim);
    const compression = ctx.createDynamicsCompressor();
    compression.threshold.value = -15;
    compression.knee.value = 9;
    compression.ratio.value = 2;
    compression.attack.value = .003;
    compression.release.value = .085;
    compression.connect(this.runBus);
    const mixer = filter(ctx, compression, 'highpass', 27, .68);
    const window = arrangement.signalWindow;
    const activeWindow = window && window[0] < end && window[1] > start ? window : undefined;
    this.play = descentVoices(ctx, mixer, arrangement.voiceProfile, seed, step, activeWindow);
  }

  playStep(index: number, at: number, after = -Infinity) {
    this.scheduleStep(index, at - index * step, after);
  }

  scheduleStep(index: number, anchor: number, after: number, before = Infinity) {
    // Absolute score indices keep noise and microtiming stable when restarting mid-bar.
    for (const eventIndex of this.arrangement.steps[index] ?? []) {
      const event = this.arrangement.events[eventIndex];
      if (event.at > after && event.at < before) this.play(event, eventIndex, Math.max(0, anchor + event.at));
    }
  }

  finishAt(end: number) {
    this.runBus.gain.setValueAtTime(this.trim, end + .28);
    this.runBus.gain.linearRampToValueAtTime(0, end + this.arrangement.tail - .02);
  }

  dispose() { this.runBus.disconnect(); }
}
