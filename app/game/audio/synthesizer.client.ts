import { OrbitSynthesizer } from './orbit.client';
import { DescentSynthesizer } from './descent.client';
import { DaybreakSynthesizer } from './daybreak.client';
import { sectionAt } from '../core/volumes';
import { drumStrengths } from '../core/rhythmic-lights';
import type { VolumeDefinition } from '../core/volumes';

const PROG_TECHNO = [
  [57, 60, 64], [57, 60, 64],
  [53, 57, 60], [53, 57, 60],
  [48, 52, 55], [48, 52, 55],
  [55, 59, 62], [55, 59, 62],
];

const BASS_ROOTS = [45, 45, 41, 41, 48, 48, 43, 43];

const BASS_PATTERN = [
  { s: 0,  o: 0,  d: 0.22, v: 1.0 },
  { s: 3,  o: 0,  d: 0.14, v: 0.6 },
  { s: 6,  o: 12, d: 0.16, v: 0.8 },
  { s: 8,  o: 0,  d: 0.20, v: 0.9 },
  { s: 11, o: 0,  d: 0.12, v: 0.5 },
  { s: 14, o: 7,  d: 0.14, v: 0.7 },
];

function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function createMaster(c: BaseAudioContext, level: number, destination: AudioNode = c.destination) {
  const master = c.createGain();
  master.gain.value = level;

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 22;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;

  // Preserve the mix below the knee and round off transients the compressor misses.
  const output = c.createGain();
  output.gain.value = 0.75;
  const peakGuard = c.createWaveShaper();
  peakGuard.curve = Float32Array.from({ length: 1025 }, (_, i) => {
    const sample = i / 512 - 1;
    const level = Math.abs(sample);
    const knee = 0.9;
    const excess = Math.max(0, level - knee) / (1 - knee);
    return Math.sign(sample) * (Math.min(level, knee) + (1 - knee) * (excess - excess ** 2 / 2));
  });
  master.connect(comp);
  comp.connect(output);
  output.connect(peakGuard);
  peakGuard.connect(destination);

  return master;
}

function noise(c: BaseAudioContext, seconds: number, random: () => number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = random() * 2 - 1;
  return buf;
}

