import * as THREE from 'three';
import { branchSpread, branchSteeringWidth, elsewhereBranch, junctionEase } from '../core/branches';
import type { PlayMode } from '../contracts';
import type { BranchSpec, RouteSide } from '../core/branches';
import { BOOST_MULTIPLIER, cruiseTarget, modeScale } from '../core/reference-track';
import type { ReferenceTrack } from '../core/reference-track';
import type { Path, PathFrame } from './path';

export const pathFrame = (): PathFrame => ({
  p: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(),
});

export class BranchPath {
  private readonly before = pathFrame();
  private readonly after = pathFrame();
  readonly start: number;
  readonly split: number;
  readonly end: number;
  readonly openBeat: number;
  readonly mergeBeat: number;
  readonly open: number;
  readonly merge: number;
  readonly guideStart: number;
  readonly guideEnd: number;
  private readonly stationStep: number;
  private readonly arcs: Record<'left' | 'right', Float64Array>;

  constructor(readonly base: Path, private readonly reference: ReferenceTrack, private readonly mode: PlayMode,
    readonly spec: BranchSpec = elsewhereBranch) {
    this.start = this.distanceAt(spec.preview);
    this.split = this.distanceAt(spec.split);
    this.end = this.distanceAt(spec.rejoin);
    this.openBeat = spec.open[mode];
    this.mergeBeat = spec.merge[mode];
    this.open = this.distanceAt(this.openBeat);
    this.merge = this.distanceAt(this.mergeBeat);
    this.guideStart = Math.min(this.start, this.split - cruiseTarget(Infinity) * BOOST_MULTIPLIER * modeScale(mode) * 1.8);
    this.guideEnd = this.distanceAt(spec.guideEnd);
    const count = Math.ceil((this.end - this.split) / 0.25);
    this.stationStep = (this.end - this.split) / count;
    this.arcs = { left: this.measure('left', count), right: this.measure('right', count) };
  }

  distanceAt(beat: number) { return this.reference.station(beat, this.mode); }

  steeringWidth(station: number) {
    return this.spec.spiral ? 0 : branchSteeringWidth(station, this.start, this.split, this.open, this.spec.spacing);
  }

  spreadAt(distance: number, start: number) {
    return branchSpread(distance, start, this.open, this.merge, this.end, this.spec.spacing);
  }

  private offset(sample: PathFrame, distance: number, sign: number) {
    const spread = this.spreadAt(distance, this.split);
    if (this.spec.spiral) {
      const angle = Math.PI * junctionEase((distance - this.split) / (this.end - this.split));
      sample.p.addScaledVector(sample.r, sign * spread * Math.cos(angle))
        .addScaledVector(sample.u, sign * spread * Math.sin(angle));
      return;
    }
    sample.p.addScaledVector(sample.r, sign * spread).addScaledVector(sample.u, this.spec.rise * spread / this.spec.spacing);
  }

  arcAt(station: number, side: RouteSide) {
    if (side === 'center' || station <= this.split) return station;
    const table = this.arcs[side];
    if (station >= this.end) return table[table.length - 1] + station - this.end;
    const index = (station - this.split) / this.stationStep;
    const i = Math.min(Math.floor(index), table.length - 2);
    return table[i] + (table[i + 1] - table[i]) * (index - i);
  }

  stationAt(arc: number, side: RouteSide) {
    if (side === 'center' || arc <= this.split) return arc;
    const table = this.arcs[side];
    let lo = 0, hi = table.length - 1;
    if (arc >= table[hi]) return this.end + (arc - table[hi]);
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (table[mid] <= arc) lo = mid;
      else hi = mid;
    }
    return this.split + (lo + (arc - table[lo]) / (table[hi] - table[lo])) * this.stationStep;
  }

  private measure(side: 'left' | 'right', count: number) {
    const table = new Float64Array(count + 1);
    const sample = pathFrame(), previous = new THREE.Vector3();
    const sign = side === 'left' ? -1 : 1;
    table[0] = this.split;
    previous.copy(this.base.sample(this.split, sample).p);
    for (let i = 1; i <= count; i++) {
      const station = this.split + i * this.stationStep;
      this.base.sample(station, sample);
      this.offset(sample, station, sign);
      table[i] = table[i - 1] + previous.distanceTo(sample.p);
      previous.copy(sample.p);
    }
    return table;
  }

  sample(distance: number, side: RouteSide, out = pathFrame()): PathFrame {
    this.base.sample(distance, out);
    if (side === 'center' || distance <= this.split || distance >= this.end) return out;
    const sign = side === 'left' ? -1 : 1;
    this.offset(out, distance, sign);
    const ds = Math.min(0.25, distance - this.split, this.end - distance);
    this.base.sample(distance - ds, this.before);
    this.base.sample(distance + ds, this.after);
    if (this.spec.rise || this.spec.spiral) {
      this.offset(this.before, distance - ds, sign);
      this.offset(this.after, distance + ds, sign);
      out.f.subVectors(this.after.p, this.before.p).normalize();
    } else {
      out.f.addScaledVector(this.before.r, -sign * this.spreadAt(distance - ds, this.split) / (2 * ds))
        .addScaledVector(this.after.r, sign * this.spreadAt(distance + ds, this.split) / (2 * ds)).normalize();
    }
    out.r.crossVectors(out.f, out.u).normalize();
    out.u.crossVectors(out.r, out.f).normalize();
    return out;
  }
}
