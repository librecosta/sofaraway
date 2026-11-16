import { filter, gain, noteHz, randomSource } from './daybreak-voices.client';
import type { DescentEvent } from '../core/descent-score';

const floor = .00005;

function pan(ctx: BaseAudioContext, bus: AudioNode, position: number) {
  const node = ctx.createStereoPanner();
  node.pan.value = position;
  node.connect(bus);
  return node;
}

function tone(ctx: BaseAudioContext, bus: AudioNode | AudioParam, type: OscillatorType,
  frequency: number, time: number, end: number) {
  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  // Web Audio accepts both destinations, which the DOM types overload separately.
  oscillator.connect(bus as AudioNode);
  oscillator.start(time);
  oscillator.stop(end);
  return oscillator;
}

function noiseBurst(ctx: BaseAudioContext, buffer: AudioBuffer, bus: AudioNode, time: number, end: number, phase: number) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(bus);
  source.start(time, phase * (buffer.duration - (end - time)), end - time);
}

function envelope(ctx: BaseAudioContext, bus: AudioNode, time: number, level: number, attack: number, decay: number,
  sustain = 0, hold = 0, release = 0) {
  const node = gain(ctx, bus, 0);
  const peak = time + attack;
  const settle = peak + decay;
  const end = settle + hold + release;
  node.gain.setValueAtTime(floor, time);
  node.gain.linearRampToValueAtTime(level, peak);
  node.gain.exponentialRampToValueAtTime(sustain ? level * sustain : floor, settle);
  if (release) {
    node.gain.setValueAtTime(level * sustain, settle + hold);
    node.gain.exponentialRampToValueAtTime(floor, end);
  }
  return { node, end };
}

type VoiceEvent<Voice extends DescentEvent['voice']> = Extract<DescentEvent, { voice: Voice }>;

