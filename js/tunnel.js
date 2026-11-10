import * as THREE from 'three';
import { QUALITY } from './quality.js?v=2026-11-10u';
import { VOL } from './volumes.js';

/* ------------------------------------------------------------------ *
 *  The corridor, built along a Path.
 *
 *  Geometry is generated in chunks as the camera advances and dropped
 *  behind it. Chunks are built a few hundred units ahead, so the next
 *  stretch — and the turn into it — is always already there.
 * ------------------------------------------------------------------ */
export const TUNNEL = {
  a: 3.75,
  b: 2.95,
  ch: 1.20,
  ring: 3.0,
};

const RING = QUALITY.ring;   // rib spacing, set by the quality tier
const CHUNK = 210;
const KEEP_BEHIND = 90;
const KEEP_AHEAD = 430;

/* conduit: a closed octagon.  canal: an open U — floor, two low walls,
   nothing overhead — with a glazed side handled by the shell material. */
export function profile() {
  const { a, b, ch } = TUNNEL;
  if (VOL.topology === 'canal') {
    const lip = 0.55;
    return {
      closed: false,
      pts: [
        [-a, lip], [-a, -b + ch], [-a + ch, -b],
        [a - ch, -b], [a, -b + ch], [a, lip],
      ],
    };
  }
  return {
    closed: true,
    pts: [
      [-a + ch, -b], [a - ch, -b],
      [a, -b + ch], [a, b - ch],
      [a - ch, b], [-a + ch, b],
      [-a, b - ch], [-a, -b + ch],
    ],
  };
}

function frame() {
  return {
    p: new THREE.Vector3(), f: new THREE.Vector3(),
    r: new THREE.Vector3(), u: new THREE.Vector3(),
  };
}

export class Tunnel {
  constructor(tex, path) {
    this.group = new THREE.Group();
    this.path = path;
    this.chunks = [];
    this.wire = null;

    this._buildMaterials(tex);
    this._buildLights();
    this._buildWire();
  }

