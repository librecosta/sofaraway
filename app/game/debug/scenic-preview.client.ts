import type { Diagnostics, PlayMode } from '../contracts';
import { STEP } from '../core/clock';
import { idleInput } from '../core/input';
import { CAPTURE_RUN_SEED } from '../core/run-seed';
import { volumeById } from '../core/volumes';
import { Simulation } from '../core/simulation';
import { Graphics } from '../graphics/scene.client';
import type { LightingPreview } from '../graphics/corridor-lights.client';
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
  private mode?: PlayMode;
  private station?: number;
  private lighting: LightingPreview = { beat: 0 };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onContext: (ready: boolean) => void) {
    const graphics = this.graphics = new Graphics(canvas, 'high', false, flags);
    try {
      graphics.resize(800, 450, 1);
      canvas.addEventListener('webglcontextlost', this.onLost);
      canvas.addEventListener('webglcontextrestored', this.onRestored);
    } catch (error) {
      graphics.dispose();
      throw error;
    }
  }

  select(example: ScenicExample, mode: PlayMode, fixedBeat: number) {
    const rebuild = this.mode !== mode;
    const sim = new Simulation(volume, { align: true, branchSide: example.side },
      rebuild ? undefined : this.graphics.path, mode);
    if (rebuild) {
      this.graphics.load(volume, sim.path, mode);
      this.graphics.prepare();
      this.mode = mode;
    }
    sim.start('normal', CAPTURE_RUN_SEED, undefined, mode);
    let station = sim.reference.station(fixedBeat, mode);
    if (example.curveT !== undefined) {
      const curve = sim.path.segments.find(seg => seg.type === 's-curve')!;
      const i = example.curveT * (curve.arc.length - 1);
      const lo = Math.floor(i), hi = Math.ceil(i);
      station = curve.s0 + curve.arc[lo] + (curve.arc[hi] - curve.arc[lo]) * (i - lo);
    }
    const input = example.boost ? { ...idleInput, boosting: true } : idleInput;
    while (sim.phase === 'playing' && sim.trackDistance < station) sim.step(STEP, input);
    this.sim = sim;
    this.station = example.curveT === undefined ? undefined : station;
    const actual = this.station ?? sim.trackDistance;
    this.canvas.dataset.station = actual.toFixed(6);
    this.canvas.dataset.mode = mode;
    this.canvas.dataset.route = sim.route ?? '';
    return { seconds: sim.time, beat: sim.beat, station: actual };
  }

  draw(lighting: LightingPreview) {
    this.lighting = lighting;
    if (this.lost || !this.sim) return;
    this.graphics.draw(this.sim, true, true, { ...lighting, station: this.station });
    const { scenicLights: light, routeLighting } = this.graphics.metrics();
    this.canvas.dataset.ready = 'true';
    this.canvas.dataset.lightBeat = lighting.beat.toFixed(3);
    this.canvas.dataset.zone = light?.zone ?? '';
    const tone = this.sim.route && this.sim.trackDistance < (this.sim.junctionPath?.end ?? 0)
      ? routeLighting?.[this.sim.route] : undefined;
    this.canvas.dataset.hue = String(tone?.hue ?? light?.hue ?? 0);
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
