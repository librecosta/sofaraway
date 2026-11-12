import { Runtime } from '../../app/game/runtime/GameRuntime.client';
import { initialSnapshot } from '../../app/game/contracts';
import type { Diagnostics, GameOptions, PlayMode } from '../../app/game/contracts';
import { STEP } from '../../app/game/core/clock';
import type { FixedStepClock } from '../../app/game/core/clock';
import { corridorLength } from '../../app/game/core/simulation';
import type { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { buildPath } from '../../app/game/graphics/path';
import { buildTextures } from '../../app/game/graphics/textures.client';
import { Tunnel } from '../../app/game/graphics/tunnel.client';
import type { Graphics } from '../../app/game/graphics/scene.client';
import { sectionSignals, shaderMismatches, stoppedRunSignal } from './signals';

const flags: Diagnostics = {
  fixedTime: null, autoplay: false, god: false, align: false, boost: false,
  mobileQuality: false, post: true, record: false, debug: true,
};

let runtime: Runtime | undefined;
let canvas: HTMLCanvasElement | undefined;
let metrics: string | undefined;
let best: number;

const harness = {
  sectionSignals,
  shaderMismatches,
  stoppedRunSignal,
  inspectJunction: async (mode?: PlayMode) => (await import('./branch')).inspectJunction(mode),
  inspectHologram: async () => (await import('./branch')).inspectHologram(),
  inspectGlassOptics: async () => (await import('./glass-optics')).inspectGlassOptics(),
  branchState() {
    const sim: Simulation = Reflect.get(runtime!, 'simulation');
    const graphics: Graphics = Reflect.get(runtime!, 'graphics');
    return { branch: sim.branch, route: sim.route, pickup: sim.pickup, metrics: graphics.metrics() };
  },
  advanceAndPause(beat: number) {
    const sim: Simulation = Reflect.get(runtime!, 'simulation');
    const clock: FixedStepClock = Reflect.get(runtime!, 'clock');
    const step = Reflect.get(runtime!, 'step') as (sim: Simulation) => void;
    while (sim.beat + 1e-9 < beat && sim.phase === 'playing') {
      clock.consume(clock.elapsed + STEP, () => step.call(runtime, sim));
    }
    const graphics: Graphics = Reflect.get(runtime!, 'graphics');
    graphics.draw(sim, true);
    runtime!.pause('user');
    return harness.branchState();
  },
  streamResources(id: GameOptions['volumeId']) {
    const volume = volumeById(id);
    const textures = buildTextures();
    const path = buildPath(corridorLength(volume), 150, 46, volume.topology);
    const tunnel = new Tunnel(textures, path, volume.topology);
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
    for (const texture of Object.values(textures)) texture.dispose();
    return { counts, expectedDisposals, oldChunksRemoved, currentDisposals, remaining: tunnel.chunks.length };
  },
  async mount(options: Partial<GameOptions> = {}) {
    harness.dispose();
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    best = options.best ?? 0;
    runtime = new Runtime({ pointer() {}, flash() {}, debug(text) { metrics = text; }, best(score) { best = score; } });
    const { volumeId, difficulty, mode, quality, volume, muted } = initialSnapshot;
    await runtime.initialize(canvas, { volumeId, difficulty, mode, quality, volume, muted, best: 0,
      diagnostics: flags, ...options });
    return runtime.getSnapshot();
  },
  snapshot: () => runtime?.getSnapshot() ?? initialSnapshot,
  best: () => best,
  metrics: () => metrics,
  start: (silent?: boolean) => runtime?.start(silent),
  pause: () => runtime?.pause('user'),
  resume: (silent?: boolean) => runtime?.resume(silent),
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
if (params.has('sync')) void import('./audio-sync').then(({ installSyncHarness }) => installSyncHarness(() => runtime));
