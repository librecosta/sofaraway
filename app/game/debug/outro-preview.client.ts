import type { Diagnostics, Difficulty, PlayMode, QualityTier } from '../contracts';
import type { RouteKind } from '../core/branches';
import { referenceFor } from '../core/reference-track';
import { dynamicLightEnvelope } from '../core/rhythmic-lights';
import type { VolumeDefinition } from '../core/volumes';
import type { CirrusLayer } from '../graphics/daybreak-cirrus';
import { Graphics } from '../graphics/scene.client';
import { exteriorViews, OutroInspection, outroVolume } from './outro-inspection';
import type { ExteriorView, OutroMovement } from './outro-inspection';
import type { SceneState } from '../graphics/scene.client';

const flags: Diagnostics = { fixedTime: null, autoplay: false, god: false, align: false, boost: false,
  mobileQuality: false, post: true, record: false, debug: false };

export class OutroPreview {
  private readonly graphics: Graphics;
  private readonly resizeObserver: ResizeObserver;
  private mode?: PlayMode;
  private volume = outroVolume;
  private quality: QualityTier = 'high';
  private lost = false;
  private dynamic = false;
  private exteriorView: ExteriorView = 'Forward';
  private cirrusLayer: CirrusLayer = 'Composite';
  private inspection?: OutroInspection;
  private view?: [number, number, OutroMovement, number, boolean?];
  private roaming?: ['menu' | 'results', number, number];
  get lastView() { return this.view; }

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onContext: (ready: boolean) => void,
    private readonly showContinuity: (summary: string) => void = () => {}) {
    this.graphics = new Graphics(canvas, 'high', false, flags);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.resize();
  }

  select(mode: PlayMode, seed: number, route: RouteKind, difficulty: Difficulty, volume: VolumeDefinition = outroVolume) {
    const reference = referenceFor(volume, mode === 'standard' ? difficulty : 'normal');
    const rebuild = this.mode !== mode || this.volume !== volume ||
      (this.graphics.path?.reference ?? referenceFor(volume)) !== reference;
    const inspection = this.inspection = new OutroInspection(mode, seed, route, rebuild ? undefined : this.graphics.path, difficulty, volume);
    if (!this.lost && rebuild) {
      this.graphics.load(volume, inspection.sim.path, mode);
      this.graphics.prepare();
      this.mode = mode;
      this.volume = volume;
    }
    return inspection;
  }

  setQuality(quality: QualityTier) {
    if (quality === this.quality) return;
    this.graphics.configure(quality, false);
    this.quality = quality;
    this.redraw();
  }

  setDynamic(value: boolean) {
    if (this.dynamic === value) return;
    this.dynamic = value;
    this.redraw();
  }

  setExteriorView(value: ExteriorView) {
    if (this.exteriorView === value) return;
    this.exteriorView = value;
    this.redraw();
  }

  setCirrusLayer(value: CirrusLayer) {
    if (this.cirrusLayer === value) return;
    this.cirrusLayer = value;
    this.redraw();
  }

  draw(station: number, beat: number, movement: OutroMovement, angle: number, results = false) {
    this.roaming = undefined;
    this.view = [station, beat, movement, angle, results];
    if (this.lost || !this.inspection) return;
    this.paint(this.inspection.state(station, beat, movement, results), angle);
  }

  roam(phase: 'menu' | 'results', minutes: number, angle: number) {
    if (this.lost || !this.inspection) return;
    this.roaming = [phase, minutes, angle];
    this.paint(this.inspection.roam(phase, minutes), angle);
  }

  private paint(state: SceneState, angle: number) {
    const inspection = this.inspection!;
    const dynamics = this.dynamic && this.volume.id === 'daybreak'
      ? dynamicLightEnvelope(this.volume, state.time, 1, matchMedia('(prefers-reduced-motion: reduce)').matches) : undefined;
    const [yaw, pitch, cameraLift] = exteriorViews[this.volume.id === 'daybreak' ? this.exteriorView : 'Forward'];
    this.graphics.setCirrusLayer(this.cirrusLayer);
    this.graphics.draw(state, true, true, { beat: state.beat, yaw: (angle + yaw) * Math.PI / 180,
      pitch: pitch * Math.PI / 180, cameraLift, dynamics });
    const metrics = this.graphics.metrics();
    const station = state.trackDistance;
    const stage = inspection.plan.afterglow.find(slice => station >= slice.start && station <= slice.end)?.stage;
    const white = this.volume.id === 'daybreak' ? (state.escapeWhite ?? 0) * .99 : 0;
    this.canvas.parentElement?.style.setProperty('--escape-white', String(white));
    Object.assign(this.canvas.dataset, { station: state.trackDistance.toFixed(6), routeArc: state.distance.toFixed(6),
      beat: state.beat.toFixed(3), hue: metrics.scenicLights?.hue, afterglow: metrics.scenicLights?.afterglow ?? stage ?? '',
      mode: state.mode, phase: state.phase, difficulty: inspection.sim.difficulty, route: state.route, seed: inspection.plan.seed,
      pickup: state.pickupVisible, escapeWhite: white, skyDaylight: metrics.skyDaylight ?? '', junctionMeshes: metrics.junctionMeshes,
      exterior: JSON.stringify(metrics.exterior ?? null), cameraY: this.graphics.camera?.position.y,
      junctionLight: metrics.junctionLightLevel?.toFixed(4) ?? '', routeHologram: JSON.stringify(metrics.routeHologram ?? null),
      previewGates: JSON.stringify(state.previewGates.filter(gate => gate.routeStation > state.distance).slice(0, 3)
        .map(gate => [gate.kind, gate.open, +(gate.routeStation - state.distance).toFixed(2)])),
      encoreMeshes: metrics.encoreMeshes, pathLength: inspection.sim.path.length,
      gateStations: JSON.stringify(state.previewEncore.map(gate => [gate.index + 1, gate.kind, gate.worldStation])) });
    const world = metrics.continuity;
    this.showContinuity(world ? `${state.phase.toUpperCase()} · Camera ${station.toFixed(1)} / ${inspection.sim.path.length.toFixed(1)} · `
      + `Near ${world.near.map(range => range.join('–')).join(', ')} · Far ${world.far} chunks through ${world.farThrough.toFixed(1)} `
      + `(${(world.farBytes / 1024).toFixed(1)} KiB) · Junction ${metrics.junctionMeshes} meshes` : '');
  }

  private resize = () => {
    if (this.lost) return;
    const width = Math.max(1, this.canvas.clientWidth);
    this.graphics.resize(width, Math.round(width * 9 / 16), window.devicePixelRatio);
    this.redraw();
  };

  private redraw() {
    if (this.roaming) this.roam(...this.roaming);
    else if (this.view) this.draw(...this.view);
  }

  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.onContext(false);
  };

  private onRestored = () => {
    try {
      const inspection = this.inspection;
      this.graphics.restore(this.volume);
      if (inspection && (this.mode !== inspection.sim.mode || this.volume !== inspection.volume || this.graphics.path !== inspection.sim.path)) {
        this.graphics.load(inspection.volume, inspection.sim.path, inspection.sim.mode);
        this.graphics.prepare();
        this.mode = inspection.sim.mode;
        this.volume = inspection.volume;
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
