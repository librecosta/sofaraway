import { Vector3 } from 'three';
import type { Path, PathFrame } from '../graphics/path';
import { BRANCH_PREVIEW_BEAT, REJOIN_BEAT, SPLIT_BEAT } from './branches';
import { chartFor } from './chart';
import { clamp, SECTION, playerViewOffset } from './collision';
import { PICKUP_BEAT } from './pickups';
import { BOOST_MULTIPLIER, cruiseTarget, modeScale, referenceFor, START_DISTANCE } from './reference-track';
import { sightseeingChart } from './sightseeing';
import type { VolumeDefinition } from './volumes';

export const structureKinds = ['overhead-assembly', 'ventilation-assembly', 'utility-conduits',
  'service-bay', 'holographic-service-door'] as const;
export const propKinds = ['tech-crate', 'utility-barrel'] as const;
export type StructureKind = typeof structureKinds[number];
export type PropKind = typeof propKinds[number];
export type DressingKind = StructureKind | PropKind;
export type Mount = 'ceiling' | 'left' | 'right' | 'floor';
export interface Placement {
  readonly id: number;
  readonly kind: DressingKind;
  readonly station: number;
  readonly mount: Mount;
  readonly x: number;
  readonly y: number;
}
export type PropPlacement = Placement & { readonly kind: PropKind };
export const isProp = (p: Placement): p is PropPlacement => p.mount === 'floor';

export const PROP_GATE_BUFFER = 18;
export const PROP_PICKUP_BUFFER = 21;
export const PLAYER_PROP_RADIUS = 0.19;
export const propShape = {
  'tech-crate': { width: 1.03, height: 0.91, depth: 0.84, radius: 0.48 },
  'utility-barrel': { width: 0.86, height: 1.04, depth: 0.86, radius: 0.46 },
} as const;

