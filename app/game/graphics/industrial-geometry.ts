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
    for (const point of [a, b, c, d]) {
      this.positions.push(point.x, point.y, point.z);
      this.normalValues.push(this.normal.x, this.normal.y, this.normal.z);
      this.colors.push(color.r, color.g, color.b);
    }
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
    const side = new THREE.Vector3().subVectors(b, a).cross(forward).normalize().multiplyScalar(halfWidth);
    const depth = forward.clone().multiplyScalar(halfDepth);
    const corners = [a, b].map(point => [
      point.clone().add(side).add(depth), point.clone().sub(side).add(depth),
      point.clone().sub(side).sub(depth), point.clone().add(side).sub(depth),
    ]);
    const [first, last] = corners;
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      this.quad(first[i], last[i], last[next], first[next], color, surface);
    }
    this.quad(first[0], first[1], first[2], first[3], color, surface);
    this.quad(last[3], last[2], last[1], last[0], color, surface);
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
