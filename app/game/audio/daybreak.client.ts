import { drums, master, onset, score, step, swing } from '../core/daybreak-score';
import { bassNote, brightPluck, envelope, filter, gain, hat, kick, noteHz, oscillator, pan,
  randomSource, rate, roomImpulse, snare } from './daybreak-voices.client';

const noiseDraws = { kick: 1, snare: 3, ghost: 2, fill: 3, hat: 2 };
const buffersByRate = new Map<number, ReturnType<typeof prepare>>();

export const daybreakStemSends = { kick: .055, snare: .055, hats: .055, bass: 0, keys: .32, atmos: .50 };
export type DaybreakStem = keyof typeof daybreakStemSends;
type StemInputs = Record<DaybreakStem, AudioNode>;
type InspectorRouting = (mix: AudioNode, impulse: AudioBuffer) => { inputs: StemInputs; duck: AudioParam };

export function daybreakRoom(ctx: BaseAudioContext, output: AudioNode, impulse: AudioBuffer) {
  const room = ctx.createConvolver();
  room.buffer = impulse;
  room.connect(filter(ctx, filter(ctx, output, 'highpass', 390), 'lowpass', 4900));
  return room;
}

function prepare(ctx: BaseAudioContext) {
  const random = randomSource(202611);
  const impulse = roomImpulse(ctx, random);
  const noise = ctx.createBuffer(1, rate, rate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  // Assign the original bar-order noise draws once. A restart at any step can
  // schedule the same hits without playing or traversing the earlier song.
  const hits = drums.map(events => events.map(event => ({
    ...event, draws: Array.from({ length: noiseDraws[event.kind] }, random),
  })));
  return { impulse, noise, hits };
}

export class DaybreakSynthesizer {
  private readonly runBus: GainNode;
  private readonly inputs: StemInputs;
  private readonly duck: AudioParam;
  private readonly buffers: ReturnType<typeof prepare>;

  constructor(private readonly ctx: BaseAudioContext, output: AudioNode, route?: InspectorRouting) {
    let buffers = buffersByRate.get(ctx.sampleRate);
    if (!buffers) {
      buffers = prepare(ctx);
      buffersByRate.set(ctx.sampleRate, buffers);
    }
    this.buffers = buffers;
    this.runBus = gain(ctx, output, master);
    const mix = filter(ctx, this.runBus, 'highpass', 29);
    if (route) {
      const { inputs, duck } = route(mix, buffers.impulse);
      this.inputs = inputs;
      this.duck = duck;
    } else {
      const room = daybreakRoom(ctx, mix, buffers.impulse);
      const drums = gain(ctx, mix, 1), bass = gain(ctx, mix, 1);
      const keys = gain(ctx, mix, 1), atmos = gain(ctx, mix, .74);
      drums.connect(gain(ctx, room, daybreakStemSends.kick));
      keys.connect(gain(ctx, room, daybreakStemSends.keys));
      atmos.connect(gain(ctx, room, daybreakStemSends.atmos));
      this.inputs = { kick: drums, snare: drums, hats: drums, bass, keys, atmos };
      this.duck = bass.gain;
    }
  }

  dispose() { this.runBus.disconnect(); }

  playStep(index: number, time: number, after = -Infinity, restore = false) {
    const bar = Math.floor(index / 16), at = index % 16;
    const frame = score[bar];
    if (!frame) return;
    const ctx = this.ctx;
    const anchor = time - index * step;
    const atTime = (position: number, shuffle: number) => anchor + onset(bar, position, shuffle);
    const { chord } = frame;
    for (const event of this.buffers.hits[bar]) {
      if (event.at !== at || event.time <= after) continue;
      let draw = 0;
      const random = () => event.draws[draw++];
      const start = anchor + event.time;
      const { strength } = event;
      switch (event.kind) {
        case 'kick':
          kick(ctx, this.inputs.kick, this.buffers.noise, start, strength, random);
          this.duck.setValueAtTime(1, start);
          this.duck.linearRampToValueAtTime(.51, start + .007);
          this.duck.linearRampToValueAtTime(1, start + .085);
          break;
        case 'snare':
        case 'ghost':
          snare(ctx, this.inputs.snare, this.buffers.noise, start, strength, event.kind === 'ghost', random);
          break;
        case 'fill':
          snare(ctx, this.inputs.snare, this.buffers.noise, start, strength, true, random);
          hat(ctx, this.inputs.snare, this.buffers.noise, start, event.hatStrength, event.pan, false, random);
          break;
        case 'hat':
          hat(ctx, this.inputs.hats, this.buffers.noise, start, strength * (.86 + .28 * random()), event.pan, event.open, random);
          break;
      }
    }
    const ageAt = (onsetTime: number, lifespan: number) => {
      if (onsetTime > after) return 0;
      const age = after - onsetTime;
      return restore && age < lifespan ? age : Infinity;
    };
    for (const [position, interval, length, velocity = 1] of frame.bass) {
      if (position !== at) continue;
      const age = ageAt(onset(bar, at, swing / 2), length * step + .075);
      if (!Number.isFinite(age)) continue;
      bassNote(ctx, this.inputs.bass, chord.bass + interval, atTime(at, swing / 2), length * step,
        .143 * (interval ? .83 : 1) * frame.bassLevel * velocity, age);
    }
    for (const [position, length, level] of frame.keys) {
      if (position !== at) continue;
      chord.keys.forEach((note, i) => {
        const age = ageAt(onset(bar, at, swing) + i * .006, length * step + .085);
        if (!Number.isFinite(age)) return;
        const pan = (i / (chord.keys.length - 1) - .5) * 1.05;
        const volume = .034 * level * (i === 0 ? .82 : 1) * frame.keysLevel;
        brightPluck(ctx, this.inputs.keys, note, atTime(at, swing) + i * .006, length * step, volume, pan, age);
      });
    }
    if (at === 1 && frame.swell) {
      const peak = frame.swell === 'peak';
      chord.keys.slice(-2).forEach((note, i) => {
        const length = peak ? .78 : 1.07;
        const age = ageAt(onset(bar, at) + i * .018, length + .31);
        if (!Number.isFinite(age)) return;
        const start = atTime(at, 0) + i * .018;
        const cloud = envelope(ctx, pan(ctx, this.inputs.atmos, i ? .62 : -.59), start,
          length, peak ? .019 : .015, .19, .25, .62, .31, age);
        oscillator(ctx, cloud.out, 'sine', noteHz(note + 12), start + age, cloud.end, i ? 4 : -4);
      });
    }
  }
}
