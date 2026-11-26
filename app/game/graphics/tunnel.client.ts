import * as THREE from 'three';
import { SECTION } from '../core/collision';
import type { RouteSide } from '../core/branches';
import { frameLightLevel, octagon } from '../core/lighting-atlas';
import type { LightingZone } from '../core/lighting-atlas';
import type { LightingState, LightTone } from '../core/lighting-score';
import { steadyLights } from '../core/rhythmic-lights';
import type { DynamicLightEnvelope } from '../core/rhythmic-lights';
import type { Topology } from '../core/volumes';
import type { BranchPath } from './branch-path';
import { START_DISTANCE } from '../core/reference-track';
import { CABIN_HOOP, CABIN_WAIST, cabinEnvelope, cabinLower, cabinUpper } from './cabin-geometry';
import type { DescentFacility } from './descent-facility.client';
import type { OutroPlan } from '../core/encore';
import type { Path, PathFrame } from './path';
import type { buildTextures } from './textures.client';
import { MaterialLibrary } from './materials/library.client';
import { surfacePresets } from './materials/presets';
import { buildTunnelPanels } from './tunnel-panels';

interface GeometryData { pos: number[]; nor?: number[]; uv?: number[]; rgb?: number[]; idx: number[] }
interface Chunk { s0: number; s1: number; meshes: THREE.Mesh[] }

/* ------------------------------------------------------------------ *
 *  The corridor, built along a Path.
 *
 *  Geometry is generated in chunks as the camera advances and dropped
 *  behind it. Chunks are built a few hundred units ahead, so the next
 *  stretch — and the turn into it — is always already there.
 * ------------------------------------------------------------------ */
const RING = 3;
const CHUNK = 210;
const KEEP_BEHIND = 90;
const KEEP_AHEAD = 430;
const SCENIC_POINT_INTENSITIES = [16, 21, 25] as const;
const junctionGround = new THREE.Color(0x46677a);
const junctionSky = new THREE.Color(0xafcbd8);
const CANAL_LIP = CABIN_WAIST;
const CANOPY_HOOP = CABIN_HOOP;
const canopy = cabinUpper;

// The canal's solid lower shell joins the separately batched glass canopy.
function profile(topology: Topology) {
  if (topology === 'canal') {
    return {
      closed: false,
      pts: cabinLower,
    };
  }
  return {
    closed: true,
    pts: octagon,
  };
}

function canopyMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false,
    userData: { skipFocusDepth: true },
    uniforms: { daylight: { value: 0 }, skyTint: { value: new THREE.Color() }, sunTint: { value: new THREE.Color() },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: /* glsl */`
      uniform vec3 sunDirection;
      varying vec3 vNormal;
      varying vec3 vEye;
      varying vec3 vSun;
      varying vec2 vPanel;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalMatrix * normal;
        vEye = -mv.xyz;
        vSun = mat3(viewMatrix) * sunDirection;
        vPanel = uv;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float daylight;
      uniform vec3 skyTint;
      uniform vec3 sunTint;
      varying vec3 vNormal;
      varying vec3 vEye;
      varying vec3 vSun;
      varying vec2 vPanel;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 eye = normalize(vEye);
        float grazing = pow(1.0 - abs(dot(normal, eye)), 3.0);
        float edge = min(vPanel.x, 1.0 - vPanel.x);
        float inset = max(0.018, fwidth(vPanel.x));
        float gasket = (1.0 - smoothstep(0.0, inset, edge)) * min(1.0, 0.018 / inset);
        float stationPhase = abs(fract(vPanel.y + 0.5) - 0.5);
        float hoopWidth = max(0.008, fwidth(vPanel.y));
        float hoop = (1.0 - smoothstep(0.0, hoopWidth, stationPhase)) * min(1.0, 0.008 / hoopWidth);
        vec3 glass = mix(vec3(0.14, 0.22, 0.30), vec3(0.24, 0.36, 0.45), grazing);
        float trim = max(gasket, hoop);
        vec3 baseline = mix(glass, mix(vec3(0.18, 0.36, 0.48), skyTint, .44), trim);
        float incidence = abs(dot(normal, vSun));
        float reflection = smoothstep(.70, .995, dot(reflect(-eye, normal), vSun));
        float sheen = .28 * trim * incidence + reflection * (.28 * grazing + .12 * trim);
        baseline = mix(baseline, sunTint, sheen);
        gl_FragColor = vec4(mix(baseline, vec3(0.92, 0.79, 0.62), daylight * (0.28 + 0.45 * grazing)),
          0.015 + 0.09 * grazing + 0.60 * trim);
      }
    `,
  });
}

