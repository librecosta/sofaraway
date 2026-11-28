import type { ToyPlatform } from '../platform';

type DevWindow = Window & { sofarawayDevContainer?: ToyPlatform };

export function installDevPlatform(platform: ToyPlatform) {
  const host: DevWindow = window;
  host.sofarawayDevContainer = platform;
  return () => { delete host.sofarawayDevContainer; };
}

export function readDevPlatform() {
  try { return (window.parent as DevWindow).sofarawayDevContainer; } catch { return undefined; }
}
