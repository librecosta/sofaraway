import { drums, master, onset, score, step, swing } from '../core/daybreak-score';
import { bassNote, brightPluck, envelope, filter, gain, hat, kick, noteHz, oscillator, pan,
  randomSource, rate, roomImpulse, snare } from './daybreak-voices.client';

const noiseDraws = { kick: 1, snare: 3, ghost: 2, fill: 3, hat: 2 };
const buffersByRate = new Map<number, ReturnType<typeof prepare>>();

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
  private readonly drumBus: GainNode;
  private readonly bassBus: GainNode;
  private readonly keys: GainNode;
  private readonly atmosphere: GainNode;
  private readonly buffers: ReturnType<typeof prepare>;

  constructor(private readonly ctx: BaseAudioContext, output: AudioNode) {
    let buffers = buffersByRate.get(ctx.sampleRate);
    if (!buffers) {
      buffers = prepare(ctx);
      buffersByRate.set(ctx.sampleRate, buffers);
    }
    this.buffers = buffers;
    this.runBus = gain(ctx, output, master);
    const mix = filter(ctx, this.runBus, 'highpass', 29);
    const room = ctx.createConvolver();
    room.buffer = buffers.impulse;
    room.connect(filter(ctx, filter(ctx, mix, 'highpass', 390), 'lowpass', 4900));
    this.drumBus = gain(ctx, mix, 1);
    this.bassBus = gain(ctx, mix, 1);
    this.keys = gain(ctx, mix, 1);
    this.atmosphere = gain(ctx, mix, .74);
    this.drumBus.connect(gain(ctx, room, .055));
    this.keys.connect(gain(ctx, room, .32));
    this.atmosphere.connect(gain(ctx, room, .50));
  }

  dispose() { this.runBus.disconnect(); }

  playStep(index: number, time: number, after = -Infinity) {
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
          kick(ctx, this.drumBus, this.buffers.noise, start, strength, random);
          this.bassBus.gain.setValueAtTime(1, start);
          this.bassBus.gain.linearRampToValueAtTime(.51, start + .007);
          this.bassBus.gain.linearRampToValueAtTime(1, start + .085);
          break;
        case 'snare':
        case 'ghost':
          snare(ctx, this.drumBus, this.buffers.noise, start, strength, event.kind === 'ghost', random);
          break;
        case 'fill':
          snare(ctx, this.drumBus, this.buffers.noise, start, strength, true, random);
          hat(ctx, this.drumBus, this.buffers.noise, start, event.hatStrength, event.pan, false, random);
          break;
        case 'hat':
          hat(ctx, this.drumBus, this.buffers.noise, start, strength * (.86 + .28 * random()), event.pan, event.open, random);
          break;
      }
    }
    for (const [position, interval, length] of frame.bass) {
      if (position !== at || onset(bar, at, swing / 2) <= after) continue;
      bassNote(ctx, this.bassBus, chord.bass + interval, atTime(at, swing / 2), length * step,
        .143 * (interval ? .83 : 1) * frame.bassLevel);
    }
    for (const [position, length, level] of frame.keys) {
      if (position !== at) continue;
      chord.keys.forEach((note, i) => {
        if (onset(bar, at, swing) + i * .006 <= after) return;
        const pan = (i / (chord.keys.length - 1) - .5) * 1.05;
        const volume = .034 * level * (i === 0 ? .82 : 1) * frame.keysLevel;
        brightPluck(ctx, this.keys, note, atTime(at, swing) + i * .006, length * step, volume, pan);
      });
    }
    if (at === 1 && frame.swell) {
      const peak = frame.swell === 'peak';
      chord.keys.slice(-2).forEach((note, i) => {
        if (onset(bar, at) + i * .018 <= after) return;
        const start = atTime(at, 0) + i * .018;
        const cloud = envelope(ctx, pan(ctx, this.atmosphere, i ? .62 : -.59), start,
          peak ? .78 : 1.07, peak ? .019 : .015, .19, .25, .62, .31);
        oscillator(ctx, cloud.out, 'sine', noteHz(note + 12), start, cloud.end, i ? 4 : -4);
      });
    }
  }
}
