import * as THREE from 'three';
import type { Axis } from '../core/collision';
import { daybreakProfile, isDaybreakGate } from '../core/daybreak-gates';
import { isDescentGate, laserOpening } from '../core/descent-gates';
import { apertureAnchors, apertureSizes, isOrbitGate, orbitPreset } from '../core/orbit-gates';
import type { GateKind } from '../core/volumes';
import { descentGlassVariant } from './descent-glass';
import { buildGlassGeometry, GLASS_THICKNESS } from './glass-geometry';
import { GLASS_FRAG, GLASS_RIM_SEGMENTS, GLASS_SEAM_SEGMENTS, GLASS_VERT } from './glass-optics';

export const THICKNESS = GLASS_THICKNESS;

const styles = { iris: 0, square: 1, diamond: 2,
  'laser-matrix': 4, 'laser-slice': 5, 'laser-weave': 6 } as const;
type Edges = ReturnType<typeof daybreakProfile>['rim'];
const packEdges = (edges: Edges, count: number) => {
  const values = new Float32Array(count * 4);
  for (const [i, [from, to]] of edges.entries()) values.set([...from, ...to], i * 4);
  return values;
};

/** Owned by the volume (or a preview). Individual gates only own their material. */
export class GateGeometries {
  private readonly cache = new Map<string, THREE.BufferGeometry>();

  get size() { return this.cache.size; }

  get(kind: GateKind, open: number, axis: Axis = 0) {
    const key = isDescentGate(kind) ? `${kind}:${descentGlassVariant(kind, open, axis)}`
      : kind === 'iris' || isDaybreakGate(kind) || isOrbitGate(kind) ? `${kind}:${open}` : kind;
    let geometry = this.cache.get(key);
    if (!geometry) {
      geometry = buildGlassGeometry(kind, open, axis);
      this.cache.set(key, geometry);
    }
    return geometry;
  }

  dispose() {
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
    const orbit = isOrbitGate(obstacle) ? orbitPreset(obstacle, open) : undefined;
    this.fullSightRange = !!descent || !!orbit;
    const polygon = isDaybreakGate(obstacle) ? daybreakProfile(obstacle, open) : undefined;
    const geometry = geometries.get(obstacle, open, axis);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: GLASS_VERT,
      fragmentShader: GLASS_FRAG,
      ...(descent ? { defines: { DESCENT_GLASS: 1 } } : orbit ? { defines: { ORBIT_GLASS: 1 } } : {}),
      uniforms: {
        uOpen: { value: open },
        uColor: { value: new THREE.Color(0xffffff) },
        uTime: { value: 0 },
        uHit: { value: 0 },
        uFade: { value: 1 },
        uStyle: { value: isDaybreakGate(obstacle) || orbit ? 3 : styles[obstacle as keyof typeof styles] },
        ...(orbit ? {
          uOrbitApertures: { value: Array.from({ length: 3 }, (_, i) => {
            const hole = orbit.holes[i];
            return hole ? new THREE.Vector4(...apertureAnchors[hole.anchor], apertureSizes[hole.shape][hole.size],
              ['circle', 'square', 'diamond'].indexOf(hole.shape)) : new THREE.Vector4();
          }) }, uOrbitApertureCount: { value: orbit.holes.length },
        } : {}),
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
        } : { uMicroContrast: { value: 1 } }),
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      toneMapped: false,
    });

    const m = new THREE.Mesh(geometry, this.mat);
    m.frustumCulled = this.fullSightRange;
    if (this.fullSightRange) m.name = obstacle;
    m.renderOrder = 6;
    this.meshes.push(m);
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
