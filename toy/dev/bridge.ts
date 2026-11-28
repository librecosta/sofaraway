import type { MockToyPlatform } from './mock-platform';

type DevWindow = Window & { sofarawayDevContainer?: MockToyPlatform };

export function installDevPlatform(platform: MockToyPlatform) {
  const host: DevWindow = window;
  host.sofarawayDevContainer = platform;
  return () => { delete host.sofarawayDevContainer; };
}

export function readDevPlatform() {
  try { return (window.parent as DevWindow).sofarawayDevContainer; } catch { return undefined; }
}
