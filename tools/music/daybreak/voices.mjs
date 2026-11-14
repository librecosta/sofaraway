export const rate = 44100;
const floor = 0.00005;
export const noteHz = note => 440 * 2 ** ((note - 69) / 12);

export function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function gain(ctx, destination, value) {
  const node = ctx.createGain();
  node.gain.value = value;
  node.connect(destination);
  return node;
}

export function pan(ctx, destination, position) {
  const node = ctx.createStereoPanner();
  node.pan.value = position;
  node.connect(destination);
  return node;
}

export function filter(ctx, destination, type, frequency, q = .72) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  node.connect(destination);
  return node;
}

export function oscillator(ctx, destination, type, hz, time, end, detune = 0) {
  const node = ctx.createOscillator();
  node.type = type;
  node.frequency.value = hz;
  node.detune.value = detune;
  node.connect(destination);
  node.start(time);
  node.stop(end);
  return node;
}

export function envelope(ctx, destination, time, length, level, attack, decay, sustain, release) {
  const out = gain(ctx, destination, 0);
  const hold = Math.min(time + length, time + attack + decay);
  const off = time + length, end = off + release;
  out.gain.setValueAtTime(floor, time);
  out.gain.linearRampToValueAtTime(level, time + attack);
  out.gain.exponentialRampToValueAtTime(Math.max(floor, level * sustain), hold);
  out.gain.setValueAtTime(Math.max(floor, level * sustain), off);
  out.gain.exponentialRampToValueAtTime(floor, end);
  return { out, end };
}

export function brightPluck(ctx, bus, note, time, length, level, position) {
  const { out, end } = envelope(ctx, pan(ctx, bus, position), time, length, level, .005, .11, .41, .085);
  const cutoff = filter(ctx, out, 'lowpass', 3100, .86);
  cutoff.frequency.setValueAtTime(3550, time);
  cutoff.frequency.exponentialRampToValueAtTime(1430, time + .1);
  const hz = noteHz(note);
  oscillator(ctx, gain(ctx, cutoff, .76), 'triangle', hz, time, end, -3);
  oscillator(ctx, gain(ctx, cutoff, .29), 'sawtooth', hz, time, end, 4);
  oscillator(ctx, gain(ctx, cutoff, .12), 'sine', hz * 2, time, end);
}

export function electricAccent(ctx, bus, note, time, length, level, position) {
  const { out, end } = envelope(ctx, pan(ctx, bus, position), time, length, level, .009, .060, .20, .040);
  const body = filter(ctx, out, 'lowpass', 1500);
  const hz = noteHz(note);
  oscillator(ctx, gain(ctx, body, .82), 'sine', hz, time, end);
  oscillator(ctx, gain(ctx, body, .18), 'triangle', hz, time, end);
  const overtone = gain(ctx, body, 0);
  overtone.gain.setValueAtTime(.11, time);
  overtone.gain.exponentialRampToValueAtTime(.012, time + .050);
  oscillator(ctx, overtone, 'sine', hz * 2, time, end);
}

export function bassNote(ctx, bus, note, time, length, level) {
  const { out, end } = envelope(ctx, bus, time, length, level, .011, .16, .57, .075);
  const cutoff = filter(ctx, out, 'lowpass', 510, .68);
  cutoff.frequency.setValueAtTime(860, time);
  cutoff.frequency.exponentialRampToValueAtTime(390, time + .115);
  const hz = noteHz(note);
  oscillator(ctx, gain(ctx, cutoff, .79), 'triangle', hz, time, end);
  oscillator(ctx, gain(ctx, cutoff, .30), 'sawtooth', hz, time, end);
  oscillator(ctx, gain(ctx, cutoff, .18), 'sine', hz, time, end);
}

function noiseAt(ctx, noise, bus, time, duration, random) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.connect(bus);
  source.start(time, random() * (noise.duration - duration), duration);
}

