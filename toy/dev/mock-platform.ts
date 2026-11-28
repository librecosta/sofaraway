import { browserSurface } from '../platform';
import type { ContainerMode, ToyContainerState, ToyPlatform, ToyPlatformState } from '../platform';
import { MockLeaderboard } from './mock-leaderboard';

const presets = {
  desktop: { width: 960, height: 540, device: 'desktop', safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  android: { width: 800, height: 393, device: 'phone', safeArea: { top: 0, right: 16, bottom: 20, left: 16 } },
  ios: { width: 844, height: 390, device: 'phone', safeArea: { top: 0, right: 47, bottom: 21, left: 47 } },
} satisfies Record<string, Omit<ToyContainerState, 'orientation' | 'immersive'>>;

export type DevicePreset = keyof typeof presets;
type Outcome = 'accept' | 'reject' | 'timeout';

const initial = {
  preset: 'desktop' as DevicePreset,
  container: { orientation: 'landscape', immersive: false, ...presets.desktop } as ToyContainerState,
  lifecycle: 'active' as ToyPlatformState['lifecycle'],
  available: true,
  capsuleWidth: 0, capsuleHeight: 0, bottomBar: 0,
  requestDelay: 150, outcome: 'accept' as Outcome,
  log: [] as string[],
};

export class MockToyPlatform implements ToyPlatform {
  readonly leaderboard = new MockLeaderboard();
  private controls = initial;
  private snapshot = browserSurface;
  private readonly listeners = new Set<() => void>();
  private pending?: ReturnType<typeof setTimeout>;

  constructor() { this.update({}); }

  getSnapshot = () => this.snapshot;
  getControls = () => this.controls;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  update(patch: Partial<typeof initial>) {
    const next = this.controls = { ...this.controls, ...patch };
    const state = next.container;
    this.snapshot = {
      container: next.available ? { ...state, safeArea: { ...state.safeArea,
        top: Math.max(state.safeArea.top, next.capsuleWidth > 0 ? next.capsuleHeight : 0),
        bottom: Math.max(state.safeArea.bottom, next.bottomBar),
      } } : null,
      lifecycle: next.lifecycle,
      canChangeMode: next.available && next.preset !== 'desktop' && next.lifecycle === 'active',
    };
    for (const listener of this.listeners) listener();
  }

  updateContainer(patch: Partial<ToyContainerState>) {
    const container = { ...this.controls.container, ...patch };
    if (container.width !== container.height) container.orientation = container.width > container.height ? 'landscape' : 'portrait';
    this.update({ container });
  }

  chooseDevice(preset: DevicePreset) {
    this.update({ preset, container: { ...this.controls.container, orientation: 'landscape', ...presets[preset] } });
  }

  setMode({ orientation, immersive }: ContainerMode) {
    const { width, height, orientation: current } = this.controls.container;
    this.updateContainer({ orientation, immersive,
      width: current === orientation ? width : height, height: current === orientation ? height : width });
  }

  private log(message: string) { this.update({ log: [...this.controls.log.slice(-7), message] }); }

  async requestMode(mode: ContainerMode) {
    if (!this.snapshot.canChangeMode) throw new Error('Container control unavailable.');
    this.log(`Request: ${mode.orientation}, immersive ${mode.immersive ? 'on' : 'off'}`);
    if (this.controls.outcome === 'reject') {
      this.log('Request rejected');
      throw new Error('Mock container rejected the request.');
    }
    if (this.controls.outcome === 'timeout') {
      this.log('Acknowledged without a state change');
      return;
    }
    clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      this.setMode(mode);
      this.log(`Confirmed: ${mode.orientation}, immersive ${mode.immersive ? 'on' : 'off'}`);
    }, this.controls.requestDelay);
  }

  setAvailable(available: boolean) {
    if (!available) clearTimeout(this.pending);
    this.leaderboard.update({ available });
    this.update({ available });
  }

  setLifecycle(lifecycle: ToyPlatformState['lifecycle']) {
    if (lifecycle === 'closed') {
      clearTimeout(this.pending);
      this.leaderboard.update({}, true);
    }
    this.update({ lifecycle });
    this.log(`Lifecycle: ${lifecycle}`);
  }

  reset() { clearTimeout(this.pending); this.leaderboard.reset(); this.update(initial); }
}
