import type { Object3D, WebGLRenderer } from 'three';
import { PMREMGenerator } from 'three';
import { initialSnapshot } from '../../app/game/contracts';
import type { GameOptions, VolumeId, QualityTier, PlayMode } from '../../app/game/contracts';
import type { RouteSide } from '../../app/game/core/branches';
import { FixedStepClock, STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import type { RunGate } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import type { GateVisual } from '../../app/game/graphics/gates.client';
import { Path } from '../../app/game/graphics/path';
import { PostFX } from '../../app/game/graphics/post.client';
import { Graphics } from '../../app/game/graphics/scene.client';
import { Tunnel } from '../../app/game/graphics/tunnel.client';
import { Runtime } from '../../app/game/runtime/GameRuntime.client';

type Pass = 'scene' | 'depth' | 'dof' | 'bloom' | 'composite';
type GpuScope = Pass | 'frame';
type Values = Record<string, number[]>;
interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

let runtime: Runtime | undefined;
let closingAudio: WeakRef<AudioContext> | undefined;
let canvas: HTMLCanvasElement | undefined;
let graphics: Graphics | undefined;
let cpu: Values = {};
let frames: number[] = [];
let playingFrames = 0;
let frameAt = 0;
let longTasks: PerformanceObserver | undefined;
let gpu: Values = {};
let timing: TimerExtension | null = null;
let sampleGpu: GpuScope | undefined;
let pass: Pass | undefined;
let drawIndex = 0;
let measuring = false;
let rendererCpu = 0;
let disjoint = 0;
const pending: { query: WebGLQuery; scope: GpuScope; frame: number }[] = [];
const bloom = new Map<number, { count: number; ms: number }>();
const scopes: GpuScope[] = ['frame', 'scene', 'depth', 'dof', 'bloom', 'composite'];
const seenRenderers = new WeakSet<WebGLRenderer>();

function add(values: Values, key: string, ms: number) {
  (values[key] ??= []).push(ms);
}

function elapsed<T>(key: string, call: () => T): T {
  if (!measuring) return call();
  const at = performance.now();
  try { return call(); }
  finally { add(cpu, key, performance.now() - at); }
}

function wrap(target: object, method: string, around: (self: unknown, args: unknown[], call: () => unknown) => unknown) {
  const original: (...args: unknown[]) => unknown = Reflect.get(target, method);
  if (typeof original !== 'function') throw new Error(`Missing instrumentation target ${method}`);
  Reflect.set(target, method, function (this: unknown, ...args: unknown[]) {
    return around(this, args, () => Reflect.apply(original, this, args));
  });
}

function time(target: object, method: string, label: string) {
  wrap(target, method, (_self, _args, call) => elapsed(label, call));
}

function pollGpu(drop = false) {
  const gl = graphics?.gl;
  if (!gl || !timing) return;
  const invalid = gl.getParameter(timing.GPU_DISJOINT_EXT) as boolean;
  if (invalid) disjoint++;
  for (let i = pending.length - 1; i >= 0; i--) {
    const { query, scope, frame } = pending[i];
    if (!drop && !invalid && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
    if (!drop && !invalid) {
      const ms = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
      if (scope === 'bloom') {
        const sum = bloom.get(frame) ?? { count: 0, ms: 0 };
        sum.count++;
        sum.ms += ms;
        if (sum.count === 5) { add(gpu, scope, sum.ms); bloom.delete(frame); }
        else bloom.set(frame, sum);
      } else add(gpu, scope, ms);
    }
    gl.deleteQuery(query);
    pending.splice(i, 1);
  }
  if (drop || invalid) bloom.clear();
}

function gpuTime<T>(scope: GpuScope, call: () => T): T {
  const gl = graphics?.gl;
  if (!gl || !timing || sampleGpu !== scope || pending.length >= 24) return call();
  const query = gl.createQuery();
  if (!query) return call();
  gl.beginQuery(timing.TIME_ELAPSED_EXT, query);
  try { return call(); }
  finally {
    gl.endQuery(timing.TIME_ELAPSED_EXT);
    pending.push({ query, scope, frame: drawIndex });
  }
}

function instrumentRenderer(value: Graphics) {
  graphics = value;
  const { renderer, gl } = value;
  if (seenRenderers.has(renderer)) return;
  seenRenderers.add(renderer);
  timing = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  time(gl, 'compileShader', 'glCompile');
  time(gl, 'linkProgram', 'glLink');
  wrap(renderer, 'render', (_self, [scene], call) => {
    const scope = pass ?? ((scene as Object3D & { overrideMaterial?: unknown }).overrideMaterial ? 'depth' : 'scene');
    if (!measuring) return call();
    const at = performance.now();
    try { return pass ? call() : gpuTime(scope, call); }
    finally {
      const ms = performance.now() - at;
      add(cpu, `renderer.${scope}`, ms);
      rendererCpu += ms;
    }
  });
}

time(FixedStepClock.prototype, 'consume', 'simulation');
time(Tunnel.prototype, '_buildChunk', 'chunk');
time(Path.prototype, 'straight', 'pathStep');
time(Path.prototype, 'bend', 'pathStep');
time(PMREMGenerator.prototype, 'fromEquirectangular', 'pmrem');
time(CanvasRenderingContext2D.prototype, 'getImageData', 'canvasRead');
time(CanvasRenderingContext2D.prototype, 'putImageData', 'canvasWrite');
time(Graphics.prototype, 'prepare', 'shaderPrepare');
time(Graphics.prototype, 'update', 'graphicsUpdate');
wrap(Graphics.prototype, 'load', (self, _args, call) => {
  instrumentRenderer(self as Graphics);
  return elapsed('sceneLoad', call);
});
wrap(Graphics.prototype, 'draw', (_self, _args, call) => {
  if (!measuring) return call();
  drawIndex++;
  if (drawIndex % 4 === 0) pollGpu();
  sampleGpu = drawIndex % 4 === 0 ? scopes[Math.floor(drawIndex / 4) % scopes.length] : undefined;
  rendererCpu = 0;
  try { return elapsed('graphicsDraw', () => gpuTime('frame', call)); }
  finally { add(cpu, 'rendererFrame', rendererCpu); sampleGpu = undefined; }
});
wrap(PostFX.prototype, '_pass', (self, [material, target], call) => {
  pass = !target ? 'composite' : material === (self as PostFX).dofMat ? 'dof' : 'bloom';
  try { return gpuTime(pass, call); }
  finally { pass = undefined; }
});

function stats(samples: number[] = []) {
  const ordered = [...samples].sort((a, b) => a - b);
  const pick = (p: number) => ordered.length ? ordered[Math.ceil(p * ordered.length) - 1] : null;
  return { n: ordered.length, p50: pick(0.5), p95: pick(0.95), p99: pick(0.99),
    max: ordered.at(-1) ?? null, total: ordered.reduce((sum, value) => sum + value, 0) };
}

function begin() {
  cpu = {};
  gpu = {};
  frames = [];
  frameAt = 0;
  playingFrames = 0;
  drawIndex = 0;
  disjoint = 0;
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    longTasks = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) add(cpu, 'longTask', entry.duration);
    });
    longTasks.observe({ type: 'longtask' });
  }
  measuring = true;
}

