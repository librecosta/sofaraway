import * as THREE from 'three';
import { ORBIT_CELL, ORBIT_LENGTH, OrbitClearance, OrbitField, orbitCellKey } from '../core/orbit-field';
import type { OrbitDensity, OrbitRock } from '../core/orbit-field';
import { fitCurve } from '../core/corridor-composition';
import type { QualityTier } from '../contracts';
import { Path } from './path';
import { OrbitRocks, ROCK_LODS, ROCK_SHAPES } from './orbit-rocks.client';
import { OrbitSky } from './orbit-sky.client';

const REACH = 570;
const KEEP = 660;
const CELL_RADIUS = Math.sqrt(3) * ORBIT_CELL / 2;
const lodLimits = { low: [66, 22], auto: [49, 15], high: [36, 11] } as const;
const fragmentLimits = { low: .34, auto: .70, high: 1 } as const;

export function buildOrbitPath() {
  return new Path(150, 46, 'orbit', true).author([
    { type: 'straight', s0: 0, s1: 540 },
    { type: 's-curve', s0: 540, s1: 1560, ...fitCurve(1020, 122) },
    { type: 's-curve', s0: 1560, s1: 2260, ...fitCurve(700, -71) },
    { type: 'straight', s0: 2260, s1: ORBIT_LENGTH },
  ]);
}

export function orbitClearance(path: Path) {
  return new OrbitClearance(path.length, station => path.sample(station).p.toArray());
}

export function orbitLod(pixels: number, previous: number, quality: QualityTier) {
  const [near, middle] = lodLimits[quality];
  if (pixels >= near * (previous === 0 ? .84 : 1)) return 0;
  if (pixels >= middle * (previous === 1 ? .84 : 1)) return 1;
  return 2;
}

type Chunk = {
  bounds: THREE.Sphere;
  rocks: OrbitRock[];
  lod: Int8Array;
  batches: Array<THREE.InstancedMesh | undefined>;
  count: number;
};

export class OrbitWorld {
  readonly group = new THREE.Group();
  readonly field: OrbitField;
  private readonly sky: OrbitSky;
  private readonly rocks = new OrbitRocks(REACH);
  private readonly chunks = new Map<string, Chunk>();
  private readonly center = new THREE.Vector3();
  private readonly lastStream = new THREE.Vector3(Infinity, Infinity, Infinity);
  private readonly transform = new THREE.Object3D();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  private instances = 0;
  private readonly levels = [0, 0, 0];
  private visibleChunks = 0;

  constructor(path: Path, seed: number, density: OrbitDensity) {
    this.field = new OrbitField(seed, density, orbitClearance(path));
    this.sky = new OrbitSky(seed);
    const key = new THREE.DirectionalLight(0xffe2c3, 3.55);
    key.position.set(-.8, .73, -.48);
    const bounce = new THREE.DirectionalLight(0xb7d8ff, 1.38);
    bounce.position.set(.79, -.30, .58);
    this.group.add(this.sky.group, key, bounce, new THREE.AmbientLight(0x929fb5, .40));
  }

  update(camera: THREE.PerspectiveCamera, height: number, dpr: number, quality: QualityTier) {
    this.sky.resize(dpr);
    const position = camera.position;
    if (this.lastStream.distanceToSquared(position) > 18 ** 2) this.stream(position);
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const projection = .5 * height * camera.projectionMatrix.elements[5];
    this.instances = this.visibleChunks = 0;
    this.levels.fill(0);
    for (const chunk of this.chunks.values()) {
      const visible = chunk.rocks.length > 0 && this.frustum.intersectsSphere(chunk.bounds);
      if (visible) this.populate(chunk, position, projection, quality);
      if (visible && chunk.count) this.visibleChunks++;
      for (const [index, batch] of chunk.batches.entries()) {
        if (!batch) continue;
        batch.visible = visible && batch.count > 0 && this.frustum.intersectsSphere(batch.boundingSphere!);
        if (!batch.visible) continue;
        this.instances += batch.count;
        this.levels[index % ROCK_LODS] += batch.count;
      }
    }
  }

