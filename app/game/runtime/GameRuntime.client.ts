import { initialSnapshot } from '../contracts';
import type { GameError, GameOptions, GameRuntime, GameSnapshot, Difficulty, PauseReason, PlayMode, QualityTier, VolumeId } from '../contracts';
import { FixedStepClock, MAX_STEPS, RECOVERY_GAP, RunTimeline, STEP } from '../core/clock';
import { clamp } from '../core/collision';
import { idleInput } from '../core/input';
import { PickupDeck } from '../core/pickups';
import { CAPTURE_RUN_SEED, createRunSeed } from '../core/run-seed';
import { Simulation } from '../core/simulation';
import { volumeById } from '../core/volumes';
import { AudioTransport } from '../audio/transport.client';
import { Graphics, UnsupportedGraphics } from '../graphics/scene.client';
import { Recorder } from '../debug/recorder.client';
import { InputController } from './input.client';
import type { PointerView } from './input.client';

export interface RuntimeView {
  pointer(view: PointerView): void;
  flash(opacity: number, color: string): void;
  debug(text: string): void;
  key?(key: string, event: KeyboardEvent): boolean;
  best?(score: number): void;
  muted?(value: boolean): void;
}

const audioError: GameError = Object.freeze({
  kind: 'audio', message: 'Audio could not start. Try again or play with sound off.',
});

export class Runtime implements GameRuntime {
  private snapshot = initialSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly events = new AbortController();
  private readonly clock = new FixedStepClock();
  private readonly timeline = new RunTimeline();
  private readonly pickupDeck = new PickupDeck();
  private pendingPickupDraw = false;
  private readonly audio = new AudioTransport(() => { void this.enableAudio(); });
  private graphics?: Graphics;
  private simulation?: Simulation;
  private input?: InputController;
  private recorder?: Recorder;
  private options?: GameOptions;
  private raf = 0;
  private generation = 0;
  private resumePending = false;
  private silent = false;
  private audioPending = false;
  private pausedAt = 0;
  private recoveryUntil = 0;
  private recovering = false;
  private lastInput = idleInput;
  private lastFrame = 0;
  private visualDebt = 0;
  private nextPublish = 0;
  private nextDebug = 0;
  private frameTimes: number[] = [];
  private contextLost = false;
  private contextRecoveryTimer?: ReturnType<typeof setTimeout>;
  private cached = false;
  private initMs = 0;
  private switchMs = 0;
  private notice = '';
  private noticeUntil = 0;

  constructor(private readonly view: RuntimeView) {}

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    if (this.snapshot.phase === 'disposed') return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  async initialize(canvas: HTMLCanvasElement, options: GameOptions) {
    if (this.snapshot.phase !== 'uninitialized') return;
    const begin = performance.now();
    const generation = this.generation;
    this.options = options;
    this.publish({ phase: 'initializing', volumeId: options.volumeId, difficulty: options.difficulty,
      mode: options.mode, quality: options.quality, volume: options.volume, muted: options.muted });
    if (generation !== this.generation) return;
    try {
      this.graphics = new Graphics(canvas, options.quality, this.mobile(), options.diagnostics);
      this.input = new InputController(canvas, () => this.snapshot.phase === 'playing', this.keydown,
        options.diagnostics.cursor);
      if (options.diagnostics.record) this.toggleRecorder();
      this.attach(canvas);
      this.resizeGraphics();
      this.audio.setLevel(options.volume, options.muted);
      this.loadVolume(options.volumeId);
      this.initMs = performance.now() - begin;
      this.publish({ phase: 'menu', section: this.simulation!.section });
      if (options.diagnostics.fixedTime !== null) this.capture(options.diagnostics.fixedTime);
      else if (options.diagnostics.autoplay) void this.start(!navigator.userActivation?.hasBeenActive);
      this.schedule();
    } catch (error) {
      this.fail(error);
    }
  }

