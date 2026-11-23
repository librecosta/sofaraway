import { rockDetail } from './orbit-rock-detail';
export { rockDetail as orbitLod } from './orbit-rock-detail';
import * as THREE from 'three';
import { ORBIT_CELL, OrbitClearance, OrbitField, orbitCellKey } from '../core/orbit-field';
import type { OrbitBelt, OrbitDensity, OrbitRock } from '../core/orbit-field';
import type { PlayMode, QualityTier } from '../contracts';
import { gameplayFor } from '../core/gameplay';
import { modeScale, referenceFor } from '../core/reference-track';
import { volumeById } from '../core/volumes';
import { BranchPath, pathFrame } from './branch-path';
import type { Path } from './path';
import { OrbitRocks, ROCK_LODS, ROCK_SHAPES } from './orbit-rocks.client';
import { OrbitSky } from './orbit-sky.client';
import { cosmicPresence, makeOrbitSetpieces } from '../core/orbit-setpieces';
import { OrbitSetpieces } from './orbit-setpieces.client';
import { newOrbitLighting, orbitLightingAt, orbitLightScenes } from '../core/orbit-lighting';
import type { OrbitLightOptions } from '../core/orbit-lighting';

const REACH = 570;
const KEEP = 660;
const CELL_RADIUS = Math.sqrt(3) * ORBIT_CELL / 2;
const fragmentLimits = { low: .34, auto: .70, high: 1 } as const;

export function orbitClearance(path: Path, branch?: BranchPath, mode: PlayMode = 'standard') {
  const frame = pathFrame();
  const main = (station: number) => path.sample(station, frame).p.toArray();
  const lookAhead = branch ? 450 * modeScale(mode) : 250;
  const clearance = new OrbitClearance(path.length, main, lookAhead);
  if (branch) {
    // The approach includes the full steering envelope and the sightlines into both side routes.
    const from = branch.guideStart - lookAhead;
    const to = branch.end + lookAhead;
    const left = (station: number) => branch.sample(station, 'left', frame).p.toArray();
    const right = (station: number) => branch.sample(station, 'right', frame).p.toArray();
    clearance.protect(from, to, left, lookAhead, 6);
    clearance.protect(from, to, right, lookAhead, 6);
    for (let station = branch.split; station < branch.end; station += 8) {
      clearance.protectSpan(left(station), right(station));
    }
  }
  return clearance;
}

const outerBelt = { density: .10, coverage: .60, tilt: .40, drift: -.44, width: 1.9 };
const maelstrom = { density: 1, coverage: 1.24, tilt: -.56, drift: .10, width: 1.10 };
const belts: Readonly<Record<string, OrbitBelt>> = {
  'OUTER BELT': outerBelt,
  DRIFT: { density: .34, coverage: .86, tilt: .42, drift: -.38, width: 1.65 },
  RINGBREAK: { density: .82, coverage: 1.14, tilt: .72, drift: -.15, width: 1.85 },
  MAELSTROM: maelstrom,
  ECLIPSE: { density: .09, coverage: .46, tilt: -.25, drift: -1.32, width: 2.15 },
  AURORA: { density: .52, coverage: .88, tilt: .32, drift: .68, width: 1.54 },
  APHELION: { density: .30, coverage: .72, tilt: .31, drift: -1.30, width: 2.25 },
};
const beyond = { density: .05, coverage: .37, tilt: .27, drift: -1.6, width: 2.65 };

