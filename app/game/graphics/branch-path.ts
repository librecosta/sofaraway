import * as THREE from 'three';
import { branchDistance, branchSpread, BRANCH_PREVIEW_BEAT, REJOIN_BEAT, SPLIT_BEAT } from '../core/branches';
import type { BranchAnchor, RouteSide } from '../core/branches';
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

  constructor(readonly base: Path, readonly anchor: BranchAnchor) {
    this.start = this.distanceAt(BRANCH_PREVIEW_BEAT);
    this.split = this.distanceAt(SPLIT_BEAT);
    this.end = this.distanceAt(REJOIN_BEAT);
  }

  distanceAt(beat: number) { return branchDistance(this.anchor, beat); }
  beatAt(distance: number) { return SPLIT_BEAT + (distance - this.split) / this.anchor.unitsPerBeat; }

  sample(distance: number, side: RouteSide, out = pathFrame()): PathFrame {
    this.base.sample(distance, out);
    if (side === 'center' || distance <= this.split || distance >= this.end) return out;
    const sign = side === 'left' ? -1 : 1;
    out.p.addScaledVector(out.r, sign * branchSpread(this.beatAt(distance), SPLIT_BEAT));
    const ds = 0.25;
    this.base.sample(distance - ds, this.before);
    this.base.sample(distance + ds, this.after);
    out.f.addScaledVector(this.before.r, -sign * branchSpread(this.beatAt(distance - ds), SPLIT_BEAT) / (2 * ds))
      .addScaledVector(this.after.r, sign * branchSpread(this.beatAt(distance + ds), SPLIT_BEAT) / (2 * ds)).normalize();
    out.r.crossVectors(out.f, out.u).normalize();
    out.u.crossVectors(out.r, out.f).normalize();
    return out;
  }
}
