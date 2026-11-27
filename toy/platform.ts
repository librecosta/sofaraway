export const safeAreaEdges = ['top', 'right', 'bottom', 'left'] as const;

export interface ToyContainerState {
  readonly device: 'desktop' | 'android' | 'ios';
  readonly orientation: 'portrait' | 'landscape';
  readonly immersive: boolean;
  readonly width: number;
  readonly height: number;
  readonly safeArea: Readonly<Record<typeof safeAreaEdges[number], number>>;
}

/** A null snapshot means native container capabilities are unavailable. */
export interface ToyPlatform {
  getSnapshot(): ToyContainerState | null;
  subscribe(listener: () => void): () => void;
}
