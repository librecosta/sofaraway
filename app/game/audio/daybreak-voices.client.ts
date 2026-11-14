export const rate = 44100;
const floor = 0.00005;
export const noteHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

export function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function gain(ctx: BaseAudioContext, destination: AudioNode, value: number) {
  const node = ctx.createGain();
  node.gain.value = value;
  node.connect(destination);
  return node;
}

export function pan(ctx: BaseAudioContext, destination: AudioNode, position: number) {
  const node = ctx.createStereoPanner();
  node.pan.value = position;
  node.connect(destination);
  return node;
}

export function filter(ctx: BaseAudioContext, destination: AudioNode, type: BiquadFilterType, frequency: number, q = .72) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  node.connect(destination);
  return node;
}

export function oscillator(ctx: BaseAudioContext, destination: AudioNode, type: OscillatorType, hz: number, time: number, end: number, detune = 0) {
  const node = ctx.createOscillator();
  node.type = type;
  node.frequency.value = hz;
  node.detune.value = detune;
  node.connect(destination);
  node.start(time);
  node.stop(end);
  return node;
}

export function envelope(ctx: BaseAudioContext, destination: AudioNode, time: number, length: number, level: number, attack: number, decay: number, sustain: number, release: number) {
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

export function brightPluck(ctx: BaseAudioContext, bus: AudioNode, note: number, time: number, length: number, level: number, position: number) {
  const { out, end } = envelope(ctx, pan(ctx, bus, position), time, length, level, .005, .11, .41, .085);
  const cutoff = filter(ctx, out, 'lowpass', 3100, .86);
  cutoff.frequency.setValueAtTime(3550, time);
  cutoff.frequency.exponentialRampToValueAtTime(1430, time + .1);
  const hz = noteHz(note);
  oscillator(ctx, gain(ctx, cutoff, .76), 'triangle', hz, time, end, -3);
  oscillator(ctx, gain(ctx, cutoff, .29), 'sawtooth', hz, time, end, 4);
  oscillator(ctx, gain(ctx, cutoff, .12), 'sine', hz * 2, time, end);
}

export function bassNote(ctx: BaseAudioContext, bus: AudioNode, note: number, time: number, length: number, level: number) {
  const { out, end } = envelope(ctx, bus, time, length, level, .011, .16, .57, .075);
  const cutoff = filter(ctx, out, 'lowpass', 510, .68);
  cutoff.frequency.setValueAtTime(860, time);
  cutoff.frequency.exponentialRampToValueAtTime(390, time + .115);
  const hz = noteHz(note);
  oscillator(ctx, gain(ctx, cutoff, .79), 'triangle', hz, time, end);
  oscillator(ctx, gain(ctx, cutoff, .30), 'sawtooth', hz, time, end);
  oscillator(ctx, gain(ctx, cutoff, .18), 'sine', hz, time, end);
}

function noiseAt(ctx: BaseAudioContext, noise: AudioBuffer, bus: AudioNode, time: number, duration: number, random: () => number) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.connect(bus);
  source.start(time, random() * (noise.duration - duration), duration);
}

export function kick(ctx: BaseAudioContext, bus: AudioNode, noise: AudioBuffer, time: number, level: number, random: () => number) {
  const decay = .164;
  const hit = envelope(ctx, bus, time, decay - .023, level, .003, .06, .19, .06);
  const thump = oscillator(ctx, hit.out, 'sine', 138, time, hit.end);
  thump.frequency.setValueAtTime(158, time);
  thump.frequency.exponentialRampToValueAtTime(63, time + .041);
  thump.frequency.exponentialRampToValueAtTime(54, time + .115);
  const beater = envelope(ctx, filter(ctx, bus, 'bandpass', 1540, .64), time, .019, level * .15, .002, .014, .22, .009);
  noiseAt(ctx, noise, beater.out, time, beater.end - time, random);
}

export function snare(ctx: BaseAudioContext, bus: AudioNode, noise: AudioBuffer, time: number, level: number, ghost: boolean, random: () => number) {
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

export function hat(ctx: BaseAudioContext, bus: AudioNode, noise: AudioBuffer, time: number, level: number, position: number, open: boolean, random: () => number) {
  const air = filter(ctx, filter(ctx, pan(ctx, bus, position), 'lowpass', 10500), 'highpass', 5300);
  const hit = envelope(ctx, air, time, open ? .087 : .033, level, .003, .026, .19, open ? .045 : .02);
  noiseAt(ctx, noise, hit.out, time, hit.end - time, random);
}

export function roomImpulse(ctx: BaseAudioContext, random: () => number) {
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
  if (ctx.sampleRate === rate) return impulse;

  // A ConvolverNode requires the context rate. Preserve the original impulse
  // and random draw count, even on devices running at 48 kHz or another rate.
  const ratio = rate / ctx.sampleRate;
  const resampled = ctx.createBuffer(2, Math.round(impulse.length / ratio), ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const source = impulse.getChannelData(channel);
    const target = resampled.getChannelData(channel);
    for (let i = 0; i < target.length; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const a = source[index] ?? 0;
      target[i] = a + ((source[index + 1] ?? 0) - a) * (position - index);
    }
  }
  return resampled;
}
