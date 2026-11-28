import type { PlayerSurface, PlayerSurfaceState } from '../app/game/runtime/player-surface';
import type { LeaderboardPlatform } from './leaderboard-contract';
import type { CloudPlatform, SharePlatform } from './player-services';

export const safeAreaEdges = ['top', 'right', 'bottom', 'left'] as const;

export type SafeArea = Readonly<Record<typeof safeAreaEdges[number], number>>;
export type ContainerMode = Pick<ToyContainerState, 'orientation' | 'immersive'>;

export interface ToyContainerState {
  readonly device: 'phone' | 'tablet' | 'desktop' | 'unknown';
  readonly orientation: 'portrait' | 'landscape';
  readonly immersive: boolean;
  readonly width: number;
  readonly height: number;
  readonly safeArea: SafeArea;
}

export interface ToyPlatformState extends PlayerSurfaceState {
  readonly container: ToyContainerState | null;
  readonly canChangeMode: boolean;
}

export const browserSurface: ToyPlatformState = { container: null, lifecycle: 'active', canChangeMode: false };

export interface ToyPlatform extends PlayerSurface {
  readonly leaderboard?: LeaderboardPlatform;
  readonly cloud?: CloudPlatform;
  readonly sharing?: SharePlatform;
  getSnapshot(): ToyPlatformState;
  /** The platform acknowledges the call. A matching snapshot confirms the result. */
  requestMode(mode: ContainerMode): Promise<void>;
}

export function confirmContainerMode(platform: ToyPlatform, mode: ContainerMode, signal: AbortSignal) {
  return new Promise<boolean>(resolve => {
    if (signal.aborted || !platform.getSnapshot().canChangeMode) return resolve(false);
    let settled = false;
    function finish(success: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener('abort', cancel);
      resolve(success);
    }
    const cancel = () => finish(false);
    const check = () => {
      const { container, canChangeMode, lifecycle } = platform.getSnapshot();
      if (!canChangeMode || lifecycle === 'closed') return cancel();
      if (container?.orientation === mode.orientation && container.immersive === mode.immersive) finish(true);
    };
    const timer = setTimeout(cancel, 2500);
    const unsubscribe = platform.subscribe(check);
    signal.addEventListener('abort', cancel, { once: true });
    check();
    if (!settled) {
      try { void platform.requestMode(mode).catch(cancel); } catch { cancel(); }
    }
  });
}
