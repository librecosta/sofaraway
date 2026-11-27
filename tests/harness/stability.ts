import type { DataTexture, Material, Object3D, WebGLRenderer } from 'three';
import { AdditiveBlending, FrontSide, Mesh, PMREMGenerator, RedFormat, UnsignedByteType } from 'three';
import type { AudioTransport } from '../../app/game/audio/transport.client';
import { initialSnapshot } from '../../app/game/contracts';
import type { Difficulty, GameOptions, VolumeId, QualityTier, PlayMode } from '../../app/game/contracts';
import type { RouteKind, RouteSide } from '../../app/game/core/branches';
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
import { facilityZones } from '../../app/game/core/descent-facility';
import { FacilityInstallations } from '../../app/game/graphics/descent-installations.client';
import { IndustrialGeometry } from '../../app/game/graphics/industrial-geometry';
import { DaybreakExterior } from '../../app/game/graphics/daybreak-exterior.client';
import { makeDaybreakCloudField } from '../../app/game/graphics/daybreak-cloud-field';
import { makeDaybreakCirrusField } from '../../app/game/graphics/daybreak-cirrus';
import { OrbitWorld } from '../../app/game/graphics/orbit-world.client';
import { Path } from '../../app/game/graphics/path';
import { PostFX } from '../../app/game/graphics/post.client';
import { Graphics } from '../../app/game/graphics/scene.client';
import type { SceneState } from '../../app/game/graphics/scene.client';
import { Tunnel } from '../../app/game/graphics/tunnel.client';
import { Runtime } from '../../app/game/runtime/GameRuntime.client';

type Pass = 'scene' | 'depth' | 'dof' | 'bloom' | 'composite' | 'bright' | 'blur';
type GpuScope = Pass | 'frame' | 'exterior';
type GpuProbe = 'baseline' | 'colour-only-resolve' | 'single-sample' | 'rgba8-colour'
  | 'without-glass' | 'without-fixtures' | 'without-transparent' | 'without-opaque' | 'front-side-opaque'
  | 'single-clear' | 'red-depth' | 'without-facility-structure' | 'without-facility-lenses' | 'without-laser-panes';
type ExteriorProbe = 'full' | 'without-exterior' | 'flat-sky' | 'sky-only' | 'without-cirrus' | 'without-clouds'
  | 'without-relief' | 'without-swells' | 'without-canopy' | 'without-gate-glass';
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
let gpuProbe: GpuProbe | undefined;
let exteriorProbe: ExteriorProbe | undefined;
let exteriorFields: DataTexture[] = [];
let depthResolves = 0;
let colourResolves = 0;
let traceTunnel = false;
type FacilityBuild = { stage: string; vertices: number; instances: number; ms: number; range: [number, number] };
type TunnelBuild = { s0: number; s1: number; ms: number; bytes: number; meshes: number; facility: FacilityBuild[] };
let tunnelBuilds: TunnelBuild[] = [];
let facilityBuilds: FacilityBuild[] = [];
let tunnelFrames: { station: number; phase: SceneState['phase']; lookahead: number; builds: TunnelBuild[]; submitMs: number;
  frameAt: number; updateMs?: number; uploadBytes?: number; rafBeforeMs?: number; rafAfterMs?: number; rebuild: boolean }[] = [];
