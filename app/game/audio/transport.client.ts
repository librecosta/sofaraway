import type { VolumeDefinition } from '../core/volumes';
import { musicStepSeconds } from '../core/rhythmic-lights';
import { createBuffers, createMaster, Synthesizer } from './synthesizer.client';

const LEAD = 0.06;
const LOOKAHEAD = 0.12;
const DAYBREAK_LOOKAHEAD = 0.22;
const GRID_EPSILON = 1e-9;
const ACTIVATION_TIMEOUT = 2000;
type Interruption = 'audio';

function emptyDiagnostics() {
  return { lateCallbacks: 0, missedSteps: 0, maxDelaySeconds: 0, resumes: 0, silentFallbacks: 0 };
}

export class AudioTransport {
  private context?: AudioContext;
  private master?: GainNode;
  private daybreakOutput?: GainNode;
  private buffers?: ReturnType<typeof createBuffers>;
  private synth?: Synthesizer;
  private timer?: ReturnType<typeof setInterval>;
  private anchor = 0;
  runOrigin = 0;
  readonly diagnostics = emptyDiagnostics();
  private offset = 0;
  private stepSeconds = 0;
  private nextStepAt = Infinity;
  private lastScheduledStep = -1;
  private playedThrough = -1;
  private daybreakThrough = -Infinity;
  private daybreak = false;
  private cancelActivation?: () => void;
  private generation = 0;
  private disposed = false;
  private volume = 0.8;
  private muted = false;
  private lastHover = -Infinity;

  constructor(private readonly onInterrupt: (reason: Interruption) => void) {}

  get time(): number | Interruption {
    const ctx = this.context;
    if (!this.synth || !ctx || ctx.state !== 'running') return 'audio';
    return Math.max(this.offset, ctx.currentTime - this.anchor);
  }

  /** Estimate the run phase at the audio output for this RAF timestamp. */
  outputTimeAt(frameSeconds: number) {
    const ctx = this.context;
    if (!this.synth || !ctx || ctx.state !== 'running') return;
    const stamp = ctx.getOutputTimestamp?.();
    const at = stamp?.performanceTime, position = stamp?.contextTime;
    if (at === undefined || position === undefined || !Number.isFinite(at) || !Number.isFinite(position) ||
      at <= 0 || position <= 0 || Math.abs(frameSeconds - at / 1000) > .25) return;
    return position + frameSeconds - at / 1000 - this.anchor;
  }

  // Use the same output bus as the soundtrack without starting its scheduler.
  unlock() {
    if (this.disposed) return;
    try {
      const ctx = this.audioContext();
      if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
    } catch { /* A cue must never block menu interaction. */ }
  }

