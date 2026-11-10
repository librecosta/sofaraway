import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Tunnel: an octagonal corridor extruded along -Z.
 *  Everything is periodic with period TUNNEL.seg, which lets us fake
 *  infinite forward travel by nudging the whole group by (dist % seg).
 * ------------------------------------------------------------------ */
export const TUNNEL = {
  a: 3.75,      // half width
  b: 2.95,      // half height
  ch: 1.20,     // corner chamfer
  zNear: 30,    // behind the camera
  zFar: -360,   // ahead (fog hides the end)
  seg: 3.0,     // ring spacing
};

export function profile() {
  const { a, b, ch } = TUNNEL;
  return [
    [-a + ch, -b], [a - ch, -b],   // floor
    [a, -b + ch], [a, b - ch],     // right wall
    [a - ch, b], [-a + ch, b],     // ceiling
    [-a, b - ch], [-a, -b + ch],   // left wall
  ];
}

const tmpA = new THREE.Vector3();

export class Tunnel {
  constructor(tex) {
    this.group = new THREE.Group();
    this.materials = [];
    this.strips = [];
    this.hue = 0.45;

    this._buildShell(tex);
    this._buildRibs(tex);
    this._buildStrips();
    this._buildWallBars();

    this.lights = [];
    this._buildLights();

    this.setHue(0.45, 0.0);
  }

