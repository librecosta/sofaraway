/* ------------------------------------------------------------------ *
 *  Procedural soundtrack.
 *
 *  Every note is synthesized at runtime — the project ships no audio files.
 *  Four-on-the-floor at 128 BPM in A minor, with the game clock derived
 *  from the audio clock so the visuals lock to the beat.
 * ------------------------------------------------------------------ */

import { VOL, sectionAt } from './volumes.js?v=2026-11-10za';

const MOOD = VOL.music;

const BPM = VOL.bpm;
const STEPS_PER_BAR = 16;

/* downtempo drifts through maj7 colour rather than driving minor triads */
const PROG_TECHNO = [
  [57, 60, 64], [57, 60, 64],
  [53, 57, 60], [53, 57, 60],
  [48, 52, 55], [48, 52, 55],
  [55, 59, 62], [55, 59, 62],
];
const PROG_DOWNTEMPO = [
  [62, 66, 69, 73], [59, 62, 66, 69],
  [55, 59, 62, 66], [57, 60, 64, 67],
  [62, 66, 69, 73], [59, 62, 66, 69],
  [55, 59, 62, 66], [50, 54, 57, 61],
];

/* industrial sits on a half-time feel: minor, tritone-adjacent, no lift */
const PROG_INDUSTRIAL = [
  [40, 43, 46], [41, 44, 47],
  [40, 43, 46], [34, 38, 41],
  [40, 43, 46], [41, 44, 47],
  [40, 43, 46], [36, 39, 43],
];

/* synthwave opens up: maj7 and add9 shapes, a IV-V-vi-iii lift */
const PROG_SYNTHWAVE = [
  [53, 57, 60, 64], [55, 59, 62, 66],
  [57, 60, 64, 67], [52, 55, 59, 62],
  [53, 57, 60, 64], [55, 59, 62, 66],
  [57, 60, 64, 67], [48, 52, 55, 59],
];

const PROG = MOOD === 'downtempo' ? PROG_DOWNTEMPO
           : MOOD === 'industrial' ? PROG_INDUSTRIAL
           : MOOD === 'synthwave' ? PROG_SYNTHWAVE
           : PROG_TECHNO;

const ROOT = MOOD === 'downtempo'
  ? [38, 35, 31, 33, 38, 35, 31, 26]
  : MOOD === 'industrial'
  ? [28, 29, 28, 22, 28, 29, 28, 24]
  : MOOD === 'synthwave'
  ? [41, 43, 45, 36, 41, 43, 45, 40]
  : [45, 45, 41, 41, 48, 48, 43, 43];