  async start(silent = false) {
    const phase = this.snapshot.phase;
    let sim = this.simulation;
    if (!sim || this.unavailable() || (phase !== 'menu' && phase !== 'results')) return;
    if (sim.volume.id === 'elsewhere' && sim.mode !== this.snapshot.mode) {
      try {
        this.loadVolume(sim.volume.id);
        sim = this.simulation!;
      } catch (error) {
        this.fail(error);
        return;
      }
    }
    const silentFallback = silent && this.snapshot.error?.kind === 'audio';
    const generation = ++this.generation;
    this.publish({ phase: 'starting', error: null });
    if (generation !== this.generation) return;
    if (!silent && !await this.startAudio(sim, 0, generation)) {
      if (generation === this.generation) this.publish({ phase, error: audioError });
      return;
    }
    if (generation !== this.generation) return;
    if (this.unavailable()) {
      this.audio.stop();
      this.publish({ phase });
      return;
    }
    this.input?.clear();
    this.noticeUntil = 0;
    this.clock.reset();
    this.pausedAt = this.recoveryUntil = 0;
    this.recovering = false;
    this.lastInput = idleInput;
    this.silent = silent;
    if (silent) {
      this.audio.resetDiagnostics();
      if (silentFallback) this.audio.diagnostics.silentFallbacks++;
    }
    const fixedSeed = this.options?.runSeed;
    const seed = fixedSeed ?? createRunSeed();
    this.pendingPickupDraw = fixedSeed === undefined && sim.volume.id === 'elsewhere';
    sim.start(this.snapshot.difficulty, seed, this.pendingPickupDraw ? this.pickupDeck.peek(seed) : undefined, this.snapshot.mode);
    try {
      if (silent) this.graphics?.warmSurface(sim, false);
    } catch (error) {
      this.fail(error);
      return;
    }
    this.anchorRun(0);
    this.publishRun({ phase: 'playing', pauseReason: null, error: null, soundUnavailable: false });
  }

  pause(reason: PauseReason) {
    if (this.snapshot.phase === 'starting') {
      if (reason !== 'user') this.returnToMenu();
      return;
    }
    if (this.snapshot.phase !== 'playing' && !this.resumePending) return;
    this.generation++;
    this.resumePending = false;
    this.audioPending = false;
    if (this.snapshot.phase === 'playing') {
      this.pausedAt = Math.max(this.clock.elapsed, this.timeline.at(performance.now() / 1000));
      if (this.pausedAt - this.clock.elapsed >= RECOVERY_GAP) this.recoveryUntil = this.pausedAt;
    }
    this.audio.stop(true);
    this.input?.clear();
    this.lastInput = idleInput;
    this.view.flash(0, '#fff');
    this.publishRun({ phase: 'paused', pauseReason: reason, error: null, boosting: false });
  }

  async resume(silent = this.silent) {
    const sim = this.simulation;
    if (!sim || this.snapshot.phase !== 'paused' || this.resumePending || this.unavailable()) return;
    this.resumePending = true;
    const generation = ++this.generation;
    const restored = !silent && await this.startAudio(sim, this.pausedAt, generation, true);
    if (generation !== this.generation) return;
    this.resumePending = false;
    if (this.unavailable()) {
      this.audio.stop(true);
      return;
    }
    this.silent = !restored;
    if (!silent && !restored) this.audio.diagnostics.silentFallbacks++;
    this.anchorRun(this.pausedAt);
    this.publish({ phase: 'playing', pauseReason: null, error: null,
      soundUnavailable: silent ? this.snapshot.soundUnavailable : !restored });
    this.schedule();
  }

  async enableAudio() {
    const sim = this.simulation;
    if (!sim || this.snapshot.phase !== 'playing' || this.audioPending || this.unavailable()) return;
    if (this.silent && !this.snapshot.soundUnavailable) return;
    this.audioPending = true;
    const generation = this.generation;
    const restored = await this.startAudio(sim, lead => this.timeline.at(performance.now() / 1000 + lead), generation, true);
    if (generation !== this.generation || this.snapshot.phase !== 'playing') return;
    this.audioPending = false;
    if (!restored && !this.silent) this.audio.diagnostics.silentFallbacks++;
    this.silent = !restored;
    this.publish({ soundUnavailable: !restored });
  }

