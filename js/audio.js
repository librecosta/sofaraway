/* ------------------------------------------------------------------ *
 *  Procedural soundtrack.
 *
 *  Every note is synthesized at runtime — the project ships no audio files.
 *  Four-on-the-floor at 128 BPM in A minor, with the game clock derived
 *  from the audio clock so the visuals lock to the beat.
 * ------------------------------------------------------------------ */

const BPM = 128;
const STEPS_PER_BAR = 16;

const PROG = [
  [57, 60, 64], // Am
  [57, 60, 64],
  [53, 57, 60], // F
  [53, 57, 60],
  [48, 52, 55], // C
  [48, 52, 55],
  [55, 59, 62], // G
  [55, 59, 62],
];

const ROOT = [45, 45, 41, 41, 48, 48, 43, 43];

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
  constructor(bpm = BPM) {
    this.bpm = bpm;
    this.ctx = null;
    this.running = false;
    this.muted = false;
    this.step = 0;
    this.nextTime = 0;
    this.t0 = 0;
    this.lookahead = 0.12;
    this.timer = null;
    this.ok = false;
  }

  /* ---------------- setup ---------------- */
  async init() {
    if (this.ctx) return this.ok;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;

    try {
      this.ctx = new Ctx({ latencyHint: 'interactive' });
    } catch (e) {
      return false;
    }
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = 0.9;

    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 3.2;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.master.connect(this.comp);
    this.comp.connect(c.destination);

    // reverb
    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(1.9, 2.4);
    this.revSend = c.createGain();
    this.revSend.gain.value = 0.55;
    this.revSend.connect(this.reverb);
    this.reverb.connect(this.master);

    // busses
    this.drumBus = c.createGain();
    this.drumBus.gain.value = 0.95;
    this.drumBus.connect(this.master);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.8;
    this.musicBus.connect(this.master);

    this.noiseBuf = this._noise(2.0);
    this.ok = true;
    return true;
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
    await this.init();
    if (!this.ok) return false;
    if (this.ctx.state === 'suspended') await this.ctx.resume();

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
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0.0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  get time() {
    return this.ok && this.running ? this.ctx.currentTime - this.t0 : 0;
  }

  get beat() {
    return this.time * (this.bpm / 60);
  }

  /* ---------------- scheduling ---------------- */
  _schedule() {
    if (!this.running || !this.ok) return;
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.4) this.nextTime = now + 0.02;

    while (this.nextTime < now + this.lookahead) {
      const s = this.step % STEPS_PER_BAR;
      const bar = Math.floor(this.step / STEPS_PER_BAR) % 8;
      this._playStep(s, bar, this.nextTime);
      this.step++;
      this.nextTime += (60 / this.bpm) / 4;
    }
  }

  _playStep(s, bar, t) {
    const chord = PROG[bar];
    const root = ROOT[bar];

    // --- drums ---------------------------------------------------
    if (s % 4 === 0) {
      this._kick(t, 1.0);
      this._duck(t);
    }
    if (s === 4 || s === 12) this._snare(t, 0.9);
    if (s % 2 === 0) this._hat(t, s % 4 === 0 ? 0.5 : 0.28, s === 14 ? 0.075 : 0.028);
    if (s % 4 === 2) this._hat(t + 0.5 * (60 / this.bpm) / 4, 0.14, 0.02);

    // --- bass ----------------------------------------------------
    for (const n of BASS_PATTERN) {
      if (n.s === s) {
        this._bass(t, root + n.o, n.d, n.v);
        break;
      }
    }

    // --- arp -----------------------------------------------------
    if (s % 2 === 0) {
      const idx = (s / 2) % chord.length;
      const oct = (s % 8 === 0) ? 24 : 12;
      this._pluck(t, chord[idx] + oct, 0.10, 0.42);
    }

    // --- pad -----------------------------------------------------
    if (s === 0) {
      this._pad(t, chord, 60 / this.bpm);
    }

    // --- fill ----------------------------------------------------
    if (bar % 4 === 3 && s >= 12) {
      this._snare(t, 0.35 + (s - 12) * 0.14);
    }
  }

  /* ---------------- voices ---------------- */
  _kick(t, vel) {
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
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    n.connect(hp); hp.connect(g); g.connect(this.drumBus);
    g.connect(this.revSend);
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
    g.gain.linearRampToValueAtTime(0.085, t + 0.28);
    g.gain.setValueAtTime(0.085, t + dur * 0.7);
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

  _duck(t) {
    const g = this.musicBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.8, t);
    g.linearRampToValueAtTime(0.34, t + 0.012);
    g.linearRampToValueAtTime(0.8, t + 0.20);
  }
}