  playUiCue(cue: 'hover' | 'press') {
    if (this.disposed || this.muted || this.volume === 0 || this.synth) return;
    const press = cue === 'press';
    try {
      const activated = navigator.userActivation?.isActive;
      const ctx = press || activated ? this.audioContext() : this.context;
      if (!ctx) return;
      const play = () => {
        if (this.disposed || this.muted || this.volume === 0 || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        if (!press && now - this.lastHover < .07) return;
        if (!press) this.lastHover = now;
        this.master ??= createMaster(ctx, this.volume);
        const tone = ctx.createOscillator();
        const envelope = ctx.createGain();
        const end = now + (press ? .115 : .09);
        tone.type = press ? 'sine' : 'triangle';
        tone.frequency.setValueAtTime(press ? 780 : 610, now);
        tone.frequency.exponentialRampToValueAtTime(press ? 390 : 890, end);
        envelope.gain.setValueAtTime(.0001, now);
        envelope.gain.exponentialRampToValueAtTime(press ? .28 : .12, now + .008);
        envelope.gain.exponentialRampToValueAtTime(.0001, end);
        tone.connect(envelope).connect(this.master);
        tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
        tone.start(now);
        tone.stop(end);
      };
      if (ctx.state === 'running') play();
      else if (press || activated) {
        const pressedAt = performance.now();
        void ctx.resume().then(() => { if (performance.now() - pressedAt < 240) play(); }).catch(() => {});
      }
    } catch { /* Audio failure is handled by the run transport on start. */ }
  }

  async start(volume: VolumeDefinition, position: number | ((lead: number) => number), resume = false): Promise<boolean> {
    if (this.disposed) return false;
    this.stop(resume);
    if (!resume) this.resetDiagnostics();
    const generation = this.generation;
    const ctx = this.audioContext();
    if (!ctx) return false;

    // Call resume before waiting for any work so the initiating gesture can unlock it.
    if (ctx.state !== 'running' && !await this.activate(ctx)) return false;
    if (generation !== this.generation || ctx.state !== 'running') return false;

    const level = this.muted ? 0 : this.volume;
    this.daybreak = volume.music === 'breakbeat';
    let output: GainNode;
    if (this.daybreak) {
      if (!this.daybreakOutput) {
        this.daybreakOutput = ctx.createGain();
        this.daybreakOutput.gain.value = level;
        this.daybreakOutput.connect(ctx.destination);
      }
      output = this.daybreakOutput;
    } else {
      output = this.master ??= createMaster(ctx, level);
      this.buffers ??= createBuffers(ctx);
    }
    const synth = new Synthesizer(ctx, volume, output, this.buffers);
    this.synth = synth;
    const offset = typeof position === 'number' ? position : position(LEAD);
    this.offset = offset;
    this.anchor = ctx.currentTime + LEAD - offset;
    this.runOrigin = performance.now() / 1000 + LEAD - offset;
    const stepTime = musicStepSeconds(volume.bpm);
    this.stepSeconds = stepTime;
    const endStep = volume.beats * 4;
    const lookahead = this.daybreak ? DAYBREAK_LOOKAHEAD : LOOKAHEAD;
    let cutoff = resume && this.daybreak ? Math.max(offset - GRID_EPSILON, this.daybreakThrough) : offset - GRID_EPSILON;
    let step = this.daybreak ? Math.max(0, Math.floor(cutoff / stepTime))
      : Math.max(0, Math.ceil(cutoff / stepTime), this.playedThrough + 1);
    this.nextStepAt = step < endStep ? this.anchor + step * stepTime : Infinity;
    const schedule = () => {
      if (generation !== this.generation || ctx.state !== 'running') return;
      const horizon = ctx.currentTime + lookahead;
      let late = false;
      while (this.nextStepAt < horizon) {
        const now = ctx.currentTime;
        // DAYBREAK may still have swung or staggered notes after the grid tick.
        if (this.nextStepAt + (this.daybreak ? stepTime : 0) < now) {
          const future = Math.min(endStep, Math.max(step + 1, this.daybreak
            ? Math.floor((now - this.anchor) / stepTime) : Math.ceil((now - this.anchor) / stepTime)));
          if (!late) this.diagnostics.lateCallbacks++;
          late = true;
          this.diagnostics.missedSteps += future - step;
          this.diagnostics.maxDelaySeconds = Math.max(this.diagnostics.maxDelaySeconds, now - this.nextStepAt);
          this.playedThrough = Math.max(this.playedThrough, future - 1);
          if (this.daybreak) cutoff = Math.max(cutoff, now - this.anchor);
          step = future;
          this.nextStepAt = step < endStep ? this.anchor + step * stepTime : Infinity;
          continue;
        }
        if (this.daybreak) synth.playStep(step, this.nextStepAt, Math.max(cutoff, now - this.anchor));
        else synth.playStep(step, this.nextStepAt);
        this.lastScheduledStep = step;
        step++;
        this.nextStepAt = step < endStep ? this.anchor + step * stepTime : Infinity;
      }
    };
    schedule();
    if (generation !== this.generation) return false;
    this.timer = setInterval(() => {
      try {
        schedule();
      } catch {
        if (generation !== this.generation) return;
        this.interrupt('audio');
      }
    }, 25);
    if (resume) this.diagnostics.resumes++;
    return true;
  }

  resetDiagnostics() { Object.assign(this.diagnostics, emptyDiagnostics()); }

  stop(keepPosition = false) {
    if (keepPosition && this.synth && this.context) {
      // Keep the last rendered step separate from the simulation's last committed tick.
      const rendered = Math.floor((this.context.currentTime - this.anchor + GRID_EPSILON) / this.stepSeconds);
      this.playedThrough = Math.max(this.playedThrough, Math.min(this.lastScheduledStep, rendered));
      if (this.daybreak) this.daybreakThrough = Math.max(this.daybreakThrough, this.context.currentTime - this.anchor);
    } else if (!keepPosition) {
      this.playedThrough = -1;
      this.daybreakThrough = -Infinity;
    }
    this.generation++;
    this.cancelActivation?.();
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.synth?.dispose();
    this.synth = undefined;
    this.nextStepAt = Infinity;
    this.lastScheduledStep = -1;
  }

  setLevel(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
    if (this.context) {
      const now = this.context.currentTime;
      for (const output of [this.master, this.daybreakOutput]) {
        output?.gain.cancelScheduledValues(now);
        output?.gain.setTargetAtTime(muted ? 0 : volume, now, 0.05);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => {});
    }
    this.context = this.master = this.daybreakOutput = this.buffers = undefined;
  }

  private audioContext() {
    if (this.context?.state === 'closed') {
      this.context.onstatechange = null;
      this.context = this.master = this.daybreakOutput = this.buffers = undefined;
      this.lastHover = -Infinity;
    }
    return this.context ??= this.createContext();
  }

  private createContext() {
    const platform = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Context = platform.AudioContext ?? platform.webkitAudioContext;
    if (!Context) return undefined;
    const context = new Context({ latencyHint: 'interactive' });
    context.onstatechange = () => {
      if (this.synth && context.state !== 'running') this.interrupt('audio');
    };
    return context;
  }

  private interrupt(reason: Interruption) {
    this.stop(true);
    this.onInterrupt(reason);
  }

  private activate(ctx: AudioContext) {
    const resume = ctx.resume();
    return new Promise<boolean>(resolve => {
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        if (this.cancelActivation === cancel) this.cancelActivation = undefined;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), ACTIVATION_TIMEOUT);
      const cancel = () => finish(false);
      this.cancelActivation = cancel;
      void resume.then(() => finish(ctx.state === 'running'), cancel);
    });
  }
}
