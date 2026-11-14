import { bassNote, brightPluck, electricAccent, envelope, filter, gain, hat, kick, makeRoom, noteHz,
  oscillator, pan, randomSource, rate, snare, wav } from './voices.mjs';
import { accentEvents, editions, stems } from './editions.mjs';
import { drumsFor, duration, master, onset, score, step, swing, tail } from './score.mjs';

async function renderRange(firstBar, endBar, track) {
  // One preroll bar restores filter, room and envelope state before the kept samples.
  const startBar = Math.max(0, firstBar - 1);
  const offset = startBar * 2;
  const end = endBar * 2 + (endBar === score.length ? tail : 0);
  const ctx = new OfflineAudioContext(2, Math.round(rate * (end - offset)), rate);
  const random = randomSource(202611);
  const output = gain(ctx, ctx.destination, 1);
  if (endBar === score.length) {
    output.gain.setValueAtTime(1, duration + 1.06 - offset);
    output.gain.linearRampToValueAtTime(0, duration + tail - .005 - offset);
  }
  const mixBus = filter(ctx, output, 'highpass', 29);
  const room = makeRoom(ctx, mixBus, random);
  const roomSend = (bus, level) => bus.connect(gain(ctx, room, level));
  const frames = score.slice(startBar, endBar);
  if (track === 'accents') {
    const bus = gain(ctx, mixBus, 1);
    roomSend(bus, .10);
    for (const event of accentEvents.filter(event => event.bar >= startBar && event.bar < endBar)) {
      event.notes.forEach((note, i) => electricAccent(ctx, bus, note, event.time - offset + i * .003,
        event.length, event.strength * .044 * (i === 1 ? 1 : .88), (i - 1) * .36));
    }
    return ctx.startRendering();
  }

  const drumBus = gain(ctx, mixBus, 1);
  const bassBus = gain(ctx, mixBus, 1);
  const keys = gain(ctx, mixBus, 1);
  const atmosphere = gain(ctx, mixBus, .74);
  roomSend(drumBus, .055);
  roomSend(keys, .32);
  roomSend(atmosphere, .50);
  const noise = ctx.createBuffer(1, rate, rate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;

  // Advance the seeded percussion stream through bars outside the render range.
  const noiseDraws = { kick: 1, snare: 3, ghost: 2, fill: 3, hat: 2 };
  for (const frame of score.slice(0, startBar)) {
    for (const event of drumsFor(frame)) {
      for (let i = 0; i < noiseDraws[event.kind]; i++) random();
    }
  }
  for (const frame of frames) {
    const { bar, chord } = frame;
    const atTime = (at, shuffle) => onset(bar, at, shuffle) - offset;
    for (const event of drumsFor(frame)) {
      const { kind, strength } = event;
      const time = event.time - offset;
      switch (kind) {
        case 'kick':
          kick(ctx, drumBus, noise, time, strength, random);
          bassBus.gain.setValueAtTime(1, time);
          bassBus.gain.linearRampToValueAtTime(.51, time + .007);
          bassBus.gain.linearRampToValueAtTime(1, time + .085);
          break;
        case 'snare':
        case 'ghost':
          snare(ctx, drumBus, noise, time, strength, kind === 'ghost', random);
          break;
        case 'fill':
          snare(ctx, drumBus, noise, time, strength, true, random);
          hat(ctx, drumBus, noise, time, event.hatStrength, event.pan, false, random);
          break;
        case 'hat':
          hat(ctx, drumBus, noise, time, strength * (.86 + .28 * random()), event.pan, event.open, random);
          break;
      }
    }
    for (const [at, interval, length] of frame.bass) {
      bassNote(ctx, bassBus, chord.bass + interval, atTime(at, swing / 2), length * step,
        .143 * (interval ? .83 : 1) * frame.bassLevel);
    }
    for (const [at, length, level] of frame.keys) {
      chord.keys.forEach((note, i) => {
        const position = (i / (chord.keys.length - 1) - .5) * 1.05;
        const volume = .034 * level * (i === 0 ? .82 : 1) * frame.keysLevel;
        brightPluck(ctx, keys, note, atTime(at, swing) + i * .006, length * step, volume, position);
      });
    }
    if (frame.swell) {
      const peak = frame.swell === 'peak';
      chord.keys.slice(-2).forEach((note, i) => {
        const time = atTime(1) + i * .018;
        const cloud = envelope(ctx, pan(ctx, atmosphere, i ? .62 : -.59), time,
          peak ? .78 : 1.07, peak ? .019 : .015, .19, .25, .62, .31);
        oscillator(ctx, cloud.out, 'sine', noteHz(note + 12), time, cloud.end, i ? 4 : -4);
      });
    }
  }
  return ctx.startRendering();
}

async function renderTrack(track) {
  const audio = new AudioBuffer({ length: Math.round(rate * (duration + tail)), sampleRate: rate, numberOfChannels: 2 });
  const crossfade = Math.round(rate * .020);
  for (let bar = 0; bar < score.length;) {
    const endBar = Math.min(bar + (bar === 0 ? 12 : 6), score.length);
    const segment = await renderRange(bar, endBar, track);
    const preroll = bar ? rate * 2 : 0;
    for (let channel = 0; channel < 2; channel++) {
      const destination = audio.getChannelData(channel);
      const source = segment.getChannelData(channel);
      const start = rate * bar * 2;
      if (preroll) {
        for (let i = 0; i < crossfade; i++) {
          const weight = (i + 1) / crossfade;
          const previous = start - crossfade + i;
          destination[previous] += weight * (source[preroll - crossfade + i] - destination[previous]);
        }
      }
      destination.set(source.subarray(preroll), start);
    }
    bar = endBar;
  }
  console.info('Rendered ' + track);
  return audio;
}

const tracks = new Map();

export async function render(name, stem = false) {
  const names = stem ? (stems.includes(name) ? [name] : undefined) : editions[name]?.tracks;
  if (!names) throw new Error('Unknown DAYBREAK render: ' + name);
  for (const name of names) {
    if (!tracks.has(name)) tracks.set(name, await renderTrack(name));
  }
  const [first, ...rest] = names.map(name => tracks.get(name));
  const audio = rest.length ? new AudioBuffer({ length: first.length, sampleRate: rate, numberOfChannels: 2 }) : first;
  if (rest.length) {
    for (let channel = 0; channel < 2; channel++) {
      const output = audio.getChannelData(channel);
      output.set(first.getChannelData(channel));
      for (const track of rest) {
        const samples = track.getChannelData(channel);
        for (let i = 0; i < output.length; i++) output[i] += samples[i];
      }
    }
  }
  return { ...wav(audio, master), duration: audio.duration };
}
