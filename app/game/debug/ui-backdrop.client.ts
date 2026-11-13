import type { GameSnapshot } from '../contracts';
import { Simulation } from '../core/simulation';
import { idleInput } from '../core/input';
import { volumeById } from '../core/volumes';
import { Graphics } from '../graphics/scene.client';

export class UIBackdrop {
  private readonly graphics: Graphics;
  private sim?: Simulation;
  private lost = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly ready: (ready: boolean) => void) {
    this.graphics = new Graphics(canvas, 'low', false, {
      fixedTime: null, autoplay: false, god: false, align: false, boost: false,
      mobileQuality: false, post: true, record: false, debug: false,
    });
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  render({ volumeId }: Pick<GameSnapshot, 'volumeId'>) {
    if (this.lost) return;
    const volume = volumeById(volumeId);
    if (!this.sim || this.sim.volume !== volume) {
      this.sim = new Simulation(volume);
      this.graphics.load(volume, this.sim.path);
      this.sim.step(2, idleInput);
    }
    const rect = this.canvas.getBoundingClientRect();
    this.graphics.resize(rect.width, rect.height, 1);
    this.graphics.draw(this.sim, true);
    this.ready(true);
  }

  private onLost = (event: Event) => { event.preventDefault(); this.lost = true; this.ready(false); };
  private onRestored = () => {
    this.lost = false;
    if (!this.sim) return;
    try {
      this.graphics.restore(this.sim.volume);
      this.render({ volumeId: this.sim.volume.id });
    } catch { this.ready(false); }
  };

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.graphics.dispose();
  }
}
