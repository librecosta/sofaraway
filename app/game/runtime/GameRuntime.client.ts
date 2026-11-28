import { initialSnapshot } from '../contracts';
import type { GameError, GameOptions, GameRuntime, GameSnapshot, Difficulty, ExperienceMode, PauseReason, PlayerMessage, QualityTier, VolumeId } from '../contracts';
import type { RouteKind } from '../core/branches';
import { FixedStepClock, MAX_STEPS, RECOVERY_GAP, RunTimeline, STEP } from '../core/clock';
import { clamp } from '../core/collision';
import { resolveDifficulty, supportsDifficulty } from '../core/difficulty';
import { idleInput } from '../core/input';
import { PickupDeck } from '../core/pickups';
import { referenceFor } from '../core/reference-track';
import { approachDynamicLights, dynamicLightEnvelope, steadyLights } from '../core/rhythmic-lights';
import { resolveRunPolicy } from '../core/run-policy';
import type { RunPolicy } from '../core/run-policy';
import { createRunSeed } from '../core/run-seed';
import { Simulation } from '../core/simulation';
import { ShowcasePilot } from '../core/showcase-pilot';
import { hasAuthoredAudio, volumeById } from '../core/volumes';
import { AudioTransport } from '../audio/transport.client';
import { Graphics, UnsupportedGraphics } from '../graphics/scene.client';
import { Recorder } from '../debug/recorder.client';
import { InputController } from './input.client';
import type { PointerView } from './input.client';
import { ImmersiveMouse } from './immersive-mouse.client';
import { recordFor, RunRecordStore } from './records.client';
import { observeScreenOrientation } from './screen-orientation.client';
import type { PlayerSurface, PlayerSurfaceState } from './player-surface';

export interface RuntimeView {
  pointer(view: PointerView): void;
  flash(opacity: number, color: string, daylight?: number): void;
  debug?(text: string): void;
  key?(key: string, event: KeyboardEvent): boolean;
  muted?(value: boolean): void;
}