let taskWindows: { start: number; duration: number }[] = [];
let submittedBufferBytes = 0;
let lastBuildFrameAt = 0;
const pending: { query: WebGLQuery; scope: GpuScope; frame: number }[] = [];
const bloom = new Map<number, { count: number; ms: number }>();
const scopes: GpuScope[] = ['frame', 'scene', 'depth', 'dof', 'bloom', 'composite'];
const probeScopes: GpuScope[] = ['frame', 'scene', 'depth', 'dof', 'bright', 'blur', 'composite'];
const exteriorScopes: GpuScope[] = ['frame', 'scene', 'exterior', 'depth', 'dof', 'bloom', 'composite'];
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
      if (scope === 'bloom' || scope === 'blur') {
        const sum = bloom.get(frame) ?? { count: 0, ms: 0 };
        sum.count++;
        sum.ms += ms;
        if (sum.count === (scope === 'blur' ? 4 : 5)) { add(gpu, scope, sum.ms); bloom.delete(frame); }
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

function probeSceneColour(scene: Object3D, call: () => unknown) {
  const probe = gpuProbe;
  if (probe === 'front-side-opaque') {
    const sides = new Map<Material, Material['side']>();
    scene.traverseVisible(object => {
      if (!(object instanceof Mesh)) return;
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!mat.transparent && !sides.has(mat)) { sides.set(mat, mat.side); mat.side = FrontSide; }
      }
    });
    try { return call(); }
    finally { for (const [mat, side] of sides) mat.side = side; }
  }
  if (!probe?.startsWith('without-')) return call();
  const hidden: Mesh[] = [];
  scene.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const hide = probe === 'without-glass' ? object.renderOrder === 6 && materials.some(mat => mat.blending === AdditiveBlending)
      : probe === 'without-fixtures' ? object.name.startsWith('elsewhere-') && materials.some(mat => mat.blending === AdditiveBlending)
      : probe === 'without-facility-structure' ? ['facility-structure', 'descent-transfer-chamber'].includes(object.name)
      : probe === 'without-facility-lenses' ? ['facility-installations', 'facility-fixtures', 'facility-security',
        'descent-transfer-guideways', 'descent-transfer-chase'].includes(object.name)
      : probe === 'without-laser-panes' ? object.name.startsWith('laser-')
      : probe === 'without-transparent' ? materials.every(mat => mat.transparent) : materials.every(mat => !mat.transparent);
    if (hide) hidden.push(object);
  });
  for (const mesh of hidden) mesh.visible = false;
  try { return call(); }
  finally { for (const mesh of hidden) mesh.visible = true; }
}

