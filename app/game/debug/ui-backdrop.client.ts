import type { VolumeId } from '../contracts';
import { Simulation } from '../core/simulation';
import { idleInput } from '../core/input';
import { volumeById } from '../core/volumes';
import { PreviewSurface } from './preview-surface.client';

export class UIBackdrop {
  private readonly surface: PreviewSurface;
  private get graphics() { return this.surface.graphics; }
  private sim?: Simulation;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly volumeId: () => VolumeId,
    private readonly ready: (ready: boolean) => void) {
    this.surface = new PreviewSurface(canvas, 'low', false, {
      fixedTime: null, autoplay: false, god: false, align: false, boost: false,
      mobileQuality: false, post: true, record: false, debug: false,
    });
    this.surface.observe({ resize: () => this.render(),
      lost: () => ready(false),
      restore: () => {
        if (this.sim) this.graphics.restore(this.sim.volume);
        this.render();
      },
      failed: () => ready(false),
    });
    this.render();
  }

  render() {
    if (this.surface.unavailable) return;
    this.surface.initialize(() => {
      const volume = volumeById(this.volumeId());
      if (!this.sim || this.sim.volume !== volume) {
        this.sim = new Simulation(volume);
        this.graphics.load(volume, this.sim.path);
        this.sim.step(2, idleInput);
      }
      const rect = this.canvas.getBoundingClientRect();
      this.graphics.resize(rect.width, rect.height, 1);
      this.graphics.draw(this.sim, true);
      this.ready(true);
    });
  }

  dispose() { this.surface.dispose(); }
}
