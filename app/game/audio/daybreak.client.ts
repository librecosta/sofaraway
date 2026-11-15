import { drums, master, step } from '../core/daybreak-score';
import type { DaybreakStem } from '../core/daybreak-score';
import { filter, gain, hat, kick, randomSource, rate, roomImpulse, snare } from './daybreak-voices.client';

const noiseDraws = { kick: 1, snare: 3, ghost: 2, fill: 3, hat: 2 };
const buffersByRate = new Map<number, ReturnType<typeof prepare>>();

export const daybreakRoomSend = .055;
type StemInputs = Record<DaybreakStem, AudioNode>;
type InspectorRouting = (mix: AudioNode, impulse: AudioBuffer) => StemInputs;

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
      this.inputs = route(mix, buffers.impulse);
    } else {
      const room = daybreakRoom(ctx, mix, buffers.impulse);
      const drums = gain(ctx, mix, 1);
      drums.connect(gain(ctx, room, daybreakRoomSend));
      this.inputs = { kick: drums, snare: drums, hats: drums };
    }
  }

  dispose() { this.runBus.disconnect(); }

  playStep(index: number, time: number, after = -Infinity) {
    const bar = Math.floor(index / 16), at = index % 16;
    const hits = this.buffers.hits[bar];
    if (!hits) return;
    const ctx = this.ctx;
    const anchor = time - index * step;
    for (const event of hits) {
      if (event.at !== at || event.time <= after) continue;
      let draw = 0;
      const random = () => event.draws[draw++];
      const start = anchor + event.time;
      const { strength } = event;
      switch (event.kind) {
        case 'kick':
          kick(ctx, this.inputs.kick, this.buffers.noise, start, strength, random);
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
  }
}
