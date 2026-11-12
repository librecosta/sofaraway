import * as THREE from 'three';
import type { Diagnostics } from '../contracts';
import { STEP } from '../core/clock';
import { opening } from '../core/collision';
import { structureKinds } from '../core/dressing';
import type { StructureKind } from '../core/dressing';
import { idleInput } from '../core/input';
import { Simulation } from '../core/simulation';
import { volumeById } from '../core/volumes';
import { makeEnvMap, makeSky } from '../graphics/environment.client';
import { buildDressingModel, createKitLight } from '../graphics/dressing-kit.client';
import { GateGeometries, GateVisual, THICKNESS } from '../graphics/gates.client';
import { PickupVisual } from '../graphics/pickup.client';
import { Graphics } from '../graphics/scene.client';
import type { MaterialLibrary } from '../graphics/materials/library.client';
import { surfaceIds, surfacePresets } from '../graphics/materials/presets';
import type { SurfaceChannel, SurfaceMaterialId } from '../graphics/materials/presets';
import { catalog, pickupCards } from './catalog';

const flags: Diagnostics = {
  fixedTime: null, autoplay: false, god: false, align: true, boost: false,
  mobileQuality: false, post: true, record: false, debug: false,
};

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

export function renderEnvironment(root: HTMLElement) {
  for (const [volumeId, id] of [['drift', 'sky'], ['orbit', 'stars']] as const) {
    const sky = makeSky(volumeById(volumeId));
    if (!sky) continue;
    try { paint(root, id, sky.image); } finally { sky.dispose(); }
  }
}

export function renderWorlds(root: HTMLElement) {
  const canvas = document.createElement('canvas');
  const graphics = new Graphics(canvas, 'high', false, flags);
  try {
    graphics.resize(640, 360, 1);
    for (const { volume, seconds } of catalog) {
      const sim = new Simulation(volume, { align: true });
      sim.start('normal');
      for (let n = 0; n < Math.floor(seconds / STEP); n++) sim.step(STEP, idleInput);
      graphics.load(volume);
      graphics.draw(sim, true);
      paint(root, volume.id, canvas);
    }
  } finally {
    graphics.dispose();
  }
}

/** A single detached WebGL canvas draws the isolated objects on demand. */
export class ModelPreviews {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly pickups = pickupCards.map(card => new PickupVisual(card.kind));
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly lab = new THREE.Scene();
  private environment?: THREE.WebGLRenderTarget;
  private angle = -20;
  private animation = 0;
  private scanning = false;
  private lastScan = 0;
  private film?: THREE.Group;
  private readonly kit = new Map<StructureKind, { display: THREE.Group; body: THREE.Group; center: THREE.Vector3; scale: number }>();
  private readonly kitLight = createKitLight();
  private kitAngle = 28;
  private lost = false;

  constructor(private readonly root: HTMLElement, private readonly materials: MaterialLibrary,
    private readonly onContext: (restored: boolean) => void) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { antialias: true });
    if (!context) {
      this.pickups.forEach(pickup => pickup.dispose());
      throw new Error('WebGL2 is needed for 3D previews.');
    }
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, context });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x081216);
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

  drawGates() {
    this.frame(7.15);
    const geometries = new GateGeometries();
    try {
      for (const { volume, gates } of catalog) {
        for (const kind of gates) {
          const gate = new GateVisual(geometries, kind, opening(kind, 1), 0);
          if (gate.meshes[1]) gate.meshes[1].position.z = -THICKNESS;
          this.scene.add(...gate.meshes);
          try {
            gate.update(0, volume.hue[0], 8, 1, false);
            this.renderer.render(this.scene, this.camera);
            paint(this.root, kind, this.renderer.domElement);
          } finally {
            this.scene.remove(...gate.meshes);
            gate.dispose();
          }
        }
      }
    } finally { geometries.dispose(); }
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
        const specimen = new THREE.Mesh(slab, this.materials.get(id));
        specimen.rotation.set(-0.49, 0.20, -0.09);
        this.renderLab(id, specimen, 'lit');
      }
    } finally { slab.dispose(); }

    const channel = new THREE.Group();
    const tray = new THREE.BoxGeometry(3.4, 0.48, 0.17), core = new THREE.BoxGeometry(3.15, 0.14, 0.07);
    const insert = new THREE.Mesh(core, this.materials.getEffect('emissive-channel-cyan'));
    insert.position.z = 0.08;
    channel.add(new THREE.Mesh(tray, this.materials.get('alloy-satin-dark')), insert);
    channel.rotation.set(-0.46, 0.31, -0.12);
    try { this.renderLab('emissive-channel-cyan', channel, 'effect'); }
    finally { tray.dispose(); core.dispose(); }

    if (!this.film) {
      this.film = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.9), this.materials.getEffect('hologram-panel-cyan'));
      panel.position.z = 0.23;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.96, 0.12, 0.14), this.materials.get('alloy-brushed-tech'));
      this.film.add(back, panel);
      this.film.rotation.set(-0.39, 0.30, -0.10);
    }
    this.drawFilm(0.55);
  }

  private drawFilm(time: number) {
    const film = this.materials.getEffect('hologram-panel-cyan');
    if (!this.film || !(film instanceof THREE.ShaderMaterial)) return;
    film.uniforms.uTime.value = time;
    this.renderLab('hologram-panel-cyan', this.film, 'effect');
  }

  drawDressing(angle = this.kitAngle) {
    this.kitAngle = angle;
    if (this.lost) return;
    for (const kind of structureKinds) {
      let view = this.kit.get(kind);
      if (!view) {
        const display = new THREE.Group(), body = new THREE.Group();
        for (const { geometry, material } of buildDressingModel(kind, this.materials, this.kitLight)) body.add(new THREE.Mesh(geometry, material));
        const bounds = new THREE.Box3().setFromObject(body);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const scale = Math.min(3.7 / size.x, 2.18 / size.y);
        body.scale.setScalar(scale);
        display.add(body);
        view = { display, body, center, scale };
        this.kit.set(kind, view);
      }
      view.body.position.copy(view.center).multiplyScalar(-view.scale);
      view.body.rotation.set(0, 0, 0, 'ZXY');
      view.display.rotation.set(kind === 'overhead-assembly' ? -.33 : .30, THREE.MathUtils.degToRad(angle), -.035);
      this.renderLab(kind, view.display, 'model', 2.9);
    }
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
    this.environment?.dispose();
    this.environment = undefined;
    this.lab.environment = null;
    try {
      this.drawPickups(this.angle);
      this.drawGates();
      this.drawMaterials();
      this.drawDressing();
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
    for (const mesh of this.film?.children ?? []) if (mesh instanceof THREE.Mesh) mesh.geometry.dispose();
    for (const { display } of this.kit.values()) display.traverse(object => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.kit.clear();
    this.kitLight.dispose();
    this.pickups.forEach(pickup => pickup.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