  returnToMenu() {
    if (!['starting', 'playing', 'paused', 'crash', 'results'].includes(this.snapshot.phase)) return;
    this.generation++;
    this.resumePending = false;
    this.audioPending = false;
    this.audio.stop();
    this.input?.clear();
    this.pendingPickupDraw = false;
    this.simulation?.returnToMenu();
    this.view.flash(0, '#fff');
    this.publish({ phase: 'menu', error: this.contextLost ? this.snapshot.error : null,
      pauseReason: null, result: null, hint: false, boosting: false, shield: false, resonance: 0, soundUnavailable: false,
      outroPhase: undefined, encore: undefined,
      route: null, routeHint: null });
  }

  async selectVolume(id: VolumeId) {
    if (!this.canConfigure() || this.contextLost || this.cached || id === this.snapshot.volumeId) return;
    const generation = ++this.generation;
    const begin = performance.now();
    this.publish({ phase: 'initializing', error: null, result: null, pauseReason: null });
    await Promise.resolve();
    if (generation !== this.generation) return;
    try {
      this.audio.stop();
      this.input?.clear();
      this.loadVolume(id);
      this.switchMs = performance.now() - begin;
      this.publishRun({ phase: 'menu', volumeId: id });
      if (this.options?.diagnostics.fixedTime != null) this.capture(this.options.diagnostics.fixedTime);
      this.schedule();
    } catch (error) {
      this.fail(error);
    }
  }

  setDifficulty(value: Difficulty) {
    if (this.canConfigure()) this.publish({ difficulty: value });
  }

  setMode(value: PlayMode) {
    if (this.snapshot.phase !== 'menu' || this.snapshot.mode === value) return;
    this.publish({ mode: value });
    if (this.snapshot.volumeId !== 'elsewhere' || this.unavailable()) return;
    try {
      this.loadVolume('elsewhere');
    } catch (error) {
      this.fail(error);
    }
  }

  async setQuality(value: QualityTier) {
    if (!this.canConfigure() || this.unavailable() || !this.graphics) return;
    if (this.snapshot.quality === value && !this.options?.diagnostics.mobileQuality) return;
    try {
      if (this.options) this.options.diagnostics.mobileQuality = false;
      this.graphics.configure(value, this.mobile());
      this.frameTimes = [];
      this.publish({ quality: value });
      if (this.simulation) this.draw(this.simulation, performance.now());
    } catch (error) {
      this.fail(error);
    }
  }

  setVolume(value: number) {
    if (this.snapshot.phase === 'disposed' || !Number.isFinite(value)) return;
    this.audio.setLevel(clamp(value, 0, 1), this.snapshot.muted);
    this.publish({ volume: clamp(value, 0, 1) });
  }

  setMuted(value: boolean) {
    if (this.snapshot.phase === 'disposed') return;
    this.audio.setLevel(this.snapshot.volume, value);
    this.publish({ muted: value });
    this.view.muted?.(value);
  }

  showMessage(message: string) {
    this.notice = message;
    this.noticeUntil = performance.now() + 1500;
    this.publish({ message });
  }

  dispose() {
    if (this.snapshot.phase === 'disposed') return;
    this.generation++;
    this.publish({ phase: 'disposed' });
    this.release();
    this.listeners.clear();
  }

  private release() {
    clearTimeout(this.contextRecoveryTimer);
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.events.abort();
    this.input?.dispose();
    this.audio.stop();
    this.simulation = undefined;
    this.graphics?.dispose();
    this.graphics = undefined;
    this.audio.dispose();
    this.recorder?.canvas.remove();
    this.recorder = undefined;
  }

  private fail(error: unknown) {
    if (this.snapshot.phase === 'disposed') return;
    this.generation++;
    this.release();
    this.publish({ phase: error instanceof UnsupportedGraphics ? 'unsupported' : 'error',
      error: Object.freeze({ kind: 'graphics', message: error instanceof Error ? error.message : 'Could not load the game.' }) });
  }

  private loadVolume(id: VolumeId) {
    const flags = this.options!.diagnostics;
    const volume = volumeById(id);
    const graphics = this.graphics!;
    const mode = this.snapshot.mode;
    const sim = this.simulation = new Simulation(volume, flags, undefined, mode);
    graphics.load(volume, sim.path, mode);
    if (flags.fixedTime === null) {
      this.draw(this.simulation, performance.now());
      graphics.prepare();
    }
    this.visualDebt = 0;
    this.lastFrame = 0;
  }

