import * as THREE from 'three';
import { TUNNEL } from './tunnel.js';

/* ------------------------------------------------------------------ *
 *  A wall is a 3x3 assembly of bolted plates spanning the corridor.
 *  The centre plate never opens; exactly one of the eight ring cells is
 *  missing, and that gap is the only way through.
 *
 *  cell index = row * 3 + col        row 0 = bottom, col 0 = left
 *        6 7 8
 *        3 4 5     4 = centre (always solid)
 *        0 1 2
 * ------------------------------------------------------------------ */
export const WALL = {
  w: TUNNEL.a * 2 + 0.20,
  h: TUNNEL.b * 2 + 0.20,
};

const RING = [0, 1, 2, 3, 5, 6, 7, 8];

export function cellCentre(idx) {
  const col = idx % 3;
  const row = Math.floor(idx / 3);
  return [(col - 1) * (WALL.w / 3), (row - 1) * (WALL.h / 3)];
}

/** which cell a continuous world position falls into; -1 if outside the wall */
export function cellOf(x, y, grace = 1.0) {
  const hw = (WALL.w / 6) * grace;
  const hh = (WALL.h / 6) * grace;
  let col = Math.round(x / (WALL.w / 3) + 1);
  let row = Math.round(y / (WALL.h / 3) + 1);
  col = Math.min(2, Math.max(0, col));
  row = Math.min(2, Math.max(0, row));
  const idx = row * 3 + col;
  const [cx, cy] = cellCentre(idx);
  if (Math.abs(x - cx) > hw || Math.abs(y - cy) > hh) return -1;
  return idx;
}

/* ------------------------------------------------------------------ *
 *  Shader — one pass, three plate styles
 * ------------------------------------------------------------------ */
const VERT = /* glsl */`
varying vec2 vUv;
varying float vDepth;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
varying float vDepth;

uniform float uOpen;
uniform float uStyle;
uniform vec3  uColor;
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform float uHit;
uniform vec3  uHull;     // corridor half-width, half-height, chamfer
uniform vec2  uSize;
uniform vec2  uOpenUV;

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main(){
  // plates vanish at the lens so you never end up inside one
  if (vDepth < 5.0) discard;

  // clip to the corridor's octagonal section so the bulkhead fits the hull
  vec2 lp = (vUv - 0.5) * uSize;
  if (abs(lp.x) > uHull.x || abs(lp.y) > uHull.y) discard;
  if (abs(lp.x) + abs(lp.y) > uHull.x + uHull.y - uHull.z) discard;

  vec2 g = vUv * 3.0;
  vec2 c = floor(g);
  vec2 f = fract(g);
  int idx = int(c.y) * 3 + int(c.x);

  vec2 e2 = min(f, 1.0 - f);
  float edge = min(e2.x, e2.y);

  // distance to the wall's outer boundary, in cell units
  float bd = min(min(g.x, 3.0 - g.x), min(g.y, 3.0 - g.y));

  bool isOpen = abs(float(idx) - uOpen) < 0.5;
  vec3 alloy = uColor;

  /* ---------------- the opening ---------------- */
  if (isOpen) {
    if (edge > 0.070) discard;
    float rim = exp(-edge * 24.0);
    vec3 glow = mix(alloy * 2.6, vec3(1.0), rim * 0.6);
    float a = clamp(smoothstep(0.0, 0.012, edge) * 0.8 + rim * 1.5, 0.0, 1.0);
    gl_FragColor = vec4(glow * (0.45 + rim * 1.7), a);
    return;
  }

  /* ---------------- plate face ---------------- */
  float hatch = 0.5 + 0.5 * sin(f.y * 30.0 + hash(c) * 6.28);
  vec3 base = alloy * (0.34 + hatch * 0.08);
  base *= 0.70 + 0.55 * hash(c * 1.7);
  base *= mix(0.34, 1.50, pow(f.y, 0.85));

  if (uStyle > 0.5 && uStyle < 1.5) {
    // louvred vent stack
    float fin = step(0.55, fract(f.y * 15.0 + hash(c) * 0.4));
    base *= mix(1.0, 0.40, fin);
  } else if (uStyle > 1.5) {
    // hazard placard in one shoulder of the plate
    vec2 hp = f - vec2(0.76, 0.24);
    if (length(hp) < 0.17) {
      float stripe = step(0.5, fract((f.x + f.y) * 21.0));
      base = mix(vec3(0.04), vec3(0.62, 0.40, 0.02), stripe);
    }
  }


  // bevelled lip catching light at the seam
  float lip = exp(-edge * 55.0);
  base += alloy * lip * 0.60;

  // recessed border so the plate reads as bolted on
  float border = smoothstep(0.05, 0.0, edge);
  base *= 1.0 - border * 0.80;

  // corner bolts
  vec2 bq = abs(f - 0.5);
  float bolt = smoothstep(0.017, 0.0, length(bq - vec2(0.395)));
  base += alloy * bolt * 0.85;

  /* ---------------- seams + frame ---------------- */
  float seam = smoothstep(0.012, 0.0, edge);
  float frameLip = exp(-bd * 26.0);

  vec3 col = base;
  col += alloy * 1.9 * seam;
  col += alloy * frameLip * 0.85;

  // structural frame band around the whole bulkhead
  if (bd < 0.11) {
    vec3 band = alloy * (0.24 + 0.60 * exp(-bd * 22.0));
    band *= 0.80 + 0.35 * hash(c);
    col = band + alloy * 1.9 * seam;
  }

  // light spilling out of the gap onto the surrounding plates
  float spill = exp(-distance(vUv, uOpenUV) * 9.0);
  col += alloy * spill * 0.34;

  // slow scan travelling down the wall
  col += alloy * (0.5 + 0.5 * sin(vUv.y * 8.0 - uTime * 3.0)) * 0.02;

  col = mix(col, vec3(1.0, 0.55, 0.55), uHit * 0.9);

  /* ---------------- fog ---------------- */
  float fogF = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
  col *= 0.78 + 0.22 * smoothstep(5.0, 26.0, vDepth);

  gl_FragColor = vec4(col, 1.0);
}
`;

