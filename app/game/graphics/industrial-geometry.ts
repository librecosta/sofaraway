import * as THREE from 'three';

/** Static vertex-colored construction geometry, batched by material. */
export class IndustrialGeometry {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly normal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly normalValues: number[] = [];

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color) {
    const index = this.positions.length / 3;
    this.normal.subVectors(b, a).cross(this.tangent.subVectors(c, a)).normalize();
    for (const point of [a, b, c, d]) {
      this.positions.push(point.x, point.y, point.z);
      this.normalValues.push(this.normal.x, this.normal.y, this.normal.z);
      this.colors.push(color.r, color.g, color.b);
    }
    this.indices.push(index, index + 1, index + 2, index, index + 2, index + 3);
  }

  beam(a: THREE.Vector3, b: THREE.Vector3, forward: THREE.Vector3, halfWidth: number, halfDepth: number, color: THREE.Color) {
    const side = new THREE.Vector3().subVectors(b, a).cross(forward).normalize().multiplyScalar(halfWidth);
    const depth = forward.clone().multiplyScalar(halfDepth);
    const corners = [a, b].map(point => [
      point.clone().add(side).add(depth), point.clone().sub(side).add(depth),
      point.clone().sub(side).sub(depth), point.clone().add(side).sub(depth),
    ]);
    const [first, last] = corners;
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      this.quad(first[i], last[i], last[next], first[next], color);
    }
    this.quad(first[0], first[1], first[2], first[3], color);
    this.quad(last[3], last[2], last[1], last[0], color);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normalValues, 3));
    geometry.setIndex(this.indices);
    return geometry;
  }
}
