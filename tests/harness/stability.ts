import type { Object3D, WebGLRenderer } from 'three';
import { PMREMGenerator } from 'three';
import type { AudioTransport } from '../../app/game/audio/transport.client';
import { initialSnapshot } from '../../app/game/contracts';
import type { Difficulty, GameOptions, VolumeId, QualityTier, PlayMode } from '../../app/game/contracts';
import type { RouteSide } from '../../app/game/core/branches';
import { FixedStepClock, STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import type { RunGate } from '../../app/game/core/simulation';
import { makeOutroPlan } from '../../app/game/core/encore';
import { exteriorViews, OutroInspection } from '../../app/game/debug/outro-inspection';
import type { ExteriorView, OutroPreset } from '../../app/game/debug/outro-inspection';
import { BOOST_MULTIPLIER, cruiseTarget } from '../../app/game/core/reference-track';
import { dynamicLightEnvelope, steadyLights } from '../../app/game/core/rhythmic-lights';
import { volumeById } from '../../app/game/core/volumes';
import type { GateVisual } from '../../app/game/graphics/gates.client';
import { DescentFacility } from '../../app/game/graphics/descent-facility.client';
import { DaybreakExterior } from '../../app/game/graphics/daybreak-exterior.client';
import { OrbitWorld } from '../../app/game/graphics/orbit-world.client';
import { Path } from '../../app/game/graphics/path';
import { PostFX } from '../../app/game/graphics/post.client';
import { Graphics } from '../../app/game/graphics/scene.client';
import type { SceneState } from '../../app/game/graphics/scene.client';
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
let traceTunnel = false;
type TunnelBuild = { s0: number; s1: number; ms: number; bytes: number; meshes: number };
let tunnelBuilds: TunnelBuild[] = [];
let tunnelFrames: { station: number; lookahead: number; builds: TunnelBuild[]; submitMs: number; rafAfterMs?: number }[] = [];
let lastBuildFrameAt = 0;
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
  for (const method of ['texImage2D', 'texStorage2D', 'texSubImage2D']) time(gl, method, 'glTexture');
  for (const method of ['texImage3D', 'texStorage3D', 'texSubImage3D']) time(gl, method, 'glTexture3D');
  for (const method of ['bufferData', 'bufferSubData']) time(gl, method, 'glBuffer');
  for (const method of ['renderbufferStorage', 'renderbufferStorageMultisample']) time(gl, method, 'glRenderbuffer');
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
time(Simulation.prototype, 'step', 'simulationStep');
time(DescentFacility.prototype, 'build', 'facilityBuild');
time(DescentFacility.prototype, 'light', 'facilityLight');
time(DaybreakExterior.prototype, 'update', 'daybreakExterior');
time(OrbitWorld.prototype, 'update', 'orbitUpdate');
time(OrbitWorld.prototype, 'stream', 'orbitStream');
time(OrbitWorld.prototype, 'warmAstral', 'orbitWarmup');
time(Graphics.prototype, 'warmSurface', 'warmSurface');
wrap(Tunnel.prototype, '_buildChunk', (_self, [s0, s1], call) => {
  if (!measuring || !traceTunnel) return elapsed('chunk', call);
  const at = performance.now();
  const chunk = call() as ReturnType<Tunnel['_buildChunk']>;
  const ms = performance.now() - at;
  let bytes = 0;
  for (const { geometry } of chunk.meshes) {
    bytes += geometry.index?.array.byteLength ?? 0;
    for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
  }
  tunnelBuilds.push({ s0: s0 as number, s1: s1 as number, ms, bytes, meshes: chunk.meshes.length });
  add(cpu, 'chunk', ms);
  return chunk;
});
time(Tunnel.prototype, 'update', 'tunnelUpdate');
time(Tunnel.prototype, 'rebuildFrom', 'tunnelRebuild');
time(Tunnel.prototype, 'setJunction', 'tunnelJunction');
time(Tunnel.prototype, 'buildDistant', 'farChunk');
time(Tunnel.prototype, '_disposeChunk', 'chunkRelease');
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
wrap(Graphics.prototype, 'draw', (self, [state], call) => {
  if (!measuring) return call();
  drawIndex++;
  if (drawIndex % 4 === 0) pollGpu();
  sampleGpu = drawIndex % 4 === 0 ? scopes[Math.floor(drawIndex / 4) % scopes.length] : undefined;
  rendererCpu = 0;
  const buildStart = tunnelBuilds.length;
  try { return elapsed('graphicsDraw', () => gpuTime('frame', call)); }
  finally {
    if (tunnelBuilds.length > buildStart) {
      const tunnel = Reflect.get(Reflect.get(self as Graphics, 'volume'), 'tunnel') as Tunnel;
      const station = (state as SceneState).trackDistance;
      const front = Math.max(...tunnel.chunks.map(chunk => chunk.s1));
      tunnelFrames.push({ station, lookahead: front - station, builds: tunnelBuilds.slice(buildStart), submitMs: rendererCpu });
      lastBuildFrameAt = frameAt;
    }
    add(cpu, 'rendererFrame', rendererCpu);
    sampleGpu = undefined;
  }
});
wrap(PostFX.prototype, '_pass', (self, [material, target], call) => {
  pass = !target ? 'composite' : material === (self as PostFX).dofMat ? 'dof' : 'bloom';
  try { return gpuTime(pass, call); }
  finally { pass = undefined; }
});

const scheduleInterval: Window['setInterval'] = window.setInterval.bind(window);
// The transport registers a 25 ms timer. Match its handle before measuring its callback.
const timedInterval: Window['setInterval'] = (handler: TimerHandler, delay?: number, ...args: unknown[]) => {
  if (typeof handler !== 'function' || delay !== 25) return scheduleInterval(handler, delay, ...args);
  const timer = scheduleInterval(() => {
    const transport = runtime && Reflect.get(runtime, 'audio') as AudioTransport | undefined;
    if (transport && Reflect.get(transport, 'timer') === timer) elapsed('audioSchedule', () => handler(...args));
    else handler(...args);
  }, delay);
  return timer;
};
Reflect.set(window, 'setInterval', timedInterval);

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
  tunnelBuilds = [];
  tunnelFrames = [];
  lastBuildFrameAt = 0;
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
    over33ms: frames.filter(ms => ms > 33.34).length,
    over50ms: frames.filter(ms => ms > 50).length, playingFrames,
    gpuStatus: !timing || !gpu.frame?.length ? 'GPU_TIMING_UNAVAILABLE' : 'AVAILABLE',
    gpu: summarize(gpu), disjoint, unreadyQueries,
    ...(traceTunnel ? { tunnelFrames } : {}),
  };
}