export function orbitCourseBelt(path: Path, mode: PlayMode) {
  const model = volumeById('orbit');
  const reference = path.reference ?? referenceFor(model);
  const frame = pathFrame();
  let beat = 0;
  const zones = [...model.sections.map(section => {
    const depth = -path.sample(reference.station(beat, mode), frame).p.z;
    beat += section.beats;
    return { depth, belt: belts[section.name] };
  }), { depth: -path.sample(reference.station(model.beats, mode) + 280, frame).p.z, belt: beyond }];
  const cells = new Map<number, OrbitBelt>();
  return (z: number) => {
    const cached = cells.get(z);
    if (cached) return cached;
    const depth = -(z + .5) * ORBIT_CELL;
    let index = zones.length - 1;
    while (index > 0 && zones[index].depth > depth) index--;
    const belt = zones[index]?.belt ?? outerBelt;
    const previous = zones[index - 1]?.belt ?? outerBelt;
    const t = THREE.MathUtils.smoothstep(depth, zones[index]?.depth ?? 0, (zones[index]?.depth ?? 0) + 230);
    const lerp = THREE.MathUtils.lerp;
    const mixed: OrbitBelt = { density: lerp(previous.density, belt.density, t), coverage: lerp(previous.coverage, belt.coverage, t),
      tilt: lerp(previous.tilt, belt.tilt, t), drift: lerp(previous.drift, belt.drift, t), width: lerp(previous.width, belt.width, t) };
    cells.set(z, mixed);
    return mixed;
  };
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
  private readonly setpieces: OrbitSetpieces;
  private readonly key = new THREE.DirectionalLight(0xffe2c3, 3.55);
  private readonly bounce = new THREE.DirectionalLight(0xb7d8ff, 1.38);
  private readonly ambient = new THREE.AmbientLight(0x929fb5, .40);
  private readonly lights = [this.key, this.bounce, this.ambient];
  private readonly lighting = newOrbitLighting();
  private readonly warmKey = new THREE.Color(0xffe2c3);
  private readonly coolKey = new THREE.Color(0xcbdfff);
  private readonly coolFill = new THREE.Color(0xb7d8ff);
  private readonly violetFill = new THREE.Color(0xc5b9ed);
  private readonly eclipseSun = new THREE.Vector3();
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

  constructor(path: Path, seed: number, density: OrbitDensity, mode: PlayMode = 'standard') {
    const branch = path.reference && new BranchPath(path, path.reference, mode, gameplayFor('orbit').branch!);
    const clearance = orbitClearance(path, branch, mode);
    this.field = new OrbitField(seed, density, clearance, orbitCourseBelt(path, mode));
    this.setpieces = new OrbitSetpieces(makeOrbitSetpieces(path, mode, seed, clearance), this.rocks, .6 + .4 * modeScale(mode));
    this.sky = new OrbitSky(seed);
    const eclipse = this.setpieces.descriptions.find(p=>p.id==='eclipse')!;
    this.eclipseSun.fromArray(eclipse.bodies[1].position).sub(new THREE.Vector3().fromArray(eclipse.anchor)).normalize();
    this.key.position.set(-.8, .73, -.48);
    this.bounce.position.set(.79, -.30, .58);
    this.group.add(this.sky.group, this.setpieces.group, ...this.lights);
  }

  warmAstral(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, quality: QualityTier, preparing = false) {
    this.setpieces.warmAurora(renderer, target, this.lights, preparing);
    this.setpieces.warmAphelion(renderer, target, this.lights, quality, preparing);
  }

  update(camera: THREE.PerspectiveCamera, height: number, dpr: number, quality: QualityTier, release = 0, station = 4200,
    music?: OrbitLightOptions & { beat: number }, inspection = 0) {
    const light = orbitLightingAt(music?.beat ?? 0, inspection ? { amount: 0 } : music ?? { amount: 0 }, this.lighting);
    this.rocks.surface.update(camera,height,quality);
    this.setpieces.update(camera, station, height, quality, light, inspection);
    const eclipse = cosmicPresence(this.setpieces.descriptions[4],station);
    this.key.position.set(-.8,.73,-.48).normalize().lerp(this.eclipseSun,eclipse);
    this.key.intensity=3.55*light.key;
    this.key.color.copy(this.coolKey).lerp(this.warmKey,light.warmth);
    this.bounce.intensity=(1.38-.72*eclipse)*light.fill;
    this.bounce.color.copy(this.coolFill).lerp(this.violetFill,light.violet);
    this.ambient.intensity=.40*light.ambient;
    this.sky.setLighting(light.sky);
    this.rocks.setLighting(light.sky);
    this.sky.resize(dpr);
    this.sky.setRelease(release);
    this.rocks.setRelease(release);
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
        ? -1 : rockDetail(pixels, chunk.lod[i], quality, rock.radius);
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
    let descriptions = 0, objects = 0;
    for (const chunk of this.chunks.values()) descriptions += chunk.rocks.length;
    this.group.traverse(()=>objects++);
    return { chunks: this.chunks.size, visibleChunks: this.visibleChunks, descriptions,
      instances: this.instances, objects, lod: [...this.levels], setpieces: this.setpieces.metrics(),
      lighting: { beat: this.lighting.beat, scene: orbitLightScenes[this.lighting.chapter], amount: this.lighting.amount,
        key: this.key.intensity, fill: this.bounce.intensity, ambient: this.ambient.intensity,
        envelopes: [...this.lighting.envelopes], nebula: [...this.lighting.nebula],
        local: [this.lighting.face,this.lighting.ring,this.lighting.storm], motion: this.lighting.motion } };
  }

  dispose() {
    for (const chunk of this.chunks.values()) this.free(chunk);
    this.chunks.clear();
    this.sky.dispose();
    this.setpieces.dispose();
    this.rocks.dispose();
    this.group.clear();
  }
}
