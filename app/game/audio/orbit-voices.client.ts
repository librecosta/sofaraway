import { filter, gain, noteHz, randomSource } from './daybreak-voices.client';
import type { OrbitEvent } from '../core/orbit-score';

export interface OrbitVoiceTiming { beatSeconds: number; duration: number; seed: number; tail: number }

const floor = .000001;

function pan(ctx: BaseAudioContext, destination: AudioNode, position: number) {
  const node = ctx.createStereoPanner();
  node.pan.value = position;
  node.connect(destination);
  return node;
}

function tone(ctx: BaseAudioContext, destination: AudioNode | AudioParam, type: OscillatorType, frequency: number, at: number, end: number, detune = 0) {
  const node = ctx.createOscillator();
  node.type = type;
  node.frequency.value = frequency;
  node.detune.value = detune;
  node.connect(destination as AudioNode);
  node.start(at);
  node.stop(end);
  return node;
}

function envelope(ctx: BaseAudioContext, destination: AudioNode, at: number, length: number, level: number, attack: number, sustain: number, release: number) {
  const node = gain(ctx, destination, 0);
  const settle = Math.min(length, attack + .11);
  node.gain.setValueAtTime(0, at);
  node.gain.linearRampToValueAtTime(level, at + attack);
  node.gain.exponentialRampToValueAtTime(Math.max(floor, level * sustain), at + settle);
  node.gain.setValueAtTime(Math.max(floor, level * sustain), at + length);
  node.gain.exponentialRampToValueAtTime(floor, at + length + release);
  node.gain.linearRampToValueAtTime(0, at + length + release + .012);
  return { node, end: at + length + release + .012 };
}

function decay(ctx: BaseAudioContext, destination: AudioNode, at: number, level: number, attack: number, release: number) {
  return envelope(ctx, destination, at, attack, level, attack, 1, release);
}

function noiseAt(ctx: BaseAudioContext, buffer: AudioBuffer, destination: AudioNode, at: number, end: number, random: () => number) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
  source.start(at, random() * Math.max(0, buffer.duration - end + at), end - at);
  return source;
}

/** One graph for offline rendering and future shared-transport scheduling. */
export class OrbitVoices {
  private readonly output: GainNode;
  private readonly drums: GainNode;
  private readonly bassBus: GainNode;
  private readonly music: GainNode;
  private readonly room: GainNode;
  private readonly delay: GainNode;
  private readonly leadBus: GainNode;
  private readonly pluckBus: GainNode;
  private readonly padBus: GainNode;
  private readonly airBus: GainNode;
  private readonly noise: AudioBuffer;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private disposed = false;

