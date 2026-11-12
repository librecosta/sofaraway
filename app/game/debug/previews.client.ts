import * as THREE from 'three';
import type { Diagnostics } from '../contracts';
import { STEP } from '../core/clock';
import { opening } from '../core/collision';
import { idleInput } from '../core/input';
import { Simulation } from '../core/simulation';
import { volumeById } from '../core/volumes';
import { makeSky } from '../graphics/environment.client';
import { GateGeometries, GateVisual, THICKNESS } from '../graphics/gates.client';
import { PickupVisual } from '../graphics/pickup.client';
import { Graphics } from '../graphics/scene.client';
import { makeHull } from '../graphics/textures.client';
import { catalog, pickupCards } from './catalog';

const flags: Diagnostics = {
  fixedTime: null, autoplay: false, god: false, align: true, boost: false,
  mobileQuality: false, post: true, record: false, debug: false,
};

function paint(root: HTMLElement, id: string, source: HTMLCanvasElement) {
  const target = root.querySelector<HTMLCanvasElement>(`canvas[data-preview="${id}"]`);
  if (!target) return;
  const ctx = target.getContext('2d')!;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0, target.width, target.height);
  target.dataset.ready = 'true';
}

export function renderMaterials(root: HTMLElement) {
  const hull = makeHull();
  paint(root, 'hull', hull.map);
  paint(root, 'normal', hull.normal);
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

  constructor(private readonly root: HTMLElement) {
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
  }

  private frame(height: number) {
    this.camera.top = height / 2;
    this.camera.bottom = -this.camera.top;
    this.camera.right = this.camera.top * 432 / 270;
    this.camera.left = -this.camera.right;
    this.camera.updateProjectionMatrix();
  }

  drawPickups(angle: number) {
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

  dispose() {
    this.pickups.forEach(pickup => pickup.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