function prepareExteriorProbe(exterior: DaybreakExterior, probe: ExteriorProbe) {
  const material = exterior.mesh.material;
  exteriorFields = [material.uniforms.cloudField.value, material.uniforms.cirrusField.value];
  let fragment = material.fragmentShader;
  const replace = (from: string | RegExp, to: string) => {
    const revised = fragment.replace(from, to);
    if (revised === fragment) throw new Error(`Missing DAYBREAK probe anchor: ${from}`);
    fragment = revised;
  };
  // These probes are applied to a single harness-owned material before compilation.
  if (probe === 'without-cirrus' || probe === 'sky-only') replace('if (height > .10 && height < .965)', 'if (false)');
  if (probe === 'without-clouds' || probe === 'sky-only') replace('if (ray.y < 0.0)', 'if (false)');
  if (probe === 'without-relief') replace(/\(textureLod\(cloudField, projected, lod\)\.r - \.5\) \* relief/, '0.0');
  if (probe === 'without-swells') replace('if (reach < 330.0)', 'if (false)');
  if (probe === 'flat-sky') {
    replace(/vec3 horizon = [\s\S]+?(?=float glow)/, 'vec3 sky = vec3(.53, .77, .95);\n          ');
    replace(/sky = mix\(sky, vec3\(1\.12[^;]+;/, '');
  }
  material.fragmentShader = fragment;
}

function instrumentRenderer(value: Graphics) {
  graphics = value;
  const { renderer, gl } = value;
  if (seenRenderers.has(renderer)) return;
  seenRenderers.add(renderer);
  timing = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  renderer.domElement.addEventListener('webglcontextlost', () => {
    if (graphics !== value) return;
    timing = null;
    pending.length = 0;
    bloom.clear();
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    if (graphics === value) timing = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  });
  time(gl, 'compileShader', 'glCompile');
  time(gl, 'linkProgram', 'glLink');
  const fieldHandles = new WeakMap<WebGLTexture, string>();
  for (const method of ['texImage2D', 'texStorage2D', 'texSubImage2D']) wrap(gl, method, (_self, args, call) => {
    const field = measuring && exteriorFields.find(texture => args.includes(texture.image.data));
    if (!field) return elapsed('glTexture', call);
    const handle = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture;
    fieldHandles.set(handle, field.name);
    return elapsed('glTexture', () => elapsed(`upload.${field.name}`, call));
  });
  wrap(gl, 'generateMipmap', (_self, [target], call) => {
    const field = measuring && exteriorFields.length && target === gl.TEXTURE_2D
      && fieldHandles.get(gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture);
    return field ? elapsed(`mipmap.${field}`, call) : call();
  });
  for (const method of ['texImage3D', 'texStorage3D', 'texSubImage3D']) time(gl, method, 'glTexture3D');
  for (const method of ['bufferData', 'bufferSubData']) wrap(gl, method, (_self, args, call) => {
    if (measuring && traceTunnel) {
      const data = args[method === 'bufferData' ? 1 : 2];
      if (ArrayBuffer.isView(data)) submittedBufferBytes += data.byteLength;
    }
    return elapsed('glBuffer', call);
  });
  for (const method of ['renderbufferStorage', 'renderbufferStorageMultisample']) time(gl, method, 'glRenderbuffer');
  wrap(gl, 'blitFramebuffer', (_self, args, call) => {
    if (gpuProbe && measuring && renderer.getRenderTarget() === (Reflect.get(value, 'post') as PostFX)?.rtScene) {
      const mask = args[8] as number;
      if (mask & gl.DEPTH_BUFFER_BIT) depthResolves++;
      if (mask & gl.COLOR_BUFFER_BIT) colourResolves++;
    }
    return call();
  });
  wrap(renderer, 'clear', (_self, args, call) => {
    // Three's own clear supplies explicit masks. Only omit redundant no-argument calls in this probe.
    if (gpuProbe === 'single-clear' && args.length === 0 && renderer.autoClear) return;
    return call();
  });
  wrap(renderer, 'renderBufferDirect', (_self, [, , , drawnMaterial, drawnObject], call) => {
    if (!exteriorProbe || pass || !(drawnObject instanceof Mesh) || drawnObject.material !== drawnMaterial) return call();
    if (drawnObject.name === 'daybreak-exterior')
      return exteriorProbe === 'without-exterior' ? undefined : gpuTime('exterior', call);
    const material = drawnMaterial as Material;
    if (exteriorProbe === 'without-canopy' && Reflect.get(material, 'uniforms')?.skyTint) return;
    if (exteriorProbe === 'without-gate-glass' && drawnObject.renderOrder === 6 && material.blending === AdditiveBlending) return;
    return call();
  });
  wrap(renderer, 'render', (_self, [scene], call) => {
    const scope = pass ?? ((scene as Object3D & { overrideMaterial?: unknown }).overrideMaterial ? 'depth' : 'scene');
    const render = () => scope === 'scene' && gpuProbe ? probeSceneColour(scene as Object3D, call) : call();
    if (!measuring) return render();
    const at = performance.now();
    try { return pass ? render() : gpuTime(scope, render); }
    finally {
      const ms = performance.now() - at;
      add(cpu, `renderer.${scope}`, ms);
      rendererCpu += ms;
    }
  });
}

time(FixedStepClock.prototype, 'consume', 'simulation');
time(Simulation.prototype, 'step', 'simulationStep');
wrap(DescentFacility.prototype, 'build', (self, [from, to], call) => {
  if (!measuring || !traceTunnel) return elapsed('facilityBuild', call);
  const at = performance.now();
  const meshes = call() as ReturnType<DescentFacility['build']>;
  const ms = performance.now() - at;
  const instance = meshes.find(mesh => mesh.name === 'facility-installations') as import('three').InstancedMesh | undefined;
  facilityBuilds.push({ stage: (self as DescentFacility).zoneAt(((from as number) + (to as number)) / 2).section,
    vertices: meshes[0].geometry.getAttribute('position').count, instances: instance?.count ?? 0,
    ms, range: [from as number, to as number] });
  add(cpu, 'facilityBuild', ms);
  return meshes;
});
time(IndustrialGeometry.prototype, 'build', 'industrialBuffers');
time(FacilityInstallations.prototype, 'build', 'installationBuffers');
time(DescentFacility.prototype, 'light', 'facilityLight');
time(DaybreakExterior.prototype, 'update', 'daybreakExterior');
time(OrbitWorld.prototype, 'update', 'orbitUpdate');
time(OrbitWorld.prototype, 'stream', 'orbitStream');
time(OrbitWorld.prototype, 'warmAstral', 'orbitWarmup');
time(Graphics.prototype, 'warmSurface', 'warmSurface');
wrap(Tunnel.prototype, '_buildChunk', (_self, [s0, s1], call) => {
  if (!measuring || !traceTunnel) return elapsed('chunk', call);
  const at = performance.now();
  const facilityStart = facilityBuilds.length;
  const chunk = call() as ReturnType<Tunnel['_buildChunk']>;
  const ms = performance.now() - at;
  let bytes = 0;
  for (const { geometry } of chunk.meshes) {
    bytes += geometry.index?.array.byteLength ?? 0;
    for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
  }
  for (const mesh of chunk.meshes) {
    bytes += (mesh as Partial<import('three').InstancedMesh>).instanceMatrix?.array.byteLength ?? 0;
  }
  tunnelBuilds.push({ s0: s0 as number, s1: s1 as number, ms, bytes, meshes: chunk.meshes.length, facility: facilityBuilds.slice(facilityStart) });
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
  const round = exteriorProbe ? exteriorScopes : gpuProbe ? probeScopes : scopes;
  sampleGpu = drawIndex % 4 === 0 ? round[Math.floor(drawIndex / 4) % round.length] : undefined;
  rendererCpu = 0;
  const buildStart = tunnelBuilds.length;
  const uploadStart = submittedBufferBytes;
  const rebuildStart = (cpu.tunnelRebuild?.length ?? 0) + (cpu.tunnelJunction?.length ?? 0);
  try { return elapsed('graphicsDraw', () => gpuTime('frame', call)); }
  finally {
    if (tunnelBuilds.length > buildStart) {
      const tunnel = Reflect.get(Reflect.get(self as Graphics, 'volume'), 'tunnel') as Tunnel;
      const { trackDistance: station, phase } = state as SceneState;
      const front = Math.max(...tunnel.chunks.map(chunk => chunk.s1));
      tunnelFrames.push({ station, phase, lookahead: front - station, builds: tunnelBuilds.slice(buildStart),
        submitMs: rendererCpu, frameAt, updateMs: cpu.graphicsUpdate?.at(-1), rafBeforeMs: frames.at(-1),
        uploadBytes: submittedBufferBytes - uploadStart,
        rebuild: (cpu.tunnelRebuild?.length ?? 0) + (cpu.tunnelJunction?.length ?? 0) > rebuildStart });
      lastBuildFrameAt = frameAt;
    }
    add(cpu, 'rendererFrame', rendererCpu);
    sampleGpu = undefined;
  }
});
wrap(PostFX.prototype, '_pass', (self, [material, target], call) => {
  pass = !target ? 'composite' : material === (self as PostFX).dofMat ? 'dof'
    : gpuProbe ? material === Reflect.get(self as PostFX, 'brightMat') ? 'bright' : 'blur' : 'bloom';
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
  depthResolves = 0;
  colourResolves = 0;
  tunnelBuilds = [];
  facilityBuilds = [];
  tunnelFrames = [];
  taskWindows = [];
  submittedBufferBytes = 0;
  lastBuildFrameAt = 0;
  if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    longTasks = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) recordTask(entry);
    });
    longTasks.observe({ type: 'longtask' });
  }
  measuring = true;
}