  private stream(position: THREE.Vector3) {
    this.lastStream.copy(position);
    const cx = Math.floor(position.x / ORBIT_CELL);
    const cy = Math.floor(position.y / ORBIT_CELL);
    const cz = Math.floor(position.z / ORBIT_CELL);
    const cells = Math.ceil((REACH + CELL_RADIUS) / ORBIT_CELL);
    for (const [id, chunk] of this.chunks) {
      if (chunk.bounds.center.distanceToSquared(position) <= (KEEP + CELL_RADIUS) ** 2) continue;
      this.free(chunk);
      this.chunks.delete(id);
    }
    for (let x = cx - cells; x <= cx + cells; x++) {
      for (let y = cy - cells; y <= cy + cells; y++) {
        for (let z = cz - cells; z <= cz + cells; z++) {
          this.center.set(x + .5, y + .5, z + .5).multiplyScalar(ORBIT_CELL);
          if (this.center.distanceToSquared(position) > (REACH + CELL_RADIUS) ** 2) continue;
          const id = orbitCellKey(x, y, z);
          if (this.chunks.has(id)) continue;
          const rocks = this.field.cell(x, y, z);
          this.chunks.set(id, { bounds: new THREE.Sphere(this.center.clone(), CELL_RADIUS), rocks,
            lod: new Int8Array(rocks.length).fill(-1), batches: new Array<THREE.InstancedMesh | undefined>(ROCK_SHAPES * ROCK_LODS), count: 0 });
        }
      }
    }
  }

  private populate(chunk: Chunk, position: THREE.Vector3, projection: number, quality: QualityTier) {
    let changed = false;
    for (let i = 0; i < chunk.rocks.length; i++) {
      const rock = chunk.rocks[i];
      const distance = Math.sqrt(this.center.fromArray(rock.position).distanceToSquared(position));
      const pixels = projection * 2 * rock.radius / Math.max(2, distance);
      const next = distance - rock.radius > REACH || (rock.fragment && (rock.rank >= fragmentLimits[quality] || pixels < .85))
        ? -1 : orbitLod(pixels, chunk.lod[i], quality);
      changed ||= next !== chunk.lod[i];
      chunk.lod[i] = next;
    }
    if (!changed) return;
    for (const batch of chunk.batches) if (batch) batch.count = 0;
    chunk.count = 0;
    for (let i = 0; i < chunk.rocks.length; i++) {
      const lod = chunk.lod[i];
      if (lod < 0) continue;
      const rock = chunk.rocks[i];
      const index = rock.shape * ROCK_LODS + lod;
      let batch = chunk.batches[index];
      if (!batch) {
        const capacity = chunk.rocks.filter(item => item.shape === rock.shape).length;
        batch = new THREE.InstancedMesh(this.rocks.geometry(rock.shape, lod), this.rocks.material, capacity);
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        batch.count = 0;
        this.group.add(batch);
        chunk.batches[index] = batch;
      }
      this.transform.position.fromArray(rock.position);
      this.transform.scale.fromArray(rock.scale);
      this.transform.rotation.set(...rock.rotation);
      this.transform.updateMatrix();
      batch.setMatrixAt(batch.count, this.transform.matrix);
      batch.setColorAt(batch.count++, this.rocks.colors[rock.material]);
      chunk.count++;
    }
    for (const batch of chunk.batches) {
      if (!batch?.count) continue;
      batch.instanceMatrix.needsUpdate = true;
      batch.instanceColor!.needsUpdate = true;
      batch.computeBoundingSphere();
    }
  }

  private free(chunk: Chunk) {
    for (const batch of chunk.batches) {
      if (!batch) continue;
      this.group.remove(batch);
      batch.dispose();
    }
  }

  metrics() {
    let descriptions = 0;
    for (const chunk of this.chunks.values()) descriptions += chunk.rocks.length;
    return { chunks: this.chunks.size, visibleChunks: this.visibleChunks, descriptions,
      instances: this.instances, lod: [...this.levels] };
  }

  dispose() {
    for (const chunk of this.chunks.values()) this.free(chunk);
    this.chunks.clear();
    this.sky.dispose();
    this.rocks.dispose();
    this.group.clear();
  }
}
