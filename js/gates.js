import * as THREE from 'three';
import { TUNNEL } from './tunnel.js?v=2026-11-10a';

/* ------------------------------------------------------------------ *
 *  A bulkhead is not a sheet with a hole in it — it is a set of glass
 *  panes fitted together, one of them missing. The missing pane *is*
 *  the way through, and its edge is the neighbouring panes' frames.
 *
 *  Layout: a solid central hub, and eight wedge panes around it.
 *  Sector index, counter-clockwise from east:
 *      0 E   1 NE   2 N   3 NW   4 W   5 SW   6 S   7 SE
 *
 *  Two planes 0.38 apart share the material, so the missing wedge and
 *  its neighbours parallax against each other — that is the thickness.
 * ------------------------------------------------------------------ */
export const WALL = {
  w: TUNNEL.a * 2 + 0.20,
  h: TUNNEL.b * 2 + 0.20,
};

export const THICKNESS = 0.38;
export const HUB_R = 1.02;
export const SECTORS = 8;

/** world position at the middle of a sector's through-gap */
export function sectorPoint(s, radius = 2.15) {
  const a = s * (Math.PI / 4);
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}

/** which wedge a point falls in; -1 inside the hub */
export function sectorOf(x, y) {
  const r = Math.hypot(x, y);
  if (r < HUB_R * 0.96) return -1;
  let t = Math.atan2(y, x) + Math.PI * 2 + Math.PI / 8;
  t = ((t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(t / (Math.PI / 4)) % SECTORS;
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

uniform float uOpen;
uniform vec3  uColor;
uniform float uTime;
uniform float uHit;
uniform float uFade;
uniform vec3  uHull;
uniform vec2  uSize;
uniform float uHub;

const float PI = 3.14159265;
const float TAU = 6.28318531;
const float STEP = 0.78539816;   // PI / 4

float hash(float x){ return fract(sin(x * 127.1) * 43758.5453); }

void main(){
  if (vDepth < 0.5) discard;

  vec2 p = (vUv - 0.5) * uSize;

  // clip to the corridor's octagonal section
  if (abs(p.x) > uHull.x || abs(p.y) > uHull.y) discard;
  float hullD = min(min(uHull.x - abs(p.x), uHull.y - abs(p.y)),
                    (uHull.x + uHull.y - uHull.z) - (abs(p.x) + abs(p.y)));
  if (hullD < 0.0) discard;

  float r = length(p);
  float t = mod(atan(p.y, p.x) + TAU + PI / 8.0, TAU);

  float sector = floor(t / STEP);
  float inSector = mod(t, STEP);              // 0..STEP inside the wedge
  float spoke = min(inSector, STEP - inSector); // angular distance to a seam

  bool inHub = r < uHub;
  bool isOpen = (!inHub) && (abs(sector - uOpen) < 0.5);

  /* ---------------- the missing pane --------------------------------
     nothing to draw: the gap is defined by the panes that remain       */
  if (isOpen) discard;

  // ---- seams: the fitted edges between panes ------------------------
  float seamAng = smoothstep(0.014, 0.0, spoke * max(r, 0.40)) * step(uHub, r);
  float seamHub = smoothstep(0.022, 0.0, abs(r - uHub));
  float seamHull = smoothstep(0.022, 0.0, hullD);
  float seam = max(max(seamAng, seamHub), seamHull);

  // soft glow hanging off each seam
  float seamGlow = exp(-abs(r - uHub) * 9.0) * 0.35
                 + exp(-spoke * max(r, 0.35) * 34.0) * 0.45
                 + exp(-hullD * 9.0) * 0.30;

  // ---- per-pane variation -------------------------------------------
  float id = inHub ? 9.9 : sector;
  float tint = 0.72 + 0.55 * hash(id + 1.0);
  float tilt = hash(id + 7.0);

  // ---- moving scanlines ---------------------------------------------
  float scan  = 0.5 + 0.5 * sin(vUv.y * 150.0 - uTime * 9.0);
  float scan2 = 0.5 + 0.5 * sin(vUv.y * 17.0 + uTime * 1.3);
  float grain = fract(sin(dot(floor(vUv * 220.0), vec2(12.9898, 78.233))) * 43758.5453);

  // ---- glass body ----------------------------------------------------
  vec3 glass = uColor * (0.50 + 0.80 * scan) * tint;
  glass *= 0.60 + 0.70 * scan2;
  glass *= mix(0.55, 1.30, vUv.y);          // lit from below
  glass += vec3(0.03) * grain;

  // the hub is denser, colder glass
  if (inHub) glass *= 0.55 + 0.35 * smoothstep(0.0, 0.9, r);

  // dark groove just inside every seam so the panes read as separate pieces
  float groove = smoothstep(0.055, 0.0, spoke * max(r, 0.40)) * step(uHub, r);
  groove = max(groove, smoothstep(0.055, 0.0, abs(r - uHub)) * 0.8);
  glass *= 1.0 - groove * 0.62;

  vec3 col = glass + uColor * seamGlow * 0.55;

  // seams read as bright fitted edges
  col = mix(col, mix(uColor * 1.7, vec3(1.0), 0.18), seam * 0.42);

  // ---- alpha ---------------------------------------------------------
  float a = 0.100 + 0.080 * scan;
  a *= 0.55 + 0.60 * scan2;
  a *= mix(0.8, 1.15, tilt);
  a += seamGlow * 0.14;
  a += seam * 0.30;
  a += grain * 0.015;
  a *= uFade;

  if (inHub) a *= 1.25;

  col = mix(col, vec3(1.0, 0.5, 0.5), uHit * 0.8);

  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

const GEO = new THREE.PlaneGeometry(WALL.w, WALL.h);

/* ------------------------------------------------------------------ *
 *  One bulkhead
 * ------------------------------------------------------------------ */
export class Gate {
  constructor(sector, time) {
    this.open = ((sector | 0) % SECTORS + SECTORS) % SECTORS;
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
        uTime: { value: 0 },
        uHit: { value: 0 },
        uFade: { value: 1 },
        uHull: { value: new THREE.Vector3(TUNNEL.a, TUNNEL.b, TUNNEL.ch) },
        uSize: { value: new THREE.Vector2(WALL.w, WALL.h) },
        uHub: { value: HUB_R },
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


  update(time, hue) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uHit.value = this.hit * 0.8;
    u.uColor.value.setHSL((hue + 1) % 1, 0.72, 0.55);
    // stays fully opaque right up to the moment it passes the lens, then fades out behind you
    u.uFade.value = THREE.MathUtils.clamp((this.d + 2.5) / 3.0, 0, 1);
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

  spawn(dBeats, speed, secPerBeat, time, sector) {
    const s = sector === undefined ? Math.floor(this.rng() * SECTORS) : sector;
    const g = new Gate(s, time);
    g.dBeats = dBeats;
    g.d = speed * dBeats * secPerBeat;
    for (const m of g.meshes) {
      this.scene.add(m);
      if (this.place) this.place(m, g.d - m.userData.offset);
    }
    this.list.push(g);
    return g;
  }

  update(dBeat, speed, secPerBeat, time, hue) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.dBeats -= dBeat;
      g.d -= speed * dBeat * secPerBeat;   // integrate: no snap when boost changes speed
      if (this.place) for (const m of g.meshes) this.place(m, g.d - m.userData.offset);
      g.update(time, hue);
      if (g.dBeats < -0.35) {
        for (const m of g.meshes) this.scene.remove(m);
        g.dispose();
        this.list.splice(i, 1);
      }
    }
  }
}