function end() {
  measuring = false;
  pollGpu();
  const unreadyQueries = pending.length;
  pollGpu(true);
  for (const entry of longTasks?.takeRecords() ?? []) add(cpu, 'longTask', entry.duration);
  longTasks?.disconnect();
  longTasks = undefined;
  const summarize = (data: Values) => Object.fromEntries(Object.entries(data).map(([key, samples]) => [key, stats(samples)]));
  const cpuStats = summarize(cpu);
  const frameStats = stats(frames);
  return {
    cpu: { ...cpuStats, frame: stats(cpu.frame), chunk: stats(cpu.chunk), pathStep: stats(cpu.pathStep),
      renderer: stats(cpu.rendererFrame), longTask: cpuStats.longTask ??
      (PerformanceObserver.supportedEntryTypes?.includes('longtask') ? stats() : null) },
    frame: frameStats, fps: frameStats.total ? 1000 * frames.length / frameStats.total : null,
    over50ms: frames.filter(ms => ms > 50).length, playingFrames,
    gpuStatus: !timing || !gpu.frame?.length ? 'GPU_TIMING_UNAVAILABLE' : 'AVAILABLE',
    gpu: summarize(gpu), disjoint, unreadyQueries,
  };
}

function metrics() {
  if (!runtime || !graphics) throw new Error('Mount the stability harness first');
  const gl = graphics.gl;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    ...graphics.metrics(), snapshot: runtime.getSnapshot(),
    beat: (Reflect.get(runtime, 'simulation') as { beat: number } | undefined)?.beat,
    glError: gl.getError(),
    renderer: gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) as string,
    webgl: gl.getParameter(gl.VERSION) as string,
  };
}

function dispose() {
  pollGpu(true);
  const transport = runtime && Reflect.get(runtime, 'audio') as { context?: AudioContext } | undefined;
  if (transport?.context) closingAudio = new WeakRef(transport.context);
  runtime?.dispose();
  canvas?.remove();
  graphics = undefined;
  timing = null;
}

