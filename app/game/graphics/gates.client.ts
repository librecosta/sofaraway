import * as THREE from 'three';
import { HOLE_R, lanePoint, SECTION, WALL } from '../core/collision';
import type { Axis } from '../core/collision';
import { daybreakProfile, isDaybreakGate } from '../core/daybreak-gates';
import { isDescentGate } from '../core/descent-gates';
import type { GateKind } from '../core/volumes';
import { buildGlassGeometry, GLASS_THICKNESS, isOpticalGlass } from './glass-geometry';
import { GLASS_FRAG, GLASS_RIM_SEGMENTS, GLASS_SEAM_SEGMENTS, GLASS_VERT } from './glass-optics';
import { laserEmitters, laserMaterial } from './laser-gates.client';

export const THICKNESS = GLASS_THICKNESS;

const styles = { iris: 0, square: 1, diamond: 2, aperture: 3 } as const;
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
  private emitters?: THREE.BufferGeometry;

  get(kind: GateKind, open: number) {
    if (!isOpticalGlass(kind)) return this.plane ??= new THREE.PlaneGeometry(WALL.w, WALL.h);
    const key = kind === 'iris' || isDaybreakGate(kind) ? `${kind}:${open}` : kind;
    let geometry = this.cache.get(key);
    if (!geometry) {
      geometry = buildGlassGeometry(kind, open);
      this.cache.set(key, geometry);
    }
    return geometry;
  }

  emitterFrame() {
    const geometry = this.emitters ??= laserEmitters();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .41,
      roughness: .48, emissive: 0x415968, emissiveIntensity: .24, transparent: true, depthWrite: false }));
  }

  dispose() {
    this.plane?.dispose();
    this.plane = undefined;
    this.emitters?.dispose();
    this.emitters = undefined;
    for (const geometry of this.cache.values()) geometry.dispose();
    this.cache.clear();
  }
}

export class GateVisual {
  readonly mat: THREE.ShaderMaterial;
  readonly meshes: THREE.Mesh[] = [];
  private readonly emitter?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

  constructor(geometries: GateGeometries, obstacle: GateKind, open: number, axis: Axis) {
    if (isDescentGate(obstacle)) {
      this.mat = laserMaterial(obstacle, open, axis);
      const grid = new THREE.Mesh(geometries.get(obstacle, open), this.mat);
      grid.name = obstacle;
      grid.renderOrder = 6;
      this.emitter = geometries.emitterFrame();
      this.emitter.renderOrder = 5;
      grid.add(this.emitter);
      this.meshes.push(grid);
      return;
    }
    const glass = isOpticalGlass(obstacle);
    const polygon = isDaybreakGate(obstacle) ? daybreakProfile(obstacle, open) : undefined;
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
        uStyle: { value: isDaybreakGate(obstacle) ? 3 : styles[obstacle] },
        ...(polygon ? {
          uOpeningEdges: { value: packEdges(polygon.rim, GLASS_RIM_SEGMENTS) },
          uPaneSeams: { value: packEdges(polygon.seams, GLASS_SEAM_SEGMENTS) },
          uOpeningEdgeCount: { value: polygon.rim.length },
          uPaneSeamCount: { value: polygon.seams.length },
        } : {}),
        ...(glass ? { uMicroContrast: { value: 1 } } : {
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
      m.frustumCulled = false;
      m.renderOrder = 6;
      this.meshes.push(m);
    }
  }

  update(time: number, hue: number, distance: number, modeScale: number, hit: boolean, microContrast = 1, saturation = 1,
    laserColor?: THREE.Color | number) {
    const u = this.mat.uniforms;
    u.uTime.value = time;
    u.uHit.value = hit ? 0.8 : 0;
    if (u.uMicroContrast) u.uMicroContrast.value = microContrast;
    if (laserColor === undefined) u.uColor.value.setHSL((hue + 1) % 1, 0.72 * saturation, 0.55);
    else u.uColor.value.set(laserColor);
    const fadeIn = this.emitter ? 1 : 1 - THREE.MathUtils.smoothstep(distance, 140 * modeScale, 190 * modeScale);
    const fadeOut = THREE.MathUtils.clamp((distance + 2.5) / (this.emitter ? 2.5 : 3), 0, 1);
    u.uFade.value = fadeIn * fadeOut;
    if (this.emitter) this.emitter.material.opacity = u.uFade.value;
    const visible = u.uFade.value > 0;
    for (const mesh of this.meshes) mesh.visible = visible;
    return visible;
  }

  dispose() {
    this.mat.dispose();
    this.emitter?.material.dispose();
  }
}
