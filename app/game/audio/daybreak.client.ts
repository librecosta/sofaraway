import { drums, layers, master, step } from '../core/daybreak-score';
import type { DaybreakStem } from '../core/daybreak-score';
import { filter, gain, glass, hat, impact, kick, mallet, pad, randomSource, rate,
  riser, roomImpulse, shimmer, snare } from './daybreak-voices.client';

const noiseDraws = { kick: 1, snare: 3, ghost: 2, fill: 3, hat: 2 };
const buffersByRate = new Map<number, ReturnType<typeof prepare>>();

export const daybreakStemSends: Record<DaybreakStem, number> = {
  kick: .055, snare: .055, hats: .055, keys: .32, lead: .19, atmos: .5,
};
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

function defaultRouting(ctx: BaseAudioContext, mix: AudioNode, impulse: AudioBuffer): StemInputs {
  const room = daybreakRoom(ctx, mix, impulse);
  const drumBus = gain(ctx, mix, 1);
  const keys = gain(ctx, mix, 1);
  const lead = gain(ctx, mix, 1);
  const atmos = gain(ctx, mix, 1);
  drumBus.connect(gain(ctx, room, daybreakStemSends.kick));
  keys.connect(gain(ctx, room, daybreakStemSends.keys));
  lead.connect(gain(ctx, room, daybreakStemSends.lead));
  atmos.connect(gain(ctx, room, daybreakStemSends.atmos));
  return { kick: drumBus, snare: drumBus, hats: drumBus, keys, lead, atmos };
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
    this.inputs = route ? route(mix, buffers.impulse) : defaultRouting(ctx, mix, buffers.impulse);
  }

  dispose() { this.runBus.disconnect(); }

  playStep(index: number, time: number, after = -Infinity) {
    const bar = Math.floor(index / 16), at = index % 16;
    const ctx = this.ctx;
    const anchor = time - index * step;
    const hits = this.buffers.hits[bar];
    if (hits) {
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

    for (const event of layers[bar] ?? []) {
      if (event.at !== at || event.time <= after) continue;
      const start = anchor + event.time;
      switch (event.kind) {
        case 'pad':
          pad(ctx, this.inputs.keys, event.notes, start, event.length, event.level, event.cutoff, event.attack, event.highpass);
          break;
        case 'pluck':
          event.notes.forEach((note, i) => {
            const position = Math.max(-1, Math.min(1, (i / (event.notes.length - 1) - .5) * 1.15));
            glass(ctx, this.inputs.keys, note, start + i * .005, event.length, event.level, position);
          });
          break;
        case 'arp':
          glass(ctx, this.inputs.keys, event.note, start, event.length, event.level, event.pan);
          break;
        case 'lead':
          mallet(ctx, this.inputs.lead, event.note, start, event.length, event.level, .06);
          break;
        case 'air': {
          const offset = ((bar * 16 + at) * .017) % .9;
          if (event.type === 'riser') riser(ctx, this.inputs.atmos, this.buffers.noise, start, event.length, event.level, offset);
          else if (event.type === 'shimmer') shimmer(ctx, this.inputs.atmos, this.buffers.noise, start, event.length, event.level, offset);
          else impact(ctx, this.inputs.atmos, start, event.level);
          break;
        }
      }
    }
  }
}
