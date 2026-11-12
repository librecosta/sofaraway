import * as THREE from 'three';
import type { PlayMode } from '../contracts';
import { composeElsewhere, corridorLength, curveOffset, curveSlope } from '../core/corridor-composition';
import type { CorridorSegment } from '../core/corridor-composition';
import type { Topology, VolumeDefinition } from '../core/volumes';

export interface PathFrame { p: THREE.Vector3; f: THREE.Vector3; r: THREE.Vector3; u: THREE.Vector3 }
type Direction = 'left' | 'right' | 'up' | 'down';
interface LegacySegment { type: 'straight' | Direction; s0: number; s1: number }
type AuthoredSegment = (Exclude<CorridorSegment, { type: 'junction' }> & { origin: PathFrame })
  | (Extract<CorridorSegment, { type: 'junction' }> & { source: Path; rotation: THREE.Quaternion; translation: THREE.Vector3 });

/* ------------------------------------------------------------------ *
 *  Path — the corridor's centreline.
 *
 *  Built from alternating straights and 90 degree bends. Frames are
 *  integrated at a fixed arc-length step so sampling is a cheap lookup:
 *  the camera, the geometry and every bulkhead all ride the same curve.
 * ------------------------------------------------------------------ */

const STEP = 1.0;

export class Path {
  frames: (PathFrame & { s: number })[];
  segments: (LegacySegment | CorridorSegment)[];
  length: number;
  private readonly authored: AuthoredSegment[] = [];
  private p: THREE.Vector3;
  private f: THREE.Vector3;
  private r: THREE.Vector3;
  private u: THREE.Vector3;
  private directions: Direction[] = ['left', 'right', 'up', 'down'];
  private bends = 0;
  private sampleFrom = 0;
  private runPath?: { frames: number; segments: number };

  constructor(private readonly straightLen: number, private readonly radius: number, topology: Topology) {
    this.frames = [];
    this.length = 0;
    this.segments = [];

    this.p = new THREE.Vector3(0, 0, 0);
    this.f = new THREE.Vector3(0, 0, -1);
    this.r = new THREE.Vector3(1, 0, 0);
    this.u = new THREE.Vector3(0, 1, 0);

    this._push();
    if (topology === 'shaft') {
      this.straight(60);
      this.bend('down', radius);
      this.directions = ['down', 'left', 'down', 'right'];
    }
  }

  extend(through: number) {
    while (this.length < through) {
      this.straight(this.straightLen);
      this.bend(this.directions[this.bends % this.directions.length], this.radius);
      if (++this.bends % 4 === 0) this.directions.push(this.directions.shift()!);
    }
  }

  extendMenu(through: number, keepFrom: number) {
    if (through <= this.length) return;
    const run = this.runPath ??= { frames: this.frames.length, segments: this.segments.length };
    this.extend(through);
    // Retain the original run path and one sample before the live streaming window.
    let frame = run.frames;
    while (frame + 1 < this.frames.length && this.frames[frame + 1].s < keepFrom) frame++;
    this.frames.splice(run.frames, frame - run.frames);
    let segment = run.segments;
    while (this.segments[segment].s1 < keepFrom) segment++;
    this.segments.splice(run.segments, segment - run.segments);
  }

  _push() {
    if (this.length < this.sampleFrom) return;
    this.frames.push({
      s: this.length,
      p: this.p.clone(),
      f: this.f.clone(),
      r: this.r.clone(),
      u: this.u.clone(),
    });
  }

