import * as THREE from 'three';
import { TUNNEL } from './tunnel.js';

/* ------------------------------------------------------------------ *
 *  A wall is a 3x3 assembly of bolted plates spanning the corridor.
 *  The centre cell is always solid; exactly one of the eight ring cells
 *  is missing, and that gap is the only way through.
 *
 *  cell index = row * 3 + col        row 0 = bottom, col 0 = left
 *        6 7 8
 *        3 4 5     4 = centre (always solid)
 *        0 1 2
 * ------------------------------------------------------------------ */
export const WALL = {
  w: (TUNNEL.a + 0.45) * 2,
  h: (TUNNEL.b + 0.45) * 2,
};

const CENTRE = 4;
const RING = [0, 1, 2, 3, 5, 6, 7, 8];

export function cellCentre(idx) {
  const col = idx % 3;
  const row = Math.floor(idx / 3);
  const x = (col - 1) * (WALL.w / 3);
  const y = (row - 1) * (WALL.h / 3);
  return [x, y];
}

export function cellOf(x, y, grace = 1.0) {
  const hw = (WALL.w / 6) * grace;
  const hh = (WALL.h / 6) * grace;
  let col = Math.round(x / (WALL.w / 3) + 1);
  let row = Math.round(y / (WALL.h / 3) + 1);
  col = Math.min(2, Math.max(0, col));
  row = Math.min(2, Math.max(0, row));
  const idx = row * 3 + col;
  // reject if the player is nowhere near any cell centre
  const [cx, cy] = cellCentre(idx);
  if (Math.abs(x - cx) > hw * 1.02 || Math.abs(y - cy) > hh * 1.02) return -1;
  return idx;
}

/* ------------------------------------------------------------------ *
 *  Shader
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

uniform float uOpen;      // cell index that is missing, -1 for none
uniform vec3  uColor;
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform float uHit;

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main(){
  // ---- grid ------------------------------------------------------
  vec2 g = vUv * 3.0;
  vec2 c = floor(g);
  vec2 f = fract(g);
  int idx = int(c.y) * 3 + int(c.x);

  // distance to the bevelled edge of this plate
  vec2 e2 = min(f, 1.0 - f);
  float edge = min(e2.x, e2.y);

  bool isOpen = abs(float(idx) - uOpen) < 0.5;

  // plates vanish as they reach the lens so you never sit inside one
  if (vDepth < 5.0) discard;

  // ---- plate face -------------------------------------------------
  float hatch = 0.5 + 0.5 * sin((f.y * 30.0) + hash(c) * 6.28);
  vec3 base = uColor * (0.20 + hatch * 0.06);

  // each plate is a slightly different alloy and lit from above
  base *= 0.65 + 0.45 * hash(c * 1.7);
  base *= mix(0.62, 1.18, f.y);

  // bevelled lip catching light where the plate meets the seam
  float lip = exp(-edge * 55.0);
  base += uColor * lip * 0.62;

  // recessed border so the plate reads as bolted on
  float border = smoothstep(0.05, 0.0, edge);
  base *= 1.0 - border * 0.82;

  // corner bolts
  vec2 bq = abs(f - 0.5);
  float dBolt = length(bq - vec2(0.395));
  float bolt = smoothstep(0.017, 0.0, dBolt);
  base += uColor * bolt * 0.85;

  // ---- seams ------------------------------------------------------
  float seam = smoothstep(0.012, 0.0, edge);
  vec3 seamCol = uColor * 1.9;

  // ---- the opening ------------------------------------------------
  float rim = 0.0;
  if (isOpen) {
    // punch the hole, keep a glowing frame around it
    if (edge > 0.062) discard;
    rim = exp(-edge * 26.0);
    vec3 glow = mix(uColor * 2.4, vec3(1.0), rim * 0.55);
    float a = clamp(smoothstep(0.0, 0.012, edge) * 0.85 + rim * 1.4, 0.0, 1.0);
    gl_FragColor = vec4(glow * (0.5 + rim * 1.6), clamp(a, 0.0, 1.0));
    return;
  }

  vec3 col = base + seamCol * seam;

  // faint scanline travelling across the wall
  float sweep = 0.5 + 0.5 * sin(vUv.y * 8.0 - uTime * 3.0);
  col += uColor * sweep * 0.02;

  // hit flash
  col = mix(col, vec3(1.0, 0.55, 0.55), uHit * 0.9);

  // ---- fog --------------------------------------------------------
  float fogF = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

  // darken plates close to the lens so they do not blow out
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
        uColor: { value: new THREE.Color(0xffffff) },
        uFogColor: { value: new THREE.Color(0x000000) },
        uFogDensity: { value: 0.0118 },
        uTime: { value: 0 },
        uHit: { value: 0 },
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
