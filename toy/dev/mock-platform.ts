import type { ToyContainerState, ToyPlatform } from '../platform';

const presets = {
  desktop: { width: 960, height: 540, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  android: { width: 800, height: 393, safeArea: { top: 0, right: 16, bottom: 20, left: 16 } },
  ios: { width: 844, height: 390, safeArea: { top: 0, right: 47, bottom: 21, left: 47 } },
} satisfies Record<ToyContainerState['device'], Pick<ToyContainerState, 'width' | 'height' | 'safeArea'>>;

const initial = { device: 'desktop', orientation: 'landscape', immersive: false, ...presets.desktop } as const;

export class MockToyPlatform implements ToyPlatform {
  private state: ToyContainerState = initial;
  private available = true;
  private readonly listeners = new Set<() => void>();

  getSnapshot = () => this.available ? this.state : null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish() { for (const listener of this.listeners) listener(); }

  update(patch: Partial<ToyContainerState>) {
    const next = { ...this.state, ...patch };
    if (next.width !== next.height) next.orientation = next.width > next.height ? 'landscape' : 'portrait';
    this.state = next;
    this.publish();
  }

  chooseDevice(device: ToyContainerState['device']) {
    this.update({ device, orientation: 'landscape', ...presets[device] });
  }

  chooseOrientation(orientation: ToyContainerState['orientation']) {
    if (this.state.orientation === orientation) return;
    const { width, height } = this.state;
    this.update({ orientation, width: height, height: width });
  }

  setAvailable(available: boolean) {
    this.available = available;
    this.publish();
  }

  reset() {
    this.state = initial;
    this.setAvailable(true);
  }
}
