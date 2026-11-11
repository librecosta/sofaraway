import * as THREE from 'three';
import type { PickupKind } from '../core/pickups';

export const PICKUP_PREVIEW_BEATS = 8;
const colors = { shield: '#64d8ff', resonance: '#ff84e1', lumen: '#ffe680' } as const;

export class PickupVisual {
  readonly group = new THREE.Group();
  private readonly material: THREE.MeshBasicMaterial;
  private readonly meshes: THREE.Mesh[] = [];

  constructor(readonly kind: PickupKind) {
    this.group.name = `pickup:${kind}`;
    this.material = new THREE.MeshBasicMaterial({
      color: colors[kind], transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    });
    if (kind === 'shield') {
      this.add(new THREE.IcosahedronGeometry(0.35));
      const guard = this.add(new THREE.TorusGeometry(0.53, 0.045, 6, 28));
      guard.rotation.set(0.42, 0.42, 0);
    } else if (kind === 'resonance') {
      this.add(new THREE.TorusGeometry(0.55, 0.045, 6, 28));
      this.add(new THREE.TorusGeometry(0.33, 0.045, 6, 22));
      this.add(new THREE.SphereGeometry(0.13, 10, 8));
    } else {
      this.add(new THREE.OctahedronGeometry(0.43)).scale.set(0.84, 1.48, 0.84);
    }
  }

  private add(geometry: THREE.BufferGeometry) {
    const mesh = new THREE.Mesh(geometry, this.material);
    this.meshes.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  update(beat: number, beatsAway: number) {
    this.material.opacity = 0.88 * (1 - THREE.MathUtils.smoothstep(beatsAway, 6, PICKUP_PREVIEW_BEATS));
    this.group.rotateZ(beat * 0.45);
    this.group.rotateY(Math.sin(beat * 0.5) * 0.35);
  }

  dispose() {
    this.group.removeFromParent();
    for (const mesh of this.meshes) mesh.geometry.dispose();
    this.material.dispose();
  }
}