function frameInterval(now: number) {
  if (measuring && frameAt) frames.push(now - frameAt);
  if (lastBuildFrameAt) {
    tunnelFrames.at(-1)!.rafAfterMs = now - lastBuildFrameAt;
    lastBuildFrameAt = 0;
  }
  frameAt = now;
}

function metrics() {
  if (!runtime || !graphics) throw new Error('Mount the stability harness first');
  const gl = graphics.gl;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const sim = Reflect.get(runtime, 'simulation') as Simulation | undefined;
  const audio = Reflect.get(runtime, 'audio') as AudioTransport;
  return {
    ...graphics.metrics(), snapshot: runtime.getSnapshot(),
    beat: sim?.beat, station: sim?.trackDistance, hits: sim?.hits, effectiveDifficulty: sim?.difficulty,
    renderedVolume: sim?.volume.id,
    audioDiagnostics: { ...audio.diagnostics },
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
  async mount(volumeId: VolumeId, quality: QualityTier, showcase = false, tunnelTrace = false) {
    dispose();
    traceTunnel = tunnelTrace;
    closingAudio = undefined;
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh';
    document.body.style.overflow = 'hidden';
    document.body.prepend(canvas);
    runtime = new Runtime({ pointer() {}, flash() {}, debug() {} });
    wrap(runtime, 'frame', (_self, [now], call) => {
      if (!measuring) return call();
      frameInterval(now as number);
      if (runtime?.getSnapshot().phase === 'playing') playingFrames++;
      return elapsed('frame', call);
    });
    const options: GameOptions = { ...initialSnapshot, volumeId, quality,
      mode: showcase ? 'showcase' : 'standard', dynamicLights: showcase || initialSnapshot.dynamicLights,
      runSeed: showcase ? 0 : undefined,
      diagnostics: { fixedTime: null, autoplay: false, align: !showcase, god: false, boost: false,
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
    const active = runtime!;
    try {
      await active.selectVolume(id);
      // The selection updates the menu immediately. Graphics.load runs on the next game frame.
      while ((Reflect.get(active, 'simulation') as Simulation | undefined)?.volume.id !== id) {
        if (active.getSnapshot().phase !== 'menu' || performance.now() - at > 5000)
          throw new Error(`Volume switch did not render ${id}`);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      const readyMs = performance.now() - at;
      return { readyMs, trace: end(), metrics: metrics() };
    } catch (error) {
      if (measuring) end();
      throw error;
    }
  },
  async capture(ms: number, untilResults = false) {
    begin();
    await new Promise<void>(resolve => {
      if (!untilResults) { setTimeout(resolve, ms); return; }
      const deadline = performance.now() + ms;
      const check = setInterval(() => {
        const phase = runtime?.getSnapshot().phase;
        if ((phase === 'playing' || phase === 'crash') && performance.now() < deadline) return;
        clearInterval(check);
        resolve();
      }, 100);
    });
    measuring = false;
    await new Promise(resolve => setTimeout(resolve, 120));
    return end();
  },
  async fixedGlass(beat: number, quality: QualityTier, boost = false, mode: PlayMode = 'standard',
    side: RouteSide = 'left', iterations = 480, animateLights = false,
    sample?: { station?: number; fly?: boolean; inspection?: boolean; preset?: OutroPreset; difficulty?: Difficulty;
      dynamic?: boolean; volumeId?: VolumeId; useViewport?: boolean; post?: boolean; image?: boolean; view?: ExteriorView;
      tunnelTrace?: boolean }) {
    traceTunnel = sample?.tunnelTrace ?? false;
    const definition = volumeById(sample?.volumeId ?? 'elsewhere');
    const diagnostics: GameOptions['diagnostics'] = { fixedTime: null, autoplay: false, align: true, god: false,
      boost, mobileQuality: false, post: sample?.post ?? true, record: false, debug: false, branchSide: side };
    const output = document.createElement('canvas');
    document.body.prepend(output);
    const coldStarted = performance.now();
    const surface = new Graphics(output, quality, !!sample?.useViewport && matchMedia('(pointer: coarse)').matches, diagnostics);
    const createMs = performance.now() - coldStarted;
    const difficulty = sample?.difficulty ?? 'normal';
    const sim = new Simulation(definition, diagnostics, undefined, mode, difficulty);
    const started = performance.now();
    const path = sim.path;
    const pathBuild = { ms: performance.now() - started, frames: path.retainedFrameCount, segments: path.segments.length,
      numericBytes: path.retainedFrameCount * 13 * 8 + path.segments.length * (2 + 12) * 8 + path.arcTableBytes };
    try {
      instrumentRenderer(surface);
      begin();
      surface.resize(...(sample?.useViewport ? [innerWidth, innerHeight, devicePixelRatio] as const : [960, 540, 1] as const));
      surface.load(definition, path, mode);
      surface.prepare();
      const preparation = end();
      const planStarted = performance.now();
      sim.start(difficulty, 0, undefined, mode);
      const runSetupMs = performance.now() - planStarted;
      const planBuildStarted = performance.now();
      if (sample && sim.outroPlan) for (let i = 0; i < 40; i++) makeOutroPlan(definition, mode, i, sim.outroPlan.mainLastStation, difficulty);
      const encorePlanMs = sample ? (performance.now() - planBuildStarted) / 40 : undefined;
      const inspectionStarted = performance.now();
      const inspection = sample?.inspection || sample?.preset
        ? new OutroInspection(mode, 0, 'main', path, difficulty, definition) : undefined;
      const inspectionBuildMs = inspection ? performance.now() - inspectionStarted : undefined;
      const view = sample?.preset && inspection ? inspection.view(sample.preset, 'Boost') : undefined;
      const station = view?.station ?? sample?.station ?? sim.reference.station(beat, mode);
      beat = view?.musicBeat ?? beat;
      const input = boost ? { ...idleInput, boosting: true } : idleInput;
      if (!inspection) while (sim.phase === 'playing' && (boost || sample ? sim.trackDistance < station : sim.beat + 1e-9 < beat)) sim.step(STEP, input);
      if (sample && !inspection && !sample.fly) sim.beat = beat;
      const inspectionSpeed = inspection?.state(station, beat, 'Boost').speed ?? cruiseTarget(Infinity) * BOOST_MULTIPLIER;
      const inspect = (tick: number) => inspection?.state(station + (sample?.fly ? tick * STEP * inspectionSpeed : 0),
        beat + tick * STEP / sim.secondsPerBeat, 'Boost');
      const dynamics = { ...steadyLights };
      const camera = sample?.view && exteriorViews[sample.view];
      const lightingFor = (state: SceneState) => sample?.dynamic || camera ? {
        beat: state.beat,
        dynamics: sample?.dynamic ? dynamicLightEnvelope(definition, state.beat * sim.secondsPerBeat, 1, false, dynamics) : undefined,
        ...(camera ? { yaw: camera[0] * Math.PI / 180, pitch: camera[1] * Math.PI / 180, cameraLift: camera[2] } : {}),
      } : undefined;
      begin();
      const initial = inspect(0);
      if (initial) surface.draw(initial, true);
      else surface.warmSurface(sim, true, camera ? lightingFor(sim) : undefined);
      const firstDraw = end();
      const chunkBuild = firstDraw.cpu.chunk;
      const frozenBeat = initial?.beat ?? sim.beat;
      const startStation = initial?.trackDistance ?? sim.trackDistance;
      let tick = 0;
      const draw = () => new Promise<void>((resolve, reject) => requestAnimationFrame(now => {
        try {
          frameInterval(now);
          if (!inspection && sample?.fly) sim.step(STEP, input);
          else if (!inspection && animateLights) sim.beat = Math.min(definition.beats, frozenBeat + tick * STEP / sim.secondsPerBeat);
          elapsed('frame', () => {
            const state = inspect(tick++) ?? sim;
            surface.draw(state, true, true, lightingFor(state));
          });
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
      const image = sample?.image ? await new Promise<string>((resolve, reject) => requestAnimationFrame(() => {
        try {
          const state = inspect(0) ?? sim;
          surface.draw(state, true, true, lightingFor(state));
          resolve(output.toDataURL());
        } catch (error) { reject(error); }
      })) : undefined;
      return { beat: frozenBeat, sampleStation: startStation, image, createMs, preparation, firstDraw,
        speed: inspection ? inspectionSpeed : sim.speed, route: initial?.route ?? sim.route, phase: initial?.phase ?? sim.phase, trace, pathBuild, chunkBuild, runSetupMs, encorePlanMs,
        inspectionBuildMs, metrics: surface.metrics(),
        previewCount: initial ? initial.previewGates.length + initial.previewEncore.length : sim.previewGates.length + sim.previewEncore.length,
        pathLength: path.length,
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
