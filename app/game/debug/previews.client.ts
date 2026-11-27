import * as THREE from 'three';
import type { VolumeId } from '../contracts';
import { facilityStages } from '../core/descent-facility';
import { volumeById } from '../core/volumes';
import type { GateKind } from '../core/volumes';
import { makeEnvMap } from '../graphics/environment.client';
import { isOrbitGate } from '../core/orbit-gates';
import { GateGeometries, GateVisual } from '../graphics/gates.client';
import { PickupVisual } from '../graphics/pickup.client';
import type { MaterialLibrary } from '../graphics/materials/library.client';
import { surfaceIds, surfacePresets } from '../graphics/materials/presets';
import type { SurfaceChannel, SurfaceMaterialId } from '../graphics/materials/presets';
import { gateFamilies, gateOpeningAt, pickupCards } from './catalog';

type PreviewMode = 'lit' | 'effect' | 'raw' | 'model';
function paint(root: HTMLElement, id: string, source: HTMLCanvasElement, mode?: PreviewMode) {
  const target = root.querySelector<HTMLCanvasElement>(`canvas[data-preview="${id}"]`);
  if (!target) return;
  const ctx = target.getContext('2d')!;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0, target.width, target.height);
  target.dataset.ready = 'true';
  if (mode) target.dataset.mode = mode;
}

export function renderRawChannel(root: HTMLElement, materials: MaterialLibrary, id: SurfaceMaterialId, channel: SurfaceChannel) {
  const target = root.querySelector<HTMLCanvasElement>('[data-preview=surface-channel]');
  const image = materials.inspect(id, channel);
  if (!target || !image) return;
  target.width = image.width;
  target.height = image.height;
  target.getContext('2d')?.putImageData(image, 0, 0);
  target.dataset.ready = 'true';
  target.dataset.channel = channel;
  target.dataset.surface = id;
}

export function renderRawSurfaces(root: HTMLElement, materials: MaterialLibrary) {
  const canvas = document.createElement('canvas');
  for (const id of surfaceIds) {
    const image = materials.inspect(id, 'color')!;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')?.putImageData(image, 0, 0);
    paint(root, id, canvas, 'raw');
  }
}

/** A single detached WebGL canvas draws the isolated objects on demand. */
export type SpecimenLab = { kind: 'gates'; volume: VolumeId } | { kind: 'pickups' } | { kind: 'materials'; materials: MaterialLibrary };

export class ModelPreviews {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly pickups: PickupVisual[];
  private readonly geometries?: GateGeometries;
  private readonly gates = new Map<GateKind, { open: number; axis: number; visual: GateVisual }>();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly lab = new THREE.Scene();
  private environment?: THREE.WebGLRenderTarget;
  private angle = -20;
  private gateAngle = 0;
  private orbitClose = false;
  private animation = 0;
  private scanning = false;
  private lastScan = 0;
  private film?: THREE.Group;
  private lost = false;

