import type { DaybreakStem } from '../../audio/daybreak.client';
import { inspectorSource } from './source.client';
import { defaultMix } from './track-adapter';
import type { InspectorScore, Mix, TrackId } from './track-adapter';

export type PlaybackState = 'Ready' | 'Starting' | 'Playing' | 'Paused' | 'Stopped' | 'Ended' | 'Audio unavailable';
const fade = .018;
const lookahead = .22;
const recoveryWindow = 6;
type Playback = { anchor: number; bus: GainNode; source: ReturnType<typeof inspectorSource> };

export class InspectorTransport {
  private ctx?: AudioContext;
  private nowPlaying?: Playback;
  private retiring?: Playback;
  private scheduler?: number;
  private release?: number;
  private cancelActivation?: () => void;
  private revision = 0;
  private offset = 0;
  private state: PlaybackState = 'Ready';
  private audition: TrackId | null = null;
  private mix = defaultMix();
  private solo: DaybreakStem | null = null;

  constructor(private readonly score: InspectorScore, private readonly publish: (state: PlaybackState, track: TrackId | null) => void) {}

  get time() {
    const run = this.nowPlaying;
    return run && this.ctx ? Math.min(this.score.duration, Math.max(this.offset, this.ctx.currentTime - run.anchor)) : this.offset;
  }

  private report(state: PlaybackState) {
    this.state = state;
    this.publish(state, this.audition);
  }

  private onState = () => {
    if (this.ctx?.state !== 'running' && this.state === 'Playing') this.pause();
  };

  private releaseRetiring() {
    window.clearTimeout(this.release);
    this.release = undefined;
    this.retiring?.source.dispose();
    this.retiring?.bus.disconnect();
    this.retiring = undefined;
  }

  private detach() {
    this.cancelActivation?.();
    window.clearInterval(this.scheduler);
    this.scheduler = undefined;
    const run = this.nowPlaying;
    if (!run) return;
    this.releaseRetiring();
    this.nowPlaying = undefined;
    if (this.ctx?.state !== 'running') {
      run.source.dispose();
      run.bus.disconnect();
      return;
    }
    const now = this.ctx.currentTime;
    const volume = run.bus.gain;
    if (typeof volume.cancelAndHoldAtTime === 'function') volume.cancelAndHoldAtTime(now);
    else {
      const current = volume.value;
      volume.cancelScheduledValues(now);
      volume.setValueAtTime(current, now);
    }
    volume.linearRampToValueAtTime(0, now + fade);
    this.retiring = run;
    this.release = window.setTimeout(() => this.releaseRetiring(), (fade + .02) * 1000);
  }

  private activate(ctx: AudioContext) {
    if (ctx.state === 'running') return Promise.resolve(true);
    return new Promise<boolean>(resolve => {
      const finish = (ready: boolean) => {
        if (this.cancelActivation !== cancel) return;
        this.cancelActivation = undefined;
        window.clearTimeout(timeout);
        resolve(ready);
      };
      const cancel = () => finish(false);
      const timeout = window.setTimeout(cancel, 2000);
      this.cancelActivation = cancel;
      void ctx.resume().then(() => finish(ctx.state === 'running'), cancel);
    });
  }

  async play(track: TrackId | null = null, start = this.time) {
    const revision = ++this.revision;
    this.detach();
    this.offset = start >= this.score.duration ? 0 : start;
    this.audition = track;
    this.report('Starting');
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.ctx.addEventListener('statechange', this.onState);
      }
      const ctx = this.ctx;
      const activated = await this.activate(ctx);
      if (revision !== this.revision) return;
      if (!activated) throw new Error('Audio context did not start');

      const bus = ctx.createGain();
      bus.gain.value = 0;
      const source = inspectorSource(ctx, this.score, bus, this.mix, this.solo, track);
      const startAt = ctx.currentTime + .035;
      const anchor = startAt - this.offset;
      const end = anchor + this.score.duration;
      const ramp = Math.min(fade, (end - startAt) / 2);
      bus.gain.setValueAtTime(0, startAt);
      bus.gain.linearRampToValueAtTime(1, startAt + ramp);
      bus.gain.setValueAtTime(1, end - ramp);
      bus.gain.linearRampToValueAtTime(0, end);
      this.nowPlaying = { anchor, bus, source };
      bus.connect(ctx.destination);
      let after = this.offset - 1e-8;
      let next = Math.max(0, Math.floor((this.offset - recoveryWindow) / this.score.step));
      const total = this.score.volume.beats * 4;
      let restore = true;
      const schedule = () => {
        if (revision !== this.revision || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        if (now >= end) {
          this.offset = this.score.duration;
          this.detach();
          this.audition = null;
          this.report('Ended');
          return;
        }
        if (!restore && anchor + (next + 1) * this.score.step < now) {
          after = Math.max(after, now - anchor);
          next = Math.max(next, Math.floor(after / this.score.step));
        }
        while (next < total && anchor + next * this.score.step < now + lookahead) {
          source.playStep(next, anchor + next * this.score.step, after, restore);
          next++;
        }
        restore = false;
      };
      this.scheduler = window.setInterval(schedule, 24);
      schedule();
      this.report('Playing');
    } catch {
      if (revision !== this.revision) return;
      this.detach();
      this.audition = null;
      this.report('Audio unavailable');
    }
  }

  pause() { this.halt('Paused', this.time); }
  stop() { this.halt('Stopped', this.time); }
  rewind() { this.halt('Stopped', 0); }

  private halt(state: PlaybackState, position: number) {
    this.revision++;
    this.offset = position;
    this.detach();
    if (state !== 'Paused') this.audition = null;
    this.report(state);
  }

  seek(position: number) {
    position = Math.max(0, Math.min(this.score.duration, position));
    if ((this.state === 'Starting' || this.state === 'Playing') && position < this.score.duration) {
      void this.play(this.audition, position);
    } else {
      this.halt(this.state === 'Playing' || this.state === 'Starting' ? 'Ended' : 'Paused', position);
    }
  }

  updateMix(mix: Mix, solo: DaybreakStem | null) {
    this.mix = mix;
    this.solo = solo;
    this.nowPlaying?.source.update(mix, solo, this.audition, this.ctx?.currentTime);
  }

  dispose() {
    this.revision++;
    this.cancelActivation?.();
    window.clearInterval(this.scheduler);
    this.releaseRetiring();
    this.nowPlaying?.source.dispose();
    this.nowPlaying?.bus.disconnect();
    this.nowPlaying = undefined;
    this.ctx?.removeEventListener('statechange', this.onState);
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {});
    this.ctx = undefined;
  }
}
