import type { VolumeDefinition } from '../core/volumes';
import { createBuffers, createMaster, Synthesizer } from './synthesizer.client';

const LEAD = 0.06;
const LOOKAHEAD = 0.12;
const ACTIVATION_TIMEOUT = 2000;

export class AudioTransport {
  private context?: AudioContext;
  private master?: GainNode;
  private buffers?: ReturnType<typeof createBuffers>;
  private synth?: Synthesizer;
  private timer?: ReturnType<typeof setInterval>;
  private anchor = 0;
  private offset = 0;
  private cancelActivation?: () => void;
  private generation = 0;
  private disposed = false;
  private volume = 0.8;
  private muted = false;

  constructor(private readonly onInterrupt: () => void) {}

  get time() {
    return this.synth && this.context ? Math.max(this.offset, this.context.currentTime - this.anchor) : this.offset;
  }

  async start(volume: VolumeDefinition, offset: number): Promise<boolean> {
    if (this.disposed) return false;
    this.stop();
    const generation = this.generation;
    if (this.context?.state === 'closed') {
      this.context.onstatechange = null;
      this.context = this.master = this.buffers = undefined;
    }
    const ctx = this.context ??= this.createContext();
    if (!ctx) return false;

    // Call resume before waiting for any work so the initiating gesture can unlock it.
    if (ctx.state !== 'running' && !await this.activate(ctx)) return false;
    if (generation !== this.generation || ctx.state !== 'running') return false;

    this.master ??= createMaster(ctx, this.muted ? 0 : this.volume);
    this.buffers ??= createBuffers(ctx);
    const synth = new Synthesizer(ctx, volume, this.master, this.buffers);
    this.synth = synth;
    this.offset = offset;
    this.anchor = ctx.currentTime + LEAD - offset;
    const stepTime = 15 / volume.bpm;
    let step = Math.ceil(offset / stepTime - 1e-9);
    const schedule = () => {
      if (generation !== this.generation || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      step = Math.max(step, Math.ceil((now - this.anchor) / stepTime));
      while (step < volume.beats * 4 && this.anchor + step * stepTime < now + LOOKAHEAD) {
        synth.playStep(step, this.anchor + step * stepTime);
        step++;
      }
    };
    schedule();
    this.timer = setInterval(() => {
      try {
        schedule();
      } catch {
        if (generation !== this.generation) return;
        this.stop();
        this.onInterrupt();
      }
    }, 25);
    return true;
  }

  stop() {
    this.generation++;
    this.cancelActivation?.();
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.synth?.dispose();
    this.synth = undefined;
  }

  setLevel(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
    if (this.master && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : volume, now, 0.05);
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
    this.context = this.master = this.buffers = undefined;
  }

  private createContext() {
    const platform = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Context = platform.AudioContext ?? platform.webkitAudioContext;
    if (!Context) return undefined;
    const context = new Context({ latencyHint: 'interactive' });
    context.onstatechange = () => {
      if (this.synth && context.state !== 'running') this.onInterrupt();
    };
    return context;
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