  /* ---------------- shared materials ---------------- */
  _buildMaterials(tex) {
    this.shellMat = new THREE.MeshStandardMaterial({
      map: tex.hullMap,
      normalMap: tex.hullNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      color: 0x2a3038,
      metalness: 0.45,
      roughness: 0.55,
      side: THREE.DoubleSide,
      envMapIntensity: 1.0,
      emissive: 0x000000,
    });
    tex.hullMap.repeat.set(3, 3);
    tex.hullNormal.repeat.set(3, 3);

    this.ribMat = new THREE.MeshStandardMaterial({
      color: 0x151a20, metalness: 0.8, roughness: 0.38,
      side: THREE.DoubleSide, envMapIntensity: 1.4,
    });

    this.rimMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, toneMapped: false,
    });

    this.stripMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, toneMapped: false,
    });

    this.wireMat = new THREE.LineBasicMaterial({
      color: 0x0a0d10, transparent: true, opacity: 1, fog: true, depthWrite: false,
    });
  }

  /* ---------------- light rig that rides with the camera ---------------- */
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x88bbdd, 0x08090b, 0.55);
    this.group.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x223344, 0.45);
    this.group.add(this.ambient);

    this.lights = [];
    for (const d of [14, 52, 104, 170]) {
      const l = new THREE.PointLight(0x44ffcc, 30, 100, 2);
      l.userData.d = d;
      this.group.add(l);
      this.lights.push(l);
    }
  }

  moveLights(s) {
    const fr = frame();
    for (const l of this.lights) {
      this.path.sample(s + l.userData.d, fr);
      l.position.copy(fr.p);
    }
  }

  /* ---------------- one chunk ---------------- */
  _buildChunk(s0, s1) {
    const PR = profile();
    const P = PR.pts;
    const n = P.length;
    const edges = PR.closed ? n : n - 1;

    const perim = [0];
    for (let i = 0; i < edges; i++) {
      const a = P[i], b = P[(i + 1) % n];
      perim.push(perim[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const totalPerim = perim[edges];

    const rings = [];
    for (let s = s0; s < s1; s += RING) rings.push(s);
    rings.push(s1);

    const ghost = VOL.topology === 'orbit';   // light frame only, no hull
    const shell = { pos: [], nor: [], uv: [], idx: [] };
    const rib = { pos: [], nor: [], idx: [] };
    const rim = { pos: [], nor: [], idx: [] };
    const strip = { pos: [], idx: [] };

    const A = frame();
    const B = frame();
    const v3 = new THREE.Vector3();

    const put = (arr, fr, px, py) => {
      v3.copy(fr.p).addScaledVector(fr.r, px).addScaledVector(fr.u, py);
      arr.pos.push(v3.x, v3.y, v3.z);
    };

    /* ---- shell: quad strips between consecutive rings ---- */
    for (let k = 0; k < rings.length - 1; k++) {
      const sA = rings[k], sB = rings[k + 1];
      this.path.sample(sA, A);
      this.path.sample(sB, B);
      // absolute V, so the plating is continuous across chunk seams
      const vA = sA / totalPerim * 3.0;
      const vB = sB / totalPerim * 3.0;

      for (let i = 0; i < edges && !ghost; i++) {
        const p0 = P[i], p1 = P[(i + 1) % n];
        const ex = p1[0] - p0[0], ey = p1[1] - p0[1];
        const el = Math.hypot(ex, ey) || 1;
        const nx2 = -ey / el, ny2 = ex / el;

        const base = shell.pos.length / 3;
        put(shell, A, p0[0], p0[1]);
        put(shell, A, p1[0], p1[1]);
        put(shell, B, p1[0], p1[1]);
        put(shell, B, p0[0], p0[1]);

        v3.copy(A.r).multiplyScalar(nx2).addScaledVector(A.u, ny2);
        for (let q = 0; q < 4; q++) shell.nor.push(v3.x, v3.y, v3.z);

        const u0 = perim[i] / totalPerim, u1 = perim[Math.min(i + 1, edges)] / totalPerim;
        shell.uv.push(u0, vA, u1, vA, u1, vB, u0, vB);
        shell.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    /* ---- ribs + glowing rim, a flange at every ring ---- */
    const R = 1.055, IN = 0.955, RIMW = 0.948;
    for (const s of rings) {
      this.path.sample(s, A);
      for (let i = 0; i < edges; i++) {
        const p0 = P[i], p1 = P[(i + 1) % n];
        const addRing = (target, a, b) => {
          const base = target.pos.length / 3;
          for (const [px, py] of [
            [p0[0] * a, p0[1] * a], [p1[0] * a, p1[1] * a],
            [p1[0] * b, p1[1] * b], [p0[0] * b, p0[1] * b],
          ]) {
            v3.copy(A.p).addScaledVector(A.r, px).addScaledVector(A.u, py);
            target.pos.push(v3.x, v3.y, v3.z);
            target.nor.push(A.f.x, A.f.y, A.f.z);
          }
          target.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        };
        addRing(rib, IN, R);
        addRing(rim, RIMW, IN);
      }
    }

    /* ---- light ribbons down every corner ---- */
    const SW = 0.042;
    for (let i = 0; i < edges; i++) {
      const p = P[i];
      const len = Math.hypot(p[0], p[1]) || 1;
      const tx = -p[1] / len, ty = p[0] / len;

      const INSET = 0.972;      // sit inside the hull, not through it
      for (let k = 0; k < rings.length - 1; k++) {
        this.path.sample(rings[k], A);
        this.path.sample(rings[k + 1], B);
        const base = strip.pos.length / 3;
        for (const fr of [A, B]) {
          for (const sgn of [-1, 1]) {
            put(strip, fr, (p[0] + tx * SW * sgn) * INSET, (p[1] + ty * SW * sgn) * INSET);
          }
        }
        strip.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    /* ---- build meshes ---- */
    const geoOf = (d) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      if (d.nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
      if (d.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
      if (d.idx) g.setIndex(d.idx);
      return g;
    };

    const meshes = [];
    const add = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      meshes.push(m);
      this.group.add(m);
    };

    add(geoOf(shell), this.shellMat);
    add(geoOf(rib), this.ribMat);
    add(geoOf(rim), this.rimMat);

    const sg = geoOf(strip);
    sg.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(strip.pos.length), 3));
    add(sg, this.stripMat);

    return { s0, s1, meshes };
  }

  /* ---------------- streaming ---------------- */
  update(s) {
    this.moveLights(s);

    const need0 = s - KEEP_BEHIND;
    const need1 = s + KEEP_AHEAD;

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      if (c.s1 < need0) {
        for (const m of c.meshes) {
          this.group.remove(m);
          m.geometry.dispose();
        }
        this.chunks.splice(i, 1);
      }
    }

    let lo = Infinity, hi = -Infinity;
    for (const c of this.chunks) { lo = Math.min(lo, c.s0); hi = Math.max(hi, c.s1); }
    if (!this.chunks.length) { lo = s; hi = s; }

    // build forward
    let guard = 0;
    while (hi < need1 && hi < this.path.length - 1 && guard++ < 8) {
      const a = Math.max(0, hi);
      const b = Math.min(this.path.length, a + CHUNK);
      if (b - a < 1) break;
      this.chunks.push(this._buildChunk(a, b));
      hi = b;
    }

    // build backward — the camera can now recede, so the corridor has to grow
    // behind it as well as ahead
    guard = 0;
    while (lo > need0 && lo > 0 && guard++ < 8) {
      const b = Math.min(this.path.length, lo);
      const a = Math.max(0, b - CHUNK);
      if (b - a < 1) break;
      this.chunks.push(this._buildChunk(a, b));
      lo = a;
    }
  }

  /* ---------------- colour ---------------- */
  setHue(h) {
    this.hue = h;
    const c = new THREE.Color().setHSL(h, 1.0, 0.5);
    this.stripMat.color.copy(c);
    this.rimMat.color.copy(c).multiplyScalar(0.55);
    for (const l of this.lights) l.color.copy(c);
    this.ambient.color.setHSL(h, 0.9, 0.22);
    this.hemi.color.setHSL(h, 0.75, 0.40);

    this.shellMat.color.setHSL(h, 0.42, 0.32);
    this.shellMat.emissive.setHSL(h, 0.8, 0.03);
    this.ribMat.color.setHSL(h, 0.45, 0.10);
    this.ribMat.emissive.setHSL(h, 0.9, 0.02);
  }

  pulse(p) {
    const c = new THREE.Color().setHSL(this.hue === undefined ? 0.45 : this.hue, 1.0, 0.5);
    this.stripMat.color.copy(c).multiplyScalar(1 + p * 1.3);
    this.rimMat.color.copy(c).multiplyScalar(0.55 + p * 1.0);
  }

  /* ---------------- menu wireframe ---------------- */
  _buildWire() {
    const PR = profile();
    const P = PR.pts;
    const n = P.length;
    const edges = PR.closed ? n : n - 1;
    const pos = [];
    const seg = (a, b) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const A = frame(), B = frame();

    const end = Math.min(this.path.length, 380);
    const rings = [];
    for (let s = 1.0; s < end; s += RING) rings.push(s);

    for (const s of rings) {
      this.path.sample(s, A);
      for (let i = 0; i < edges; i++) {
        const p0 = P[i], p1 = P[(i + 1) % n];
        seg(
          new THREE.Vector3().copy(A.p).addScaledVector(A.r, p0[0]).addScaledVector(A.u, p0[1]),
          new THREE.Vector3().copy(A.p).addScaledVector(A.r, p1[0]).addScaledVector(A.u, p1[1])
        );
      }
    }
    for (let i = 0; i < n; i++) {
      const p = P[i];
      this.path.sample(1.0, A);
      const a = new THREE.Vector3().copy(A.p).addScaledVector(A.r, p[0]).addScaledVector(A.u, p[1]);
      this.path.sample(end, B);
      const b = new THREE.Vector3().copy(B.p).addScaledVector(B.r, p[0]).addScaledVector(B.u, p[1]);
      seg(a, b);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.wire = new THREE.LineSegments(geo, this.wireMat);
    this.wire.frustumCulled = false;
    this.wire.visible = false;
    this.group.add(this.wire);
  }

  setWireframe(on) {
    for (const c of this.chunks) for (const m of c.meshes) m.visible = !on;
    if (this.wire) this.wire.visible = on;
  }
}
