import * as THREE from 'three';
import { ceilingLight, lightingState } from '../core/lighting-score';
import type { LightingState, LightPattern } from '../core/lighting-score';
import { SLOT_LENGTH, SLOT_X, zoneAt } from '../core/scenic-plan';
import type { ScenicLamp, ScenicPlan } from '../core/scenic-plan';
import { SECTION } from '../core/collision';
import { pathFrame } from './branch-path';
import type { Path } from './path';

export interface LightingPreview {
  readonly beat: number;
  readonly pattern?: LightPattern;
  readonly yaw?: number;
}

/** Decode authored sRGB swatches locally; the other volumes keep their existing color management. */
export function linearSwatch(hex: string) {
  const rgb = Number.parseInt(hex.slice(1), 16);
  return new THREE.Color().setRGB((rgb >> 16) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255).convertSRGBToLinear();
}
const warmBase = linearSwatch('#E5D7C5');
const coolBase = linearSwatch('#ABC1D5');
const groundBase = linearSwatch('#777B81');
const BEHIND = 18, AHEAD = 168;

function indexAt(lamps: readonly ScenicLamp[], station: number) {
  let lo = 0, hi = lamps.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lamps[mid].station < station) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Fixed lenses sit inside the shell slots. Both preview and gameplay update the same batch. */
export class ScenicLighting {
  readonly group = new THREE.Group();
  readonly base = warmBase;
  readonly sky = coolBase;
  readonly ground = groundBase;
  readonly fog = new THREE.Color();
  private readonly geometry = new THREE.BoxGeometry(.11, .024, SLOT_LENGTH - .54);
  private readonly material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  private mesh = new THREE.InstancedMesh(this.geometry, this.material, 20);
  private plan?: ScenicPlan;
  private from = -1;
  private through = -1;
  private lastBeat = NaN;
  private lastPattern?: LightPattern;
  private lastReduced?: boolean;
  private readonly scratch = new THREE.Color();
  private readonly frame = pathFrame();
  private readonly back = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  groups = 0;
  count = 0;
  zone?: string;
  hue = 0;

  constructor(private readonly path: Path) {
    this.mesh.name = 'elsewhere-integrated-ceiling-lenses';
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);
  }

  update(plan: ScenicPlan, station: number, beat: number, override?: LightPattern): LightingState {
    const reduced = this.reduce?.matches ?? false;
    const state = lightingState(beat, reduced);
    const lamps = plan.lamps;
    const from = indexAt(lamps, station - BEHIND), through = indexAt(lamps, station + AHEAD);
    const shifted = this.plan !== plan || this.from !== from || this.through !== through;
    this.zone = zoneAt(plan, station)?.kind;
    this.hue = state.hue;
    if (shifted) {
      this.plan = plan; this.from = from; this.through = through;
      const groups = new Set<number>();
      for (let i = from; i < through; i++) {
        const lamp = lamps[i];
        if (lamp.ordered) groups.add(lamp.group);
        const f = this.path.sample(lamp.station, this.frame);
        this.position.copy(f.p).addScaledVector(f.r, lamp.side === 0 ? -SLOT_X : SLOT_X).addScaledVector(f.u, SECTION.b + .09);
        this.matrix.makeBasis(f.r, f.u, this.back.copy(f.f).negate()).setPosition(this.position);
        this.mesh.setMatrixAt(i - from, this.matrix);
      }
      this.groups = groups.size;
      this.count = through - from;
      this.mesh.count = this.count;
      this.mesh.visible = this.count > 0;
      if (this.count) this.mesh.computeBoundingSphere();
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    if (!shifted && this.lastBeat === beat && this.lastPattern === override && this.lastReduced === reduced) return state;
    this.lastBeat = beat; this.lastPattern = override; this.lastReduced = reduced;
    this.fog.copy(this.sky).lerp(this.scratch.setHSL(state.hue, .61, .12), .56).multiplyScalar(.041);
    for (let i = from; i < through; i++) {
      const lamp = lamps[i];
      const light = ceilingLight(state, lamp.station, lamp.group, lamp.ordered, override === 'dual-color');
      this.scratch.setHSL(light.hue, 1, .5).multiplyScalar(light.level);
      this.mesh.setColorAt(i - from, this.scratch);
    }
    this.mesh.instanceColor!.needsUpdate = true;
    return state;
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.group.clear();
  }
}