function word(id: number) {
  let n = Math.imul(id ^ 0x54e72bb3, 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  return (n ^ (n >>> 15)) >>> 0;
}

export function dressingClearances(volume: VolumeDefinition) {
  const reference = referenceFor(volume);
  const beats = [...new Set((['easy', 'normal', 'hard'] as const).flatMap(difficulty =>
    chartFor(volume, difficulty).map(gate => gate.beat)))];
  const modes = ['standard', 'sightseeing'] as const;
  const tour = sightseeingChart(chartFor(volume, 'normal').filter(gate => gate.beat < SPLIT_BEAT || gate.beat >= REJOIN_BEAT),
    volume.sections);
  return {
    gates: [...beats.map(beat => reference.station(beat, 'standard')),
      ...tour.map(gate => reference.station(gate.beat, 'sightseeing'))],
    pickups: modes.map(mode => reference.station(PICKUP_BEAT, mode)),
    junctions: modes.map(mode => [
      Math.min(reference.station(BRANCH_PREVIEW_BEAT, mode),
        reference.station(SPLIT_BEAT, mode) - cruiseTarget(Infinity) * BOOST_MULTIPLIER * modeScale(mode) * 1.8) - 25,
      reference.station(REJOIN_BEAT, mode) + 28,
    ] as const),
  };
}

/** Sparse installation beats, tied to authored straight segments and independent of the run seed. */
export function makeDressingPlan(volume: VolumeDefinition, path: Path): readonly Placement[] {
  if (volume.id !== 'elsewhere') return [];
  const { gates, pickups, junctions } = dressingClearances(volume);
  const placements: Placement[] = [];
  const clear = (s: number, half: number) => junctions.every(([lo, hi]) => s + half < lo || s - half > hi)
    && pickups.every(p => Math.abs(s - p) > PROP_PICKUP_BUFFER + half);
  const halfLength = { 'overhead-assembly': 1.8, 'ventilation-assembly': 2, 'utility-conduits': 4.3,
    'service-bay': 1.6, 'holographic-service-door': 1.5 };
  // Different silhouettes can share a station only when mounted on different surfaces.
  const motifs: readonly (readonly StructureKind[])[] = [
    ['overhead-assembly'], ['utility-conduits', 'ventilation-assembly'], [],
    ['overhead-assembly', 'service-bay'], ['utility-conduits'], ['holographic-service-door', 'overhead-assembly'],
    [], ['service-bay', 'ventilation-assembly'],
  ];
  const propOffsets = [91, 111, 70, 51, 32, 16, ...Array.from({ length: 26 }, (_, i) => 18 + i * 4)];
  let nextProp = 0;
  for (const [index, segment] of path.segments.entries()) {
    if (segment.type !== 'straight' || segment.s1 < START_DISTANCE - 70) continue;
    const seed = word(index);
    const motif = motifs[Math.floor(index / 2) % motifs.length];
    motif.forEach((kind, slot) => {
      const station = segment.s0 + 25 + slot * 36 + (seed % 15);
      if (station + halfLength[kind] > segment.s1 - 9 || !clear(station, halfLength[kind])
        || gates.some(gate => Math.abs(station - gate) <= halfLength[kind] + 1.8)) return;
      const mount = kind === 'overhead-assembly' ? 'ceiling' : (seed + slot) % 2 ? 'left' : 'right';
      placements.push({ id: index * 4 + slot, kind, station, mount,
        x: mount === 'left' ? -SECTION.a : mount === 'right' ? SECTION.a : 0,
        y: mount === 'ceiling' ? SECTION.b : kind === 'utility-conduits' ? 0.68 : 0 });
    });
    if (Math.floor(index / 2) % 4 === 2) continue;
    for (const offset of propOffsets) {
      const station = segment.s0 + offset + ((seed >>> 8) % 6);
      if (station < START_DISTANCE + 16 || station > segment.s1 - 20 || !clear(station, 3)
        || gates.some(gate => Math.abs(station - gate) < PROP_GATE_BUFFER)
        || placements.some(p => Math.abs(p.station - station) < 7)) continue;
      const kind = nextProp++ % 2 ? 'utility-barrel' : 'tech-crate';
      placements.push({ id: index * 4 + 2, kind, station, mount: 'floor',
        x: seed & 4 ? -2.02 : 2.02, y: -SECTION.b + propShape[kind].height / 2 });
      break;
    }
  }
  return placements.sort((a, b) => a.station - b.station);
}

export function placementIndex<T extends Placement>(placements: readonly T[], station: number) {
  let lo = 0, hi = placements.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (placements[mid].station < station) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function sweepFraction(a: Vector3, b: Vector3, c: Vector3, radius: number, delta: Vector3, relative: Vector3) {
  delta.subVectors(b, a);
  relative.subVectors(c, a);
  const length = delta.lengthSq();
  const fraction = length > 0 ? clamp(relative.dot(delta) / length, 0, 1) : 0;
  return relative.addScaledVector(delta, -fraction).lengthSq() <= radius * radius ? fraction : undefined;
}

export interface PropMotion {
  x: number; y: number; along: number; pitch: number; roll: number;
  vx: number; vy: number; vf: number; spinX: number; spinZ: number;
  age: number; settled: boolean;
}

export function launchProp(prop: PropPlacement, separationX: number, separationY: number, speed: number): PropMotion {
  const sign = word(prop.id) & 1 ? -1 : 1;
  return { x: prop.x, y: prop.y, along: 0, pitch: 0, roll: 0, age: 0, settled: false,
    vx: clamp(separationX * 3.5, -2.1, 2.1), vy: 2.1 + Math.max(0, separationY) * 1.1,
    vf: Math.min(38, speed * 1.13 + .65), spinX: 2.7 + speed * 0.042,
    spinZ: clamp(separationX * 5 + sign * 0.36, -4.2, 4.2) };
}

export function advanceProp(prop: PropPlacement, state: PropMotion, dt: number) {
  if (state.settled) return;
  state.age += dt;
  state.vy -= 9.8 * dt;
  state.along += state.vf * dt;
  state.vf *= Math.exp(-dt * 3.8);
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.pitch += state.spinX * dt;
  state.roll += state.spinZ * dt;
  const shape = propShape[prop.kind];
  const wall = SECTION.a - SECTION.ch - Math.max(shape.width, shape.depth) * 0.5 + 0.04;
  if (Math.abs(state.x) > wall) {
    state.x = clamp(state.x, -wall, wall);
    state.vx *= -0.25;
  }
  // Approximate vertical support of the rotated body. No wall or prop pairs are solved.
  const side = Math.sin(state.roll), up = Math.cos(state.pitch) * Math.cos(state.roll);
  const front = Math.sin(state.pitch) * Math.cos(state.roll);
  const support = prop.kind === 'utility-barrel' ? shape.height * 0.5 * Math.abs(up)
    + shape.width * 0.5 * Math.hypot(side, front)
    : (shape.width * Math.abs(side) + shape.height * Math.abs(up) + shape.depth * Math.abs(front)) * 0.5;
  if (state.y < -SECTION.b + support) {
    state.y = -SECTION.b + support;
    state.vy = state.vy < -0.7 ? -state.vy * 0.32 : 0;
    const drag = Math.exp(-dt * 10);
    state.vx *= drag; state.vf *= drag; state.spinX *= drag; state.spinZ *= drag;
    state.settled = state.vy === 0 && Math.abs(state.vx) + Math.abs(state.vf)
      + Math.abs(state.spinX) + Math.abs(state.spinZ) < 0.13;
  }
}

const frame = (): PathFrame => ({ p: new Vector3(), f: new Vector3(), r: new Vector3(), u: new Vector3() });

/** Only struck props have mutable run state. No reference to any gameplay counter. */
export class DressingRun {
  readonly props: readonly PropPlacement[];
  readonly motion = new Map<number, PropMotion>();
  private readonly moving = new Map<PropPlacement, PropMotion>();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly center = new Vector3();
  private readonly delta = new Vector3();
  private readonly separation = new Vector3();
  private readonly sample = frame();
  private readonly playerFrame = frame();

  constructor(readonly plan: readonly Placement[], private readonly path: Path) { this.props = plan.filter(isProp); }

  reset() { this.motion.clear(); this.moving.clear(); }

  private playerPoint(station: number, x: number, y: number, out: Vector3) {
    const sample = this.path.sample(station, this.playerFrame);
    const [localX, localY] = playerViewOffset(x, y);
    out.copy(sample.p).addScaledVector(sample.r, localX).addScaledVector(sample.u, localY);
  }

  advance(dt: number, to: number) {
    for (const [prop, state] of this.moving) {
      advanceProp(prop, state, dt);
      if (state.settled || to > prop.station + 22) this.moving.delete(prop);
    }
  }

  step(dt: number, from: number, to: number, x0: number, y0: number, x1: number, y1: number, speed: number, allowHit: boolean) {
    this.advance(dt, to);
    if (!allowHit || to <= from) return;
    const begin = placementIndex(this.props, from - 1);
    if (!this.props[begin] || this.props[begin].station > to + 1) return;
    this.playerPoint(from, x0, y0, this.a);
    this.playerPoint(to, x1, y1, this.b);
    for (let i = begin; i < this.props.length && this.props[i].station <= to + 1; i++) {
      const prop = this.props[i];
      if (this.motion.has(prop.id)) continue;
      const sample = this.path.sample(prop.station, this.sample);
      this.center.copy(sample.p).addScaledVector(sample.r, prop.x).addScaledVector(sample.u, prop.y);
      const alpha = sweepFraction(this.a, this.b, this.center, PLAYER_PROP_RADIUS + propShape[prop.kind].radius,
        this.delta, this.separation);
      if (alpha === undefined) continue;
      const state = launchProp(prop, this.separation.dot(sample.r), this.separation.dot(sample.u), speed);
      advanceProp(prop, state, (1 - alpha) * dt);
      this.motion.set(prop.id, state);
      if (!state.settled) this.moving.set(prop, state);
    }
  }

  get active() { return this.moving.size; }
}
