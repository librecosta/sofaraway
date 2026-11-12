import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StructureKind } from '../core/dressing';
import { surfacePresets } from './materials/presets';
import type { SurfaceMaterialId } from './materials/presets';
import type { MaterialLibrary } from './materials/library.client';

type Finish = SurfaceMaterialId;
type XYZ = readonly [number, number, number];
const brushed = 'alloy-brushed-tech', panel = 'panel-recessed';
const frame = 'panel-reinforced', rubber = 'utility-polymer';

/** Part geometries are authored in world units. +Z is the exposed face of a wall assembly. */
class Model {
  private readonly pieces = new Map<Finish, THREE.BufferGeometry[]>();

  private part(material: Finish, mesh: THREE.BufferGeometry, at: XYZ, rotation: XYZ = [0, 0, 0], units?: readonly [number, number]) {
    if (material in surfacePresets) {
      const [w, h] = surfacePresets[material as SurfaceMaterialId].tile;
      const uv = mesh.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (units?.[0] ?? 1) / w, uv.getY(i) * (units?.[1] ?? 1) / h);
    }
    mesh.rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]).translate(...at);
    const clean = mesh.index ? mesh.toNonIndexed() : mesh;
    if (clean !== mesh) mesh.dispose();
    const list = this.pieces.get(material) ?? [];
    list.push(clean);
    this.pieces.set(material, list);
  }

  slab(material: Finish, size: XYZ, at: XYZ, bevel = 0.025, rotation?: XYZ, corner = bevel) {
    const [w, h, d] = size;
    const x = w / 2 - bevel, y = h / 2 - bevel;
    const c = Math.min(corner, x * 0.65, y * 0.65);
    const shape = new THREE.Shape();
    shape.moveTo(-x + c, -y);
    for (const p of [[x - c, -y], [x, -y + c], [x, y - c], [x - c, y],
      [-x + c, y], [-x, y - c], [-x, -y + c]]) shape.lineTo(p[0], p[1]);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d - bevel * 2, bevelEnabled: true,
      bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1, curveSegments: 1 });
    geometry.translate(0, 0, -d / 2 + bevel);
    this.part(material, geometry, at, rotation);
  }

  cylinder(material: Finish, radius: number, height: number, at: XYZ, rotation?: XYZ, taper = radius) {
    const geometry = new THREE.CylinderGeometry(taper, radius, height, 16);
    this.part(material, geometry, at, rotation, [2 * Math.PI * radius, height]);
  }

  collar(material: Finish, radius: number, thickness: number, at: XYZ) {
    this.part(material, new THREE.TorusGeometry(radius, thickness, 5, 24), at, undefined, [2 * Math.PI * radius, 2 * Math.PI * thickness]);
  }

  duct(material: Finish, radius: number, points: readonly XYZ[]) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    this.part(material, new THREE.TubeGeometry(path, Math.max(4, points.length * 3), radius, 8, false),
      [0, 0, 0], undefined, [path.getLength(), 2 * Math.PI * radius]);
  }

  finish(library: MaterialLibrary, wall: boolean) {
    return [...this.pieces].map(([id, parts]) => {
      const geometry = mergeGeometries(parts)!;
      for (const part of parts) part.dispose();
      if (wall) geometry.scale(1, 1, .60);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return { geometry, material: library.get(id) };
    });
  }
}

const axisZ = [Math.PI / 2, 0, 0] as const;
const axisX = [0, 0, Math.PI / 2] as const;