  private capture(seconds: number) {
    const sim = this.simulation!;
    const flags = this.options!.diagnostics;
    const graphics = this.graphics!;
    sim.start(this.snapshot.difficulty, this.options?.runSeed ?? CAPTURE_RUN_SEED, undefined, this.snapshot.mode);
    const time = Math.min(seconds, sim.volume.beats * sim.secondsPerBeat + 10);
    const steps = Math.floor(time / STEP);
    const input = flags.boost ? { ...idleInput, boosting: true } : idleInput;
    const advance = (dt: number) => {
      sim.step(dt, input);
      graphics.update(sim, true);
    };
    for (let i = 0; i < steps; i++) advance(STEP);
    if (time - steps * STEP > 0) advance(time - steps * STEP);
    if (time === 0) graphics.update(sim, true);
    this.publishRun({ phase: sim.phase });
    this.draw(sim, performance.now(), false);
  }

  private canConfigure() {
    return this.snapshot.phase === 'menu' || this.snapshot.phase === 'results';
  }

  private unavailable() { return document.hidden || this.contextLost || this.cached; }

  private mobile() {
    return !!this.options?.diagnostics.mobileQuality || window.innerWidth < 860 || matchMedia('(pointer: coarse)').matches;
  }

  private anchorRun(offset: number) {
    this.timeline.anchor(this.silent ? performance.now() / 1000 - offset : this.audio.runOrigin, offset);
    this.lastFrame = 0;
  }

  private async startAudio(sim: Simulation, time: number | ((lead: number) => number), generation: number, resume = false) {
    try {
      return await this.audio.start(sim.volume, time, resume);
    } catch {
      if (generation === this.generation) this.audio.stop(resume);
      return false;
    }
  }

  private schedule() {
    if (this.raf || !this.graphics || this.unavailable() || this.options?.diagnostics.fixedTime != null) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const sim = this.simulation;
    if (!sim || this.unavailable()) return;
    const hadFrame = this.lastFrame !== 0;
    const dt = hadFrame ? (now - this.lastFrame) / 1000 : 0;
    this.lastFrame = now;
    const fixed = this.options?.diagnostics.fixedTime != null;
    try {
      if (!fixed) {
        let catchingUp = false;
        if (this.snapshot.phase === 'playing') {
          const target = this.timeline.at(now / 1000);
          const debt = target - this.clock.elapsed;
          if ((dt >= RECOVERY_GAP || !hadFrame) && debt >= RECOVERY_GAP - STEP) this.recoveryUntil = target;
          catchingUp = this.clock.consume(target, () => {
            this.step(sim, this.clock.elapsed - STEP / 2 <= this.recoveryUntil);
            return sim.phase === 'playing';
          }) === 'catching-up';
          this.recovering = catchingUp && target - this.clock.elapsed >= 2;
          if (sim.phase === 'crash') {
            this.generation++;
            this.audioPending = false;
            this.audio.stop();
            this.input?.clear();
            this.publishRun({ phase: 'crash' });
          }
        } else if (this.snapshot.phase === sim.phase) {
          this.visualDebt += Math.min(dt, STEP * MAX_STEPS);
          while (this.visualDebt >= STEP) {
            this.visualDebt -= STEP;
            this.step(sim);
          }
          if (this.snapshot.phase !== sim.phase) {
            this.publishRun({ phase: sim.phase });
            const options = this.options!;
            if (sim.mode === 'standard' && sim.gatesNeutralized === 0 && sim.score > options.best) {
              options.best = Math.floor(sim.score);
              this.view.best?.(options.best);
            }
          }
        }
        if (now >= this.nextPublish) {
          this.nextPublish = now + 80;
          this.publishRun();
        }
        if (this.snapshot.phase !== 'paused') this.trackFrame(dt);
        if (!catchingUp) this.draw(sim, now);
      }
      this.schedule();
    } catch (error) {
      this.fail(error);
    }
  };

