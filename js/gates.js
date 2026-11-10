import * as THREE from 'three';
import { TUNNEL } from './tunnel.js';

/* ------------------------------------------------------------------ *
 *  A bulkhead is a slab of lit glass across the corridor with exactly
 *  one aperture punched through it.
 *
 *  Judgement is still a 3x3 grid (row * 3 + col, centre never opens),
 *  but nothing in the render says "grid": the glass is one continuous
 *  pane and only the aperture has structure around it.
 *
 *  The slab is drawn twice — once at z, once 0.38 closer — so the two
 *  apertures parallax against each other as you steer. That is where
 *  the sense of thickness comes from.
 * ------------------------------------------------------------------ */
export const WALL = {
  w: TUNNEL.a * 2 + 0.20,
  h: TUNNEL.b * 2 + 0.20,
};

export const THICKNESS = 0.38;

const RING = [0, 1, 2, 3, 5, 6, 7, 8];

export function cellCentre(idx) {
  const col = idx % 3;
  const row = Math.floor(idx / 3);
  return [(col - 1) * (WALL.w / 3), (row - 1) * (WALL.h / 3)];
}

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

uniform vec2  uHole;      // aperture centre, in cell units (0..3)
uniform vec3  uColor;
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform float uHit;
uniform float uFade;
uniform vec3  uHull;      // corridor half width / half height / chamfer
uniform vec2  uSize;

/* chamfered-square distance, cell units. negative inside the aperture. */
float aperture(vec2 q){
  const float R  = 0.480;   // half aperture
  const float CH = 0.150;   // corner chamfer
  vec2 a = abs(q);
  return max(max(a.x, a.y) - R, (a.x + a.y) - (2.0 * R - CH));
}

void main(){
  if (vDepth < 4.0) discard;

  // clip to the corridor's octagonal section
  vec2 lp = (vUv - 0.5) * uSize;
  if (abs(lp.x) > uHull.x || abs(lp.y) > uHull.y) discard;
  if (abs(lp.x) + abs(lp.y) > uHull.x + uHull.y - uHull.z) discard;

  vec2 g = vUv * 3.0;

  // ---- aperture ----------------------------------------------------
  float sd = aperture(g - uHole);
  if (sd < 0.0) discard;

  // ---- moving scanlines --------------------------------------------
  float scan  = 0.5 + 0.5 * sin(vUv.y * 150.0 - uTime * 9.0);
  float scan2 = 0.5 + 0.5 * sin(vUv.y * 17.0 + uTime * 1.3);
  float grain = fract(sin(dot(floor(vUv * 220.0), vec2(12.9898, 78.233))) * 43758.5453);

  // ---- structure ---------------------------------------------------
  float rim   = exp(-sd * 15.0);                 // cut edge, very bright
  float inner = exp(-sd * 3.2);                  // soft halo inside the glass
  float bevel = smoothstep(0.075, 0.0, sd);      // the slab's cut face

  // outer frame of the pane, in cell units from the boundary
  float bd = min(min(g.x, 3.0 - g.x), min(g.y, 3.0 - g.y));
  float frame = smoothstep(0.12, 0.0, bd) * 0.85 + exp(-bd * 18.0) * 0.7;

  // ---- glass body --------------------------------------------------
  vec3 glass = uColor * (0.55 + 0.75 * scan);
  glass *= 0.55 + 0.75 * scan2;
  glass += vec3(0.04) * grain;

  // vertical falloff so the slab is lit from below
  glass *= mix(0.55, 1.25, vUv.y);

  vec3 col = glass;

  // cut face: brighter toward the aperture mouth, darker deeper in
  col = mix(col, uColor * 2.2, bevel * 0.75);

  // the rim goes white hot
  col = mix(col, mix(uColor * 2.6, vec3(1.0), 0.55), clamp(rim, 0.0, 1.0));

  // soft inner halo bleeding into the pane
  col += uColor * inner * 0.55;

  // frame edge
  col += uColor * frame * 1.5;

  // ---- alpha -------------------------------------------------------
  float a = 0.115 + 0.090 * scan;
  a *= 0.55 + 0.60 * scan2;
  a += bevel * 0.22;
  a += inner * 0.10;
  a += rim * 0.95;
  a += frame * 0.52;
  a += grain * 0.02;
  a *= uFade;

  col = mix(col, vec3(1.0, 0.5, 0.5), uHit * 0.8);

  float fogF = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
  a *= 1.0 - fogF * 0.85;

  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

const GEO = new THREE.PlaneGeometry(WALL.w, WALL.h);

/* ------------------------------------------------------------------ *
 *  One bulkhead
 * ------------------------------------------------------------------ */
export class Gate {
  constructor(rng, time) {
    this.open = RING[Math.floor(rng() * RING.length) % RING.length];
    this.style = Math.floor(rng() * 3);
    this.dBeats = 0;
    this.d = 0;
    this.spawnT = time;
    this.passed = false;
    this.hit = 0;

    const col = this.open % 3;
    const row = Math.floor(this.open / 3);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uHole: { value: new THREE.Vector2(col + 0.5, row + 0.5) },
        uColor: { value: new THREE.Color(0xffffff) },
        uFogColor: { value: new THREE.Color(0x000000) },
        uFogDensity: { value: 0.0118 },
        uTime: { value: 0 },
        uHit: { value: 0 },
        uFade: { value: 1 },
        uHull: { value: new THREE.Vector3(TUNNEL.a, TUNNEL.b, TUNNEL.ch) },
        uSize: { value: new THREE.Vector2(WALL.w, WALL.h) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.meshes = [];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(GEO, this.mat);
      m.frustumCulled = false;
      m.renderOrder = 6;
      m.userData.offset = i * THICKNESS;
      this.meshes.push(m);
    }
  }

  centre() {
    return cellCentre(this.open);
  }

  place(d) {
    this.d = d;
    for (const m of this.meshes) m.position.z = -d + m.userData.offset;
  }

  update(time, hue) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uHit.value = this.hit * 0.8;
    u.uColor.value.setHSL((hue + 1) % 1, 0.72, 0.55);
    u.uFade.value = THREE.MathUtils.clamp((this.d - 3.0) / 9.0, 0, 1);
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
      for (const m of g.meshes) this.scene.remove(m);
      g.dispose();
    }
    this.list.length = 0;
  }

  spawn(dBeats, speed, secPerBeat, time) {
    const g = new Gate(() => this.rng(), time);
    g.dBeats = dBeats;
    g.place(speed * dBeats * secPerBeat);
    for (const m of g.meshes) this.scene.add(m);
    this.list.push(g);
    return g;
  }

  update(dBeat, speed, secPerBeat, time, hue) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.dBeats -= dBeat;
      g.place(Math.max(-2, speed * g.dBeats * secPerBeat));
      g.update(time, hue);
      if (g.dBeats < -0.35) {
        for (const m of g.meshes) this.scene.remove(m);
        g.dispose();
        this.list.splice(i, 1);
      }
    }
  }
}
