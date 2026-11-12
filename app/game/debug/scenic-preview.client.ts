import type { Diagnostics } from '../contracts';
import { STEP } from '../core/clock';
import { idleInput } from '../core/input';
import { makeScenicPlan } from '../core/scenic-plan';
import { CAPTURE_RUN_SEED } from '../core/run-seed';
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
    sim.start('normal', CAPTURE_RUN_SEED, undefined, example.mode ?? 'standard');
    let station = sim.reference.station(example.beat, sim.mode);
    if (example.zone || example.wall) {
      const plan = makeScenicPlan(volume, this.graphics.path!, sim.mode);
      if (example.zone) {
        const zone = plan.zones.find(zone => zone.kind === example.zone);
        if (zone) station = zone.startStation + 2;
      } else {
        const wall = plan.placements.reduce<(typeof plan.placements)[number] | undefined>((best, part) =>
          part.kind === example.wall && (!best || Math.abs(part.station - station) < Math.abs(best.station - station)) ? part : best, undefined);
        if (wall) station = wall.station - 8;
      }
    }
    const input = example.boost ? { ...idleInput, boosting: true } : idleInput;
    while (sim.phase === 'playing' && sim.trackDistance < station) sim.step(STEP, input);
    this.sim = sim;
    this.canvas.dataset.station = sim.trackDistance.toFixed(6);
    this.canvas.dataset.route = sim.route ?? '';
    return { seconds: sim.time, beat: sim.beat };
  }

  draw(lighting: LightingPreview) {
    this.lighting = lighting;
    if (this.lost || !this.sim) return;
    this.graphics.draw(this.sim, true, true, lighting);
    const light = this.graphics.metrics().scenicLights;
    this.canvas.dataset.ready = 'true';
    this.canvas.dataset.lightBeat = lighting.beat.toFixed(3);
    this.canvas.dataset.zone = light?.zone ?? '';
    this.canvas.dataset.hue = String(light?.hue ?? 0);
    this.canvas.dataset.rim = JSON.stringify(light?.rim);
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