function impulse(c: BaseAudioContext, seconds: number, decay: number, random: () => number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function createBuffers(ctx: BaseAudioContext, random = Math.random) {
  return { noise: noise(ctx, 2.0, random), impulse: impulse(ctx, 1.9, 2.4, random) };
}

export class Synthesizer {
  private readonly score: LegacyScore | DaybreakSynthesizer | DescentSynthesizer | OrbitSynthesizer;

  constructor(private readonly ctx: BaseAudioContext, volume: VolumeDefinition,
    output: AudioNode, buffers?: ReturnType<typeof createBuffers>) {
    this.score = volume.music === 'breakbeat' ? new DaybreakSynthesizer(ctx, output)
      : volume.music === 'control' ? new DescentSynthesizer(ctx, output)
      : volume.music === 'starwake' ? new OrbitSynthesizer(ctx, output)
      : new LegacyScore(ctx, volume, output, buffers ?? createBuffers(ctx));
  }

  get eventSource() { return this.score; }

  playStep(step: number, at: number, after?: number) { this.score.playStep(step, at, after); }

  finishAt(end: number) {
    if (this.score instanceof DescentSynthesizer || this.score instanceof OrbitSynthesizer) this.score.finishAt(end);
  }

  dispose() { this.score.dispose(); }
}

class LegacyScore {
  private readonly runBus: GainNode;
  private readonly revSend: GainNode;
  private readonly drumBus: GainNode;
  private readonly musicBus: GainNode;

  constructor(private readonly ctx: BaseAudioContext, private readonly volume: VolumeDefinition,
    output: AudioNode, private readonly buffers: ReturnType<typeof createBuffers>) {
    const c = ctx;
    this.runBus = c.createGain();
    this.runBus.connect(output);

    const reverb = c.createConvolver();
    reverb.buffer = buffers.impulse;
    this.revSend = c.createGain();
    this.revSend.gain.value = 0.55;
    this.revSend.connect(reverb);
    reverb.connect(this.runBus);

    // busses
    this.drumBus = c.createGain();
    this.drumBus.gain.value = 0.95;
    this.drumBus.connect(this.runBus);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.8;
    this.musicBus.connect(this.runBus);
  }

  dispose() { this.runBus.disconnect(); }

  playStep(step: number, t: number) {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 8;
    const chord = PROG_TECHNO[bar];
    const root = BASS_ROOTS[bar];
    const beat = step / 4;
    const sec = sectionAt(this.volume, beat);
    const energy = sec?.energy ?? 0.15;
    const ending = beat > this.volume.beats - 8;   // last two bars: let it ring out

    /* ---- section transitions ---- */
    if (sec && s === 0 && !ending) {
      const left = sec.end - beat;
      const nextE = sec.next ? sec.next.energy : 0;
      // a riser through the last bar before anything louder
      if (left <= 4.01 && nextE > sec.energy + 0.05) {
        this._riser(t, (60 / this.volume.bpm) * 4);
      }
      // and a hit on the downbeat of the new, louder section
      if (beat <= sec.start + 0.01 && sec.i > 0) {
        const prev = this.volume.sections[sec.i - 1];
        if (sec.energy > prev.energy + 0.05) this._impact(t);
      }
    }

    // --- drums ---------------------------------------------------
    const drums = drumStrengths(this.volume, step, energy);
    if (drums.kick) {
      this._kick(t, drums.kick);
      this._duck(t);
    }
    if (drums.snare) this._snare(t, drums.snare);
    if (s % 2 === 0 && energy > 0.22) {
      this._hat(t, (s % 4 === 0 ? 0.5 : 0.28) * (0.5 + energy * 0.6), s === 14 ? 0.075 : 0.028);
    }
    if (s % 4 === 2 && energy > 0.5) this._hat(t + 0.5 * (60 / this.volume.bpm) / 4, 0.14, 0.02);

    // --- bass ----------------------------------------------------
    if (energy > 0.28) {
      for (const n of BASS_PATTERN) {
        if (n.s === s) {
          this._bass(t, root + n.o, n.d, n.v * (0.6 + energy * 0.5));
          break;
        }
      }
    }

    // --- arp -----------------------------------------------------
    if (s % 2 === 0 && energy > 0.5) {
      const idx = (s / 2) % chord.length;
      const oct = (s % 8 === 0) ? 24 : 12;
      this._pluck(t, chord[idx] + oct, 0.10, 0.42 * (0.5 + energy * 0.6));
    }

    // --- pad -----------------------------------------------------
    if (s === 0) {
      this._pad(t, chord, 60 / this.volume.bpm);
    }

    // --- fill ----------------------------------------------------
    if (drums.fill) this._snare(t, drums.fill);
  }

  /* ---------------- voices ---------------- */
  private _kick(t: number, vel: number) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    const g = c.createGain();

    o.frequency.setValueAtTime(168, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.10);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);

    o.connect(g); g.connect(this.drumBus);
    o.start(t); o.stop(t + 0.34);

    const n = c.createBufferSource();
    n.buffer = this.buffers.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.1;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.45 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(bp); bp.connect(ng); ng.connect(this.drumBus);
    n.start(t); n.stop(t + 0.05);
  }

  private _snare(t: number, vel: number) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.buffers.noise;
    const hp = c.createBiquadFilter();
    hp.type = 'bandpass'; hp.frequency.value = 1900; hp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.75 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    n.connect(hp); hp.connect(g); g.connect(this.drumBus);
    const send = c.createGain();
    send.gain.value = 0.7;
    g.connect(send); send.connect(this.revSend);
    n.start(t); n.stop(t + 0.2);

    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = c.createGain();
    og.gain.setValueAtTime(0.35 * vel, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og); og.connect(this.drumBus);
    o.start(t); o.stop(t + 0.12);
  }

  private _hat(t: number, vel: number, dec: number) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.buffers.noise;
    n.playbackRate.value = 1.4;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7600;
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    n.connect(hp); hp.connect(g); g.connect(this.drumBus);
    n.start(t); n.stop(t + dec + 0.02);
  }

  private _bass(t: number, midi: number, dur: number, vel: number) {
    const c = this.ctx;
    const f = midiToFreq(midi);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;

    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 0.5;

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 7;
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + 0.02);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42 * vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.008);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(lp); lp.connect(g); g.connect(this.musicBus);
    o2.connect(g2); g2.connect(this.musicBus);

    o.start(t); o.stop(t + dur + 0.02);
    o2.start(t); o2.stop(t + dur + 0.02);
  }

  private _pluck(t: number, midi: number, dur: number, vel: number) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midiToFreq(midi);

    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.frequency.value = midiToFreq(midi) * 2.003;

    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 320;

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.20 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.055 * vel, t + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);

    o.connect(hp); hp.connect(g); g.connect(this.musicBus); g.connect(this.revSend);
    o2.connect(g2); g2.connect(this.musicBus);

    o.start(t); o.stop(t + dur + 0.02);
    o2.start(t); o2.stop(t + dur + 0.02);
  }

  private _pad(t: number, chord: number[], barDur: number) {
    const c = this.ctx;
    const dur = barDur * 1.05;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const padLevel = 0.085;
    g.gain.linearRampToValueAtTime(padLevel, t + 0.28);
    g.gain.setValueAtTime(padLevel, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1900, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(900, t + dur);
    lp.Q.value = 1.2;

    lp.connect(g);
    g.connect(this.musicBus);
    g.connect(this.revSend);

    for (const m of chord) {
      for (const det of [-7, 0, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiToFreq(m);
        o.detune.value = det;
        o.connect(lp);
        o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }

  private _riser(t: number, dur: number) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.buffers.noise;
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.8;
    bp.frequency.setValueAtTime(280, t);
    bp.frequency.exponentialRampToValueAtTime(6800, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13, t + dur * 0.92);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(g); g.connect(this.musicBus); g.connect(this.revSend);
    n.start(t); n.stop(t + dur + 0.05);
  }

  private _impact(t: number) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.buffers.noise;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(9000, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.45);
    const g = c.createGain();
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(lp); lp.connect(g); g.connect(this.drumBus); g.connect(this.revSend);
    n.start(t); n.stop(t + 0.65);
  }

  private _duck(t: number) {
    const g = this.musicBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.8, t);
    g.linearRampToValueAtTime(0.34, t + 0.012);
    g.linearRampToValueAtTime(0.8, t + 0.20);
  }
}