  /* ---------------- shell ---------------- */
  _buildShell(tex) {
    const P = profile();
    const n = P.length;
    const step = TUNNEL.seg / 2;                       // finer rings so light pools read
    const count = Math.ceil((TUNNEL.zNear - TUNNEL.zFar) / step);

    // perimeter distance for U
    const perim = [0];
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      perim.push(perim[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const totalPerim = perim[n];

    // brightness pool: bright at each rib, dark mid-segment
    const poolAt = (z) => {
      const rel = (((TUNNEL.zNear - z) % TUNNEL.seg) + TUNNEL.seg) % TUNNEL.seg;
      const t = rel / TUNNEL.seg;
      const d = Math.min(t, 1 - t);
      return 0.22 + 0.78 * Math.exp(-(d * 2.4) * (d * 2.4));
    };

    const pos = [], nor = [], uv = [], col = [], idx = [];
    let v = 0;

    for (let s = 0; s < count; s++) {
      const z0 = TUNNEL.zNear - s * step;
      const z1 = z0 - step;
      const b0 = poolAt(z0), b1 = poolAt(z1);

      for (let i = 0; i < n; i++) {
        const p0 = P[i], p1 = P[(i + 1) % n];

        const ex = p1[0] - p0[0], ey = p1[1] - p0[1];
        const el = Math.hypot(ex, ey) || 1;
        const nx = -ey / el, ny = ex / el;   // inward

        const base = pos.length / 3;
        pos.push(p0[0], p0[1], z0);
        pos.push(p1[0], p1[1], z0);
        pos.push(p1[0], p1[1], z1);
        pos.push(p0[0], p0[1], z1);
        for (let k = 0; k < 4; k++) nor.push(nx, ny, 0);
        col.push(b0, b0, b0, b0, b0, b0, b1, b1, b1, b1, b1, b1);

        const u0 = perim[i] / totalPerim;
        const u1 = perim[i + 1] / totalPerim;
        const v0 = v / totalPerim * 3.0;
        const v1 = (v + step) / totalPerim * 3.0;
        uv.push(u0, v0, u1, v0, u1, v1, u0, v1);

        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      v += step;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);

    const m = new THREE.MeshStandardMaterial({
      map: tex.hullMap,
      normalMap: tex.hullNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      color: 0x2a3038,
      metalness: 0.50,
      roughness: 0.52,
      side: THREE.DoubleSide,
      envMapIntensity: 1.15,
      emissive: 0x000000,
      vertexColors: true,
    });
    // tile the texture across the perimeter
    tex.hullMap.repeat.set(3, 3);
    tex.hullNormal.repeat.set(3, 3);

    this.shell = new THREE.Mesh(g, m);
    this.shell.frustumCulled = false;
    this.group.add(this.shell);
    this.materials.push(m);
  }

  /* ---------------- ribs (flanges) ---------------- */
  _buildRibs(tex) {
    const P = profile();
    const n = P.length;
    const count = Math.ceil((TUNNEL.zNear - TUNNEL.zFar) / TUNNEL.seg) + 1;

    const IN = 0.955, OUT = 1.0, RIM = 0.948;

    const pos = [], nor = [], uv = [], idx = [];
    const rpos = [], rnor = [], ruv = [], ridx = [];

    const pushRing = null;
    void pushRing;

    for (let s = 0; s < count; s++) {
      const z = TUNNEL.zNear - s * TUNNEL.seg;

      for (let i = 0; i < n; i++) {
        const p0 = P[i], p1 = P[(i + 1) % n];

        // structural band
        let base = pos.length / 3;
        pos.push(p0[0] * IN, p0[1] * IN, z);
        pos.push(p1[0] * IN, p1[1] * IN, z);
        pos.push(p1[0] * OUT, p1[1] * OUT, z);
        pos.push(p0[0] * OUT, p0[1] * OUT, z);
        for (let k = 0; k < 4; k++) nor.push(0, 0, 1);
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);

        // glowing rim
        base = rpos.length / 3;
        rpos.push(p0[0] * RIM, p0[1] * RIM, z);
        rpos.push(p1[0] * RIM, p1[1] * RIM, z);
        rpos.push(p1[0] * IN, p1[1] * IN, z);
        rpos.push(p0[0] * IN, p0[1] * IN, z);
        for (let k = 0; k < 4; k++) rnor.push(0, 0, 1);
        ruv.push(0, 0, 1, 0, 1, 1, 0, 1);
        ridx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);

    const m = new THREE.MeshStandardMaterial({
      color: 0x151a20,
      metalness: 0.8,
      roughness: 0.38,
      side: THREE.DoubleSide,
      envMapIntensity: 1.4,
    });
    this.ribs = new THREE.Mesh(g, m);
    this.ribs.frustumCulled = false;
    this.group.add(this.ribs);
    this.materials.push(m);

    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3));
    rg.setAttribute('normal', new THREE.Float32BufferAttribute(rnor, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
    rg.setIndex(ridx);

    this.rimMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.rims = new THREE.Mesh(rg, this.rimMat);
    this.rims.frustumCulled = false;
    this.group.add(this.rims);
  }

  /* ---------------- emissive strips ---------------- */
  _buildStrips() {
    const P = profile();
    const len = TUNNEL.zNear - TUNNEL.zFar;
    const zc = (TUNNEL.zNear + TUNNEL.zFar) / 2;

    const mk = (x, y, w, h) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), m);
      mesh.position.set(x, y, zc);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.strips.push({ mesh, base: 1 });
      return mesh;
    };

    // 8 corner seams
    for (let i = 0; i < P.length; i++) {
      const [x, y] = P[i];
      mk(x * 0.988, y * 0.988, 0.026, 0.026);
    }

    // horizontal accent bars
    mk(0, TUNNEL.b * 0.99, 0.07, 0.03);          // ceiling centre
    mk(0, -TUNNEL.b * 0.99, 0.07, 0.03);         // floor centre
    mk(TUNNEL.a * 0.99, 0, 0.03, 0.07);          // right wall
    mk(-TUNNEL.a * 0.99, 0, 0.03, 0.07);         // left wall
  }

