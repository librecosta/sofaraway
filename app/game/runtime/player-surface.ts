import type { OrientationPreference } from '../contracts';

export interface PlayerSurfaceState {
  readonly lifecycle: 'active' | 'suspended' | 'closed';
  readonly container: {
    readonly orientation: OrientationPreference;
    readonly width: number;
    readonly height: number;
  } | null;
}

export interface PlayerSurface {
  getSnapshot(): PlayerSurfaceState;
  subscribe(listener: () => void): () => void;
}
