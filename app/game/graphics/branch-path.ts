import * as THREE from 'three';
import { branchSpread, branchSteeringWidth, BRANCH_GUIDANCE_END, BRANCH_OPEN_BEAT, BRANCH_PREVIEW_BEAT, MERGE_BEAT, REJOIN_BEAT,
  SIGHTSEEING_MERGE_BEAT, SIGHTSEEING_OPEN_BEAT, SPLIT_BEAT } from '../core/branches';
import type { PlayMode } from '../contracts';
import type { RouteSide } from '../core/branches';
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

  constructor(readonly base: Path, private readonly reference: ReferenceTrack, private readonly mode: PlayMode) {
    this.start = this.distanceAt(BRANCH_PREVIEW_BEAT);
    this.split = this.distanceAt(SPLIT_BEAT);
    this.end = this.distanceAt(REJOIN_BEAT);
    this.openBeat = mode === 'sightseeing' ? SIGHTSEEING_OPEN_BEAT : BRANCH_OPEN_BEAT;
    this.mergeBeat = mode === 'sightseeing' ? SIGHTSEEING_MERGE_BEAT : MERGE_BEAT;
    this.open = this.distanceAt(this.openBeat);
    this.merge = this.distanceAt(this.mergeBeat);
    this.guideStart = Math.min(this.start, this.split - cruiseTarget(Infinity) * BOOST_MULTIPLIER * modeScale(mode) * 1.8);
    this.guideEnd = this.distanceAt(BRANCH_GUIDANCE_END);
    const count = Math.ceil((this.end - this.split) / 0.25);
    this.stationStep = (this.end - this.split) / count;
    this.arcs = { left: this.measure('left', count), right: this.measure('right', count) };
  }

  distanceAt(beat: number) { return this.reference.station(beat, this.mode); }

  steeringWidth(station: number) { return branchSteeringWidth(station, this.start, this.split, this.open); }

  spreadAt(distance: number, start: number) {
    return branchSpread(distance, start, this.open, this.merge, this.end);
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
      sample.p.addScaledVector(sample.r, sign * this.spreadAt(station, this.split));
      table[i] = table[i - 1] + previous.distanceTo(sample.p);
      previous.copy(sample.p);
    }
    return table;
  }

  sample(distance: number, side: RouteSide, out = pathFrame()): PathFrame {
    this.base.sample(distance, out);
    if (side === 'center' || distance <= this.split || distance >= this.end) return out;
    const sign = side === 'left' ? -1 : 1;
    out.p.addScaledVector(out.r, sign * this.spreadAt(distance, this.split));
    const ds = Math.min(0.25, distance - this.split, this.end - distance);
    this.base.sample(distance - ds, this.before);
    this.base.sample(distance + ds, this.after);
    out.f.addScaledVector(this.before.r, -sign * this.spreadAt(distance - ds, this.split) / (2 * ds))
      .addScaledVector(this.after.r, sign * this.spreadAt(distance + ds, this.split) / (2 * ds)).normalize();
    out.r.crossVectors(out.f, out.u).normalize();
    out.u.crossVectors(out.r, out.f).normalize();
    return out;
  }
}