  author(plan: readonly CorridorSegment[]) {
    const next = { p: this.p, f: this.f, r: this.r, u: this.u };
    for (const segment of plan) {
      const origin = { p: this.p.clone(), f: this.f.clone(), r: this.r.clone(), u: this.u.clone() };
      let item: AuthoredSegment;
      if (segment.type === 'junction') {
        const source = new Path(this.straightLen, this.radius, 'conduit');
        source.sampleFrom = segment.s0 - 2;
        source.frames.length = 0;
        source.extend(segment.s1);
        source.segments = source.segments.filter(seg => seg.s1 >= segment.s0 && seg.s0 <= segment.s1);
        const entry = source.sample(segment.s0);
        const basis = (frame: PathFrame) => new THREE.Matrix4().makeBasis(frame.r, frame.u, frame.f.clone().negate());
        const rotation = new THREE.Quaternion().setFromRotationMatrix(basis(origin))
          .multiply(new THREE.Quaternion().setFromRotationMatrix(basis(entry)).invert()).normalize();
        const translation = origin.p.clone().sub(entry.p.applyQuaternion(rotation));
        item = { ...segment, source, rotation, translation };
      } else {
        item = { ...segment, origin };
      }
      this.authored.push(item);
      this.segments.push(segment);
      this.sampleSegment(item, segment.s1, next);
      this.length = segment.s1;
      this._push();
    }
    return this;
  }

  /** Explicit endpoints for shell sampling without shifting the structural ring grid. */
  boundaries(from: number, to: number) {
    const internal = (s: number) => s > from + 1e-7 && s < to - 1e-7;
    const cuts: number[] = [];
    for (const seg of this.authored) {
      if (seg.type === 'junction' && seg.s0 < to && seg.s1 > from) {
        for (const source of seg.source.segments) {
          if (source.s1 > seg.s0 && source.s1 < seg.s1 && internal(source.s1)) cuts.push(source.s1);
        }
      }
      if (internal(seg.s1)) cuts.push(seg.s1);
    }
    return cuts;
  }

  get arcTableBytes() {
    return this.authored.reduce((bytes, seg) => bytes + (seg.type === 's-curve' ? seg.arc.byteLength : 0), 0);
  }

  get retainedFrameCount(): number {
    return this.frames.length + this.authored.reduce((count, seg) =>
      count + (seg.type === 'junction' ? seg.source.frames.length : 0), 0);
  }

  private sampleSegment(seg: AuthoredSegment, s: number, out: PathFrame) {
    if (seg.type === 'junction') {
      seg.source.sample(s, out);
      out.p.applyQuaternion(seg.rotation).add(seg.translation);
      out.f.applyQuaternion(seg.rotation);
      out.r.applyQuaternion(seg.rotation);
      out.u.applyQuaternion(seg.rotation);
      return out;
    }
    const { origin, s0, s1 } = seg;
    const ds = s - s0;
    out.p.copy(origin.p);
    out.f.copy(origin.f);
    out.u.copy(origin.u);
    if (seg.type === 'straight') {
      out.p.addScaledVector(origin.f, ds);
    } else if (seg.type === 'bend') {
      const radius = (s1 - s0) / seg.angle;
      const angle = ds / radius;
      out.p.addScaledVector(origin.f, radius * Math.sin(angle))
        .addScaledVector(origin.r, radius * (1 - Math.cos(angle)));
      out.f.multiplyScalar(Math.cos(angle)).addScaledVector(origin.r, Math.sin(angle));
    } else {
      const arc = seg.arc;
      let lo = 0, hi = arc.length - 1;
      while (lo + 1 < hi) {
        const mid = (lo + hi) >>> 1;
        if (arc[mid] <= ds) lo = mid;
        else hi = mid;
      }
      const t = ds <= 0 ? 0 : s >= s1 ? 1 : (lo + (ds - arc[lo]) / (arc[hi] - arc[lo])) / (arc.length - 1);
      out.p.addScaledVector(origin.f, seg.depth * t).addScaledVector(origin.r, seg.amplitude * curveOffset(t));
      out.f.multiplyScalar(seg.depth).addScaledVector(origin.r, seg.amplitude * curveSlope(t)).normalize();
    }
    out.r.crossVectors(out.f, out.u).normalize();
    out.u.crossVectors(out.r, out.f).normalize();
    return out;
  }