const stability = {
  async mount(volumeId: VolumeId, quality: QualityTier) {
    dispose();
    closingAudio = undefined;
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh';
    document.body.style.overflow = 'hidden';
    document.body.prepend(canvas);
    runtime = new Runtime({ pointer() {}, flash() {}, debug() {} });
    wrap(runtime, 'frame', (_self, [now], call) => {
      if (!measuring) return call();
      const at = now as number;
      if (frameAt) frames.push(at - frameAt);
      frameAt = at;
      if (runtime?.getSnapshot().phase === 'playing') playingFrames++;
      return elapsed('frame', call);
    });
    const options: GameOptions = { ...initialSnapshot, volumeId, quality, best: 0,
      diagnostics: { fixedTime: null, autoplay: false, align: true, god: false, boost: false,
        mobileQuality: false, post: true, record: false, debug: false } };
    begin();
    const at = performance.now();
    await runtime.initialize(canvas, options);
    const readyMs = performance.now() - at;
    const trace = end();
    if (runtime.getSnapshot().phase !== 'menu') throw new Error(JSON.stringify(runtime.getSnapshot()));
    return { readyMs, trace, metrics: metrics() };
  },
  async select(id: VolumeId) {
    begin();
    const at = performance.now();
    await runtime!.selectVolume(id);
    const readyMs = performance.now() - at;
    return { readyMs, trace: end(), metrics: metrics() };
  },
  async capture(ms: number) {
    begin();
    await new Promise(resolve => setTimeout(resolve, ms));
    measuring = false;
    await new Promise(resolve => setTimeout(resolve, 120));
    return end();
  },
  async fixedGlass(beat: number, quality: QualityTier, boost = false, mode: PlayMode = 'standard',
    side: RouteSide = 'left', iterations = 480, animateLights = false) {
    const definition = volumeById('elsewhere');
    const diagnostics: GameOptions['diagnostics'] = { fixedTime: null, autoplay: false, align: true, god: false,
      boost, mobileQuality: false, post: true, record: false, debug: false, branchSide: side };
    const output = document.createElement('canvas');
    document.body.prepend(output);
    const surface = new Graphics(output, quality, false, diagnostics);
    const sim = new Simulation(definition, diagnostics);
    try {
      instrumentRenderer(surface);
      surface.resize(960, 540, 1);
      surface.load(definition);
      surface.prepare();
      sim.start('normal', 0, undefined, mode);
      const station = sim.reference.station(beat, mode);
      const input = boost ? { ...idleInput, boosting: true } : idleInput;
      while (sim.phase === 'playing' && (boost ? sim.trackDistance < station : sim.beat + 1e-9 < beat)) sim.step(STEP, input);
      surface.warmSurface(sim, true);
      const frozenBeat = sim.beat;
      let tick = 0;
      const draw = () => new Promise<void>((resolve, reject) => requestAnimationFrame(now => {
        try {
          if (measuring && frameAt) frames.push(now - frameAt);
          frameAt = now;
          if (animateLights) sim.beat = Math.min(definition.beats, frozenBeat + tick++ * STEP / sim.secondsPerBeat);
          elapsed('frame', () => surface.draw(sim, true));
          resolve();
        } catch (error) { reject(error); }
      }));
      for (let i = 0; i < 24; i++) await draw();
      begin();
      for (let i = 0; i < iterations; i++) await draw();
      measuring = false;
      await new Promise(resolve => setTimeout(resolve, 120));
      const trace = end();
      const { gl } = surface;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const volume = Reflect.get(surface, 'volume') as { visuals: Map<RunGate, GateVisual> };
      const visible = Array.from(volume.visuals).filter(([, gate]) => gate.meshes[0].visible);
      const meshes = visible.flatMap(([, gate]) => gate.meshes);
      return { beat: frozenBeat, speed: sim.speed, route: sim.route, phase: sim.phase, trace, metrics: surface.metrics(),
        gateCount: visible.length, gateKinds: visible.map(([gate]) => gate.kind), gateMeshes: meshes.length,
        gateGeometries: new Set(meshes.map(mesh => mesh.geometry)).size,
        renderer: gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) as string,
        webgl: gl.getParameter(gl.VERSION) as string, glError: gl.getError() };
    } finally {
      measuring = false;
      pollGpu(true);
      longTasks?.disconnect();
      surface.dispose();
      graphics = undefined;
      timing = null;
      output.remove();
    }
  },
  stream(id: VolumeId) {
    begin();
    const resources = window.b0Harness.streamResources(id);
    return { resources, trace: end() };
  },
  metrics,
  start: (silent = true) => runtime!.start(silent),
  pause: () => runtime!.pause('user'),
  resume: () => runtime!.resume(),
  menu: () => runtime!.returnToMenu(),
  quality: (tier: QualityTier) => runtime!.setQuality(tier),
  state() {
    const audio = Reflect.get(runtime!, 'audio') as { timer?: number; context?: AudioContext; synth?: unknown };
    return { phase: runtime!.getSnapshot().phase, scheduler: audio.timer !== undefined, runBus: !!audio.synth,
      audio: (audio.context ?? closingAudio?.deref())?.state ?? null, raf: Reflect.get(runtime!, 'raf') !== 0,
      listenersReleased: (Reflect.get(runtime!, 'events') as AbortController).signal.aborted,
      inputReleased: (Reflect.get(Reflect.get(runtime!, 'input'), 'events') as AbortController).signal.aborted };
  },
  dispose,
};

const audioStart = document.createElement('button');
audioStart.textContent = 'Start with audio';
audioStart.style.cssText = 'position:fixed;top:0;z-index:1';
audioStart.addEventListener('click', () => { void stability.start(false); });
document.body.append(audioStart);

declare global { interface Window { stability: typeof stability } }
window.stability = stability;