const GEO = new THREE.PlaneGeometry(WALL.w, WALL.h);

/* ------------------------------------------------------------------ *
 *  One wall
 * ------------------------------------------------------------------ */
export class Gate {
  constructor(rng, time) {
    this.open = RING[Math.floor(rng() * RING.length) % RING.length];
    this.style = Math.floor(rng() * 3);
    this.openUV = new THREE.Vector2(((this.open % 3) + 0.5) / 3, (Math.floor(this.open / 3) + 0.5) / 3);
    this.dBeats = 0;
    this.d = 0;
    this.spawnT = time;
    this.passed = false;
    this.hit = 0;

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uOpen: { value: this.open },
        uStyle: { value: this.style },
        uColor: { value: new THREE.Color(0xffffff) },
        uFogColor: { value: new THREE.Color(0x000000) },
        uFogDensity: { value: 0.0118 },
        uTime: { value: 0 },
        uHit: { value: 0 },
        uHull: { value: new THREE.Vector3(TUNNEL.a, TUNNEL.b, TUNNEL.ch) },
        uSize: { value: new THREE.Vector2(WALL.w, WALL.h) },
        uOpenUV: { value: new THREE.Vector2() },
      },
      transparent: true,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(GEO, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  centre() {
    return cellCentre(this.open);
  }

  update(time, hue) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uHit.value = this.hit * 0.8;
    u.uOpenUV.value.copy(this.openUV);
    u.uColor.value.setHSL((hue + 1) % 1, 0.42, 0.56);
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

  spawn(dBeats, speed, secPerBeat, time) {
    const g = new Gate(() => this.rng(), time);
    g.dBeats = dBeats;
    g.d = speed * dBeats * secPerBeat;
    g.mesh.position.z = -g.d;
    this.scene.add(g.mesh);
    this.list.push(g);
    return g;
  }

  update(dBeat, speed, secPerBeat, time, hue) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.dBeats -= dBeat;
      g.d = Math.max(-2, speed * g.dBeats * secPerBeat);
      g.mesh.position.z = -g.d;
      g.update(time, hue);
      if (g.dBeats < -0.35) {
        this.scene.remove(g.mesh);
        g.dispose();
        this.list.splice(i, 1);
      }
    }
  }
}
