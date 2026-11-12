import * as THREE from 'three';
import { placementIndex, structureKinds } from '../core/dressing';
import type { StructureKind, Placement } from '../core/dressing';
import type { ScenicPlan } from '../core/scenic-plan';
import { pathFrame } from './branch-path';
import { buildDressingModel, createKitLight } from './dressing-kit.client';
import type { MaterialLibrary } from './materials/library.client';
import type { Path } from './path';

export const DRESSING_AHEAD = 138;
const BEHIND = 19;

interface Batch {
  meshes: THREE.InstancedMesh[];
  count: number;
  capacity: number;
  planned: number;
  overflow: number;
}

/** One template and bounded instance buffers per kind; streamed objects borrow M0 materials. */
export class DressingVisuals {
  readonly group = new THREE.Group();
  private readonly batches = new Map<StructureKind, Batch>();
  private readonly rest = new Map<number, THREE.Matrix4>();
  private readonly frame = pathFrame();
  private readonly back = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly film: THREE.Material;
  private readonly light = createKitLight();
  private from = -1;
  private through = -1;
  private plan?: ScenicPlan;
  visible = 0;

  constructor(private readonly path: Path, library: MaterialLibrary) {
    this.group.name = 'elsewhere-dressing';
    for (const kind of structureKinds) {
      const meshes = buildDressingModel(kind, library, this.light).map(({ geometry, material }) => {
        const mesh = this.instance(geometry, material, 4);
        mesh.name = kind + ':' + material.name;
        this.group.add(mesh);
        return mesh;
      });
      this.batches.set(kind, { meshes, count: 0, capacity: 4, planned: 0, overflow: 0 });
    }
    this.film = library.getEffect('hologram-panel-cyan');
  }

  private instance(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (material instanceof THREE.MeshStandardMaterial) {
      const tint = new THREE.Color().setScalar(1.28);
      for (let slot = 0; slot < capacity; slot++) mesh.setColorAt(slot, tint);
    }
    return mesh;
  }

  private configurePlan(plan: ScenicPlan) {
    this.plan = plan;
    this.rest.clear();
    for (const [kind, batch] of this.batches) {
      const members = plan.placements.filter(p => p.kind === kind);
      batch.planned = members.length;
      let lo = 0, peak = 0;
      for (let hi = 0; hi < members.length; hi++) {
        while (members[hi].station - members[lo].station > DRESSING_AHEAD + BEHIND) lo++;
        peak = Math.max(peak, hi - lo + 1);
      }
      if (peak <= batch.capacity) continue;
      const capacity = 2 ** Math.ceil(Math.log2(peak));
      batch.meshes = batch.meshes.map(old => {
        const mesh = this.instance(old.geometry, old.material as THREE.Material, capacity);
        mesh.name = old.name;
        this.group.remove(old);
        old.dispose();
        this.group.add(mesh);
        return mesh;
      });
      batch.capacity = capacity;
    }
  }

  counts() {
    return Object.fromEntries([...this.batches].map(([kind, batch]) => [kind, {
      planned: batch.planned, visible: batch.count, capacity: batch.capacity,
      culled: batch.planned - batch.count, overflow: batch.overflow,
    }]));
  }

  private transform(placement: Placement): THREE.Matrix4 {
    const cached = this.rest.get(placement.id);
    if (cached) return cached;
    const f = this.path.sample(placement.station, this.frame);
    const yaw = placement.mount === 'left' ? Math.PI / 2 : placement.mount === 'right' ? -Math.PI / 2 : 0;
    this.position.copy(f.p).addScaledVector(f.r, placement.x).addScaledVector(f.u, placement.y);
    this.matrix.makeBasis(f.r, f.u, this.back.copy(f.f).negate());
    this.rotation.makeRotationY(yaw);
    this.matrix.multiply(this.rotation).setPosition(this.position);
    const baked = this.matrix.clone();
    this.rest.set(placement.id, baked);
    return baked;
  }

  update(plan: ScenicPlan, station: number, time: number) {
    if (this.film instanceof THREE.ShaderMaterial) this.film.uniforms.uTime.value = time;
    const newPlan = this.plan !== plan;
    if (newPlan) this.configurePlan(plan);
    const from = placementIndex(plan.placements, station - BEHIND);
    const through = placementIndex(plan.placements, station + DRESSING_AHEAD);
    if (!newPlan && from === this.from && through === this.through) return;
    this.from = from;
    this.through = through;
    for (const batch of this.batches.values()) { batch.count = 0; batch.overflow = 0; }
    for (let i = from; i < through; i++) {
      const placement = plan.placements[i];
      const batch = this.batches.get(placement.kind)!;
      if (batch.count >= batch.capacity) {
        batch.overflow++;
        throw new Error('Scenic placement exceeded its measured window capacity: ' + placement.kind);
      }
      const pose = this.transform(placement);
      for (const mesh of batch.meshes) mesh.setMatrixAt(batch.count, pose);
      batch.count++;
    }
    this.visible = through - from;
    for (const { meshes, count } of this.batches.values()) {
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
    this.light.dispose();
    this.rest.clear();
    this.group.clear();
  }
}