export function kick(ctx, bus, noise, time, level, random) {
  const decay = .164;
  const hit = envelope(ctx, bus, time, decay - .023, level, .003, .06, .19, .06);
  const thump = oscillator(ctx, hit.out, 'sine', 138, time, hit.end);
  thump.frequency.setValueAtTime(158, time);
  thump.frequency.exponentialRampToValueAtTime(63, time + .041);
  thump.frequency.exponentialRampToValueAtTime(54, time + .115);
  const beater = envelope(ctx, filter(ctx, bus, 'bandpass', 1540, .64), time, .019, level * .15, .002, .014, .22, .009);
  noiseAt(ctx, noise, beater.out, time, beater.end - time, random);
}

export function snare(ctx, bus, noise, time, level, ghost, random) {
  const position = ghost ? (random() - .5) * .38 : -.04;
  const spread = pan(ctx, bus, position);
  const tone = envelope(ctx, spread, time, ghost ? .029 : .059, level * .28, .004, .04, .23, .047);
  const shell = oscillator(ctx, tone.out, 'triangle', 225, time, tone.end);
  shell.frequency.exponentialRampToValueAtTime(171, time + .044);
  const air = filter(ctx, filter(ctx, spread, 'lowpass', 7900), 'highpass', 850);
  const hiss = envelope(ctx, air, time, ghost ? .037 : .087, level, .004, .06, .25, .068);
  noiseAt(ctx, noise, hiss.out, time, hiss.end - time, random);
  if (!ghost) {
    for (const [delay, position] of [[.009,-.27],[.019,.28]]) {
      const clap = filter(ctx, pan(ctx, bus, position), 'bandpass', 2200, .65);
      const burst = envelope(ctx, clap, time + delay, .027, level * .52, .003, .02, .24, .042);
      noiseAt(ctx, noise, burst.out, time + delay, burst.end - time - delay, random);
    }
  }
}

export function hat(ctx, bus, noise, time, level, position, open, random) {
  const air = filter(ctx, filter(ctx, pan(ctx, bus, position), 'lowpass', 10500), 'highpass', 5300);
  const hit = envelope(ctx, air, time, open ? .087 : .033, level, .003, .026, .19, open ? .045 : .02);
  noiseAt(ctx, noise, hit.out, time, hit.end - time, random);
}

export function makeRoom(ctx, bus, random) {
  const impulse = ctx.createBuffer(2, Math.round(rate * .88), rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < data.length; i++) {
      const time = i / rate;
      const white = random() * 2 - 1;
      smooth += .32 * (white - smooth);
      data[i] = smooth * Math.min(1, time / .038) * Math.exp(-time / .13) * .15;
    }
    for (const [delay, level] of [[.021,.7],[.037,.44],[.063,.31],[.084,.2]]) {
      data[Math.round((delay + channel * .007) * rate)] += level;
    }
  }
  const room = ctx.createConvolver();
  room.buffer = impulse;
  room.connect(filter(ctx, filter(ctx, bus, 'highpass', 390), 'lowpass', 4900));
  return room;
}

export function wav(buffer, outputGain) {
  const bytes = new ArrayBuffer(44 + buffer.length * 4);
  const view = new DataView(bytes);
  const label = (offset, text) => {
    for (const [i, char] of [...text].entries()) view.setUint8(offset + i, char.charCodeAt(0));
  };
  const word = (offset, value) => view.setUint16(offset, value, true);
  const long = (offset, value) => view.setUint32(offset, value, true);
  label(0, 'RIFF'); long(4, bytes.byteLength - 8); label(8, 'WAVE');
  label(12, 'fmt '); long(16, 16); word(20, 1); word(22, 2);
  long(24, buffer.sampleRate); long(28, buffer.sampleRate * 4); word(32, 4); word(34, 16);
  label(36, 'data'); long(40, bytes.byteLength - 44);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  const random = randomSource(1770);
  let peak = 0, square = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < 2; channel++) {
      const value = (channel ? right[i] : left[i]) * outputGain;
      if (!Number.isFinite(value) || Math.abs(value) >= 1) throw new Error('The mix contains clipping or invalid samples.');
      peak = Math.max(peak, Math.abs(value));
      square += value * value;
      const dither = Math.min(1, (buffer.length - i - 1) / (rate * .1));
      view.setInt16(44 + i * 4 + channel * 2, Math.round(value * 32767 + (random() - random()) * dither), true);
    }
  }
  return { blob: new Blob([bytes], { type: 'audio/wav' }), peak, rms: Math.sqrt(square / (2 * buffer.length)) };
}