  /* ---------------- wall light bars (merged, 1 draw call) ---------------- */
  _buildWallBars() {
    const pos = [], nor = [], uv = [], idx = [];
    const { a, b } = TUNNEL;
    const step = 8;
    const len = 1.9, th = 0.09;

    // quad builder in the plane perpendicular to `axis`
    const quad = (axis, x, y, z) => {
      const base = pos.length / 3;
      if (axis === 'x') {
        // wall at x, facing -sign(x) toward axis
        const s = Math.sign(x);
        pos.push(x, y - th, z - len, x, y + th, z - len, x, y + th, z + len, x, y - th, z + len);
        for (let k = 0; k < 4; k++) nor.push(-s, 0, 0);
      } else {
        // ceiling/floor at y
        const s = Math.sign(y);
        pos.push(x - len, y, z - th, x + len, y, z - th, x + len, y, z + th, x - len, y, z + th);
        for (let k = 0; k < 4; k++) nor.push(0, -s, 0);
      }
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    for (let z = TUNNEL.zNear; z > TUNNEL.zFar; z -= step) {
      quad('x', a * 0.985, 0, z);
      quad('x', -a * 0.985, 0, z);
      quad('y', 0, b * 0.985, z + step * 0.5);
      quad('y', 0, -b * 0.985, z + step * 0.5);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);

    this.barMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.bars = new THREE.Mesh(g, this.barMat);
    this.bars.frustumCulled = false;
    this.group.add(this.bars);
  }

  /* ---------------- moving light rig ---------------- */
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x88bbdd, 0x08090b, 0.22);
    this.group.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x223344, 0.16);
    this.group.add(this.ambient);

    // axial rig: keeps the corridor readable without flattening it
    const spots = [
      [0, 0.6, -9, 20],
      [0, 0.2, -44, 20],
      [0, -0.6, -96, 18],
    ];
    for (const [x, y, z, i] of spots) {
      const l = new THREE.PointLight(0x44ffcc, i, 80, 2);
      l.position.set(x, y, z);
      l.userData.base = i;
      this.group.add(l);
      this.lights.push(l);
    }

    // camera headlight
    this.head = new THREE.PointLight(0x88bbff, 7, 30, 2);
    this.head.position.set(0, 0, -2);
    this.group.add(this.head);
  }

  /* ---------------- colour ---------------- */
  setHue(h, sat = 1.0, light = 0.5) {
    this.hue = h;
    const c = new THREE.Color();

    // strips
    c.setHSL(h, Math.min(1, sat), light * 0.85);
    for (const s of this.strips) s.mesh.material.color.copy(c);

    // ambient bounce
    c.setHSL(h, 0.9, 0.20);
    this.ambient.color.copy(c);
    this.hemi.color.setHSL(h, 0.75, 0.35);
    this.hemi.groundColor.setHSL(h, 0.6, 0.05);

    // point lights
    c.setHSL(h, 0.95, 0.58);
    for (const l of this.lights) l.color.copy(c);

    // headlight stays cool
    this.head.color.setHSL((h + 0.5) % 1, 0.5, 0.7);

    // shell tint + faint self-illumination so the hull never goes pure black
    const shellC = new THREE.Color().setHSL(h, 0.42, 0.30);
    this.shell.material.color.copy(shellC);
    this.shell.material.emissive.setHSL(h, 0.8, 0.035);
    this.ribs.material.color.setHSL(h, 0.45, 0.12);
    this.ribs.material.emissive.setHSL(h, 0.9, 0.02);
    if (this.rimMat) this.rimMat.color.setHSL(h, 1.0, 0.55);
    if (this.barMat) this.barMat.color.setHSL(h, 0.85, 0.62);
  }

  pulse(p) {
    const c = new THREE.Color();
    c.setHSL(this.hue, 1.0, 0.5);
    const k = 1 + p * 1.2;
    for (const s of this.strips) s.mesh.material.color.copy(c).multiplyScalar(k);
    if (this.rimMat) this.rimMat.color.copy(c).multiplyScalar(0.42 + p * 0.9);
    if (this.barMat) this.barMat.color.copy(c).multiplyScalar(1.0 + p * 1.6);
    for (const l of this.lights) l.intensity = l.userData.base * (1 + p * 0.85);
  }

  update(dist) {
    this.group.position.z = dist % TUNNEL.seg;
  }

  setWireframe(on) {
    this.shell.material.wireframe = on;
    this.ribs.material.wireframe = on;
    for (const s of this.strips) s.mesh.visible = !on;
    if (this.bars) this.bars.visible = !on;
  }
}
