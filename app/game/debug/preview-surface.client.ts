import type { Diagnostics, QualityTier } from '../contracts';
import { Graphics } from '../graphics/scene.client';

interface SurfaceEvents {
  resize(): void;
  lost(): void;
  restore(): void;
  failed(): void;
}

/** Owns one Graphics instance and its canvas subscriptions. Callbacks run synchronously. */
export class PreviewSurface {
  readonly graphics: Graphics;
  private readonly events = new AbortController();
  private observer?: ResizeObserver;
  private interrupted = false;

  constructor(private readonly canvas: HTMLCanvasElement, tier: QualityTier, mobile: boolean, flags: Diagnostics) {
    this.graphics = new Graphics(canvas, tier, mobile, flags);
  }

  get unavailable() { return this.interrupted || this.events.signal.aborted; }

  initialize<T>(setup: () => T): T {
    try { return setup(); }
    catch (error) { this.dispose(); throw error; }
  }

  observe({ resize, lost, restore, failed }: SurfaceEvents) {
    const { signal } = this.events;
    const attempt = (update: () => void) => {
      try { update(); }
      catch { this.dispose(); failed(); }
    };
    this.initialize(() => {
      this.observer = new ResizeObserver(() => {
        if (!this.unavailable) attempt(resize);
      });
      this.observer.observe(this.canvas);
      this.canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        if (this.unavailable) return;
        this.interrupted = true;
        attempt(lost);
      }, { signal });
      this.canvas.addEventListener('webglcontextrestored', () => {
        if (signal.aborted || !this.interrupted) return;
        this.interrupted = false;
        attempt(restore);
      }, { signal });
    });
  }

  dispose() {
    if (this.events.signal.aborted) return;
    this.events.abort();
    this.observer?.disconnect();
    this.graphics.dispose();
  }
}