export function descentVoices(ctx: BaseAudioContext, output: AudioNode, version: 'A' | 'B', seed: number, step: number,
  signalWindow?: readonly number[]) {
  const breach = version === 'B';
  const noiseRandom = randomSource(seed);
  const texture = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const samples = texture.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = 2 * noiseRandom() - 1;
  let random: () => number;

  const drums = gain(ctx, output, 1);
  const space = gain(ctx, output, 1);
  const taps = gain(ctx, space, .34);
  // An asymmetric pair of dark taps gives the short signals some depth.
  for (const [length, level, direction] of [[step * 1.5, .66, -.63], [step * 3, .36, .63]]) {
    const destination = gain(ctx, pan(ctx, output, direction), level);
    const delay = ctx.createDelay(.5);
    delay.delayTime.value = length;
    delay.connect(filter(ctx, filter(ctx, destination, 'highpass', 280), 'lowpass', 2200));
    taps.connect(delay);
  }
  const signalBus = gain(ctx, output, 1);
  signalBus.connect(gain(ctx, taps, breach ? .62 : .50));
  const controlSignalBus = signalWindow && gain(ctx, output, 1);
  if (controlSignalBus) {
    controlSignalBus.connect(filter(ctx, gain(ctx, taps, .29), 'lowpass', 980, .68));
  }
  const metalBus = gain(ctx, output, 1);
  metalBus.connect(gain(ctx, taps, .42));
  const chordBus = gain(ctx, output, 1);
  chordBus.connect(gain(ctx, taps, .27));

  function kick({ at, velocity }: Pick<DescentEvent, 'at' | 'velocity'>) {
    const hit = envelope(ctx, drums, at, velocity * .71, .0028, breach ? .183 : .166);
    const body = tone(ctx, hit.node, 'sine', 145, at, hit.end);
    body.frequency.setValueAtTime(breach ? 154 : 139, at);
    body.frequency.exponentialRampToValueAtTime(67, at + .025);
    body.frequency.exponentialRampToValueAtTime(breach ? 47 : 51, at + .101);
    const edge = envelope(ctx, filter(ctx, drums, 'bandpass', 1540, .97), at, velocity * .235, .0012, .022);
    noiseBurst(ctx, texture, edge.node, at, edge.end, random());
    const snap = envelope(ctx, drums, at, velocity * .075, .0011, .027);
    const punch = tone(ctx, snap.node, 'triangle', 228, at, snap.end);
    punch.frequency.exponentialRampToValueAtTime(105, at + .023);
  }

  function snare({ at, velocity, voice }: VoiceEvent<'kick' | 'snare' | 'ghost'>) {
    const ghost = voice === 'ghost';
    const shell = pan(ctx, drums, ghost ? (random() - .5) * .42 : .025);
    const body = envelope(ctx, shell, at, velocity * .29, .002, ghost ? .041 : .080);
    const fundamental = tone(ctx, body.node, 'triangle', breach ? 198 : 177, at, body.end);
    fundamental.frequency.exponentialRampToValueAtTime(breach ? 151 : 138, at + .032);
    tone(ctx, gain(ctx, body.node, .31), 'sine', 332, at, body.end);
    const color = filter(ctx, filter(ctx, shell, 'highpass', 730), 'lowpass', breach ? 7200 : 5100);
    const air = envelope(ctx, color, at, velocity * (ghost ? .33 : .65), .0018, ghost ? .047 : .138);
    noiseBurst(ctx, texture, air.node, at, air.end, random());
    if (!ghost) {
      const clapAt = at + .012;
      const clap = envelope(ctx, filter(ctx, pan(ctx, drums, -.19), 'bandpass', 1950, .70), clapAt, velocity * .41, .002, .071);
      noiseBurst(ctx, texture, clap.node, clapAt, clap.end, random());
    }
  }

  function hat({ at, velocity, pan: place, open }: VoiceEvent<'hat'>) {
    const band = filter(ctx, filter(ctx, pan(ctx, drums, place), 'highpass', 5300), 'lowpass', 10400);
    const air = envelope(ctx, band, at, velocity * (breach ? .40 : .34), .0015, open ? .127 : .061);
    noiseBurst(ctx, texture, air.node, at, air.end, random());
  }

  function bass({ at, velocity, note, length }: VoiceEvent<'bass'>) {
    const sustain = breach ? .67 : .49;
    const decay = Math.min(.078, length - .013);
    const voice = envelope(ctx, output, at, velocity * (breach ? .37 : .39), .013, decay, sustain,
      length - .013 - decay, breach ? .087 : .072);
    const rounded = filter(ctx, voice.node, 'lowpass', breach ? 290 : 480, .80);
    rounded.frequency.setValueAtTime(breach ? 520 : 710, at);
    rounded.frequency.exponentialRampToValueAtTime(breach ? 190 : 250, at + .073);
    const hz = noteHz(note);
    tone(ctx, gain(ctx, voice.node, breach ? .47 : .56), 'sine', hz, at, voice.end);
    tone(ctx, gain(ctx, rounded, breach ? .48 : .52), breach ? 'triangle' : 'sawtooth', hz, at, voice.end);
    tone(ctx, gain(ctx, rounded, .29), 'sine', hz * 2, at, voice.end);
    tone(ctx, gain(ctx, rounded, .08), 'sine', hz * 3, at, voice.end);
  }

  function signal({ at, velocity, note, length, pan: place }: VoiceEvent<'signal'>, scoreTime: number) {
    const subdued = !!signalWindow && scoreTime >= signalWindow[0] && scoreTime < signalWindow[1];
    const voice = envelope(ctx, pan(ctx, subdued ? controlSignalBus! : signalBus, place), at,
      velocity * (subdued ? .172 : .19), subdued ? .017 : .008, subdued ? .070 : .079, subdued ? .40 : .33,
      Math.max(0, length - .087), .102);
    const hz = noteHz(note);
    const dark = filter(ctx, voice.node, 'lowpass', subdued ? 1220 : breach ? 2050 : 1640);
    const carrier = tone(ctx, dark, 'sine', hz, at, voice.end);
    const index = ctx.createGain();
    index.gain.value = 0;
    index.connect(carrier.frequency);
    // A shallow harmonic modulator keeps the control pulse pitched after softening the transient.
    index.gain.setValueAtTime(hz * (subdued ? .24 : breach ? .73 : .48), at);
    index.gain.exponentialRampToValueAtTime(hz * (subdued ? .12 : .085), at + .067);
    tone(ctx, index, 'sine', hz * (subdued ? 2 : breach ? 1.99 : 1.50), at, voice.end);
    tone(ctx, gain(ctx, dark, subdued ? .14 : .33), 'triangle', hz, at, voice.end);
  }

  function chord({ at, velocity, notes, length }: VoiceEvent<'chord'>) {
    const voice = envelope(ctx, chordBus, at, velocity * .16, .015, .101, .48, Math.max(0, length - .116), .132);
    const upper = filter(ctx, filter(ctx, voice.node, 'highpass', 140), 'lowpass', 1330, .80);
    upper.frequency.setValueAtTime(breach ? 1670 : 1480, at);
    upper.frequency.exponentialRampToValueAtTime(620, at + .13);
    for (const [i, note] of notes.entries()) {
      const spread = pan(ctx, upper, (i - 1.5) * .27);
      const hz = noteHz(note);
      tone(ctx, gain(ctx, spread, .66), 'triangle', hz, at, voice.end);
      tone(ctx, gain(ctx, spread, .24), 'sawtooth', hz * (i % 2 ? 1.004 : .996), at, voice.end);
    }
  }

  function metal({ at, velocity, note, pan: place }: VoiceEvent<'metal'>) {
    const color = filter(ctx, pan(ctx, metalBus, place), 'bandpass', 1260, .66);
    const hit = envelope(ctx, color, at, velocity * (breach ? .20 : .23), .002, .089);
    for (const [ratio, level] of [[2.04, .80], [2.96, .36], [4.62, .22]]) {
      tone(ctx, gain(ctx, hit.node, level), 'sine', noteHz(note) * ratio, at, hit.end);
    }
    noiseBurst(ctx, texture, gain(ctx, hit.node, .27), at, hit.end, random());
  }

  function sweep({ at, velocity, length, falling }: VoiceEvent<'sweep'>) {
    const band = filter(ctx, pan(ctx, space, falling ? -.32 : .27), 'bandpass', 720, .87);
    band.frequency.setValueAtTime(falling ? 2500 : 560, at);
    band.frequency.exponentialRampToValueAtTime(falling ? 420 : 2400, at + length);
    const air = envelope(ctx, band, at, velocity * .29, falling ? .034 : length * .74, falling ? length : length * .27);
    noiseBurst(ctx, texture, air.node, at, air.end, random());
  }

  return (event: DescentEvent, index: number, at: number) => {
    random = randomSource(seed ^ Math.imul(index + 1, 0x9e3779b1));
    const scheduled = { ...event, at };
    switch (scheduled.voice) {
      case 'kick': kick(scheduled); break;
      case 'snare':
      case 'ghost': snare(scheduled); break;
      case 'hat': hat(scheduled); break;
      case 'bass': bass(scheduled); break;
      case 'signal': signal(scheduled, event.at); break;
      case 'chord': chord(scheduled); break;
      case 'metal': metal(scheduled); break;
      case 'sweep': sweep(scheduled); break;
    }
  };
}
