import * as THREE from 'three';
import { HOLE_R, HUB_R, lanePoint, SECTION, WALL } from '../core/collision';
import type { Axis } from '../core/collision';
import type { Obstacle } from '../core/volumes';

export const THICKNESS = 0.38;

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
uniform float uStyle;
uniform float uAxis;
uniform vec2  uHolePos;  // aperture centre in section units

const float PI = 3.14159265;
const float TAU = 6.28318531;
const float STEP = 0.78539816;   // PI / 4

float hash(float x){ return fract(sin(x * 127.1) * 43758.5453); }

void main(){
  if (vDepth < 0.5) discard;

  vec2 p = (vUv - 0.5) * uSize;

  /* All gates span the steerable section, including above the canal lip. */
  float hullD = min(min(uHull.x - abs(p.x), uHull.y - abs(p.y)),
                    (uHull.x + uHull.y - uHull.z) - (abs(p.x) + abs(p.y)));
  if (hullD < 0.0) discard;

  /* ---- aperture glass: one round hole in a full pane ---- */
  if (uStyle > 2.5) {
    float d = length(p - uHolePos) - ${HOLE_R};
    if (d < 0.0) discard;

    float rim = exp(-d * 16.0);
    float scan = 0.5 + 0.5 * sin(vUv.y * 150.0 - uTime * 8.0);
    float band = 0.5 + 0.5 * sin(length(p - uHolePos) * 3.6 - uTime * 1.2);

    vec3 glass = uColor * (0.26 + 0.48 * scan) * (0.6 + 0.7 * band);
    vec3 col = glass + uColor * rim * 2.1;

    float a = 0.085 + 0.06 * scan + rim * 0.85;
    a *= uFade;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    return;
  }

  /* ---- lattice glass: nine plates fitted, one of them missing ---- */
  if (uStyle > 1.5) {
    vec2 g = vUv * 3.0;
    vec2 c = floor(g);
    int idx = int(c.y) * 3 + int(c.x);
    if (idx != 4 && abs(float(idx) - uOpen) < 0.5) discard;

    vec2 f = fract(g);
    vec2 e2 = min(f, 1.0 - f);
    float edge = min(e2.x, e2.y);

    if (idx == 4) {
      // solid hub plate
      vec3 plate = uColor * (0.16 + 0.10 * f.y);
      plate += uColor * exp(-edge * 40.0) * 0.9;
      gl_FragColor = vec4(plate, clamp(0.55 * uFade, 0.0, 1.0));
      return;
    }

    float rim = exp(-edge * 26.0);
    float hatch = 0.5 + 0.5 * sin(f.y * 18.0 + uTime * 0.7);
    vec3 glass = uColor * (0.30 + 0.55 * hatch);
    vec3 col = glass + uColor * rim * 1.5;
    float a = 0.10 + 0.06 * hatch + rim * 0.55;
    a *= uFade;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    return;
  }

  /* ---- shutter glass: three horizontal bands, one of them open ---- */
  if (uStyle > 0.5) {
    float t = mix(vUv.y, vUv.x, uAxis);
    float b = t * 3.0;
    int band = int(floor(b));
    if (abs(float(band) - uOpen) < 0.5) discard;

    float f = fract(b);
    float edge = min(f, 1.0 - f);

    float slat = 0.5 + 0.5 * sin(t * 240.0 - uTime * 6.0);
    float bandTone = 0.5 + 0.5 * sin(t * 18.0 + uTime * 1.1);
    float rimT = exp(-edge * 24.0);

    vec3 glass = uColor * (0.42 + 0.65 * slat) * (0.55 + 0.7 * bandTone);
    glass *= mix(0.6, 1.25, t);
    vec3 col = glass + uColor * rimT * 1.5;

    float a = 0.08 + 0.065 * slat + rimT * 0.5;
    a *= uFade;

    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    return;
  }

  float r = length(p);
  float angle = p.x == 0.0 ? sign(p.y) * PI * 0.5 : atan(p.y, p.x);
  float t = mod(angle + TAU + PI / 8.0, TAU);

  float sector = floor(t / STEP);
  float inSector = mod(t, STEP);              // 0..STEP inside the wedge
  float spoke = min(inSector, STEP - inSector); // angular distance to a seam

  bool inHub = r < uHub;
  bool isOpen = (!inHub) && (abs(sector - uOpen) < 0.5);

  /* ---------------- the missing pane --------------------------------
     nothing to draw: the gap is defined by the panes that remain       */
  if (isOpen) discard;

  // ---- seams: the fitted edges between panes ------------------------
  float seamAng = (1.0 - smoothstep(0.0, 0.014, spoke * max(r, 0.40))) * step(uHub, r);
  float seamHub = 1.0 - smoothstep(0.0, 0.022, abs(r - uHub));
  float seamHull = 1.0 - smoothstep(0.0, 0.022, hullD);
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
  float groove = (1.0 - smoothstep(0.0, 0.055, spoke * max(r, 0.40))) * step(uHub, r);
  groove = max(groove, (1.0 - smoothstep(0.0, 0.055, abs(r - uHub))) * 0.8);
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

export class GateVisual {
  readonly mat: THREE.ShaderMaterial;
  readonly meshes: THREE.Mesh[] = [];

  constructor(geometry: THREE.PlaneGeometry, obstacle: Obstacle, open: number, axis: Axis) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uOpen: { value: open },
        uColor: { value: new THREE.Color(0xffffff) },
        uTime: { value: 0 },
        uHit: { value: 0 },
        uFade: { value: 1 },
        uHull: { value: new THREE.Vector3(SECTION.a, SECTION.b, SECTION.ch) },
        uSize: { value: new THREE.Vector2(WALL.w, WALL.h) },
        uHub: { value: HUB_R },
        uStyle: { value: obstacle === 'shutter' ? 1 : (obstacle === 'lattice' ? 2 : (obstacle === 'aperture' ? 3 : 0)) },
        uAxis: { value: axis },
        uHolePos: { value: new THREE.Vector2(...lanePoint(obstacle, open, axis)) },
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
      const m = new THREE.Mesh(geometry, this.mat);
      m.frustumCulled = false;
      m.renderOrder = 6;
      m.userData.offset = i * THICKNESS;
      this.meshes.push(m);
    }
  }

  update(time: number, hue: number, distance: number, hit: boolean) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uHit.value = hit ? 0.8 : 0;
    u.uColor.value.setHSL((hue + 1) % 1, 0.72, 0.55);
    // stays fully opaque right up to the moment it passes the lens, then fades out behind you
    u.uFade.value = THREE.MathUtils.clamp((distance + 2.5) / 3.0, 0, 1);
  }

  dispose() {
    this.mat.dispose();
  }
}
