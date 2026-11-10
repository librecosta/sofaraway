import * as THREE from 'three';
import { TUNNEL } from './tunnel.js';

/* ------------------------------------------------------------------ *
 *  Hexagon signed distance — mirrors the GLSL version below exactly.
 * ------------------------------------------------------------------ */
export function sdHexagon(px, py, r) {
  const kx = -0.8660254, ky = 0.5, kz = 0.57735;
  let x = Math.abs(px), y = Math.abs(py);
  const dot = x * kx + y * ky;
  const m = Math.min(dot, 0.0) * 2.0;
  x -= m * kx; y -= m * ky;
  x -= Math.min(Math.max(x, -kz * r), kz * r);
  y -= r;
  return Math.hypot(x, y) * Math.sign(y);
}

const VERT = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;

uniform vec2  uSize;
uniform vec3  uHole;      // cx, cy, radius
uniform vec3  uColor;
uniform float uTime;
uniform float uFade;
uniform float uSeed;
uniform float uHit;

float sdHexagon(vec2 p, float r){
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main(){
  vec2 p = (vUv - 0.5) * uSize;
  vec2 q = p - uHole.xy;
  float r = uHole.z;

  float d = sdHexagon(q, r);
  float inside = smoothstep(-0.035, 0.035, d);   // 1 = solid curtain (outside the hole)

  // scanlines -------------------------------------------------------
  float scan  = 0.5 + 0.5 * sin(p.y * 22.0 - uTime * 14.0);
  float scanB = 0.5 + 0.5 * sin(p.y * 7.0 + uTime * 1.7 + uSeed * 6.28);
  float grain = hash(floor(p * 46.0) + floor(uTime * 24.0));

  // bright hex rim --------------------------------------------------
  float edge = exp(-abs(d) * (9.0 + 7.0 * scan));

  // outer frame -----------------------------------------------------
  vec2 ap = abs(p);
  float fx = smoothstep(0.6, 0.0, uSize.x * 0.5 - ap.x);
  float fy = smoothstep(0.6, 0.0, uSize.y * 0.5 - ap.y);
  float frame = clamp(fx + fy, 0.0, 1.0);

  // diagonal energy sweep -------------------------------------------
  float sweep = 0.5 + 0.5 * sin((p.x + p.y) * 1.7 - uTime * 6.0 + uSeed * 9.0);
  sweep = pow(sweep, 7.0);

  float a = 0.0;
  a += inside * (0.30 + 0.18 * scanB);
  a += inside * 0.80 * scan * (0.40 + 0.60 * edge);
  a += inside * 0.09 * grain;
  a += edge * 1.45;
  a += frame * 0.55;
  a += sweep * 0.10 * inside;
  a += uHit * 2.0;

  a *= uFade;

  vec3 col = uColor * (0.80 + 0.45 * scan);
  col = mix(col, vec3(1.0), clamp(edge * 0.75 + frame * 0.55 + uHit, 0.0, 1.0));

  gl_FragColor = vec4(col, a);
}
`;

const W = (TUNNEL.a + 0.7) * 2;
const H = (TUNNEL.b + 0.7) * 2;
const GEO = new THREE.PlaneGeometry(W, H);

/* ------------------------------------------------------------------ *
 *  One gate
 * ------------------------------------------------------------------ */
export class Gate {
  constructor(rng, time, difficulty) {
    this.seed = rng();
    this.r = THREE.MathUtils.lerp(1.02, 0.68, Math.min(1, difficulty));

    const limX = TUNNEL.a - this.r * 1.32;
    const limY = TUNNEL.b - this.r * 1.32;

    this.cx = (rng() * 2 - 1) * limX;
    this.cy = (rng() * 2 - 1) * limY;

    this.amplX = limX * 0.55 * rng();
    this.amplY = limY * 0.50 * rng();
    this.spdX = 0.45 + rng() * 0.85;
    this.spdY = 0.35 + rng() * 0.75;
    this.phX = rng() * 6.283;
    this.phY = rng() * 6.283;
    this.drift = difficulty > 0.18;

    this.hueShift = (rng() - 0.5) * 0.07;
    this.dBeats = 0;
    this.d = 0;
    this.spawnD = 1;
    this.spawnT = time;
    this.passed = false;
    this.hit = 0;

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSize: { value: new THREE.Vector2(W, H) },
        uHole: { value: new THREE.Vector3(this.cx, this.cy, this.r) },
        uColor: { value: new THREE.Color(0xffffff) },
        uTime: { value: 0 },
        uFade: { value: 0 },
        uSeed: { value: this.seed },
        uHit: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(GEO, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  holeAt(time) {
    if (!this.drift) return [this.cx, this.cy];
    const t = time - this.spawnT;
    const limX = TUNNEL.a - this.r * 1.32;
    const limY = TUNNEL.b - this.r * 1.32;
    const x = THREE.MathUtils.clamp(this.cx + Math.sin(t * this.spdX + this.phX) * this.amplX, -limX, limX);
    const y = THREE.MathUtils.clamp(this.cy + Math.sin(t * this.spdY + this.phY) * this.amplY, -limY, limY);
    return [x, y];
  }

  updateUniforms(time, hue) {
    const [hx, hy] = this.holeAt(time);
    const u = this.mat.uniforms;
    u.uHole.value.set(hx, hy, this.r);
    u.uTime.value = time;
    u.uColor.value.setHSL((hue + this.hueShift + 1) % 1, 0.85, 0.66);

    const near = THREE.MathUtils.smoothstep(this.d, 1.0, 8.0);
    const raw = this.spawnD > 2
      ? THREE.MathUtils.clamp((this.spawnD - this.d) / (this.spawnD * 0.22), 0, 1)
      : 1;
    const farIn = 0.38 + 0.62 * raw;
    u.uFade.value = near * farIn;
    u.uHit.value = this.hit;
  }

  dispose() {
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------ *
 *  Manager
 * ------------------------------------------------------------------ */
export class Gates {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.rngState = 987654321;
  }

  rng() {
    this.rngState = (this.rngState * 1103515245 + 12345) & 0x7fffffff;
    return this.rngState / 0x7fffffff;
  }

  clear() {
    for (const g of this.list) {
      this.scene.remove(g.mesh);
      g.dispose();
    }
    this.list.length = 0;
  }

  spawn(dBeats, speed, secPerBeat, time, difficulty) {
    const g = new Gate(() => this.rng(), time, difficulty);
    g.dBeats = dBeats;
    g.d = speed * dBeats * secPerBeat;
    g.spawnD = g.d;
    g.mesh.position.z = -g.d;
    this.scene.add(g.mesh);
    this.list.push(g);
    return g;
  }

  /** dBeat = beats elapsed this frame */
  update(dBeat, speed, secPerBeat, time, hue) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.dBeats -= dBeat;
      g.d = Math.max(-2, speed * g.dBeats * secPerBeat);
      g.mesh.position.z = -g.d;
      g.updateUniforms(time, hue);
      if (g.dBeats < -0.35) {
        this.scene.remove(g.mesh);
        g.dispose();
        this.list.splice(i, 1);
      }
    }
  }
}
