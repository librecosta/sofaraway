import type { Diagnostics, PlayMode, QualityTier, VolumeId } from '../contracts';
import { STEP } from '../core/clock';
import { idleInput } from '../core/input';
import { CAPTURE_RUN_SEED } from '../core/run-seed';
import { volumeById } from '../core/volumes';
import { Simulation } from '../core/simulation';
import type { CirrusLayer } from '../graphics/daybreak-cirrus';
import type { LightingPreview } from '../graphics/corridor-lights.client';
import { PreviewSurface } from './preview-surface.client';
import type { ScenicExample } from './scenic-catalog';

const flags: Diagnostics = {
  fixedTime: null, autoplay: false, god: false, align: true, boost: false,
  mobileQuality: false, post: true, record: false, debug: false,
};

/** One renderer for all lighting comparisons, independent of the specimen renderer. */
export class ScenicPreview {
  private readonly surface: PreviewSurface;
  private get graphics() { return this.surface.graphics; }
  private sim?: Simulation;
  private mode?: PlayMode;
  private volume = volumeById('elsewhere');
  private quality: QualityTier = 'high';
  private station?: number;
  private dpr = 1;
  private sized: { width: number; dpr: number } | undefined;
  private lighting: LightingPreview = { beat: 0 };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onContext: (ready: boolean, failed?: boolean) => void) {
    this.surface = new PreviewSurface(canvas, 'high', false, flags);
    this.surface.initialize(() => this.graphics.resize(800, 450, 1));
    this.surface.observe({
      resize: () => {
        this.configure(this.quality, window.devicePixelRatio);
        this.draw(this.lighting);
      },
      lost: () => {
        this.sized = undefined;
        delete canvas.dataset.ready;
        onContext(false);
      },
      restore: () => {
        this.graphics.restore(this.volume);
        this.resize();
        this.draw(this.lighting);
        onContext(true);
      },
      failed: () => { delete canvas.dataset.ready; onContext(false, true); },
    });
  }

  select(example: ScenicExample, mode: PlayMode, fixedBeat: number, id: VolumeId = 'elsewhere', fixedStation?: number) {
    if (this.surface.unavailable) return;
    try {
      return this.surface.initialize(() => this.selectScene(example, mode, fixedBeat, id, fixedStation));
    } catch {
      delete this.canvas.dataset.ready;
      this.onContext(false, true);
    }
  }

  private selectScene(example: ScenicExample, mode: PlayMode, fixedBeat: number, id: VolumeId, fixedStation?: number) {
    const volume = volumeById(id);
    const rebuild = this.mode !== mode || this.volume !== volume;
    const sim = new Simulation(volume, { align: true, branchSide: example.side },
      rebuild ? undefined : this.graphics.path, mode);
    if (rebuild) {
      this.graphics.load(volume, sim.path, mode);
      this.graphics.prepare();
      this.mode = mode;
      this.volume = volume;
    }
    sim.start('normal', CAPTURE_RUN_SEED, undefined, mode);
    let station = fixedStation ?? sim.reference.station(fixedBeat, mode);
    if (example.curveT !== undefined) {
      const curve = sim.path.segments.find(seg => seg.type === 's-curve')!;
      const i = example.curveT * (curve.arc.length - 1);
      const lo = Math.floor(i), hi = Math.ceil(i);
      station = curve.s0 + curve.arc[lo] + (curve.arc[hi] - curve.arc[lo]) * (i - lo);
    }
    const input = example.boost ? { ...idleInput, boosting: true } : idleInput;
    while (sim.phase === 'playing' && sim.trackDistance < station) sim.step(STEP, input);
    this.sim = sim;
    this.station = example.curveT === undefined ? fixedStation : station;
    const actual = this.station ?? sim.trackDistance;
    this.canvas.dataset.station = actual.toFixed(6);
    this.canvas.dataset.mode = mode;
    this.canvas.dataset.route = sim.route ?? '';
    return { seconds: sim.time, beat: sim.beat, station: actual };
  }

  configure(quality: QualityTier, dpr = 1) {
    this.dpr = dpr;
    if (this.surface.unavailable) return;
    if (quality !== this.quality) {
      this.graphics.configure(quality, false);
      this.quality = quality;
    }
    this.resize();
  }

  private resize() {
    if (this.surface.unavailable) return;
    const width = Math.min(1280, Math.max(1, this.canvas.clientWidth));
    if (this.sized?.width === width && this.sized.dpr === this.dpr) return;
    this.sized = { width, dpr: this.dpr };
    this.graphics.resize(width, Math.round(width * 9 / 16), this.dpr);
  }

  setCirrusLayer(layer: CirrusLayer) {
    this.graphics.setCirrusLayer(layer);
  }

  advance(toSeconds: number, boost: boolean) {
    const sim = this.sim;
    if (this.surface.unavailable || !sim) return;
    const input = boost ? { ...idleInput, boosting: true } : idleInput;
    while (sim.phase === 'playing' && sim.time + STEP * .5 < toSeconds) sim.step(STEP, input);
    this.station = undefined;
    this.canvas.dataset.station = sim.trackDistance.toFixed(6);
    this.canvas.dataset.route = sim.route ?? '';
    return sim.trackDistance;
  }

  draw(lighting: LightingPreview) {
    this.lighting = lighting;
    if (this.surface.unavailable || !this.sim) return;
    this.graphics.draw(this.sim, true, true, { ...lighting, station: this.station });
    const metrics = this.graphics.metrics();
    const { scenicLights: light, routeLighting, descentLighting } = metrics;
    this.canvas.dataset.ready = 'true';
    this.canvas.dataset.lightBeat = lighting.beat.toFixed(3);
    this.canvas.dataset.zone = light?.zone ?? '';
    const tone = this.sim.route && this.sim.trackDistance < (this.sim.junctionPath?.end ?? 0)
      ? routeLighting?.[this.sim.route] : undefined;
    this.canvas.dataset.hue = String(tone?.hue ?? light?.hue ?? 0);
    this.canvas.dataset.rim = JSON.stringify(light?.rim);
    this.canvas.dataset.volume = this.volume.id;
    this.canvas.dataset.quality = this.quality;
    this.canvas.dataset.reducedMotion = String(!!lighting.reducedMotion);
    this.canvas.dataset.exterior = JSON.stringify(metrics.exterior ?? null);
    this.canvas.dataset.skyDaylight = String(metrics.skyDaylight ?? '');
    this.canvas.dataset.cameraY = String(this.graphics.camera?.position.y ?? '');
    if (descentLighting) {
      this.canvas.dataset.lightPhrase = String(descentLighting.phrase);
      this.canvas.dataset.lightAmount = descentLighting.amount.toFixed(3);
      this.canvas.dataset.fixtures = JSON.stringify(descentLighting.fixtures);
    }
    return metrics;
  }

  dispose() { this.surface.dispose(); }
}