  private step(sim: Simulation, neutralize = false) {
    const input = neutralize ? this.lastInput : this.input?.read() ?? idleInput;
    if (!neutralize) this.lastInput = { ...input, target: null, dragX: 0, dragY: 0 };
    const { lives, pickup, branch, gatesNeutralized, encore } = sim;
    sim.step(STEP, input, neutralize);
    this.input?.moveReticle(input, sim.camera.tx, sim.camera.ty, sim.steeringWidth);
    if (this.pendingPickupDraw && sim.pickup && sim.distance >= sim.pickupPreviewStation) {
      this.pickupDeck.consume();
      this.pendingPickupDraw = false;
    }
    if (sim.gatesNeutralized > gatesNeutralized) {
      this.showMessage(sim.mode === 'standard' ? 'RECOVERY · BEST INELIGIBLE' : 'GATE NEUTRALIZED DURING RECOVERY');
    }
    if (lives !== sim.lives || pickup !== sim.pickup || branch !== sim.branch || encore !== sim.encore ||
      sim.routeGuide !== this.snapshot.routeHint) this.publishRun();
  }

  private draw(sim: Simulation, now: number, updateScene = true) {
    const graphics = this.graphics;
    if (!graphics || this.contextLost) return;
    const fixed = this.options?.diagnostics.fixedTime != null;
    // Leave the last frame in place behind the pause UI; keep servicing the pointer.
    const paused = this.snapshot.phase === 'paused';
    const locked = !paused && graphics.draw(sim, fixed, updateScene);
    if (this.input) {
      this.input.pointer.locked = locked && this.snapshot.phase === 'playing';
      this.view.pointer(this.input.pointer);
    }
    if (!paused) {
      const hit = Math.max(0, 1 - (sim.time - sim.hitTime) / 0.38);
      const end = !sim.outroPlan && (sim.phase === 'playing' || sim.phase === 'crash')
        ? clamp((sim.beat - (sim.volume.beats - 12)) / 12, 0, 1) : 0;
      const start = sim.phase === 'playing' ? Math.max(0, 1 - sim.time / 0.26) : 0;
      const pickup = Math.max(0, 1 - (sim.time - sim.pickupTime) / 0.24) * 0.13;
      const flash = Math.max(hit * 0.9, end * 0.95, start * 0.9);
      this.view.flash(sim.phase === 'results' ? 0 : Math.max(flash, pickup),
        hit ? '#ff5a5a' : pickup > flash ? '#74ffdc' : '#fff');
    }
    if (this.recorder && graphics.camera) {
      this.recorder.sample(now / 1000, graphics.camera, sim, sim.camera);
      this.recorder.draw();
    }
    if (this.options?.diagnostics.debug && (fixed || now >= this.nextDebug)) {
      this.nextDebug = now + 80;
      this.view.debug(JSON.stringify({ ...graphics.metrics(), phase: this.snapshot.phase, beat: sim.beat,
        distance: sim.distance, camera: sim.camera, speed: sim.speed, hitCount: sim.hits, pickup: sim.pickup,
        branch: sim.branch, trackDistance: sim.trackDistance, neutralized: sim.gatesNeutralized,
        outroPhase: sim.outroPlan && sim.outroPhase, encore: sim.encore,
        audio: this.audio.diagnostics,
        initMs: this.initMs, switchMs: this.switchMs }));
    }
  }