const BASS_PATTERN = [
  { s: 0,  o: 0,  d: 0.22, v: 1.0 },
  { s: 3,  o: 0,  d: 0.14, v: 0.6 },
  { s: 6,  o: 12, d: 0.16, v: 0.8 },
  { s: 8,  o: 0,  d: 0.20, v: 0.9 },
  { s: 11, o: 0,  d: 0.12, v: 0.5 },
  { s: 14, o: 7,  d: 0.14, v: 0.7 },
];

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class AudioEngine {
  constructor(bpm = BPM, ctxFactory = null) {
    this.bpm = bpm;
    this.ctxFactory = ctxFactory;
    this.ctx = null;
    this.running = false;
    this.muted = false;
    this.volume = 0.9;
    this.step = 0;
    this.nextTime = 0;
    this.t0 = 0;
    this.lookahead = 0.12;
    this.timer = null;
    this.ok = false;
    this.generation = 0;
  }

  /* ---------------- setup ---------------- */
  async init() {
    if (this.ctx) return this.ok;
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx && !this.ctxFactory) return false;

    try {
      this.ctx = this.ctxFactory ? this.ctxFactory() : new Ctx({ latencyHint: 'interactive' });
    } catch (e) {
      this.lastError = e;
      return false;
    }
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;

    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 3.2;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

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
    this.master.connect(this.comp);
    this.comp.connect(output);
    output.connect(peakGuard);
    peakGuard.connect(c.destination);

    this.impulse = this._impulse(1.9, 2.4);
    this.noiseBuf = this._noise(2.0);
    this._connectRun();
    this.ok = true;
    return true;
  }

  _connectRun() {
    const c = this.ctx;
    this.runBus = c.createGain();
    this.runBus.connect(this.master);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse;
    this.revSend = c.createGain();
    this.revSend.gain.value = 0.55;
    this.revSend.connect(this.reverb);
    this.reverb.connect(this.runBus);

    // busses
    this.drumBus = c.createGain();
    this.drumBus.gain.value = 0.95;
    this.drumBus.connect(this.runBus);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.8;
    this.musicBus.connect(this.runBus);
  }

  _noise(seconds) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _impulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  /* ---------------- transport ---------------- */
  async start() {
    this.stop();
    const generation = this.generation;
    if (!await this.init() || generation !== this.generation) return false;
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (generation !== this.generation || this.ctx.state !== 'running') return false;

    if (!this.runBus) this._connectRun();
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.t0 = this.nextTime;
    this.running = true;

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this._schedule(), 25);
    this._schedule();
    return true;
  }

  stop() {
    this.generation++;
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.runBus?.disconnect();
    this.runBus = null;
  }

  setMuted(m) {
    this.muted = m;
    this._applyVolume();
  }

  get time() {
    return this.ok && this.running ? Math.max(0, this.ctx.currentTime - this.t0) : 0;
  }

  get beat() {
    return this.time * (this.bpm / 60);
  }

  /* ---------------- scheduling ---------------- */
  _schedule() {
    if (!this.running || !this.ok || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const stepSeconds = 15 / this.bpm;
    if (this.nextTime < now) {
      this.step = Math.max(this.step, Math.ceil((now - this.t0) / stepSeconds));
      this.nextTime = this.t0 + this.step * stepSeconds;
    }

    while (this.step < VOL.beats * 4 && this.nextTime < now + this.lookahead) {
      const s = this.step % STEPS_PER_BAR;
      const bar = Math.floor(this.step / STEPS_PER_BAR) % 8;
      this._playStep(s, bar, this.nextTime);
      this.step++;
      this.nextTime = this.t0 + this.step * stepSeconds;
    }
  }

  _playStep(s, bar, t) {
    const chord = PROG[bar];
    const root = ROOT[bar];
    const beat = this.step / 4;
    const sec = sectionAt(beat);
    const energy = sec?.energy ?? 0.15;
    const ending = beat > VOL.beats - 8;   // last two bars: let it ring out

    /* ---- section transitions ---- */
    if (sec && s === 0 && !ending) {
      const left = sec.end - beat;
      const nextE = sec.next ? sec.next.energy : 0;
      // a riser through the last bar before anything louder
      if (left <= 4.01 && nextE > sec.energy + 0.05) {
        this._riser(t, (60 / this.bpm) * 4);
      }
      // and a hit on the downbeat of the new, louder section
      if (beat <= sec.start + 0.01 && sec.i > 0) {
        const prev = VOL.sections[sec.i - 1];
        if (sec.energy > prev.energy + 0.05) this._impact(t);
      }
    }

    // --- drums ---------------------------------------------------
    const halfTime = MOOD === 'industrial';

    if (ending) {
      // drums out, pad and arp only
    } else if (halfTime ? (s === 0 || s === 10) : (s % 4 === 0) && energy > 0.20) {
      this._kick(t, 0.55 + energy * 0.45);
      this._duck(t);
    }
    if (!ending && energy > 0.42) {
      if (halfTime ? s === 8 : (s === 4 || s === 12)) this._snare(t, 0.5 + energy * 0.5);
    }
    if (MOOD === 'downtempo') {
      // only a soft off-beat tick; the sixteenth grid stays empty
      if (!ending && (s === 4 || s === 12)) this._hat(t, 0.18 * (0.5 + energy * 0.6), 0.05);
    } else {
      if (halfTime) {
        if (s % 4 === 2 && energy > 0.3) this._hat(t, 0.30 * (0.5 + energy * 0.6), 0.018);
        if (s % 8 === 6 && energy > 0.6) this._hat(t, 0.18, 0.10);
      } else {
        if (s % 2 === 0 && energy > 0.22) {
          this._hat(t, (s % 4 === 0 ? 0.5 : 0.28) * (0.5 + energy * 0.6), s === 14 ? 0.075 : 0.028);
        }
        if (s % 4 === 2 && energy > 0.5) this._hat(t + 0.5 * (60 / this.bpm) / 4, 0.14, 0.02);
      }
    }

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
      this._pad(t, chord, (60 / this.bpm) * (MOOD === 'downtempo' ? 2 : 1));
    }

    // --- fill ----------------------------------------------------
    if (bar % 4 === 3 && s >= 12 && energy > 0.6) {
      this._snare(t, 0.35 + (s - 12) * 0.14);
    }
  }

  /* ---------------- voices ---------------- */
  _kick(t, vel) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    const g = c.createGain();

    if (MOOD === 'downtempo') {
      o.frequency.setValueAtTime(96, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel * 0.85, t + 0.010);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    } else {
      o.frequency.setValueAtTime(168, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.10);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
    }

    o.connect(g); g.connect(this.drumBus);
    o.start(t); o.stop(t + 0.34);

    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.1;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.45 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(bp); bp.connect(ng); ng.connect(this.drumBus);
    n.start(t); n.stop(t + 0.05);
  }

  _snare(t, vel) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    const hp = c.createBiquadFilter();
    hp.type = 'bandpass'; hp.frequency.value = 1900; hp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.75 * vel, t + 0.003);
    const gate = MOOD === 'synthwave';
    g.gain.exponentialRampToValueAtTime(0.0001, t + (gate ? 0.42 : 0.16));
    n.connect(hp); hp.connect(g); g.connect(this.drumBus);
    const send = c.createGain();
    send.gain.value = gate ? 1.6 : 0.7;      // gated-reverb snare
    g.connect(send); send.connect(this.revSend);
    n.start(t); n.stop(t + (gate ? 0.55 : 0.2));

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

  _hat(t, vel, dec) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    n.playbackRate.value = 1.4;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7600;
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    n.connect(hp); hp.connect(g); g.connect(this.drumBus);
    n.start(t); n.stop(t + dec + 0.02);
  }

  _bass(t, midi, dur, vel) {
    const c = this.ctx;
    const f = midiToFreq(midi);
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;

    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * (MOOD === 'downtempo' ? 0.25 : 0.5);

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 7;
    const dirty = MOOD === 'industrial';
    lp.frequency.setValueAtTime(dirty ? 110 : 180, t);
    lp.frequency.exponentialRampToValueAtTime(dirty ? 900 : 1400, t + 0.02);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((dirty ? 0.55 : 0.42) * vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime((MOOD === 'downtempo' ? 0.34 : 0.22) * vel, t + 0.008);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(lp); lp.connect(g); g.connect(this.musicBus);
    o2.connect(g2); g2.connect(this.musicBus);

    o.start(t); o.stop(t + dur + 0.02);
    o2.start(t); o2.stop(t + dur + 0.02);
  }

  _pluck(t, midi, dur, vel) {
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

  _pad(t, chord, barDur) {
    const c = this.ctx;
    const dur = barDur * 1.05;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const padLevel = MOOD === 'downtempo' ? 0.15 : 0.085;
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

  _riser(t, dur) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
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

  _impact(t) {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
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

  setVolume(v) {
    if (!Number.isFinite(v)) return;
    this.volume = Math.max(0, Math.min(1, v));
    this._applyVolume();
  }

  _applyVolume() {
    if (this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.05);
    }
  }

  _duck(t) {
    const g = this.musicBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.8, t);
    g.linearRampToValueAtTime(0.34, t + 0.012);
    g.linearRampToValueAtTime(0.8, t + 0.20);
  }
}
