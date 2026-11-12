import * as THREE from 'three';
import { HOLE_R, lanePoint, SECTION, WALL } from '../core/collision';
import type { Axis } from '../core/collision';
import type { GateKind } from '../core/volumes';
import { buildGlassGeometry, GLASS_THICKNESS, isOpticalGlass } from './glass-geometry';
import type { GlassKind } from './glass-geometry';
import { GLASS_FRAG, GLASS_VERT } from './glass-optics';

export const THICKNESS = GLASS_THICKNESS;

const styles = { iris: 0, square: 1, diamond: 2, shutter: 1, lattice: 2, aperture: 3 } as const;

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
uniform float uStyle;
uniform float uAxis;
uniform vec2  uHolePos;  // aperture centre in section units

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

  discard;
}
`;

/** Owned by the volume (or a preview). Individual gates only own their material. */
export class GateGeometries {
  private readonly cache = new Map<GlassKind | number, THREE.BufferGeometry>();
  private plane?: THREE.PlaneGeometry;

  get(kind: GateKind, open: number) {
    if (!isOpticalGlass(kind)) return this.plane ??= new THREE.PlaneGeometry(WALL.w, WALL.h);
    const key = kind === 'iris' ? open : kind;
    let geometry = this.cache.get(key);
    if (!geometry) {
      geometry = buildGlassGeometry(kind, open);
      this.cache.set(key, geometry);
    }
    return geometry;
  }

  dispose() {
    this.plane?.dispose();
    this.plane = undefined;
    for (const geometry of this.cache.values()) geometry.dispose();
    this.cache.clear();
  }
}

export class GateVisual {
  readonly mat: THREE.ShaderMaterial;
  readonly meshes: THREE.Mesh[] = [];

  constructor(geometries: GateGeometries, obstacle: GateKind, open: number, axis: Axis) {
    const glass = isOpticalGlass(obstacle);
    const geometry = geometries.get(obstacle, open);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: glass ? GLASS_VERT : VERT,
      fragmentShader: glass ? GLASS_FRAG : FRAG,
      uniforms: {
        uOpen: { value: open },
        uColor: { value: new THREE.Color(0xffffff) },
        uTime: { value: 0 },
        uHit: { value: 0 },
        uFade: { value: 1 },
        uStyle: { value: styles[obstacle] },
        ...(glass ? { uMicroContrast: { value: 1 } } : {
          uHull: { value: new THREE.Vector3(SECTION.a, SECTION.b, SECTION.ch) },
          uSize: { value: new THREE.Vector2(WALL.w, WALL.h) },
          uAxis: { value: axis },
          uHolePos: { value: new THREE.Vector2(...lanePoint(obstacle, open, axis)) },
        }),
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      forceSinglePass: glass,
      toneMapped: false,
    });

    for (let i = 0; i < (glass ? 1 : 2); i++) {
      const m = new THREE.Mesh(geometry, this.mat);
      m.frustumCulled = false;
      m.renderOrder = 6;
      this.meshes.push(m);
    }
  }

  update(time: number, hue: number, distance: number, modeScale: number, hit: boolean, microContrast = 1) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uHit.value = hit ? 0.8 : 0;
    if (u.uMicroContrast) u.uMicroContrast.value = microContrast;
    u.uColor.value.setHSL((hue + 1) % 1, 0.72, 0.55);
    const fadeIn = 1 - THREE.MathUtils.smoothstep(distance, 140 * modeScale, 190 * modeScale);
    const fadeOut = THREE.MathUtils.clamp((distance + 2.5) / 3.0, 0, 1);
    u.uFade.value = fadeIn * fadeOut;
    const visible = u.uFade.value > 0;
    for (const mesh of this.meshes) mesh.visible = visible;
    return visible;
  }

  dispose() {
    this.mat.dispose();
  }
}