  private trackFrame(dt: number) {
    if (!dt) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length === 180) {
      if (this.frameTimes.sort((a, b) => a - b)[90] > 1 / 38) this.graphics?.reduceResolution();
      this.frameTimes.length = 0;
    }
  }

  private resizeGraphics() {
    if (this.contextLost) return;
    this.graphics?.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    if (this.simulation && this.options?.diagnostics.fixedTime != null) this.draw(this.simulation, performance.now());
  }

  private resize = () => {
    try {
      this.resizeGraphics();
      // A canvas resize clears the frozen frame, so draw it once at the new size.
      if (!this.contextLost && this.simulation && this.snapshot.phase === 'paused') this.graphics?.draw(this.simulation, true);
    } catch (error) {
      this.fail(error);
    }
  };

  private watchDpr() {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener('change', () => {
      this.resize();
      if (!this.events.signal.aborted) this.watchDpr();
    }, { once: true, signal: this.events.signal });
  }

  private surfaceChanged = () => {
    this.lastFrame = 0;
    this.visualDebt = 0;
    this.frameTimes = [];
    if (this.unavailable()) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.pause(this.contextLost ? 'context' : 'background');
      return;
    }
    if (this.snapshot.phase === 'paused' &&
      (this.snapshot.pauseReason === 'context' || this.snapshot.pauseReason === 'background')) void this.resume();
    this.schedule();
  };

  private attach(canvas: HTMLCanvasElement) {
    const { signal } = this.events;
    window.addEventListener('resize', this.resize, { signal });
    this.watchDpr();
    document.addEventListener('visibilitychange', this.surfaceChanged, { signal });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.contextLost = true;
      this.surfaceChanged();
      // Detach Three's disposal callbacks before the restored context owns new GL handles.
      this.graphics?.releaseSurface();
      this.publish({ error: Object.freeze({ kind: 'graphics', message: 'Graphics were interrupted. Waiting for WebGL to recover.' }) });
      clearTimeout(this.contextRecoveryTimer);
      this.contextRecoveryTimer = setTimeout(() => {
        if (this.contextLost) this.fail(new Error('WebGL did not recover. Reload to start a new run.'));
      }, 8000);
    }, { signal });
    canvas.addEventListener('webglcontextrestored', () => {
      clearTimeout(this.contextRecoveryTimer);
      try {
        const sim = this.simulation;
        if (!sim) return;
        this.graphics?.restore(sim.volume);
        this.contextLost = false;
        this.resizeGraphics();
        this.graphics?.warmSurface(sim, this.options?.diagnostics.fixedTime != null);
        this.publish({ error: null });
        this.surfaceChanged();
      } catch (error) {
        this.fail(error);
      }
    }, { signal });
    window.addEventListener('pagehide', event => {
      if (event.persisted) {
        this.cached = true;
        this.surfaceChanged();
      } else this.dispose();
    }, { signal });
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      this.cached = false;
      this.surfaceChanged();
    }, { signal });
  }

  private toggleRecorder() {
    if (!this.graphics) return;
    this.recorder ??= new Recorder(this.graphics.renderer.domElement.parentElement ?? document.body);
    this.recorder.toggle();
  }

  private keydown = (key: string, event: KeyboardEvent) => {
    if (this.view.key?.(key, event)) return true;
    if (event.repeat || event.target instanceof HTMLInputElement) return false;
    if ((key === ' ' || key === 'enter') && !(event.target instanceof HTMLButtonElement)) {
      if (this.canConfigure()) {
        event.preventDefault();
        void this.start();
        return true;
      }
    } else if (key === 'escape') {
      this.returnToMenu();
      return true;
    } else if (key === 'p') {
      if (this.snapshot.phase === 'paused') void this.resume();
      else this.pause('user');
      return true;
    } else if (key === 'm') {
      this.setMuted(!this.snapshot.muted);
      this.showMessage(this.snapshot.muted ? 'MUTED' : 'SOUND ON');
      return true;
    } else if (key === 'r') {
      if (event.shiftKey) this.recorder?.download();
      else this.toggleRecorder();
      return true;
    }
    return false;
  };

  private publishRun(patch?: Partial<GameSnapshot>) {
    const sim = this.simulation;
    if (!sim) return;
    this.publish({ score: Math.floor(sim.score), lives: sim.lives, maxLives: sim.maxLives,
      gatesPassed: sim.gatesPassed, gatesTotal: sim.gatesTotal, combo: sim.combo, maxCombo: sim.maxCombo,
      speed: sim.speed, progress: sim.progress, section: sim.section, result: sim.result,
      outroPhase: sim.outroPlan && sim.outroPhase, encore: sim.encore,
      boosting: this.snapshot.phase === 'playing' && sim.boosting,
      shield: sim.shield, resonance: sim.resonance,
      route: sim.route, routeHint: sim.routeGuide,
      message: this.recovering ? 'RECOVERING FLIGHT' : performance.now() < this.noticeUntil ? this.notice : sim.message,
      hint: this.snapshot.phase === 'playing' && sim.beat < 15, ...patch });
  }

  private publish(patch: Partial<GameSnapshot>) {
    const keys = Object.keys(patch) as (keyof GameSnapshot)[];
    if (!keys.some(key => !Object.is(this.snapshot[key], patch[key]))) return;
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch });
    for (const listener of this.listeners) listener();
  }
}
