import type { Diagnostics } from '../contracts';
import { STEP } from '../core/clock';
import { idleInput } from '../core/input';
import { volumeById } from '../core/volumes';
import { Simulation } from '../core/simulation';
import { Graphics } from '../graphics/scene.client';
import type { LightingPreview } from '../graphics/scenic-lighting.client';
import type { ScenicExample } from './scenic-catalog';

const volume = volumeById('elsewhere');
const flags: Diagnostics = {
  fixedTime: null, autoplay: false, god: false, align: true, boost: false,
  mobileQuality: false, post: true, record: false, debug: false,
};

/** One renderer for all lighting comparisons, independent of the specimen renderer. */
export class ScenicPreview {
  private readonly graphics: Graphics;
  private sim?: Simulation;
  private lost = false;
  private lighting: LightingPreview = { beat: 0 };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onContext: (ready: boolean) => void) {
    const graphics = this.graphics = new Graphics(canvas, 'high', false, flags);
    try {
      graphics.resize(800, 450, 1);
      graphics.load(volume);
      graphics.prepare();
      canvas.addEventListener('webglcontextlost', this.onLost);
      canvas.addEventListener('webglcontextrestored', this.onRestored);
    } catch (error) {
      graphics.dispose();
      throw error;
    }
  }

  select(example: ScenicExample) {
    const sim = new Simulation(volume, { align: true, branchSide: example.side }, this.graphics.path);
    sim.start('normal', 0, undefined, example.mode ?? 'standard');
    const station = sim.reference.station(example.beat, sim.mode);
    const input = example.boost ? { ...idleInput, boosting: true } : idleInput;
    while (sim.phase === 'playing' && sim.trackDistance < station) sim.step(STEP, input);
    this.sim = sim;
    this.canvas.dataset.station = sim.trackDistance.toFixed(6);
    this.canvas.dataset.route = sim.route ?? '';
    return sim.time;
  }

  draw(lighting: LightingPreview) {
    this.lighting = lighting;
    if (this.lost || !this.sim) return;
    this.graphics.draw(this.sim, true, true, lighting);
    this.canvas.dataset.ready = 'true';
    this.canvas.dataset.lightBeat = lighting.beat.toFixed(3);
  }

  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.onContext(false);
  };
  private onRestored = () => {
    try {
      this.graphics.restore(volume);
      this.lost = false;
      this.draw(this.lighting);
      this.onContext(true);
    } catch { this.onContext(false); }
  };

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.graphics.dispose();
  }
}