export function buildDressingModel(kind: StructureKind, library: MaterialLibrary) {
  const m = new Model();
  switch (kind) {
    case 'overhead-assembly':
      // The upper shoulder meets the shell, with one inset underside and no separate lamps.
      m.slab(frame, [5.06, .23, .86], [0, -.105, 0], .034, undefined, .11);
      m.slab(brushed, [4.78, .07, .52], [0, -.242, 0], .014, undefined, .10);
      break;
    case 'ventilation-assembly':
      m.slab(frame, [1.84, 1.63, 0.13], [-0.16, 0, 0.069], 0.033, undefined, 0.17);
      m.cylinder(rubber, 0.675, 0.21, [-0.23, 0, 0.19], axisZ);
      m.collar(brushed, 0.62, 0.057, [-0.23, 0, 0.32]);
      m.cylinder(brushed, 0.13, 0.28, [-0.23, 0, 0.25], axisZ, 0.15);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        m.slab(brushed, [0.39, 0.17, 0.05], [-0.23 + Math.cos(angle) * 0.33, Math.sin(angle) * 0.33, 0.296],
          0.013, [0, 0, angle + 0.34], 0.06);
      }
      for (const y of [-0.34, 0, 0.34]) m.slab(brushed, [y ? 0.99 : 1.14, 0.045, 0.047], [-0.23, y, 0.391], 0.011);
      m.duct(frame, 0.127, [[0.47, 0.09, 0.14], [0.83, 0.09, 0.19], [1.05, 0.23, 0.19], [1.23, 0.41, 0.11]]);
      m.cylinder(brushed, 0.16, 0.085, [0.84, 0.1, 0.19], axisX);
      break;
    case 'utility-conduits':
      m.duct(brushed, 0.102, [[-4, 0.22, 0.12], [-3.45, 0.22, 0.2], [-2.7, 0, 0.21], [2.95, 0, 0.21], [3.55, 0.35, 0.18], [4, 0.36, 0.12]]);
      m.duct(brushed, 0.064, [[-3.65, -0.29, 0.15], [0.2, -0.29, 0.17], [0.64, -0.2, 0.17], [1.03, -0.045, 0.20]]);
      m.slab(frame, [6.1, 0.19, 0.095], [-0.1, -0.58, 0.064], 0.022);
      for (const x of [-2.4, 0.4, 2.4]) {
        m.slab(frame, [0.14, 0.77, 0.13], [x, -0.23, 0.09], 0.019);
        m.cylinder(brushed, 0.127, 0.075, [x, 0, 0.21], axisX);
      }
      break;
    case 'service-bay':
      m.slab(panel, [2.43, 1.64, 0.085], [0, 0, 0.048], 0.02, undefined, 0.12);
      for (const y of [-0.73, 0.73]) m.slab(frame, [2.52, 0.21, 0.29], [0, y, 0.144], 0.035, undefined, 0.06);
      for (const x of [-1.14, 1.14]) m.slab(frame, [0.24, 1.3, 0.28], [x, 0, 0.145], 0.037, undefined, 0.08);
      m.slab(panel, [1.35, 1.04, 0.115], [-0.30, 0, 0.119], 0.035, undefined, 0.10);
      m.slab(brushed, [0.10, 0.43, 0.073], [0.18, 0.04, 0.214], 0.015);
      for (const y of [-0.29, -0.02, 0.25]) m.slab(brushed, [0.41, 0.12, 0.078], [0.69, y, 0.12], 0.016);
      break;
    case 'holographic-service-door':
      // Dark inactive access face. The M0 hologram stays available in the material library.
      m.slab(panel, [1.69, 2.36, 0.12], [0, -0.10, 0.070], 0.027, undefined, 0.18);
      for (const x of [-0.81, 0.81]) m.slab(frame, [0.27, 2.35, 0.31], [x, -0.10, 0.17], 0.044, undefined, 0.11);
      for (const y of [-1.21, 1.01]) m.slab(frame, [1.72, 0.26, 0.33], [0, y, 0.173], 0.043, undefined, 0.095);
      m.slab(frame, [0.99, 0.13, 0.074], [0, -0.84, 0.16], 0.019);
      m.slab(rubber, [1.30, 1.42, .028], [0, .10, .155], .007);
      m.slab(brushed, [.29, .038, .019], [-.36, -.839, .210], .006);
      break;
  }
  if (kind !== 'overhead-assembly') {
    // Contact face seats against the recess backing, behind the modeled equipment.
    const width = kind === 'utility-conduits' ? 8.55 : kind === 'service-bay' ? 2.60 : 2.22;
    m.slab(panel, [width, 2.74, .092], [0, 0, -.047], .019);
  }
  return m.finish(library, kind !== 'overhead-assembly');
}

export type DressingModel = ReturnType<typeof buildDressingModel>;