  private _rot(axis: THREE.Vector3, ang: number) {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, ang);
    this.f.applyQuaternion(q).normalize();
    this.r.applyQuaternion(q).normalize();
    this.u.applyQuaternion(q).normalize();
  }

  straight(len: number) {
    const s0 = this.length;
    const n = Math.max(1, Math.round(len / STEP));
    const ds = len / n;
    for (let i = 0; i < n; i++) {
      this.p.addScaledVector(this.f, ds);
      this.length += ds;
      this._push();
    }
    this.segments.push({ type: 'straight', s0, s1: this.length });
    return this;
  }

  /** dir: 'left' | 'right' | 'up' | 'down' */
  bend(dir: Direction, radius: number) {
    const s0 = this.length;
    const arc = radius * Math.PI / 2;       // always a quarter turn
    const n = Math.max(4, Math.round(arc / STEP));
    const ds = arc / n;
    const dAng = (Math.PI / 2) / n;

    for (let i = 0; i < n; i++) {
      // rotate first, then advance, so the arc is tangent-continuous
      if (dir === 'left') this._rot(this.u, dAng);
      else if (dir === 'right') this._rot(this.u, -dAng);
      else if (dir === 'up') this._rot(this.r, dAng);
      else this._rot(this.r, -dAng);

      this.p.addScaledVector(this.f, ds);
      this.length += ds;
      this._push();
    }
    this.segments.push({ type: dir, s0, s1: this.length });
    return this;
  }

  /** frame at arc-length s (clamped) */
  sample(s: number, out?: PathFrame): PathFrame {
    const t = out ?? { p: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3() };
    const maxS = this.length;
    const cs = s < 0 ? 0 : (s > maxS ? maxS : s);
    const last = this.authored.at(-1);
    if (last && cs <= last.s1) {
      let lo = 0, hi = this.authored.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cs <= this.authored[mid].s1) hi = mid;
        else lo = mid + 1;
      }
      return this.sampleSegment(this.authored[lo], cs, t);
    }
    // Frames are not exactly one unit apart (a quarter turn's arc length is
    // whatever it is), so index by arc length, not by rounding the distance.
    // Rounding made the sample slip one frame every time d crossed an integer,
    // which is the periodic 0.1 unit jump that read as the camera shivering.
    const n = this.frames.length;
    let lo = 0, hi = n - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].s <= cs) lo = mid; else hi = mid;
    }
    const a = this.frames[lo];
    const b = this.frames[hi] || a;
    const k = b.s > a.s ? (cs - a.s) / (b.s - a.s) : 0;

    t.p = t.p.copy(a.p).lerp(b.p, k);
    t.f = t.f.copy(a.f).lerp(b.f, k).normalize();
    t.u = t.u.copy(a.u).lerp(b.u, k).normalize();

    // rebuilding the basis keeps it exactly orthonormal; lerping three
    // vectors independently lets them drift apart and the camera wobbles
    t.r = t.r.crossVectors(t.f, t.u).normalize();
    t.u.crossVectors(t.r, t.f).normalize();
    return t;
  }

  /** is [s0, s1] entirely inside one straight? */
  straightBetween(s0: number, s1: number) {
    for (const seg of this.segments) {
      if (seg.type !== 'straight') continue;
      if (s0 >= seg.s0 && s1 <= seg.s1) return seg;
    }
    return null;
  }
}

/* ------------------------------------------------------------------ *
 *  The corridor plan.
 *
 *  One straight then one quarter turn, repeated. Straights are long
 *  enough to hold a handful of bulkheads; turns are the breathing room.
 * ------------------------------------------------------------------ */
export function buildPath(totalLength: number, straightLen = 150, radius = 46, topology: Topology = 'conduit') {
  const path = new Path(straightLen, radius, topology);
  path.extend(totalLength);
  return path;
}

export function buildRunPath(volume: VolumeDefinition, mode: PlayMode = 'standard') {
  if (volume.id === 'elsewhere') return new Path(150, 46, volume.topology).author(composeElsewhere(volume, mode));
  return buildPath(corridorLength(volume), 150, 46, volume.topology);
}
