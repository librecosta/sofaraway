import * as THREE from 'three';
import { fixtureLevel, lightingState, palette, tunnelBreath, warmWeight } from '../core/lighting-score';
import type { LightColor, LightingState, LightPattern } from '../core/lighting-score';
import type { ScenicLamp, ScenicPlan } from '../core/scenic-plan';
import { pathFrame } from './branch-path';
import type { Path } from './path';

export interface LightingPreview {
  readonly beat: number;
  readonly pattern?: LightPattern;
  readonly yaw?: number;
}

/** The game keeps ColorManagement disabled; decode only these authored sRGB swatches. */
export function linearSwatch(hex: string) {
  const rgb = Number.parseInt(hex.slice(1), 16);
  return new THREE.Color().setRGB((rgb >> 16) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255).convertSRGBToLinear();
}
const colors = Object.fromEntries(Object.entries(palette).map(([key, hex]) =>
  [key, linearSwatch(hex)])) as Record<LightColor, THREE.Color>;
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

/** Fixed stations, one shared fixture mesh. Only instance colors animate. */
export class ScenicLighting {
  readonly group = new THREE.Group();
  readonly warm = new THREE.Color();
  readonly cool = new THREE.Color();
  readonly base = new THREE.Color();
  readonly sky = new THREE.Color();
  readonly ground = groundBase;
  readonly fog = new THREE.Color();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  private mesh = this.batch(48);
  private plan?: ScenicPlan;
  private lamps: readonly ScenicLamp[] = [];
  private preview = false;
  private from = -1;
  private through = -1;
  private lastBeat = NaN;
  private lastPattern?: LightPattern;
  private readonly scratch = new THREE.Color();
  private readonly gameplayTint = new THREE.Color();
  private readonly frame = pathFrame();
  private readonly back = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  private lastReduced?: boolean;
  groups = 0;
  count = 0;

  constructor(private readonly path: Path) { this.group.add(this.mesh); }

  private batch(capacity: number) {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.name = 'elsewhere-scenic-lamps';
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color());
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }

  update(plan: ScenicPlan, station: number, beat: number, glassHue: number, preview = false, override?: LightPattern): LightingState {
    const state = lightingState(beat, override);
    const nextPlan = this.plan !== plan || this.preview !== preview;
    if (nextPlan) {
      this.plan = plan;
      this.preview = preview;
      this.lamps = preview ? plan.lamps : plan.lamps.filter(lamp => lamp.family !== 'rhythm' && lamp.family !== 'hero');
      let lo = 0, peak = 0;
      for (let hi = 0; hi < this.lamps.length; hi++) {
        while (this.lamps[hi].station - this.lamps[lo].station > AHEAD + BEHIND) lo++;
        peak = Math.max(peak, hi - lo + 1);
      }
      if (peak > this.mesh.instanceMatrix.count) {
        this.group.remove(this.mesh);
        this.mesh.dispose();
        this.mesh = this.batch(2 ** Math.ceil(Math.log2(peak)));
        this.group.add(this.mesh);
      }
    }
    const from = indexAt(this.lamps, station - BEHIND), through = indexAt(this.lamps, station + AHEAD);
    const shifted = nextPlan || this.from !== from || this.through !== through;
    if (shifted) {
      this.from = from; this.through = through;
      const groups = new Set<number>();
      for (let i = from; i < through; i++) {
        const lamp = this.lamps[i];
        groups.add(lamp.group);
        const f = this.path.sample(lamp.station, this.frame);
        this.p.copy(f.p).addScaledVector(f.r, lamp.x).addScaledVector(f.u, lamp.y);
        this.matrix.makeBasis(f.r, f.u, this.back.copy(f.f).negate());
        this.rotation.makeRotationY(lamp.angle);
        if (lamp.wall) this.rotation.makeRotationZ(Math.PI / 2);
        this.matrix.multiply(this.rotation).scale(this.scale.set(lamp.width, .038, lamp.length)).setPosition(this.p);
        this.mesh.setMatrixAt(i - from, this.matrix);
      }
      this.groups = groups.size;
      this.count = through - from;
      this.mesh.count = this.count;
      this.mesh.visible = this.count > 0;
      if (this.count) this.mesh.computeBoundingSphere();
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    const reduced = this.reduce?.matches ?? false;
    if (!shifted && this.lastBeat === beat && this.lastPattern === override && this.lastReduced === reduced) return state;
    this.lastBeat = beat;
    this.lastPattern = override;
    this.lastReduced = reduced;
    this.warm.copy(colors[state.previous.warm]).lerp(colors[state.next.warm], state.mix);
    this.cool.copy(colors[state.previous.cool]).lerp(colors[state.next.cool], state.mix);
    this.base.copy(warmBase).lerp(this.warm, .18);
    this.sky.copy(coolBase).lerp(this.cool, .14);
    this.fog.copy(this.sky).lerp(this.scratch.setHSL((glassHue + 1) % 1, .61, .12), .56).multiplyScalar(.045);
    const dual = (override ?? state.next.pattern) === 'dual-color';
    const wasDual = (override ?? state.previous.pattern) === 'dual-color';
    this.gameplayTint.setHSL((glassHue + 1) % 1, 1, .5);
    const breath = .90 + .21 * tunnelBreath(beat, reduced);
    for (let i = from; i < through; i++) {
      const { family, station, group } = this.lamps[i];
      if (!preview) {
        if (family === 'functional') this.scratch.copy(group % 2 ? this.base : this.sky).multiplyScalar(.28);
        else this.scratch.copy(this.gameplayTint).multiplyScalar((family === 'fill' ? .31 : .19) * breath);
        this.mesh.setColorAt(i - from, this.scratch);
        continue;
      }
      const oldWeight = warmWeight(beat, group, wasDual && !reduced);
      const weight = oldWeight + (warmWeight(beat, group, dual && !reduced) - oldWeight) * state.mix;
      const steady = family === 'fill' || family === 'gate-adjacent';
      this.scratch.copy(steady ? this.sky : this.cool).lerp(steady ? this.base : this.warm, weight);
      this.scratch.multiplyScalar(fixtureLevel(state, family, station, group, reduced));
      this.mesh.setColorAt(i - from, this.scratch);
    }
    this.mesh.instanceColor!.needsUpdate = true;
    return state;
  }

  get reducedMotion() { return this.reduce?.matches ?? false; }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.group.clear();
  }
}
