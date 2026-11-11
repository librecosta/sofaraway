import * as THREE from 'three';
import { branchDistance, MERGE_BEAT, REJOIN_BEAT, SPLIT_BEAT } from '../core/branches';
import type { BranchAnchor, RouteSide } from '../core/branches';
import type { Path, PathFrame } from './path';

export const BRANCH_SPACING = 10.5;
export const BRANCH_HALL_BEAT = 316;
// The mouths open during the obstacle-free SPLIT interval, ahead of the first gates.
export const BRANCH_OPEN_BEAT = 321.75;
export const pathFrame = (): PathFrame => ({
  p: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(),
});

function ease(t: number) {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return u * u * u * (10 + u * (-15 + 6 * u));
}

export function branchSpread(beat: number) {
  return BRANCH_SPACING * ease(Math.min((beat - SPLIT_BEAT) / (BRANCH_OPEN_BEAT - SPLIT_BEAT),
    (REJOIN_BEAT - beat) / (REJOIN_BEAT - MERGE_BEAT)));
}

export function hallSpread(beat: number) {
  return BRANCH_SPACING * ease(Math.min((beat - BRANCH_HALL_BEAT) / (BRANCH_OPEN_BEAT - BRANCH_HALL_BEAT),
    (REJOIN_BEAT - beat) / (REJOIN_BEAT - MERGE_BEAT)));
}

export class BranchPath {
  private readonly before = pathFrame();
  private readonly after = pathFrame();
  readonly start: number;
  readonly split: number;
  readonly end: number;

  constructor(readonly base: Path, readonly anchor: BranchAnchor) {
    this.start = this.distanceAt(BRANCH_HALL_BEAT);
    this.split = this.distanceAt(SPLIT_BEAT);
    this.end = this.distanceAt(REJOIN_BEAT);
  }

  distanceAt(beat: number) { return branchDistance(this.anchor, beat); }
  beatAt(distance: number) { return SPLIT_BEAT + (distance - this.split) / this.anchor.unitsPerBeat; }

  sample(distance: number, side: RouteSide, out = pathFrame()): PathFrame {
    this.base.sample(distance, out);
    if (side === 'center' || distance <= this.split || distance >= this.end) return out;
    const sign = side === 'left' ? -1 : 1;
    out.p.addScaledVector(out.r, sign * branchSpread(this.beatAt(distance)));
    const ds = 0.25;
    this.base.sample(distance - ds, this.before);
    this.base.sample(distance + ds, this.after);
    out.f.addScaledVector(this.before.r, -sign * branchSpread(this.beatAt(distance - ds)) / (2 * ds))
      .addScaledVector(this.after.r, sign * branchSpread(this.beatAt(distance + ds)) / (2 * ds)).normalize();
    out.r.crossVectors(out.f, out.u).normalize();
    out.u.crossVectors(out.r, out.f).normalize();
    return out;
  }
}
