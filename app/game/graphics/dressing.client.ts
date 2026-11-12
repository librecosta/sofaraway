import * as THREE from 'three';
import { isProp, placementIndex, propKinds, structureKinds } from '../core/dressing';
import type { DressingKind, DressingRun, Placement, PropMotion } from '../core/dressing';
import { pathFrame } from './branch-path';
import { buildDressingModel } from './dressing-kit.client';
import type { MaterialLibrary } from './materials/library.client';
import type { Path } from './path';

const AHEAD = 128;
const BEHIND = 19;
// A 150-unit straight can install each kind once. The view window spans at most two.
const CAPACITY = 4;

interface Batch {
  meshes: THREE.InstancedMesh[];
  count: number;
}

/** One template and bounded instance buffers per kind; streamed objects borrow M0 materials. */
export class DressingVisuals {
  readonly group = new THREE.Group();
  private readonly batches = new Map<DressingKind, Batch>();
  private readonly rest = new Map<number, THREE.Matrix4>();
  private readonly frame = pathFrame();
  private readonly back = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Matrix4();
  private readonly angles = new THREE.Euler(0, 0, 0, 'ZXY');
  private readonly position = new THREE.Vector3();
  private readonly film: THREE.Material;
  private from = -1;
  private through = -1;
  private lastTime = -1;
  private lastPhase = '';
  private wasMoving = false;
  visible = 0;

  constructor(private readonly path: Path, library: MaterialLibrary) {
    this.group.name = 'elsewhere-dressing';
    for (const kind of [...structureKinds, ...propKinds]) {
      const meshes = buildDressingModel(kind, library).map(({ geometry, material }) => {
        const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (material instanceof THREE.MeshStandardMaterial) {
          // The kit needs some separation from the dark tunnel. This adjusts only
          // its reflected albedo; the shared material and its maps stay untouched.
          const lift = kind === 'tech-crate' || kind === 'utility-barrel' ? 2.35 : 1.75;
          const tint = new THREE.Color().setRGB(lift, lift, lift);
          for (let slot = 0; slot < CAPACITY; slot++) mesh.setColorAt(slot, tint);
        }
        mesh.name = kind + ':' + material.name;
        this.group.add(mesh);
        return mesh;
      });
      this.batches.set(kind, { meshes, count: 0 });
    }
    this.film = library.getEffect('hologram-panel-cyan');
  }

  private transform(placement: Placement, motion?: PropMotion): THREE.Matrix4 {
    if (!motion && this.rest.has(placement.id)) return this.rest.get(placement.id)!;
    const f = this.path.sample(placement.station, this.frame);
    const yaw = placement.mount === 'left' ? Math.PI / 2 : placement.mount === 'right' ? -Math.PI / 2 : 0;
    this.position.copy(f.p).addScaledVector(f.r, motion?.x ?? placement.x)
      .addScaledVector(f.u, motion?.y ?? placement.y).addScaledVector(f.f, motion?.along ?? 0);
    this.angles.set(motion?.pitch ?? 0, yaw, motion?.roll ?? 0);
    this.matrix.makeBasis(f.r, f.u, this.back.copy(f.f).negate());
    this.rotation.makeRotationFromEuler(this.angles);
    this.matrix.multiply(this.rotation).setPosition(this.position);
    if (motion) return this.matrix;
    const baked = this.matrix.clone();
    this.rest.set(placement.id, baked);
    return baked;
  }

  update(run: DressingRun, station: number, time: number, phase: string) {
    const from = placementIndex(run.plan, station - BEHIND);
    const through = placementIndex(run.plan, station + AHEAD);
    if (this.batches.get('holographic-service-door')!.count && this.film instanceof THREE.ShaderMaterial) {
      this.film.uniforms.uTime.value = time;
    }
    const moving = run.active > 0;
    if (from === this.from && through === this.through && phase === this.lastPhase &&
      (!(moving || this.wasMoving) || time === this.lastTime)) return;
    const rangeChanged = from !== this.from || through !== this.through || phase !== this.lastPhase;
    this.from = from;
    this.through = through;
    this.lastPhase = phase;
    this.lastTime = time;
    this.wasMoving = moving;
    for (const [kind, batch] of this.batches) {
      if (rangeChanged || kind === 'tech-crate' || kind === 'utility-barrel') batch.count = 0;
    }
    for (let i = from; i < through; i++) {
      const placement = run.plan[i];
      if (!rangeChanged && !isProp(placement)) continue;
      const batch = this.batches.get(placement.kind)!;
      if (batch.count >= CAPACITY) continue;
      const pose = this.transform(placement, run.motion.get(placement.id));
      for (const mesh of batch.meshes) mesh.setMatrixAt(batch.count, pose);
      batch.count++;
    }
    this.visible = through - from;
    for (const [kind, { meshes, count }] of this.batches) {
      if (!rangeChanged && kind !== 'tech-crate' && kind !== 'utility-barrel') continue;
      for (const mesh of meshes) {
        mesh.visible = count > 0;
        if (!mesh.count && !count) continue;
        mesh.count = count;
        if (count) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
      }
    }
  }

  dispose() {
    for (const { meshes } of this.batches.values()) for (const mesh of meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.batches.clear();
    this.rest.clear();
    this.group.clear();
  }
}
