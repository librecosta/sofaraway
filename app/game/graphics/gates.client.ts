import * as THREE from 'three';
import { HOLE_R, lanePoint, SECTION, WALL } from '../core/collision';
import type { Axis } from '../core/collision';
import { daybreakProfile, isDaybreakGate } from '../core/daybreak-gates';
import { isDescentGate, laserOpening } from '../core/descent-gates';
import type { GateKind } from '../core/volumes';
import { descentGlassVariant } from './descent-glass';
import { buildGlassGeometry, GLASS_THICKNESS, isOpticalGlass } from './glass-geometry';
import { GLASS_FRAG, GLASS_RIM_SEGMENTS, GLASS_SEAM_SEGMENTS, GLASS_VERT } from './glass-optics';

export const THICKNESS = GLASS_THICKNESS;

const styles = { iris: 0, square: 1, diamond: 2, aperture: 3,
  'laser-matrix': 4, 'laser-slice': 5, 'laser-weave': 6 } as const;
type Edges = ReturnType<typeof daybreakProfile>['rim'];
const packEdges = (edges: Edges, count: number) => {
  const values = new Float32Array(count * 4);
  for (const [i, [from, to]] of edges.entries()) values.set([...from, ...to], i * 4);
  return values;
};

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

  discard;
}
`;

/** Owned by the volume (or a preview). Individual gates only own their material. */
export class GateGeometries {
  private readonly cache = new Map<string, THREE.BufferGeometry>();
  private plane?: THREE.PlaneGeometry;

  get(kind: GateKind, open: number, axis: Axis = 0) {
    if (!isOpticalGlass(kind)) return this.plane ??= new THREE.PlaneGeometry(WALL.w, WALL.h);
    const key = isDescentGate(kind) ? `${kind}:${descentGlassVariant(kind, open, axis)}`
      : kind === 'iris' || isDaybreakGate(kind) ? `${kind}:${open}` : kind;
    let geometry = this.cache.get(key);
    if (!geometry) {
      geometry = buildGlassGeometry(kind, open, axis);
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
  private readonly fullSightRange: boolean;

  constructor(geometries: GateGeometries, obstacle: GateKind, open: number, axis: Axis) {
    const descent = isDescentGate(obstacle) ? laserOpening(obstacle, open, axis) : undefined;
    this.fullSightRange = !!descent;
    const glass = isOpticalGlass(obstacle);
    const polygon = isDaybreakGate(obstacle) ? daybreakProfile(obstacle, open) : undefined;
    const geometry = geometries.get(obstacle, open, axis);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: glass ? GLASS_VERT : VERT,
      fragmentShader: glass ? GLASS_FRAG : FRAG,
      ...(descent ? { defines: { DESCENT_GLASS: 1 } } : {}),
      uniforms: {
        uOpen: { value: open },
        uColor: { value: new THREE.Color(0xffffff) },
        uTime: { value: 0 },
        uHit: { value: 0 },
        uFade: { value: 1 },
        uStyle: { value: isDaybreakGate(obstacle) ? 3 : styles[obstacle] },
        ...(polygon ? {
          uOpeningEdges: { value: packEdges(polygon.rim, GLASS_RIM_SEGMENTS) },
          uPaneSeams: { value: packEdges(polygon.seams, GLASS_SEAM_SEGMENTS) },
          uOpeningEdgeCount: { value: polygon.rim.length },
          uPaneSeamCount: { value: polygon.seams.length },
        } : {}),
        ...(descent ? {
          uDescentOpening: { value: new THREE.Vector4(...descent.target, descent.extent[0], descent.extent[1] ?? 0) },
          uDescentNormal: { value: new THREE.Vector2(...descent.normal) },
          uDescentRimDelta: { value: new THREE.Color(0, 0, 0) },
        } : glass ? { uMicroContrast: { value: 1 } } : {
          uHull: { value: new THREE.Vector3(SECTION.a, SECTION.b, SECTION.ch) },
          uSize: { value: new THREE.Vector2(WALL.w, WALL.h) },
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
      m.frustumCulled = this.fullSightRange;
      if (this.fullSightRange) m.name = obstacle;
      m.renderOrder = 6;
      this.meshes.push(m);
    }
  }

  update(time: number, hue: number, distance: number, modeScale: number, hit: boolean, microContrast = 1, saturation = 1,
    tint?: THREE.Color | number, rim?: THREE.Vector4) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uHit.value = hit ? 0.8 : 0;
    if (u.uMicroContrast) u.uMicroContrast.value = microContrast;
    if (tint === undefined) u.uColor.value.setHSL((hue + 1) % 1, 0.72 * saturation, 0.55);
    else u.uColor.value.set(tint);
    if (rim && u.uDescentRimDelta) {
      const base = u.uColor.value as THREE.Color;
      const weight = rim.w * (hit ? .20 : 1);
      const gain = 1 + .24 * weight;
      u.uDescentRimDelta.value.setRGB(
        (base.r + weight * (rim.x - base.r)) * gain - base.r,
        (base.g + weight * (rim.y - base.g)) * gain - base.g,
        (base.b + weight * (rim.z - base.b)) * gain - base.b,
      );
    }
    const fadeIn = this.fullSightRange ? 1 : 1 - THREE.MathUtils.smoothstep(distance, 140 * modeScale, 190 * modeScale);
    const fadeOut = THREE.MathUtils.clamp((distance + 2.5) / (this.fullSightRange ? 2.5 : 3), 0, 1);
    u.uFade.value = fadeIn * fadeOut;
    const visible = u.uFade.value > 0;
    for (const mesh of this.meshes) mesh.visible = visible;
    return visible;
  }

  dispose() {
    this.mat.dispose();
  }
}