function frame(): PathFrame {
  return {
    p: new THREE.Vector3(), f: new THREE.Vector3(),
    r: new THREE.Vector3(), u: new THREE.Vector3(),
  };
}

export class Tunnel {
  private outroAtlas: readonly LightingZone[] = [];
  readonly group: THREE.Group;
  chunks: Chunk[];
  private wire: THREE.LineSegments | null = null;
  private shellMat!: THREE.MeshStandardMaterial;
  private ribMat!: THREE.MeshStandardMaterial;
  private braceMat!: THREE.MeshStandardMaterial;
  private readonly canopyMat?: THREE.ShaderMaterial;
  private shellMaterials?: THREE.MeshStandardMaterial[];
  readonly surfaces?: MaterialLibrary;
  private rimMat!: THREE.MeshBasicMaterial;
  private stripMat!: THREE.MeshBasicMaterial;
  private wireMat!: THREE.LineBasicMaterial;
  private hemi!: THREE.HemisphereLight;
  private ambient!: THREE.AmbientLight;
  private lights: THREE.PointLight[] = [];
  private hue: number | undefined;
  private readonly lightFrame = frame();
  private readonly ringFrames: PathFrame[] = [];
  private readonly mainLight = new THREE.Color();
  private junction?: { start: number; end: number };
  private readonly distant = new Map<number, Chunk>();
  private readonly initialLength: number;
  private farThrough = Math.floor(START_DISTANCE / CHUNK) * CHUNK - CHUNK;

  constructor(tex: ReturnType<typeof buildTextures> | MaterialLibrary | undefined, private readonly path: Path,
    private readonly topology: Topology, private readonly atlas: readonly LightingZone[] = [], private readonly continuous = false,
    private readonly facility?: DescentFacility) {
    this.group = new THREE.Group();
    this.chunks = [];
    this.wire = null;
    this.initialLength = path.length;

    this.surfaces = tex instanceof MaterialLibrary ? tex : undefined;
    if (topology === 'canal') this.canopyMat = canopyMaterial();
    this._buildLights();
    if (tex) {
      this._buildMaterials(tex);
      this._buildWire();
    }
  }

