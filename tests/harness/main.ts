import { Runtime } from '../../app/game/runtime/GameRuntime.client';
import { initialSnapshot } from '../../app/game/contracts';
import type { Diagnostics, GameOptions, PlayMode } from '../../app/game/contracts';
import { STEP } from '../../app/game/core/clock';
import { facilityZones } from '../../app/game/core/descent-facility';
import type { FixedStepClock } from '../../app/game/core/clock';
import type { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { MaterialLibrary } from '../../app/game/graphics/materials/library.client';
import { DescentFacility } from '../../app/game/graphics/descent-facility.client';
import { buildRunPath } from '../../app/game/graphics/path';
import { buildTextures } from '../../app/game/graphics/textures.client';
import { Tunnel } from '../../app/game/graphics/tunnel.client';
import type { Graphics } from '../../app/game/graphics/scene.client';
import type { AudioTransport } from '../../app/game/audio/transport.client';
import type { Synthesizer } from '../../app/game/audio/synthesizer.client';
import { OrbitSynthesizer } from '../../app/game/audio/orbit.client';
import type { BufferGeometry, Material, Mesh, Scene } from 'three';
import { sectionSignals, shaderMismatches, stoppedRunSignal } from './signals';

const flags: Diagnostics = {
  fixedTime: null, autoplay: false, god: false, align: false, boost: false,
  mobileQuality: false, post: true, record: false, debug: true,
};

let runtime: Runtime | undefined;
let canvas: HTMLCanvasElement | undefined;
let metrics: string | undefined;

const harness = {
  measureAuroraEntry: async (...args: Parameters<typeof import('./orbit-aurora').measureAuroraEntry>) =>
    (await import('./orbit-aurora')).measureAuroraEntry(...args),
  inspectOrbitLighting: async (...args: Parameters<typeof import('./orbit-lighting').inspectOrbitLighting>) =>
    (await import('./orbit-lighting')).inspectOrbitLighting(...args),
  sectionSignals,
  shaderMismatches,
  stoppedRunSignal,
  inspectJunction: async (mode?: PlayMode) => (await import('./branch')).inspectJunction(mode),
  inspectHologram: async () => (await import('./branch')).inspectHologram(),
  inspectGlassOptics: async () => (await import('./glass-optics')).inspectGlassOptics(),
  inspectGateApproach: async (...args: Parameters<typeof import('./gate-approach').inspectGateApproach>) =>
    (await import('./gate-approach')).inspectGateApproach(...args),
  inspectDaybreakCabin: async () => (await import('./daybreak-cabin')).inspectDaybreakCabin(),
  inspectCanopySunlight: async () => (await import('./daybreak-cabin')).inspectCanopySunlight(),
  inspectCirrusDirection: async () => (await import('./daybreak-cabin')).inspectCirrusDirection(),
  inspectDaybreakReflections: async () => (await import('./daybreak-cabin')).inspectDaybreakReflections(flags),
  inspectDaybreakContinuity: async () => (await import('./daybreak-cabin')).inspectDaybreakContinuity(),
  inspectMaterials: async () => (await import('./materials')).inspectMaterials(),
  inspectCameraAndGates: async () => (await import('./camera-gates')).inspectCameraAndGates(),
  inspectOrbitStability: async (...args: Parameters<typeof import('./orbit').inspectOrbitStability>) =>
    (await import('./orbit')).inspectOrbitStability(...args),
  inspectOrbitGuidance: async (...args: Parameters<typeof import('./orbit').inspectOrbitGuidance>) =>
    (await import('./orbit')).inspectOrbitGuidance(...args),
  inspectAphelion: async (...args: Parameters<typeof import('./orbit-aphelion').inspectAphelion>) =>
    (await import('./orbit-aphelion')).inspectAphelion(...args),
  inspectCosmicCourse: async (...args: Parameters<typeof import('./orbit-cosmos').inspectCosmicCourse>) =>
    (await import('./orbit-cosmos')).inspectCosmicCourse(...args),
  inspectOrbitSurfaces: async (...args: Parameters<typeof import('./orbit-surfaces').inspectOrbitSurfaces>) =>
    (await import('./orbit-surfaces')).inspectOrbitSurfaces(...args),
  inspectSupportingSurfaces: async (...args: Parameters<typeof import('./orbit-surfaces').inspectSupportingSurfaces>) =>
    (await import('./orbit-surfaces')).inspectSupportingSurfaces(...args),
  inspectNebulaSegments: async () => (await import('./orbit-surfaces')).inspectNebulaSegments(),
  inspectNebulaFlight: async (...args: Parameters<typeof import('./orbit-surfaces').inspectNebulaFlight>) =>
    (await import('./orbit-surfaces')).inspectNebulaFlight(...args),
  inspectRockApproach: async (...args: Parameters<typeof import('./orbit-approach').inspectRockApproach>) =>
    (await import('./orbit-approach')).inspectRockApproach(...args),
  branchState() {
    const sim: Simulation = Reflect.get(runtime!, 'simulation');
    const graphics: Graphics = Reflect.get(runtime!, 'graphics');
    const lastGate = sim.mainGates[sim.gatesJudged - 1];
    return { sharedPath: sim.path === graphics.path && (!sim.junctionPath || sim.junctionPath.base === graphics.path),
      trackDistance: sim.trackDistance, time: sim.time, speed: sim.speed, routeSide: sim.routeSide,
      lastGate: lastGate && { beat: lastGate.beat, crossedAt: lastGate.crossedAt },
      branch: sim.branch, route: sim.route, pickup: sim.pickup, metrics: graphics.metrics() };
  },
  audioState() {
    const audio: AudioTransport = Reflect.get(runtime!, 'audio');
    const ctx: AudioContext | undefined = Reflect.get(audio, 'context');
    const synth: Synthesizer | undefined = Reflect.get(audio, 'synth');
    return { starwake: synth?.eventSource instanceof OrbitSynthesizer, active: !!synth, time: audio.time,
      context: ctx?.state, tailRemaining: Math.max(0, (Reflect.get(audio, 'tailUntil') as number) - (ctx?.currentTime ?? 0)),
      diagnostics: { ...audio.diagnostics } };
  },
  meshResources() {
    const graphics: Graphics = Reflect.get(runtime!, 'graphics');
    const { scene }: { scene: Scene } = Reflect.get(graphics, 'volume');
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    scene.traverse(node => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    });
    let geometryBytes = 0;
    for (const geometry of geometries) {
      geometryBytes += geometry.index?.array.byteLength ?? 0;
      for (const attribute of Object.values(geometry.attributes)) {
        geometryBytes += ('data' in attribute ? attribute.data.array : attribute.array).byteLength;
      }
    }
    return { materials: materials.size, geometryBytes };
  },
  advance(beat: number) {
    const sim: Simulation = Reflect.get(runtime!, 'simulation');
    const clock: FixedStepClock = Reflect.get(runtime!, 'clock');
    const step = Reflect.get(runtime!, 'step') as (sim: Simulation) => void;
    while (sim.beat + 1e-9 < beat && sim.phase === 'playing') {
      clock.consume(clock.elapsed + STEP, () => step.call(runtime, sim));
    }
  },
  advanceAndPause(beat: number, manual = false) {
    harness.advance(beat);
    const sim: Simulation = Reflect.get(runtime!, 'simulation');
    const graphics: Graphics = Reflect.get(runtime!, 'graphics');
    graphics.draw(sim, true);
    runtime!.pause('user');
    if (manual) Reflect.get(sim, 'options').align = false;
    return harness.branchState();
  },
  streamResources(id: GameOptions['volumeId']) {
    const volume = volumeById(id);
    const path = buildRunPath(volume);
    const facility = volume.topology === 'facility' ? new DescentFacility(path, facilityZones(volume, 'standard')) : undefined;
    const textures = id === 'elsewhere' ? new MaterialLibrary() : facility ? undefined : buildTextures();
    const tunnel = new Tunnel(textures, path, volume.topology, [], false, facility);
    tunnel.update(4200);
    const first = [...tunnel.chunks];
    let disposed = 0;
    for (const chunk of first) {
      for (const mesh of chunk.meshes) {
        if ('instanceMatrix' in mesh) mesh.addEventListener('dispose', () => disposed++);
        else mesh.geometry.addEventListener('dispose', () => disposed++);
      }
    }
    const counts = [first.length];
    for (const distance of [4510, 4820, 5220, 4200, 3600]) {
      tunnel.update(distance);
      counts.push(tunnel.chunks.length);
    }
    const expectedDisposals = first.flatMap(chunk => chunk.meshes).length;
    const oldChunksRemoved = !tunnel.chunks.some(chunk => first.includes(chunk));
    const currentDisposals = disposed;
    tunnel.dispose();
    if (textures instanceof MaterialLibrary) textures.dispose();
    else if (textures) for (const texture of Object.values(textures)) texture.dispose();
    return { counts, expectedDisposals, oldChunksRemoved, currentDisposals, remaining: tunnel.chunks.length };
  },
  async mount(options: Partial<GameOptions> = {}) {
    harness.dispose();
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    runtime = new Runtime({ pointer() {}, flash() {}, debug(text) { metrics = text; } });
    const { volumeId, difficulty, mode, quality, volume, muted } = initialSnapshot;
    await runtime.initialize(canvas, { volumeId, difficulty, mode, quality, volume, muted,
      diagnostics: flags, ...options });
    return runtime.getSnapshot();
  },
  snapshot: () => runtime?.getSnapshot() ?? initialSnapshot,
  corridor: () => runtime && (Reflect.get(runtime, 'graphics') as Graphics | undefined)?.path,
  mode: (mode: PlayMode) => runtime?.setMode(mode),
  dynamicLights: (value: boolean) => runtime?.setDynamicLights(value),
  metrics: () => metrics,
  start: (silent?: boolean) => runtime?.start(silent),
  pause: () => runtime?.pause('user'),
  resume: (silent?: boolean) => runtime?.resume(silent),
  enableAudio: () => runtime?.enableAudio(),
  returnToMenu: () => runtime?.returnToMenu(),
  select: (id: GameOptions['volumeId']) => runtime?.selectVolume(id),
  dispose() {
    runtime?.dispose();
    canvas?.remove();
  },
};

declare global {
  interface Window { b0Harness: typeof harness }
}

window.b0Harness = harness;
const params = new URLSearchParams(location.search);
if (params.has('stability')) void import('./stability');
if (params.has('audio-inspector')) void import('./audio-inspector');
if (params.has('sync')) void import('./audio-sync').then(({ installSyncHarness }) => installSyncHarness(() => runtime));
