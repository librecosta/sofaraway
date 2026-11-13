import type { Diagnostics, Difficulty, PlayMode, QualityTier } from '../contracts';
import type { RouteKind } from '../core/branches';
import { Graphics } from '../graphics/scene.client';
import { OutroInspection, outroVolume } from './outro-inspection';
import type { OutroMovement } from './outro-inspection';

const flags: Diagnostics = { fixedTime: null, autoplay: false, god: false, align: false, boost: false,
  mobileQuality: false, post: true, record: false, debug: false };

export class OutroPreview {
  private readonly graphics: Graphics;
  private readonly resizeObserver: ResizeObserver;
  private mode?: PlayMode;
  private quality: QualityTier = 'high';
  private lost = false;
  private inspection?: OutroInspection;
  private view?: [number, number, OutroMovement, number];
  get lastView() { return this.view; }

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onContext: (ready: boolean) => void) {
    this.graphics = new Graphics(canvas, 'high', false, flags);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.resize();
  }

  select(mode: PlayMode, seed: number, route: RouteKind, difficulty: Difficulty) {
    const rebuild = this.mode !== mode;
    const inspection = this.inspection = new OutroInspection(mode, seed, route, rebuild ? undefined : this.graphics.path, difficulty);
    if (!this.lost && rebuild) {
      this.graphics.load(outroVolume, inspection.sim.path, mode);
      this.graphics.prepare();
      this.mode = mode;
    }
    return inspection;
  }

  setQuality(quality: QualityTier) {
    if (quality === this.quality) return;
    this.graphics.configure(quality, false);
    this.quality = quality;
    if (this.view) this.draw(...this.view);
  }

  draw(station: number, beat: number, movement: OutroMovement, angle: number) {
    this.view = [station, beat, movement, angle];
    if (this.lost || !this.inspection) return;
    const state = this.inspection.state(station, beat, movement);
    this.graphics.draw(state, true, true, { beat, yaw: angle * Math.PI / 180 });
    const metrics = this.graphics.metrics();
    Object.assign(this.canvas.dataset, { station: state.trackDistance.toFixed(6), routeArc: state.distance.toFixed(6),
      beat: state.beat.toFixed(3), hue: metrics.scenicLights?.hue, afterglow: metrics.scenicLights?.afterglow ?? '',
      mode: state.mode, difficulty: this.inspection.sim.difficulty, route: state.route, seed: this.inspection.plan.seed,
      encoreMeshes: metrics.encoreMeshes, pathLength: this.inspection.sim.path.length,
      gateStations: JSON.stringify(state.previewEncore.map(gate => [gate.index + 1, gate.kind, gate.worldStation])) });
  }

  private resize = () => {
    if (this.lost) return;
    const width = Math.max(1, this.canvas.clientWidth);
    this.graphics.resize(width, Math.round(width * 9 / 16), window.devicePixelRatio);
    if (this.view) this.draw(...this.view);
  };

  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.onContext(false);
  };

  private onRestored = () => {
    try {
      this.graphics.restore(outroVolume);
      const inspection = this.inspection;
      if (inspection && this.mode !== inspection.sim.mode) {
        this.graphics.load(outroVolume, inspection.sim.path, inspection.sim.mode);
        this.graphics.prepare();
        this.mode = inspection.sim.mode;
      }
      this.lost = false;
      this.resize();
      this.onContext(true);
    } catch { this.onContext(false); }
  };

  dispose() {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.graphics.dispose();
  }
}