const audioError: GameError = Object.freeze({
  kind: 'audio', message: 'audioStartFailed',
});
const recoveringNotice: PlayerMessage = Object.freeze({ id: 'recoveringFlight' });

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
  private showcasePilot?: ShowcasePilot;
  private loadedWithDiagnostics = false;
  private input?: InputController;
  private immersiveMouse?: ImmersiveMouse;
  #recorder?: Recorder;
  private options?: GameOptions;
  private readonly recordStore: RunRecordStore;
  private activeRun?: { readonly policy: RunPolicy; submitted: boolean };
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
  #nextDebug = 0;
  private frameTimes: number[] = [];
  private contextLost = false;
  private contextRecoveryTimer?: ReturnType<typeof setTimeout>;
  private cached = false;
  #initMs = 0;
  #switchMs = 0;
  private notice: PlayerMessage | null = null;
  private noticeUntil = 0;
  private lightAmount = 0;
  private lightStamp = 0;
  private lightMotion?: MediaQueryList;
  private readonly lightInput = { beat: 0, rhythmBeat: 0, orbitAmount: 0, reducedMotion: false, dynamics: { ...steadyLights } };
  private lightTime = 0;

  private surfaceState?: PlayerSurfaceState;

  constructor(private readonly view: RuntimeView, namespace?: string, private readonly surface?: PlayerSurface) {
    this.recordStore = new RunRecordStore(namespace);
  }

  private get captureTime() {
    return typeof __PLAYER_ONLY_TOY__ === 'undefined' ? this.options?.diagnostics?.fixedTime ?? null : null;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    if (this.snapshot.phase === 'disposed') return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  async initialize(canvas: HTMLCanvasElement, options: GameOptions) {
    if (this.snapshot.phase !== 'uninitialized') return;
    const begin = typeof __PLAYER_ONLY_TOY__ === 'undefined' ? performance.now() : 0;
    const generation = this.generation;
    this.options = options;
    this.lightAmount = Number(!!options.dynamicLights);
    this.lightMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const difficulty = resolveDifficulty(options.volumeId, options.difficulty);
    this.publish({ phase: 'initializing', volumeId: options.volumeId, difficulty,
      mode: options.mode, showcaseRoute: options.showcaseRoute ?? 'main',
      quality: options.quality, volume: options.volume, muted: options.muted,
      dynamicLights: !!options.dynamicLights,
      immersiveMouse: options.immersiveMouse ?? initialSnapshot.immersiveMouse,
      autoBoost: options.autoBoost === true,
      localRecord: this.menuRecord(options.volumeId, difficulty, options.mode) });
    if (generation !== this.generation) return;
    try {
      const diagnostics = typeof __PLAYER_ONLY_TOY__ === 'undefined' ? options.diagnostics : undefined;
      this.graphics = new Graphics(canvas, options.quality, this.mobile(), diagnostics);
      this.input = new InputController(canvas, () => this.snapshot.phase === 'playing' && this.snapshot.mode !== 'showcase', this.keydown,
        diagnostics?.cursor, options.compactViewport || !!this.surface);
      this.immersiveMouse = new ImmersiveMouse(canvas, active => {
        this.input?.setImmersive(active);
        if (active && this.snapshot.phase === 'playing') this.alignImmersiveReticle();
      }, () => this.pause('pointer-lock'));
      if (typeof __PLAYER_ONLY_TOY__ === 'undefined' && diagnostics?.record) this.#toggleRecorder();
      this.attach(canvas);
      this.resizeGraphics();
      this.audio.setLevel(options.volume, options.muted);
      this.loadVolume();
      if (typeof __PLAYER_ONLY_TOY__ === 'undefined') this.#initMs = performance.now() - begin;
      this.publish({ phase: 'menu', section: this.simulation!.section });
      if (typeof __PLAYER_ONLY_TOY__ === 'undefined' && diagnostics) {
        if (diagnostics.fixedTime !== null) this.#capture(diagnostics.fixedTime);
        else if (diagnostics.autoplay) void this.start(!navigator.userActivation?.hasBeenActive);
      }
      this.schedule();
    } catch (error) {
      this.fail(error);
    }
  }

  async start(silent = false, gesture?: Event) {
    const phase = this.snapshot.phase;
    let sim = this.simulation;
    if (!sim || this.unavailable() || (phase !== 'menu' && phase !== 'results')) return;
    const silentFallback = silent && this.snapshot.error?.kind === 'audio';
    const generation = ++this.generation;
    const policy = resolveRunPolicy(this.snapshot, this.options!, 'run');
    const { volumeId, mode, difficulty, showcaseRoute } = policy;
    this.publish({ phase: 'starting', error: null });
    if (generation !== this.generation) return;
    this.requestImmersiveMouse(gesture);
    const reference = referenceFor(sim.volume, policy.referenceDifficulty);
    if (sim.volume.id !== volumeId || (sim.modeSpecificPath && sim.mode !== mode) || sim.reference !== reference ||
      this.loadedWithDiagnostics !== policy.allowSimulationDiagnostics) {
      // Unlock within the initiating gesture and let the menu paint STARTING before building.
      if (!silent) this.primeAudio();
      await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (generation !== this.generation) return;
      if (this.unavailable()) {
        this.immersiveMouse?.release();
        this.publish({ phase });
        return;
      }
      try {
        this.loadVolume(policy);
        sim = this.simulation!;
      } catch (error) {
        this.fail(error);
        return;
      }
    }
    if (!silent && !await this.startAudio(sim, 0, generation)) {
      if (generation === this.generation) {
        this.immersiveMouse?.release();
        this.publish({ phase, error: audioError });
      }
      return;
    }
    if (generation !== this.generation) return;
    if (this.unavailable()) {
      this.immersiveMouse?.release();
      this.audio.stop();
      this.publish({ phase });
      return;
    }
    this.input?.clear();
    this.noticeUntil = 0;
    this.clock.reset();
    this.pausedAt = this.recoveryUntil = 0;
    this.lightTime = 0;
    this.recovering = false;
    this.lastInput = idleInput;
    this.silent = silent;
    if (silent) {
      this.audio.resetDiagnostics();
      if (silentFallback) this.audio.diagnostics.silentFallbacks++;
    }
    try {
      const seed = policy.seed ?? createRunSeed();
      this.pendingPickupDraw = policy.seed === undefined && !!sim.gameplay.pickup;
      sim.start(difficulty, seed, this.pendingPickupDraw ? this.pickupDeck.peek(seed) : undefined, mode, policy.scoring);
      this.activeRun = { policy: { ...policy, seed }, submitted: false };
      this.showcasePilot = showcaseRoute ? new ShowcasePilot(sim, showcaseRoute) : undefined;
      if (silent) this.graphics?.warmSurface(sim, false, this.lighting(sim));
    } catch (error) {
      this.fail(error);
      return;
    }
    this.anchorRun(0);
    this.alignImmersiveReticle();
    this.publishRun({ phase: 'playing', pauseReason: null, error: null, soundUnavailable: false, newBest: false });
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
      this.pausedAt = this.runTime(performance.now() / 1000);
      if (this.pausedAt - this.clock.elapsed >= RECOVERY_GAP) this.recoveryUntil = this.pausedAt;
    }
    this.audio.stop(true);
    this.immersiveMouse?.release();
    this.input?.clear();
    this.lastInput = idleInput;
    this.view.flash(0, '#fff');
    this.publishRun({ phase: 'paused', pauseReason: reason, error: null, boosting: false });
  }

  async resume(silent = this.silent, gesture?: Event) {
    const sim = this.simulation;
    if (!sim || this.snapshot.phase !== 'paused' || this.resumePending || this.unavailable()) return;
    this.resumePending = true;
    const generation = ++this.generation;
    this.requestImmersiveMouse(gesture);
    const restored = !silent && await this.startAudio(sim, this.pausedAt, generation, true);
    if (generation !== this.generation) return;
    this.resumePending = false;
    if (this.unavailable()) {
      this.immersiveMouse?.release();
      this.audio.stop(true);
      return;
    }
    this.silent = !restored;
    if (!silent && !restored) this.audio.diagnostics.silentFallbacks++;
    this.anchorRun(this.pausedAt);
    this.alignImmersiveReticle();
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
    if (this.snapshot.phase === 'menu' && this.snapshot.error?.kind === 'audio') {
      this.publish({ error: null });
      return;
    }
    if (!['starting', 'playing', 'paused', 'crash', 'results'].includes(this.snapshot.phase)) return;
    this.generation++;
    this.resumePending = false;
    this.audioPending = false;
    this.audio.stop();
    this.immersiveMouse?.release();
    this.input?.clear();
    this.pendingPickupDraw = false;
    this.showcasePilot = undefined;
    this.activeRun = undefined;
    this.simulation?.returnToMenu();
    this.view.flash(0, '#fff');
    this.publish({ phase: 'menu', error: this.contextLost ? this.snapshot.error : null,
      pauseReason: null, result: null, hint: false, boosting: false, shield: false, resonance: 0, soundUnavailable: false,
      outroPhase: undefined, encore: undefined, newBest: false,
      route: null, routeHint: null,
      localRecord: this.menuRecord(this.snapshot.volumeId, this.snapshot.difficulty, this.snapshot.mode) });
    // Release the run-only visuals even if the next menu frame has not painted yet.
    if (this.simulation && !this.unavailable()) {
      try {
        this.graphics?.update(this.simulation, false, this.lighting(this.simulation));
      } catch (error) {
        this.fail(error);
      }
    }
  }

  async selectVolume(id: VolumeId) {
    if (!this.canConfigure() || this.contextLost || this.cached || id === this.snapshot.volumeId) return;
    const begin = typeof __PLAYER_ONLY_TOY__ === 'undefined' ? performance.now() : 0;
    if (this.snapshot.phase === 'results') this.returnToMenu();
    const { mode } = this.snapshot;
    const difficulty = resolveDifficulty(id, this.snapshot.difficulty);
    this.publish({ volumeId: id, difficulty, error: null, newBest: false,
      localRecord: this.menuRecord(id, difficulty, mode) });
    if (typeof __PLAYER_ONLY_TOY__ === 'undefined') this.#switchMs = performance.now() - begin;
    // Fixed-time diagnostics render the requested volume immediately.
    if (typeof __PLAYER_ONLY_TOY__ === 'undefined' && this.captureTime !== null) {
      try {
        this.loadVolume();
        this.#capture(this.captureTime);
      } catch (error) {
        this.fail(error);
      }
    }
  }

  setDifficulty(value: Difficulty) {
    const { volumeId, mode } = this.snapshot;
    if (this.snapshot.phase === 'menu' && mode === 'standard' && supportsDifficulty(volumeId, value)) {
      this.publish({ difficulty: value, localRecord: this.menuRecord(volumeId, value, mode) });
    }
  }

  setMode(value: ExperienceMode) {
    if (this.snapshot.phase !== 'menu' || this.snapshot.mode === value) return;
    const { volumeId, difficulty } = this.snapshot;
    this.publish({ mode: value, localRecord: this.menuRecord(volumeId, difficulty, value) });
  }

  setShowcaseRoute(value: RouteKind) {
    if (this.snapshot.phase === 'menu' && this.snapshot.mode === 'showcase') this.publish({ showcaseRoute: value });
  }

  async setQuality(value: QualityTier) {
    if (!this.canConfigure() || this.unavailable() || !this.graphics) return;
    const forcedMobile = typeof __PLAYER_ONLY_TOY__ === 'undefined' && this.options?.diagnostics?.mobileQuality;
    if (this.snapshot.quality === value && !forcedMobile) return;
    try {
      if (typeof __PLAYER_ONLY_TOY__ === 'undefined' && this.options?.diagnostics) this.options.diagnostics.mobileQuality = false;
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

  primeAudio() { this.audio.unlock(); }

  playUiCue(cue: 'hover' | 'press') { this.audio.playUiCue(cue); }

  setDynamicLights(value: boolean) {
    if (this.snapshot.phase !== 'disposed') this.publish({ dynamicLights: value });
  }

  setImmersiveMouse(value: boolean) {
    if (this.snapshot.phase === 'disposed') return;
    if (!value && this.immersiveMouse?.engaged) {
      this.immersiveMouse.release();
      this.input?.clear();
      this.lastInput = idleInput;
      this.publish({ boosting: false });
    }
    this.publish({ immersiveMouse: value });
  }

  setAutoBoost(value: boolean) {
    if (this.snapshot.phase === 'menu' || this.snapshot.phase === 'results') this.publish({ autoBoost: value });
  }

  private requestImmersiveMouse(gesture?: Event) {
    const diagnosticRun = typeof __PLAYER_ONLY_TOY__ === 'undefined' &&
      (this.captureTime !== null || this.options?.diagnostics?.autoplay);
    if (this.snapshot.immersiveMouse && this.snapshot.mode !== 'showcase' && !diagnosticRun) {
      this.immersiveMouse?.request(gesture);
    }
  }

  private alignImmersiveReticle() {
    const sim = this.simulation;
    if (sim) this.input?.alignImmersiveReticle(sim.camera.tx, sim.camera.ty, sim.steeringWidth);
  }

  private lighting(sim: Simulation, renderTime?: number) {
    this.lightInput.beat = sim.beat;
    const menu = sim.phase === 'menu';
    const volume = menu ? volumeById(this.snapshot.volumeId) : sim.volume;
    const beatSeconds = 60 / volume.bpm;
    this.lightTime = menu ? volume.sections[0].beats * beatSeconds + sim.time % (8 * beatSeconds)
      : renderTime ?? (this.snapshot.phase === 'paused' ? this.lightTime : sim.time);
    this.lightInput.rhythmBeat = this.lightTime / beatSeconds;
    this.lightInput.reducedMotion = this.lightMotion?.matches ?? false;
    this.lightInput.orbitAmount = volume.id === 'orbit' ? this.lightAmount : 0;
    const dynamics = this.lightInput.dynamics;
    if (this.lightAmount && !this.lightInput.reducedMotion) dynamicLightEnvelope(volume, this.lightTime, this.lightAmount, false, dynamics);
    else Object.assign(dynamics, steadyLights);
    return this.lightInput;
  }

  showMessage(message: PlayerMessage) {
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
    this.immersiveMouse?.dispose();
    this.input?.dispose();
    this.audio.stop();
    this.simulation = undefined;
    this.activeRun = undefined;
    this.graphics?.dispose();
    this.graphics = undefined;
    this.audio.dispose();
    if (typeof __PLAYER_ONLY_TOY__ === 'undefined') {
      this.#recorder?.canvas.remove();
      this.#recorder = undefined;
    }
  }

  private fail(error: unknown, kind: GameError['kind'] = 'graphics', stage?: GameError['stage']) {
    if (this.snapshot.phase === 'disposed') return;
    this.generation++;
    this.release();
    const unsupported = error instanceof UnsupportedGraphics;
    const message = unsupported ? error.reason
      : stage === 'recovery' ? 'contextFailed' : kind === 'graphics' ? 'graphicsInitFailed' : 'gameLoadFailed';
    if (typeof __PLAYER_ONLY_TOY__ === 'undefined' && this.options?.diagnostics?.debug) this.view.debug?.(String(error));
    this.publish({ phase: unsupported ? 'unsupported' : 'error', error: Object.freeze({ kind, stage, message }) });
  }

  private menuRecord(id: VolumeId, difficulty: Difficulty, mode: ExperienceMode) {
    return mode === 'showcase' || !this.options?.saveRecords ? initialSnapshot.localRecord
      : recordFor(this.recordStore.read(), id, difficulty, mode);
  }

  private loadVolume(policy = resolveRunPolicy(this.snapshot, this.options!,
    this.captureTime === null ? 'menu' : 'capture')) {
    const volume = volumeById(policy.volumeId);
    const graphics = this.graphics!;
    const diagnostics = typeof __PLAYER_ONLY_TOY__ === 'undefined' && policy.allowSimulationDiagnostics
      ? this.options!.diagnostics : undefined;
    const sim = this.simulation = new Simulation(volume, diagnostics,
      undefined, policy.mode, policy.referenceDifficulty);
    this.loadedWithDiagnostics = policy.allowSimulationDiagnostics;
    graphics.load(volume, sim.path, policy.mode);
    if (this.captureTime === null) {
      this.draw(this.simulation, performance.now());
      graphics.prepare();
    }
    this.visualDebt = 0;
    this.lastFrame = 0;
  }

  #capture(seconds: number) {
    if (typeof __PLAYER_ONLY_TOY__ !== 'undefined') return;
    const sim = this.simulation!;
    const graphics = this.graphics!;
    const policy = resolveRunPolicy(this.snapshot, this.options!, 'capture');
    sim.start(policy.difficulty, policy.seed, undefined, policy.mode, policy.scoring);
    const pilot = policy.showcaseRoute ? new ShowcasePilot(sim, policy.showcaseRoute) : undefined;
    const time = Math.min(seconds, sim.volume.beats * sim.secondsPerBeat + 10);
    const steps = Math.floor(time / STEP);
    const input = policy.captureBoost ? { ...idleInput, boosting: true } : idleInput;
    const advance = (dt: number) => {
      sim.step(dt, pilot && sim.phase === 'playing' ? pilot.input(sim) : input);
      graphics.update(sim, true, this.lighting(sim));
    };
    for (let i = 0; i < steps; i++) advance(STEP);
    if (!pilot && time - steps * STEP > 0) advance(time - steps * STEP);
    if (time === 0) graphics.update(sim, true, this.lighting(sim));
    this.publishRun({ phase: sim.phase });
    this.draw(sim, performance.now(), false);
  }

  private canConfigure() {
    return this.snapshot.phase === 'menu' || this.snapshot.phase === 'results';
  }

  private unavailable() {
    return document.hidden || this.contextLost || this.cached ||
      (this.surfaceState !== undefined && this.surfaceState.lifecycle !== 'active');
  }

  private mobile() {
    return (typeof __PLAYER_ONLY_TOY__ === 'undefined' && !!this.options?.diagnostics?.mobileQuality) ||
      window.innerWidth < 860 || matchMedia('(pointer: coarse)').matches;
  }

  private anchorRun(offset: number) {
    this.timeline.anchor(this.silent ? performance.now() / 1000 - offset : this.audio.runOrigin, offset);
    this.lastFrame = 0;
  }

  private runTime(now: number) {
    if (this.simulation && hasAuthoredAudio(this.simulation.volume) && !this.silent) {
      const position = this.audio.time;
      if (typeof position === 'number') {
        // Keep the silent fallback aligned if the device stops advancing its audio clock.
        this.timeline.anchor(now - position, position);
        return Math.max(this.clock.elapsed, position);
      }
    }
    return Math.max(this.clock.elapsed, this.timeline.at(now));
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
    if (this.raf || !this.graphics || this.unavailable() || this.captureTime !== null) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const sim = this.simulation;
    if (!sim || this.unavailable()) return;
    const hadFrame = this.lastFrame !== 0;
    const dt = hadFrame ? (now - this.lastFrame) / 1000 : 0;
    this.lastFrame = now;
    const fixed = this.captureTime !== null;
    try {
      if (!fixed) {
        if (this.snapshot.phase === 'menu' && sim.volume.id !== this.snapshot.volumeId) {
          this.loadVolume();
          if (typeof __PLAYER_ONLY_TOY__ === 'undefined') this.#switchMs = performance.now() - now;
          this.schedule();
          return;
        }
        let catchingUp = false;
        if (this.snapshot.phase === 'playing') {
          const target = this.runTime(now / 1000);
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
            if (sim.result?.title === 'ESCAPED') this.audio.finish();
            else this.audio.stop();
            this.immersiveMouse?.release();
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
            this.finishRecord(sim);
            this.publishRun({ phase: sim.phase });
          }
        }
        if (now >= this.nextPublish) {
          this.nextPublish = now + 80;
          this.publishRun();
        }
        if (this.snapshot.phase !== 'paused' && this.snapshot.phase !== 'starting') this.trackFrame(dt);
        if (!catchingUp) this.draw(sim, now);
      }
      this.schedule();
    } catch (error) {
      this.fail(error, 'runtime');
    }
  };

  private finishRecord(sim: Simulation) {
    const result = sim.result;
    const run = this.activeRun;
    if (!result || !run?.policy.recordsEligible || run.submitted) return;
    run.submitted = true;
    const { volumeId: volume, difficulty, mode } = run.policy;
    const last = {
      score: Math.floor(sim.score), outcome: result.title,
      ...(result.encore ? { encoreBonus: result.encore.bonusScore } : {}),
      ...(result.neutralized || result.encore?.neutralized ? { recovery: true } : {}),
    };
    void this.recordStore.commitRunRecord({ volume, difficulty, mode, last }).then(saved => {
      if (!saved) return;
      const snapshot = this.snapshot;
      if (this.activeRun === run && snapshot.phase === 'results') this.publish(saved);
      else if (snapshot.phase === 'menu' && snapshot.volumeId === volume && snapshot.mode === mode &&
        (mode === 'sightseeing' || snapshot.difficulty === difficulty)) {
        this.publish({ localRecord: this.menuRecord(volume, difficulty, mode) });
      }
    });
  }

  private step(sim: Simulation, neutralize = false) {
    const pilot = this.showcasePilot;
    let input = pilot ? (sim.phase === 'playing' ? pilot.input(sim) : idleInput)
      : neutralize ? this.lastInput : this.input?.read() ?? idleInput;
    if (sim.phase === 'playing' && this.activeRun?.policy.autoBoost && !input.boosting) input = { ...input, boosting: true };
    if (!pilot && !neutralize) this.lastInput = { ...input, target: null, dragX: 0, dragY: 0 };
    const { lives, pickup, branch, gatesNeutralized, encore } = sim;
    sim.step(STEP, input, !pilot && neutralize);
    if (!pilot) this.input?.moveReticle(input, sim.camera.tx, sim.camera.ty, sim.steeringWidth);
    if (this.pendingPickupDraw && sim.pickupVisible) {
      this.pickupDeck.consume();
      this.pendingPickupDraw = false;
    }
    if (sim.gatesNeutralized > gatesNeutralized) {
      this.showMessage({ id: sim.mode === 'standard' ? 'recoveryBestIneligible' : 'gateNeutralized' });
    }
    if (lives !== sim.lives || pickup !== sim.pickup || branch !== sim.branch || encore !== sim.encore ||
      sim.routeGuide !== this.snapshot.routeHint) this.publishRun();
  }

  private draw(sim: Simulation, now: number, updateScene = true) {
    const graphics = this.graphics;
    if (!graphics || this.contextLost) return;
    const fixed = this.captureTime !== null;
    // Leave the last frame in place behind the pause UI; keep servicing the pointer.
    const paused = this.snapshot.phase === 'paused';
    const dt = this.lightStamp ? Math.min(50, Math.max(0, now - this.lightStamp)) : 0;
    this.lightStamp = now;
    if (!paused) {
      this.lightAmount = approachDynamicLights(this.lightAmount, this.snapshot.dynamicLights, dt);
    }
    let renderTime: number | undefined;
    if (!fixed && this.snapshot.phase === 'playing') {
      const seconds = now / 1000;
      const followsAudio = !this.silent && (sim.volume.id === 'descent' || sim.volume.id === 'orbit' || (this.lightAmount > 0 && !this.lightMotion?.matches));
      const phase = this.timeline.at(seconds);
      renderTime = followsAudio ? this.audio.outputTimeAt(seconds) ??
        (hasAuthoredAudio(sim.volume) ? phase : seconds - this.audio.runOrigin) : phase;
      if (this.pausedAt > 0 && renderTime < this.pausedAt) renderTime = this.lightTime;
    }
    const locked = !paused && graphics.draw(sim, fixed, updateScene, this.lighting(sim, renderTime));
    if (this.input) {
      this.input.pointer.locked = locked && this.snapshot.phase === 'playing';
      this.view.pointer(this.input.pointer);
    }
    if (!paused) {
      const hit = Math.max(0, 1 - (sim.time - sim.hitTime) / 0.38);
      const end = sim.escapeWhite;
      const start = sim.phase === 'playing' ? Math.max(0, 1 - sim.time / 0.26) : 0;
      const pickup = Math.max(0, 1 - (sim.time - sim.pickupTime) / 0.24) * 0.13;
      const daylight = !!sim.gameplay.ending;
      if (daylight && end > 0) this.view.flash(end * .99, '#fff', end);
      else {
        const flash = Math.max(hit * 0.9, end * .95, start * 0.9);
        this.view.flash(sim.phase === 'results' && !daylight ? 0 : Math.max(flash, pickup),
          hit ? '#ff5a5a' : pickup > flash ? '#74ffdc' : '#fff', daylight ? end : undefined);
      }
    }
    if (typeof __PLAYER_ONLY_TOY__ === 'undefined' && this.#recorder && graphics.camera) {
      this.#recorder.sample(now / 1000, graphics.camera, sim, sim.camera);
      this.#recorder.draw();
    }
    if (typeof __PLAYER_ONLY_TOY__ === 'undefined' && this.options?.diagnostics?.debug && (fixed || now >= this.#nextDebug)) {
      this.#nextDebug = now + 80;
      this.view.debug?.(JSON.stringify({ ...graphics.metrics(), phase: this.snapshot.phase, beat: sim.beat,
        distance: sim.distance, camera: sim.camera, speed: sim.speed, hitCount: sim.hits, pickup: sim.pickup,
        experience: this.snapshot.mode, difficulty: sim.difficulty, gatesPassed: sim.gatesPassed, gatesTotal: sim.gatesTotal,
        branch: sim.branch, trackDistance: sim.trackDistance, neutralized: sim.gatesNeutralized,
        outroPhase: sim.outroPlan && sim.outroPhase, encore: sim.encore,
        rhythmGain: this.lightInput.dynamics.fixtureGain, dynamics: this.lightInput.dynamics, lightTime: this.lightTime,
        audio: this.audio.diagnostics,
        initMs: this.#initMs, switchMs: this.#switchMs, renderedVolume: sim.volume.id, renderedMode: sim.mode }));
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
    const canvas = this.options?.compactViewport || this.surface ? this.graphics?.renderer.domElement : undefined;
    const width = canvas?.clientWidth || window.innerWidth;
    const height = canvas?.clientHeight || window.innerHeight;
    if (canvas && this.input) {
      this.input.resizeViewport(width, height);
      this.view.pointer(this.input.pointer);
    }
    if (this.contextLost) return;
    this.graphics?.resize(width, height, window.devicePixelRatio || 1);
    if (this.simulation && this.captureTime !== null) this.draw(this.simulation, performance.now());
  }

  private resize = () => {
    try {
      this.resizeGraphics();
      // A canvas resize clears the frozen frame, so draw it once at the new size.
      if (!this.contextLost && this.simulation && this.snapshot.phase === 'paused') {
        this.graphics?.draw(this.simulation, true, true, this.lighting(this.simulation));
      }
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
    if (this.options?.compactViewport || this.surface) {
      const observer = new ResizeObserver(this.resize);
      signal.addEventListener('abort', () => observer.disconnect(), { once: true });
      observer.observe(canvas);
    } else window.addEventListener('resize', this.resize, { signal });
    if (this.options?.compactViewport) {
      observeScreenOrientation(() => { if (!this.surfaceState?.container) this.reorient(); }, signal);
    }
    if (this.surface) {
      const surface = this.surface;
      this.surfaceState = surface.getSnapshot();
      const unsubscribe = surface.subscribe(() => {
        const previous = this.surfaceState!;
        const next = this.surfaceState = surface.getSnapshot();
        if (next.lifecycle === 'closed') {
          this.dispose();
          return;
        }
        const before = previous.container;
        const after = next.container;
        if (before && after && before.orientation !== after.orientation) this.reorient();
        else if (before?.width !== after?.width || before?.height !== after?.height) this.resize();
        if (previous.lifecycle !== next.lifecycle) {
          this.input?.clear();
          this.lastInput = idleInput;
          this.surfaceChanged();
        }
      });
      signal.addEventListener('abort', unsubscribe, { once: true });
    }
    window.addEventListener('blur', () => {
      if (!this.immersiveMouse?.engaged) return;
      if (this.snapshot.phase === 'starting') this.immersiveMouse.release();
      else this.pause('pointer-lock');
    }, { signal });
    this.watchDpr();
    document.addEventListener('visibilitychange', this.surfaceChanged, { signal });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.contextLost = true;
      this.surfaceChanged();
      // Detach Three's disposal callbacks before the restored context owns new GL handles.
      this.graphics?.releaseSurface();
      this.publish({ error: Object.freeze({ kind: 'graphics', message: 'contextPending' }) });
      clearTimeout(this.contextRecoveryTimer);
      this.contextRecoveryTimer = setTimeout(() => {
        if (this.contextLost) this.fail(new Error('WebGL did not recover. Try again to start a new run.'), 'graphics', 'recovery');
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
        this.graphics?.warmSurface(sim, this.captureTime !== null, this.lighting(sim));
        this.publish({ error: null });
        this.surfaceChanged();
      } catch (error) {
        this.fail(error, 'graphics', 'recovery');
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

  private reorient = () => {
    this.input?.clear();
    this.lastInput = idleInput;
    if ((this.surfaceState?.container && this.snapshot.phase === 'starting') ||
        this.snapshot.phase === 'playing' || this.resumePending) this.pause('orientation');
    else if (this.snapshot.phase === 'paused' &&
      (this.snapshot.pauseReason === 'background' || this.snapshot.pauseReason === 'context')) {
      this.publish({ pauseReason: 'orientation' });
    }
    this.resize();
  };

  #toggleRecorder() {
    if (typeof __PLAYER_ONLY_TOY__ !== 'undefined' || !this.graphics) return;
    this.#recorder ??= new Recorder(this.graphics.renderer.domElement.parentElement ?? document.body);
    this.#recorder.toggle();
  }

  private keydown = (key: string, event: KeyboardEvent) => {
    if (this.view.key?.(key, event)) return true;
    if (event.repeat || event.target instanceof HTMLInputElement) return false;
    if (key === 'x' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (this.canConfigure()) {
        event.preventDefault();
        if (event.isTrusted) this.playUiCue('press');
        void this.start(false, event);
        return true;
      }
    } else if (key === 'escape') {
      if (this.immersiveMouse?.active) this.pause('pointer-lock');
      else if (this.snapshot.pauseReason !== 'pointer-lock' && this.snapshot.pauseReason !== 'orientation') this.returnToMenu();
      return true;
    } else if (key === 'p') {
      if (this.snapshot.phase === 'paused') void this.resume(undefined, event);
      else this.pause('user');
      return true;
    } else if (key === 'm') {
      if (this.snapshot.mode === 'showcase' && this.snapshot.phase === 'playing' && (this.silent || this.snapshot.soundUnavailable)) {
        this.setMuted(false);
        this.publish({ soundUnavailable: true });
        void this.enableAudio();
        return true;
      }
      this.setMuted(!this.snapshot.muted);
      this.showMessage({ id: this.snapshot.muted ? 'mutedNotice' : 'soundOn' });
      return true;
    } else if (typeof __PLAYER_ONLY_TOY__ === 'undefined' && key === 'r') {
      if (event.shiftKey) this.#recorder?.download();
      else this.#toggleRecorder();
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
      message: this.recovering ? recoveringNotice : performance.now() < this.noticeUntil ? this.notice : sim.message,
      hint: this.snapshot.phase === 'playing' && sim.beat < 15, ...patch });
  }

  private publish(patch: Partial<GameSnapshot>) {
    const keys = Object.keys(patch) as (keyof GameSnapshot)[];
    if (!keys.some(key => !Object.is(this.snapshot[key], patch[key]))) return;
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch });
    for (const listener of this.listeners) listener();
  }
}