  constructor(private readonly root: HTMLElement, private readonly specimen: SpecimenLab,
    private readonly onContext: (restored: boolean) => void) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { antialias: true });
    if (!context) throw new Error('WebGL2 is needed for 3D previews.');
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, context });
    this.pickups = specimen.kind === 'pickups' ? pickupCards.map(card => new PickupVisual(card.kind)) : [];
    if (specimen.kind === 'gates') this.geometries = new GateGeometries();
    this.configureOutput();
    this.renderer.setSize(432, 270, false);
    this.camera.position.z = 12;
    this.lab.background = new THREE.Color().setRGB(0.017, 0.025, 0.032);
    const key = new THREE.DirectionalLight(0xfff2dc, 3.8);
    key.position.set(-0.8, 1.3, 4);
    const fill = new THREE.DirectionalLight(0xb6e5ff, 1.6);
    fill.position.set(3, 1, 1.3);
    this.lab.add(key, fill, new THREE.HemisphereLight(0xe3f4ff, 0x42525e, 1.35));
    canvas.addEventListener('webglcontextlost', this.contextLost);
    canvas.addEventListener('webglcontextrestored', this.contextRestored);
  }

  private configureOutput() {
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x081216);
  }

  private frame(height: number) {
    this.camera.top = height / 2;
    this.camera.bottom = -this.camera.top;
    this.camera.right = this.camera.top * 432 / 270;
    this.camera.left = -this.camera.right;
    this.camera.updateProjectionMatrix();
  }

  drawPickups(angle: number) {
    this.angle = angle;
    if (this.lost) return;
    this.frame(1.8);
    for (const pickup of this.pickups) {
      pickup.update(0, 0);
      pickup.group.rotation.set(0.15, THREE.MathUtils.degToRad(angle), -0.17);
      this.scene.add(pickup.group);
      this.renderer.render(this.scene, this.camera);
      paint(this.root, pickup.kind, this.renderer.domElement);
      this.scene.remove(pickup.group);
    }
  }

  drawGates(angle = this.gateAngle, orbitClose = this.orbitClose) {
    this.gateAngle = angle;
    this.orbitClose = orbitClose;
    if (this.lost || !this.geometries || this.specimen.kind !== 'gates') return;
    const volume = volumeById(this.specimen.volume);
    for (const kind of gateFamilies[volume.id]) {
      const canvas = this.root.querySelector<HTMLCanvasElement>(`canvas[data-preview="${kind}"]`);
      if (!canvas) continue;
      this.frame(isOrbitGate(kind) && orbitClose ? 3.3 : 7.15);
      const selection = Number(canvas.dataset.open);
      const variant = gateOpeningAt(kind, selection, Number(canvas.dataset.axis));
      if (!variant) continue;
      const { open, axis } = variant;
      let specimen = this.gates.get(kind);
      if (!specimen || specimen.open !== open || specimen.axis !== axis) {
        const visual = new GateVisual(this.geometries, kind, open, axis);
        specimen?.visual.dispose();
        specimen = { open, axis, visual };
        this.gates.set(kind, specimen);
      }
      const gate = specimen.visual;
      gate.meshes[0].rotation.y = THREE.MathUtils.degToRad(angle);
      this.scene.add(...gate.meshes);
      try {
        const tint = kind === 'laser-matrix' ? facilityStages[1].glass[1]
          : kind === 'laser-slice' ? facilityStages[2].glass[1] : kind === 'laser-weave' ? facilityStages[3].glass[1] : undefined;
        gate.update(0, volume.hue[0], 8, 1, false, 1, 1, tint);
        this.renderer.render(this.scene, this.camera);
        paint(this.root, kind, this.renderer.domElement, 'model');
        canvas.dataset.renderedOpening = String(open);
        canvas.dataset.renderedAxis = String(axis);
      } finally {
        this.scene.remove(...gate.meshes);
      }
    }
  }

  private renderLab(id: string, object: THREE.Object3D, mode: PreviewMode, height = 3.35) {
    this.frame(height);
    this.lab.add(object);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    try {
      this.renderer.render(this.lab, this.camera);
      paint(this.root, id, this.renderer.domElement, mode);
    } finally {
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.lab.remove(object);
    }
  }

  drawMaterials() {
    if (this.lost || this.specimen.kind !== 'materials') return;
    const { materials } = this.specimen;
    if (this.renderer.extensions.has('EXT_color_buffer_float')) {
      this.environment ??= makeEnvMap(this.renderer);
      this.lab.environment = this.environment.texture;
    }
    const shape = new THREE.Shape();
    shape.moveTo(-1.7, -1.03); shape.lineTo(1.7, -1.03); shape.lineTo(1.7, 1.03);
    shape.lineTo(-1.7, 1.03); shape.closePath();
    const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 2 });
    const uv = slab.getAttribute('uv');
    const original = uv.clone();
    try {
      for (const id of surfaceIds) {
        const [u, v] = surfacePresets[id].tile;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, original.getX(i) / u, original.getY(i) / v);
        uv.needsUpdate = true;
        const specimen = new THREE.Mesh(slab, materials.get(id));
        specimen.rotation.set(-0.49, 0.20, -0.09);
        this.renderLab(id, specimen, 'lit');
      }
    } finally { slab.dispose(); }

    const channel = new THREE.Group();
    const tray = new THREE.BoxGeometry(3.4, 0.48, 0.17), core = new THREE.BoxGeometry(3.15, 0.14, 0.07);
    const insert = new THREE.Mesh(core, materials.getEffect('emissive-channel-cyan'));
    insert.position.z = 0.08;
    channel.add(new THREE.Mesh(tray, materials.get('alloy-satin-dark')), insert);
    channel.rotation.set(-0.46, 0.31, -0.12);
    try { this.renderLab('emissive-channel-cyan', channel, 'effect'); }
    finally { tray.dispose(); core.dispose(); }

    if (!this.film) {
      this.film = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.9), materials.getEffect('hologram-panel-cyan'));
      panel.position.z = 0.23;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.96, 0.12, 0.14), materials.get('alloy-brushed-tech'));
      this.film.add(back, panel);
      this.film.rotation.set(-0.39, 0.30, -0.10);
    }
    this.drawFilm(0.55);
  }

  private drawFilm(time: number) {
    if (!this.film || this.specimen.kind !== 'materials') return;
    const film = this.specimen.materials.getEffect('hologram-panel-cyan');
    if (!(film instanceof THREE.ShaderMaterial)) return;
    film.uniforms.uTime.value = time;
    this.renderLab('hologram-panel-cyan', this.film, 'effect');
  }

  setScan(on: boolean) {
    this.scanning = on;
    cancelAnimationFrame(this.animation);
    if (!on || this.lost) return;
    const tick = (now: number) => {
      if (now - this.lastScan >= 32 && !document.hidden) { this.drawFilm(now / 1000); this.lastScan = now; }
      if (this.scanning && !this.lost) this.animation = requestAnimationFrame(tick);
    };
    this.animation = requestAnimationFrame(tick);
  }

  private contextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    cancelAnimationFrame(this.animation);
    this.onContext(false);
  };

  private contextRestored = () => {
    this.lost = false;
    this.configureOutput();
    this.environment?.dispose();
    this.environment = undefined;
    this.lab.environment = null;
    try {
      this.drawPickups(this.angle);
      this.drawGates();
      this.drawMaterials();
      this.setScan(this.scanning);
      this.onContext(true);
    } catch { this.onContext(false); }
  };

  dispose() {
    this.setScan(false);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.contextLost);
    canvas.removeEventListener('webglcontextrestored', this.contextRestored);
    this.environment?.dispose();
    for (const gate of this.gates.values()) gate.visual.dispose();
    this.gates.clear();
    this.geometries?.dispose();
    for (const mesh of this.film?.children ?? []) if (mesh instanceof THREE.Mesh) mesh.geometry.dispose();
    this.pickups.forEach(pickup => pickup.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
