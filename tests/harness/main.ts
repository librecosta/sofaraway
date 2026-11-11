import { Runtime } from '../../app/game/runtime/GameRuntime.client';
import { initialSnapshot } from '../../app/game/contracts';
import type { Diagnostics, GameOptions } from '../../app/game/contracts';

const flags: Diagnostics = {
  fixedTime: null, autoplay: false, god: false, align: false, boost: false,
  mobileQuality: false, post: true, record: false, debug: true,
};

let runtime: Runtime | undefined;
let canvas: HTMLCanvasElement | undefined;
let metrics: string | undefined;

const harness = {
  async mount(options: Partial<GameOptions> = {}) {
    harness.dispose();
    canvas = document.createElement('canvas');
    document.body.append(canvas);
    runtime = new Runtime({ pointer() {}, flash() {}, debug(text) { metrics = text; } });
    const { volumeId, difficulty, quality, volume, muted } = initialSnapshot;
    await runtime.initialize(canvas, { volumeId, difficulty, quality, volume, muted, best: 0,
      diagnostics: flags, ...options });
    return runtime.getSnapshot();
  },
  snapshot: () => runtime?.getSnapshot() ?? initialSnapshot,
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