  /* ---------------- shared materials ---------------- */
  _buildMaterials(tex: ReturnType<typeof buildTextures> | MaterialLibrary) {
    if (tex instanceof MaterialLibrary) {
      this.shellMat = tex.get('alloy-satin-dark');
      this.shellMaterials = [this.shellMat, tex.get('panel-recessed'), tex.get('floor-grip')];
      this.ribMat = tex.get('panel-reinforced');
      this.braceMat = tex.get('alloy-brushed-tech');
    } else {
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
      this.ribMat = new THREE.MeshStandardMaterial({
        color: 0x151a20, metalness: 0.8, roughness: 0.38,
        side: THREE.DoubleSide, envMapIntensity: 1.4,
      });
      this.braceMat = this.ribMat;
    }

    this.rimMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, toneMapped: false, vertexColors: this.atlas.length > 0,
    });

    this.stripMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, toneMapped: false, vertexColors: this.atlas.length > 0,
    });

    this.wireMat = new THREE.LineBasicMaterial({
      color: 0x0a0d10, transparent: true, opacity: 1, fog: true, depthWrite: false,
    });
  }

  /* ---------------- light rig that rides with the camera ---------------- */
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(this.facility ? 0xc0d2dc : 0x88bbdd,
      this.facility ? 0x60656d : this.surfaces ? 0x25323b : 0x08090b, this.facility ? 1.06 : 0.55);
    this.group.add(this.hemi);
    this.ambient = new THREE.AmbientLight(this.facility ? 0xbfc3c9 : 0x223344, this.facility ? .46 : this.surfaces ? 0.66 : 0.45);
    this.group.add(this.ambient);

    this.lights = [];
    const stations = this.facility ? [] : this.surfaces ? [7, 20, 44] : [14, 52, 104, 170];
    for (const [i, d] of stations.entries()) {
      const l = new THREE.PointLight(0x44ffcc, this.surfaces ? SCENIC_POINT_INTENSITIES[i] : 30, 100, 2);
      l.userData.d = d;
      this.group.add(l);
      this.lights.push(l);
    }
  }

  moveLights(s: number, branch?: BranchPath, side?: RouteSide) {
    const fr = this.lightFrame;
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      if (branch && side) branch.sample(s + l.userData.d, side, fr);
      else this.path.sample(s + l.userData.d, fr);
      l.position.copy(fr.p);
      if (this.surfaces) l.position.addScaledVector(fr.u, .52).addScaledVector(fr.r, i % 2 ? -.46 : .46);
    }
  }

  /* ---------------- one chunk ---------------- */
  _buildChunk(s0: number, s1: number): Chunk {
    if (this.facility) {
      const meshes = this.facility.build(s0, s1);
      this.group.add(...meshes);
      return { s0, s1, meshes };
    }
    const PR = profile(this.topology);
    const P = PR.pts;
    const n = P.length;
    const edges = PR.closed ? n : n - 1;

    const perim = [0];
    for (let i = 0; i < edges; i++) {
      const a = P[i], b = P[(i + 1) % n];
      perim.push(perim[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const totalPerim = perim[edges];

    const rings: number[] = [];
    const m0 = this.surfaces !== undefined;
    if (m0) {
      rings.push(s0);
      for (let s = (Math.floor(s0 / RING) + 1) * RING; s < s1 - 1e-6; s += RING) rings.push(s);
    } else for (let s = s0; s < s1; s += RING) rings.push(s);
    rings.push(s1);
    if (m0) {
      for (const s of this.path.boundaries(s0, s1)) {
        if (Math.abs(s - Math.round(s / RING) * RING) > 1e-7) rings.push(s);
      }
      rings.sort((a, b) => a - b);
    }
    const ringFrames = this.ringFrames;
    const ringLight = this.atlas.length ? rings.map(station => frameLightLevel(
      station >= (this.outroAtlas[0]?.start ?? Infinity) ? this.outroAtlas : this.atlas, station)) : undefined;
    for (let i = 0; i < rings.length; i++) this.path.sample(rings[i], ringFrames[i] ??= frame());

    const shell = { pos: [] as number[], nor: [] as number[], uv: [] as number[], idx: [] as number[] };
    const rib = { pos: [] as number[], nor: [] as number[], idx: [] as number[], uv: m0 ? [] as number[] : undefined };
    const rim = { pos: [] as number[], nor: [] as number[], idx: [] as number[], rgb: ringLight ? [] as number[] : undefined };
    const strip = { pos: [] as number[], idx: [] as number[], rgb: ringLight ? [] as number[] : undefined };
    const brace = { pos: [] as number[], nor: [] as number[], idx: [] as number[], uv: m0 ? [] as number[] : undefined };
    const glass = { pos: [] as number[], nor: [] as number[], uv: [] as number[], idx: [] as number[] };

    const C = frame();
    const D = frame();
    const v3 = new THREE.Vector3();
    const nWall = new THREE.Vector3();

    const put = (arr: GeometryData, fr: PathFrame, px: number, py: number) => {
      v3.copy(fr.p).addScaledVector(fr.r, px).addScaledVector(fr.u, py);
      arr.pos.push(v3.x, v3.y, v3.z);
    };
    const shellHeight = (y: number, scale: number) => this.canopyMat && y === CANAL_LIP ? y : y * scale;

    if (this.canopyMat) {
      for (let k = 0; k < rings.length - 1; k++) {
        const first = ringFrames[k], last = ringFrames[k + 1];
        for (let i = 0; i < canopy.length - 1; i++) {
          const p = canopy[i], q = canopy[i + 1];
          const dx = q[0] - p[0], dy = q[1] - p[1], length = Math.hypot(dx, dy);
          const base = glass.pos.length / 3;
          for (const fr of [first, last]) {
            put(glass, fr, p[0], p[1]);
            put(glass, fr, q[0], q[1]);
            nWall.copy(fr.r).multiplyScalar(dy / length).addScaledVector(fr.u, -dx / length);
            glass.nor.push(...nWall, ...nWall);
          }
          const v0 = rings[k] / CANOPY_HOOP, v1 = rings[k + 1] / CANOPY_HOOP;
          glass.uv.push(0, v0, 1, v0, 0, v1, 1, v1);
          glass.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }

        // The waist cap bridges the recess of the original solid shell.
        for (const sign of [-1, 1]) {
          const base = rib.pos.length / 3;
          for (const [index, fr] of [first, last].entries()) {
            put(rib, fr, sign * SECTION.a * .965, CANAL_LIP);
            put(rib, fr, sign * SECTION.a * 1.004, CANAL_LIP);
            rib.nor.push(...fr.u, ...fr.u);
            rib.uv?.push(0, rings[k + index], .14, rings[k + index]);
          }
          rib.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }
      }
    }

    /* ---- shell: quad strips between consecutive rings ---- */
    if (!m0) for (let k = 0; k < rings.length - 1; k++) {
      const sA = rings[k], sB = rings[k + 1];
      const A = ringFrames[k], B = ringFrames[k + 1];
      // absolute V, so the plating is continuous across chunk seams
      // one texture repeat per bay, so the plating lines up with the recesses
      const vA = sA / RING;
      const vB = sB / RING;

      /* Each bay is a recessed plate with a chamfer at both ends. The chamfers
         matter more than the plate: their normals differ from the wall's, so
         they take the rim light differently and the seam reads even though the
         only light in here is the corridor's own edge glow. */
      const CH = Math.min(0.34, (sB - sA) * 0.22);   // chamfer length in units
      const DEPTH = 0.030;                            // how far the plate sits in
      this.path.sample(sA + CH, C);
      this.path.sample(sB - CH, D);

      for (let i = 0; i < edges; i++) {
        const p0 = P[i], p1 = P[(i + 1) % n];
        const ex = p1[0] - p0[0], ey = p1[1] - p0[1];
        const el = Math.hypot(ex, ey) || 1;
        const nx2 = -ey / el, ny2 = ex / el;

        const u0 = perim[i] / totalPerim, u1 = perim[Math.min(i + 1, edges)] / totalPerim;

        const lp = (t: number) => this.canopyMat && t === 1 ? p1 :
          [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];

        const quad = (fa: PathFrame, ka: number, fb: PathFrame, kb: number, t0: number, t1: number, ua: number, ub: number, va: number, vb: number, nf: THREE.Vector3) => {
          const q0 = lp(t0), q1 = lp(t1);
          const base = shell.pos.length / 3;
          put(shell, fa, q0[0] * ka, shellHeight(q0[1], ka));
          put(shell, fa, q1[0] * ka, shellHeight(q1[1], ka));
          put(shell, fb, q1[0] * kb, shellHeight(q1[1], kb));
          put(shell, fb, q0[0] * kb, shellHeight(q0[1], kb));
          for (let q = 0; q < 4; q++) shell.nor.push(nf.x, nf.y, nf.z);
          shell.uv.push(ua, va, ub, va, ub, vb, ua, vb);
          shell.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        };

        nWall.copy(A.r).multiplyScalar(nx2).addScaledVector(A.u, ny2);
        const inner = 1 - DEPTH;
        const SEAM = 0.012;                 // half-width of the rib between plates
        const um = (u0 + u1) * 0.5;

        // lower chamfer, full width
        quad(A, 1.0, C, inner, 0, 1, u0, u1, vA, vA + CH * 0.02, nWall);
        // plate, split in two by a raised rib down the middle
        quad(C, inner, D, inner, 0, 0.5 - SEAM, u0, um, vA, vB, nWall);
        quad(C, 1.0, D, 1.0, 0.5 - SEAM, 0.5 + SEAM, um - 0.003, um + 0.003, vA, vB, nWall);
        quad(C, inner, D, inner, 0.5 + SEAM, 1, um, u1, vA, vB, nWall);
        // upper chamfer, full width
        quad(D, inner, B, 1.0, 0, 1, u0, u1, vB, vB, nWall);
      }
    }

    /* ---- ribs + glowing rim, a flange at every ring ---- */
    const R = 1.055, IN = 0.955, RIMW = 0.948;
    for (let k = 0; k < rings.length; k++) {
      // One owner per grid ring, including when two streamed chunks meet.
      if (m0 && (k === rings.length - 1 || rings[k] % RING !== 0)) continue;
      const A = ringFrames[k];
      const addRing = (target: { pos: number[]; nor: number[]; idx: number[]; uv?: number[] },
        p0: readonly number[], p1: readonly number[], a: number, b: number) => {
        const base = target.pos.length / 3;
        for (const [px, py] of [
          [p0[0] * a, p0[1] * a], [p1[0] * a, p1[1] * a],
          [p1[0] * b, p1[1] * b], [p0[0] * b, p0[1] * b],
        ]) {
          v3.copy(A.p).addScaledVector(A.r, px).addScaledVector(A.u, py);
          target.pos.push(v3.x, v3.y, v3.z);
          target.nor.push(A.f.x, A.f.y, A.f.z);
          if (target.uv) {
            const [u, v] = surfacePresets['panel-reinforced'].tile;
            target.uv.push(px / u, py / v);
          }
        }
        target.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };
      for (let i = 0; i < edges; i++) {
        const p0 = P[i], p1 = P[(i + 1) % n];
        addRing(rib, p0, p1, IN, R);
        addRing(rim, p0, p1, RIMW, IN);
        if (rim.rgb) {
          const gain = ringLight![k];
          for (let j = 0; j < 4; j++) rim.rgb.push(gain, gain, gain);
        }
      }
      if (this.canopyMat && s0 <= rings[k] && rings[k] < s1 && rings[k] % CANOPY_HOOP === 0) {
        for (let i = 0; i < canopy.length - 1; i++) addRing(rib, canopy[i], canopy[i + 1], .976, 1.018);
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
        const A = ringFrames[k], B = ringFrames[k + 1];
        const base = strip.pos.length / 3;
        for (const fr of [A, B]) {
          for (const sgn of [-1, 1]) {
            put(strip, fr, (p[0] + tx * SW * sgn) * INSET, (p[1] + ty * SW * sgn) * INSET);
          }
        }
        if (strip.rgb) {
          const a = ringLight![k], b = ringLight![k + 1];
          strip.rgb.push(a, a, a, a, a, a, b, b, b, b, b, b);
        }
        strip.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }

    /* ---- corner gussets: a triangular bracket welded into every vertex ---- */
    {
      const W = 0.13;    // how far in from the corner
      const H = 0.085;   // half-width across the corner
      for (let k = 0; k < rings.length - 1; k++) {
        const A = ringFrames[k], B = ringFrames[k + 1];
        for (let i = 0; i < edges; i++) {
          const pt = P[i];
          const L = Math.hypot(pt[0], pt[1]) || 1;
          const inx = -pt[0] / L, iny = -pt[1] / L;
          const tx = -iny, ty = inx;
          const A0 = [pt[0] * 0.995, pt[1] * 0.995];
          const B0 = [A0[0] + inx * W - tx * H, A0[1] + iny * W - ty * H];
          const C0 = [A0[0] + inx * W + tx * H, A0[1] + iny * W + ty * H];

          const face = (fr0: PathFrame, fr1: PathFrame, q0: number[], q1: number[]) => {
            const base = brace.pos.length / 3;
            put(brace, fr0, q0[0], q0[1]);
            put(brace, fr0, q1[0], q1[1]);
            put(brace, fr1, q1[0], q1[1]);
            put(brace, fr1, q0[0], q0[1]);
            // flat normal from the quad
            const ax = brace.pos[base * 3],         ay = brace.pos[base * 3 + 1], az = brace.pos[base * 3 + 2];
            const bx = brace.pos[base * 3 + 3],     by = brace.pos[base * 3 + 4], bz = brace.pos[base * 3 + 5];
            const cx2 = brace.pos[base * 3 + 6],    cy2 = brace.pos[base * 3 + 7], cz = brace.pos[base * 3 + 8];
            const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
            const e2x = cx2 - ax, e2y = cy2 - ay, e2z = cz - az;
            let nx = e1y * e2z - e1z * e2y;
            let ny = e1z * e2x - e1x * e2z;
            let nz = e1x * e2y - e1y * e2x;
            const nl = Math.hypot(nx, ny, nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;
            for (let q = 0; q < 4; q++) brace.nor.push(nx, ny, nz);
            if (brace.uv) {
              const [u, v] = surfacePresets['alloy-brushed-tech'].tile;
              const across = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) / u;
              const start = rings[k] / v, end = rings[k + 1] / v;
              brace.uv.push(0, start, across, start, across, end, 0, end);
            }
            brace.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          };

          face(A, B, A0, B0);
          face(A, B, C0, A0);
        }
      }
    }

    /* ---- build meshes ---- */
    const geoOf = (d: GeometryData) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      if (d.nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
      if (d.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
      if (d.rgb) g.setAttribute('color', new THREE.Float32BufferAttribute(d.rgb, 3));
      if (d.idx) g.setIndex(d.idx);
      return g;
    };

    const meshes: THREE.Mesh[] = [];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], name: string) => {
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      meshes.push(m);
      this.group.add(m);
      return m;
    };

    if (this.canopyMat) add(geoOf(glass), this.canopyMat, 'canal-skyglass').renderOrder = 4;
    if (brace.pos.length) add(geoOf(brace), this.braceMat, 'tunnel-braces');
    if (this.shellMaterials) add(buildTunnelPanels(this.path, rings, ringFrames), this.shellMaterials, 'tunnel-shell');
    else if (shell.pos.length) add(geoOf(shell), this.shellMat, 'tunnel-shell');
    add(geoOf(rib), this.ribMat, 'tunnel-ribs');
    add(geoOf(rim), this.rimMat, 'tunnel-rims');

    const sg = geoOf(strip);
    sg.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(strip.pos.length), 3));
    add(sg, this.stripMat, 'tunnel-strips');

    return { s0, s1, meshes };
  }

  /* ---------------- streaming ---------------- */
  _disposeChunk(chunk: Chunk) {
    for (const mesh of chunk.meshes) {
      this.group.remove(mesh);
      if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      mesh.geometry.dispose();
    }
  }

  get junctionShell() { return this.shellMat; }
  get junctionCanopy() { return this.canopyMat; }

  setSunDirection(sun: THREE.Vector3) {
    if (!this.canopyMat) return;
    this.canopyMat.uniforms.sunDirection.value.copy(sun);
    this.hemi.position.set(.78 * sun.x, 1, .78 * sun.z);
  }

  setDaylight(brightness: number, sky: THREE.Color, sun: THREE.Color, amount: number, junctionFill: number) {
    if (!this.canopyMat) return;
    this.canopyMat.uniforms.daylight.value = amount;
    this.canopyMat.uniforms.skyTint.value.copy(sky);
    this.canopyMat.uniforms.sunTint.value.copy(sun);
    this.ambient.color.setRGB(.34, .40, .48);
    this.ambient.intensity = .76 * brightness + amount * .28 + junctionFill * .25;
    this.hemi.color.copy(sky).lerp(sun, .36);
    this.hemi.intensity = 1.02 * brightness + amount * .34 + junctionFill * .30;
    this.hemi.groundColor.setRGB(.23, .29, .38).lerp(junctionGround, junctionFill * .65);
  }

  get continuity() {
    let farBytes = 0;
    for (const chunk of this.distant.values()) for (const { geometry } of chunk.meshes) {
      for (const attribute of Object.values(geometry.attributes)) farBytes += attribute.array.byteLength;
      farBytes += geometry.index?.array.byteLength ?? 0;
    }
    return { near: this.chunks.map(({ s0, s1 }) => [s0, s1]), far: this.distant.size, farThrough: this.farThrough, farBytes };
  }

  get surfaceMaterials() { return this.shellMaterials && [...this.shellMaterials, this.ribMat, this.braceMat]; }

  setAfterglow(atlas: readonly LightingZone[]) {
    const from = Math.min(this.outroAtlas[0]?.start ?? Infinity, atlas[0]?.start ?? Infinity);
    this.outroAtlas = atlas;
    this.rebuildFrom(from);
  }

  setFacilityOutro(plan: OutroPlan | undefined) {
    if (this.facility) this.rebuildFrom(this.facility.setOutro(plan));
  }

  private rebuildFrom(from: number) {
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      if (chunk.s1 <= from) continue;
      this._disposeChunk(chunk);
      this.chunks[i] = this.streamChunk(chunk.s0, chunk.s1);
    }
  }

  setJunction(junction?: { start: number; end: number }, behindCamera = false) {
    if (this.junction === junction) return;
    // Preserve the streaming intervals even where the junction owns the shell.
    const old = this.junction;
    this.junction = junction;
    for (const [station, chunk] of this.distant) {
      if (![old, junction].some(cut => cut && chunk.s0 < cut.end && chunk.s1 > cut.start)) continue;
      this._disposeChunk(chunk);
      this.distant.set(station, this.buildDistant(chunk.s0, chunk.s1));
    }
    if (behindCamera) return;
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      if (![old, junction].some(cut => cut && chunk.s0 < cut.end && chunk.s1 > cut.start)) continue;
      this._disposeChunk(chunk);
      this.chunks[i] = this.streamChunk(chunk.s0, chunk.s1);
    }
  }

  private streamChunk(s0: number, s1: number): Chunk {
    const gap = this.junction;
    if (!gap || s1 <= gap.start || s0 >= gap.end) return this._buildChunk(s0, s1);
    const meshes: THREE.Mesh[] = [];
    if (s0 < gap.start) meshes.push(...this._buildChunk(s0, gap.start).meshes);
    if (s1 > gap.end) meshes.push(...this._buildChunk(gap.end, s1).meshes);
    return { s0, s1, meshes };
  }

  private buildDistant(s0: number, s1: number): Chunk {
    const gap = this.junction;
    const ranges = !gap || s1 <= gap.start || s0 >= gap.end ? [[s0, s1]] :
      [[s0, Math.min(s1, gap.start)], [Math.max(s0, gap.end), s1]].filter(([from, to]) => to > from);
    const spans = ranges.map(([from, to]) => ({ from, to, sample: (s: number, fr: PathFrame) => this.path.sample(s, fr) }));
    const meshes = spans.length ? [false, true].map(upper => {
      const mesh = new THREE.Mesh(cabinEnvelope(spans, CANOPY_HOOP, upper), upper ? this.canopyMat : this.shellMat);
      mesh.name = upper ? 'far-skyglass' : 'far-cabin';
      mesh.renderOrder = upper ? 3 : 0;
      this.group.add(mesh);
      return mesh;
    }) : [];
    return { s0, s1, meshes };
  }

  dispose() {
    for (const chunk of this.chunks) this._disposeChunk(chunk);
    this.chunks.length = 0;
    for (const chunk of this.distant.values()) this._disposeChunk(chunk);
    this.distant.clear();
    this.group.clear();
    this.facility?.dispose();
    this.wire?.geometry.dispose();
    for (const material of [this.rimMat, this.stripMat, this.wireMat, this.canopyMat, ...(!this.surfaces ? [this.shellMat, this.ribMat] : [])]) {
      material?.dispose();
    }
  }

  update(s: number, menu = false, branch?: BranchPath, side?: RouteSide) {
    const need0 = s - KEEP_BEHIND;
    const need1 = s + KEEP_AHEAD;
    if (menu) this.path.extendMenu(need1 + CHUNK, need0 - CHUNK);
    this.moveLights(s, branch, side);

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      if (c.s1 < need0 || c.s0 > need1) {
        this._disposeChunk(c);
        this.chunks.splice(i, 1);
      }
    }

    let lo = Infinity, hi = -Infinity;
    for (const c of this.chunks) { lo = Math.min(lo, c.s0); hi = Math.max(hi, c.s1); }
    if (!this.chunks.length) { lo = hi = this.surfaces || this.continuous || this.facility ? Math.floor(s / CHUNK) * CHUNK : s; }

    // build forward
    let guard = 0;
    while (hi < need1 && hi < this.path.length - 1 && guard++ < 8) {
      const a = Math.max(0, hi);
      const b = Math.min(this.path.length, a + CHUNK);
      if (b - a < 1) break;
      this.chunks.push(this.streamChunk(a, b));
      hi = b;
    }

    // build backward — the camera can now recede, so the corridor has to grow
    // behind it as well as ahead
    guard = 0;
    while (lo > need0 && lo > 0 && guard++ < 8) {
      const b = Math.min(this.path.length, lo);
      const a = Math.max(0, b - CHUNK);
      if (b - a < 1) break;
      this.chunks.push(this.streamChunk(a, b));
      lo = a;
    }
    if (this.continuous) {
      while (this.farThrough < this.path.length - 1e-7) {
        const start = this.farThrough;
        this.farThrough = Math.min(this.path.length, start + CHUNK);
        this.distant.set(start, this.buildDistant(start, this.farThrough));
      }
      for (const [station, chunk] of this.distant) {
        if (station >= this.initialLength && chunk.s1 < need0 - KEEP_AHEAD && menu) {
          this._disposeChunk(chunk);
          this.distant.delete(station);
        } else {
          const covered = this.chunks.some(near => near.s0 <= chunk.s0 && near.s1 >= chunk.s1);
          for (const mesh of chunk.meshes) mesh.visible = !covered;
        }
      }
    }
  }

  /* ---------------- colour ---------------- */
  setHue(h: number) {
    this.hue = h;
    const c = new THREE.Color().setHSL(h, 1.0, 0.5);
    this.stripMat.color.copy(c);
    this.rimMat.color.copy(c).multiplyScalar(0.55);
    for (const l of this.lights) l.color.copy(c);
    if (!this.canopyMat) {
      this.ambient.color.setHSL(h, this.surfaces ? 0.53 : 0.9, this.surfaces ? 0.27 : 0.22);
      this.hemi.color.setHSL(h, 0.75, 0.40);
    }

    if (!this.surfaces) {
      this.shellMat.color.setHSL(h, 0.42, 0.32);
      this.shellMat.emissive.setHSL(h, 0.8, 0.03);
      this.ribMat.color.setHSL(h, 0.45, 0.10);
      this.ribMat.emissive.setHSL(h, 0.9, 0.02);
    }
  }

  pulse(p: number, dynamics: Readonly<DynamicLightEnvelope> = steadyLights) {
    const c = new THREE.Color().setHSL(this.hue === undefined ? 0.45 : this.hue, 1.0, 0.5);
    this.stripMat.color.copy(c).multiplyScalar((1 + p * 1.3) * dynamics.fixtureGain);
    this.rimMat.color.copy(c).multiplyScalar((0.55 + p * 1.0) * dynamics.rimGain);
    if (!this.canopyMat) this.hemi.intensity = .55;
    for (const light of this.lights) light.intensity = 30 * dynamics.physicalGain;
  }

  tintJunctionLights(amount: number, tone?: LightTone) {
    this.ambient.color.lerp(junctionSky, .34 * amount);
    this.hemi.color.lerp(junctionSky, .46 * amount);
    if (!tone) return;
    const tint = this.mainLight.setHSL(tone.hue, tone.saturation, .63);
    for (const light of this.lights) light.color.lerp(tint, .25 * amount);
  }

  setScenic(base: THREE.Color, sky: THREE.Color, ground: THREE.Color, state: LightingState,
    dynamics: Readonly<DynamicLightEnvelope> = steadyLights) {
    const spill = 1 + (dynamics.physicalGain - 1) * .45;
    this.ambient.color.copy(base); this.ambient.intensity = .70 * spill;
    this.hemi.color.copy(sky); this.hemi.groundColor.copy(ground); this.hemi.intensity = .64 * spill;
    for (const [i, light] of this.lights.entries()) {
      light.color.copy(i === 1 ? sky : base);
      light.intensity = SCENIC_POINT_INTENSITIES[i] * dynamics.physicalGain;
    }
    this.mainLight.setHSL(state.hue, state.saturation, .5);
    this.rimMat.color.copy(this.mainLight).multiplyScalar(state.rim * dynamics.rimGain);
    this.stripMat.color.copy(this.mainLight).multiplyScalar(state.strip * dynamics.fixtureGain);
  }

  get physicalLights() { return this.lights.length + 2; }
  get pointLights() { return this.lights.length; }
  get activePhysicalLights() { return this.lights.filter(light => light.intensity > 0).length + 2; }
  get scenicTone() { return { rim: this.rimMat.color.toArray(), strip: this.stripMat.color.toArray() }; }

  /* ---------------- menu wireframe ---------------- */
  _buildWire() {
    const PR = profile(this.topology);
    const P = PR.pts;
    const n = P.length;
    const edges = PR.closed ? n : n - 1;
    const pos: number[] = [];
    const seg = (a: THREE.Vector3, b: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
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

  setWireframe(on: boolean) {
    for (const c of this.chunks) for (const m of c.meshes) m.visible = !on;
    if (this.wire) this.wire.visible = on;
  }
}
