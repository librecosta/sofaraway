import * as THREE from 'three';
import { ControlLamp } from '../core/descent-lighting';

export const enum IndustrialSurface { Cast, Coated, Machined, Polymer }
export const enum IndustrialTrim { None = 0, PolishedLip = .25, SecurityRail = .50 }

const half = THREE.DataUtils.toHalfFloat;
export const industrialSurfacePeriod = 120;

/** Static vertex-colored construction geometry, batched by material. */
export class IndustrialGeometry {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly normal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly beamSide = new THREE.Vector3();
  private readonly beamDepth = new THREE.Vector3();
  private readonly beamCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
  private readonly normalValues: number[] = [];
  private readonly surfaceValues: number[] = [];
  private readonly lightValues: number[] = [];
  private readonly lensValues: number[] = [];
  private readonly spillGroups: number[] = [];
  private readonly spill = { group: ControlLamp.Route, station: 0 };
  private light = ControlLamp.Roof;
  private lightStart = 0;
  private lightEnd = 0;

  constructor(private readonly workSpill?: (point: THREE.Vector3, normal: THREE.Vector3,
    target: { group: ControlLamp; station: number }) => number,
    private readonly scoredLights = false) {}

  lightAt(light: ControlLamp, start: number, end = start) {
    this.light = light;
    this.lightStart = start;
    this.lightEnd = end;
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color,
    surface = IndustrialSurface.Cast, stations?: readonly [number, number], trim = IndustrialTrim.None) {
    const index = this.positions.length / 3;
    this.normal.subVectors(b, a).cross(this.tangent.subVectors(c, a)).normalize();
    const { x, y, z } = this.normal;
    const { r: red, g: green, b: blue } = color;
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    this.normalValues.push(x, y, z, x, y, z, x, y, z, x, y, z);
    this.colors.push(red, green, blue, red, green, blue, red, green, blue, red, green, blue);
    if (this.workSpill) {
      const start = stations ? stations[0] % industrialSurfacePeriod : 0;
      const end = start + (stations ? stations[1] - stations[0] : a.distanceTo(d));
      const u = half(a.distanceTo(b)), v0 = half(start), v1 = half(end);
      // Each face shares a finish and trim code in the same attribute.
      const finish = half(surface + trim);
      this.surfaceVertex(a, 0, v0, finish);
      this.surfaceVertex(b, u, v0, finish);
      this.surfaceVertex(c, u, v1, finish);
      this.surfaceVertex(d, 0, v1, finish);
    }
    if (this.scoredLights) {
      this.lightValues.push(this.lightStart, this.light, this.lightEnd, this.light, this.lightEnd, this.light, this.lightStart, this.light);
      this.lensValues.push(0, 0, 1, 0, 1, 1, 0, 1);
    }
    this.indices.push(index, index + 1, index + 2, index, index + 2, index + 3);
  }

  private surfaceVertex(p: THREE.Vector3, u: number, v: number, finish: number) {
    this.spill.group = ControlLamp.Route;
    const strength = this.workSpill!(p, this.normal, this.spill);
    this.surfaceValues.push(u, v, finish, half(strength));
    this.spillGroups.push(half(this.spill.group), half(this.spill.station % 128));
  }

  beam(a: THREE.Vector3, b: THREE.Vector3, forward: THREE.Vector3, halfWidth: number, halfDepth: number, color: THREE.Color,
    surface = IndustrialSurface.Cast) {
    const side = this.beamSide.subVectors(b, a).cross(forward).normalize().multiplyScalar(halfWidth);
    const depth = this.beamDepth.copy(forward).multiplyScalar(halfDepth);
    const corners = this.beamCorners;
    corners[0].copy(a).add(side).add(depth);
    corners[1].copy(a).sub(side).add(depth);
    corners[2].copy(a).sub(side).sub(depth);
    corners[3].copy(a).add(side).sub(depth);
    corners[4].copy(b).add(side).add(depth);
    corners[5].copy(b).sub(side).add(depth);
    corners[6].copy(b).sub(side).sub(depth);
    corners[7].copy(b).add(side).sub(depth);
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      this.quad(corners[i], corners[i + 4], corners[next + 4], corners[next], color, surface);
    }
    this.quad(corners[0], corners[1], corners[2], corners[3], color, surface);
    this.quad(corners[7], corners[6], corners[5], corners[4], color, surface);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normalValues, 3));
    if (this.workSpill) {
      geometry.setAttribute('industrialSurface', new THREE.Float16BufferAttribute(this.surfaceValues, 4));
      geometry.setAttribute('industrialSpill', new THREE.Float16BufferAttribute(this.spillGroups, 2));
    }
    if (this.scoredLights) {
      geometry.setAttribute('industrialLight', new THREE.Float32BufferAttribute(this.lightValues, 2));
      geometry.setAttribute('uv', new THREE.Float16BufferAttribute(this.lensValues.map(half), 2));
    }
    geometry.setIndex(this.indices);
    return geometry;
  }
}