function recordTask(entry: PerformanceEntry) {
  add(cpu, 'longTask', entry.duration);
  if (traceTunnel) taskWindows.push({ start: entry.startTime, duration: entry.duration });
}

function end() {
  measuring = false;
  pollGpu();
  const unreadyQueries = pending.length;
  pollGpu(true);
  for (const entry of longTasks?.takeRecords() ?? []) recordTask(entry);
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
    ...(gpuProbe ? { resolves: { colour: colourResolves, depth: depthResolves } } : {}),
    ...(traceTunnel ? { tunnelFrames, taskWindows } : {}),
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
  async mount(volumeId: VolumeId, quality: QualityTier, showcase = false, tunnelTrace = false, showcaseRoute: RouteKind = 'main') {
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
      mode: showcase ? 'showcase' : 'standard', showcaseRoute, dynamicLights: showcase || initialSnapshot.dynamicLights,
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
      tunnelTrace?: boolean; gpuProbe?: GpuProbe; exteriorProbe?: ExteriorProbe }) {
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
      gpuProbe = sample?.gpuProbe;
      exteriorProbe = sample?.exteriorProbe;
      instrumentRenderer(surface);
      begin();
      surface.resize(...(sample?.useViewport ? [innerWidth, innerHeight, devicePixelRatio] as const : [960, 540, 1] as const));
      surface.load(definition, path, mode);
      if (exteriorProbe) {
        const exterior = Reflect.get(Reflect.get(surface, 'volume'), 'exterior') as DaybreakExterior;
        prepareExteriorProbe(exterior, exteriorProbe);
      }
      const post = Reflect.get(surface, 'post') as PostFX | undefined;
      if (gpuProbe && !post) throw new Error('GPU pass probe requires PostFX');
      if (gpuProbe === 'colour-only-resolve') post!.rtScene.resolveDepthBuffer = false;
      if (gpuProbe === 'single-sample' || gpuProbe === 'rgba8-colour' || gpuProbe === 'red-depth') {
        const target = gpuProbe === 'red-depth' ? post!.rtDepth : post!.rtScene;
        target.dispose();
        if (gpuProbe === 'single-sample') target.samples = 0;
        if (gpuProbe === 'rgba8-colour') target.texture.type = UnsignedByteType;
        if (gpuProbe === 'red-depth') target.texture.format = RedFormat;
        if (!post!.hasCompleteTargets(surface.gl)) throw new Error('Incomplete GPU probe framebuffer');
      }
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
      gpuProbe = undefined;
      exteriorProbe = undefined;
      exteriorFields = [];
      output.remove();
    }
  },
  async daybreakFieldBake() {
    const results = [];
    for (const [field, bake] of [['cloud', makeDaybreakCloudField], ['cirrus', makeDaybreakCirrusField]] as const) {
      const samples = [];
      const hashes = [];
      for (let i = 0; i < 6; i++) {
        const at = performance.now();
        const bytes = bake();
        samples.push(performance.now() - at);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
        hashes.push(Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join(''));
      }
      results.push({ field, samples, hashes });
    }
    return results;
  },
  descentConstruction(repeats: number) {
    const definition = volumeById('descent');
    const sim = new Simulation(definition, {}, undefined, 'standard', 'impossible');
    sim.start('impossible', 0);
    const zones = facilityZones(definition, 'standard', sim.reference);
    const facility = new DescentFacility(sim.path, zones);
    const ranges = zones.map(zone => {
      const midpoint = (zone.start + zone.finish) / 2;
      return { section: zone.section, start: Math.floor(midpoint / 210) * 210 };
    });
    try {
      for (const { start } of ranges) for (const mesh of facility.build(start, start + 210)) mesh.geometry.dispose();
      return ranges.map(({ section, start }) => {
        begin();
        for (let i = 0; i < repeats; i++) {
          for (const mesh of facility.build(start, start + 210)) elapsed('facilityMeshDispose', () => mesh.geometry.dispose());
        }
        const facilityBuild = stats(cpu.facilityBuild);
        return { section, start, ...end().cpu, facilityBuild };
      });
    } finally { facility.dispose(); }
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