  constructor(private readonly ctx: BaseAudioContext, destination: AudioNode,
    private readonly version: 'A' | 'B', private readonly events: readonly OrbitEvent[],
    private readonly timing: OrbitVoiceTiming, private readonly trim = .78) {
    const { beatSeconds, seed } = timing;
    this.output = gain(ctx, destination, trim);
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -15;
    compressor.knee.value = 10;
    compressor.ratio.value = 1.8;
    compressor.attack.value = .012;
    compressor.release.value = .18;
    compressor.connect(this.output);
    const mix = filter(ctx, compressor, 'highpass', 28, .68);
    this.drums = gain(ctx, mix, 1);
    this.bassBus = gain(ctx, mix, 1);
    this.music = gain(ctx, mix, 1);

    const random = randomSource(seed ^ 0x4e4f4953);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const noiseSamples = this.noise.getChannelData(0);
    for (let i = 0; i < noiseSamples.length; i++) noiseSamples[i] = random() * 2 - 1;
    // The impulse is runtime noise with decorrelated channels and a slow dark
    // decay. Its low end is filtered out before it can mask kick or bass.
    const impulse = ctx.createBuffer(2, Math.round(ctx.sampleRate * 2.9), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < samples.length; i++) {
        smooth = .57 * smooth + .43 * (random() * 2 - 1);
        const t = i / ctx.sampleRate;
        samples[i] = smooth * Math.exp(-t * 2.65) * Math.min(1, t / .025);
      }
    }
    const room = ctx.createConvolver();
    room.buffer = impulse;
    room.connect(filter(ctx, filter(ctx, this.music, 'highpass', 340), 'lowpass', 4300));
    this.room = gain(ctx, room, version === 'A' ? .55 : .60);
    this.delay = ctx.createGain();
    const taps = [
      [beatSeconds * .75, .31, -.60], [beatSeconds * 1.5, .19, .61],
      [beatSeconds * 2.25, .10, -.40],
    ];
    for (const [length, level, position] of taps) {
      const delay = ctx.createDelay(2);
      delay.delayTime.value = length;
      const dark = filter(ctx, filter(ctx, pan(ctx, this.music, position), 'highpass', 410), 'lowpass', 3100);
      delay.connect(gain(ctx, dark, level));
      this.delay.connect(delay);
    }
    this.leadBus = this.spaceBus(mix, .36, version === 'A' ? .50 : .39);
    this.pluckBus = this.spaceBus(mix, .40, .47);
    this.padBus = this.spaceBus(mix, .60, 0);
    this.airBus = this.spaceBus(mix, .48, .12);
  }

  private spaceBus(destination: AudioNode, roomSend: number, delaySend: number) {
    const node = gain(this.ctx, destination, 1);
    node.connect(gain(this.ctx, this.room, roomSend));
    if (delaySend) node.connect(gain(this.ctx, this.delay, delaySend));
    return node;
  }

  /** Automation uses absolute score times, independent of rendering speed. */
  duck(anchor = 0, after = -Infinity) {
    for (const event of this.events) if (event.voice === 'kick' && event.at > after) this.duckAt(anchor + event.at);
  }

  duckAt(at: number) {
    for (const [bus, amount] of [[this.bassBus, .48], [this.music, .73], [this.padBus, .71]] as const) {
      bus.gain.setValueAtTime(1, at);
      bus.gain.linearRampToValueAtTime(amount, at + .008);
      bus.gain.exponentialRampToValueAtTime(1, at + .19);
    }
  }

  private track<T extends AudioScheduledSourceNode>(source: T): T {
    this.sources.add(source);
    source.onended = () => { this.sources.delete(source); source.disconnect(); };
    return source;
  }

  private tone(...args: Parameters<typeof tone>) { return this.track(tone(...args)); }
  private noiseAt(...args: Parameters<typeof noiseAt>) { return this.track(noiseAt(...args)); }

  play(event: OrbitEvent, at: number) {
    if (this.disposed) return;
    const { seed } = this.timing;
    const ctx = this.ctx;
    const random = randomSource(seed ^ Math.imul(event.id + 1, 0x9e3779b1));
    const { velocity, pan: position = 0 } = event;
    const bright = this.version === 'B';
    switch (event.voice) {
      case 'kick': {
        const body = decay(ctx, this.drums, at, velocity * .63, .0035, .24);
        const oscillator = this.tone(ctx, body.node, 'sine', 153, at, body.end);
        oscillator.frequency.exponentialRampToValueAtTime(62, at + .034);
        oscillator.frequency.exponentialRampToValueAtTime(bright ? 49 : 46, at + .145);
        const beater = decay(ctx, filter(ctx, this.drums, 'bandpass', 1180, .7), at, velocity * .09, .0018, .026);
        this.noiseAt(ctx, this.noise, beater.node, at, beater.end, random);
        break;
      }
      case 'snare': {
        const bus = pan(ctx, this.drums, event.ghost ? -.23 : .06);
        const body = decay(ctx, bus, at, velocity * .27, .004, event.ghost ? .06 : .13);
        const shell = this.tone(ctx, body.node, 'sine', bright ? 202 : 185, at, body.end);
        shell.frequency.exponentialRampToValueAtTime(158, at + .055);
        this.tone(ctx, gain(ctx, body.node, .22), 'triangle', 330, at, body.end);
        const air = filter(ctx, filter(ctx, bus, 'highpass', 1120), 'lowpass', bright ? 7100 : 6100);
        const hit = decay(ctx, air, at, velocity * .54, .0035, event.ghost ? .052 : .145);
        this.noiseAt(ctx, this.noise, hit.node, at, hit.end, random);
        break;
      }
      case 'hat': {
        const band = filter(ctx, filter(ctx, pan(ctx, this.drums, position), 'highpass', 6200), 'lowpass', 10400, .55);
        const hit = decay(ctx, band, at, velocity * .29, .0025, event.open ? .14 : .043);
        this.noiseAt(ctx, this.noise, hit.node, at, hit.end, random);
        break;
      }
      case 'perc': {
        const { note } = event;
        const hit = decay(ctx, pan(ctx, this.drums, position), at, velocity * .13, .004, .12);
        const fundamental = this.tone(ctx, hit.node, 'sine', noteHz(note), at, hit.end);
        fundamental.frequency.exponentialRampToValueAtTime(noteHz(note) * .69, at + .08);
        this.tone(ctx, gain(ctx, hit.node, .16), 'sine', noteHz(note) * 2.1, at, hit.end);
        break;
      }
      case 'bass': {
        const { note, length } = event;
        const hit = envelope(ctx, this.bassBus, at, length, velocity * .23, .014, .66, .067);
        const body = filter(ctx, hit.node, 'lowpass', bright ? 510 : 370, .62);
        body.frequency.setValueAtTime(bright ? 670 : 510, at);
        body.frequency.exponentialRampToValueAtTime(205, at + .14);
        this.tone(ctx, gain(ctx, hit.node, .66), 'sine', noteHz(note), at, hit.end);
        this.tone(ctx, gain(ctx, body, .54), 'triangle', noteHz(note), at, hit.end);
        this.tone(ctx, gain(ctx, body, .16), 'sine', noteHz(note) * 2, at, hit.end);
        break;
      }
      case 'pluck': {
        const { note, length } = event;
        const hit = envelope(ctx, pan(ctx, this.pluckBus, position), at, Math.min(.10, length), velocity * .28, .011, .55, length + .23);
        const color = filter(ctx, hit.node, 'lowpass', bright ? 3300 : 2900, .64);
        const hz = noteHz(note);
        const carrier = this.tone(ctx, color, 'sine', hz, at, hit.end);
        const index = ctx.createGain();
        index.gain.value = 0;
        index.connect(carrier.frequency);
        index.gain.setValueAtTime(hz * (bright ? .32 : .65), at);
        index.gain.exponentialRampToValueAtTime(hz * .035, at + .20);
        this.tone(ctx, index, 'sine', hz * 2, at, hit.end);
        this.tone(ctx, gain(ctx, color, .16), 'sine', hz * 3.002, at, hit.end);
        break;
      }
      case 'lead': {
        const { note, length } = event;
        const voice = envelope(ctx, pan(ctx, this.leadBus, position), at, length, velocity * (bright ? .30 : .28), .035, .76, .29);
        const color = filter(ctx, filter(ctx, voice.node, 'highpass', 180), 'lowpass', bright ? 2400 : 1950, .65);
        const hz = noteHz(note);
        const body = this.tone(ctx, gain(ctx, color, .79), 'triangle', hz, at, voice.end, bright ? -3 : 0);
        this.tone(ctx, gain(ctx, color, .36), 'sine', hz, at, voice.end, bright ? 3 : 0);
        this.tone(ctx, gain(ctx, color, .10), 'sine', hz * 2, at, voice.end);
        const vibrato = ctx.createGain();
        vibrato.gain.value = 0;
        vibrato.connect(body.detune);
        vibrato.gain.setValueAtTime(0, at);
        vibrato.gain.linearRampToValueAtTime(bright ? 5 : 3, at + .25);
        this.tone(ctx, vibrato, 'sine', bright ? 4.3 : 3.1, at, voice.end);
        break;
      }
      case 'pad': {
        const { length } = event;
        const voice = envelope(ctx, this.padBus, at, length, velocity * .22, .27, .72, 1.25);
        const band = filter(ctx, filter(ctx, voice.node, 'highpass', 280), 'lowpass', 850 + event.color * 1100, .56);
        for (const [i, pitch] of event.notes.entries()) {
          const spread = pan(ctx, band, (i - 1.5) * .43);
          const hz = noteHz(pitch);
          this.tone(ctx, gain(ctx, spread, .48), 'triangle', hz, at, voice.end, i % 2 ? -5 : 5);
          this.tone(ctx, gain(ctx, spread, .32), 'sine', hz, at, voice.end, i % 2 ? 4 : -4);
        }
        break;
      }
      case 'sweep': {
        const { length } = event;
        const band = filter(ctx, pan(ctx, this.airBus, event.rising ? -.24 : .26), 'bandpass', event.rising ? 560 : 2450, .63);
        band.frequency.setValueAtTime(event.rising ? 560 : 2450, at);
        band.frequency.exponentialRampToValueAtTime(event.rising ? 2450 : 480, at + length);
        const voice = event.rising
          ? envelope(ctx, band, at, length, velocity * .095, length * .9, 1, .15)
          : decay(ctx, band, at, velocity * .095, .03, length);
        this.noiseAt(ctx, this.noise, voice.node, at, voice.end, random);
        break;
      }

    }
  }

  schedule(anchor = 0, after = -Infinity, before = Infinity) {
    for (const event of this.events) if (event.at > after && event.at < before) this.play(event, anchor + event.at);
  }

  finish(anchor = 0) {
    const { duration, tail } = this.timing;
    this.output.gain.setValueAtTime(this.trim, anchor + duration + tail - .4);
    this.output.gain.linearRampToValueAtTime(0, anchor + duration + tail - .02);
  }

  dispose() {
    this.disposed = true;
    this.output.disconnect();
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.sources.clear();
  }
}
