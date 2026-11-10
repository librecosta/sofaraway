import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Path — the corridor's centreline.
 *
 *  Built from alternating straights and 90 degree bends. Frames are
 *  integrated at a fixed arc-length step so sampling is a cheap lookup:
 *  the camera, the geometry and every bulkhead all ride the same curve.
 * ------------------------------------------------------------------ */

const STEP = 1.0;

export class Path {
  constructor() {
    this.frames = [];
    this.length = 0;
    this.segments = [];

    this.p = new THREE.Vector3(0, 0, 0);
    this.f = new THREE.Vector3(0, 0, -1);
    this.r = new THREE.Vector3(1, 0, 0);
    this.u = new THREE.Vector3(0, 1, 0);

    this._push();
  }

  _push() {
    this.frames.push({
      s: this.length,
      p: this.p.clone(),
      f: this.f.clone(),
      r: this.r.clone(),
      u: this.u.clone(),
    });
  }

  _rot(axis, ang) {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, ang);
    this.f.applyQuaternion(q).normalize();
    this.r.applyQuaternion(q).normalize();
    this.u.applyQuaternion(q).normalize();
  }

  straight(len) {
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
  bend(dir, radius) {
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
  sample(s, out) {
    const t = out || {};
    const maxS = this.length;
    const cs = s < 0 ? 0 : (s > maxS ? maxS : s);
    const i = Math.min(this.frames.length - 2, Math.floor(cs));
    const a = this.frames[i];
    const b = this.frames[i + 1] || a;
    const k = b === a ? 0 : (cs - a.s) / (b.s - a.s);

    t.p = (t.p || new THREE.Vector3()).copy(a.p).lerp(b.p, k);
    t.f = (t.f || new THREE.Vector3()).copy(a.f).lerp(b.f, k).normalize();
    t.u = (t.u || new THREE.Vector3()).copy(a.u).lerp(b.u, k).normalize();

    // rebuilding the basis keeps it exactly orthonormal; lerping three
    // vectors independently lets them drift apart and the camera wobbles
    t.r.crossVectors(t.f, t.u).normalize();
    t.u.crossVectors(t.r, t.f).normalize();
    return t;
  }

  /** is [s0, s1] entirely inside one straight? */
  straightBetween(s0, s1) {
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
export function buildPath(totalLength, straightLen = 150, radius = 46) {
  const path = new Path();
  let dirs = ['left', 'right', 'up', 'down'];
  let di = 0;

  while (path.length < totalLength) {
    path.straight(straightLen);
    // never turn twice the same way, and bias away from pure up/down repeats
    path.bend(dirs[di % dirs.length], radius);
    di++;
    if (di % 4 === 0) {
      dirs = dirs.slice(1).concat(dirs[0]);
    }
  }
  return path;
}
